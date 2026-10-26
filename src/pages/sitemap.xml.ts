// sitemap.xml without a sitemap package: every site page except 404. /glass and /review are open before launch; the rest
// redirect to the PDF until then (public/_redirects).
import type { APIRoute } from "astro";
import { cases } from "../data/cases";

const paths = ["/glass/", "/review/", "/", "/manifesto/", "/about/", ...cases.map((c) => `/work/${c.slug}/`)];

export const GET: APIRoute = ({ site }) => {
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml" } },
  );
};
