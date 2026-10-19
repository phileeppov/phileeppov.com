import { defineConfig } from "astro/config";

// Статическая сборка: dist/ целиком уходит в Cloudflare Workers (static assets).
export default defineConfig({
  site: "https://phileeppov.com",
  output: "static",
});
