import mongoose, { Schema, Document, Model } from "mongoose";
import { DatabaseAdapter } from "promptpad-note-shared";
import type { Note, ConversationHistoryItem, CandidateNoteScore } from "promptpad-note-shared";

export interface NoteDocument extends Document {
  title: string;
  content: string;
  category: string;
  tags: string[];
  extractedDate?: string | null;
  summary: string;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

const NoteSchema = new Schema<NoteDocument>(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    category: { type: String, default: "General", index: true },
    tags: { type: [String], default: [], index: true },
    extractedDate: { type: String, default: null },
    summary: { type: String, default: "" },
    embedding: { type: [Number], default: [] }, // 768-dimensional vector
  },
  {
    timestamps: true,
  }
);

export interface SettingDocument extends Document {
  key: string;
  value: any;
  description?: string;
}

const SettingSchema = new Schema<SettingDocument>({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: Schema.Types.Mixed, required: true },
  description: { type: String, default: "" },
});

// --- User Rules Schema (Learned Preferences & Guidelines) ---
export interface UserRuleDocument extends Document {
  rule: string;
  category: string;
  active: boolean;
}
const UserRuleSchema = new Schema<UserRuleDocument>(
  {
    rule: { type: String, required: true },
    category: { type: String, default: "general" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// --- Telemetry & Interaction History Schema ---
export interface HistoryDocument extends Document {
  prompt: string;
  intent: string;
  result: any;
  debug?: any;
  createdAt: Date;
  updatedAt: Date;
}

const HistorySchema = new Schema<HistoryDocument>(
  {
    prompt: { type: String, required: true },
    intent: { type: String, required: true },
    result: { type: Schema.Types.Mixed, required: true },
    debug: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Helper function converting Mongoose document to clean Note model
function toNote(doc: NoteDocument, includeEmbedding: boolean = false): Note {
  return {
    id: (doc._id as mongoose.Types.ObjectId).toString(),
    title: doc.title,
    content: doc.content,
    category: doc.category,
    tags: doc.tags,
    extractedDate: doc.extractedDate,
    summary: doc.summary,
    embedding: includeEmbedding ? doc.embedding : undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

// Calculates Cosine Similarity between two numeric vectors (0.0 to 1.0)
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA.length || !vecB.length || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class MongoAdapter implements DatabaseAdapter {
  private uri?: string;
  private isConnected = false;
  public mongooseInstance: typeof mongoose;
  public noteModel: Model<NoteDocument>;
  public settingModel: Model<SettingDocument>;
  public ruleModel: Model<UserRuleDocument>;
  public historyModel: Model<HistoryDocument>;

  constructor(options: { uri?: string; mongooseInstance?: typeof mongoose }) {
    this.uri = options.uri;
    this.mongooseInstance = options.mongooseInstance || mongoose;
    // Note Model
    this.noteModel =
      (this.mongooseInstance.models.PromptPadNote as Model<NoteDocument>) ||
      this.mongooseInstance.model<NoteDocument>("PromptPadNote", NoteSchema);
    // Setting Model
    this.settingModel =
      (this.mongooseInstance.models.PromptPadSetting as Model<SettingDocument>) ||
      this.mongooseInstance.model<SettingDocument>("PromptPadSetting", SettingSchema);
    // UserRule Model
    this.ruleModel =
      (this.mongooseInstance.models.PromptPadRule as Model<UserRuleDocument>) ||
      this.mongooseInstance.model<UserRuleDocument>("PromptPadRule", UserRuleSchema);
    // History & Telemetry Model
    this.historyModel =
      (this.mongooseInstance.models.PromptPadHistory as Model<HistoryDocument>) ||
      this.mongooseInstance.model<HistoryDocument>("PromptPadHistory", HistorySchema);
  }

  // Automatically seeds default system prompts and operational configurations on connection
  async seedDefaults(): Promise<void> {
    const defaultSettings = [
      {
        key: "enable_debug_logging",
        value: true,
        description: "Enable telemetry, similarity scores, and candidate note logging for requests",
      },
      {
        key: "output_language",
        value: "English",
        description: "Language for AI responses and extracted notes (e.g. English, Turkish, German, etc.)",
      },
      {
        key: "rag_min_similarity",
        value: 0.58,
        description: "Minimum cosine similarity threshold for RAG question answering (0.0 - 1.0)",
      },
      {
        key: "rag_merge_similarity",
        value: 0.60,
        description: "Similarity threshold to trigger smart note consolidation / upsert suggestion (0.0 - 1.0)",
      },
      {
        key: "rag_max_notes",
        value: 15,
        description: "Maximum number of context notes passed to AI in a single question",
      },
      {
        key: "classifier_prompt",
        value:
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
          '{"intent": "note" | "question" | "note_update" | "clarify", "explanation": "concise rationale"}',
        description: "Strict intent classification prompt (note, question, note_update, clarify) without hallucinated chat",
      },
      {
        key: "note_extractor_prompt",
        value:
          "You are a lossless information extraction system. Convert the user's raw input into a structured note.\n\n" +
          "REFERENCE TIMESTAMP: {CURRENT_DATE_AND_DAY}\n\n" +
          "Principles:\n" +
          "1. LOSSLESS FIDELITY: Extract ONLY what is explicitly asserted. NEVER extrapolate, hypothesize, or invent unstated action items, suggestions, or advice.\n" +
          "2. TEMPORAL GROUNDING: Resolve all relative temporal expressions (e.g., 'tomorrow', 'next Monday', 'in 3 days') against the REFERENCE TIMESTAMP into an absolute calendar format (e.g., 'DD.MM.YYYY (Day)'). If no specific date is mentioned or implied, set 'extractedDate' to null.\n" +
          "3. ADAPTIVE TAXONOMY: Freely assign the most precise 1-2 word category and 2-5 lowercase tags based on the domain of the content.\n" +
          "4. OUTPUT LANGUAGE: Produce title, content, summary, and category strictly in {OUTPUT_LANGUAGE}.\n\n" +
          "Return strictly JSON:\n" +
          "{\n" +
          '  "title": "Concise representative title",\n' +
          '  "content": "Cleaned, faithful content representing strictly asserted facts",\n' +
          '  "category": "Domain category",\n' +
          '  "tags": ["tag1", "tag2"],\n' +
          '  "extractedDate": "DD.MM.YYYY (Day)" | null,\n' +
          '  "summary": "Single-sentence concise summary"\n' +
          "}",
        description: "Lossless note extraction system prompt with temporal grounding",
      },
      {
        key: "note_merger_prompt",
        value:
          "Consolidate an EXISTING NOTE and a NEW NOTE belonging to the same topic into a single unified record.\n\n" +
          "Principles:\n" +
          "1. NON-DESTRUCTIVE UNION: Preserve all distinct entities, list items, or facts from both notes. Eliminate exact duplicates.\n" +
          "2. ZERO INVENTION: Do NOT introduce items, names, or tasks absent from both sources.\n" +
          "3. CONSOLIDATED CONTEXT: Refine the title and summary to reflect the complete unified set.\n" +
          "4. OUTPUT LANGUAGE: Produce all fields strictly in {OUTPUT_LANGUAGE}.\n\n" +
          "Return strictly JSON:\n" +
          "{\n" +
          '  "title": "Unified title",\n' +
          '  "content": "Consolidated content without duplicates",\n' +
          '  "category": "Accurate category",\n' +
          '  "tags": ["deduplicated", "tags"],\n' +
          '  "extractedDate": "Most relevant date or null",\n' +
          '  "summary": "Summary of combined information"\n' +
          "}",
        description: "Conservative note consolidation and merging system prompt",
      },
      {
        key: "prompt_enhancer_prompt",
        value:
          "You are an expert Prompt Engineer. Review the user's draft prompt and transform it into a high-quality, professional system prompt or detailed instruction.\n" +
          "Enrich it with role definition, clear task steps, constraints, and expected output format.\n" +
          "Produce output in {OUTPUT_LANGUAGE} unless requested otherwise.",
        description: "Prompt enhancer and optimizer system prompt",
      },
      {
        key: "qa_assistant_prompt",
        value:
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
          "- If there are truly no relevant records matching their question and timeframe, politely inform them in a natural sentence without listing unrelated notes.\n\n" +
          "Respond strictly in {OUTPUT_LANGUAGE}.",
        description: "Natural conversational QA assistant prompt with temporal grounding and date reasoning",
      },
    ];

    const SEED_VERSION = 1;
    const currentVersion = await this.getSetting<number>("seed_version", 0);

    if (currentVersion < SEED_VERSION) {
      for (const item of defaultSettings) {
        await this.settingModel.findOneAndUpdate(
          { key: item.key },
          { $set: { value: item.value, description: item.description } },
          { upsert: true, returnDocument: 'after' }
        );
      }
      // Remove deprecated settings if present
      await this.settingModel.deleteOne({ key: "chat_assistant_prompt" });
      await this.setSetting("seed_version", SEED_VERSION, "System seed version");
    } else {
      for (const item of defaultSettings) {
        const exists = await this.settingModel.findOne({ key: item.key }).exec();
        if (!exists) {
          await this.settingModel.create(item);
        }
      }
    }
  }

  async connect(): Promise<void> {
    if (this.mongooseInstance.connection.readyState === 1) {
      this.isConnected = true;
      await this.seedDefaults();
      return;
    }
    if (!this.uri) {
      throw new Error(
        "MongoDB URI not provided. Please provide 'database.uri' in PromptPadConfig or define MONGODB_URI."
      );
    }
    await this.mongooseInstance.connect(this.uri);
    this.isConnected = true;
    await this.seedDefaults();
  }

  async disconnect(): Promise<void> {
    if (this.isConnected && this.mongooseInstance.connection.readyState !== 0) {
      await this.mongooseInstance.disconnect();
      this.isConnected = false;
    }
  }

  // Create new note
  async createNote(data: Partial<Note>): Promise<Note> {
    const doc = await this.noteModel.create(data);
    return toNote(doc);
  }

  // Update existing note
  async updateNote(id: string, data: Partial<Note>): Promise<Note | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await this.noteModel.findByIdAndUpdate(id, { $set: data }, { returnDocument: 'after' }).exec();
    return doc ? toNote(doc) : null;
  }

  // Retrieve all distinct categories
  async getDistinctCategories(): Promise<string[]> {
    const rawCategories = await this.noteModel.distinct("category").exec();
    return rawCategories.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
  }

  // List notes with optional filtering and pagination
  async getNotes(filter?: {
    category?: string;
    tag?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ notes: Note[]; total: number; totalPages: number; page: number }> {
    const query: Record<string, any> = {};
    if (filter?.category) query.category = filter.category;
    if (filter?.tag) query.tags = filter.tag;
    if (filter?.search) {
      const regex = new RegExp(filter.search, "i");
      query.$or = [{ title: regex }, { content: regex }, { summary: regex }];
    }

    const page = Math.max(1, Number(filter?.page) || 1);
    const limit = Math.max(1, Number(filter?.limit) || 6);
    const skip = (page - 1) * limit;

    const total = await this.noteModel.countDocuments(query).exec();
    const docs = await this.noteModel
      .find(query)
      .select("-embedding")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      notes: docs.map((doc) => toNote(doc, false)),
      total,
      totalPages,
      page,
    };
  }

  // Retrieve single note by ID
  async getNoteById(id: string): Promise<Note | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await this.noteModel.findById(id).exec();
    return doc ? toNote(doc) : null;
  }

  // Delete note by ID
  async deleteNote(id: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(id)) return false;
    const res = await this.noteModel.findByIdAndDelete(id).exec();
    return !!res;
  }

  // Retrieve all settings and system prompts
  async getAllSettings(): Promise<SettingDocument[]> {
    return await this.settingModel.find({}).exec();
  }

  // Read setting dynamically
  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const doc = await this.settingModel.findOne({ key }).exec();
    return doc ? (doc.value as T) : fallback;
  }

  // Update setting dynamically
  async setSetting(key: string, value: any, description?: string): Promise<void> {
    await this.settingModel.findOneAndUpdate(
      { key },
      { $set: { value, ...(description ? { description } : {}) } },
      { upsert: true, returnDocument: 'after' }
    );
  }

  // Retrieve active user rules
  async getActiveUserRules(): Promise<string[]> {
    const rules = await this.ruleModel.find({ active: true }).exec();
    return rules.map((r) => r.rule);
  }

  // Add new user rule
  async addUserRule(rule: string, category: string = "general"): Promise<void> {
    await this.ruleModel.create({ rule, category, active: true });
  }

  /**
   * Semantic Vector Scoring with Detailed Telemetry:
   * Compares query vector against all saved notes, calculating similarity score,
   * checking threshold compliance, and returning ranked candidates.
   */
  async scoreNotesWithDetails(
    queryEmbedding: number[],
    threshold: number,
    limit: number = 15
  ): Promise<{ notes: Note[]; scoredCandidates: CandidateNoteScore[] }> {
    const allNotes = await this.noteModel.find({ embedding: { $exists: true, $ne: [] } }).exec();
    const scored = allNotes.map((doc) => {
      const similarity =
        doc.embedding && doc.embedding.length > 0 ? cosineSimilarity(queryEmbedding, doc.embedding) : 0;
      return {
        id: (doc._id as mongoose.Types.ObjectId).toString(),
        title: doc.title,
        similarity: Number(similarity.toFixed(4)),
        passedThreshold: similarity >= threshold,
        doc,
      };
    });

    scored.sort((a, b) => b.similarity - a.similarity);

    const scoredCandidates: CandidateNoteScore[] = scored.slice(0, 10).map((s) => ({
      id: s.id,
      title: s.title,
      similarity: s.similarity,
      passedThreshold: s.passedThreshold,
    }));

    const passedNotes = scored
      .filter((s) => s.passedThreshold)
      .slice(0, limit)
      .map((s) => toNote(s.doc, false));

    return { notes: passedNotes, scoredCandidates };
  }

  // Persist conversation and request interaction history
  async saveHistory(data: {
    prompt: string;
    intent: string;
    result: any;
    debug?: any;
  }): Promise<ConversationHistoryItem> {
    const doc = await this.historyModel.create(data);
    return {
      id: (doc._id as mongoose.Types.ObjectId).toString(),
      prompt: doc.prompt,
      intent: doc.intent as any,
      result: doc.result,
      debug: doc.debug,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  // Paginated lazy retrieval of conversation history
  async getHistory(
    page = 1,
    limit = 10
  ): Promise<{ history: ConversationHistoryItem[]; total: number; totalPages: number; page: number }> {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 10);
    const skip = (safePage - 1) * safeLimit;

    const total = await this.historyModel.countDocuments().exec();
    const docs = await this.historyModel
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .exec();

    const totalPages = Math.ceil(total / safeLimit) || 1;

    return {
      history: docs.map((doc) => ({
        id: (doc._id as mongoose.Types.ObjectId).toString(),
        prompt: doc.prompt,
        intent: doc.intent as any,
        result: doc.result,
        debug: doc.debug,
        createdAt: doc.createdAt.toISOString(),
      })),
      total,
      totalPages,
      page: safePage,
    };
  }
}
