/**
 * Navigation Configuration
 *
 * Defines which pages appear in the site navigation and their display order.
 * Astro handles routing via the filesystem — this only controls nav menus.
 *
 * The design has no visible nav bar: the header is the wordmark and a "Menu"
 * button, and these items are what the overlay menu opens onto.
 */

export interface NavItem {
  label: string;
  href: string;
  order: number;
}

export const navItems: NavItem[] = [
  { label: 'Studio', href: '/studio', order: 1 },
  { label: 'Work', href: '/work', order: 2 },
  // "Lab" is the studio's name for the writing; the route stays /blog so
  // the RSS feed, sitemap entries and Pagefind index keep their addresses.
  { label: 'Lab', href: '/blog', order: 3 },
  { label: 'Contact', href: '/contact', order: 4 },
];

/**
 * Get navigation items sorted by order
 */
export function getNavItems(): NavItem[] {
  return [...navItems].sort((a, b) => a.order - b.order);
}
