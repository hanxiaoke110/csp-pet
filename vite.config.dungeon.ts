import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 智子试炼场 Web 端专用构建配置：只构建地牢入口，不含桌面端代码（避免 Tauri invoke 在浏览器崩溃）
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-dungeon",
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: "index-dungeon.html",
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
