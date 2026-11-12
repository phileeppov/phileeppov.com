// The work view's facts. Words come from the one-page CV kept outside this repo; nothing here is written fresh.
// A line keeps the CV's wording, cut only where a field starts. A note under a shot is the site's own (site.md §10).
// Short words are kept with the next one (tie, as in the case texts), so no line ends on "the" or "to".
import { tie } from "./cases";

export interface Entry {
  name: string;
  what?: string;
  term?: string;
  meta?: string; // the row's one line of when, where and with whom, when the CV gives more than the place
  slug?: string; // has a case page
  did?: string[]; // what was done, a paragraph to each item
  result?: string;
  shotNote?: string; // under the shot, when its screens were changed for the case
}

export interface Place {
  id: string;
  name: string;
  meta: string;
  term: string;
  note?: string;
  // The CV's line on personal projects under the place, cut where a field starts: what they are, then each project,
  // linked to its page here.
  personal?: { title: string; lead: string; items: { name: string; href: string; text: string }[] };
  from: [number, number];
  to?: [number, number]; // none: to the present
  work: Entry[];
}

export const person = tie({
  name: "Nikita Filippov",
  role: "Product Designer",
  format: "Remote · Tbilisi, Georgia (UTC+4) · CET hours or US overlap · open to contract or full-time · available now",
  summary:
    "Product designer, five years, mostly 0→1. Designed a pharmacy website from a spec I wrote, and product and visual identity for a crypto wallet and a fantasy sports game. Before that, worked on game recording in Medal.tv, a desktop app with 3M daily users.",
  email: "nikita@phileeppov.com",
  linkedin: "https://linkedin.com/in/phileeppov",
  cv: "/Nikita-Filippov-Product-Designer-CV.pdf",
});

export const places: Place[] = tie([
  {
    id: "independent",
    name: "Independent Product Designer",
    meta: "Remote",
    term: "Nov 2025 – present",
    from: [2025, 11],
    // The CV ends the line with phileeppov.com: on phileeppov.com itself that would be a link to the page you're on.
    personal: {
      title: "Personal projects",
      lead: "since Aug 2026, designed by me, built with Claude Code",
      items: [
        { name: "Glass", href: "/glass/", text: "which turns a logo into a glass app icon" },
        { name: "chefkiss", href: "/chefkiss/", text: "reaction buttons for Claude's answers" },
      ],
    },
    work: [
      {
        name: "Ailekmed",
        what: "Pharmacy website",
        term: "May – Jul 2026",
        meta: "May – Jul 2026 · Independent · six weeks, with one developer",
        slug: "ailekmed",
        did: [
          "Proposed building the site around a loyalty program to win a new pharmacy its first regulars. Designed the program, signup and a digital card that turns into a barcode at the counter.",
          "Designed catalog, search, pickup reservations and account from scratch and wrote all interface copy.",
        ],
        result: "Live; 160 loyalty sign-ups in the first 10 weeks with no online ads, and customers use the card at the counter.",
        shotNote: "The site is live. For this case I translated the screens and made up a US address.",
      },
      {
        name: "SPORTS CLUB",
        what: "Crypto fantasy sports for PlayMini",
        term: "Nov 2025 – Apr 2026",
        slug: "sports-club",
        did: ["Owned the visual identity and carried it into the product: landing page, cards and packs, dashboard, market. Defined the visual system and UI states that a second designer applied to the rest of the product."],
        result: "Launched publicly; ran tournaments with real ETH stakes. PlayMini reports a $1M+ token market cap after fair launch and 86 ETH raised in a community round.",
      },
    ],
  },
  {
    id: "premium",
    name: "Premium Studios",
    meta: "Product Designer",
    term: "Dec 2022 – Oct 2025",
    note: "US product studio. Mostly the only designer on each project.",
    from: [2022, 12],
    to: [2025, 10],
    work: [
      {
        name: "Patch Wallet",
        what: "A smart wallet for any Twitter account, email or phone number, with no seed phrase",
        slug: "patch-wallet",
        did: ["Owned the shipped UI, the visual identity, Patch Pay and the design system; worked out UX and flows with the PM."],
        result: "We built it from scratch and launched it at ETHDenver 2023.",
      },
      {
        name: "MiniPool",
        what: "An NFT pool game for PlayMini",
        did: ["Full interface."],
        result: "Launched with live matches.",
      },
      {
        name: "NFT gallery and a browser extension for analyzing crypto collections",
        result: "Both launched.",
      },
      {
        name: "Presto",
        what: "A client of the studio: a blockchain explorer for people new to crypto",
        term: "May 2023 – Oct 2024",
        did: ["Designed the product and visual identity from scratch. For part of the project, a studio colleague and I worked for Presto directly."],
      },
    ],
  },
  {
    id: "medal",
    name: "Medal.tv",
    meta: "Product Designer · Contract, remote",
    term: "Oct 2021 – Nov 2022",
    note: "Desktop app for capturing and sharing gaming clips, 3M daily users.",
    from: [2021, 10],
    to: [2022, 11],
    work: [
      {
        name: "Recording flow",
        slug: "medal",
        did: ["Reworked how recording starts: new users couldn't tell how to start or control it, and support kept getting the question. The only designer on the flow, from the PM's direction to the final spec."],
        result: "Shipped after I left. Two redesigns later, the core is still there: a separate recording control, the active game next to Add Game, on-screen hotkeys and a manual pick if detection fails.",
      },
      {
        name: "Mavatars",
        what: "Avatars and rewards for Medal",
        meta: "Medal.tv · with a PM, a 3D artist and engineers",
        slug: "mavatars",
        did: ["Designed it end to end, from the profile, feed and pins to item grades and quests."],
      },
    ],
  },
  {
    id: "freelance",
    name: "Freelance",
    meta: "Designer",
    term: "Dec 2020 – Sep 2021",
    from: [2020, 12],
    to: [2021, 9],
    work: [
      {
        name: "Website",
        what: "For a local repair and tailoring shop",
        result: "Still live.",
      },
    ],
  },
]);

export const skills = tie([
  { label: "Design", text: "product design 0→1, interaction design, visual identity, design systems, UX writing, prototyping" },
  { label: "Tools", text: "Figma, Framer, Cinema 4D, ComfyUI, Claude Code, Notion, Linear" },
  { label: "Domains", text: "gaming, crypto, pharmacy retail" },
]);

export const education = tie({
  school: "Peter the Great St. Petersburg Polytechnic University",
  degree: "Bachelor of Business Administration (BBA)",
});

export const languages = "Russian (native) · English (working language since 2021)";

// The record to scale: months from the present back to the first month, newest first.
const stamp = (d: [number, number]) => d[0] * 12 + (d[1] - 1);
const now = () => {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth() + 1; // the first day after this month
};
const FIRST = stamp(places[places.length - 1].from);
export const totalMonths = () => now() - FIRST;
export const months = (from: [number, number], to?: [number, number]) => (to ? stamp(to) + 1 : now()) - stamp(from);
// How far an end date lies from the present, in months: the left edge on a ruler that runs newest first.
export const sinceEnd = (to?: [number, number]) => (to ? now() - (stamp(to) + 1) : 0);
// The years on that ruler, newest first, each with its share of the months.
export const years = () => {
  const out: { year: number; months: number }[] = [];
  const end = now();
  for (let y = Math.floor((end - 1) / 12); y * 12 + 12 > FIRST; y--) {
    const a = Math.max(y * 12, FIRST);
    const b = Math.min(y * 12 + 12, end);
    out.push({ year: y, months: b - a });
  }
  return out;
};
