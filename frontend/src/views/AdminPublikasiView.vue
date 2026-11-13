<script setup lang="ts">
/**
 * `/admin/publikasi`: the publication catalog (SPEC §4, §8). Editors and Admins add, edit, reorder
 * and remove publications, give each an uploaded PDF/DOCX or an https link, and choose a cover
 * (page 1 of a PDF by default). Saving goes through `PUT /api/publikasi/catalog`, which also
 * publishes or releases the uploaded files, and then refreshes the shared content blocks so
 * `/publikasi` shows the change at once.
 *
 * Header title and subtitle live in route `meta` (router/index.ts), so this view starts at <h2>.
 */
import { onMounted, ref } from 'vue';
import PublikasiCatalogForm from '../components/admin/publikasi/PublikasiCatalogForm.vue';
import type { BlockSavePayload } from '../components/data/blocks/blockFormShared';
import { useContentBlocksStore, type ContentBlock } from '../stores/contentBlocks.store';
import { classifyFailure, toUserMessage } from '../utils/userMessages';

const store = useContentBlocksStore();

const BLOCK_SLUG = 'publikasi-katalog';
const saving = ref(false);
const serverError = ref('');
const stale = ref(false);
const status = ref('');
/** Bumped to remount the form with freshly stored values (after a save or "Muat versi terbaru"). */
const formVersion = ref(0);

/**
 * The block the open form was filled from. It is a snapshot, not the live store value: a refetch
 * after a stale-write refusal must not remount the form and drop what the editor typed. Only
 * a save or "Muat versi terbaru" replaces it.
 */
const block = ref<ContentBlock | null>(null);

onMounted(async () => {
  await store.fetchBlocks(true);
  block.value = store.serverBlocks[BLOCK_SLUG] ?? null;
});

async function handleSubmit(payload: BlockSavePayload): Promise<void> {
  const target = block.value;
  if (!target || saving.value) return;
  saving.value = true;
  serverError.value = '';
  status.value = '';
  try {
    const publications = (payload.metadata?.publications ?? []) as Array<Record<string, unknown>>;
    const saved = await store.savePublikasiCatalog({
      title: payload.title ?? target.title ?? '',
      body: payload.body,
      publications,
      expectedUpdatedAt: target.updatedAt,
    });
    block.value = saved;
    stale.value = false;
    formVersion.value += 1;
    status.value = 'Katalog publikasi disimpan.';
  } catch (error) {
    // Every field stays as typed; nothing is cleared on a failed save.
    serverError.value = toUserMessage(error, 'menyimpan katalog publikasi', 'PUT').message;
    if (classifyFailure(error).kind === 'stale') stale.value = true;
  } finally {
    saving.value = false;
  }
}

async function handleReload(): Promise<void> {
  await store.fetchBlocks(true);
  block.value = store.serverBlocks[BLOCK_SLUG] ?? null;
  serverError.value = '';
  stale.value = false;
  formVersion.value += 1;
  status.value = 'Versi terbaru katalog publikasi dimuat.';
}

function handleCancel(): void {
  formVersion.value += 1;
  serverError.value = '';
  stale.value = false;
  status.value = 'Perubahan yang belum disimpan dibuang.';
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-brand-navy text-lg font-semibold">Katalog publikasi</h2>
    <p class="text-text-muted max-w-3xl text-sm">
      Ini daftar yang warga lihat di halaman Publikasi. Berkas yang diunggah baru tampil di situs
      setelah katalog disimpan.
    </p>

    <p v-if="store.isLoading && !block" class="text-text-muted text-sm" role="status">
      Memuat katalog publikasi…
    </p>
    <p
      v-else-if="!block"
      class="rounded-card border-border bg-surface-muted text-text-muted border px-4 py-3 text-sm"
      data-test="publikasi-unavailable"
    >
      {{ store.error || 'Katalog publikasi belum tersedia untuk lingkungan ini.' }}
    </p>

    <PublikasiCatalogForm
      v-else
      :key="formVersion"
      :block="block"
      :busy="saving"
      :server-error="serverError"
      :stale="stale"
      id-prefix="publikasi"
      placement="Tampil di: halaman Publikasi (daftar dokumen)"
      @submit="handleSubmit"
      @cancel="handleCancel"
      @reload="handleReload"
    />

    <p class="sr-only" role="status" aria-live="polite" data-test="publikasi-status">
      {{ status }}
    </p>
  </div>
</template>
