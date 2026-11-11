// sitemap.xml without a sitemap package: every open page except 404, the case pages included.
import type { APIRoute } from "astro";
import { cases } from "../data/cases";

const paths = ["/", "/work/", ...cases.map((c) => `/work/${c.slug}/`), "/manifesto/", "/about/", "/review/", "/glass/", "/chefkiss/"];

export const GET: APIRoute = ({ site }) => {
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml" } },
  );
};
