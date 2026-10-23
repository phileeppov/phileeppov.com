import { defineConfig } from "astro/config";

// Static build: all of dist/ goes to Cloudflare Workers (static assets).
export default defineConfig({
  site: "https://phileeppov.com",
  output: "static",
  // On the dev machine Node resolves "localhost" to IPv6 [::1] only, while Chrome goes to 127.0.0.1 and is refused.
  server: { host: "127.0.0.1" },
});
