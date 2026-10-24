import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./test/setup/model-catalog.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/marketmitra_test",
      SESSION_SECRET: "test_only_32_char_minimum_dummy_secret_value",
      APP_URL: "http://localhost:3000",
      EMAIL_FROM: "test@marketmitra.ai",
      OPENAI_API_KEY: "test-key-not-real",
      ANTHROPIC_API_KEY: "test-key-not-real",
      GEMINI_API_KEY: "test-key-not-real",
    },
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./test/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
