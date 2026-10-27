import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/standalone.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    "express",
    "mongoose",
    "cors",
    "dotenv",
    "@google/generative-ai"
  ],
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
  noExternal: ["promptpad-note-shared"],
});
