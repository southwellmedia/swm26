import { test } from '@playwright/test';

test('capture editorial layouts for review', async ({ page }) => {
  test.skip(!process.env.REVIEW_SCREENSHOT_DIR, 'Opt-in visual review artifacts');
  test.setTimeout(90_000);
  const dir = process.env.REVIEW_SCREENSHOT_DIR;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/work/texas-trinkets', { waitUntil: 'networkidle' });
  await page.locator('.tt-custom-frame').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${dir}/case-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${dir}/case-mobile.png`, fullPage: true });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${dir}/home-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${dir}/home-desktop.png` });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 550));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/ball-handoff.png` });
});
