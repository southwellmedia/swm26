---
title: "CSS in 2026: 7 Features That Let the Browser Do the Work"
description: "Anchor positioning. Scroll-driven animations. Sibling functions. A few CSS features arriving in 2026 handle patterns that used to require JS libraries."
publishedAt: 2026-01-28
tags: ["CSS", "JavaScript", "Performance", "Web Development"]
category: "development"
featured: true
author: "michael-froseth"
draft: false
locale: en
---

Twenty years in this industry has taught me to watch CSS with a different eye than most. What started as "the thing that makes text red" has matured into a legitimate replacement for thousands of lines of UI logic. And 2026 is accelerating that trajectory.

I've been tracking seven CSS features that target the JavaScript we've all been writing for years. Some ship today. Others arrive soon.

---

## Ship These Now

### Anchor Positioning

Think about the last time you installed a tooltip library. Popper.js. Floating UI. Some React wrapper around one of them. All that code existed for a single purpose: make a small box appear next to a button without getting clipped by overflow or buried under z-index conflicts.

That era is closing.

```css
.tooltip {
  position-anchor: --help-trigger;
  position-area: bottom right;
  position-try-fallbacks: flip-block, flip-inline;
}

.help-button {
  anchor-name: --help-trigger;
}
```

Four declarations. The browser now handles positioning relative to any element regardless of DOM location. It repositions when space runs out. No event listeners. No resize observers. No scroll handlers.

<!-- demo:anchor-positioning -->

Dropdown menus, autocompletes, context menus, notification bubbles. The positioning logic that once consumed 200+ lines of JavaScript condenses into four lines of CSS.

**Browser support:** All major browsers as of late 2025.

---

### @scope

This one addresses a problem that has plagued CSS since its inception: specificity warfare.

The pattern repeats in every codebase. You write a clean selector. It fails because something else carries more weight. You add specificity. Now that selector becomes difficult to override. Someone writes `!important`. Someone else writes `!important` to override that one. The stylesheet becomes a minefield.

`@scope` severs this cycle.

```css
@scope (.post-list) to (.author-meta) {
  img {
    border: 2px solid var(--border-color);
  }
}
```

This targets images inside `.post-list` but halts before `.author-meta`. A "donut scope," as the spec authors call it. The rule applies to an area with a hole punched through its center.

The mechanism that makes this valuable: scoped selectors carry intentionally low specificity. Precise targeting without cornering yourself. Your dark mode override just works:

```css
.dark-mode img {
  border-color: white;
}
```

No `!important`. No matching the original selector's weight. The cascade behaves as intended.

<!-- demo:scope -->

**Browser support:** Baseline in all major browsers.

---

## Arriving Soon

Chrome and Safari have shipped these. Firefox is in active development. Weeks, not months.

### Scroll-Driven Animations

Scroll animations once meant GSAP, ScrollMagic, or Intersection Observer callbacks manipulating inline styles. Heavy dependencies. Janky performance on mobile. Maintenance headaches when libraries updated.

Now:

```css
.progress-bar {
  animation: grow-width linear;
  animation-timeline: scroll();
}

@keyframes grow-width {
  from { width: 0%; }
  to { width: 100%; }
}
```

One declaration. `animation-timeline: scroll()`. The browser ties animation progress to scroll position. Reading progress indicators, parallax effects, reveal sequences. All without touching JavaScript.

For entrance animations triggered by viewport visibility:

```css
.reveal {
  animation: fade-in-slide linear;
  animation-timeline: view();
  animation-range: entry 0% cover 30%;
}
```

The `view()` timeline fires when elements cross into the viewport. This has the potential to obsolete entire animation libraries.

<!-- demo:scroll-driven -->

**Browser support:** Chrome, Edge, Safari. Firefox in active development.

---

### sibling-index() and sibling-count()

Staggered animations, where each item animates slightly after its predecessor, used to demand either JavaScript or this monstrosity:

```css
.item:nth-child(1) { animation-delay: 0.1s; }
.item:nth-child(2) { animation-delay: 0.2s; }
.item:nth-child(3) { animation-delay: 0.3s; }
/* repeat for every possible count */
```

Now:

```css
.item {
  animation-delay: calc(sibling-index() * 0.1s);
}
```

Works for three items. Works for three hundred. `sibling-index()` returns an element's position among its siblings as an integer. `sibling-count()` returns the total. Dynamic sizing based on element count becomes trivial.

<!-- demo:sibling-index -->

**Browser support:** Chrome and Safari. Firefox in progress.

---

## On the Horizon

### CSS Carousels

Sliders. Image galleries. Onboarding wizards. All without JavaScript.

Chrome has implemented `::scroll-button` and `::scroll-marker` pseudo-elements that generate native carousel navigation. The browser handles snap points, button logic, indicator dots. You style them through CSS.

<!-- demo:carousel -->

**Browser support:** Chrome only. No clear timeline from Firefox or Safari.

---

### CSS Masonry

Pinterest-style layouts without a library. After years of debate between browser vendors, the CSS Working Group settled on `display: grid-lanes`.

Safari has shipped it. Chrome and Firefox are implementing.

**Why it matters:** Masonry layouts currently require JavaScript to calculate element positions based on preceding element heights. Native CSS support eliminates layout shifts and reduces time-to-interactive.

<!-- demo:masonry -->

---

### Interest Invoker API

The missing piece for hover-triggered popovers. Anchor positioning combined with the popover API handles click interactions well. Tooltips that appear on hover? Still require JavaScript for timing logic. Particularly the delay when moving your cursor from trigger to tooltip content.

The Interest Invoker API adds `interesttarget` attributes and CSS properties like `interest-delay` to handle this at the browser level.

**Browser support:** Early development.

---

## What This Means

I've been experimenting with all of these internally. Anchor positioning and @scope are production-ready now. Once Firefox lands scroll-driven animations and the sibling functions, I'll be rolling those into new projects across the board.

The pattern has become unmistakable: browsers are absorbing functionality that used to require libraries. Every feature that migrates into CSS runs faster (native code versus interpreted JavaScript), ships smaller (zero bundle impact), and proves more reliable (browser-tested rather than library-maintained).

JavaScript still has its place. I use it where the problem demands it. But UI positioning, scroll effects, layout calculations? These are becoming solved problems at the browser level. And when the browser handles something, it handles it better than any library I could import.

Less code. Faster sites. That's where this is heading.

---
