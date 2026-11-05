// Typographer: straight quotes in the page text become typographic ones (I'm → I’m, "…" → “…”). The texts stay straight
// in their source (site.md, the components, the case data); this runs on every page, in dev and in the build. Only text
// between tags is touched: attributes, comments, scripts, styles, code and form fields keep their own quotes.
import { defineMiddleware } from "astro:middleware";

// What is passed through whole: a raw block with its contents, a comment, or a single tag (a ">" inside a quoted
// attribute value doesn't end it).
const SKIP = /<(script|style|pre|code|kbd|textarea)\b[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
// Astro escapes quotes that come from expressions; in a text node they can be plain characters.
const ENTITY = /&(#39|#x27|apos|quot|#34|#x22);/g;
const OPENS_AFTER = /[\s(\[—–-]/;
const ENDS_BEFORE = /[\s.,;:!?)\]]/;

function text(s: string): string {
  if (!/['"]|&(#39|#x27|apos|quot|#34|#x22);/.test(s)) return s;
  s = s.replace(ENTITY, (_, e) => (e === "quot" || e === "#34" || e === "#x22" ? '"' : "'"));
  // An apostrophe: inside a word (I’m, founder’s) or after a plural s (users’).
  s = s.replace(/(?<=\p{L})'(?=\p{L})/gu, "’").replace(/(?<=s)'(?=[\s.,;:!?)]|$)/g, "’");
  // A double quote opens after a space or a bracket, or at the start of the text when a word follows; else it closes.
  return s.replace(/"/g, (_, i: number) => {
    const prev = s[i - 1];
    const next = s[i + 1];
    const opens = prev === undefined ? next !== undefined && !ENDS_BEFORE.test(next) : OPENS_AFTER.test(prev);
    return opens ? "“" : "”";
  });
}

export function typeset(html: string): string {
  let out = "";
  let at = 0;
  for (const m of html.matchAll(SKIP)) {
    out += text(html.slice(at, m.index)) + m[0];
    at = m.index! + m[0].length;
  }
  return out + text(html.slice(at));
}

export const onRequest = defineMiddleware(async (_, next) => {
  const res = await next();
  if (!res.headers.get("content-type")?.includes("text/html")) return res;
  return new Response(typeset(await res.text()), res);
});
