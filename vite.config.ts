import { defineConfig } from "vite";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
  build: {
    target: "es2022",
    lib: {
      entry: "src/hot-date.ts",
      formats: ["es"],
      fileName: () => "hot-date.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    emptyOutDir: true,
  },
});
