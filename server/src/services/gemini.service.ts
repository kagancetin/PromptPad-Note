import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import type { ExtractedNoteData, UserIntentType } from "promptpad-note-shared";

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private modelName: string;

  constructor(apiKey: string, modelName: string = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite") {
    if (!apiKey) {
      throw new Error("GeminiService: A valid API key is required.");
    }
    this.modelName = modelName;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: this.modelName });
  }

  /**
   * Helper: Injects temporal reference, target language, and user rules into system instructions.
   */
  private formatSystemInstruction(
    prompt: string,
    outputLanguage?: string,
    userRules?: string[],
    referenceTimestamp?: string
  ): string {
    let instruction = prompt;

    // Temporal Grounding ({CURRENT_DATE_AND_DAY})
    const timestamp =
      referenceTimestamp ||
      new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    instruction = instruction.replace(/{CURRENT_DATE_AND_DAY}/g, timestamp);

    // Output Language ({OUTPUT_LANGUAGE})
    const lang = outputLanguage || "English";
    instruction = instruction.replace(/{OUTPUT_LANGUAGE}/g, lang);
    instruction += `\n\nCRITICAL LANGUAGE INSTRUCTION: You must produce all user-facing text, titles, notes, and replies strictly in ${lang}.`;

    // Learned User Rules
    if (userRules && userRules.length > 0) {
      instruction += `\n\nUSER RULES TO RESPECT:\n${userRules.map((r) => "- " + r).join("\n")}`;
    }
    return instruction;
  }

  /**
   * Critic / Reflection Pattern:
   * Semantically verifies whether the new input naturally consolidates with or updates an existing note.
   */
  async verifyMergeCandidate(
    existingNote: { title: string; content: string; category: string },
    newInput: string
  ): Promise<boolean> {
    try {
      const prompt = `Task: Semantic Merging Validation.
Determine if the NEW INPUT naturally extends, updates, or belongs to the same collection/topic as the EXISTING NOTE.

EXISTING NOTE:
Title: ${existingNote.title}
Category: ${existingNote.category}
Content: "${existingNote.content}"

NEW INPUT:
"${newInput}"

Question: Does the NEW INPUT belong to the same topic/list and should it be consolidated with the EXISTING NOTE?
Answer strictly with YES or NO.`;

      const result = await this.model.generateContent(prompt);
      const text = result.response.text().trim().toUpperCase();
      return text.includes("YES");
    } catch {
      return true;
    }
  }

  /**
   * Universal Structural Heuristics:
   * Language-agnostic syntactic checks (e.g., single isolated keyword without operational context).
   */
  detectPreRuleIntent(rawText: string): { intent: UserIntentType; explanation: string; cleanText?: string } | null {
    const trimmed = rawText.trim();

    // Isolated single keyword without operational context or punctuation (e.g. "React", "Dentist", "1994")
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length === 1 && !trimmed.endsWith("?") && trimmed.length <= 20) {
      return {
        intent: "clarify",
        explanation: "Structural heuristic: Single isolated word without operational context; requested clarification.",
      };
    }

    return null;
  }

  /**
   * Intent Classification with Explanation:
   * Evaluates language-agnostic structural heuristics first, then invokes Gemini LLM with strict few-shot boundaries.
   */
  async classifyIntentWithExplanation(
    rawText: string,
    customSystemPrompt?: string,
    outputLanguage?: string
  ): Promise<{ intent: UserIntentType; explanation: string; cleanText?: string }> {
    // 1. Check Universal Pre-Rules
    const preRule = this.detectPreRuleIntent(rawText);
    if (preRule) {
      return preRule;
    }

    try {
      const defaultPrompt =
        "You are an ultra-precise, rigorous Semantic Intent Classifier for a dedicated Personal Knowledge and Note Management system.\n" +
        "Your sole duty is to categorize the user's input into exactly ONE of the following primary intents: 'note', 'question', 'note_update', or 'clarify'.\n" +
        "Chatting, casual banter, answering general world-trivia, or hallucinating information is strictly disabled. The system exclusively manages and retrieves the user's personal notes.\n\n" +
        "INTENT DEFINITIONS AND BOUNDARIES (APPLIES UNIVERSALLY ACROSS ALL LANGUAGES):\n\n" +
        "1. 'note' (Intent to record, store, or remember durable personal information):\n" +
        "- Triggered when the user shares personal facts, observations, diary entries, ideas, meeting notes, todo items, links, recipes, appointments, completed tasks, quotes, or instructions to save.\n" +
        "- Any factual assertion or personal update must be classified as 'note', even if brief.\n" +
        "- Universal semantic concept: The user conveys storing, recording, remembering, or adding information to their personal repository in any language.\n" +
        "- Negative constraint: If the input asks to recall, check, verify, or retrieve previously stored information, it is NEVER a 'note'.\n\n" +
        "2. 'question' (Intent to search, query, inspect, or recall information from stored personal notes):\n" +
        "- Triggered when the user asks whether an item exists, requests a summary of past notes, searches for past facts, or queries recorded schedules, expenses, meetings, or lists.\n" +
        "- Universal semantic concept: Questions directed at searching, inspecting, verifying, or recalling from their personal data repository in any language.\n" +
        "- Negative constraint: If the user asks a broad encyclopedic or world-knowledge question unrelated to personal notes (e.g., 'What is the capital of France?', 'Write me a poem'), do NOT answer as general AI. Classify ambiguous or external queries as 'clarify'.\n\n" +
        "3. 'note_update' (Intent to edit, update, modify, or remove/delete specific items from an existing note):\n" +
        "- Triggered when the user asks to modify an existing note, remove/delete an item from a list or saved credentials, or update attributes/dates of existing records in any language.\n" +
        "- Universal semantic concept: Requests to alter, remove from, delete from, or update previously stored notes.\n\n" +
        "4. 'clarify' (Ambiguous, incomplete, or indecisive input):\n" +
        "- Triggered whenever the user's input lacks sufficient context to reliably determine whether they want to create a new note, update one, or query an existing one.\n" +
        "- Examples: isolated fragments or single keywords, vague statements, or confusing inputs.\n" +
        "- Rule of safety: NEVER GUESS OR HALLUCINATE. If in doubt, output 'clarify'.\n\n" +
        "FEW-SHOT EXAMPLES:\n" +
        "- User: 'Completed the quarterly design review with team leads today.' -> {\"intent\": \"note\", \"explanation\": \"Asserts a completed factual activity to be stored.\"}\n" +
        "- User: 'Save this to my notes: staging database port is 5432.' -> {\"intent\": \"note\", \"explanation\": \"Explicit storage directive with technical fact.\"}\n" +
        "- User: 'What were the action items from last week\\'s planning meeting?' -> {\"intent\": \"question\", \"explanation\": \"Queries previously saved note records.\"}\n" +
        "- User: 'Do I have any records regarding dental appointments?' -> {\"intent\": \"question\", \"explanation\": \"Checks for existence of information in personal notes.\"}\n" +
        "- User: 'Please remove the obsolete API key from my credentials note.' -> {\"intent\": \"note_update\", \"explanation\": \"Requests deletion of a specific item from an existing note.\"}\n" +
        "- User: 'Update the project deadline to Friday in the roadmap note.' -> {\"intent\": \"note_update\", \"explanation\": \"Requests modifying an attribute of an existing note.\"}\n" +
        "- User: 'Docker architecture' -> {\"intent\": \"clarify\", \"explanation\": \"Isolated concept fragment lacking clear operational context; clarification needed.\"}\n" +
        "- User: 'Tell me a funny story about astronauts.' -> {\"intent\": \"clarify\", \"explanation\": \"General entertainment query unrelated to personal note management.\"}\n\n" +
        "Return strictly JSON:\n" +
        '{"intent": "note" | "question" | "note_update" | "clarify", "explanation": "concise rationale"}';

      const systemInstruction = this.formatSystemInstruction(
        customSystemPrompt || defaultPrompt,
        outputLanguage
      );

      const jsonModel = this.genAI.getGenerativeModel({
        model: this.modelName,
        systemInstruction,
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const result = await jsonModel.generateContent(`Input: """${rawText}"""`);
      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);

      const validIntents: UserIntentType[] = ["note", "question", "note_update", "clarify", "prompt_enhance"];
      if (parsed && validIntents.includes(parsed.intent)) {
        return {
          intent: parsed.intent,
          explanation: parsed.explanation || "Classified by Gemini LLM.",
        };
      }
      return {
        intent: "clarify",
        explanation: "Uncertain or invalid intent output; defaulting to clarification.",
      };
    } catch (error: any) {
      console.error("[GeminiService] classifyIntent error:", error);
      // If it's a fatal API / authentication / quota error, don't mask it as a clarification
      if (
        error.status === 400 ||
        error.status === 401 ||
        error.status === 403 ||
        error.message?.includes("API key") ||
        error.message?.includes("API_KEY_INVALID")
      ) {
        throw error;
      }
      if (rawText.includes("?")) {
        return {
          intent: "question",
          explanation: "Fallback heuristic: Question mark detected.",
        };
      }
      return {
        intent: "clarify",
        explanation: "Fallback heuristic: Unable to resolve intent with certainty; prompting user.",
      };
    }
  }

  /**
   * Structured Note Extraction from Raw Input
   */
  async generateStructuredNote(
    rawText: string,
    customSystemPrompt?: string,
    outputLanguage?: string
  ): Promise<ExtractedNoteData> {
    try {
      const defaultPrompt =
        "Analyze the raw user input and extract a structured JSON object representing a note.\n\n" +
        "Rules:\n" +
        "1. 'title': A concise, descriptive title.\n" +
        "2. 'content': The cleaned, well-structured full content.\n" +
        "3. 'category': Choose the most fitting 1-2 word category freely based on context (e.g. Software, Personal, Work, Finance, Ideas, Travel, etc.). Do not restrict to a fixed list.\n" +
        "4. 'tags': 2-5 relevant lowercase tags (array of strings).\n" +
        "5. 'extractedDate': Specific date or time mentioned in input, or null if none.\n" +
        "6. 'summary': A single sentence summary of the note.";

      const systemInstruction = this.formatSystemInstruction(
        customSystemPrompt || defaultPrompt,
        outputLanguage
      );

      const jsonModel = this.genAI.getGenerativeModel({
        model: this.modelName,
        systemInstruction,
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const prompt = `User Input:\n"""${rawText}"""`;
      const result = await jsonModel.generateContent(prompt);
      const text = result.response.text();
      return JSON.parse(text) as ExtractedNoteData;
    } catch (error: any) {
      console.error("[GeminiService] generateStructuredNote error:", error);
      throw new Error(`Failed to generate structured note: ${error.message}`);
    }
  }

  /**
   * Note Consolidation & Smart Merging
   */
  async mergeNotes(
    existingNote: { title: string; content: string; category: string; tags: string[]; summary?: string },
    newNote: ExtractedNoteData,
    customSystemPrompt?: string,
    outputLanguage?: string
  ): Promise<ExtractedNoteData> {
    try {
      const defaultPrompt =
        "You are an intelligent note consolidation assistant.\n" +
        "You are provided with an 'EXISTING NOTE' and a 'NEW NOTE' on the same topic.\n" +
        "Your task is to merge them into a single, comprehensive, updated note.\n\n" +
        "Rules:\n" +
        "1. Combine the contents seamlessly without duplicating items or information.\n" +
        "2. Keep the title relevant and representative of the merged content.\n" +
        "3. Merge and deduplicate tags.\n" +
        "4. Choose or retain the most accurate category.\n" +
        "5. Update the summary to reflect the combined content.\n" +
        "6. Return strictly a JSON object with: { title, content, category, tags, extractedDate, summary }.";

      const systemInstruction = this.formatSystemInstruction(
        customSystemPrompt || defaultPrompt,
        outputLanguage
      );

      const jsonModel = this.genAI.getGenerativeModel({
        model: this.modelName,
        systemInstruction,
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const prompt = `
EXISTING NOTE:
Title: ${existingNote.title}
Category: ${existingNote.category}
Tags: ${existingNote.tags?.join(", ")}
Content:
"""${existingNote.content}"""

NEW NOTE TO MERGE:
Title: ${newNote.title}
Category: ${newNote.category}
Tags: ${newNote.tags?.join(", ")}
Content:
"""${newNote.content}"""

Merge these two notes into a single updated note JSON.`;

      const result = await jsonModel.generateContent(prompt);
      const text = result.response.text();
      return JSON.parse(text) as ExtractedNoteData;
    } catch (error: any) {
      console.error("[GeminiService] mergeNotes error:", error);
      throw new Error(`Failed to merge notes: ${error.message}`);
    }
  }

  /**
   * Edit Existing Note based on User Mutation Instruction
   */
  async editExistingNote(
    existingNote: { title: string; content: string; category: string; tags: string[]; summary?: string; extractedDate?: string | null },
    userInstruction: string,
    customSystemPrompt?: string,
    outputLanguage?: string
  ): Promise<ExtractedNoteData> {
    try {
      const defaultPrompt =
        "You are an expert Note Editor and Mutation Assistant.\n" +
        "You are provided with an 'EXISTING NOTE' and a 'USER EDIT/REMOVAL INSTRUCTION'.\n" +
        "Your duty is to apply the exact modification, removal, or update requested by the user to the note.\n\n" +
        "Principles:\n" +
        "1. PRECISE EDITING: If the user asks to remove, delete, or update an item (e.g. 'remove Netgsm password'), remove or modify strictly that item from the content while keeping all other items, facts, and structure intact.\n" +
        "2. UPDATED SUMMARY: Update the summary to faithfully describe the remaining or updated contents.\n" +
        "3. OUTPUT FORMAT: Return strictly a valid JSON object matching: { title, content, category, tags, extractedDate, summary }.\n" +
        "4. OUTPUT LANGUAGE: Produce all fields strictly in {OUTPUT_LANGUAGE}.";

      const systemInstruction = this.formatSystemInstruction(
        customSystemPrompt || defaultPrompt,
        outputLanguage
      );

      const jsonModel = this.genAI.getGenerativeModel({
        model: this.modelName,
        systemInstruction,
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const prompt = `
EXISTING NOTE:
Title: ${existingNote.title}
Category: ${existingNote.category}
Tags: ${existingNote.tags?.join(", ")}
Extracted Date: ${existingNote.extractedDate || "None"}
Content:
"""${existingNote.content}"""

USER EDIT/REMOVAL INSTRUCTION:
"""${userInstruction}"""

Apply the requested edit, removal, or deletion accurately and output the updated note JSON:`;

      const result = await jsonModel.generateContent(prompt);
      const text = result.response.text();
      return JSON.parse(text) as ExtractedNoteData;
    } catch (error: any) {
      console.error("[GeminiService] editExistingNote error:", error);
      throw new Error(`Failed to edit note: ${error.message}`);
    }
  }

  /**
   * Prompt Enhancement & Engineering
   */
  async enhancePrompt(
    rawPrompt: string,
    customSystemPrompt?: string,
    userRules?: string[],
    outputLanguage?: string
  ): Promise<string> {
    try {
      const defaultPrompt =
        "You are an expert Prompt Engineer. Review the user's draft prompt and transform it into a high-quality, professional system prompt or detailed instruction.\n" +
        "Enrich it with role definition, clear task steps, constraints, and expected output format.";

      const systemInstruction = this.formatSystemInstruction(
        customSystemPrompt || defaultPrompt,
        outputLanguage,
        userRules
      );

      const targetModel = this.genAI.getGenerativeModel({
        model: this.modelName,
        systemInstruction,
      });

      const prompt = `Draft Prompt To Enhance:\n"""${rawPrompt}"""\n\nPlease output ONLY the enhanced, production-ready prompt without meta-commentary.`;
      const result = await targetModel.generateContent(prompt);
      return result.response.text().trim();
    } catch (error: any) {
      console.error("[GeminiService] enhancePrompt error:", error);
      throw new Error(`Failed to enhance prompt: ${error.message}`);
    }
  }

  /**
   * Text Vector (Embedding) Generation for Semantic RAG
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const embeddingModel = this.genAI.getGenerativeModel({
        model: "gemini-embedding-001",
      });

      const result = await embeddingModel.embedContent(text);
      return result.embedding.values;
    } catch (error: any) {
      console.error("[GeminiService] generateEmbedding error:", error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Question & Answering (RAG with Context Notes)
   */
  async answerWithContext(
    question: string,
    contextNotes: string[],
    customSystemPrompt?: string,
    userRules?: string[],
    outputLanguage?: string
  ): Promise<string> {
    try {
      const defaultPrompt =
        "You are the user's dedicated, highly attentive personal knowledge companion.\n" +
        "REFERENCE DATE: {CURRENT_DATE_AND_DAY}\n\n" +
        "Your Mission:\n" +
        "Answer the user's questions accurately and conversationally based strictly on their personal notes.\n\n" +
        "TEMPORAL REASONING & DATE COMPARISON:\n" +
        "- Always use the REFERENCE DATE to calculate whether an event or date is in the past, present, or future.\n" +
        "- If the user asks for 'past' plans, actions, or events, consider ONLY notes with dates occurring strictly BEFORE the REFERENCE DATE.\n" +
        "- If the user asks for 'upcoming' or 'future' plans, consider dates occurring AFTER the REFERENCE DATE.\n" +
        "- If a note has no date mentioned, do not assume it happened in the past or future unless context clearly states it.\n\n" +
        "CONVERSATIONAL PERSONA & NATURAL TONE:\n" +
        "- Speak directly, warmly, and naturally to the user using the second-person tense (e.g. 'You scheduled an event with X on DATE, and also had a meeting on DATE.').\n" +
        "- Do NOT produce cold, robotic bullet lists or raw database dumps unless the user specifically asks for a table or bulleted list.\n" +
        "- Completely IGNORE notes provided in the context that are irrelevant to the user's specific question (e.g., ignore passwords, movie lists, or unrelated notes if the user is asking about personal plans/meetings).\n" +
        "- If there are truly no relevant records matching their question and timeframe, politely inform them in a natural sentence without listing unrelated notes.";

      const systemInstruction = this.formatSystemInstruction(
        customSystemPrompt || defaultPrompt,
        outputLanguage,
        userRules
      );

      const prompt = `
Context Notes from User Database:
---
${contextNotes.map((note, i) => `[Note ${i + 1}]: ${note}`).join("\n\n")}
---

User Question: ${question}
`;

      const targetModel = this.genAI.getGenerativeModel({
        model: this.modelName,
        systemInstruction,
      });

      const result = await targetModel.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      console.error("[GeminiService] answerWithContext error:", error);
      throw new Error(`Failed to generate context answer: ${error.message}`);
    }
  }
}
