import type { Page } from '@playwright/test';
import { expect, test } from './support/test';

/**
 * R24 (PR #120): the "Ringkasan data" panel on /peta must never be painted under, or have its
 * taps swallowed by, the Leaflet map. jsdom has no layout or paint order, so this is proven here
 * with real hit-testing (`document.elementFromPoint`) in Chromium.
 *
 * - below `md` (768px) the panel is in-flow page content: it pushes the map down.
 * - from `md` up it is an overlay that floats above the map.
 */

interface Snapshot {
  /** Leaflet's translate3d for the map pane: changes when the view pans or zooms. */
  panTransform: string;
  /** First marker icon, relative to the map container so page layout shifts do not matter. */
  marker: { x: number; y: number } | null;
  /** First loaded tile URL: a different one means the view moved to other tiles. */
  tile: string | null;
}

interface HitReport {
  panel: { top: number; bottom: number; left: number; right: number };
  map: { top: number; bottom: number };
  /** Probe points whose topmost element was the panel or one of its descendants. */
  hitsPanel: number;
  /** Probe points whose topmost element was inside `.leaflet-container`. */
  hitsLeaflet: number;
  probes: number;
  /** Probe points that fell inside the map's box (the overlay case needs some). */
  probesOverMap: number;
}

async function openPeta(page: Page) {
  await page.goto('/peta');
  const map = page.locator('.leaflet-container');
  await expect(map).toBeVisible();
  // Real Leaflet layers: at least one loaded tile image and one marker.
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
  // The summary is fetched from the mocked API; the trigger only renders once it arrives.
  await expect(page.getByRole('button', { name: 'Ringkasan data' })).toBeVisible();
}

async function mapSnapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const container = document.querySelector('.leaflet-container') as HTMLElement;
    const base = container.getBoundingClientRect();
    const marker = container.querySelector('.leaflet-marker-icon')?.getBoundingClientRect();
    const pane = container.querySelector('.leaflet-map-pane') as HTMLElement;
    const tile = container.querySelector('.leaflet-tile-loaded') as HTMLImageElement | null;
    return {
      panTransform: pane.style.transform,
      marker: marker ? { x: marker.x - base.x, y: marker.y - base.y } : null,
      tile: tile?.src ?? null,
    };
  });
}

/** Probes a 3x3 grid inset 12% from the panel's edges, all in one tick so nothing shifts. */
async function hitTestPanel(page: Page): Promise<HitReport> {
  return page.evaluate(() => {
    const panel = document.getElementById('map-summary-panel') as HTMLElement;
    const mapEl = document.querySelector('.leaflet-container') as HTMLElement;
    const p = panel.getBoundingClientRect();
    const m = mapEl.getBoundingClientRect();
    const report = {
      panel: { top: p.top, bottom: p.bottom, left: p.left, right: p.right },
      map: { top: m.top, bottom: m.bottom },
      hitsPanel: 0,
      hitsLeaflet: 0,
      probes: 0,
      probesOverMap: 0,
    };
    for (const fx of [0.12, 0.5, 0.88]) {
      for (const fy of [0.12, 0.5, 0.88]) {
        const x = p.left + p.width * fx;
        const y = p.top + p.height * fy;
        const el = document.elementFromPoint(x, y);
        report.probes += 1;
        if (y >= m.top && y <= m.bottom && x >= m.left && x <= m.right) report.probesOverMap += 1;
        if (el && (el === panel || panel.contains(el))) report.hitsPanel += 1;
        if (el && el.closest('.leaflet-container')) report.hitsLeaflet += 1;
      }
    }
    return report;
  });
}

test.describe('/peta map summary: in-flow disclosure below md', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, 'in-flow layout applies to the mobile projects only');
  });

  test('opens in-flow above the map and never overlaps it', async ({ page }) => {
    await openPeta(page);
    const trigger = page.getByRole('button', { name: 'Ringkasan data' });
    const panel = page.locator('#map-summary-panel');
    await expect(page.locator('[data-test="map-summary-dropdown"]')).toHaveAttribute(
      'data-layout',
      'inline',
    );
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();

    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    await panel.scrollIntoViewIfNeeded();

    const report = await hitTestPanel(page);
    // In-flow: the whole panel sits above the map, so they cannot overlap.
    expect(report.panel.bottom).toBeLessThanOrEqual(report.map.top);
    // Panel must lie within the viewport width (no horizontal clipping at 320).
    const width = page.viewportSize()?.width ?? 0;
    expect(report.panel.left).toBeGreaterThanOrEqual(0);
    expect(report.panel.right).toBeLessThanOrEqual(width);
    // Hit-testing inside the panel returns the panel, never Leaflet.
    expect(report.probes).toBe(9);
    expect(report.hitsPanel).toBe(report.probes);
    expect(report.hitsLeaflet).toBe(0);
  });

  test('taps inside the panel do not pan or zoom the map', async ({ page }) => {
    await openPeta(page);
    const trigger = page.getByRole('button', { name: 'Ringkasan data' });
    await trigger.tap();
    const panel = page.locator('#map-summary-panel');
    await expect(panel).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    // Let the post-open invalidateSize() and tile requests settle before taking the baseline.
    await page.waitForTimeout(400);
    const before = await mapSnapshot(page);
    expect(before.marker).not.toBeNull();

    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    const { x, y, width, height } = box!;
    for (const [fx, fy] of [
      [0.5, 0.2],
      [0.2, 0.5],
      [0.8, 0.5],
      [0.5, 0.85],
    ] as const) {
      await page.touchscreen.tap(x + width * fx, y + height * fy);
    }
    await page.waitForTimeout(300);

    const after = await mapSnapshot(page);
    expect(after).toEqual(before);
    // The panel is still open: taps inside are not an outside click.
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  test('Escape closes the panel and returns focus to the trigger', async ({ page }) => {
    await openPeta(page);
    const trigger = page.getByRole('button', { name: 'Ringkasan data' });
    const panel = page.locator('#map-summary-panel');

    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    await expect(trigger).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();

    // And it toggles back open, i.e. the trigger still works after Escape.
    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
  });
});

test.describe('/peta map summary: overlay from md up', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, 'overlay layout applies to the desktop project only');
  });

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
    await page.waitForTimeout(200);
    return { trigger, panel };
  }

  test('at 1280 it is an out-of-flow overlay that wins every hit test inside it', async ({
    page,
  }) => {
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
    // Painted above everything beneath it: every probe hits the panel, none hit Leaflet.
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

    test('the overlay sits above the map itself and wins every hit test', async ({ page }) => {
      await openPeta(page);
      await openOverlay(page);

      const report = await hitTestPanel(page);
      // Here the map is full width right under the trigger, so the overlay really covers it.
      expect(report.panel.bottom).toBeGreaterThan(report.map.top);
      expect(report.probesOverMap).toBeGreaterThan(0);
      // Painted above Leaflet: every probe hits the panel, none hit the map.
      expect(report.hitsPanel).toBe(report.probes);
      expect(report.hitsLeaflet).toBe(0);
    });
  });

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
    await expect(trigger).toBeFocused();
  });
});
