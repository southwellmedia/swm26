import { test, expect } from '@playwright/test';

test('server-rendered content remains visible when scripts fail to load', async ({ page }) => {
  await page.route('**/*', (route) =>
    route.request().resourceType() === 'script' ? route.abort() : route.continue()
  );
  await page.goto('/');
  await expect(page.locator('.hero__word').first()).toBeVisible();
  await expect(page.locator('.hero__word').first()).toHaveCSS('transform', 'none');
  await expect(page.locator('.card').first()).toHaveCSS('opacity', '1');
  await expect(page.getByRole('link', { name: /Texas Trinkets/ })).toBeVisible();
});

test('reduced motion exposes work without the pinned sequence', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('[data-reel]')).toHaveAttribute('data-reel-mode', 'static');
  await expect(page.locator('.card').first()).toHaveCSS('opacity', '1');
  await page.getByRole('link', { name: 'View selected work' }).click();
  await expect(page).toHaveURL(/#work$/);
});

test('failed reel chunk restores the fallback and releases the project gate', async ({ page }) => {
  await page.route('**/src/scripts/reel/morph.ts*', (route) => route.abort());
  await page.goto('/');
  await page.locator('[data-reel]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-reel]')).toHaveAttribute('data-reel-mode', 'static');
  await expect(page.locator('.card[data-deliver]')).toHaveClass(/is-in/);
});

test('new project has real captures, a live-site link and no horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/work/texas-trinkets');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Small batch.');
  await expect(page.getByRole('link', { name: /Visit the live site/ })).toHaveAttribute(
    'href',
    'https://handmadetexastrinkets.com'
  );
  await page.locator('.tt-custom-frame').scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator('.trinkets img')
        .evaluateAll((imgs) =>
          imgs.every(
            (img) =>
              (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0
          )
        )
    )
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test('menu supports Escape and restores keyboard focus', async ({ page }) => {
  await page.goto('/work/texas-trinkets');
  const toggle = page.locator('#sw-nav-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('contact failure offers an email fallback without sending a real message', async ({
  page,
}) => {
  await page.route('**/api/contact', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ success: false }),
    })
  );
  await page.goto('/work/texas-trinkets');
  await page.locator('[data-chat-open]').first().click();
  await page.locator('#sw-chat-message').fill('A new website for our handmade products.');
  await page.locator('#sw-chat-send').click();
  await page.locator('#sw-chat-name').fill('Preview reviewer');
  await page.locator('#sw-chat-email').fill('review@example.com');
  await page.locator('#sw-chat-send').click();
  await expect(page.locator('p[data-outcome="failed"]')).toBeVisible();
  await expect(page.locator('p[data-outcome="failed"] a')).toHaveAttribute(
    'href',
    'mailto:hello@southwellmedia.com'
  );
});

test('live hero and reel initialize without shader errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /WebGLProgram|shader/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('.hero-scene')).toHaveClass(/is-ready/, { timeout: 25_000 });
  await expect(page.locator('[data-reel]')).toHaveAttribute('data-reel-mode', 'live');
  await page.locator('[data-reel]').scrollIntoViewIfNeeded();
  await page.locator('[data-work-grid]').scrollIntoViewIfNeeded();
  expect(errors).toEqual([]);
});

test('light client story keeps navigation legible under a dark system theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/work/texas-trinkets');
  await expect(page.locator('#sw-nav')).toHaveCSS('color', 'rgb(25, 62, 59)');
  await page.locator('#sw-nav-toggle').click();
  await expect(page.locator('#sw-nav')).toHaveCSS('color', 'rgb(238, 242, 244)');
});
