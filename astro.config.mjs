import { defineConfig } from "astro/config";

// Статическая сборка: dist/ целиком уходит в Cloudflare Workers (static assets).
export default defineConfig({
  site: "https://phileeppov.com",
  output: "static",
  // На машине Ника "localhost" у Node — только IPv6 [::1], а Chrome идёт на 127.0.0.1 и получает отказ.
  server: { host: "127.0.0.1" },
});
