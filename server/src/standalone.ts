import express from "express";
import dotenv from "dotenv";
import { createPromptPadRouter } from "./createRouter.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/promptpad";

console.log(`[PromptPad Standalone] MongoDB URI: ${MONGODB_URI}`);

// Mount PromptPad router at /api
const promptPadRouter = createPromptPadRouter({
  basePath: "/api",
  database: {
    type: "mongodb",
    uri: MONGODB_URI,
  },
  auth: {
    enabled: false,
  },
  cors: true,
});

app.use("/api", promptPadRouter);

// Root info endpoint
app.get("/", (_req, res) => {
  res.json({
    name: "PromptPad API Server (Standalone)",
    endpoints: {
      health: "/api/health",
    },
  });
});

app.listen(PORT, () => {
  console.log(`🚀 PromptPad Server running at http://localhost:${PORT}`);
  console.log(`👉 Health: http://localhost:${PORT}/api/health`);
});
