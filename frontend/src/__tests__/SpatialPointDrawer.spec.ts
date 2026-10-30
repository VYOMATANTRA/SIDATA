import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import SpatialPointDrawer from '../components/maps/SpatialPointDrawer.vue';
import type { SpatialPointDTO, RtLeaderDTO } from '../types/maps';

// The drawer links to the Ketua RT page (SPEC §8), so it always needs a router.
function mountDrawer(
  props: {
    point: SpatialPointDTO | null;
    leader?: RtLeaderDTO | null;
    leaderError?: string | null;
  },
  attachTo?: HTMLElement,
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/ketua-rt', component: { template: '<div>Ketua RT</div>' } },
    ],
  });

  return mount(SpatialPointDrawer, {
    props,
    ...(attachTo ? { attachTo } : {}),
    global: { plugins: [router] },
  });
}

describe('SpatialPointDrawer.vue', () => {
  const samplePoint: SpatialPointDTO = {
    id: 'point-1',
    name: 'Pos RT 01',
    type: 'ketua_rt',
    latitude: -1.2235,
    longitude: 116.9521,
    metadata: { note: 'Posyandu' },
    rts: [1],
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  };

  const sampleLeaderWa: RtLeaderDTO = {
    rtNumber: 1,
    name: 'Bambang Supriyanto',
    phone: '081234567801',
    phoneIsWhatsapp: true,
    alamat: 'Jl. Mulawarman No. 12',
    coordinates: { latitude: -1.2235, longitude: 116.9521, pointId: 'point-1' },
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  };

  const sampleLeaderCallOnly: RtLeaderDTO = {
    rtNumber: 2,
    name: 'Ahmad Dahlan',
    phone: '081234567802',
    phoneIsWhatsapp: false,
    alamat: 'Jl. Pemuda RT 02',
    coordinates: null,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  };

  it('renders WhatsApp action button when phoneIsWhatsapp is true (SPEC §7)', () => {
    const wrapper = mountDrawer({
      point: samplePoint,
      leader: sampleLeaderWa,
    });

    expect(wrapper.text()).toContain('Pos RT 01');
    expect(wrapper.text()).toContain('Bambang Supriyanto');
    expect(wrapper.text()).toContain('Chat WhatsApp');

    const button = wrapper.find('a[href^="https://wa.me/"]');
    expect(button.attributes('href')).toContain('https://wa.me/6281234567801');
  });

  it('renders Call Only action button when phoneIsWhatsapp is false (SPEC §7)', () => {
    const wrapper = mountDrawer({
      point: samplePoint,
      leader: sampleLeaderCallOnly,
    });

    expect(wrapper.text()).toContain('Ahmad Dahlan');
    expect(wrapper.text()).toContain('Hubungi Telepon');

    const button = wrapper.find('a[href^="tel:"]');
    expect(button.attributes('href')).toBe('tel:081234567802');
  });

  it('emits close event when close button is clicked', async () => {
    const wrapper = mountDrawer({ point: samplePoint });

    await wrapper.find('button[aria-label="Tutup"]').trigger('click');
    expect(wrapper.emitted('close')).toBeDefined();
  });

  it('keeps the WhatsApp icon once BaseButton moved to the leftIcon slot', () => {
    const wrapper = mountDrawer({
      point: samplePoint,
      leader: sampleLeaderWa,
    });

    // The icon lives in the button's leading icon slot, not a dead #icon slot
    const button = wrapper.find('a[href^="https://wa.me/"]');
    expect(button.find('[data-test="left-icon"]').exists()).toBe(true);
    expect(button.find('svg').exists()).toBe(true);
    expect(button.attributes('withicon')).toBeUndefined();
  });

  it('links to the Ketua RT page as the map entry point (SPEC §8)', () => {
    const wrapper = mountDrawer({
      point: samplePoint,
      leader: sampleLeaderWa,
    });

    const link = wrapper.find('a[href="/ketua-rt"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain('Lihat seluruh daftar Ketua RT');
  });

  it('moves focus to the close button so keyboard users land inside the detail', async () => {
    // Focus can only move within the document, so this mount is attached.
    const wrapper = mountDrawer({ point: samplePoint }, document.body);
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const closeButton = wrapper.find('button[aria-label="Tutup"]').element;
    expect(document.activeElement).toBe(closeButton);

    wrapper.unmount();
  });

  it('shows unpadded RT numbers in coverage chips', () => {
    const wrapper = mountDrawer({
      point: { ...samplePoint, rts: [5, 12] },
    });
    expect(wrapper.text()).toContain('RT 5');
    expect(wrapper.text()).toContain('RT 12');
    expect(wrapper.text()).not.toContain('RT 05');
  });

  it('shows a retryable message when the leader lookup failed', async () => {
    const wrapper = mountDrawer({
      point: samplePoint,
      leader: null,
      leaderError: 'Gagal memuat kontak Ketua RT',
    });
    expect(wrapper.find('[data-test="drawer-leader-error"]').exists()).toBe(true);
    await wrapper.find('[data-test="drawer-leader-retry"]').trigger('click');
    expect(wrapper.emitted('retry-leader')).toBeDefined();
  });

});
