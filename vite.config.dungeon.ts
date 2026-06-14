import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-dungeon-final",
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: "src-dungeon/index.html",
      output: { inlineDynamicImports: true },
    },
  },
});
