import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "assets",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
