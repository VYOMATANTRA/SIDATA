import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import CeritaFigureEditor from '../components/admin/cerita/CeritaFigureEditor.vue';
import { useCeritaAdminStore } from '../stores/ceritaAdmin.store';
import { useAuthStore } from '../stores/auth';
import { createFakeCerita, type FakeCerita } from './ceritaFakeApi';

// Synthetic content only. Two tables on the page: one split by sex, one with totals only.
let fake: FakeCerita;
let sectionId: string;

async function mountEditor(): Promise<VueWrapper> {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().setAuth({ id: 'u-1', email: 'e@example.com', role: 'editor' }, 'token-1');
  await useCeritaAdminStore().load();
  const wrapper = mount(CeritaFigureEditor, {
    props: { sectionId },
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

/** Picks the "Grafik" tile and waits for the table list to load. */
async function chooseGrafik(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-test="kind-chart"]').trigger('change');
  await flushPromises();
}

async function chooseTable(wrapper: VueWrapper, tableId: string): Promise<void> {
  await wrapper.find('[data-test="chart-table"]').setValue(tableId);
  await nextTick();
}

function button(wrapper: VueWrapper, test: string): HTMLButtonElement {
  return wrapper.find(`[data-test="${test}"]`).element as HTMLButtonElement;
}

function pressed(wrapper: VueWrapper, test: string): string | undefined {
  return wrapper.find(`[data-test="${test}"]`).attributes('aria-pressed');
}

beforeEach(() => {
  document.body.innerHTML = '';
  fake = createFakeCerita();
  fake.addPage('Kependudukan', [{ title: 'Jumlah Penduduk', sections: ['Ringkasan'] }]);
  sectionId = fake.pages[0]!.chapters[0]!.sections[0]!.id;
  fake.addIndicatorTable({
    id: 'tab-umur',
    sectionId,
    title: 'Penduduk menurut umur',
    kind: 'age_pyramid',
    period: '2025 (contoh)',
  });
  fake.addIndicatorTable({
    id: 'tab-pekerjaan',
    sectionId,
    title: 'Pekerjaan',
    kind: 'occupation',
    period: '2025 (contoh)',
  });
  fake.install();
});

describe('Grafik chart types (SPEC §8)', () => {
  it('offers the six chart types in order, with plain Indonesian labels', async () => {
    const wrapper = await mountEditor();
    await chooseGrafik(wrapper);
    const labels = wrapper.findAll('[data-test^="chart-type-"]').map((el) => el.text());
    expect(labels).toEqual(['Batang', 'Kolom', 'Piramida', 'Donat', 'Bertumpuk', 'Persentase']);
  });

  it('enables the sex-only types on a table split by sex, and picking one selects by_sex', async () => {
    const wrapper = await mountEditor();
    await chooseGrafik(wrapper);
    await chooseTable(wrapper, 'tab-umur');

    expect(button(wrapper, 'chart-type-pyramid').disabled).toBe(false);
    expect(button(wrapper, 'chart-type-stacked').disabled).toBe(false);
    expect(button(wrapper, 'chart-type-percent').disabled).toBe(false);

    await wrapper.find('[data-test="chart-type-pyramid"]').trigger('click');
    await nextTick();
    expect(pressed(wrapper, 'chart-type-pyramid')).toBe('true');
    expect(pressed(wrapper, 'chart-series-by_sex')).toBe('true');
    expect(pressed(wrapper, 'chart-series-total')).toBe('false');
    expect(button(wrapper, 'chart-series-total').disabled).toBe(true);
    expect(wrapper.find('[data-test="chart-type-hint"]').text()).toContain('menurut jenis kelamin');
  });

  it('falls back to bars when the table changes to one without a sex split', async () => {
    const wrapper = await mountEditor();
    await chooseGrafik(wrapper);
    await chooseTable(wrapper, 'tab-umur');
    await wrapper.find('[data-test="chart-type-pyramid"]').trigger('click');
    await chooseTable(wrapper, 'tab-pekerjaan');
    await nextTick();

    expect(pressed(wrapper, 'chart-type-bar')).toBe('true');
    expect(pressed(wrapper, 'chart-series-total')).toBe('true');
    expect(button(wrapper, 'chart-series-total').disabled).toBe(false);
  });

  it('disables the sex-only types on a total-only table, with the existing hint', async () => {
    const wrapper = await mountEditor();
    await chooseGrafik(wrapper);
    await chooseTable(wrapper, 'tab-pekerjaan');

    expect(button(wrapper, 'chart-type-pyramid').disabled).toBe(true);
    expect(button(wrapper, 'chart-type-stacked').disabled).toBe(true);
    expect(button(wrapper, 'chart-type-percent').disabled).toBe(true);
    expect(button(wrapper, 'chart-type-donut').disabled).toBe(false);
    expect(button(wrapper, 'chart-type-bar').disabled).toBe(false);

    const hintId = wrapper.find('[data-test="chart-series-hint"]').attributes('id');
    expect(hintId).toBeTruthy();
    expect(wrapper.find('[data-test="chart-series-hint"]').text()).toBe(
      'Tabel ini hanya memuat jumlah total.',
    );
    expect(wrapper.find('[data-test="chart-type-pyramid"]').attributes('aria-describedby')).toBe(
      hintId,
    );
  });

  it('keeps the donut usable with the total of a total-only table', async () => {
    const wrapper = await mountEditor();
    await chooseGrafik(wrapper);
    await chooseTable(wrapper, 'tab-pekerjaan');
    await wrapper.find('[data-test="chart-type-donut"]').trigger('click');
    await nextTick();
    expect(pressed(wrapper, 'chart-type-donut')).toBe('true');
    expect(button(wrapper, 'chart-series-total').disabled).toBe(false);
    expect(pressed(wrapper, 'chart-series-total')).toBe('true');
    expect(wrapper.find('[data-test="chart-type-hint"]').exists()).toBe(false);
  });

  it('locks "Jumlah total" while a sex-only type is picked and frees it for a donut', async () => {
    const wrapper = await mountEditor();
    await chooseGrafik(wrapper);
    await chooseTable(wrapper, 'tab-umur');
    await wrapper.find('[data-test="chart-type-stacked"]').trigger('click');
    await nextTick();
    expect(button(wrapper, 'chart-series-total').disabled).toBe(true);

    await wrapper.find('[data-test="chart-type-donut"]').trigger('click');
    await nextTick();
    expect(button(wrapper, 'chart-series-total').disabled).toBe(false);
    expect(pressed(wrapper, 'chart-series-by_sex')).toBe('true');
  });
});
