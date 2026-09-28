// vitest.config.ts — прогон тестов ядра (разбор, симуляция, R₀, МНК) без npm-сборки.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["core/*.test.ts"],
    environment: "node",
  },
});