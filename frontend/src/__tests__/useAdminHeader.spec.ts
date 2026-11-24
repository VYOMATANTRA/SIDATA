import { beforeEach, describe, expect, it } from 'vitest';
import { setAdminHeader, useAdminHeader } from '../composables/useAdminHeader';

describe('useAdminHeader', () => {
  beforeEach(() => {
    setAdminHeader('', '');
  });

  it('shares the title and subtitle between callers', () => {
    setAdminHeader('Cerita', 'Kelola');
    const { title, subtitle } = useAdminHeader();
    expect(title.value).toBe('Cerita');
    expect(subtitle.value).toBe('Kelola');
  });

  it('defaults the trail to none and the compact flag to off', () => {
    setAdminHeader('Beranda');
    expect(useAdminHeader().trail.value).toBeNull();
    expect(useAdminHeader().compact.value).toBe(false);
  });

  it('keeps a trail and compact flag only for the call that set them', () => {
    const trail = [{ label: 'Cerita', to: '/admin/cerita' }, { label: 'Kependudukan' }];
    setAdminHeader('Kependudukan', 'Potret', { trail, compact: true });
    expect(useAdminHeader().trail.value).toEqual(trail);
    expect(useAdminHeader().compact.value).toBe(true);

    setAdminHeader('Cerita', 'Kelola');
    expect(useAdminHeader().trail.value).toBeNull();
    expect(useAdminHeader().compact.value).toBe(false);
  });
});
