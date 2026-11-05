import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import SpatialPointDrawer from '../components/maps/SpatialPointDrawer.vue';
import type { SpatialPointDTO, RtLeaderDTO } from '../types/maps';
import { MANGGAR_MAP_ORIGIN } from '../constants/mapOrigin';

// The drawer links to the Ketua RT page (SPEC §8), so it always needs a router.
function mountDrawer(props: { point: SpatialPointDTO | null }, attachTo?: HTMLElement) {
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
  const sampleLeaderWa: RtLeaderDTO = {
    rtNumber: 1,
    name: 'Bambang Supriyanto',
    phone: '081234567801',
    phoneIsWhatsapp: true,
    alamat: 'Jl. Mulawarman No. 12',
    coordinates: {
      latitude: MANGGAR_MAP_ORIGIN.latitude,
      longitude: MANGGAR_MAP_ORIGIN.longitude,
      pointId: 'point-1',
    },
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  };

  const sampleLeaderCallOnly: RtLeaderDTO = {
    rtNumber: 1,
    name: 'Ahmad Dahlan',
    phone: '081234567802',
    phoneIsWhatsapp: false,
    alamat: 'Jl. Pemuda RT 01',
    coordinates: null,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  };

  const samplePoint: SpatialPointDTO = {
    id: 'point-1',
    name: 'Pos RT 01',
    type: 'ketua_rt',
    latitude: MANGGAR_MAP_ORIGIN.latitude,
    longitude: MANGGAR_MAP_ORIGIN.longitude,
    metadata: { note: 'Posyandu' },
    rts: [1],
    rtLeader: sampleLeaderWa,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  };

  it('renders WhatsApp action button when phoneIsWhatsapp is true (SPEC §7)', () => {
    const wrapper = mountDrawer({ point: samplePoint });

    expect(wrapper.text()).toContain('Pos RT 01');
    expect(wrapper.text()).toContain('Bambang Supriyanto');
    expect(wrapper.text()).toContain('Chat WhatsApp');

    const button = wrapper.find('a[href^="https://wa.me/"]');
    expect(button.attributes('href')).toContain('https://wa.me/6281234567801');
  });

  it('renders Call Only action button when phoneIsWhatsapp is false (SPEC §7)', () => {
    const wrapper = mountDrawer({
      point: { ...samplePoint, rtLeader: sampleLeaderCallOnly },
    });

    expect(wrapper.text()).toContain('Ahmad Dahlan');
    expect(wrapper.text()).toContain('Hubungi Telepon');

    const button = wrapper.find('a[href^="tel:"]');
    expect(button.attributes('href')).toBe('tel:081234567802');
  });

  it('does not render contact buttons when phone is a placeholder like "-"', () => {
    const wrapper = mountDrawer({
      point: {
        ...samplePoint,
        rtLeader: { ...sampleLeaderWa, phone: '-' },
      },
    });

    expect(wrapper.find('a[href^="https://wa.me/"]').exists()).toBe(false);
    expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false);
  });

  it('extracts primary number for WhatsApp when phone contains multiple numbers', () => {
    const wrapper = mountDrawer({
      point: {
        ...samplePoint,
        rtLeader: { ...sampleLeaderWa, phone: '081234567801 / 081987654321' },
      },
    });

    const button = wrapper.find('a[href^="https://wa.me/"]');
    expect(button.exists()).toBe(true);
    expect(button.attributes('href')).toContain('https://wa.me/6281234567801');
  });

  it('emits close event when close button is clicked', async () => {
    const wrapper = mountDrawer({ point: samplePoint });

    await wrapper.find('button[aria-label="Tutup"]').trigger('click');
    expect(wrapper.emitted('close')).toBeDefined();
  });

  it('keeps the WhatsApp icon once BaseButton moved to the leftIcon slot', () => {
    const wrapper = mountDrawer({ point: samplePoint });

    const button = wrapper.find('a[href^="https://wa.me/"]');
    expect(button.find('[data-test="left-icon"]').exists()).toBe(true);
    expect(button.find('svg').exists()).toBe(true);
    expect(button.attributes('withicon')).toBeUndefined();
  });

  it('links to the Ketua RT page as the map entry point (SPEC §8)', () => {
    const wrapper = mountDrawer({ point: samplePoint });

    const link = wrapper.find('a[href="/ketua-rt"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain('Lihat seluruh daftar Ketua RT');
  });

  it('moves focus to the close button so keyboard users land inside the detail', async () => {
    const wrapper = mountDrawer({ point: samplePoint }, document.body);
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const closeButton = wrapper.find('button[aria-label="Tutup"]').element;
    expect(document.activeElement).toBe(closeButton);

    wrapper.unmount();
  });

  it('shows unpadded RT numbers in coverage chips', () => {
    const wrapper = mountDrawer({
      point: { ...samplePoint, rts: [5, 12], rtLeader: null },
    });
    expect(wrapper.text()).toContain('RT 5');
    expect(wrapper.text()).toContain('RT 12');
    expect(wrapper.text()).not.toContain('RT 05');
  });

  // --- Invariant regression tests (§4) ---

  it('omits contact card when rtLeader is null on a valid point', () => {
    const wrapper = mountDrawer({
      point: { ...samplePoint, rtLeader: null },
    });
    expect(wrapper.text()).not.toContain('Kontak Ketua RT');
    expect(wrapper.find('a[href^="https://wa.me/"]').exists()).toBe(false);
    expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false);
    // General link to directory still renders
    expect(wrapper.find('a[href="/ketua-rt"]').exists()).toBe(true);
  });

  it('omits contact card and actions when point has an integrityWarning', () => {
    const wrapper = mountDrawer({
      point: {
        ...samplePoint,
        integrityWarning: 'Multiple ketua_rt points assigned to RT 1',
        rtLeader: sampleLeaderWa,
      },
    });

    expect(wrapper.text()).toContain('Peringatan Integritas Data');
    expect(wrapper.text()).toContain('Multiple ketua_rt points assigned to RT 1');
    expect(wrapper.text()).not.toContain('Kontak Ketua RT');
    expect(wrapper.text()).not.toContain('Bambang Supriyanto');
    expect(wrapper.find('a[href^="https://wa.me/"]').exists()).toBe(false);
    expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false);
  });

  it('omits contact card and actions when point spans multiple RTs', () => {
    const wrapper = mountDrawer({
      point: {
        ...samplePoint,
        rts: [1, 2],
        rtLeader: sampleLeaderWa,
      },
    });

    expect(wrapper.text()).not.toContain('Kontak Ketua RT');
    expect(wrapper.find('a[href^="https://wa.me/"]').exists()).toBe(false);
  });

  it('omits contact card when embedded leader rtNumber does not match point RT', () => {
    const wrapper = mountDrawer({
      point: {
        ...samplePoint,
        rts: [1],
        rtLeader: { ...sampleLeaderWa, rtNumber: 99 },
      },
    });

    expect(wrapper.text()).not.toContain('Kontak Ketua RT');
    expect(wrapper.find('a[href^="https://wa.me/"]').exists()).toBe(false);
  });

  it('omits contact card on non-ketua_rt point even if rtLeader is accidentally present', () => {
    const wrapper = mountDrawer({
      point: {
        ...samplePoint,
        type: 'bank_sampah',
        rtLeader: sampleLeaderWa,
      },
    });

    expect(wrapper.text()).not.toContain('Kontak Ketua RT');
    expect(wrapper.find('a[href^="https://wa.me/"]').exists()).toBe(false);
  });
});
