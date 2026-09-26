/**
 * The first-run Welcome modal keeps keyboard focus inside itself, and it
 * stands aside when the visit opens a shared race link.
 */
import { test, expect } from "@playwright/test";

test("Tab and Shift+Tab stay inside the Welcome modal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("welcome.actions.quick-race")).toBeFocused();
  const focusInDialog = () =>
    page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null);
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Tab");
    expect(await focusInDialog()).toBe(true);
  }
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await focusInDialog()).toBe(true);
  }
});

test("a first visit through a shared race link shows the race, not the Welcome modal", async ({
  page,
  browser,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByTestId("welcome.actions.explore").click();
  await page.getByTestId("chrome.nav.item-play").click();
  await page.getByTestId("play.setup.begin").click();
  await page.clock.runFor(61_000);
  await page.getByTestId("play.results.share").click();
  await expect.poll(() => page.url()).toContain("race=");
  const link = page.url();

  const stranger = await browser.newContext();
  const recipient = await stranger.newPage();
  await recipient.goto(link);
  await expect(recipient.getByTestId("play.results.new-race")).toBeVisible();
  await expect(recipient.getByTestId("welcome.actions.explore")).toBeHidden();
  await stranger.close();
});

test("a broken race link still gets the Welcome modal", async ({ page }) => {
  await page.goto("/#view=play&race=garbage");
  await expect(page.getByTestId("welcome.actions.explore")).toBeVisible();
});
