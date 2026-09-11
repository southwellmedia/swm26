import type { ImageMetadata } from 'astro';
import journalShot from '@/assets/work/vana/gallery-01.webp';

// Content for the Vana product story (/work/vana).
//
// Same arrangement as reap-capital.ts: content/work/vana.mdx carries the card
// summary, and this file is the long-form story behind it. Vana is our own
// app and still in development, so nearly everything here is draft copy —
// every figure, date and name is a placeholder until the product settles.
// Anything marked TODO is a slot waiting for the real thing.

export interface Stat {
  value: string;
  label: string;
}

export interface Chapter {
  num: string;
  title: string;
}

export interface Note {
  label: string;
  text: string;
}

export interface Habit {
  name: string;
  /** The stacking cue — what this habit follows. Blank for the anchor habit. */
  after?: string;
  dur: string;
  done: boolean;
}

export interface Ritual {
  name: string;
  window: string;
  /** The line the app writes under the ritual name. */
  summary: string;
  habits: Habit[];
}

export interface Phase {
  num: string;
  name: string;
  weeks: string;
  desc: string;
  /** 0–100, how far through the phase the sample user is. */
  progress: number;
  state: 'done' | 'now' | 'next';
}

export interface Mood {
  label: string;
  /** Weather glyph the app uses for the mood. */
  glyph: string;
}

export interface Swatch {
  name: string;
  hex: string;
  /** Which of the page's --vana-* tokens the tile paints with. */
  token: string;
  /** Tag text sits on a dark or a light fill. */
  onDark: boolean;
}

export interface Capability {
  title: string;
  desc: string;
}

export interface Milestone {
  label: string;
  when: string;
  state: 'done' | 'now' | 'next';
}

export interface StackGroup {
  label: string;
  items: string[];
}

export const hero = {
  eyebrow: ['PRODUCT STORY', 'VANA · SOUTHWELL ORIGINAL', 'IN DEVELOPMENT · 2026'],
  // TODO: draft copy — settle once the positioning is final.
  intro:
    'Vana is a habit and journaling app we are building in the studio. Two rituals a day, a six-week journey to grow into, and a journal that asks how today went. No streaks to lose, no scoreboard, no guilt. Just a calmer way to show up for yourself.',
};

// TODO: placeholder figures. Swap for real ones once there is a beta cohort.
export const stats: Stat[] = [
  { value: '2', label: 'Rituals a day — one for the morning, one for the night' },
  { value: '6', label: 'Weeks per journey, in three phases that build on each other' },
  { value: '0', label: 'Streaks. Miss a day and nothing breaks' },
  { value: '1', label: 'Letter every morning, written from yesterday' },
];

export const product = {
  // TODO: no public URL yet. Points at the TestFlight page once one exists.
  url: undefined as string | undefined,
  cta: 'TESTFLIGHT — COMING',
  intro:
    'Most habit apps are built to be opened. Vana is built to be closed. You check the morning off, you read the letter, you put the phone down. The whole product is tuned for the ten minutes a day it actually wants from you.',
  /** Stripe-placeholder captions for the three detail shots still to come. */
  shots: ['onboarding — pick a journey', 'morning ritual — habit stack', 'the morning letter'],
  notes: [
    {
      label: 'PROBLEM',
      text: 'Habit apps reward streaks and punish the miss. Notifications pile up, the calendar turns red, and self-improvement becomes one more source of anxiety.',
    },
    {
      label: 'ANSWER',
      text: 'Rituals instead of lists. A journey with phases instead of a streak. A letter every morning instead of a badge. Warm type, soft light, a voice that talks to you like a person.',
    },
    {
      label: 'BUILD',
      // TODO: confirm the stack once the native build is locked.
      text: 'React Native · Expo · TypeScript · Supabase · iOS first, Android after.',
    },
  ] satisfies Note[],
};

export const chapters: Chapter[] = [
  { num: '02', title: 'Rituals — morning and evening' },
  { num: '03', title: 'Journeys — six weeks, three phases' },
  { num: '04', title: 'Journal — mood and prompts' },
  { num: '05', title: 'Brand — the identity' },
  { num: '06', title: 'Design system' },
  { num: '07', title: 'Under the hood' },
];

// Sample data as the mocks show it. The morning is done, the evening is not.
export const rituals: Ritual[] = [
  {
    name: 'Morning ritual',
    window: 'FROM 6:30 AM',
    summary: '3 of 3 · the morning is yours',
    habits: [
      { name: 'Go to the gym', after: 'After I finish my first coffee', dur: '45 min', done: true },
      {
        name: 'Eat breakfast and protein shake',
        after: 'After go to the gym',
        dur: '25 min',
        done: true,
      },
      {
        name: 'Brush teeth',
        after: 'After eat breakfast and protein shake',
        dur: '2 min',
        done: true,
      },
    ],
  },
  {
    name: 'Evening ritual',
    window: 'FROM 9:00 PM',
    summary: '0 of 3 · winds the day down',
    habits: [
      { name: 'Reflect on the week', after: 'After dinner is cleared', dur: '10 min', done: false },
      { name: 'Prep tomorrow', after: 'After reflect on the week', dur: '5 min', done: false },
      { name: 'Read, no screens', after: 'After prep tomorrow', dur: '20 min', done: false },
    ],
  },
];

// The sample journey from the mocks: "Becoming a Morning Person Who Shows Up".
export const journey = {
  name: 'Becoming a Morning Person Who Shows Up',
  day: 2,
  days: 42,
  phases: [
    {
      num: '1',
      name: 'Foundation',
      weeks: 'Weeks 1–2',
      desc: 'Rebuilding the core morning habits. Gym, breakfast, teeth. Nothing else yet.',
      progress: 14,
      state: 'now',
    },
    {
      num: '2',
      name: 'Expansion',
      weeks: 'Weeks 3–4',
      desc: 'Grow the gym habit. Add a review of tomorrow’s schedule to the stack.',
      progress: 0,
      state: 'next',
    },
    {
      num: '3',
      name: 'Integration',
      weeks: 'Weeks 5–6',
      desc: 'Grow it again. Add a weekly reflection. Everything from earlier phases stays.',
      progress: 0,
      state: 'next',
    },
  ] satisfies Phase[],
};

export const moods: Mood[] = [
  { label: 'Great', glyph: '☀' },
  { label: 'Good', glyph: '⛅' },
  { label: 'Okay', glyph: '☁' },
  { label: 'Rough', glyph: '🌧' },
  { label: 'Hard', glyph: '⛈' },
];

export const journal = {
  greeting: 'How was today, Michael?',
  promptKind: 'PROMPT · GRATITUDE',
  prompt: 'What’s something in your life you often take for granted?',
  shot: journalShot as ImageMetadata,
  shotAlt: 'The Vana journal held in one hand — a mood check-in and a gratitude prompt',
};

// Vana's own palette, read off the mocks. Literal on purpose — it isn't ours.
// TODO: replace with the final brand values once the identity is signed off.
export const swatches: Swatch[] = [
  { name: 'terracotta', hex: '#C8623C', token: 'terracotta', onDark: true },
  { name: 'peach', hex: '#E8B5A2', token: 'peach', onDark: false },
  { name: 'sage', hex: '#6E7D64', token: 'sage', onDark: true },
];
// Paper (#F4EFE8) and ink (#2B2521) are the page ground and the type; the
// wordmark tile's tag carries their values rather than spending two tiles.

/** Placeholder captions for the brand tiles still to be designed. */
export const brandSlots: string[] = ['app icon', 'type specimen', 'app store screens'];

/** Component slots for the design-system chapter. Each one is a real capture to come. */
export const components: string[] = [
  'ritual card',
  'habit row — stacked',
  'phase row',
  'mood chip',
  'tab bar',
  'morning letter',
];

// TODO: placeholder type pairing. The mocks use an editorial serif for
// headings and a humanist sans for UI; name them once the licences are chosen.
export const type = [
  { role: 'DISPLAY', face: 'Editorial serif — TBD', sample: 'Good morning, Michael' },
  { role: 'TEXT', face: 'Humanist sans — TBD', sample: 'After I finish my first coffee · 45 min' },
];

export const engineering: Capability[] = [
  { title: 'Offline first', desc: 'Every check-off lands locally, syncs when it can.' },
  { title: 'Quiet notifications', desc: 'One nudge per ritual. Never after the window closes.' },
  { title: 'The morning letter', desc: 'Drafted overnight from yesterday’s entries and habits.' },
  { title: 'One account, every device', desc: 'Supabase auth and row-level security, per user.' },
];

// TODO: placeholder dates. Update as the build moves.
export const milestones: Milestone[] = [
  { label: 'Product design', when: 'Summer 2026', state: 'done' },
  { label: 'iOS build', when: 'Now', state: 'now' },
  { label: 'TestFlight beta', when: 'Q4 2026', state: 'next' },
  { label: 'App Store', when: '2027', state: 'next' },
];

export const stack: StackGroup[] = [
  { label: 'APP', items: ['React Native', 'Expo', 'TypeScript', 'Reanimated'] },
  { label: 'BACKEND', items: ['Supabase', 'Postgres', 'Edge Functions', 'Resend'] },
  { label: 'CRAFT', items: ['Figma', 'Claude Design', 'Mockuuups', 'TestFlight'] },
];
