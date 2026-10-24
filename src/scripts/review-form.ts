// Submit for the video review forms: the panel on the home page (ReviewForm.astro) and the screen on /review
// (ReviewScreen.astro). POST /api/review as JSON (worker/index.js), the time-on-page guard and the states after it.
// Markup inside root: form[data-review-form]; [data-state] lines "error", "sent", "next", "later" (with [data-week]);
// [data-hide-on-sent] — what goes away once the request is in; [data-done] — takes focus, so screen readers hear it.

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

  // Where the request landed: queue is weeks from now (0 is this week), week is that Monday.
  const show = (queue: number, week: string | null) => {
    sent = true;
    const line = state(queue <= 0 ? "sent" : queue === 1 || !week ? "next" : "later");
    const date = line?.querySelector("[data-week]");
    if (date && week) date.textContent = weekLabel(week);
    error.hidden = true;
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((el) => (el.readOnly = true));
    root.querySelectorAll<HTMLElement>("[data-hide-on-sent]").forEach((el) => (el.hidden = true));
    if (line) line.hidden = false;
    root.classList.add("is-done");
    root.querySelector<HTMLElement>("[data-done]")?.focus({ preventScroll: true });
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sent) return;
    error.hidden = true;
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
      error.hidden = false;
    } finally {
      if (button && !sent) button.disabled = false;
    }
  });
}
