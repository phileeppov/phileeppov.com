// Worker сайта: принимает форму видео-ревью и шлёт письмо на gmail через Email Routing.
// Плюс анонимный счётчик событий /glass (/api/event → база D1 glass-events).
// Всё остальное отдаёт статика (wrangler.jsonc, run_worker_first только для /api/*).
import { EmailMessage } from "cloudflare:email";

const FROM = "form@phileeppov.com";
const TO = "phileeppov@gmail.com";
const MIN_FILL_MS = 3000; // быстрее — бот
const LIMITS = { link: 2000, stuck: 500, contact: 200 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/review") return review(request, env);
    if (url.pathname === "/api/event") return track(request, env);
    return env.ASSETS.fetch(request);
  },
};

// Счётчик /glass: сколько скачали PNG и видео, нажали Share, выбрали пресет, какие ручки тронули
// (по разу за визит), раскрыли ли Advanced, откуда пришёл логотип, по каким ссылкам на себя ушли. Храним только название
// события и дату — без логотипа, IP и данных о человеке. Ответ всегда пустой: страница его не ждёт,
// и сбой базы не должен ничего ломать.
const KNOBS =
  "refraction|blend|logo-size|dispersion|edge-width|angle|length|spin|motion|depth|thickness|background|logo-color|shape|edges|video-format";
const LINKS = "wordmark|x-handle|portfolio|x-name|email|linkedin|github";
const EVENT = new RegExp(
  `^(png|video|video-wide|share|upload|ping|advanced|preset:(studio|melt|prism|lens|night)|knob:(${KNOBS})|from:(file|drop|paste)|link:(${LINKS}))$`,
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
    // Не записали — не страшно.
  }
  return new Response(null, { status: 204 });
}

async function review(request, env) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });

  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(request, 400, "bad form");
  }
  const field = (name) => String(form.get(name) ?? "").trim();
  const data = { link: field("link"), stuck: field("stuck"), contact: field("contact") };

  // Ловушки для ботов: делаем вид, что всё прошло, письмо не шлём.
  const openedAt = Number(field("t"));
  if (field("company") || (openedAt && Date.now() - openedAt < MIN_FILL_MS)) return reply(request, 200);

  if (!data.link || !data.contact) return reply(request, 400, "link and contact are required");
  for (const [name, max] of Object.entries(LIMITS)) {
    if (data[name].length > max) return reply(request, 400, `${name} is too long`);
  }

  try {
    await env.MAIL.send(new EmailMessage(FROM, TO, mime(data)));
  } catch (error) {
    console.error("review mail failed", error);
    return reply(request, 502, "mail failed");
  }
  return reply(request, 200);
}

// С JS форма ждёт JSON; без JS — редирект обратно с ?sent.
function reply(request, status, error) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  if (wantsJson) return Response.json(error ? { ok: false, error } : { ok: true }, { status });
  if (status === 200) return Response.redirect(new URL("/?sent=1#review", request.url), 303);
  return new Response(error || "error", { status });
}

function mime({ link, stuck, contact }) {
  const oneLine = (s) => s.replace(/[\r\n]+/g, " ");
  const isEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact);
  const subject = `Video review: ${oneLine(link).slice(0, 80)}`;
  const body = [`Link: ${link}`, `Stuck: ${stuck || "—"}`, `Contact: ${contact}`, "", "Sent from phileeppov.com"].join("\n");

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
