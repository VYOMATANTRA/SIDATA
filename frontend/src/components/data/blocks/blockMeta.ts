import type { ContentBlock } from '../../../stores/contentBlocks.store';

/**
 * What kind of editor a content block gets, and where residents see it.
 *
 * The CMS never shows slugs or block types to staff: this module is the single place that turns
 * them into plain Indonesian names and placement sentences, and the dispatcher in
 * `ContentBlockForm.vue` reads the same registry so the card, the dialog header and the form
 * cannot disagree.
 */

export type BlockKind =
  'hero' | 'sambutan' | 'profil' | 'highlights' | 'publikasi' | 'cerita' | 'unknown';

interface StandaloneBlockInfo {
  kind: Exclude<BlockKind, 'cerita' | 'unknown'>;
  /** Short name used when the block has no title of its own. */
  name: string;
  /** "Tampil di: …" sentence shown on the card and in the dialog header. */
  placement: string;
  /** False when no public page reads the block (SPEC §4, decision D1). */
  visible: boolean;
}

const STANDALONE_BLOCKS: Readonly<Record<string, StandaloneBlockInfo>> = {
  'landing-hero': {
    kind: 'hero',
    name: 'Bagian atas Beranda',
    placement: 'Tampil di: Beranda, bagian atas',
    visible: true,
  },
  'landing-sambutan-lurah': {
    kind: 'sambutan',
    name: 'Sambutan Lurah',
    placement: 'Tampil di: Beranda, bagian Sambutan Lurah',
    visible: true,
  },
  'landing-highlights': {
    kind: 'highlights',
    name: 'Potensi unggulan',
    placement: 'Tidak ditampilkan di situs',
    visible: false,
  },
  'tentang-kelurahan-profil': {
    kind: 'profil',
    name: 'Profil Kelurahan',
    placement:
      'Tampil di: halaman Tentang Kelurahan Manggar (rincian wilayah, batas wilayah, dan susunan organisasi)',
    visible: true,
  },
  'publikasi-katalog': {
    kind: 'publikasi',
    name: 'Katalog Publikasi',
    placement: 'Tampil di: halaman Publikasi (daftar dokumen)',
    visible: true,
  },
};

/** Note shown above the form of a block that no page reads. */
export const HIDDEN_BLOCK_NOTE =
  'Isian di sini tersimpan, tetapi belum muncul di halaman mana pun. Mengubahnya tidak mengubah tampilan situs.';

export const UNKNOWN_BLOCK_MESSAGE =
  'Blok ini belum bisa diubah dari sini. Hubungi pengelola teknis.';

/** A block with no section is one of the fixed standalone slots. */
function isStandalone(block: ContentBlock): boolean {
  return !block.sectionId;
}

export function resolveBlockKind(block: ContentBlock): BlockKind {
  const known = STANDALONE_BLOCKS[block.slug];
  if (known && isStandalone(block)) return known.kind;
  if (!isStandalone(block) && block.type === 'prose') return 'cerita';
  return 'unknown';
}

/** True unless no public page reads the block. */
export function isBlockShownOnSite(block: ContentBlock): boolean {
  const known = isStandalone(block) ? STANDALONE_BLOCKS[block.slug] : undefined;
  return known ? known.visible : true;
}

/**
 * Where residents see the block. `sectionLabel` is the "Halaman › Bab" label of a Cerita block's
 * section, when the hierarchy has loaded.
 */
export function blockPlacement(block: ContentBlock, sectionLabel?: string | null): string {
  const known = isStandalone(block) ? STANDALONE_BLOCKS[block.slug] : undefined;
  if (known) return known.placement;
  if (!isStandalone(block) && block.type === 'prose') {
    return sectionLabel ? `Tampil di: Cerita, ${sectionLabel}` : 'Tampil di: halaman Cerita';
  }
  return 'Belum diketahui di mana blok ini tampil';
}

/** Card/dialog name: the block's own title, else a plain name for known blocks. */
export function blockDisplayName(block: ContentBlock): string {
  const title = block.title?.trim();
  if (title) return title;
  const known = isStandalone(block) ? STANDALONE_BLOCKS[block.slug] : undefined;
  return known?.name ?? 'Blok tanpa judul';
}
