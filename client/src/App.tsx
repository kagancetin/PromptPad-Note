import { PromptPadProvider } from "./core/PromptPadContext.js";
import { DefaultTheme } from "./themes/default/DefaultTheme.js";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 flex justify-center">
      <PromptPadProvider config={{ apiBaseUrl: "/api" }}>
        <DefaultTheme />
      </PromptPadProvider>
    </div>
  );
}