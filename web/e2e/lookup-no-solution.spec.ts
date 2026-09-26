/**
 * Lookup's "no solution" answer reads cleanly and renders valid markup
 * (the dice glyph is block content, so it cannot sit inside a <p>).
 */
import { test, expect } from "@playwright/test";

test("an unreachable target explains itself without a DOM nesting error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  // 2, 3, 5 cannot make 983.
  await page.goto("/#lookup=1:2,3,5/983");
  await page.getByTestId("welcome.actions.explore").click();
  await expect(page.getByText("No solution", { exact: true })).toBeVisible();
  await expect(page.getByText(/targets in 1–999, this triple solves/)).toBeVisible();
  expect(errors.filter((e) => e.includes("validateDOMNesting"))).toEqual([]);
});
