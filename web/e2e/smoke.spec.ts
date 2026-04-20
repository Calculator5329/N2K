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
    await expect(
      page.getByRole("heading", { name: /Lookup|easiest equation/i, level: 1 }),
    ).toBeVisible();
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
    // Phase 6.5 trimmed the v3 chrome to the three canonical
    // surfaces: Lookup (equation lookup), Competition (compose), and
    // Play (number knockout). Other tools live behind direct URLs or
    // in the secret menu, not in the primary nav.
    const surfaces: ReadonlyArray<readonly [string, RegExp]> = [
      ["II Competition", /Compose|Boards, dice, and balance/i],
      ["III Library", /Saved competitions|ready to play/i],
      ["IV Play", /one minute|sixty seconds|Quick Race/i],
      ["I Lookup", /Lookup|easiest equation/i],
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
    // "The N2K / Almanac" in the masthead. The string also shows up
    // in nav crumbs/footer chrome, so pin to the first match (the
    // masthead heading).
    await expect(page.getByText("The N2K", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("radio", { name: "Almanac" })).toBeChecked();
  });
});
