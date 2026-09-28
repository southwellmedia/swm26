import { test, expect } from '@playwright/test';
test('sculpture renders, responds to the pointer and follows service chapters', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const field = page.locator('[data-sculpture]');
  await field.scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute('data-ready', 'true');
  if (process.env.REVIEW_SCREENSHOT_DIR)
    await page
      .locator('.service')
      .first()
      .screenshot({ path: `${process.env.REVIEW_SCREENSHOT_DIR}/tension-desktop.png` });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await field.scrollIntoViewIfNeeded();
  const box = await field.boundingBox();
  await page.mouse.move(box!.x + box!.width * 0.55, box!.y + box!.height * 0.45);
  await expect(field).toHaveAttribute('data-interacting', 'true', { timeout: 20_000 });
  await page.mouse.move(0, 0);
  await expect(field).toHaveAttribute('data-interacting', 'false', { timeout: 20_000 });
  await page.locator('[data-service-step="3"]').scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute('data-chapter', '3', { timeout: 20_000 });
  if (process.env.REVIEW_SCREENSHOT_DIR)
    await page.screenshot({
      path: `${process.env.REVIEW_SCREENSHOT_DIR}/sculpture-final-chapter.png`,
    });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await field.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.REVIEW_SCREENSHOT_DIR)
    await page
      .locator('.service')
      .first()
      .screenshot({ path: `${process.env.REVIEW_SCREENSHOT_DIR}/tension-mobile.png` });
  expect(errors).toEqual([]);
});
