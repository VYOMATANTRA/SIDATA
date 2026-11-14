import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import AlertBanner from '../components/common/AlertBanner.vue';
import { useAuthStore } from '../stores/auth';

const noop = () => {};
const retryBtn = (w: ReturnType<typeof mount>) => w.find('[data-test="alert-banner-retry"]');

describe('AlertBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders the message with role alert by default', () => {
    const w = mount(AlertBanner, { props: { message: 'Gagal memuat.' } });
    expect(w.attributes('role')).toBe('alert');
    expect(w.text()).toContain('Gagal memuat.');
  });

  it('uses role status when live is polite', () => {
    const w = mount(AlertBanner, { props: { message: 'x', live: 'polite' } });
    expect(w.attributes('role')).toBe('status');
  });

  it('shows retry when a listener is attached and kind is undefined', async () => {
    const calls: number[] = [];
    const w = mount(AlertBanner, {
      props: { message: 'x', onRetry: () => calls.push(1) },
    });
    expect(retryBtn(w).text()).toBe('Coba lagi');
    await retryBtn(w).trigger('click');
    expect(calls).toHaveLength(1);
  });

  it.each(['network', 'server', 'unknown', 'rate_limited'] as const)(
    'shows retry for retryable kind %s',
    (kind) => {
      const w = mount(AlertBanner, { props: { message: 'x', kind, onRetry: noop } });
      expect(retryBtn(w).exists()).toBe(true);
    },
  );

  it.each([
    'forbidden',
    'not_found',
    'validation',
    'conflict',
    'stale',
    'payload_too_large',
  ] as const)('hides retry for non-retryable kind %s', (kind) => {
    const w = mount(AlertBanner, { props: { message: 'x', kind, onRetry: noop } });
    expect(w.text()).toContain('x');
    expect(retryBtn(w).exists()).toBe(false);
  });

  it('hides retry without a listener', () => {
    const w = mount(AlertBanner, { props: { message: 'x', kind: 'network' } });
    expect(retryBtn(w).exists()).toBe(false);
  });

  it('supports a custom label and busy state', () => {
    const w = mount(AlertBanner, {
      props: { message: 'x', retryLabel: 'Muat ulang', busy: true, onRetry: noop },
    });
    expect(retryBtn(w).text()).toBe('Muat ulang');
    expect(retryBtn(w).attributes('disabled')).toBeDefined();
  });

  it('renders the message for session kind while the session has not ended', () => {
    const w = mount(AlertBanner, {
      props: { message: 'Sesi habis.', kind: 'session', onRetry: noop },
    });
    expect(w.text()).toContain('Sesi habis.');
    expect(retryBtn(w).exists()).toBe(false);
  });

  it('renders nothing for session kind once the session has ended', () => {
    useAuthStore().sessionEnded = true;
    const w = mount(AlertBanner, { props: { message: 'x', kind: 'session', onRetry: noop } });
    expect(w.find('[role]').exists()).toBe(false);
    expect(w.text()).toBe('');
  });

  it('renders the action slot and passes data-test through', () => {
    const w = mount(AlertBanner, {
      props: { message: 'x' },
      attrs: { 'data-test': 'my-banner' },
      slots: { action: '<button type="button" data-test="extra">Masuk</button>' },
    });
    expect(w.attributes('data-test')).toBe('my-banner');
    expect(w.find('[data-test="extra"]').exists()).toBe(true);
  });
});
