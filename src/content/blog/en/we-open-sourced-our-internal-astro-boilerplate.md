---
title: "We Open-Sourced Our Internal Astro Boilerplate"
description: "Velocity is the Astro 6 boilerplate we built for internal use, refined across a year of client projects, and now released under an MIT license."
publishedAt: 2026-01-30
tags: ["Astro", "Open Source", "Boilerplate", "i18n", "Tailwind CSS"]
category: "development"
featured: true
image: "../../../assets/blog/velocity_001.webp"
author: "michael-froseth"
draft: false
locale: en
---

Every client project at Southwell started with the same ritual. Configure Tailwind. Copy SEO components from the last repo. Retrofit i18n when the client mentions they need Spanish two weeks into the build. None of these tasks took long on their own. Across dozens of projects, the hours accumulated into something we couldn't ignore.

Velocity is what came out of that frustration. It's the Astro 6 boilerplate we built for internal use, refined across a year of client projects, and now released under an MIT license.

---

## What's inside

The practical answer: everything a marketing site requires and nothing it doesn't.

Astro 6 with Content Collections. Tailwind CSS v4 running on the new CSS-first configuration. A three-tier design token system with two built-in themes (default and midnight) where changing your brand color means editing one variable and watching it cascade through buttons, links, focus rings, and badges without touching component files. 57 components across seven categories — forms, data display, feedback, overlays, layout, patterns, and marketing — that meet WCAG 2.2 AA and function without JavaScript. SEO that scores 100 on Lighthouse before you configure anything. Dynamic OG image generation at build time. JSON-LD helpers for articles, organizations, FAQs, and breadcrumbs. A cookie consent system with Google Consent Mode v2 support, granular cookie categories, and a polished consent UI that requires zero configuration.

The piece that matters most: internationalization that works out of the box.

---

## Why i18n became the priority

Astro ships locale detection and some URL utilities. The rest falls on you. Creating folder structures for each language, loading translations through middleware, building a language switcher that generates correct paths. These problems repeat identically across every multilingual project, yet the ecosystem treats them as bespoke implementation details.

The built-in `getRelativeLocaleUrl` helper has a bug that produces `/fr/en/about` when you want `/fr/about`. We discovered that one late on a Friday before a client launch.

Velocity includes a working translation system with interpolation and fallbacks. Routes generate from dynamic segments without manual folder creation. The language switcher ships functional. Hreflang tags and locale-aware sitemaps generate at build time.

Version 1.1 will introduce translated URL slugs. That means `/en/about` becomes `/fr/a-propos-de-nous` with proper reverse lookups for the language switcher. No Astro starter handles this correctly. We're building the solution.

---

## The CLI

```bash
npm create velocity-astro@latest my-site
```

Four optional flags let you control what gets scaffolded. `--components` adds the full UI component library. `--i18n` wires up locale routing. `--demo` includes sample pages and blog content. Skip the flags for a minimal base.

Works with pnpm, npm, yarn, or bun. Pick your package manager.

---

## Why release it

Southwell builds client websites. We're not a template company and have no plans to become one. Velocity exists to accelerate our own work. Open-sourcing it costs us nothing and creates value for developers facing the same accumulated friction we wanted to eliminate.

The repo also functions as a portfolio piece. Prospective clients can inspect our component architecture, accessibility patterns, and code quality without signing an NDA or scheduling a call. That transparency works in our favor.

---

## Get started

Documentation lives at [docs.deployvelocity.com](https://docs.deployvelocity.com). The source is on [GitHub](https://github.com/southwellmedia/velocity). Stars help with visibility but aren't expected.

If you'd rather have a site built than configure one yourself, that's what we do. Southwell delivers production marketing sites in 14 to 21 days. [Reach out](/contact) if that timeline interests you.
