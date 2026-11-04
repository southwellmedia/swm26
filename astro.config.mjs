import { defineConfig, envField, memoryCache } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import icon from 'astro-icon';
import tailwindcss from '@tailwindcss/vite';
import pagefind from './integrations/pagefind.mjs';
import { resolveDeployTarget } from './integrations/deploy-target.mjs';
import { defaultLocale, locales } from './src/i18n/locales.mjs';
import { routes } from './src/config/nav.config.ts';

/**
 * Deploy target: auto-detected from the build environment (Vercel, Netlify,
 * Cloudflare), or forced with DEPLOY_TARGET=node|vercel|netlify|cloudflare.
 * Pages stay prerendered (static) by default — the adapter only powers
 * on-demand routes such as Astro Actions (contact + newsletter forms).
 */
const target = await resolveDeployTarget();

// Search results are noindex, so keep them out of the sitemap in every language
const searchPages = new Set(
  locales.map((locale) => {
    const slug = routes.search?.slugs?.[locale] ?? routes.search?.path ?? 'search';
    return locale === defaultLocale ? `/${slug}/` : `/${locale}/${slug}/`;
  }),
);

export default defineConfig({
  site: process.env.SITE_URL || 'https://www.southwellmedia.com',

  // Locales come from src/i18n/locales.mjs (one list for routing, UI and sitemap).
  // The default locale has no URL prefix; others live under /<locale>/.
  i18n: {
    defaultLocale,
    locales: [...locales],
    routing: { prefixDefaultLocale: false },
  },

  adapter: target.adapter,

  // Velocity doesn't use Astro sessions. Opting out (Astro 7.2+) stops adapters
  // from provisioning session storage. Remove this line to use Astro.session.
  session: false,

  // Astro 7 defaults to 'jsx', which strips whitespace between inline elements
  // (e.g. `<a>Docs</a> <a>Blog</a>` renders as "DocsBlog"). Velocity's components
  // are authored with HTML whitespace semantics, so we keep the Astro 6 behavior.
  compressHTML: true,

  env: {
    schema: {
      SITE_URL: envField.string({ context: 'server', access: 'public', optional: true }),
      // The contact endpoint mails through Resend. Without the key, dev logs
      // the message and accepts it; production refuses it.
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      CONTACT_TO: envField.string({
        context: 'server',
        access: 'public',
        optional: true,
        default: 'hello@southwellmedia.com',
      }),
      // A sender on a domain verified in Resend.
      CONTACT_FROM: envField.string({
        context: 'server',
        access: 'public',
        optional: true,
        default: 'Southwell Media <hello@southwellmedia.com>',
      }),
      PUBLIC_GA_MEASUREMENT_ID: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_GTM_ID: envField.string({ context: 'client', access: 'public', optional: true }),
      CONTACT_FORM_ENDPOINT: envField.string({ context: 'server', access: 'secret', optional: true }),
      NEWSLETTER_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_SITE_VERIFICATION: envField.string({ context: 'server', access: 'public', optional: true }),
      BING_SITE_VERIFICATION: envField.string({ context: 'server', access: 'public', optional: true }),
      PUBLIC_GOOGLE_MAPS_API_KEY: envField.string({ context: 'client', access: 'public', optional: true, default: '' }),
      PUBLIC_CONSENT_ENABLED: envField.boolean({ context: 'client', access: 'public', optional: true, default: false }),
      PUBLIC_PRIVACY_POLICY_URL: envField.string({ context: 'client', access: 'public', optional: true, default: '' }),
    },
  },

  // Route caching (stable in Astro 7). Applies to on-demand routes; prerendered
  // pages are already static. On Vercel/Netlify the provider writes CDN cache
  // headers and supports tag invalidation; elsewhere an in-memory LRU is used.
  cache: {
    provider: target.cacheProvider ?? memoryCache(),
  },

  // Prefetch every internal link on hover. This used to come implicitly with
  // <ClientRouter />; native view transitions + prefetch give the same snappy
  // navigation without a client-side router.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },

  image: {
    layout: 'constrained',
  },

  // The about page's old address, kept alive as a permanent redirect.
  redirects: {
    '/studio': { status: 301, destination: '/about' },
  },

  integrations: [
    react(),
    mdx(),
    sitemap({
      filter: (page) => !searchPages.has(new URL(page).pathname),
      ...(locales.length > 1
        ? { i18n: { defaultLocale, locales: Object.fromEntries(locales.map((l) => [l, l])) } }
        : {}),
    }),
    pagefind(),
    // Iconify sets, inlined as SVG at build time: only the icons actually
    // referenced end up in the output, and none of it ships JavaScript.
    icon({
      include: {
        lucide: ['*'],
        'fa6-brands': ['linkedin-in', 'github'],
        // The handset in the nav; the arrows, envelope and pin in the menu;
        // the chat bubble and calendar in the sign-off buttons.
        'fa6-solid': ['phone', 'arrow-right-long', 'envelope', 'location-dot', 'comment', 'calendar'],
      },
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  // The site runs on the ClientRouter: the nav, the reel, Motion and Lenis all
  // follow its lifecycle. Astro's CSP doesn't support it, so CSP stays off until
  // those move to native view transitions. Velocity's upgrade guide, step 5.
  security: {
    checkOrigin: true,
    csp: false,
  },

  markdown: {
    shikiConfig: {
      // github-dark-default: same GitHub look as github-dark, but its comment colour
      // passes WCAG AA (github-dark's #6a737d comments are 3.0:1).
      theme: 'github-dark-default',
      wrap: true,
    },
  },
});
