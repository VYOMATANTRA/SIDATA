import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SpatialPointDrawer from '../components/maps/SpatialPointDrawer.vue';
import type { SpatialPointDTO, RtLeaderDTO } from '../types/maps';

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
    const wrapper = mount(SpatialPointDrawer, {
      props: {
        point: samplePoint,
        leader: sampleLeaderWa,
      },
    });

    expect(wrapper.text()).toContain('Pos RT 01');
    expect(wrapper.text()).toContain('Bambang Supriyanto');
    expect(wrapper.text()).toContain('Chat WhatsApp');

    const button = wrapper.find('a');
    expect(button.attributes('href')).toContain('https://wa.me/6281234567801');
  });

  it('renders Call Only action button when phoneIsWhatsapp is false (SPEC §7)', () => {
    const wrapper = mount(SpatialPointDrawer, {
      props: {
        point: samplePoint,
        leader: sampleLeaderCallOnly,
      },
    });

    expect(wrapper.text()).toContain('Ahmad Dahlan');
    expect(wrapper.text()).toContain('Hubungi Telepon');

    const button = wrapper.find('a');
    expect(button.attributes('href')).toBe('tel:081234567802');
  });

  it('emits close event when close button is clicked', async () => {
    const wrapper = mount(SpatialPointDrawer, {
      props: {
        point: samplePoint,
      },
    });

    await wrapper.find('button[aria-label="Tutup"]').trigger('click');
    expect(wrapper.emitted('close')).toBeDefined();
  });
});
