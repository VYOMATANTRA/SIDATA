import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CeritaPageCard from '../components/admin/cerita/CeritaPageCard.vue';
import type { AdminPage } from '../stores/ceritaAdmin.store';

const page: AdminPage = {
  id: 'p1',
  slug: 'kependudukan',
  title: 'Kependudukan',
  headline: null,
  bylineAuthor: null,
  bylineAffiliation: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  chapters: [],
};

/** A dragover/drop event the way the browser sends one, cancelable so preventDefault is visible. */
function dragEvent(type: 'dragover' | 'drop'): Event {
  return new Event(type, { bubbles: true, cancelable: true });
}

describe('CeritaPageCard drag guard', () => {
  it('ignores a file or text dragged in from outside: nothing is prevented or reported', async () => {
    const wrapper = mount(CeritaPageCard, { props: { page, sorting: true, dragActive: false } });
    const card = wrapper.element as HTMLElement;

    const over = dragEvent('dragover');
    card.dispatchEvent(over);
    const dropped = dragEvent('drop');
    card.dispatchEvent(dropped);
    await wrapper.vm.$nextTick();

    expect(over.defaultPrevented).toBe(false);
    expect(dropped.defaultPrevented).toBe(false);
    expect(wrapper.emitted('drag-over')).toBeUndefined();
    expect(wrapper.emitted('drop')).toBeUndefined();
    wrapper.unmount();
  });

  it('handles a drag of a card from this list: the drop is accepted and reported', async () => {
    const wrapper = mount(CeritaPageCard, { props: { page, sorting: true, dragActive: true } });
    const card = wrapper.element as HTMLElement;

    const over = dragEvent('dragover');
    card.dispatchEvent(over);
    card.dispatchEvent(dragEvent('drop'));
    await wrapper.vm.$nextTick();

    expect(over.defaultPrevented).toBe(true);
    expect(wrapper.emitted('drag-over')).toHaveLength(1);
    expect(wrapper.emitted('drop')).toHaveLength(1);
    wrapper.unmount();
  });
});
