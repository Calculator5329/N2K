/**
 * Responsive sweep for the Tabletop edition.
 *
 * For every primary surface (Lookup, Competition, Play setup, Play
 * race) and every supported viewport from a 320px-wide phone up to a
 * 2560px ultra-wide desktop, asserts that:
 *
 *   1. The page renders without throwing,
 *   2. The viewport never produces horizontal page overflow (no
 *      sideways scroll on the document — embedded scroll regions like
 *      the Compose rounds table are exempt because they live inside an
 *      `overflow-x-auto` container, not on the document),
 *   3. The headline / nav chrome is still visible.
 *
 * These are the smallest checks that catch the worst regressions
 * (cells crushing into each other, content bleeding past the page
 * frame, layout breaks at a single breakpoint) without trying to
 * pixel-snapshot the entire UI.
 */
import { test, expect, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 320, height: 800, label: "iphone-se-portrait" },
  { width: 375, height: 812, label: "iphone-x-portrait" },
  { width: 414, height: 896, label: "iphone-pro-max-portrait" },
  { width: 640, height: 900, label: "tailwind-sm" },
  { width: 768, height: 1024, label: "ipad-portrait" },
  { width: 1024, height: 768, label: "ipad-landscape" },
  { width: 1280, height: 800, label: "laptop" },
  { width: 1440, height: 900, label: "desktop" },
  { width: 1920, height: 1080, label: "fullhd" },
  { width: 2560, height: 1440, label: "ultra-wide" },
] as const;

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const body = document.documentElement;
    return {
      innerWidth: window.innerWidth,
      scrollWidth: body.scrollWidth,
    };
  });
  // `scrollWidth` may legitimately exceed `innerWidth` by 1px on
  // sub-pixel device-pixel ratios — give a 2px slack.
  expect(overflow.scrollWidth, `Page overflows horizontally: scrollWidth=${overflow.scrollWidth} > innerWidth=${overflow.innerWidth}`)
    .toBeLessThanOrEqual(overflow.innerWidth + 2);
}

test.describe("Tabletop edition is responsive at every supported viewport", () => {
  for (const vp of VIEWPORTS) {
    test(`Lookup @ ${vp.width}x${vp.height} (${vp.label})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await expect(page.getByRole("heading", { name: /Lookup|easiest equation/i, level: 1 }))
        .toBeVisible();
      await expectNoPageOverflow(page);
    });

    test(`Competition @ ${vp.width}x${vp.height} (${vp.label})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await page.getByRole("button", { name: /^II Competition$/ }).click();
      await expect(page.getByRole("heading", { name: /Compose|Boards, dice, and balance/i, level: 1 }))
        .toBeVisible();
      await expectNoPageOverflow(page);
    });

    test(`Play setup @ ${vp.width}x${vp.height} (${vp.label})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await page.getByRole("button", { name: /^IV Play$/ }).click();
      await expect(page.getByRole("heading", { name: /one minute|sixty seconds/i, level: 1 }))
        .toBeVisible();
      // The five difficulty tiles must all be visible (and clickable)
      // — this catches the regression where labels like "Standard" or
      // "Master" were getting clipped by an overflow-hidden tile.
      for (const label of ["Easy Tier 1", "Standard Tier 2", "Hard Tier 3", "Expert Tier 4", "Master Tier 5"]) {
        await expect(page.getByRole("button", { name: label })).toBeVisible();
      }
      await expectNoPageOverflow(page);
    });

    test(`Play race @ ${vp.width}x${vp.height} (${vp.label})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await page.getByRole("button", { name: /^IV Play$/ }).click();
      await page.getByRole("button", { name: /Roll dice & begin/i }).click();
      // Both boards (player + bot) render their 36 cells; assert the
      // last cell appears twice (once per board) and both copies are
      // visible — that catches the regression where one of the two
      // boards got crushed off the right edge or scrolled out of view.
      const lastCells = page.getByRole("button", { name: "288", exact: true });
      await expect(lastCells).toHaveCount(2);
      await expect(lastCells.first()).toBeVisible();
      await expect(lastCells.last()).toBeVisible();
      await expectNoPageOverflow(page);
    });
  }
});
