/**
 * Quick Race with checked knocks: an illegal equation is refused with a
 * reason, a legal one knocks its cell, and the Easy bot knocks cells
 * before the buzzer. The page clock is faked so the 60 s race runs in
 * a moment. Set N2K_RACE_SHOT to a path to keep the results screenshot.
 */
import { test, expect } from "@playwright/test";
import { STANDARD_MODE } from "../../src/core/constants.js";
import { easiestSolution } from "../../src/services/solver.js";
import { formatExpression } from "../../src/services/parsing.js";

test("a validated Quick Race against Easy", async ({ page }, testInfo) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByTestId("welcome.actions.explore").click();
  await page.getByTestId("chrome.nav.item-play").click();
  await page.getByTestId("play.difficulty.select-easy").click();
  await page.getByTestId("play.setup.begin").click();
  await expect(page.getByTestId("play.board.player.cell-0")).toBeVisible();
  // Typing starts at once: the equation box has focus when the race begins.
  await expect(page.getByTestId("play.race.equation")).toBeFocused();

  const dice = (
    await page.getByLabel("Dice pool — player").locator("div.tabular > span").allTextContents()
  ).map(Number);
  expect(dice).toHaveLength(3);

  // Refused: the dice are never all 1s, and 1 + 1 + 1 hits no ×8 cell anyway.
  const entry = page.getByTestId("play.race.equation");
  await page.getByTestId("play.board.player.cell-0").click();
  await entry.fill("1 + 1 + 1");
  await entry.press("Enter");
  await expect(page.getByTestId("play.race.refusal")).not.toBeEmpty();
  await expect(page.getByTestId("play.board.player.cell-0")).toHaveAttribute("aria-pressed", "false");

  // Accepted: the easiest legal equation for the first reachable cell.
  let knockedIdx = -1;
  for (let i = 0; i < 36 && knockedIdx === -1; i += 1) {
    const value = (i + 1) * 8;
    const eq = easiestSolution(dice, value, STANDARD_MODE);
    if (eq === null) continue;
    await page.getByTestId(`play.board.player.cell-${i}`).click();
    await entry.fill(formatExpression(eq));
    await entry.press("Enter");
    knockedIdx = i;
  }
  expect(knockedIdx).toBeGreaterThanOrEqual(0);
  await expect(page.getByTestId(`play.board.player.cell-${knockedIdx}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("play.race.refusal")).toBeEmpty();

  await page.clock.runFor(61_000);
  await expect(page.getByTestId("play.results.new-race")).toBeVisible();
  // Results list "N cells knocked." for you, then for the bot; the bot's must be > 0.
  const counts = await page.getByText(/^\d+ cells? knocked\.$/).allTextContents();
  expect(counts).toHaveLength(2);
  expect(Number.parseInt(counts[1]!, 10)).toBeGreaterThan(0);
  await page.screenshot({
    path: process.env["N2K_RACE_SHOT"] ?? testInfo.outputPath("race-result.png"),
    fullPage: true,
  });
});
