<script setup lang="ts">
import { ref } from 'vue';
import { TrashIcon } from '@heroicons/vue/24/outline';
import BaseButton from '../../common/BaseButton.vue';
import CeritaSectionEditor from './CeritaSectionEditor.vue';
import { ceritaIds } from './ceritaDomIds';

/**
 * The centre column of the Cerita editor for the selected section (Main artboard): its location
 * ("Bab n · Judul › Bagian n.m"), the Duplikat and Hapus bagian actions, the text and figure editor,
 * and the previous and next section. Order is changed by dragging in the tree, not here. The pane
 * only reports what was asked; the view runs the dialogs and the selection. Saving belongs to the
 * one "Simpan perubahan" button in the shell header, which calls `save()` exposed here.
 */
defineProps<{
  sectionId: string;
  chapterLabel: string;
  sectionNumber: string;
  prev: { number: string; title: string } | null;
  next: { number: string; title: string } | null;
  busy: boolean;
  duplicating: boolean;
}>();

const emit = defineEmits<{
  (e: 'duplicate'): void;
  (e: 'delete'): void;
  (e: 'prev'): void;
  (e: 'next'): void;
  (e: 'busy', value: boolean): void;
  (e: 'dirty-change', value: boolean): void;
  (e: 'draft-change', draft: { title: string; body: string }): void;
}>();

const editor = ref<InstanceType<typeof CeritaSectionEditor> | null>(null);

/** Saves the section's unsaved text and figure (see CeritaSectionEditor.save). */
function save(): Promise<boolean> {
  return editor.value?.save() ?? Promise.resolve(false);
}

defineExpose({ save });
</script>

<template>
  <section
    :aria-label="`Bagian ${sectionNumber}`"
    class="min-w-0 space-y-6"
    data-test="section-pane"
  >
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <nav
        :id="ceritaIds.sectionHeading"
        tabindex="-1"
        aria-label="Lokasi bagian"
        class="min-w-0 outline-none"
      >
        <ol class="text-text-muted flex flex-wrap items-center gap-x-2 text-sm" data-test="breadcrumb">
          <li class="break-words">{{ chapterLabel }}</li>
          <li aria-hidden="true">›</li>
          <li class="text-brand-navy font-semibold" aria-current="location">
            Bagian {{ sectionNumber }}
          </li>
        </ol>
      </nav>

      <div class="flex flex-wrap items-center gap-1">
        <button
          :id="ceritaIds.sectionDuplicate"
          type="button"
          class="text-text-muted hover:bg-surface-muted focus-visible:outline-focus-ring inline-flex min-h-11 items-center rounded-btn px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          :aria-busy="duplicating ? 'true' : undefined"
          data-test="section-duplicate"
          @click="emit('duplicate')"
        >
          {{ duplicating ? 'Menggandakan…' : 'Duplikat' }}
        </button>
        <button
          type="button"
          class="text-status-error hover:bg-status-error-surface focus-visible:outline-focus-ring inline-flex min-h-11 items-center gap-2 rounded-btn px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          data-test="section-delete"
          @click="emit('delete')"
        >
          <TrashIcon class="h-4 w-4" aria-hidden="true" />
          Hapus bagian
        </button>
      </div>
    </div>

    <CeritaSectionEditor
      ref="editor"
      :key="sectionId"
      :section-id="sectionId"
      @busy="emit('busy', $event)"
      @dirty-change="emit('dirty-change', $event)"
      @draft-change="emit('draft-change', $event)"
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
        <span aria-hidden="true">←</span> {{ prev.number }} {{ prev.title }}
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
        {{ next.number }} {{ next.title }} <span aria-hidden="true">→</span>
      </BaseButton>
    </nav>
  </section>
</template>
