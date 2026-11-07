import type { Page } from '@playwright/test';
import { expect } from './test';

/**
 * Shared helpers for the /peta map-summary specs (R24, PR #120). jsdom has no layout or paint
 * order, so these probe real geometry and `document.elementFromPoint` in Chromium.
 */

export interface Snapshot {
  /** Leaflet's translate3d for the map pane: changes when the view pans or zooms. */
  panTransform: string;
  /** First marker icon, relative to the map container so page layout shifts do not matter. */
  marker: { x: number; y: number } | null;
  /** First loaded tile URL: a different one means the view moved to other tiles. */
  tile: string | null;
}

export interface HitReport {
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

export async function openPeta(page: Page) {
  await page.goto('/peta');
  const map = page.locator('.leaflet-container');
  await expect(map).toBeVisible();
  // Real Leaflet layers: at least one loaded tile image and one marker.
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
  // The summary is fetched from the mocked API; the trigger only renders once it arrives.
  await expect(page.getByRole('button', { name: 'Ringkasan data' })).toBeVisible();
}

export async function mapSnapshot(page: Page): Promise<Snapshot> {
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
export async function hitTestPanel(page: Page): Promise<HitReport> {
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

/** Resolves once Leaflet has no tile left mid-load, so the view is visually settled. */
export async function expectTilesSettled(page: Page) {
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.locator('.leaflet-tile:not(.leaflet-tile-loaded)')).toHaveCount(0);
}
