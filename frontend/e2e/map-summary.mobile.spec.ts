import { expect, test } from './support/test';
import { expectTilesSettled, hitTestPanel, mapSnapshot, openPeta } from './support/peta';

/**
 * R24 (PR #120), below `md` (768px): the "Ringkasan data" panel is in-flow page content that
 * pushes the map down, so it can never be painted under, or have its taps swallowed by, Leaflet.
 * Only the mobile projects run this file (`testMatch` in playwright.config.ts).
 */
test.describe('/peta map summary: in-flow disclosure below md', () => {
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
    // The post-open invalidateSize() may request more tiles; baseline only once they are in.
    await expectTilesSettled(page);
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
    await expectTilesSettled(page);

    const after = await mapSnapshot(page);
    expect(after).toEqual(before);
    // The panel is still open: taps inside are not an outside click.
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  // Focus return to the trigger is NOT asserted here: the panel has no other focusable element,
  // so focus is on the trigger before and after Escape and such an assertion could not fail.
  // That behaviour is covered in src/__tests__/MapSummaryDropdown.spec.ts.
  test('Escape closes the panel and the trigger can reopen it', async ({ page }) => {
    await openPeta(page);
    const trigger = page.getByRole('button', { name: 'Ringkasan data' });
    const panel = page.locator('#map-summary-panel');

    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();

    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
  });
});
