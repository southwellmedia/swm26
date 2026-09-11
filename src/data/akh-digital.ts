import type { ImageMetadata } from 'astro';

import phoneGuysCover from '@/assets/work/the-phone-guys/cover.jpg';
import phoneGuys01 from '@/assets/work/the-phone-guys/gallery-01.jpg';
import phoneGuys02 from '@/assets/work/the-phone-guys/gallery-02.jpg';
import phoneGuys03 from '@/assets/work/the-phone-guys/gallery-03.jpg';

import greenDoorFeature from '@/assets/work/green-door/feature.webp';
import greenDoorCover from '@/assets/work/green-door/cover.webp';
import greenDoor01 from '@/assets/work/green-door/gallery-01.webp';
import greenDoor02 from '@/assets/work/green-door/gallery-02.webp';
import greenDoorAppHome from '@/assets/work/green-door/app-home.webp';
import greenDoorAppProperty from '@/assets/work/green-door/app-property.webp';
import greenDoorDashboard from '@/assets/work/green-door/dashboard.webp';

import bigJunkFeature from '@/assets/work/big-junk/feature.webp';
import bigJunkCover from '@/assets/work/big-junk/cover.webp';
import bigJunk01 from '@/assets/work/big-junk/gallery-01.webp';
import bigJunk02 from '@/assets/work/big-junk/gallery-02.webp';

import cirriesFeature from '@/assets/work/cirries/feature.webp';
import cirriesCover from '@/assets/work/cirries/cover.jpg';
import cirries01 from '@/assets/work/cirries/gallery-01.webp';
import cirries02 from '@/assets/work/cirries/gallery-02.jpg';

import kirschFeature from '@/assets/work/allen-kirsch/feature.webp';
import kirschCover from '@/assets/work/allen-kirsch/cover.webp';
import kirsch01 from '@/assets/work/allen-kirsch/gallery-01.webp';
import kirsch02 from '@/assets/work/allen-kirsch/gallery-02.webp';

import reapGcCover from '@/assets/work/reap-construction/cover.jpg';
import reapGc01 from '@/assets/work/reap-construction/gallery-01.jpg';

// Content for the AKH Digital partner story (/work/akh-digital).
//
// Same arrangement as reap-capital.ts. The six projects each keep their own
// case-study page (content/work/<id>.mdx, with `parent: "akh-digital"`), and
// this file tells them as one relationship. Every figure, month and process
// detail below is draft copy — confirm with AKH before launch. Anything
// marked TODO is a slot waiting for the real thing.

export interface Stat {
  value: string;
  label: string;
}

export interface Chapter {
  num: string;
  title: string;
}

export interface Step {
  who: string;
  title: string;
  desc: string;
}

export interface Launch {
  year: string;
  /** Month, or a placeholder until the real date is confirmed. */
  when: string;
  name: string;
  /** Anchor of the chapter on this page. */
  anchor: string;
}

export interface Shot {
  src: ImageMetadata;
  alt: string;
}

export interface Product {
  /** WEBSITE, CREW APP, DASHBOARD — the mono label over the tile. */
  kind: string;
  name: string;
  desc: string;
  shot: Shot;
}

export interface Project {
  /** Matches the id of the project's own entry in content/work. */
  id: string;
  num: string;
  /** Client name as the eyebrow reads it, e.g. "THE PHONE GUYS · 2025". */
  eyebrow: string;
  /** Short name for the sticky index. */
  index: string;
  /** The two halves of the chapter headline. */
  title: [string, string];
  intro: string;
  /** The lead capture — the device mockup. */
  main: Shot;
  /** Further captures under it. Three read as one row; four as a 2×2. */
  shots: Shot[];
  /**
   * A build that shipped as more than one product. Rendered as a strip of
   * tiles under the lead capture, in place of the plain captures.
   */
  products?: Product[];
  services: string[];
  /** The domain as it should read on the page. Display only. */
  domain?: string;
  url?: string;
  /**
   * Every live site the build shipped, when there is more than one. Each
   * gets its own button, labelled by domain; `url` stays the lead capture's
   * link. Omit for a single site and the button reads "Visit the site".
   */
  sites?: { domain: string; url: string }[];
  stats: Stat[];
}

export interface StackGroup {
  label: string;
  items: string[];
}

export const hero = {
  eyebrow: ['PARTNER STORY', 'AKH DIGITAL · DALLAS', '2026'],
  // TODO: draft copy — confirm how AKH describes the relationship.
  intro:
    'AKH Digital is a Dallas agency with clients who need more than a template. This year we have been the studio behind their builds: they bring the client, the strategy and the brand; we design and build the site, the platform, sometimes the software. Six launches in one year, and none of them look alike.',
};

// TODO: placeholder figures. Confirm with AKH before launch.
export const stats: Stat[] = [
  { value: '6', label: 'Launches shipped together in 2026' },
  { value: '5', label: 'Industries — trades, tech, hospitality, interiors, construction' },
  { value: '2', label: 'Custom platforms alongside the sites: a CRM and a crew operations app' },
  { value: '1', label: 'Shared process, from the first brief to managed hosting' },
];

// TODO: draft — confirm who does what with AKH.
export const steps: Step[] = [
  {
    who: 'AKH',
    title: 'The brief',
    desc: 'AKH owns the client relationship: the positioning, the brand direction, the goals the site has to hit.',
  },
  {
    who: 'SOUTHWELL',
    title: 'The build',
    desc: 'We design and build. Custom on Astro when the work needs it, on Aether when speed matters more than novelty.',
  },
  {
    who: 'TOGETHER',
    title: 'The launch',
    desc: 'One launch checklist, shared analytics, and hosting we manage so the site is as fast in year two as on day one.',
  },
];

// TODO: months are placeholders. Order is right; dates need confirming.
export const launches: Launch[] = [
  { year: '2026', when: 'JAN', name: 'The Phone Guys', anchor: 'ws-02' },
  { year: '2026', when: 'MAR', name: 'Green Door', anchor: 'ws-03' },
  { year: '2026', when: 'APR', name: 'Big Junk', anchor: 'ws-04' },
  { year: '2026', when: 'JUN', name: 'Cirries', anchor: 'ws-05' },
  { year: '2026', when: 'JUL', name: 'Allen Kirsch', anchor: 'ws-06' },
  { year: '2026', when: 'SEP', name: 'Reap Construction', anchor: 'ws-07' },
];

export const chapters: Chapter[] = [
  { num: '02', title: 'The Phone Guys — CRM and website' },
  { num: '03', title: 'Green Door — site, crew app and dashboard' },
  { num: '04', title: 'Big Junk — service platform' },
  { num: '05', title: 'Cirries — enterprise rebuild' },
  { num: '06', title: 'Allen Kirsch — three sites, two languages' },
  { num: '07', title: 'Reap Construction — capabilities site' },
];

// Chronological. Every stat is a placeholder until the client confirms it.
export const projects: Project[] = [
  {
    id: 'the-phone-guys',
    num: '02',
    eyebrow: 'THE PHONE GUYS · 2026',
    index: 'The Phone Guys',
    title: ['tickets,', 'tamed.'],
    intro:
      'The first build together, and the one that set the pattern. A repair shop drowning in walk-ins and text messages needed a system, not a website. We built both: a custom CRM with intake forms on the front, tickets and appointments on the back, and a brand to hold it together.',
    main: { src: phoneGuysCover, alt: 'The Phone Guys CRM dashboard on a monitor' },
    shots: [
      { src: phoneGuys01, alt: 'The Phone Guys — ticket detail' },
      { src: phoneGuys02, alt: 'The Phone Guys — intake form' },
      { src: phoneGuys03, alt: 'The Phone Guys — appointments' },
    ],
    services: ['Custom Website', 'Custom CRM', 'Branding', 'Onboarding'],
    stats: [
      { value: '1', label: 'System for tickets, customers and appointments' },
      { value: '3', label: 'Intake forms feeding one queue' },
      { value: '0', label: 'Spreadsheets left' },
    ],
  },
  {
    id: 'green-door',
    num: '03',
    eyebrow: 'GREEN DOOR · 2026',
    index: 'Green Door',
    title: ['website, app,', 'dashboard.'],
    intro:
      'Valet trash for multifamily communities: sold to property managers, delivered by crews at night. AKH brought the client. We built all three pieces of the business — the website that wins the contract, the app the crew runs the route on, and the dashboard the office runs the company from.',
    main: {
      src: greenDoorAppHome,
      alt: 'The Green Door crew app mid-shift: clocked in at a property, route tracking active',
    },
    shots: [],
    products: [
      {
        kind: 'WEBSITE',
        name: 'greendoorstep.com',
        desc: 'The pitch. Photographed crews, a service map, and a proposal request that lands in the right inbox.',
        shot: { src: greenDoorCover, alt: 'The Green Door website on a laptop' },
      },
      {
        kind: 'CREW APP · iOS',
        name: 'The route',
        desc: 'Clock in inside the property boundary, GPS while the shift is live, a photo before a stop counts, violations logged on the spot.',
        shot: {
          src: greenDoorAppProperty,
          alt: 'A property in the crew app: service window, notes and shift history',
        },
      },
      {
        kind: 'OPERATIONS DASHBOARD',
        name: 'The office',
        desc: 'Replay any shift on a map. Review violations and resident tickets. Run pay and reports off the same records.',
        shot: {
          src: greenDoorDashboard,
          alt: 'The Green Door operations dashboard replaying a shift on a map',
        },
      },
    ],
    services: ['Custom Website', 'Crew App', 'Operations Dashboard', 'UI/UX'],
    domain: 'greendoorstep.com',
    url: 'https://greendoorstep.com',
    stats: [
      { value: '2', label: 'Products beyond the site: a crew app and an operations dashboard' },
      { value: '10s', label: 'Between GPS pings while a shift is live' },
      { value: 'TBD', label: 'Properties on the route' },
    ],
  },
  {
    id: 'big-junk',
    num: '04',
    eyebrow: 'BIG JUNK · 2026',
    index: 'Big Junk',
    title: ['book the truck', 'in a minute.'],
    intro:
      'Junk removal is bought in a hurry, usually from a phone, usually on a Saturday. Everything on the site serves that: a price-from grid, a booking flow that asks four questions, and photography that makes a full truck look like relief.',
    main: { src: bigJunkCover, alt: 'The Big Junk homepage on a laptop' },
    shots: [
      { src: bigJunkFeature, alt: 'A kerbside pile before a Big Junk pickup' },
      { src: bigJunk01, alt: 'Big Junk — pricing' },
      { src: bigJunk02, alt: 'Big Junk — booking flow' },
    ],
    services: ['Custom Website', 'UI/UX', 'Lead Generation'],
    domain: 'bigjunk.com',
    url: 'https://bigjunk.com',
    stats: [
      { value: '4', label: 'Questions to a booked pickup' },
      { value: 'TBD', label: 'Bookings from mobile' },
      { value: 'TBD', label: 'Cost per lead, paid search' },
    ],
  },
  {
    id: 'cirries',
    num: '05',
    eyebrow: 'CIRRIES TECHNOLOGIES · 2026',
    index: 'Cirries',
    title: ['enterprise,', 'made legible.'],
    intro:
      'The biggest build of the partnership. A network observability company selling to enterprise buyers had a site that undermined the product. We rebuilt it from the ground up around how they sell: simulated dashboards a prospect can feel, animated explanations of hard concepts, and a demo request flow that qualifies.',
    main: { src: cirriesCover, alt: 'The Cirries homepage on a laptop' },
    shots: [
      { src: cirriesFeature, alt: 'Cirries — global network visualisation' },
      { src: cirries01, alt: 'Cirries — dashboard simulation' },
      { src: cirries02, alt: 'Cirries — demo request' },
    ],
    services: ['Custom Website', 'UI/UX', 'Custom Platform'],
    domain: 'cirries.com',
    url: 'https://cirries.com',
    stats: [
      { value: 'TBD', label: 'Demo requests, quarter over quarter' },
      { value: '3', label: 'Interactive product simulations' },
      { value: 'TBD', label: 'Lighthouse performance' },
    ],
  },
  {
    id: 'allen-kirsch',
    num: '06',
    eyebrow: 'ALLEN KIRSCH · 2026',
    index: 'Allen Kirsch',
    title: ['three sites', 'that whisper.'],
    // TODO: confirm the languages and what each site carries.
    intro:
      'An interior designer whose Paris apartment ran in Architectural Digest needed more than a portfolio. We built three sites on one design system: the design practice, a separate home for the artwork, and a Paris edition, all internationalised so the same pages read in English and French. Almost no interface: large photography, an editorial rhythm, type that steps out of the way. The hardest brief of the six was to do less, three times over.',
    main: { src: kirschCover, alt: 'The Allen Kirsch portfolio on a laptop' },
    shots: [
      { src: kirschFeature, alt: 'A dining room by Allen Kirsch with a hand-painted mural' },
      { src: kirsch01, alt: 'Allen Kirsch — project page' },
      { src: kirsch02, alt: 'Allen Kirsch — press' },
    ],
    services: ['Three Custom Websites', 'UI/UX', 'Editorial', 'i18n'],
    domain: 'allenkirsch.com',
    url: 'https://allenkirsch.com/',
    sites: [
      { domain: 'allenkirsch.com', url: 'https://allenkirsch.com/' },
      { domain: 'allenkirschart.com', url: 'https://allenkirschart.com/' },
      { domain: 'paris.allenkirsch.com', url: 'https://paris.allenkirsch.com/' },
    ],
    stats: [
      { value: '3', label: 'Sites on one design system' },
      { value: '2', label: 'Languages, English and French' },
      { value: '1', label: 'Architectural Digest feature' },
    ],
  },
  {
    id: 'reap-construction',
    num: '07',
    eyebrow: 'REAP CONSTRUCTION · 2026',
    index: 'Reap Construction',
    title: ['capabilities,', 'on the record.'],
    intro:
      'A general contractor that renovates the multifamily communities its parent company buys. The site is a capabilities statement first: the scope of work, the completed projects, the team. Built on Aether so it shipped in weeks and shares a spine with the Reap Capital platform.',
    main: { src: reapGcCover, alt: 'The Reap Construction homepage on a laptop' },
    shots: [{ src: reapGc01, alt: 'Reap Construction — completed work' }],
    services: ['Custom Website', 'UI/UX', 'Built With Aether'],
    domain: 'reapgc.com',
    url: 'https://reapgc.com',
    stats: [
      { value: 'TBD', label: 'Weeks to launch' },
      { value: 'TBD', label: 'Projects documented' },
      { value: '1', label: 'Shared design spine with Reap Capital' },
    ],
  },
];

export const stack: StackGroup[] = [
  { label: 'WEB', items: ['Astro', 'React', 'Tailwind', 'MDX', 'Vercel'] },
  { label: 'PLATFORM', items: ['Aether', 'Supabase', 'Postgres', 'Resend'] },
  { label: 'CRAFT', items: ['Figma', 'Claude Design', 'Mockuuups', 'Sony FX3'] },
];
