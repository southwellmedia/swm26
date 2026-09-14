import type { ImageMetadata } from 'astro';
import fortunaShot from '@/assets/work/reap-capital/fortuna-mockup.webp';
import landryShot from '@/assets/work/reap-capital/landry-mockup.webp';
import shotTrackRecord from '@/assets/work/reap-capital/shot-track-record.webp';
import shotHomeMobile from '@/assets/work/reap-capital/shot-home-mobile.webp';
import shotInvest from '@/assets/work/reap-capital/shot-invest.webp';

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
  /** The domain as it should read on the page. Display only. */
  url: string;
  /** Where the pane actually goes — a preview URL while a domain is pending. */
  href: string;
  /** Set while `url` isn't serving the new site yet. */
  status?: string;
  blurb: string;
  /** The site on a laptop — a Mockuuups composite of the live homepage. */
  shot: ImageMetadata;
  shotAlt: string;
  stats: Stat[];
}

export interface Film {
  /** YouTube video id — the `g43k2Psr8dQ` in youtube.com/watch?v=… */
  id: string;
  title: string;
  kind: string;
  dur: string;
}

export interface StackGroup {
  label: string;
  items: string[];
}

export const hero = {
  eyebrow: ['CLIENT STORY', 'REAP CAPITAL · DALLAS–FORT WORTH', '2024 — 2026'],
  intro:
    'Reap Capital buys underperforming apartment communities across DFW and runs them with one team. Since 2024, that team has included us: the investor platform, every property’s site, the films, the inbox, and the software behind the leasing office.',
};

// TODO: confirm every figure with Reap before launch.
export const stats: Stat[] = [
  { value: '+212%', label: 'Qualified investor inquiries, year over year' },
  { value: '3.4×', label: 'Tour requests across property sites' },
  { value: '16', label: 'Deals published as a living track record' },
  { value: '$325M', label: 'AUM represented on one platform' },
];

export const flagship = {
  url: 'https://reapcapital.com',
  intro:
    'A 34% average realized IRR deserved better than a template. We rebuilt the firm’s front door as an investment platform: sixteen deals as a living track record, a founder’s editorial voice, and an invest flow that qualifies before it converts.',
  /** The three detail shots under the cover: device mockups of the live site. */
  shots: [
    {
      image: shotTrackRecord,
      alt: 'The track record page on a laptop, in front of a rainy city window',
    },
    { image: shotHomeMobile, alt: 'The homepage hero on a phone, held in one hand' },
    { image: shotInvest, alt: 'The invest section and footer on a tablet, on a desk' },
  ] as { image: ImageMetadata; alt: string }[],
  notes: [
    {
      label: 'PROBLEM',
      text: 'Slow template, stock hero, deal room hidden. Referrals arrived and bounced.',
    },
    {
      label: 'ANSWER',
      text: 'Track record as database, perspectives as editorial system, qualifying invest flow to IR.',
    },
    { label: 'STACK', text: 'Astro · React · Tailwind · MDX · Vercel · 38 days to launch.' },
  ],
};

export const chapters: Chapter[] = [
  { num: '02', title: 'Property sites — La Fortuna, The Landry' },
  { num: '03', title: 'Films — the founder series' },
  { num: '04', title: 'Social media' },
  { num: '05', title: 'Email campaigns' },
];

// The shots are laptop mockups of the live homepages. Both are landscape 4:3
// so the pair reads as one row; the frame crops them to 16:10 from the centre,
// which keeps every screen fully inside the crop.
export const properties: Property[] = [
  {
    name: 'la fortuna',
    meta: 'DALLAS · 230 UNITS',
    url: 'fortunaapartments.com',
    href: 'https://www.fortunaapartments.com/',
    blurb:
      'Under new ownership, mid-renovation. Honest photography, hourly availability, a Spanish mirror and an offer published from LucidOS.',
    shot: fortunaShot,
    shotAlt: 'The La Fortuna homepage open on a laptop',
    stats: [
      { value: '17', label: 'Live units synced' },
      { value: '3.9×', label: 'Tour requests' },
      { value: '1.2s', label: 'LCP' },
    ],
  },
  {
    // landryliving.com still resolves to the old template — the domain hasn't
    // cut over yet, so the pane links to the build and says so.
    name: 'the landry',
    meta: 'ARLINGTON · 288 UNITS',
    url: 'landryliving.com',
    href: 'https://landry26.vercel.app/',
    status: 'launching',
    blurb:
      'Written as one day, morning to night, with a virtual tour path for renters relocating to North Arlington.',
    shot: landryShot,
    shotAlt: 'The Landry homepage open on a laptop',
    stats: [
      { value: '288', label: 'Homes, five plans' },
      { value: '2.8×', label: 'Tour requests' },
      { value: '41%', label: 'Leads via virtual tour' },
    ],
  },
];

// What has actually shipped. films[0] is the one the section plays; anything
// added after it lists underneath the player. One film so far — resist the
// urge to pad this with the ones still in the edit.
export const films: Film[] = [
  {
    id: 'g43k2Psr8dQ',
    title: 'Pref Equity — How Is Your Investment Protected',
    kind: 'Founder series · August 2026',
    dur: '1:08',
  },
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
