import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SectionProse from '../components/cerita/SectionProse.vue';

function render(body: string) {
  return mount(SectionProse, { props: { body } });
}

describe('SectionProse', () => {
  it('renders plain text with its line breaks kept in the paragraph', () => {
    const wrapper = render('Baris satu.\nBaris dua.');
    const paragraph = wrapper.find('p');
    expect(paragraph.text()).toBe('Baris satu.\nBaris dua.');
    expect(paragraph.classes()).toContain('whitespace-pre-line');
    expect(wrapper.find('[data-test="section-prose"]').exists()).toBe(true);
  });

  it('renders bold, italic and safe links as real elements', () => {
    const wrapper = render('**Tebal**, *miring* dan [sumber](https://example.go.id/data).');
    expect(wrapper.find('strong').text()).toBe('Tebal');
    expect(wrapper.find('em').text()).toBe('miring');
    const link = wrapper.find('a');
    expect(link.attributes('href')).toBe('https://example.go.id/data');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
    expect(link.text()).toBe('sumber');
  });

  it('renders a list with list items', () => {
    const wrapper = render('Pembuka\n\n- satu\n- **dua**');
    expect(wrapper.findAll('p')).toHaveLength(1);
    const items = wrapper.findAll('ul > li');
    expect(items.map((item) => item.text())).toEqual(['satu', 'dua']);
    expect(items[1]!.find('strong').text()).toBe('dua');
  });

  it('shows a stored script tag and image handler as literal text, never as elements', () => {
    const body = '<script>alert(1)</script> <img src=x onerror="alert(1)">';
    const wrapper = render(body);
    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('p').text()).toBe(body);
  });

  it('does not render a javascript: link as an anchor', () => {
    const wrapper = render('[klik](javascript:alert(1))');
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.find('p').text()).toBe('[klik](javascript:alert(1))');
  });

  it('shows an HTML tag typed into the body as text', () => {
    const wrapper = render('<b>x</b>');
    expect(wrapper.find('b').exists()).toBe(false);
    expect(wrapper.find('p').text()).toBe('<b>x</b>');
  });
});
