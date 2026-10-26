import { Router, Request, Response } from "express";
import { MongoAdapter } from "../adapters/mongodb.adapter.js";
import { GeminiService } from "../services/gemini.service.js";
import type {
  OrchestrateResult,
  ExtractedNoteData,
  CandidateNoteScore,
  OrchestrateDebugMeta,
  UserIntentType,
} from "promptpad-note-shared";

export function createNotesRouter(options: {
  db: MongoAdapter;
  geminiService?: GeminiService;
}): Router {
  const router = Router();
  const { db, geminiService } = options;

  /**
   * 1. UNIFIED ORCHESTRATOR (POST /orchestrate)
   * Handles semantic intent detection, smart note merging (upsert), RAG question answering, and telemetry logging.
   */
  router.post("/orchestrate", async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const { text, forceIntent } = req.body;
      if (!text || typeof text !== "string" || !text.trim()) {
        res.status(400).json({ success: false, error: "Please provide a valid text input." });
        return;
      }

      if (!geminiService) {
        res.status(500).json({ success: false, error: "Gemini AI service is not initialized." });
        return;
      }

      // Fetch dynamic system prompts, language, and similarity threshold configurations from DB
      const outputLanguage = await db.getSetting<string>("output_language", "English");
      const classifierPrompt = await db.getSetting<string>("classifier_prompt", "");
      const notePrompt = await db.getSetting<string>("note_extractor_prompt", "");
      const noteMergerPrompt = await db.getSetting<string>("note_merger_prompt", "");
      const promptEnhancePrompt = await db.getSetting<string>("prompt_enhancer_prompt", "");
      const qaPrompt = await db.getSetting<string>("qa_assistant_prompt", "");
      const mergeSimilarityThreshold = await db.getSetting<number>("rag_merge_similarity", 0.60);
      const ragMinSimilarityThreshold = await db.getSetting<number>("rag_min_similarity", 0.58);
      const enableDebugLogging = await db.getSetting<boolean>("enable_debug_logging", true);
      const userRules = await db.getActiveUserRules();

      // 1. Intent Classification (Pre-Rules + LLM Classification + Force Intent Support)
      let intent: UserIntentType;
      let intentExplanation = "";
      let processText = text;

      if (forceIntent && ["note", "question", "note_update", "clarify", "prompt_enhance"].includes(forceIntent)) {
        intent = forceIntent as UserIntentType;
        intentExplanation = `User explicitly selected intent via UI: ${forceIntent}`;
      } else {
        const classified = await geminiService.classifyIntentWithExplanation(text, classifierPrompt, outputLanguage);
        intent = classified.intent;
        intentExplanation = classified.explanation;
        if (classified.cleanText) {
          processText = classified.cleanText;
        }
      }

      let result: OrchestrateResult;
      let candidateScores: CandidateNoteScore[] = [];

      switch (intent) {
        case "note": {
          // Extract structured note preview from raw text
          const preview = await geminiService.generateStructuredNote(processText, notePrompt, outputLanguage);

          // Smart Note Consolidation (Upsert candidate check)
          const previewEmbeddingText = `${preview.title} ${preview.content} ${preview.category} ${(preview.tags || []).join(" ")}`;
          const previewEmbedding = await geminiService.generateEmbedding(previewEmbeddingText);
          const { notes: similarNotes, scoredCandidates } = await db.scoreNotesWithDetails(
            previewEmbedding,
            mergeSimilarityThreshold,
            5
          );
          candidateScores = scoredCandidates;

          if (similarNotes.length > 0) {
            const existingNote = similarNotes[0];
            // Critic / Reflection: AI judge verifies semantic consolidation
            const shouldMerge = await geminiService.verifyMergeCandidate(existingNote, processText);

            const matchedCandidate = candidateScores.find((c) => c.id === existingNote.id);
            if (matchedCandidate) {
              matchedCandidate.criticApproved = shouldMerge;
            }

            if (shouldMerge) {
              const mergedPreview = await geminiService.mergeNotes(
                existingNote,
                preview,
                noteMergerPrompt,
                outputLanguage
              );

              result = {
                type: "note_preview",
                preview,
                mergeCandidate: {
                  existingNoteId: existingNote.id,
                  existingNoteTitle: existingNote.title,
                  similarity: matchedCandidate ? matchedCandidate.similarity : mergeSimilarityThreshold,
                  mergedPreview,
                },
              };
              intentExplanation = `Note intent. Candidate note "${existingNote.title}" exceeded threshold (${matchedCandidate?.similarity}) and was approved by Critic for merge.`;
            } else {
              result = {
                type: "note_preview",
                preview,
              };
              intentExplanation = `Note intent. Candidate note "${existingNote.title}" exceeded threshold (${matchedCandidate?.similarity}), but Critic determined it is a distinct note.`;
            }
          } else {
            result = {
              type: "note_preview",
              preview,
            };
            intentExplanation = "Note intent. No existing notes exceeded merge threshold. New structured note preview created.";
          }
          break;
        }

        case "note_update": {
          // Generate embedding to locate target note to update or remove from
          const queryEmbedding = await geminiService.generateEmbedding(processText);
          const { notes: matchedNotes, scoredCandidates } = await db.scoreNotesWithDetails(
            queryEmbedding,
            0.45,
            5
          );
          candidateScores = scoredCandidates;

          if (matchedNotes.length === 0) {
            result = {
              type: "question_answer",
              answer: "No existing notes found regarding the topic you want to update or remove from.",
              relevantNotes: [],
            };
            intentExplanation = "Note update intent. No relevant existing note found to update.";
          } else {
            const targetNote = matchedNotes[0];
            const updatedPreview = await geminiService.editExistingNote(
              targetNote,
              processText,
              undefined,
              outputLanguage
            );

            result = {
              type: "note_preview",
              preview: updatedPreview,
              isUpdateOnly: true,
              mergeCandidate: {
                existingNoteId: targetNote.id,
                existingNoteTitle: targetNote.title,
                similarity: scoredCandidates[0]?.similarity || 1,
                mergedPreview: updatedPreview,
              },
            };
            intentExplanation = `Note update intent. Successfully applied modifications to "${targetNote.title}".`;
          }
          break;
        }

        case "question": {
          // Generate query embedding
          const questionEmbedding = await geminiService.generateEmbedding(processText);
          // Query candidates with threshold and score details
          const { notes: relevantNotes, scoredCandidates } = await db.scoreNotesWithDetails(
            questionEmbedding,
            ragMinSimilarityThreshold,
            15
          );
          candidateScores = scoredCandidates;

          if (relevantNotes.length === 0) {
            result = {
              type: "question_answer",
              answer: "No relevant records were found in your notes regarding this topic.",
              relevantNotes: [],
            };
            intentExplanation = `Question intent. Scanned notes, but 0 notes reached min similarity threshold (${ragMinSimilarityThreshold}).`;
          } else {
            const contextTexts = relevantNotes.map(
              (n) =>
                `Title: ${n.title} | Content: ${n.content} | Category: ${n.category} | Date: ${
                  n.extractedDate || "Unspecified"
                }`
            );
            const answer = await geminiService.answerWithContext(
              processText,
              contextTexts,
              qaPrompt,
              userRules,
              outputLanguage
            );
            result = {
              type: "question_answer",
              answer,
              relevantNotes: relevantNotes.map((n) => ({
                id: n.id,
                title: n.title,
                category: n.category,
                extractedDate: n.extractedDate,
              })),
            };
            intentExplanation = `Question intent. Successfully answered using ${relevantNotes.length} retrieved context note(s).`;
          }
          break;
        }

        case "prompt_enhance": {
          const enhanced = await geminiService.enhancePrompt(
            processText,
            promptEnhancePrompt,
            userRules,
            outputLanguage
          );
          result = {
            type: "prompt_preview",
            preview: {
              original: processText,
              enhanced,
            },
          };
          intentExplanation = "Prompt enhance intent. Optimized prompt with instructions and rules.";
          break;
        }

        case "clarify":
        case "chat":
        default: {
          // General casual chat is disabled; prompt for clarification
          intent = "clarify";
          result = {
            type: "clarify",
            message: "I could not determine your exact intent. Would you like to record this as a new note, or search your existing notes?",
            originalText: text,
          };
          break;
        }
      }

      // Telemetry & Debug Logging
      const latencyMs = Date.now() - startTime;
      let debugMeta: OrchestrateDebugMeta | undefined;

      if (enableDebugLogging) {
        debugMeta = {
          intent,
          intentExplanation,
          latencyMs,
          thresholds: {
            ragMinSimilarity: ragMinSimilarityThreshold,
            ragMergeSimilarity: mergeSimilarityThreshold,
          },
          candidateScores,
          timestamp: new Date().toISOString(),
        };
        result.debug = debugMeta;
      }

      // Save conversation history
      const historyItem = await db.saveHistory({
        prompt: text,
        intent,
        result,
        debug: debugMeta,
      });

      res.json({
        success: true,
        intent,
        data: result,
        historyItem,
      });
    } catch (error: any) {
      console.error("[NotesRouter] orchestrate error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 2. CONFIRM & PERSIST NOTE (POST /confirm)
   * Updates existing note if targetNoteId is supplied, otherwise creates new note.
   */
  router.post("/confirm", async (req: Request, res: Response): Promise<void> => {
    try {
      const { preview, targetNoteId } = req.body as { preview: ExtractedNoteData; targetNoteId?: string };
      if (!preview || !preview.title || !preview.content) {
        res.status(400).json({ success: false, error: "A valid note preview object is required." });
        return;
      }

      if (!geminiService) {
        res.status(500).json({ success: false, error: "Gemini AI service is not initialized." });
        return;
      }

      // Generate persistent embedding
      const embeddingText = `${preview.title} ${preview.content} ${preview.category || ""} ${(
        preview.tags || []
      ).join(" ")}`;
      const embedding = await geminiService.generateEmbedding(embeddingText);

      // If merging into an existing note, update it
      if (targetNoteId) {
        const updatedNote = await db.updateNote(targetNoteId, {
          title: preview.title,
          content: preview.content,
          category: preview.category || "General",
          tags: preview.tags || [],
          extractedDate: preview.extractedDate || null,
          summary: preview.summary || "",
          embedding,
        });

        if (!updatedNote) {
          res.status(404).json({ success: false, error: "Existing note to update was not found." });
          return;
        }

        res.status(200).json({ success: true, data: updatedNote, isMerged: true });
        return;
      }

      // Otherwise create a new note
      const savedNote = await db.createNote({
        title: preview.title,
        content: preview.content,
        category: preview.category || "General",
        tags: preview.tags || [],
        extractedDate: preview.extractedDate || null,
        summary: preview.summary || "",
        embedding,
      });

      res.status(201).json({ success: true, data: savedNote, isMerged: false });
    } catch (error: any) {
      console.error("[NotesRouter] confirm error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 3. CATEGORIES LIST (GET /categories)
   */
  router.get("/categories", async (_req: Request, res: Response): Promise<void> => {
    try {
      const categories = await db.getDistinctCategories();
      res.json({ success: true, data: categories });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 4. SETTINGS & PROMPT CONFIGURATION (GET /settings/prompts, PUT /settings/prompts/:key)
   */
  router.get("/settings/prompts", async (_req: Request, res: Response): Promise<void> => {
    try {
      const settings = await db.getAllSettings();
      res.json({ success: true, data: settings });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.put("/settings/prompts/:key", async (req: Request, res: Response): Promise<void> => {
    try {
      const key = String(req.params.key);
      const { value } = req.body;
      const description = typeof req.body.description === "string" ? req.body.description : undefined;
      if (value === undefined) {
        res.status(400).json({ success: false, error: "Please provide a 'value' property." });
        return;
      }
      await db.setSetting(key, value, description);
      res.json({ success: true, message: `Setting '${key}' successfully updated.` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 5. LIST NOTES WITH FILTERING & PAGINATION (GET /)
  router.get("/", async (req: Request, res: Response): Promise<void> => {
    try {
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 6;

      const result = await db.getNotes({ category, tag, search, page, limit });
      res.json({
        success: true,
        count: result.notes.length,
        total: result.total,
        totalPages: result.totalPages,
        page: result.page,
        data: result.notes,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 6. GET SINGLE NOTE (GET /:id)
  router.get("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const note = await db.getNoteById(id);
      if (!note) {
        res.status(404).json({ success: false, error: "Note not found." });
        return;
      }
      res.json({ success: true, data: note });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 7. DELETE NOTE (DELETE /:id)
  router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const deleted = await db.deleteNote(id);
      if (!deleted) {
        res.status(404).json({ success: false, error: "Note to delete was not found." });
        return;
      }
      res.json({ success: true, message: "Note deleted successfully." });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 8. CONVERSATION & REQUEST HISTORY (GET /history)
   */
  router.get("/history", async (req: Request, res: Response): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 10);
      const historyData = await db.getHistory(page, limit);
      res.json({ success: true, data: historyData });
    } catch (error: any) {
      console.error("[NotesRouter] getHistory error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
