import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

// Blog collection with Content Layer API
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().max(100),
      description: z.string().max(200),
      publishedAt: z.coerce.date(),
      updatedAt: z.coerce.date().optional(),
      author: z.string().default('Team'),
      image: image().optional(),
      imageAlt: z.string().optional(),
      tags: z.array(z.string()).default([]),
      /** Editorial grouping carried over from the previous site. */
      category: z.string().optional(),
      draft: z.boolean().default(false),
      featured: z.boolean().default(false),
      locale: z.enum(['en', 'es', 'fr']).default('en'),
    }),
});

// Pages collection for static pages
const pages = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updatedAt: z.coerce.date().optional(),
    locale: z.enum(['en', 'es', 'fr']).default('en'),
  }),
});

// Authors collection
const authors = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/authors' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      bio: z.string(),
      avatar: image().optional(),
      social: z
        .object({
          twitter: z.string().optional(),
          github: z.string().optional(),
          linkedin: z.string().optional(),
        })
        .optional(),
    }),
});

// FAQs collection (for JSON-LD FAQ schema)
const faqs = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/faqs' }),
  schema: z.object({
    question: z.string(),
    answer: z.string(),
    category: z.string().optional(),
    order: z.number().default(0),
    locale: z.enum(['en', 'es', 'fr']).default('en'),
  }),
});

// Work collection — the studio's projects.
//
// This replaces the hand-maintained `projects` array the homepage grid used to
// read from, so a project is now one file that feeds the homepage grid, the
// /work index and its own case-study page.
const work = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/work' }),
  schema: ({ image }) =>
    z.object({
      /** Project name, set at display size over the card. */
      title: z.string().max(60),
      /** The small mono label in the corner of the card, e.g. "WEB + BRAND". */
      discipline: z.string().max(40),
      /** One line, used for cards, listings and meta description. */
      description: z.string().max(200),
      client: z.string().optional(),
      year: z.number().int().optional(),
      services: z.array(z.string()).default([]),
      /** Live site, if the work is public. */
      url: z.url().optional(),
      /**
       * The resting card image — a photograph or brand shot rather than a
       * screen. The mockup in `cover` is what the card reveals on hover.
       * Without a feature, the cover simply sits there and nothing swaps.
       */
      feature: image().optional(),
      /** The device mockup. Revealed on hover when a `feature` is set. */
      cover: image().optional(),
      coverAlt: z.string().optional(),
      /** Further captures, shown down the case-study page. */
      gallery: z.array(z.object({ src: image(), alt: z.string().optional() })).default([]),
      /** Caption for the striped placeholder standing in for the capture. */
      placeholder: z.string().optional(),
      /** The two halves of a case study, when they have been written. */
      challenge: z.string().optional(),
      solution: z.string().optional(),
      technologies: z.array(z.string()).default([]),
      features: z.array(z.string()).default([]),
      /** e.g. a partnership credit, shown by the project title. */
      badge: z.string().optional(),
      /**
       * The project has a hand-built story page at pages/work/<id>.astro.
       * The generic [...slug] template skips it; the grid still links to it.
       */
      story: z.boolean().default(false),
      /** Lower sorts first — the homepage grid takes the first several. */
      order: z.number().default(99),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
    }),
});

export const collections = {
  blog,
  pages,
  authors,
  faqs,
  work,
};
