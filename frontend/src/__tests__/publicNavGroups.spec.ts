import { describe, expect, it } from 'vitest';
import { createRouter, createMemoryHistory } from 'vue-router';
import {
  FOOTER_STORY_LINKS,
  buildCeritaItems,
  buildPublicNavGroups,
  isDestinationActive,
  isNavItemActive,
  isNavGroupActive,
  matchesPath,
} from '../config/publicNav';
import { getAdminEntryLink } from '../config/adminNav';

function routerWith(paths: string[]) {
  return createRouter({
    history: createMemoryHistory(),
    routes: paths.map((path) => ({ path, component: { template: '<div />' } })),
  });
}

const ALL_PUBLIC_ROUTES = [
  '/',
  '/cerita/:slug',
  '/publikasi',
  '/peta',
  '/ketua-rt',
  '/permintaan-data',
  '/tentang/kelurahan-manggar',
  '/tentang/desa-cantik',
  '/tentang/vyomatantra',
];

describe('matchesPath, isDestinationActive, and isNavItemActive (127-5)', () => {
  it('marks only the exact destination, so sibling Tentang pages are distinct', () => {
    expect(isDestinationActive('/tentang/desa-cantik', '/tentang/desa-cantik')).toBe(true);
    expect(isDestinationActive('/tentang/kelurahan-manggar', '/tentang/desa-cantik')).toBe(false);
  });

  it('matches nested paths below a destination but not look-alike prefixes', () => {
    expect(isDestinationActive('/publikasi', '/publikasi/2026')).toBe(true);
    expect(isDestinationActive('/peta', '/petani')).toBe(false);
  });

  it('matches home exactly', () => {
    expect(isDestinationActive('/', '/')).toBe(true);
    expect(isDestinationActive('/', '/peta')).toBe(false);
    expect(matchesPath('/', '/')).toBe(true);
    expect(matchesPath('/', '/peta')).toBe(false);
  });

  it('handles trailing slashes identically across matchesPath, isDestinationActive, and isNavItemActive', () => {
    // Trailing slash on to or currentPath
    expect(matchesPath('/peta/', '/peta')).toBe(true);
    expect(matchesPath('/peta', '/peta/')).toBe(true);
    expect(matchesPath('/peta/', '/peta/')).toBe(true);

    expect(isDestinationActive('/peta/', '/peta')).toBe(true);
    expect(isDestinationActive('/peta', '/peta/')).toBe(true);
    expect(isDestinationActive('/peta/', '/peta/')).toBe(true);

    expect(isNavItemActive('/peta/', '/peta')).toBe(true);
    expect(isNavItemActive('/peta', '/peta/')).toBe(true);
    expect(isNavItemActive('/tentang/kelurahan-manggar/', '/tentang/desa-cantik/')).toBe(true);
  });

  it('handles URI-encoded slugs identically across matchesPath, isDestinationActive, and isNavItemActive', () => {
    const encoded = '/cerita/tata%20ruang';
    const decoded = '/cerita/tata ruang';

    expect(matchesPath(encoded, decoded)).toBe(true);
    expect(matchesPath(decoded, encoded)).toBe(true);
    expect(matchesPath(`${encoded}/sub`, `${decoded}/sub`)).toBe(true);

    expect(isDestinationActive(encoded, decoded)).toBe(true);
    expect(isDestinationActive(decoded, encoded)).toBe(true);

    expect(isNavItemActive(encoded, decoded)).toBe(true);
    expect(isNavItemActive(decoded, encoded)).toBe(true);
  });
});

describe('buildCeritaItems', () => {
  it('derives links from the page hierarchy in sortOrder', () => {
    const items = buildCeritaItems([
      { slug: 'kesehatan', title: 'Kesehatan', sortOrder: 3 },
      { slug: 'kependudukan', title: 'Kependudukan', sortOrder: 1 },
      { slug: 'pendidikan', title: 'Pendidikan', sortOrder: 2 },
    ]);
    expect(items).toEqual([
      { label: 'Kependudukan', to: '/cerita/kependudukan' },
      { label: 'Pendidikan', to: '/cerita/pendidikan' },
      { label: 'Kesehatan', to: '/cerita/kesehatan' },
    ]);
  });

  it('falls back to the deterministic links when the hierarchy is missing or empty', () => {
    expect(buildCeritaItems(null)).toEqual([...FOOTER_STORY_LINKS]);
    expect(buildCeritaItems([])).toEqual([...FOOTER_STORY_LINKS]);
  });

  it('does not mutate its input', () => {
    const pages = [
      { slug: 'b', title: 'B', sortOrder: 2 },
      { slug: 'a', title: 'A', sortOrder: 1 },
    ];
    buildCeritaItems(pages);
    expect(pages.map((p) => p.slug)).toEqual(['b', 'a']);
  });
});

describe('buildPublicNavGroups', () => {
  it('builds Cerita, Sumber Daya and Tentang groups with every required destination', () => {
    const groups = buildPublicNavGroups(routerWith(ALL_PUBLIC_ROUTES), buildCeritaItems(null));
    expect(groups.map((g) => g.label)).toEqual(['Cerita', 'Sumber Daya', 'Tentang']);

    const resource = groups.find((g) => g.id === 'sumber-daya')!;
    expect(resource.items.map((i) => i.to).sort()).toEqual(
      ['/ketua-rt', '/peta', '/permintaan-data', '/publikasi'].sort(),
    );
    const about = groups.find((g) => g.id === 'tentang')!;
    expect(about.items.map((i) => i.to)).toEqual([
      '/tentang/kelurahan-manggar',
      '/tentang/desa-cantik',
      '/tentang/vyomatantra',
    ]);
  });

  it('drops links whose route is not registered and omits groups left empty', () => {
    const groups = buildPublicNavGroups(routerWith(['/', '/publikasi']), buildCeritaItems(null));
    expect(groups.map((g) => g.id)).toEqual(['sumber-daya']);
    expect(groups[0]!.items.map((i) => i.to)).toEqual(['/publikasi']);
  });

  it('marks a group active when any destination in it is current', () => {
    const groups = buildPublicNavGroups(routerWith(ALL_PUBLIC_ROUTES), buildCeritaItems(null));
    const active = groups.filter((g) => isNavGroupActive(g, '/ketua-rt')).map((g) => g.id);
    expect(active).toEqual(['sumber-daya']);
  });
});

describe('getAdminEntryLink', () => {
  it('returns nothing for a plain user', () => {
    expect(getAdminEntryLink({ isAdmin: false, canEditData: false })).toBeNull();
  });

  it('returns the admin shell entry for editors and admins', () => {
    expect(getAdminEntryLink({ isAdmin: false, canEditData: true })?.to).toBe('/admin');
    expect(getAdminEntryLink({ isAdmin: true, canEditData: true })?.to).toBe('/admin');
  });
});
