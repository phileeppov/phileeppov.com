// Submit for the video review forms: the panel on the home page (ReviewForm.astro) and the screen on /review
// (ReviewScreen.astro). POST /api/review as JSON (worker/index.js), the time-on-page guard and the states after it.
// Markup inside root: form[data-review-form]; [data-state] lines "error", "sent", "next", "later" (with [data-week]
// and [data-contact], filled in on success); [data-hide-on-sent] — what goes away once the request is in; [data-done] —
// takes focus, so screen readers hear it.
// Optional: [data-error-for="<field name>"] — the page's own message for an empty required field (then the browser's
// bubble is off); [data-field] — the box around a field that flashes, when the field itself isn't the visible box.

// The Monday of a review week, as people read it: 2026-11-02 → "November 2".
export const weekLabel = (week: string) =>
  new Date(`${week}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

export function wireReviewForm(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>("[data-review-form]");
  const state = (name: string) => root.querySelector<HTMLElement>(`[data-state="${name}"]`);
  const error = state("error");
  if (!form || !error) return;
  // Once a request is in, the form is done: fields that stay on screen turn read-only, so Enter can't send it twice.
  let sent = false;

  // When something in the form appears or goes (a message row, the dock after sending), its height glides there
  // instead of jumping.
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let glide: Animation | null = null;
  const smooth = (change: () => void) => {
    // A glide still running is stopped where it is: the new one starts from that height, and the old one's handler
    // can't clear the overflow mid-way.
    const from = form.offsetHeight;
    if (glide) {
      glide.onfinish = glide.oncancel = null;
      glide.cancel();
      glide = null;
    }
    change();
    const to = form.offsetHeight;
    if (from === to || still.matches || !form.animate) {
      form.style.overflow = "";
      return;
    }
    form.style.overflow = "hidden";
    glide = form.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    glide.onfinish = glide.oncancel = () => {
      form.style.overflow = "";
      glide = null;
    };
  };

  // Empty required fields get the page's own message and one short flash instead of the browser's bubble, where the
  // markup has the messages. The flash plays once per SEND; the message stays until the field gets something.
  type Field = HTMLInputElement | HTMLTextAreaElement;
  const message = (field: Field) => root.querySelector<HTMLElement>(`[data-error-for="${field.name}"]`);
  const box = (field: Field) => field.closest<HTMLElement>("[data-field]") ?? field;
  const ownMessages = !!root.querySelector("[data-error-for]");
  if (ownMessages) form.noValidate = true;
  const unflash = (el: HTMLElement) => el.classList.remove("is-invalid", "is-invalid-focused");
  // The message is tied to the field (aria-describedby) only while it's shown, so the field doesn't read it out before.
  // Returns whether a shown message went away.
  const clear = (field: Field) => {
    field.removeAttribute("aria-invalid");
    unflash(box(field));
    const m = message(field);
    if (!m || m.hidden) return false;
    m.hidden = true;
    if (m.id && field.getAttribute("aria-describedby") === m.id) field.removeAttribute("aria-describedby");
    return true;
  };
  const check = () => {
    const required = [...form.querySelectorAll<Field>("[required]")];
    const empty = required.filter((field) => !field.value.trim());
    smooth(() => {
      // Fields to fill come first: a send that failed earlier is beside the point now.
      if (empty.length) error.hidden = true;
      // Filled without an input event (some autofill): its old message goes too.
      required.filter((field) => field.value.trim()).forEach(clear);
      empty.forEach((field, i) => {
        const el = box(field);
        unflash(el);
        void el.offsetWidth;
        // The first empty field takes focus, so it flashes from its focus look; the class is set once, here, so later
        // focus changes don't swap the animation and replay it.
        el.classList.add("is-invalid");
        if (i === 0) el.classList.add("is-invalid-focused");
        // Only the box's own flash ends it, not an animation inside it bubbling up (the loading line in the bar).
        const done = (event: AnimationEvent) => {
          if (event.target !== el) return;
          unflash(el);
          el.removeEventListener("animationend", done);
        };
        el.addEventListener("animationend", done);
        field.setAttribute("aria-invalid", "true");
        const m = message(field);
        if (m) {
          m.hidden = false;
          if (m.id) field.setAttribute("aria-describedby", m.id);
        }
      });
    });
    empty[0]?.focus();
    return !empty.length;
  };
  form.addEventListener("input", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    const m = message(field);
    if (m && !m.hidden) smooth(() => clear(field));
    else clear(field);
  });

  // Where the request landed: queue is weeks from now (0 is this week), week is that Monday.
  const show = (queue: number, week: string | null) => {
    sent = true;
    const line = state(queue <= 0 ? "sent" : queue === 1 || !week ? "next" : "later");
    const date = line?.querySelector("[data-week]");
    if (date && week) date.textContent = weekLabel(week);
    // Where the review will go, as the person typed it.
    const contact = form.elements.namedItem("contact");
    if (contact instanceof HTMLInputElement) line?.querySelectorAll("[data-contact]").forEach((el) => (el.textContent = contact.value.trim()));
    smooth(() => {
      error.hidden = true;
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((el) => {
        el.readOnly = true;
        clear(el);
      });
      root.querySelectorAll<HTMLElement>("[data-hide-on-sent]").forEach((el) => (el.hidden = true));
      if (line) line.hidden = false;
      root.classList.add("is-done");
    });
    root.querySelector<HTMLElement>("[data-done]")?.focus({ preventScroll: true });
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sent) return;
    // A failed-send line stays up while trying again, so the form doesn't jump on every press.
    if (ownMessages && !check()) return;
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) button.disabled = true;
    // How long the page has been open, measured here: under 3 s is a bot (worker/index.js). A person can be that quick,
    // say when the phone reloads the tab with the fields still filled in, so wait out the rest rather than lose them.
    const wait = 3100 - performance.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const t = form.elements.namedItem("t");
    if (t instanceof HTMLInputElement) t.value = String(Math.round(performance.now()));
    try {
      const res = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      const result = await res.json().catch(() => null);
      if (!res.ok || !result?.ok) throw new Error(String(res.status));
      show(Number(result.queue) || 0, typeof result.week === "string" ? result.week : null);
    } catch {
      // The line comes in with the form growing to it; when it's already there, it only flashes again, so a repeat
      // failure is still seen.
      if (error.hidden) smooth(() => (error.hidden = false));
      // Same words, new nodes: role="alert" speaks again on a repeat failure, and the size stays put.
      else error.replaceChildren(...[...error.childNodes].map((node) => node.cloneNode(true)));
      error.classList.remove("is-flash");
      void error.offsetWidth;
      error.classList.add("is-flash");
    } finally {
      if (button && !sent) button.disabled = false;
    }
  });
}
