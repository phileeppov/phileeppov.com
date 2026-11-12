// Link previews (Open Graph, 1200×630) for the home page, /manifesto/, /about/ and /work/: one HTML card per page, drawn
// with the site's own tokens and Onest, saved as public/<name>-og.png (.jpg for the card with the photo). The words are
// copied verbatim from the pages (src/pages/*.astro); when a page's copy changes, change it here too and run:
// node scripts/og.mjs
// The /work card is the exception: its words are read from the built page, dist/work/index.html, so they are the
// page's own to the letter, its ties included. After a line in src/data/facts.ts changes: astro build, then
// node scripts/og.mjs work
// Same family as public/review-og.png and public/glass-og.png: paper, a raised object on the left, the words on the
// right, the address under them. The home card is the exception: the hero alone, too long to share the width.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import sharp from "sharp";
import { ROOT, launchBrowser } from "./lib/site.mjs";

const W = 1200;
const H = 630;
// The cards load the site's own files through a made-up origin, so tokens.css and onest.css work unchanged.
const ORIGIN = "http://og.local";
const TYPES = {
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
// Cards saved as JPEG: the photo is most of the file.
const JPEG = new Set(["about"]);
// The About photo: the first image in src/assets/about, the one the page shows.
const PHOTO = readdirSync(join(ROOT, "src/assets/about")).find((file) => /\.(jpe?g|png|webp)$/i.test(file));

// The /work card's words, read from the built page: the person's first lines, name, role and format. The build has to
// be newer than facts.ts, the page's source, or the card would carry the old lines.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function workWords(browser) {
  const built = join(ROOT, "dist/work/index.html");
  if (!existsSync(built)) throw new Error("No dist/work/index.html: run astro build first");
  if (statSync(built).mtimeMs < statSync(join(ROOT, "src/data/facts.ts")).mtimeMs)
    throw new Error("dist/work/index.html is older than src/data/facts.ts: run astro build first");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.setContent(readFileSync(built, "utf8"));
  const words = await page.evaluate(() => {
    // Ordinary white space only: the page's no-break spaces are part of its words.
    const text = (el) => (el ? el.textContent.replace(/[ \t\r\n]+/g, " ").trim() : "");
    const id = document.querySelector(".who .id");
    return {
      name: text(id?.querySelector("h1 > span:first-child")),
      role: text(id?.querySelector("h1 > span.quiet")),
      format: text(id?.querySelector(":scope > p.quiet")),
    };
  });
  await context.close();
  if (!words.name || !words.role || !words.format) throw new Error("dist/work: no name, role or format line");
  return words;
}
// The format line in two lines as even as can be, each item whole, as on the page (FactsWho.astro): the dot where it
// breaks isn't shown.
const formatLine = (s) => {
  const xs = s.split(/\s*·\s*/), join = (a) => a.join(" · ");
  let best = 1;
  const worst = (k) => Math.max(join(xs.slice(0, k)).length, join(xs.slice(k)).length);
  for (let k = 2; k < xs.length; k++) if (worst(k) < worst(best)) best = k;
  return [xs.slice(0, best), xs.slice(best)].filter((a) => a.length).map((a) => `<span class="item">${esc(join(a))}</span>`).join("<br />");
};

const STYLE = `
  html {
    background: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-ui);
    letter-spacing: var(--tracking-ui);
    -webkit-font-smoothing: antialiased;
  }
  body {
    width: ${W}px;
    height: ${H}px;
    margin: 0;
    overflow: hidden;
  }
  p {
    margin: 0;
  }
  /* Display, as .page-title on the site; Lead, as the leads and principle titles. */
  .title {
    font-weight: 500;
    line-height: 0.98;
    letter-spacing: -0.045em;
  }
  .lead {
    font-weight: 500;
    line-height: 1.1;
    letter-spacing: -0.05em;
  }
  .title span,
  .lead span {
    display: block;
  }
  .where {
    font-size: 28px;
    line-height: 1;
    opacity: 0.5;
  }
  /* Object on the left, words on the right: the title level with the object's top, the address with its foot. */
  .card {
    display: grid;
    grid-template-columns: var(--object) minmax(0, 1fr);
    gap: 64px;
    height: 100%;
    padding: 56px 64px 56px 56px;
    box-sizing: border-box;
  }
  .words {
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    align-content: start;
  }
  .words .where {
    grid-row: 4;
  }
`;

const CARDS = {
  // index.astro: the hero, each sentence on its own line, and the address.
  home: `
    <style>
      .home {
        display: grid;
        align-content: center;
        gap: 52px;
        height: 100%;
        padding: 60px;
        box-sizing: border-box;
      }
      /* The first sentence whole on one line, as on the page; that sets the size. */
      .home .title {
        font-size: 76px;
      }
      .home .title span + span {
        text-wrap: balance;
      }
    </style>
    <main class="home">
      <p class="title"><span>Nikita Filippov, product designer.</span> <span>I&nbsp;redesigned game recording at&nbsp;Medal.tv, an&nbsp;app with 3M daily&nbsp;users.</span></p>
      <p class="where">phileeppov.com</p>
    </main>`,

  // manifesto.astro: the title, and the five principles on a raised sheet, numbered as on the page.
  manifesto: `
    <style>
      .card {
        --object: 600px;
      }
      .sheet {
        display: grid;
        align-content: space-between;
        padding: 48px 44px;
        border-radius: 24px;
        background: var(--surface);
        box-shadow: var(--float);
      }
      .sheet p {
        display: grid;
        grid-template-columns: 64px minmax(0, 1fr);
        font-size: 32px;
        text-wrap: balance;
      }
      .sheet b {
        font-weight: inherit;
        opacity: 0.3;
      }
      .manifesto .title {
        font-size: 64px;
        padding-top: 4px;
      }
    </style>
    <main class="card manifesto">
      <div class="sheet">
        <p class="lead"><b>01.</b>Every decision has an&nbsp;author.</p>
        <p class="lead"><b>02.</b>The brief is wrong until proven&nbsp;right.</p>
        <p class="lead"><b>03.</b>Make the call, then check&nbsp;it.</p>
        <p class="lead"><b>04.</b>Character is not a&nbsp;layer.</p>
        <p class="lead"><b>05.</b>The safe version is already&nbsp;taken.</p>
      </div>
      <div class="words">
        <p class="title">Five principles I&nbsp;work&nbsp;by.</p>
        <p class="where">phileeppov.com/manifesto</p>
      </div>
    </main>`,

  // about.astro: the photo as on the page (a print: small radius, a 0.5px edge, no shadow), the title and the lead.
  about: `
    <style>
      .card {
        --object: 414px;
      }
      .photo {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 8px;
        box-shadow: 0 0 0 0.5px var(--hair);
      }
      .about .title {
        font-size: 104px;
        margin-top: -6px;
      }
      .about .lead {
        margin-top: 28px;
        font-size: 40px;
      }
    </style>
    <main class="card about">
      <img class="photo" src="/src/assets/about/${PHOTO}" alt="" />
      <div class="words">
        <p class="title">I'm Nikita.</p>
        <p class="lead"><span>I design products.</span> <span>I've been doing it for five&nbsp;years.</span></p>
        <p class="where">phileeppov.com/about</p>
      </div>
    </main>`,

  // work/index.astro: the person as the page's first lines have it, the address under them. Words only, as at home.
  // The format line is quiet as on the page, 0.7, not 0.5 like the address: it's what a recruiter sorts by.
  work: (w) => `
    <style>
      .work {
        display: grid;
        align-content: center;
        gap: 52px;
        height: 100%;
        padding: 60px;
        box-sizing: border-box;
      }
      .work .title {
        font-size: 128px;
      }
      .work .lead {
        margin-top: 20px;
        font-size: 60px;
      }
      .work .format {
        margin-top: 28px;
        font-size: 36px;
        line-height: 1.15;
        opacity: 0.7;
      }
      .item {
        white-space: nowrap;
      }
    </style>
    <main class="work">
      <div>
        <p class="title">${esc(w.name)}</p>
        <p class="lead">${esc(w.role)}</p>
        <p class="format">${formatLine(w.format)}</p>
      </div>
      <p class="where">phileeppov.com/work</p>
    </main>`,
};

const html = (body) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="/src/styles/tokens.css" />
    <link rel="stylesheet" href="/src/styles/onest.css" />
    <style>${STYLE}</style>
  </head>
  <body>${body}</body>
</html>`;

const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(CARDS);
for (const name of names) if (!CARDS[name]) throw new Error(`No card "${name}"`);
const browser = await launchBrowser();
try {
  // A card drawn from a page's words reads them only when it's asked for, so the others don't need a build.
  const words = names.some((name) => typeof CARDS[name] === "function") ? await workWords(browser) : null;
  const bodies = Object.fromEntries(names.map((name) => [name, typeof CARDS[name] === "function" ? CARDS[name](words) : CARDS[name]]));
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    const name = path.slice(1);
    if (bodies[name]) return route.fulfill({ contentType: "text/html", body: html(bodies[name]) });
    // /src/... from the repo, everything else (the fonts) from public/, as the site serves it.
    const file = path.startsWith("/src/") ? join(ROOT, path) : join(ROOT, "public", path);
    try {
      return route.fulfill({ contentType: TYPES[extname(file)], body: readFileSync(file) });
    } catch {
      return route.fulfill({ status: 404 });
    }
  });

  for (const name of names) {
    await page.goto(`${ORIGIN}/${name}`, { waitUntil: "load" });
    // The font is fetched only once text asks for it, so ask for it outright: fonts.ready alone can resolve before that.
    const check = await page.evaluate(async () => {
      const faces = await document.fonts.load('500 80px "Onest"', document.body.innerText);
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode()));
      // Anything past the card's edge, or a word too long for its line.
      const past = [...document.querySelectorAll("main *")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight || el.scrollWidth > el.clientWidth + 1;
      });
      return {
        onest: faces.length > 0 && faces.every((face) => face.status === "loaded"),
        past: past.map((el) => el.textContent.trim().slice(0, 40) || el.tagName),
      };
    });
    if (!check.onest) throw new Error(`${name}: Onest did not load`);
    if (check.past.length) throw new Error(`${name}: runs past the card or its box: ${check.past.join(" | ")}`);

    // A card with a photo goes out as JPEG (no chroma subsampling, so the type keeps clean edges); the rest as PNG,
    // full colour if it stays under 300 KB (some messengers drop a larger preview image), else 256 colours.
    const shot = await page.screenshot({ type: "png" });
    const file = `${name}-og.${JPEG.has(name) ? "jpg" : "png"}`;
    let img;
    if (JPEG.has(name)) img = await sharp(shot).jpeg({ quality: 85, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
    else {
      img = await sharp(shot).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
      if (img.length > 300_000) img = await sharp(shot).png({ palette: true, quality: 100, effort: 10 }).toBuffer();
    }
    writeFileSync(join(ROOT, "public", file), img);
    console.log(`public/${file}  ${Math.round(img.length / 1024)} KB`);
  }
} finally {
  await browser.close();
}
