// sitemap.xml without a sitemap package: every open page except 404. The case pages are left out while they're being
// redone: until they come back, /work/* redirects to the PDF (public/_redirects).
import type { APIRoute } from "astro";

const paths = ["/", "/manifesto/", "/about/", "/review/", "/glass/"];

export const GET: APIRoute = ({ site }) => {
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml" } },
  );
};
