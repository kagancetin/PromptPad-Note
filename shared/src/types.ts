export interface PromptPadUser {
  id: string;
  name?: string;
  email?: string;
  [key: string]: any;
}

export interface PromptPadDatabaseConfig {
  type: 'mongodb' | 'custom';
  uri?: string;
  /** Existing mongoose instance if host provides one */
  mongooseInstance?: any;
  /** Custom adapter if host provides one */
  adapter?: any;
}

export interface PromptPadAuthConfig {
  enabled: boolean;
  /** Middleware to authenticate incoming requests */
  middleware?: (req: any, res: any, next: (err?: any) => void) => void;
  /** Extract authenticated user from request */
  getUser?: (req: any) => PromptPadUser | null;
}

export interface PromptPadAIConfig {
  apiKey?: string;
  /** LLM Model name. Default: 'gemini-3.5-flash-lite' */
  model?: string;
  rag?: {
    minSimilarity?: number; // Default: 0.58
    maxContextNotes?: number; // Default: 15
  };
}

// Dynamic Setting / System Prompt Item
export interface PromptPadSettingItem {
  key: string;
  value: any;
  description?: string;
}

export interface SystemPromptItem {
  key: string;
  content: string;
  description?: string;
}

// Learned User Rule Model
export interface UserRule {
  id: string;
  rule: string;
  category?: string;
  active: boolean;
  createdAt: string;
}

export interface PromptPadConfig {
  basePath?: string;
  database: PromptPadDatabaseConfig;
  auth?: PromptPadAuthConfig;
  ai?: PromptPadAIConfig;
  cors?: boolean | object;
}

export interface PromptPadClientConfig {
  apiBaseUrl?: string;
  theme?: 'light' | 'dark' | 'system';
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
}

export interface ExtractedNoteData {
  title: string;
  content: string;
  category: string;
  tags: string[];
  extractedDate?: string | null;
  summary: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  extractedDate?: string | null;
  summary: string;
  embedding?: number[]; // 768-dimensional vector
  createdAt: string;
  updatedAt: string;
}

// Semantic Intent Types (Note Creation, Note Search/QA, Note Update/Deletion, Clarification, Prompt Enhancement)
export type UserIntentType = "note" | "question" | "clarify" | "note_update" | "prompt_enhance" | "chat";

export interface CandidateNoteScore {
  id: string;
  title: string;
  similarity: number;
  passedThreshold: boolean;
  criticApproved?: boolean;
}

export interface OrchestrateDebugMeta {
  intent: UserIntentType;
  intentExplanation?: string;
  latencyMs: number;
  thresholds: {
    ragMinSimilarity: number;
    ragMergeSimilarity: number;
  };
  candidateScores: CandidateNoteScore[];
  timestamp: string;
}

export interface NoteMergeCandidate {
  existingNoteId: string;
  existingNoteTitle: string;
  similarity: number;
  mergedPreview: ExtractedNoteData;
}

export interface OrchestrateBase {
  debug?: OrchestrateDebugMeta;
}

// 1. Note Preview Response (Presented to user before persistence)
export interface OrchestrateNotePreview extends OrchestrateBase {
  type: "note_preview";
  preview: ExtractedNoteData;
  mergeCandidate?: NoteMergeCandidate;
  isUpdateOnly?: boolean;
}

// 2. Prompt Enhancement Preview Response
export interface OrchestratePromptPreview extends OrchestrateBase {
  type: "prompt_preview";
  preview: {
    original: string;
    enhanced: string;
  };
}

// 3. Question & Answering Response (RAG)
export interface OrchestrateQuestionAnswer extends OrchestrateBase {
  type: "question_answer";
  answer: string;
  relevantNotes: Array<{
    id: string;
    title: string;
    category: string;
    extractedDate?: string | null;
  }>;
}

// 4. Ambiguity Clarification Response (Clarify)
export interface OrchestrateClarify extends OrchestrateBase {
  type: "clarify";
  message: string;
  originalText: string;
}

// 5. General Chat Response (Legacy fallback)
export interface OrchestrateChat extends OrchestrateBase {
  type: "chat";
  reply: string;
}

// Consolidated Orchestrator Result
export type OrchestrateResult =
  | OrchestrateNotePreview
  | OrchestratePromptPreview
  | OrchestrateQuestionAnswer
  | OrchestrateClarify
  | OrchestrateChat;

// Conversation & Request History Entry
export interface ConversationHistoryItem {
  id: string;
  prompt: string;
  intent: UserIntentType;
  result: OrchestrateResult;
  debug?: OrchestrateDebugMeta;
  createdAt: string;
}
