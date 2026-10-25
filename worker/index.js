// Site Worker: takes the video review form (/api/review), books a slot and sends an email to gmail via Email Routing.
// Plus an anonymous event counter for /glass (/api/event). Both keep their tables in the D1 database glass-events.
// Everything else is served as static assets (wrangler.jsonc, run_worker_first only for /api/*).
import { EmailMessage } from "cloudflare:email";

const FROM = "form@phileeppov.com";
const TO = "phileeppov@gmail.com";
const MIN_FILL_MS = 3000; // faster means a bot
const LIMITS = { link: 2000, stuck: 500, contact: 200 };
const WEEKLY_REVIEWS = 3; // free reviews a week; past that, requests queue up for the next weeks
const PER_SENDER = 2; // requests a week from one IP; more get the error state with the email address
const WEEKS_AHEAD = 26; // the queue never books further out than this
const ERROR_TEXT = "That didn't go through. Write to nikita@phileeppov.com instead.";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/review") return review(request, env);
    if (url.pathname === "/api/event") return track(request, env);
    return env.ASSETS.fetch(request);
  },
};

// /glass counter: PNG and video downloads and their formats, Share clicks, preset picks, which knobs were touched
// (once per visit), whether Advanced was opened, where the logo came from and how thick it is (thin, mid, bold, a photo),
// which author links were followed, and which new features were tried, once per visit: a sound mode (never a track's
// name), typing, Randomize, Copy link, tilt, a tap, singing the glass, full screen, picking a track's part. Only the event name and the date are stored: no logo, IP or personal data. The response is always empty: the page doesn't wait for it,
// and a database failure must not break anything.
const KNOBS =
  "refraction|blend|logo-size|dispersion|edge-width|angle|length|spin|motion|depth|thickness|background|logo-color|shape|edges|video-format|facets";
const LINKS = "wordmark|x-handle|portfolio|x-name|email|linkedin|github|review-pill|review-line|source|copy";
const EVENT = new RegExp(
  `^(png|video|video-wide|share|upload|ping|advanced|text|random|tilt|tap|sing|full|track:pick|preset:(studio|melt|prism|lens|night)|knob:(${KNOBS})|from:(file|drop|paste)|link:(${LINKS})|sound:(demo|mic|track)|image:(2048|avatar|store)|logo:(thin|mid|bold|fill))$`,
);

async function track(request, env) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const name = (await request.text()).trim().slice(0, 40);
  if (!EVENT.test(name)) return new Response(null, { status: 400 });
  const day = new Date().toISOString().slice(0, 10);
  try {
    await env.EVENTS.batch([
      env.EVENTS.prepare(
        "CREATE TABLE IF NOT EXISTS events (day TEXT NOT NULL, name TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name))",
      ),
      env.EVENTS.prepare(
        "INSERT INTO events (day, name, count) VALUES (?1, ?2, 1) ON CONFLICT (day, name) DO UPDATE SET count = count + 1",
      ).bind(day, name),
    ]);
  } catch {
    // Not recorded; that's fine.
  }
  return new Response(null, { status: 204 });
}

async function review(request, env) {
  if (request.method === "GET") return opening(env);
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });

  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(request, 400, "bad form");
  }
  const field = (name) => String(form.get(name) ?? "").trim();
  const data = { link: field("link"), stuck: field("stuck"), contact: field("contact") };

  // Bot traps. Only bots fill the "message" field: it isn't rendered, so people and browser autofill never see it.
  // "t" is how long the page was open before the submit, measured in the browser (browser and server clocks can disagree,
  // so a timestamp would drop real people); the page itself never sends less than MIN_FILL_MS.
  // A trap or a submit that fast: pretend it went through, send nothing.
  const elapsed = Number(field("t")) || 0;
  if (field("message") || (elapsed > 0 && elapsed < MIN_FILL_MS)) return reply(request, 200, null, { queue: 0 });
  // No "t" means the page script never ran: a bot posting directly, or a person without JS, who gets the email address.
  if (!(elapsed > 0)) return reply(request, 400, "no timer");

  if (!data.link || !data.contact) return reply(request, 400, "link and contact are required");
  for (const [name, max] of Object.entries(LIMITS)) {
    if (data[name].length > max) return reply(request, 400, `${name} is too long`);
  }

  // A slot first, then the email. If the database fails, the request still goes out, marked as not counted.
  let slot = null;
  try {
    slot = await takeSlot(env, request.headers.get("CF-Connecting-IP") || "");
  } catch (error) {
    console.error("review slot failed", error);
  }
  if (slot?.refused) return reply(request, 429, "too many requests");

  try {
    await env.MAIL.send(new EmailMessage(FROM, TO, mime(data, slot)));
  } catch (error) {
    console.error("review mail failed", error);
    // The email didn't go, so the slot goes back.
    if (slot) await env.EVENTS.prepare("DELETE FROM reviews WHERE id = ?1").bind(slot.id).run().catch(() => {});
    return reply(request, 502, "mail failed");
  }
  return reply(request, 200, null, slot || { queue: 0 });
}

// Review slots: WEEKLY_REVIEWS a week. A request takes the first week from this one that still has room,
// so "this week is full" also counts the people already queued. One row per request: when it came, which week it was
// sent in, which week it's booked for, and the sender for PER_SENDER. The sender is only the first 20 bits of a SHA-256
// of the IP and the week: thousands of addresses share each value, so it can't be turned back into an IP, and two people
// sharing one by chance is rare at this volume. It's wiped on the first request after that week. No link or contact is
// stored. Each insert checks the count in the same statement, so two requests at once can't take the same slot.
async function takeSlot(env, ip) {
  const db = env.EVENTS;
  const now = new Date();
  const thisWeek = weekOf(now);
  const sender = (await sha256(`${ip}|${thisWeek}`)).slice(0, 5);
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, at TEXT NOT NULL, sent_week TEXT NOT NULL, week TEXT NOT NULL, sender TEXT)",
    ),
    db.prepare("UPDATE reviews SET sender = NULL WHERE sent_week < ?1 AND sender IS NOT NULL").bind(thisWeek),
  ]);
  const sent = await db
    .prepare("SELECT COUNT(*) AS n FROM reviews WHERE sent_week = ?1 AND sender = ?2")
    .bind(thisWeek, sender)
    .first("n");
  if (sent >= PER_SENDER) return { refused: true };

  for (let queue = 0; queue <= WEEKS_AHEAD; queue++) {
    const week = addWeeks(thisWeek, queue);
    const room = queue < WEEKS_AHEAD ? WEEKLY_REVIEWS : Number.MAX_SAFE_INTEGER;
    const id = await db
      .prepare(
        "INSERT INTO reviews (at, sent_week, week, sender) SELECT ?1, ?2, ?3, ?4 WHERE (SELECT COUNT(*) FROM reviews WHERE week = ?3) < ?5 RETURNING id",
      )
      .bind(now.toISOString(), thisWeek, week, sender, room)
      .first("id");
    if (id == null) continue;
    // The slot is taken; if only this count fails, the email just says the place is unknown.
    const place = await db
      .prepare("SELECT COUNT(*) AS n FROM reviews WHERE week = ?1 AND id <= ?2")
      .bind(week, id)
      .first("n")
      .catch(() => "?");
    return { id, queue, week, place };
  }
}

// GET /api/review: the first week that still has room, for the status on the page ("open this week" or the week a
// request sent now goes into). Read only; counts, no rows. Without the table yet, nothing is booked; if the database
// fails otherwise, 503, and the page shows no status rather than a wrong one.
async function opening(env) {
  const thisWeek = weekOf(new Date());
  let queue = 0;
  try {
    const { results } = await env.EVENTS.prepare("SELECT week, COUNT(*) AS n FROM reviews WHERE week >= ?1 GROUP BY week")
      .bind(thisWeek)
      .all();
    const taken = new Map(results.map((r) => [r.week, r.n]));
    while (queue < WEEKS_AHEAD && (taken.get(addWeeks(thisWeek, queue)) ?? 0) >= WEEKLY_REVIEWS) queue++;
  } catch (error) {
    if (!/no such table/i.test(String(error?.message ?? error))) return new Response(null, { status: 503 });
  }
  return Response.json({ queue, week: addWeeks(thisWeek, queue) }, { headers: { "Cache-Control": "no-store" } });
}

// The review week runs Monday to Sunday in UTC+3, the site owner's time zone. Key: that Monday, YYYY-MM-DD.
function weekOf(date) {
  const local = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const back = (local.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back)).toISOString().slice(0, 10);
}

function addWeeks(week, n) {
  const date = new Date(`${week}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7 * n);
  return date.toISOString().slice(0, 10);
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The page script asks for JSON and gets where the request landed: weeks out (0 is this week) and that week's Monday.
// A plain form post comes only without the script: a person without JS has no "t" and gets the error text with
// the email address; a bot caught by a trap is sent back to /review.
function reply(request, status, error, slot) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  if (wantsJson) {
    return Response.json(error ? { ok: false, error } : { ok: true, queue: slot?.queue ?? 0, week: slot?.week }, { status });
  }
  if (status !== 200) return new Response(ERROR_TEXT, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return Response.redirect(new URL("/review/", request.url), 303);
}

// Subject and body say where the request landed: this week, the queue, or not counted if the database failed.
function mime({ link, stuck, contact }, slot) {
  const oneLine = (s) => s.replace(/[\r\n]+/g, " ");
  const isEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact);
  const date = (week) => week.split("-").reverse().join(".");
  const [tag, where] = !slot
    ? ["[Not counted]", "not counted, the database didn't answer"]
    : slot.queue === 0
      ? [`[This week ${slot.place}/${WEEKLY_REVIEWS}]`, `this week, ${slot.place} of ${WEEKLY_REVIEWS}`]
      : [`[Queue ${date(slot.week)}]`, `queue, week of ${date(slot.week)}, ${slot.place} of ${WEEKLY_REVIEWS}`];
  const subject = `${tag} Video review: ${oneLine(link).slice(0, 80)}`;
  const body = [
    `Link: ${link}`,
    `Stuck: ${stuck || "—"}`,
    `Contact: ${contact}`,
    `Slot: ${where}`,
    "",
    "Sent from phileeppov.com",
  ].join("\n");

  const headers = [
    `From: phileeppov.com <${FROM}>`,
    `To: ${TO}`,
    isEmail ? `Reply-To: ${contact}` : null,
    `Subject: =?UTF-8?B?${base64(subject)}?=`,
    `Message-ID: <${crypto.randomUUID()}@phileeppov.com>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);

  return `${headers.join("\r\n")}\r\n\r\n${base64(body).replace(/.{76}/g, "$&\r\n")}\r\n`;
}

function base64(text) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
