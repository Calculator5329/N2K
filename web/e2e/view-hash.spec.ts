/**
 * Every top-level view lives in the URL hash: a pasted `#view=` link
 * opens that view, reload keeps it, and Back walks between views inside
 * the site instead of leaving it.
 */
import { test, expect } from "@playwright/test";

test.describe("view in the URL hash", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("welcome.actions.explore").click();
  });

  test("a Competition link opens Competition and survives reload", async ({ page }) => {
    await page.goto("/#view=competition");
    await page.reload();
    await expect(page.getByTestId("compose.toolbar.generate")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("compose.toolbar.generate")).toBeVisible();
    expect(new URL(page.url()).hash).toBe("#view=competition");
  });

  test("Lookup -> Library -> Back returns to Lookup inside the site", async ({ page }) => {
    await expect(page.getByTestId("lookup.target.value")).toBeVisible();
    await page.getByRole("button", { name: /^III Library$/ }).click();
    await expect(page.getByRole("heading", { name: /Saved competitions|ready to play/i, level: 1 }).first()).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId("lookup.target.value")).toBeVisible();
    expect(page.url()).not.toContain("view=");
    expect(new URL(page.url()).hash).toMatch(/^#lookup=/);
  });
});
