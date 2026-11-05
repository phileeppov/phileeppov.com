// Link previews (Open Graph, 1200×630) for the home page, /manifesto/ and /about/: one HTML card per page, drawn with
// the site's own tokens and Onest, saved as public/<name>-og.png. The words are copied verbatim from the pages
// (src/pages/*.astro); when a page's copy changes, change it here too and run: node scripts/og.mjs
// Same family as public/review-og.png and public/glass-og.png: paper, a raised object on the left, the words on the
// right, the address under them. The home card is the exception: the hero alone, too long to share the width.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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
// The About photo: the first image in src/assets/about, the one the page shows.
const PHOTO = readdirSync(join(ROOT, "src/assets/about")).find((file) => /\.(jpe?g|png|webp)$/i.test(file));

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
      <p class="title"><span>Nikita Filippov, product designer.</span> <span>I&nbsp;redesigned game recording in&nbsp;Medal.tv, an&nbsp;app with 3M daily&nbsp;users.</span></p>
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
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    const name = path.slice(1);
    if (CARDS[name]) return route.fulfill({ contentType: "text/html", body: html(CARDS[name]) });
    // /src/... from the repo, everything else (the fonts) from public/, as the site serves it.
    const file = path.startsWith("/src/") ? join(ROOT, path) : join(ROOT, "public", path);
    try {
      return route.fulfill({ contentType: TYPES[extname(file)], body: readFileSync(file) });
    } catch {
      return route.fulfill({ status: 404 });
    }
  });

  for (const name of names) {
    if (!CARDS[name]) throw new Error(`No card "${name}"`);
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

    // Full colour if it stays under 300 KB (some messengers drop a larger preview image), else 256 colours.
    const shot = await page.screenshot({ type: "png" });
    const out = join(ROOT, "public", `${name}-og.png`);
    let png = await sharp(shot).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    if (png.length > 300_000) png = await sharp(shot).png({ palette: true, quality: 100, effort: 10 }).toBuffer();
    writeFileSync(out, png);
    console.log(`public/${name}-og.png  ${Math.round(png.length / 1024)} KB`);
  }
} finally {
  await browser.close();
}
