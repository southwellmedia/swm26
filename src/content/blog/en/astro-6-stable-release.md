---
title: "Astro 6 Is Here. Here's What Actually Changed."
description: "Astro 6 stable dropped. We've been running the beta in production since January — here's what changed, what broke, and what it means for your next build."
publishedAt: 2026-03-10
tags: ["Astro", "Astro 6", "Web Development", "Frontend"]
category: "development"
featured: false
author: "michael-froseth"
draft: false
locale: en
---

# Astro 6 Is Here. Here's What Actually Changed.

We've been running Astro 6 beta in production since January. Today the stable release is out — and so is the Astro 6 update to Velocity, our open-source starter kit and boilerplate.

If you read our [earlier post on what was coming](/blog/astro-6-whats-coming-2026), this is the follow-up: what made it in, what didn't land the way the team expected, and what the upgrade actually looks like from the inside.

---

## The Dev Server Rebuild Is the Real Story

Every Astro 6 roundup leads with the unified dev runtime. It deserves the attention.

For years, Astro ran different code paths in development and production. The dev server would simulate certain platform behaviors — especially on Cloudflare Workers — rather than run them natively. The result was a class of bugs that only appeared after deployment, when you were no longer in a position to catch them quickly.

Astro 6 replaces that simulation with a real runtime. Your local server now runs inside the same JavaScript engine as your production environment. For Cloudflare Workers specifically, that means workerd — the same open-source runtime Cloudflare deploys. Same globals, same platform APIs, same behavior.

We've found this in practice. During the beta period we caught two edge-case issues with middleware that hadn't surfaced in dev under v5. Both were genuine production bugs. They would have made it through if we hadn't been on the beta.

The bigger implication is platform expansion. workerd is the first target, but the architecture now supports additional runtimes. Deno and Bun are obvious candidates. The precedent is set.

---

## CSP Ships as a First-Class Feature

Content Security Policy has been Astro's most-requested feature for years. It's stable in v6.

For most teams, the previous approach was bolting CSP onto a project through middleware, custom headers in a hosting config, or a combination of both. It worked, but it required maintaining hash lists for inline scripts and styles manually — and those lists drifted out of sync with the codebase over time.

Astro 6 handles this automatically. Set `csp: true` in your config and Astro generates proper headers, including hashes for inline and dynamically loaded scripts. It works across static, SSR, and SPA output modes and is compatible with Cloudflare, Netlify, Node, and Vercel adapters.

For marketing sites specifically — forms, analytics scripts, chat widgets, Google Tag Manager — this removes a category of maintenance that most agency-built sites skip entirely because it's too brittle to maintain manually.

One note from the beta: CSP in dev mode is not enforced. Test with `astro build` and `astro preview` before assuming your policy is working.

---

## Live Content Collections Are Stable

The Content Layer API in Astro 5 was a significant improvement. External CMSs, APIs, and databases could finally be typed and validated the same way local Markdown collections were. The limitation was timing — everything fetched at build time, which meant any data that changed between deploys was stale until the next build.

Live Content Collections close that gap. You define a loader that runs at request time rather than build time, and Astro handles the rest. The API mirrors the standard collections API closely, so if you're already using content loaders, the migration is straightforward.

The practical use cases are narrow but significant: live inventory for e-commerce, news feeds, sports scores, anything with a latency requirement that a static build can't meet. For most marketing sites this won't come up. For hybrid sites that mix static content with dynamic data it's a genuine unlock.

---

## Breaking Changes Worth Knowing Before You Upgrade

Astro 6 makes some cuts that will require work if you're upgrading an existing project.

**Node.js 22 is now the minimum.** Nodes 18 and 20 are no longer supported. Check your hosting environment and CI pipeline before upgrading.

**Zod has moved to v4.** If your project uses Zod directly for schema validation — in content collections, API routes, or form handling — you'll need to review the migration guide. Some APIs changed and Zod 3 schemas won't work without adjustment.

**Several APIs were removed outright.** `Astro.glob()` is gone. `emitESMImage()` is gone. The old `<ViewTransitions />` component has been replaced by `<ClientRouter />`. If you've been ignoring deprecation warnings from v5, now is the time to address them.

**The i18n `redirectToDefaultLocale` behavior changed.** The default behavior for locale redirects was adjusted for better SEO consistency. If your project relies on specific redirect logic for internationalized routes, test this before shipping.

None of these are blockers, but they're real upgrade work. Block a few hours, read the v6 upgrade guide, and run through your builds before pushing to production.

---

## What the Cloudflare Acquisition Means for Astro's Future

In January, Cloudflare acquired The Astro Technology Company. The core team joined Cloudflare.

The framework stayed MIT-licensed and open-source. That matters, but what matters more is what the acquisition signals about trajectory. Astro was already the strongest choice for content-driven websites. With Cloudflare's infrastructure and engineering resources behind it, the edge runtime integration gets first-class treatment and the development pace is unlikely to slow.

The 2025 State of JavaScript had Astro at #1 in satisfaction for three years running and #1 in interest for four. Those numbers reflect a community that's been watching the framework make good decisions consistently. Astro 6 is another one.

---

## Velocity: Our Astro 6 Starter Kit and Boilerplate Is Ready for Stable

We've been building Velocity, our open-source Astro 6 starter kit and boilerplate, against the v6 beta since the first release in January. Our content schemas already use the Content Layer API. Our Tailwind integration runs through the `@tailwindcss/vite` plugin. Our design token system uses CSS-first configuration with OKLCH color tokens that work cleanly with dark mode.

With stable landing, we're shipping the final v6 upgrades we held back during the beta: native CSP enabled by default, type-safe environment variables through `astro:env` instead of raw `process.env`, and the i18n routing fixes that address the gaps we documented months ago.

Velocity is what we build Southwell Media client sites on. Marketing sites for contractors, service businesses, and local brands — shipped in 14 to 21 days with a production-grade foundation. 57 components, a full design token system, working i18n, and Lighthouse scores that don't need apology. If you're starting an Astro 6 project and don't want to rebuild the infrastructure from scratch, it's the right starting point.

**[View the Velocity Astro 6 starter kit on GitHub →](https://github.com/southwellmedia/velocity)**

**[Deploy Velocity →](https://deployvelocity.com)**

```
npm create velocity-astro@latest
```

Astro 6 is a version worth building on. We've been convinced of that since the beta. The stable release just makes it easier to recommend without caveats.
