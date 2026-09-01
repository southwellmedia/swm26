// Content for the Reap Capital case study (/work/reap-capital).
//
// Ported from the Claude Design prototype (Reap Capital Case Study B.dc.html).
// It lives apart from content/work/reap-capital.mdx on purpose: the grid card
// and listings only need the summary that lives there, and this file is
// the long-form story behind it. Every figure below is the prototype's copy —
// confirm each one with the client before launch.

export interface Stat {
  value: string;
  label: string;
}

export interface Chapter {
  num: string;
  title: string;
}

export interface Property {
  name: string;
  meta: string;
  url: string;
  blurb: string;
  /** Initial slider position for the before/after, as a percentage. */
  reveal: number;
  stats: Stat[];
}

export interface Film {
  title: string;
  kind: string;
  dur: string;
}

export interface Capability {
  title: string;
  desc: string;
}

export interface StackGroup {
  label: string;
  items: string[];
}

export const hero = {
  eyebrow: ['( CLIENT STORY )', 'REAP CAPITAL · DALLAS–FORT WORTH', '2024 — 2026'],
  intro:
    'Reap Capital buys underperforming apartment communities across DFW and runs them with one team. Since 2024, that team has included us: the investor platform, every property’s site, the brand, the films, the inbox, and the software behind the leasing office.',
};

// TODO: confirm every figure with Reap before launch.
export const stats: Stat[] = [
  { value: '+212%', label: 'Qualified investor inquiries, year over year' },
  { value: '3.4×', label: 'Tour requests across property sites' },
  { value: '14', label: 'Films shot and cut on Reap properties' },
  { value: '$325M', label: 'AUM represented on one platform' },
];

export const flagship = {
  url: 'https://reapcapital.com',
  intro:
    'A 34% average realized IRR deserved better than a template. We rebuilt the firm’s front door as an investment platform: sixteen deals as a living track record, a founder’s editorial voice, and an invest flow that qualifies before it converts.',
  /** Stripe-placeholder captions for the three detail shots still to come. */
  shots: ['track record grid', 'deal page — Sierra Heights', 'invest flow — mobile'],
  notes: [
    {
      label: '( PROBLEM )',
      text: 'Slow template, stock hero, deal room hidden. Referrals arrived and bounced.',
    },
    {
      label: '( ANSWER )',
      text: 'Track record as database, perspectives as editorial system, qualifying invest flow to IR.',
    },
    { label: '( STACK )', text: 'Astro · React · Tailwind · MDX · Vercel · 38 days to launch.' },
  ],
};

export const chapters: Chapter[] = [
  { num: '02', title: 'Property sites — La Fortuna, The Landry' },
  { num: '03', title: 'Brand system' },
  { num: '04', title: 'Films & showreel' },
  { num: '05', title: 'LucidOS, customized' },
  { num: '06', title: 'Social media' },
  { num: '07', title: 'Email campaigns' },
];

export const properties: Property[] = [
  {
    name: 'la fortuna',
    meta: 'DALLAS · 230 UNITS',
    url: 'fortunaapartments.com',
    reveal: 58,
    blurb:
      'Under new ownership, mid-renovation. Honest photography, hourly availability, a Spanish mirror and an offer published from LucidOS.',
    stats: [
      { value: '17', label: 'Live units synced' },
      { value: '3.9×', label: 'Tour requests' },
      { value: '1.2s', label: 'LCP' },
    ],
  },
  {
    name: 'the landry',
    meta: 'ARLINGTON · 288 UNITS',
    url: 'landryliving.com',
    reveal: 42,
    blurb:
      'Written as one day, morning to night, with a virtual tour path for renters relocating to North Arlington.',
    stats: [
      { value: '288', label: 'Homes, five plans' },
      { value: '2.8×', label: 'Tour requests' },
      { value: '41%', label: 'Leads via virtual tour' },
    ],
  },
];

export const films: Film[] = [
  { title: 'Preferred Equity, Explained', kind: 'Founder series', dur: '6:42' },
  { title: 'La Fortuna — Hero Loop', kind: 'Site film · drone + interiors', dur: '0:48' },
  { title: 'Rescue Capital: Creekside', kind: 'Founder series', dur: '9:15' },
  { title: 'The Landry — A Day Here', kind: 'Property tour', dur: '2:36' },
];

export const lucidos: Capability[] = [
  { title: 'AppFolio sync', desc: 'Hourly units, pricing, dates.' },
  { title: 'Portfolio view', desc: 'Leads and tours, all communities.' },
  { title: 'Offer engine', desc: 'One special, three surfaces.' },
  { title: 'Bilingual', desc: 'ES mirrors from one model.' },
];

/** Placeholder captions for the social grid. Each is a slot for a real post. */
export const posts: string[] = [
  'acquisition — Creekside',
  'founder quote',
  'La Fortuna pool',
  'IRR carousel',
  'Mike on site',
  'Landry dog park',
];

export const stack: StackGroup[] = [
  { label: 'WEB', items: ['Astro', 'React', 'Tailwind', 'MDX', 'Vercel', 'Supabase'] },
  { label: 'PRODUCT', items: ['LucidOS', 'AppFolio API', 'Resend', 'Google Maps'] },
  { label: 'CRAFT', items: ['Sony FX3', 'DJI Mavic 3', 'DaVinci Resolve', 'Figma'] },
];
