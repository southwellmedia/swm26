/**
 * Footer link columns
 *
 * The designed footer is three labelled columns, not Velocity's generic
 * social-icon row — so it carries its own list rather than reusing
 * nav.config.ts, which only describes the overlay menu.
 */
import siteConfig from './site.config';

export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
  /** Iconify icon name with its set prefix, e.g. `lucide:mail` or
   *  `fa6-brands:github`. Brand marks use fa6-brands; UI glyphs use lucide. */
  icon?: string;
}

export interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

export const footerColumns: FooterColumn[] = [
  {
    heading: 'MENU',
    links: [
      { label: 'Studio', href: '/studio' },
      { label: 'Work', href: '/work' },
      { label: 'Lab', href: '/blog' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'SOCIAL',
    links: [
      {
        label: 'LinkedIn',
        href: 'https://www.linkedin.com/in/michael-froseth/',
        external: true,
        icon: 'fa6-brands:linkedin-in',
      },
      {
        label: 'GitHub',
        href: 'https://github.com/southwellmedia-dev',
        external: true,
        icon: 'fa6-brands:github',
      },
    ],
  },
  {
    heading: 'SAY HI',
    links: [
      { label: siteConfig.email, href: `mailto:${siteConfig.email}`, icon: 'lucide:mail' },
      { label: siteConfig.phone ?? '', href: `tel:${siteConfig.phoneHref}`, icon: 'lucide:phone' },
    ],
  },
];
