import { SITE_URL, GOOGLE_SITE_VERIFICATION, BING_SITE_VERIFICATION } from 'astro:env/server';

export interface SiteConfig {
  name: string;
  description: string;
  url: string;
  ogImage: string;
  author: string;
  email: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  socialLinks: string[];
  twitter?: {
    site: string;
    creator: string;
  };
  verification?: {
    google?: string;
    bing?: string;
  };
  /**
   * Branding configuration
   * Logo files: Replace SVGs in src/assets/branding/
   * Favicon: Replace in public/favicon.svg
   */
  branding: {
    /** Logo alt text for accessibility */
    logo: {
      alt: string;
    };
    /** Favicon path (lives in public/) */
    favicon: {
      svg: string;
    };
    /** Theme colors for manifest and browser UI */
    colors: {
      /** Browser toolbar color (hex) */
      themeColor: string;
      /** PWA splash screen background (hex) */
      backgroundColor: string;
    };
  };
  /** Human-readable location — used in the footer and on the contact page. */
  location: string;
  /** Phone in dialable form, for tel: links. */
  phoneHref: string;
  /** The two-character wordmark the whole identity leans on. */
  mark: string;
}

const siteConfig: SiteConfig = {
  name: 'Southwell Media',
  description:
    'Southwell Media is a Dallas studio building original websites, apps and brands — no templates, no themes, shipped in weeks.',
  url: SITE_URL || 'https://southwell.media',
  ogImage: '/og-default.png',
  author: 'Southwell Media',
  email: 'hello@southwellmedia.com',
  phone: '945-397-0408',
  phoneHref: '+19453970408',
  location: 'Dallas, TX',
  mark: 'sw/',
  // TODO: add the street address to promote Organization schema to
  // LocalBusiness. Deliberately absent rather than guessed — a wrong postal
  // address in structured data is worse than none at all.
  // Feeds Organization.sameAs in the JSON-LD.
  socialLinks: [
    'https://www.linkedin.com/in/michael-froseth/',
    'https://github.com/southwellmedia-dev',
  ],
  verification: {
    google: GOOGLE_SITE_VERIFICATION,
    bing: BING_SITE_VERIFICATION,
  },
  branding: {
    logo: {
      alt: 'Southwell Media',
    },
    favicon: {
      svg: '/favicon.svg',
    },
    colors: {
      // Ice — the page ground, so browser chrome matches the site.
      themeColor: '#eef2f4',
      backgroundColor: '#eef2f4',
    },
  },
};

export default siteConfig;
