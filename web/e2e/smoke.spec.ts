/**
 * End-to-end smoke tests.
 *
 * Verifies that:
 *   - the app boots and renders the v1 PageShell chrome,
 *   - every nav surface mounts without crashing,
 *   - the live solver worker actually returns results for the default
 *     dice tuple,
 *   - swapping themes re-renders the layout without losing state.
 */
import { test, expect } from "@playwright/test";

test.describe("v2 web smoke", () => {
  test("boots into the Tabletop board layout", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^I Lookup$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lookup", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Edition: Tabletop/ })).toBeVisible();
  });

  test("solver worker returns reachable targets for the default dice", async ({ page }) => {
    await page.goto("/");
    // The default rolled tuple resolves to many targets; assert at
    // least one Target N button appears within the worker round-trip.
    await expect(page.getByRole("button", { name: /^Target \d+, difficulty / }).first()).toBeVisible();
  });

  test("every primary surface mounts without crashing", async ({ page }) => {
    await page.goto("/");
    const surfaces: ReadonlyArray<readonly [string, RegExp]> = [
      ["II Explore", /Explore/],
      ["III Compare", /Compare/],
      ["IV Visualize", /Visualize/],
      ["V Compose", /Compose/],
      ["VI Play", /Play/],
      ["VII Gallery", /Gallery/],
      ["VIII Studio", /Studio/],
      ["IX Sandbox", /Sandbox/],
      ["X Colophon", /About|Colophon/],
      ["I Lookup", /Lookup/],
    ];
    for (const [navName, headingPattern] of surfaces) {
      await page.getByRole("button", { name: navName }).first().click();
      await expect(
        page.getByRole("heading", { name: headingPattern, level: 1 }).first(),
      ).toBeVisible();
    }
  });

  test("switching theme re-renders the layout chrome", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Edition: Tabletop/ }).click();
    await page.getByRole("radio", { name: "Almanac" }).click();
    // Almanac uses the sidebar layout — the wordmark renders as
    // "The N2K / Almanac" in the masthead.
    await expect(page.getByText("The N2K", { exact: false })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Almanac" })).toBeChecked();
  });
});
