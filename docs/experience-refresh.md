# Southwell experience refresh

## Design

- One vermilion signature object (`--signature-color: #ff542e`) retains its pigment through the hero, the traveling ball and the interactive reel scene. The rest of the hero palette stays neutral.
- Restrained footer with the studio mark, navigation and details; no repeated orb or tagline.
- Full-color project imagery, visible project descriptions and status badges.
- Revised positioning and a wrapping mobile headline. The hero uses the scroll cue without an extra work button.
- Shorter pinned sequence: 100vh desktop, 55svh mobile, with a 1.1s reel-to-work link.
- Texas Trinkets & Treasures enters the homepage after Reap Capital, with a dedicated responsive story.

## Services art direction

Preview study: the four cards now share a cropped pleated-titanium material study with tonal/crop variations, replacing literal UI illustrations. This uses an optimized generated WebP beneath live HTML copy, with subtle CSS scroll drift, not real-time 3D. Mobile separates the sculptural crop from copy; reduced motion is static.

Asset: `src/assets/services/pleated-titanium.webp`. Generated with the built-in image tool from the approved still composition. Prompt: Preserve the brushed titanium pleated sculpture, studio lighting, diagonal S curve and right-side cropping; remove all typography and rounded corners; keep left 48 percent empty for HTML text; photoreal brushed metal, graphite valleys, pearl-gray studio, no new elements or text.

## Content decisions

Texas Trinkets' launch and Southwell's design/build role were provided by the owner. The website captures and descriptions reflect https://www.handmadetexastrinkets.com as inspected on September 27, 2026 (America/Chicago). No conversion results, sales claims or client quotation were invented.

Reap performance figures explicitly marked unconfirmed in the source were removed, including property conversion metrics and the flagship IRR/launch-duration claim. `stats` arrays remain available for approved results later.

Vana's story still contains placeholder assets, figures and dates. It is now marked draft, omitted from the public grids, and its bespoke production route redirects to `/work`. The full story remains available in the development server. Remove the draft flag when that story is approved.

## Texas Trinkets assets

All assets are in `src/assets/work/texas-trinkets/`:

- `desktop.webp`: actual launched homepage, desktop viewport.
- `mobile.webp`: actual launched homepage, mobile viewport.
- `custom.webp`: actual custom-order section.
- `jewelry.webp`: the client's existing product image from `/_astro/custom-jewelry-spread.kLQ_TZ5x_1MJ2yF.webp`.
- `cover.webp`: browser/phone composition built from the real captures over the material study. Screen contents are not AI-generated.
- `material-study.webp`: AI-generated conceptual supporting artwork, not a client product photograph or an asset claimed as part of the original website design. The case-study caption identifies it as supporting presentation art.

Generated with the built-in image-generation tool. Final prompt:

> Use case: stylized-concept. Asset type: wide 16:9 editorial material study for Southwell Media's case study of Texas Trinkets & Treasures, a handmade western jewelry website. Create a premium, photorealistic abstract still life: a single large raw turquoise stone with rich natural mineral veins, one elegantly curled brushed and hammered silver ribbon, softly folded warm ivory linen on a pale sandstone plinth. Asymmetric museum-quality composition with the stone toward the upper right and silver sweeping across center, clear quiet space at lower left for overlay caption. Warm directional late-afternoon studio light, long beautiful soft shadows, rich teal, antique silver and creamy sand colors. Close-up, tactile, sophisticated magazine art direction. No actual necklaces or saleable jewelry, no logos, no text, no devices, no people. This is conceptual supporting art about materials, not a photograph of the client's products. Landscape high resolution.

## Reliability and review

Animation hides server-rendered content only once the motion module is available. A failed motion initializer restores visible content. Failed reel initialization restores the static presentation and releases the work gate.

The OG generator now includes `/studio` and `/work`. CI uses the package's pnpm version and runs the browser regression suite before the production build.

Run `pnpm check`, `pnpm lint`, `pnpm build`, and `pnpm test:e2e`. Install Chromium with `pnpm exec playwright install chromium` first. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` optionally selects an existing local browser. `REVIEW_SCREENSHOT_DIR` enables the opt-in desktop/mobile visual capture test.

Contact tests intercept the request locally; they never send email. Actual delivery still depends on the deployment's existing Resend configuration.
