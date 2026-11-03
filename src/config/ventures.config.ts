/**
 * What Michael builds alongside the studio.
 *
 * One list for the studio page's "Also building" section and the footer's
 * column, so a name, a link or a role only ever changes here.
 *
 * Logos live in public/ventures/, each in the version its own site uses on
 * a dark ground: the studio shows them on ink tiles. Velocity's is a mark
 * with no wordmark, so the tile sets the name beside it (`wordmark`).
 */
export interface Venture {
  name: string;
  /** Michael's part in it. */
  role: string;
  href: string;
  /** The address as shown, without the protocol. */
  domain: string;
  /** What it is, in one line. */
  what: string;
  logo: string;
  /** Logo width on the tile relative to a full wordmark: marks are smaller. */
  logoScale: number;
  /** Set beside a mark-only logo. */
  wordmark?: string;
  /** The brand's own colour, for the glow behind the logo. */
  accent: string;
}

export const ventures: Venture[] = [
  {
    name: 'LucidOS',
    role: 'Engineer',
    href: 'https://www.lucidcre.com',
    domain: 'lucidcre.com',
    what: 'The operating system for commercial real estate, in production across thousands of units.',
    logo: '/ventures/lucidos.svg',
    logoScale: 1,
    accent: '#eb482b',
  },
  {
    name: 'MAD Stack',
    role: 'Co-founder',
    href: 'https://www.madstack.io',
    domain: 'madstack.io',
    what: 'AI-built prototypes, rebuilt for production. Founded with Reap Capital and AKH Digital.',
    logo: '/ventures/madstack.svg',
    logoScale: 1,
    accent: '#d48300',
  },
  {
    name: 'Velocity',
    role: 'Creator · Open source',
    href: 'https://www.deployvelocity.com',
    domain: 'deployvelocity.com',
    what: 'The open-source Astro 6 starter kit this site is built on.',
    logo: '/ventures/velocity.svg',
    logoScale: 0.28,
    wordmark: 'Velocity',
    accent: '#ee4000',
  },
];
