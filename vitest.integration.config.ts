import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 120_000, // testcontainers pull + boot puede tardar en CI fría
    hookTimeout: 120_000,
    pool: "forks", // tests de integración no comparten estado JS
    poolOptions: {
      forks: {
        singleFork: true, // un solo stack de Postgres/Redis para toda la suite
      },
    },
    globals: false,
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
