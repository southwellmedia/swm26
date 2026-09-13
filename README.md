# Southwell Media — site

The studio site, built on [Velocity](https://www.deployvelocity.com) (Astro 6 +
Tailwind v4). The visual design is the one from the Claude Design prototype
(`Southwell Homepage.dc.html`) — ink on ice, Archivo, giant type — expressed
through Velocity's design-token system rather than as standalone CSS.

## Commands

```bash
pnpm install
pnpm dev        # local dev server at http://localhost:4321
pnpm build      # static build to dist/, then the Pagefind index
pnpm preview    # serve the build (the only way to test search locally)
pnpm check      # astro + TypeScript diagnostics
pnpm lint       # eslint
pnpm validate   # lint + check + build
```

Search only works against a build. `pnpm dev` has no Pagefind index, so the
search field on `/blog` hides itself rather than showing up broken.

## Where things live

```
src/
  config/
    site.config.ts        name, contact, branding, verification
    nav.config.ts         the four overlay-menu items
    footer.config.ts      the three footer columns
    services.config.ts    the four scroll-stacking service cards
  content/
    work/*.mdx            one file per project — feeds the homepage grid,
                          /work, and each case-study page
  data/
    reap-capital.ts       long-form content for the Reap Capital story page
    blog/en/*.mdx         Lab posts
  components/
    site/                 Nav (+ overlay menu), Footer, PillButton, Placeholder,
                          BeforeAfter (the slider on the Reap Capital story)
    sections/             Hero, WorkGrid, Services, Cta, SectionHead
    ui/ seo/ layout/      Velocity's own components, untouched
  layouts/
    SiteLayout.astro      BaseLayout + the studio nav and footer
  styles/
    themes/southwell.css  the theme: ink-on-ice mapped onto Velocity's contract
    southwell.css         site-level extras — display type, reveals, shell
  pages/
    index / studio / work / work/[slug] / blog / contact / 404
    work/reap-capital     hand-built story page; [slug] skips it (story: true)
```

## The design system

**Three tiers, as Velocity intends them.**

1. **Primitives** — `styles/tokens/primitives.css` gained an `--ink-*` /
   `--ice-*` scale. Kept as hex, not converted to OKLCH, because these are the
   exact values signed off in the prototype.
2. **Semantic** — `styles/themes/southwell.css` implements the full Velocity
   theme contract against them, light and dark. Because it satisfies the
   contract, every stock Velocity component (Button, Input, Card, the blog
   templates) is already on-brand; none of them were restyled by hand.
3. **Component** — the same file defines the four service-card colourways
   (`--service-*`) and the work-card media well (`--work-media-bg`), so those
   re-map themselves in dark mode instead of being hard-coded.

**The brand ramp is remapped.** Velocity ships an International Orange
`--brand-*` scale. This identity has no accent colour — the brand is the ink —
so the theme remaps `--brand-50…900` onto ice-to-ink. Anything reaching for
`brand-500` lands on-brand automatically.

**Layout.** Content sits in `.shell` — `max-width: var(--shell-max)` (1440px),
centred, with `--gutter` as side padding. Backgrounds stay full-bleed: the nav
bar's frosted panel and the footer slab reach the viewport edges while their
contents line up with everything else. Change `--shell-max` in
`styles/southwell.css` to retune the whole site.

**What stayed as CSS.** Three things Tailwind cannot express cleanly, all in
`styles/southwell.css`: the viewport-relative display type scale
(`.display-hero` and friends), the scroll-driven reveal system, and the striped
placeholders. Component-specific behaviour — the sticky service stack, the card
hover-zoom, the hero load-in — stays in scoped `<style>` blocks.

## Notes carried over from the prototype

**Reveals** are CSS scroll-driven animations (`animation-timeline: view()`), not
an IntersectionObserver — deliberately, since the JS version left cards stuck at
`opacity: 0` when it failed to re-run. Browsers without scroll timelines render
everything visible via the `@supports` fallback, and `prefers-reduced-motion`
disables the motion entirely.

**Service stacking** uses `position: sticky` with a top offset stepping down
20px per card. Below 800px the cards fall back to normal flow — a card taller
than a phone viewport cannot stack cleanly. `body` uses `overflow-x: clip`
rather than `hidden`, which would make the body a scroll container and break the
sticky behaviour.

**Placeholders.** Every striped box is a slot for a real 3D render or project
capture. On a work card, adding `cover:` to the project's frontmatter swaps in
an `<Image>` and keeps the hover-zoom as-is.

## What is new here, beyond the prototype

- **The menu works.** The prototype's Menu button was inert because no menu had
  been designed. It now opens a full-screen overlay built from `nav.config.ts`,
  with Escape-to-close, `inert` when shut, and the theme toggle in its foot. If
  JavaScript never runs the overlay stays inert and the footer carries the same
  links.
- **Dark mode**, via the theme contract. The identity is already monochrome, so
  the ground flips to ink and the type to ice. Service card 03 still breaks the
  pattern — it goes to ice while the others go to ink.
- **Work is a collection**, not an array in a data file, with a case-study page
  per project.
- **Pages the prototype never had**: `/studio`, `/work`, `/work/<slug>`,
  `/contact`, `/blog`, `404`.
- **Client stories.** `/work/reap-capital` is the first hand-built case study,
  ported from `Reap Capital Case Study B.dc.html` in Claude Design. A project
  opts in with `story: true` in its MDX frontmatter: `work/[...slug].astro`
  then skips it (Astro would otherwise build two pages to one path) and
  `pages/work/<id>.astro` owns the URL. The whole story sits on ink — you
  leave the ice site, drop into the story, and the Cta hands you back — so
  `SiteLayout` takes `navTone="dark"`, which makes the nav frost to ink
  rather than the page ground. The long-form content lives in
  `src/data/reap-capital.ts`, apart from the summary the grid reads from the
  MDX. Every figure in it is the prototype's draft copy: confirm with Reap
  before launch. `BeforeAfter.astro` takes optional `before` / `after` images and
  shows flat colour until they land.

## Still to do

- **Assets.** Every render and project capture is still a striped placeholder.
  On the Reap Capital story that means the
  brand tiles, the reel, the social and email tiles, and the before/after
  captures for La Fortuna and The Landry.
- **Case-study copy.** The six work entries carry only the name and discipline
  the prototype had; their `description` is a generic stand-in marked `TODO`
  and their bodies are empty. Nothing was invented about real clients.
- **Studio copy.** `/studio` has the contact facts and the services; the story,
  team and process still need writing.
- **Social URLs.** `socialLinks` in `site.config.ts` and the SOCIAL column in
  `footer.config.ts` are `#` placeholders.
- **Street address.** Left out of `site.config.ts` on purpose — filling it in
  promotes the Organization JSON-LD to LocalBusiness.
- **Logo.** `public/favicon.svg` is a live-text placeholder, and
  `src/assets/branding/*.svg` are still Velocity's marks (unused — the site uses
  the `sw/` text mark from `site.config.ts`).
- **OG images** render in Inter. Satori needs a TTF/OTF and Fontsource ships
  woff2 only; drop an Archivo TTF into `public/fonts/` and point `src/lib/og.ts`
  at it to finish the job.
- **Blog** has one `draft: true` placeholder post, so production publishes an
  empty Lab. Delete it when real writing lands.

## Upgrading Velocity

`pnpm create velocity-astro upgrade` refreshes the framework files listed as
`safe` in `velocity-manifest.json` — which includes all of `src/styles/`. Two
lines are ours and have to be re-applied afterwards:

- `styles/tokens/colors.css` must import `../themes/southwell.css`, not
  `../themes/default.css`
- `styles/global.css` must keep the Archivo / IBM Plex Mono font imports and
  `@import './southwell.css';`

Everything else of ours lives outside the safe list.
