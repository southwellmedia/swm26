---
title: "Velocity 2.0 Is Out, and This Site Already Runs on It"
description: "We rebuilt our open-source Astro starter for Astro 7, then upgraded this site to it. What's new, and what a real upgrade involved."
publishedAt: 2026-11-04
tags: ["Astro", "Astro 7", "Velocity", "Open Source"]
category: "development"
coverWord: "velocity 2"
featured: false
author: "michael-froseth"
draft: false
locale: en
---

We released Velocity 2.0 this week. It's our open-source Astro starter, rebuilt for Astro 7, and it's what this site is built on.

Release posts are easy to write and easy to ignore, so this one does something more useful. The [full release notes](https://www.deployvelocity.com/blog/velocity-2-astro-7) cover everything. Here's the short version, followed by what happened when we ran the upgrade on a heavily customized production site: this one.

---

## What changed

Astro 7 brings a Rust compiler and Vite 8 with Rolldown, and that shows up in the numbers. On the starter itself, production builds dropped from 13.9 seconds to 6.3. Baseline JavaScript per page dropped from 5.7 KB to 1.2 KB gzipped.

The bigger change is how much now works out of the box:

- **Forms that actually run.** Contact and newsletter forms use Astro Actions, with validation and spam protection built in.
- **Strict CSP by default.** Hash-based, on from the first build.
- **Site search.** Pagefind, indexing only the content you mark.
- **Native view transitions.** Page changes no longer need a client-side router.
- **Self-hosted fonts.** Handled by Astro's Fonts API, with metric-matched fallbacks.
- **Real test coverage.** 1.0 had none. 2.0 ships 64 unit tests and 45 end-to-end tests across 8 project shapes.

---

## What the upgrade looked like here

Starting a new project on Velocity 2 takes one command. Upgrading a site that has spent months drifting from the template is a better test, so we ran it on ours.

```bash
pnpm create velocity-astro@latest upgrade --dry-run
```

Run the dry run first. Ours reported 154 files updated, 50 added, 25 replaced and 17 manual steps. That's honest output for a site like this one, and we did the work on its own branch.

The CLI backs up everything it replaces, but it can't know what your customizations mean. The replaced files included our config and our content schema, so a blind upgrade would have reset the site URL and removed the collection behind our case studies. Nothing was lost. It's just why you read the diff instead of trusting the green checkmark.

Three things are worth knowing if your site is custom too:

**Check for duplicate native packages.** We pinned Sharp 0.34 and Astro 7 wanted 0.35. Each worked alone, but the build failed with a "missing Sharp" error until we aligned them.

**New pages are real pages.** The upgrade adds stock routes like `/search`. If you've built your own design, remove what doesn't belong before it deploys.

**Decide about the router on purpose.** Velocity 2 moves to native view transitions, and Astro's CSP doesn't work with the ClientRouter. Our reel, navigation and scroll motion all follow the router's lifecycle, so we kept it and left CSP off for now. Everything else is on 2.0. Moving this site to native transitions is its own project, and we'd rather do it properly than rush it.

Then we compared before and after, page by page. The pages we checked came back visually identical.

---

## Try it

Velocity is free and MIT licensed. [Start with the docs](https://docs.deployvelocity.com), or follow the [upgrade guide](https://docs.deployvelocity.com/upgrade-guides/v1-to-v2/) if you're on 1.x. You'll need Node 22.23.4 or later.

If you'd rather have someone else do this part, [tell us what you're building](/contact).
