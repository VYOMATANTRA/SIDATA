import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PublicSettingsForm from '../components/data/PublicSettingsForm.vue';
import { DEFAULT_PUBLIC_SETTINGS } from '../stores/settings.store';

describe('PublicSettingsForm.vue', () => {
  it('renders settings fields and emits update payload on submit', async () => {
    const wrapper = mount(PublicSettingsForm, {
      props: {
        settings: DEFAULT_PUBLIC_SETTINGS,
      },
    });

    expect(wrapper.find('input#settings-appName').exists()).toBe(true);
    expect(wrapper.find('input#settings-institutionName').exists()).toBe(true);
    expect(wrapper.find('input#settings-contactPhone').exists()).toBe(true);
    expect(wrapper.find('input#settings-lat').exists()).toBe(true);

    await wrapper.find('input#settings-appName').setValue('SIDATA 2026');
    await wrapper.find('input#settings-contactPhone').setValue('081122334455');
    await wrapper.find('input#settings-lat').setValue(-1.22);
    await wrapper.find('form').trigger('submit.prevent');

    const emitted = wrapper.emitted('submit');
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]?.[0]).toMatchObject({
      appName: 'SIDATA 2026',
      contactPhone: '081122334455',
      defaultCoordinates: expect.objectContaining({
        lat: -1.22,
      }),
    });
  });

  it('validates invalid email format and prevents submission', async () => {
    const wrapper = mount(PublicSettingsForm, {
      props: {
        settings: DEFAULT_PUBLIC_SETTINGS,
      },
    });

    await wrapper.find('input#settings-contactEmail').setValue('invalid-email');
    await wrapper.find('form').trigger('submit.prevent');

    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(wrapper.text()).toContain('Format email tidak valid.');
  });

  it('validates coordinate range limits', async () => {
    const wrapper = mount(PublicSettingsForm, {
      props: {
        settings: DEFAULT_PUBLIC_SETTINGS,
      },
    });

    await wrapper.find('input#settings-lat').setValue(150);
    await wrapper.find('form').trigger('submit.prevent');

    expect(wrapper.emitted('submit')).toBeFalsy();
    expect(wrapper.text()).toContain('Latitude harus berupa angka antara -90 dan 90.');
  });
});
