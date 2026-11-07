import type { Page } from '@playwright/test';
import { expect, test } from './support/test';
import { hitTestPanel, openPeta } from './support/peta';

/**
 * R24 (PR #120), from `md` (768px) up: the "Ringkasan data" panel is an overlay that floats above
 * the map. Only the desktop project runs this file (`testMatch` in playwright.config.ts).
 */
test.describe('/peta map summary: overlay from md up', () => {
  /** Opens the panel on an already-loaded /peta and waits for its enter transition to finish. */
  async function openOverlay(page: Page) {
    const trigger = page.getByRole('button', { name: 'Ringkasan data' });
    const panel = page.locator('#map-summary-panel');
    await expect(page.locator('[data-test="map-summary-dropdown"]')).toHaveAttribute(
      'data-layout',
      'overlay',
    );
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    // The enter transition animates opacity/scale; wait for it to finish before measuring.
    await expect
      .poll(() => panel.evaluate((el) => getComputedStyle(el).opacity), { timeout: 3000 })
      .toBe('1');
    return { trigger, panel };
  }

  // This test does NOT guard the panel's z-index: at 1280 the results column is plain in-flow
  // content, so the panel wins these hit tests even without `z-50`. It proves the panel is
  // out of flow (the map does not move) and sits on top of the "Titik terdekat" column.
  test('at 1280 it is out of flow and wins hit tests over the results column', async ({ page }) => {
    await openPeta(page);
    const mapTopBefore = await page.locator('.leaflet-container').evaluate((el) => {
      return el.getBoundingClientRect().top + window.scrollY;
    });
    await openOverlay(page);

    const report = await hitTestPanel(page);
    // Out of flow: opening it does not push the map down (unlike the mobile disclosure).
    const mapTopAfter = await page.locator('.leaflet-container').evaluate((el) => {
      return el.getBoundingClientRect().top + window.scrollY;
    });
    expect(mapTopAfter).toBe(mapTopBefore);
    // Every probe hits the panel, none hit Leaflet.
    expect(report.hitsPanel).toBe(report.probes);
    expect(report.hitsLeaflet).toBe(0);

    // At 1280 the page is two columns (map | "Titik terdekat"); the right-aligned overlay hangs
    // over that results column, so verify it really covers the content under it.
    const covered = await page.evaluate(() => {
      const panel = document.getElementById('map-summary-panel') as HTMLElement;
      const results = document.querySelector('[aria-labelledby="terdekat-title"]') as HTMLElement;
      const p = panel.getBoundingClientRect();
      const r = results.getBoundingClientRect();
      return p.left < r.right && p.right > r.left && p.top < r.bottom && p.bottom > r.top;
    });
    expect(covered).toBe(true);
  });

  test.describe('single-column md layout (900px)', () => {
    test.use({ viewport: { width: 900, height: 800 } });

    // The real layering guard: here the map is full width right under the trigger, and Leaflet's
    // own panes carry z-indexes, so the overlay only wins by stacking above the map.
    test('the overlay stacks above the map itself and wins every hit test', async ({ page }) => {
      await openPeta(page);
      await openOverlay(page);

      const report = await hitTestPanel(page);
      expect(report.panel.bottom).toBeGreaterThan(report.map.top);
      expect(report.probesOverMap).toBeGreaterThan(0);
      // Painted above Leaflet: every probe hits the panel, none hit the map.
      expect(report.hitsPanel).toBe(report.probes);
      expect(report.hitsLeaflet).toBe(0);
    });
  });

  // Focus return to the trigger is not asserted: the panel has no other focusable element, so
  // such an assertion could not fail. See src/__tests__/MapSummaryDropdown.spec.ts.
  test('closes on an outside click and on Escape', async ({ page }) => {
    await openPeta(page);
    const trigger = page.getByRole('button', { name: 'Ringkasan data' });
    const panel = page.locator('#map-summary-panel');

    await trigger.click();
    await expect(panel).toBeVisible();
    // Clicks inside the panel keep it open.
    await panel.getByText('Statistik Wilayah').click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await page.getByRole('heading', { name: 'Sebaran Titik Spasial' }).click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();

    await trigger.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
  });
});
