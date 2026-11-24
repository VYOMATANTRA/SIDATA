import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ReorderGripButton from '../components/admin/cards/ReorderGripButton.vue';

function mountGrip(props: Record<string, unknown> = {}) {
  return mount(ReorderGripButton, {
    attachTo: document.body,
    props: { id: 'grip-1', label: 'Pindahkan bagian 1.2: Judul', dataText: 'Judul', ...props },
  });
}

describe('ReorderGripButton', () => {
  it('is a labelled button that describes the keyboard reorder', () => {
    const wrapper = mountGrip();
    const grip = wrapper.get('button');
    expect(grip.attributes('aria-label')).toBe('Pindahkan bagian 1.2: Judul');
    expect(grip.attributes('aria-pressed')).toBe('false');
    expect(grip.attributes('aria-describedby')).toBeTruthy();
    expect(wrapper.get(`#${grip.attributes('aria-describedby')}`).text()).toContain('Escape');
    wrapper.unmount();
  });

  it('marks itself aria-disabled while busy and forwards no keys, keeping focusable', async () => {
    const wrapper = mountGrip({ disabled: true });
    const grip = wrapper.get('button');
    expect(grip.attributes('aria-disabled')).toBe('true');
    expect(grip.element.hasAttribute('disabled')).toBe(false);
    expect(wrapper.attributes('draggable')).toBe('false');
    await grip.trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('keydown')).toBeUndefined();
    grip.element.focus();
    expect(document.activeElement).toBe(grip.element);
    wrapper.unmount();
  });

  it('forwards keys while enabled and reports carried as aria-pressed', async () => {
    const wrapper = mountGrip({ carried: true });
    const grip = wrapper.get('button');
    expect(grip.attributes('aria-pressed')).toBe('true');
    await grip.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.emitted('keydown')).toHaveLength(1);
    wrapper.unmount();
  });
});
