/**
 * Library "Open" button regression — guards a bug the user reported on
 * 2026-04-20: clicking Open on a Library entry was a no-op (didn't
 * switch to Compose, didn't load the saved plan).
 *
 * The Open button calls `compose.loadFromContentBackend(entry.id)` and
 * then `root.setView("compose")` on success. This test exercises the
 * full round-trip: save a uniquely-named comp, navigate away, click
 * Open from the Library card, and assert that (a) the view actually
 * switches to Compose and (b) the loaded plan's name matches the
 * entry we clicked.
 */
import { test, expect } from "@playwright/test";

test.describe("Library — Open button", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test("Open switches to Compose and loads the saved plan", async ({ page }) => {
    // II Competition — generate + save a uniquely-named comp.
    await page.getByRole("button", { name: /^II Competition$/ }).click();
    await page.getByRole("button", { name: /Generate score-balanced rolls/ }).click();
    await expect(
      page.getByRole("button", { name: /Generate score-balanced rolls/ }),
    ).toBeEnabled({ timeout: 30_000 });

    await page.getByRole("button", { name: /^Save as new$/ }).click();
    const saveAs = page.getByRole("dialog", { name: "Save as new" });
    await saveAs.getByPlaceholder("Competition name").fill("Open Button Test");
    await saveAs.getByRole("button", { name: /^Save$/ }).click();
    await expect(saveAs).toBeHidden();

    // III Library — click Open on the card we just made.
    await page.getByRole("button", { name: /^III Library$/ }).click();
    const card = page.locator("li", { hasText: "Open Button Test" });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: /^Open$/ }).click();

    // We should land back on Compose. The header renames-on-click
    // button shows the loaded comp name, plus a "· saved" badge that
    // is only rendered when `openedLibraryId !== null` — i.e. the
    // load actually bound the entry to the store.
    const header = page.getByRole("button", { name: /Open Button Test/ });
    await expect(header).toBeVisible({ timeout: 5_000 });
    await expect(header).toContainText("· saved");

    // And the Library card itself should now show the "open in
    // Compose" badge for that same entry.
    await page.getByRole("button", { name: /^III Library$/ }).click();
    await expect(card).toContainText(/open in Compose/i);
  });
});
