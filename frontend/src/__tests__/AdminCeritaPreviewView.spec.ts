import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AdminCeritaPreviewView from '../views/AdminCeritaPreviewView.vue';
import CeritaSectionBody from '../components/cerita/CeritaSectionBody.vue';

describe('AdminCeritaPreviewView', () => {
  it('draws the section body with CeritaSectionBody, so it matches the reader', () => {
    const wrapper = mount(AdminCeritaPreviewView);

    expect(wrapper.findComponent(CeritaSectionBody).exists()).toBe(true);
  });

  it('no longer wraps the figure in its own grey panel', () => {
    const wrapper = mount(AdminCeritaPreviewView);

    expect(wrapper.find('[data-test="preview-stage"]').exists()).toBe(false);
    expect(wrapper.find('.bg-surface-muted.rounded-card').exists()).toBe(false);
  });
});
