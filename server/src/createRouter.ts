import { Router, json } from "express";
import cors from "cors";
import { PromptPadConfig } from "promptpad-note-shared";
import { MongoAdapter } from "./adapters/mongodb.adapter.js";
import { GeminiService } from "./services/gemini.service.js";
import { createNotesRouter } from "./routes/notes.router.js";

export function createPromptPadRouter(config: PromptPadConfig): Router {
  const router = Router();

  // Middleware: JSON parser
  router.use(json());

  // Middleware: CORS
  if (config.cors !== false) {
    if (typeof config.cors === "object") {
      router.use(cors(config.cors));
    } else {
      router.use(cors());
    }
  }

  // Database Adapter Initialization
  let db: MongoAdapter;
  if (config.database.type === "mongodb") {
    db = new MongoAdapter({
      uri: config.database.uri,
      mongooseInstance: config.database.mongooseInstance,
    });
  } else {
    throw new Error(
      `Unsupported database type: '${config.database.type}'. Please use 'mongodb'.`
    );
  }

  // Ensure DB connection is initialized
  db.connect().catch((err) => {
    console.error("[PromptPad] Database connection error:", err.message);
  });

  const geminiApiKey = config.ai?.apiKey || process.env.GEMINI_API_KEY;
  let geminiService: GeminiService | undefined;

  if (geminiApiKey) {
    geminiService = new GeminiService(
      geminiApiKey,
      config.ai?.model || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"
    );
    console.log("🤖 [PromptPad] Gemini AI service activated.");
  } else {
    console.warn("⚠️ [PromptPad] GEMINI_API_KEY not found. AI features are disabled.");
  }

  // Health check endpoint
  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      message: "PromptPad API is running",
      database: config.database.type,
      aiActive: !!geminiService,
      timestamp: new Date().toISOString(),
    });
  });

  router.use(
    "/notes",
    createNotesRouter({
      db,
      geminiService,
    })
  );

  return router;
}
