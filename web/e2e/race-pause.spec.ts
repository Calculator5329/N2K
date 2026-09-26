/**
 * Leaving Play mid-race pauses the Quick Race. Back used to leave it
 * "racing" with a frozen clock and a stopped bot while typed knocks still
 * scored. Set N2K_PAUSE_SHOT to a path to keep the paused screenshot.
 */
import { test, expect } from "@playwright/test";

test("Back then Forward mid-race lands on a paused race that resumes", async ({ page }, testInfo) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByTestId("welcome.actions.explore").click();
  await page.getByTestId("chrome.nav.item-play").click();
  await page.getByTestId("play.setup.begin").click();
  await expect(page.getByText(/^§\s*IV · Play · race in progress$/)).toBeVisible();
  await page.clock.runFor(5_000);

  await page.goBack();
  await expect(page.getByTestId("lookup.target.value")).toBeVisible();
  await page.clock.runFor(20_000);
  await page.goForward();

  const resume = page.getByTestId("play.pause.resume");
  await expect(resume).toBeVisible();
  await expect(page.getByText("Paused when you left Play. Resume when you're ready.")).toBeVisible();
  await expect(page.getByTestId("play.race.equation")).toBeDisabled();
  await expect(page.getByText("0:55")).toBeVisible();
  await page.screenshot({
    path: process.env["N2K_PAUSE_SHOT"] ?? testInfo.outputPath("race-paused.png"),
    fullPage: true,
  });

  await resume.click();
  await expect(resume).toBeHidden();
  await expect(page.getByTestId("play.race.equation")).toBeEnabled();
  await page.clock.runFor(3_000);
  await expect(page.getByText("0:52")).toBeVisible();
});

// Dev StrictMode replays effect cleanups on mount, so pausing must not hang
// off PlayView's unmount: the Welcome CTA starts the race before Play mounts.
test("a Quick Race started from the Welcome modal keeps running", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByTestId("welcome.actions.quick-race").click();
  await expect(page.getByTestId("play.race.equation")).toBeEnabled();
  await expect(page.getByTestId("play.pause.resume")).toBeHidden();
  await page.clock.runFor(3_000);
  await expect(page.getByText("0:57")).toBeVisible();
});
