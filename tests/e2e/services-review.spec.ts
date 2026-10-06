import { test, expect } from '@playwright/test';
test('service artwork remains readable on desktop and mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (let i = 0; i < 4; i++) {
      const card = page.locator('.service').nth(i);
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('h3')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      if (process.env.REVIEW_SCREENSHOT_DIR)
        await page.screenshot({
          path: `${process.env.REVIEW_SCREENSHOT_DIR}/service-${width}-${i}.png`,
        });
    }
  }
});
