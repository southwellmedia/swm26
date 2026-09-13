import { defineConfig, envField } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import icon from 'astro-icon';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: process.env.SITE_URL || 'https://southwell.media',

  env: {
    schema: {
      SITE_URL: envField.string({ context: 'server', access: 'public', optional: true }),
      PUBLIC_GA_MEASUREMENT_ID: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_GTM_ID: envField.string({ context: 'client', access: 'public', optional: true }),
      CONTACT_FORM_ENDPOINT: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      NEWSLETTER_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_SITE_VERIFICATION: envField.string({
        context: 'server',
        access: 'public',
        optional: true,
      }),
      BING_SITE_VERIFICATION: envField.string({
        context: 'server',
        access: 'public',
        optional: true,
      }),
      PUBLIC_GOOGLE_MAPS_API_KEY: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
        default: '',
      }),
      PUBLIC_CONSENT_ENABLED: envField.boolean({
        context: 'client',
        access: 'public',
        optional: true,
        default: false,
      }),
      PUBLIC_PRIVACY_POLICY_URL: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
        default: '',
      }),
    },
  },

  image: {
    layout: 'constrained',
  },

  // ClientRouter swaps pages client-side; without prefetch every swap is a
  // cold fetch while the old page stays painted. Prefetch on hover by default,
  // for every internal link.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },

  integrations: [
    react(),
    mdx(),
    sitemap(),
    // Iconify sets, inlined as SVG at build time - only the icons actually
    // referenced end up in the output, and none of it ships JavaScript.
    // Lucide for UI glyphs; Font Awesome brands for real logos (LinkedIn,
    // GitHub), which Lucide only approximates; Font Awesome solid for the
    // handset in the nav.
    icon({
      include: {
        lucide: ['*'],
        'fa6-brands': ['linkedin-in', 'github'],
        // The handset in the nav; the arrows, envelope and pin in the menu.
        'fa6-solid': ['phone', 'arrow-right-long', 'envelope', 'location-dot'],
      },
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  security: {
    checkOrigin: true,
  },

  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
});
