import "./index.css";

// 1. Headless Logic & Provider
export { PromptPadProvider, usePromptPad } from "./core/PromptPadContext.js";
export type { PromptPadProviderProps, PromptPadContextValue } from "./core/PromptPadContext.js";

// 2. Pre-built Default Theme
export { DefaultTheme as PromptPadDefaultTheme } from "./themes/default/DefaultTheme.js";

// 3. Shared Types
export * from "promptpad-note-shared";
