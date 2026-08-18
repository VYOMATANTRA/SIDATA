import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import TurnstileWidget from '../components/auth/TurnstileWidget.vue';

describe('TurnstileWidget', () => {
  const originalTurnstile = window.turnstile;

  beforeEach(() => {
    window.turnstile = {
      render: vi.fn<() => string>().mockReturnValue('widget-1'),
      remove: vi.fn<() => void>(),
      reset: vi.fn<() => void>(),
    };
  });

  afterEach(() => {
    window.turnstile = originalTurnstile;
  });

  it('renders the Cloudflare widget on mount', () => {
    mount(TurnstileWidget);
    expect(window.turnstile?.render).toHaveBeenCalledOnce();
  });

  it('exposes reset() so callers can clear a stale/consumed token after a failed submit', () => {
    const wrapper = mount(TurnstileWidget);

    wrapper.vm.reset();

    expect(window.turnstile?.reset).toHaveBeenCalledWith('widget-1');
  });

  it('reset() is a no-op when the widget never finished rendering', () => {
    window.turnstile = undefined;
    const wrapper = mount(TurnstileWidget);

    expect(() => wrapper.vm.reset()).not.toThrow();
  });
});
