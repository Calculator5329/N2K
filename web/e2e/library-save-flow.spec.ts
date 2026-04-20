/**
 * Library save flow regression — guards two bugs the user reported on
 * 2026-04-19:
 *
 *  1. Pressing Save (or Cancel) in the "Save as new" dialog did not
 *     dismiss it because Compose was holding the dialog open via local
 *     React state while the dialog's buttons called `lib.closeDialog()`
 *     against a separate (always-`none`) MobX store. Each click on
 *     Save persisted another fresh entry — the user reported "a million
 *     copies" on the third or fourth attempt.
 *
 *  2. The PlayPickerDialog's bot-persona grid used a 14px display
 *     font that overflowed the narrow 5-column cell for the longer
 *     names (Ramanujan, Hypatia). Slimmed to 12px with a leading-tight
 *     break; this asserts the cell never blows out wider than the
 *     grid column it lives in.
 *
 * Both are pure UI bugs but each one is wrapped here so a future
 * refactor can't quietly regress either. Runs against the in-app
 * LocalStorageContentBackend; the test clears storage on entry so the
 * Library always starts empty.
 */
import { test, expect } from "@playwright/test";

test.describe("Library — save & play flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test("Save as new produces exactly one entry per click", async ({ page }) => {
    // Compose is folio II in the v3.2 nav.
    await page.getByRole("button", { name: /^II Competition$/ }).click();

    // Generate the default boards. The button label switches to
    // "Generating…" while the matrix loads, then back to the original
    // label when the result is ready. Wait for that round-trip.
    await page.getByRole("button", { name: /Generate score-balanced rolls/ }).click();
    await expect(
      page.getByRole("button", { name: /Generate score-balanced rolls/ }),
    ).toBeEnabled({ timeout: 30_000 });

    // Save as new, give it a unique name, hit Save.
    await page.getByRole("button", { name: /^Save as new$/ }).click();
    const dialog = page.getByRole("dialog", { name: "Save as new" });
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByPlaceholder("Competition name");
    await nameInput.fill("Regression Test Comp");
    await dialog.getByRole("button", { name: /^Save$/ }).click();

    // Dialog should dismiss now (root-cause #1: previously stayed up).
    await expect(dialog).toBeHidden();

    // Library card count: navigate to Library and assert exactly one
    // entry exists with our name. Folio III in the v3.2 nav.
    await page.getByRole("button", { name: /^III Library$/ }).click();
    const matchingCards = page.locator("li", { hasText: "Regression Test Comp" });
    await expect(matchingCards).toHaveCount(1);
  });

  test("Cancel in Save-as dialog dismisses without persisting", async ({ page }) => {
    await page.getByRole("button", { name: /^II Competition$/ }).click();
    await page.getByRole("button", { name: /Generate score-balanced rolls/ }).click();
    await expect(
      page.getByRole("button", { name: /Generate score-balanced rolls/ }),
    ).toBeEnabled({ timeout: 30_000 });

    await page.getByRole("button", { name: /^Save as new$/ }).click();
    const dialog = page.getByRole("dialog", { name: "Save as new" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^Cancel$/ }).click();

    // Dialog must dismiss; nothing should be in the Library.
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: /^III Library$/ }).click();
    await expect(
      page.getByText(/No saved competitions yet/),
    ).toBeVisible();
  });

  test("PlayPicker persona names fit their grid cells", async ({ page }) => {
    // Save one comp first so the Play button on the Library card is
    // available.
    await page.getByRole("button", { name: /^II Competition$/ }).click();
    await page.getByRole("button", { name: /Generate score-balanced rolls/ }).click();
    await expect(
      page.getByRole("button", { name: /Generate score-balanced rolls/ }),
    ).toBeEnabled({ timeout: 30_000 });
    await page.getByRole("button", { name: /^Save as new$/ }).click();
    const saveAs = page.getByRole("dialog", { name: "Save as new" });
    await saveAs.getByPlaceholder("Competition name").fill("Persona Fit Test");
    await saveAs.getByRole("button", { name: /^Save$/ }).click();
    await expect(saveAs).toBeHidden();

    await page.getByRole("button", { name: /^III Library$/ }).click();
    await page
      .locator("li", { hasText: "Persona Fit Test" })
      .getByRole("button", { name: /^▶ Play$/ })
      .click();

    const picker = page.getByRole("dialog", { name: /Play "Persona Fit Test"/ });
    await expect(picker).toBeVisible();

    // Each persona-name span must fit within its parent grid cell at
    // every viewport width.
    for (const personaName of ["Pascal", "Euler", "Cantor", "Hypatia", "Ramanujan"]) {
      const tile = picker.getByRole("button", { name: new RegExp(personaName) });
      await expect(tile).toBeVisible();
      const overflow = await tile.evaluate((el) => {
        // The tile's first child (the display-font name) must not be
        // wider than the tile itself.
        const label = el.querySelector("div");
        if (label === null) return { ok: false, label: 0, tile: 0 };
        return {
          ok: label.scrollWidth <= el.clientWidth,
          label: label.scrollWidth,
          tile: el.clientWidth,
        };
      });
      expect(overflow.ok, `${personaName}: label=${overflow.label}px, tile=${overflow.tile}px`).toBe(true);
    }
  });
});
