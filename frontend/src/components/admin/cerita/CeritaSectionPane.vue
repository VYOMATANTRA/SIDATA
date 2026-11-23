<script setup lang="ts">
import BaseButton from '../../common/BaseButton.vue';
import CeritaSectionEditor from './CeritaSectionEditor.vue';
import { ceritaIds } from './ceritaDomIds';

/**
 * The centre column of the Cerita editor: the selected section's location, its actions (rename,
 * Duplikat, Naik, Turun, Hapus bagian), its heading, the paragraph and figure editors, and the
 * previous and next section. The pane only reports what was asked; the view runs the dialogs, the
 * saves and the selection. The paragraph and figure editors keep their own Simpan buttons.
 */
defineProps<{
  sectionId: string;
  chapterLabel: string;
  sectionNumber: string;
  title: string;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  duplicating: boolean;
  prev: { number: string; title: string } | null;
  next: { number: string; title: string } | null;
}>();

const emit = defineEmits<{
  (e: 'rename'): void;
  (e: 'duplicate'): void;
  (e: 'move', direction: -1 | 1): void;
  (e: 'delete'): void;
  (e: 'prev'): void;
  (e: 'next'): void;
  (e: 'busy', value: boolean): void;
  (e: 'dirty-change', value: boolean): void;
}>();

</script>

<template>
  <section :aria-labelledby="ceritaIds.sectionHeading" class="min-w-0 space-y-6" data-test="section-pane">
    <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <nav aria-label="Lokasi bagian" class="min-w-0">
        <ol class="text-text-muted flex flex-wrap items-center gap-x-2 text-sm" data-test="breadcrumb">
          <li class="break-words">{{ chapterLabel }}</li>
          <li aria-hidden="true">›</li>
          <li class="text-brand-navy font-medium" aria-current="location">Bagian {{ sectionNumber }}</li>
        </ol>
      </nav>

      <div class="flex flex-wrap items-center gap-2">
        <BaseButton
          type="button"
          variant="secondary"
          size="sm"
          class="min-h-11"
          :disabled="busy"
          data-test="section-rename-current"
          @click="emit('rename')"
        >
          Ubah judul
        </BaseButton>
        <BaseButton
          :id="ceritaIds.sectionDuplicate"
          type="button"
          variant="secondary"
          size="sm"
          class="min-h-11"
          :disabled="busy"
          :aria-busy="duplicating ? 'true' : undefined"
          data-test="section-duplicate"
          @click="emit('duplicate')"
        >
          {{ duplicating ? 'Menggandakan…' : 'Duplikat' }}
        </BaseButton>
        <BaseButton
          type="button"
          variant="secondary"
          size="sm"
          class="min-h-11"
          :disabled="busy || isFirst"
          data-test="section-up"
          @click="emit('move', -1)"
        >
          Naik
        </BaseButton>
        <BaseButton
          type="button"
          variant="secondary"
          size="sm"
          class="min-h-11"
          :disabled="busy || isLast"
          data-test="section-down"
          @click="emit('move', 1)"
        >
          Turun
        </BaseButton>
        <BaseButton
          type="button"
          variant="secondary"
          size="sm"
          class="min-h-11"
          :disabled="busy"
          data-test="section-delete"
          @click="emit('delete')"
        >
          Hapus bagian
        </BaseButton>
      </div>
    </div>

    <h3
      :id="ceritaIds.sectionHeading"
      tabindex="-1"
      class="text-brand-navy text-xl font-semibold break-words outline-none"
      data-test="section-heading"
    >
      <span class="text-text-muted font-normal">{{ sectionNumber }}</span> {{ title }}
    </h3>

    <CeritaSectionEditor
      :key="sectionId"
      :section-id="sectionId"
      @busy="emit('busy', $event)"
      @dirty-change="emit('dirty-change', $event)"
    />

    <nav
      aria-label="Bagian sebelumnya dan berikutnya"
      class="border-border flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-between"
    >
      <BaseButton
        v-if="prev"
        :id="ceritaIds.sectionPrev"
        type="button"
        variant="secondary"
        size="md"
        class="min-h-11 justify-start"
        :disabled="busy"
        data-test="section-prev"
        @click="emit('prev')"
      >
        ← {{ prev.number }} {{ prev.title }}
      </BaseButton>
      <span v-else aria-hidden="true"></span>
      <BaseButton
        v-if="next"
        :id="ceritaIds.sectionNext"
        type="button"
        variant="secondary"
        size="md"
        class="min-h-11 justify-end sm:text-right"
        :disabled="busy"
        data-test="section-next"
        @click="emit('next')"
      >
        {{ next.number }} {{ next.title }} →
      </BaseButton>
    </nav>
  </section>
</template>
