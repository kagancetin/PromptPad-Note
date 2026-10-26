# PromptPad-Note

**PromptPad-Note** is a pluggable, headless, and AI-native personal knowledge and prompt management workspace for Node.js (MongoDB) and React.

It features a unified conversational prompt pipeline that autonomously classifies intent, extracts structured notes, performs vector-based RAG search, executes smart note merging/upserts, edits existing records, and optimizes prompts—all accessible as a standalone application or embedded directly into any existing Express and React codebase.

---

## 🌟 Key Capabilities

- **Unified Single-Input Orchestration:**
  Users interact through a single, clean input box. The system automatically detects intent without manual mode switching:
  - 📝 **Note Capture:** Lossless extraction with temporal date grounding (`text-embedding-004` vector embedding).
  - 🔄 **Smart Note Merging (Upsert):** Detects existing notes with high semantic similarity and proposes an intelligent consolidated merge before saving.
  - ✏️ **Note Modification:** Intelligently updates existing records or removes specific items (e.g. credentials, checklist items, appointments).
  - ❓ **Grounded Q&A (RAG):** Context-aware question answering with strict temporal reasoning and source citations.
  - ⚡ **Prompt Enhancement:** Rewrites draft concepts into professional, production-ready system prompts.
  - 🤔 **Intent Clarification:** Safely prompts the user when inputs are ambiguous or single-word fragments, preventing hallucinations.

- **Deterministic Pre-Rules & Zero-Latency Routing:**
  Explicit directives (e.g., `save note:`, `search my notes:`, `update note:`) are resolved instantly via regex heuristics without incurring model latency.

- **Dual-Mode Deployment:**
  - **Standalone Dashboard:** Ready-to-run dashboard powered by Vite and Express.
  - **Pluggable & Embedded:** Importable subpath packages for existing host applications.

- **Headless or Pre-built UI:**
  - Use the pre-built, production-ready dark theme (`PromptPadDefaultTheme`).
  - Or build a 100% custom UI using the headless `usePromptPad()` React hook.

- **Live AI Settings & Telemetry Inspector:**
  - Tune similarity thresholds (`rag_min_similarity`, `rag_merge_similarity`, `rag_max_notes`), output language, and system prompts live via the in-app settings modal.
  - Built-in debug telemetry modal displaying model decisions, latency, and cosine similarity rankings for every candidate note.

---

## 📁 Repository Structure

```text
PromptPad-Note/
├── shared/                 # Shared TypeScript interfaces, types & DatabaseAdapter
│   ├── src/types.ts        # Note, Intent, Orchestration & Configuration contracts
│   └── src/database.interface.ts
├── server/                 # Backend package (Express Router Factory + Standalone server)
│   ├── src/adapters/       # MongoDB Mongoose adapter with vector cosine similarity
│   ├── src/routes/         # Unified orchestration & CRUD API routes (/orchestrate, /confirm, /notes)
│   ├── src/services/       # Gemini AI service (embeddings, extraction, Q&A, merging)
│   ├── src/createRouter.ts # Express router factory for host apps
│   └── src/standalone.ts   # Standalone Express bootstrap
├── client/                 # Frontend package (React component library + Standalone demo)
│   ├── src/core/           # Headless React context (PromptPadProvider & usePromptPad)
│   ├── src/themes/default/ # Pre-built default dark theme (PromptPadDefaultTheme)
│   └── src/App.tsx         # Standalone Vite dashboard
└── package.json            # Subpath exports & workspace scripts
```

---

## 🚀 Quickstart: Standalone Mode

### 1. Prerequisites
- **Node.js:** v18.0.0 or higher
- **MongoDB:** A running MongoDB instance (local or Atlas)
- **Google Gemini API Key:** Required for embeddings and LLM orchestration

### 2. Installation & Setup

```bash
# Clone the repository
git clone https://github.com/kagancetin/PromptPad-Note.git
cd PromptPad-Note

# Install dependencies across all packages
npm run install:all
```

### 3. Configure Environment Variables

Create a `.env` file in the `server/` directory:

```env
PORT=5001
MONGODB_URI=mongodb://localhost:27017/promptpad-note
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
OUTPUT_LANGUAGE=English
```

### 4. Run Development Servers

```bash
npm run dev
```

- **Frontend App:** [http://localhost:3001](http://localhost:3001)
- **Backend API:** [http://localhost:5001/api/notes](http://localhost:5001/api/notes)
- **Health Check:** [http://localhost:5001/api/health](http://localhost:5001/api/health)

---

## 🔌 Embedded Integration (Pluggable Usage)

### 1. Install Package in Your Host Project

```bash
npm install promptpad-note
```

---

### 2. Backend Integration (`promptpad-note/server`)

Mount the PromptPad router into your existing Express application:

```typescript
import express from "express";
import { createPromptPadRouter } from "promptpad-note/server";

const app = express();
app.use(express.json());

app.use(
  "/api/promptpad",
  createPromptPadRouter({
    database: {
      type: "mongodb",
      uri: process.env.MONGODB_URI,
    },
    ai: {
      apiKey: process.env.GEMINI_API_KEY,
      model: "gemini-3.5-flash-lite",
    },
    auth: {
      enabled: true,
      // Your host authentication middleware
      middleware: (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        next();
      },
      // Resolve user ID to isolate notes per user
      getUser: (req) => ({ id: req.user.id }),
    },
  })
);

app.listen(4000, () => console.log("Host server running on port 4000"));
```

---

### 3. Frontend Integration (`promptpad-note/react`)

#### Option A: Pre-built UI Component

```tsx
import React from "react";
import { PromptPadProvider, PromptPadDefaultTheme } from "promptpad-note/react";
import "promptpad-note/react/style.css";

export function KnowledgeBasePage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <PromptPadProvider config={{ apiBaseUrl: "/api/promptpad" }}>
        <PromptPadDefaultTheme />
      </PromptPadProvider>
    </div>
  );
}
```

#### Option B: Headless Custom UI

Build your own customized interface using the headless `usePromptPad()` hook:

```tsx
import React, { useState } from "react";
import { PromptPadProvider, usePromptPad } from "promptpad-note/react";

function CustomNoteInput() {
  const [text, setText] = useState("");
  const { sendPrompt, orchestrateResult, isOrchestrating, confirmNote } = usePromptPad();

  const handleSend = async () => {
    if (!text.trim()) return;
    await sendPrompt(text);
    setText("");
  };

  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={handleSend} disabled={isOrchestrating}>
        {isOrchestrating ? "Processing..." : "Send"}
      </button>

      {orchestrateResult?.type === "note_preview" && (
        <div>
          <h3>{orchestrateResult.preview.title}</h3>
          <p>{orchestrateResult.preview.content}</p>
          <button onClick={() => confirmNote(orchestrateResult.preview)}>
            Save Note
          </button>
        </div>
      )}

      {orchestrateResult?.type === "question_answer" && (
        <div>
          <p>{orchestrateResult.answer}</p>
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <PromptPadProvider config={{ apiBaseUrl: "/api/promptpad" }}>
      <CustomNoteInput />
    </PromptPadProvider>
  );
}
```

---

## 📦 Subpath Exports

| Export Path | Purpose | Content |
| :--- | :--- | :--- |
| `promptpad-note` | Common / Shared | TypeScript types, configuration interfaces, and `DatabaseAdapter`. |
| `promptpad-note/server` | Backend | `createPromptPadRouter`, Express routes, and `MongoDbAdapter`. |
| `promptpad-note/react` | Frontend | `PromptPadProvider`, `usePromptPad`, and `PromptPadDefaultTheme`. |
| `promptpad-note/react/style.css` | Styles | Compiled Tailwind CSS bundle for the pre-built theme. |

---

## 🛠️ Build & Development Commands

```bash
# Run standalone dev servers concurrently
npm run dev

# Build all packages (shared -> server -> client)
npm run build

# Install dependencies across all workspaces
npm run install:all
```

---

## 📄 License

MIT © [İsmet Çetin](https://github.com/kagancetin)
