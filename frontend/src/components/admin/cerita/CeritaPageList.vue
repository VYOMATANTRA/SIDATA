<script setup lang="ts">
import BaseButton from '../../common/BaseButton.vue';
import type { AdminPage } from '../../../stores/ceritaAdmin.store';
import { ceritaIds } from './ceritaDomIds';

/**
 * The master list of Cerita pages. Choosing one shows its chapters and sections beside (or, on a
 * phone, below) the list. The current page is marked with `aria-current`, never by colour alone.
 */
defineProps<{
  pages: readonly AdminPage[];
  selectedSlug: string | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', slug: string): void;
  (e: 'add'): void;
}>();
</script>

<template>
  <section aria-labelledby="cerita-daftar-judul" class="space-y-3" data-test="page-list">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="cerita-daftar-judul" class="text-brand-navy text-base font-semibold">
        Halaman Cerita
        <span class="text-text-muted font-normal">({{ pages.length }})</span>
      </h2>
      <BaseButton
        :id="ceritaIds.addPage"
        type="button"
        size="md"
        class="min-h-11"
        :disabled="busy"
        data-test="add-page"
        @click="emit('add')"
      >
        Tambah halaman
      </BaseButton>
    </div>

    <p
      v-if="pages.length === 0"
      class="rounded-card border-border-strong text-text-muted border border-dashed p-4 text-sm"
      data-test="page-empty"
    >
      Belum ada halaman. Pilih “Tambah halaman” untuk membuat halaman Cerita pertama.
    </p>

    <ol v-else class="space-y-2">
      <li v-for="(page, index) in pages" :key="page.id">
        <button
          :id="ceritaIds.pageSelect(page.slug)"
          type="button"
          class="rounded-card focus-visible:outline-focus-ring flex min-h-11 w-full items-start justify-between gap-3 border px-4 py-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          :class="
            page.slug === selectedSlug
              ? 'border-brand-navy bg-brand-navy text-text-inverse'
              : 'border-border bg-surface text-brand-navy hover:bg-surface-muted'
          "
          :aria-current="page.slug === selectedSlug ? 'true' : undefined"
          data-test="page-select"
          @click="emit('select', page.slug)"
        >
          <span class="min-w-0">
            <span class="block font-semibold break-words">
              <span class="sr-only">Urutan {{ index + 1 }}: </span>{{ page.title }}
            </span>
            <span
              class="block text-xs"
              :class="page.slug === selectedSlug ? 'text-text-inverse-muted' : 'text-text-muted'"
            >
              {{ page.chapters.length }} bab
            </span>
          </span>
          <span v-if="page.slug === selectedSlug" class="shrink-0 text-xs font-semibold">
            Dibuka
          </span>
        </button>
      </li>
    </ol>
  </section>
</template>
