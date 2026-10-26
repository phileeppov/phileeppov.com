// Anonymous counter for /review, like the one on /glass: only an event's name goes to the server (/api/event,
// worker/index.js), each name once a visit. No link, no words, no contact, nothing about the visitor. Fire and forget:
// the page doesn't wait for an answer.
//   review:view — the page opened; review:start — something typed into the form; review:scratch — opened the "No
//   product yet" tab (a click, a tap or picking it up); review:send:product, review:send:scratch — a request went
//   through, and which kind it was.

const counted = new Set<string>();

export function count(name: string) {
  if (counted.has(name)) return;
  counted.add(name);
  try {
    navigator.sendBeacon?.("/api/event", name);
  } catch {
    // Not sent; that's fine.
  }
}
