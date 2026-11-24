import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import AdminHeader from '../components/admin/AdminHeader.vue';
import { ADMIN_HEADER_TITLE_ID, setAdminHeader } from '../composables/useAdminHeader';

async function mountHeader() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin', component: { template: '<div />' }, meta: { title: 'Beranda', breadcrumb: [] } },
      {
        path: '/admin/cerita',
        component: { template: '<div />' },
        meta: { title: 'Cerita', breadcrumb: ['Cerita'] },
      },
    ],
  });
  await router.push('/admin/cerita');
  await router.isReady();
  return mount(AdminHeader, { global: { plugins: [router] } });
}

describe('AdminHeader.vue', () => {
  beforeEach(() => {
    setAdminHeader('', '');
  });

  it('renders one h1 with the shared id, focusable from script, and the subtitle', async () => {
    setAdminHeader('Cerita', 'Kelola seluruh storytelling data yang ada di sini.');
    const wrapper = await mountHeader();

    const h1 = wrapper.find('h1');
    expect(h1.text()).toBe('Cerita');
    expect(h1.attributes('id')).toBe(ADMIN_HEADER_TITLE_ID);
    expect(h1.attributes('tabindex')).toBe('-1');
    expect(wrapper.find('p').text()).toContain('Kelola seluruh');
    expect(wrapper.findAll('h1')).toHaveLength(1);
    wrapper.unmount();
  });

  it('leaves the route breadcrumb to AdminLayout when no trail is set, and keeps the default size', async () => {
    setAdminHeader('Cerita', 'Kelola');
    const wrapper = await mountHeader();

    expect(wrapper.find('[data-test="admin-breadcrumb"]').exists()).toBe(false);
    expect(wrapper.find('h1').classes()).toContain('md:text-3xl');
    expect(wrapper.find('[data-test="admin-header"]').classes()).toContain('py-8');
    wrapper.unmount();
  });

  it('renders the trail above the h1 without Beranda, and uses the compact size', async () => {
    setAdminHeader('Kependudukan', 'Potret', {
      trail: [{ label: 'Cerita', to: '/admin/cerita' }, { label: 'Kependudukan' }],
      compact: true,
    });
    const wrapper = await mountHeader();

    const crumb = wrapper.find('[data-test="admin-breadcrumb"]');
    expect(crumb.text()).not.toContain('Beranda');
    expect(crumb.find('a').attributes('href')).toBe('/admin/cerita');
    expect(crumb.find('[aria-current="page"]').text()).toBe('Kependudukan');
    // The breadcrumb comes first in the header, then the title.
    const header = wrapper.find('[data-test="admin-header"]').element;
    const order = Array.from(header.querySelectorAll('nav, h1'));
    expect(order.map((node) => node.tagName)).toEqual(['NAV', 'H1']);

    const h1 = wrapper.find('h1');
    expect(h1.classes()).toContain('text-2xl');
    expect(h1.classes()).not.toContain('md:text-3xl');
    expect(wrapper.find('[data-test="admin-header"]').classes()).toContain('py-4');
    wrapper.unmount();
  });

  it('offers an empty actions slot for teleported page actions', async () => {
    const wrapper = await mountHeader();
    const slot = wrapper.find('#admin-header-actions');
    expect(slot.exists()).toBe(true);
    expect(wrapper.find('[data-test="admin-header-actions"]').element).toBe(slot.element);
    wrapper.unmount();
  });
});
