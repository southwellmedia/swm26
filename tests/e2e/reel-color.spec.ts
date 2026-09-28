import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('interactive reel retains the vermilion accent', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.locator('[data-reel]')).toHaveAttribute('data-reel-mode', 'live');
  await expect(page.locator('.hero-scene')).toHaveClass(/is-ready/, { timeout: 25_000 });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1000);
  const y = await page.locator('[data-reel-runway]').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top + window.scrollY + (rect.height - window.innerHeight) * 0.55;
  });
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await expect(page.locator('[data-reel-overlay]')).toHaveCSS('opacity', '1', { timeout: 25_000 });
  await page.waitForTimeout(1500);
  const shot = await page.screenshot();
  const { data } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let accentPixels = 0;
  for (let i = 0; i < data.length; i += 3) {
    if (data[i] > 100 && data[i] > data[i + 1] * 1.5 && data[i] > data[i + 2] * 1.7) accentPixels++;
  }
  expect(accentPixels).toBeGreaterThan(30);
  if (process.env.REVIEW_SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.REVIEW_SCREENSHOT_DIR}/reel-color.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('footer').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.REVIEW_SCREENSHOT_DIR}/footer-clean.png` });
  }
});
