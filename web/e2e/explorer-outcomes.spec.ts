import { test, expect } from '@playwright/test';

test('draft phase edits survive reload and Escape cancels only the draft name', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('welcome.actions.explore').click();
  await page.getByTestId('chrome.nav.item-compose').click();
  await page.getByTestId('compose.header.manage-phases').click();
  const rename = page.locator('[data-testid^="compose.phases.rename-"]').first();
  await rename.click();
  const input = page.locator('[data-testid^="compose.phases.name-"]');
  await input.fill('Fictional finals');
  await input.press('Enter');
  await expect(rename).toHaveText('Fictional finals');
  await rename.click();
  await input.fill('Cancelled change');
  await input.press('Escape');
  await expect(rename).toHaveText('Fictional finals');
  await page.getByTestId('compose.phases.add').click();
  await page.getByTestId('compose.phases.add').click();
  await page.reload();
  await page.getByTestId('chrome.nav.item-compose').click();
  await page.getByTestId('compose.header.manage-phases').click();
  await expect(page.locator('[data-testid^="compose.phases.rename-"]')).toHaveCount(3);
  await expect(rename).toHaveText('Fictional finals');
});

test('a new saved match starts running and resumes after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('welcome.actions.explore').click();
  await page.getByTestId('chrome.nav.item-compose').click();
  await page.getByTestId('compose.toolbar.generate').click();
  await expect(page.getByTestId('compose.toolbar.generate')).toBeEnabled();
  await page.getByTestId('compose.header.save-as-new').click();
  await page.getByTestId('library.save-as.name').fill('Fictional match');
  await page.getByTestId('library.save-as.confirm').click();
  await page.getByTestId('chrome.nav.item-library').click();
  await page.locator('[data-testid^="library.entry.play-"]').first().click();
  await page.getByTestId('library.play-picker.begin').click();
  await expect(page.getByTestId('match.header.pause')).toBeVisible();
  await page.getByTestId('match.header.pause').click();
  await page.reload();
  await page.getByTestId('app.resume.resume').click();
  await expect(page.getByTestId('match.pause.resume')).toBeVisible();
  await page.getByTestId('match.pause.resume').click();
  await expect(page.getByTestId('match.header.pause')).toBeVisible();
  await page.getByTestId('chrome.nav.item-lookup').click();
  await page.getByTestId('chrome.nav.item-play').click();
  await expect(page.getByTestId('match.pause.resume')).toBeVisible();
});
