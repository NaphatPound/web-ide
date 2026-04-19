import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { devHost } from "./vite-plugins/devHost";

export default defineConfig({
  plugins: [react(), devHost()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ["monaco-editor", "@monaco-editor/react", "monaco-vim"],
          xterm: ["xterm", "xterm-addon-fit", "xterm-addon-web-links"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
