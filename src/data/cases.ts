// Cases: copy comes verbatim from the case notes kept outside this repo (the section with the site copy).
// Shots come from each case's shot folder; each shot is placed by the shot map in the same note.
// Each paragraph string matches the source, with source line breaks replaced by spaces. Check: npm run copy-check.

export type Shot = { img: string; caption?: string };
export type Block = string | Shot[];

export interface Case {
  slug: string;
  name: string;
  principle: string;
  description: string;
  mark: string;
  hero: Shot[];
  card: string;
  tension: Block[];
  thesis: string;
  role: string;
  decisions: { title: string; blocks: Block[] }[];
  happened: Block[];
  artifacts: { caption?: string; shots: Shot[] };
  notes?: string[];
}

const s = (...ids: string[]): Shot[] => ids.map((img) => ({ img }));

export const cases: Case[] = [
  {
    slug: "medal",
    name: "Medal.tv",
    principle: "03 — Make the call, then check it",
    description:
      "How recording starts in Medal, a desktop app that records your games in the background and saves clips on a hotkey. 3 million daily users.",
    mark: "phil 01 ppov · NF · 2022",
    hero: s("IMG-00a", "IMG-00b"),
    card: "IMG-00a",
    tension: [
      "Medal's top bar had one dropdown for everything. It showed your online status to friends, and once a game was running it said \"Clipping: PayDay 2\". Clicking it opened a stack of quality settings. Nothing about how to save a moment. Next to it sat a separate Add Game button.",
      s("IMG-01"),
      "My notes from back then, roughly: the Add Game button makes it unclear how to start recording, the difference between full session and clipping isn't clear, and there's no control over a recording that's already running.",
      s("IMG-01b"),
      "A round of small patches would have closed the tickets. Rename the button, label the modes, add some tooltips.",
    ],
    thesis: "The app said it was recording. What to do next was up to you.",
    role: "New users kept asking support how to start recording, and not many of them got as far as posting a clip. The PM brought me the task with a direction, and the rest was my call. I was the only designer on this flow. I handed off the design and left the company before it shipped.",
    decisions: [
      {
        title: "01. Recording gets its own place",
        blocks: [
          "Online status and recording status lived in one dropdown.",
          "I pulled everything about recording out of it. Online status stayed on the left, next to the avatar. Recording got its own button on the right, named after the game you're playing. Inside: the mode (clips, full session or off), your active games with their covers, and a slot to add one more. The Add Game button became that slot.",
          s("IMG-02", "IMG-03"),
          "The hint under the mode changes with it. In clipping it says press F8 to save the last 30 seconds. In full session, hold F8 to start and stop.",
          s("IMG-03b"),
          "The cost was the settings. Everything except clip length, FPS and quality moved one level deeper, and people who tuned their recording now take an extra click.",
        ],
      },
      {
        title: "02. Recording is the normal state",
        blocks: [
          "Recording is red. It's red on every camera, and it was red in Medal too, a red dot next to \"Clipping: PayDay 2\".",
          s("IMG-04c"),
          "I flipped it. While Medal records, the button and the game's frame are green. Red is for \"Recorder off\". For an app that records in the background, recording is the normal state. The thing to worry about is when it stops, because the next moment won't be saved.",
          s("IMG-04a", "IMG-04b"),
          "It breaks a convention people know from every camera.",
        ],
      },
    ],
    happened: [
      "The flow shipped about six months after I left, with small changes.",
      "Medal has been through two redesigns since. The mode switch didn't make it: off became a toggle, and full session moved to its own hotkey.",
      "The core held. Recording still has its own button in the top bar. The game you're recording sits in a green frame next to an Add Game slot. The hotkey stays on screen, and if detection fails you can still pick the process yourself.",
      s("IMG-05a", "IMG-05b"),
    ],
    artifacts: { caption: "2022 · 2024 · now", shots: s("IMG-06a", "IMG-06b", "IMG-06c") },
  },
  {
    slug: "sports-club",
    name: "SPORTS CLUB",
    principle: "04 — Character is not a layer",
    description:
      "A daily fantasy league for football and basketball by PlayMini. Collect cards, build a lineup, stake ETH on a day's games.",
    mark: "phil 02 ppov · NF · 2026",
    hero: s("IMG-01"),
    card: "IMG-01",
    tension: [
      "Fantasy sports products are built around the players. Clean cards, collectible finishes, the world where millionaires play ball among themselves.",
      "Nobody in that world is buying packs. The people picking lineups are somewhere else entirely, and that place is loud, dirty and in a hurry.",
    ],
    thesis: "The fan isn't in the arena.",
    role: "Identity, landing page, cards and packs, the core product screens and the autobot setup. A second designer carried the system into the rest of the product without working alongside me.",
    decisions: [
      {
        title: "01. The fan draws on the poster",
        blocks: [
          "Collectible cards are priced by condition. A clean photo, a perfect finish, nothing touched.",
          "I gave every player his own graffiti, the way a fan treats a poster on the wall. The value is in the wear.",
          s("IMG-02"),
          "The faces were cut over image rights. The shipped cards use mannequins, rarity is carried by the background color, and the drawing survived on the packs, where rarity is what people pay for.",
          [
            { img: "IMG-03a", caption: "Concept" },
            { img: "IMG-03b", caption: "Shipped" },
          ],
          s("IMG-04"),
        ],
      },
      {
        title: "02. States are marked by hand",
        blocks: [
          "I sprayed over the current day. Past days get a sticker. Your stake and your place are written on paper tickets. Risk in the autobot setup is counted in hand-drawn dollar signs.",
          s("IMG-05", "IMG-06", "IMG-07"),
          "In most products like this, the identity stays on the landing page. Inside, an active state is a fill, a border or an underline, and it reads as the system talking to itself.",
          "Where money moves, the noise drops. Buying a card runs on a straight grid in mono, and only the top tabs stay crooked.",
          s("IMG-08"),
          "Most of the dashboard is set in one heavy weight, and one lime carries headings, buttons and data at once. It reads slower than a dark dashboard.",
        ],
      },
    ],
    happened: ["It launched publicly and ran tournaments with live ETH stakes."],
    artifacts: { shots: s("IMG-09", "IMG-10") },
  },
  {
    slug: "ailekmed",
    name: "Ailekmed",
    principle: "05 — The safe version is already taken",
    description: "A website for a single pharmacy: a catalog, reservations for pickup and a loyalty card.",
    mark: "phil 03 ppov · NF · 2026",
    hero: s("IMG-02"),
    card: "IMG-02",
    tension: [
      "Pharmacy chain websites are built for a network. Hundreds of addresses, delivery windows, a sale on every screen.",
      "Ailekmed had just opened. One address, one shelf and a sign on the door saying so.",
      s("IMG-01"),
      "The obvious move was to look bigger and lead with a sale.",
    ],
    thesis: "A pharmacy that just opened needs regulars before it needs sales.",
    role: "The pharmacy had a logo, a color and no license to sell medicines online. I simplified the logo for the site, keeping the leaf and the color, and designed the rest: catalog, reservations, the loyalty program and its rules, and the copy. A developer built it.",
    decisions: [
      {
        title: "01. The card comes first",
        blocks: [
          "A pharmacy homepage usually opens with a promo carousel or the catalog.",
          "I made the first screen issue a loyalty card. A phone number, one button, 100 points on the first purchase. It's a card for regulars, and the headline reads \"Small pharmacy. Real perks.\" The card was there in the first sketch.",
          s("IMG-02b"),
          "The first screen has no medicine on it, and people usually come for one thing their doctor wrote down. For them, search stays in the header.",
        ],
      },
      {
        title: "02. The site ends at the counter",
        blocks: [
          "With no license for online sales, nothing is bought here. The header says how many hours the door stays open. Every card says what is on the shelf right now, and a reservation says there is nothing to pay yet. It ends with a number you give at the counter. On the phone, the loyalty card flips into a code for the cashier.",
          s("IMG-03", "IMG-04", "IMG-05"),
          "Most of the catalog is prescription only and can't be reserved at all. Those medicines stay on the shelf with their price and stock, and the button calls the pharmacy.",
          s("IMG-06", "IMG-07"),
          "The sale never closes on the site. For most of the catalog, it can only send you in to ask.",
        ],
      },
    ],
    happened: ["160 people got the card in the first ten weeks. They show it at the counter."],
    artifacts: { shots: s("IMG-08", "IMG-09", "IMG-10") },
    notes: ["Screens localized to English for this case", "© OpenStreetMap contributors"],
  },
  {
    slug: "mavatars",
    name: "Mavatars",
    principle: "05 — The safe version is already taken",
    description: "Avatars, items and quests, built as a separate product to be folded into Medal.tv later.",
    mark: "phil 04 ppov · NF · 2022",
    hero: s("IMG-01"),
    card: "IMG-01",
    tension: [
      "2022, and everyone was shipping avatars as NFTs. The market was already shaky, so the team kept the crypto under the hood. The player never sees a wallet.",
      "What was left was the loot itself, and loot has a template. Rarity in five colors, rewards on a battle pass.",
    ],
    thesis: "Every game you play should count toward something.",
    role: "Product designer on a team with a PM, a 3D artist and engineers. I designed the feed, profile, avatar setup, inventory, store, quest board and the product's visual style, and worked out the economy with the PM. Characters and items were made by the 3D artist.",
    decisions: [
      {
        title: "01. Rarity on one scale",
        blocks: [
          "Loot games mark rarity with a few colors. Gray, green, blue, purple, gold. Everyone knows the code.",
          "I graded every item from 0 to 100 and made its color a point on one spectrum, blue at the bottom and red at the top. A 37 and a 55 are different colors, and you can see which one sits higher.",
          s("IMG-02"),
          "The first time you see the scale, the colors don't explain themselves.",
        ],
      },
      {
        title: "02. Quests pay in odds",
        blocks: [
          "Medal only records while it's running, and quests for games played with Medal keep it running.",
          "The usual reward for a quest is an item. Battle passes work this way. I made quests pay into a multiplier.",
          "Kill 20 enemies in Valorant and it grows by 0.04. The multiplier lifts your chance at every grade. At ×1.6 a 99 drops at 0.8% instead of 0.5%.",
          s("IMG-03", "IMG-03b"),
          "At the end of the two-week cycle you get what dropped, and a wrap of your hours and quests.",
          "What you give up is a reward you can hold. \"×0.04\" means nothing at first glance, and odds sit closer to a loot box than to a prize.",
        ],
      },
    ],
    happened: [
      "We were building from working prototypes, and the first version was nearly done. The product didn't launch.",
    ],
    artifacts: { shots: s("IMG-06", "IMG-04", "IMG-05") },
  },
];

// Shots: src/assets/cases/<slug>/<ID>.png.
const files = import.meta.glob<{ default: ImageMetadata }>("../assets/cases/*/*.png", { eager: true });

export function shot(slug: string, id: string): ImageMetadata {
  const file = files[`../assets/cases/${slug}/${id}.png`];
  if (!file) throw new Error(`Missing shot ${slug}/${id}.png`);
  return file.default;
}
