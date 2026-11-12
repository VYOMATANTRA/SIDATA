<script setup lang="ts">
import BaseButton from '../../common/BaseButton.vue';
import CollectionRowActions from '../../data/blocks/CollectionRowActions.vue';
import type { AdminChapter, AdminPage, AdminSection } from '../../../stores/ceritaAdmin.store';
import { ceritaIds } from './ceritaDomIds';

/**
 * Detail of the chosen Cerita page: its own actions (rename, move, delete), its chapters and,
 * under each chapter, its sections. Every ordering action is a pair of buttons; nothing here
 * depends on dragging. The panel only reports what was asked; the view runs the dialogs and the
 * saves.
 */
defineProps<{
  page: AdminPage;
  isFirstPage: boolean;
  isLastPage: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (e: 'rename-page'): void;
  (e: 'move-page', direction: -1 | 1): void;
  (e: 'delete-page'): void;
  (e: 'add-chapter'): void;
  (e: 'rename-chapter', chapter: AdminChapter): void;
  (e: 'move-chapter', chapter: AdminChapter, direction: -1 | 1): void;
  (e: 'delete-chapter', chapter: AdminChapter): void;
  (e: 'add-section', chapter: AdminChapter): void;
  (e: 'open-section', section: AdminSection): void;
  (e: 'rename-section', section: AdminSection): void;
  (e: 'move-section', chapter: AdminChapter, section: AdminSection, direction: -1 | 1): void;
  (e: 'delete-section', section: AdminSection): void;
}>();

function sectionLabel(section: AdminSection, index: number): string {
  return section.title?.trim() ? section.title : `Bagian ${index + 1}`;
}
</script>

<template>
  <section :aria-labelledby="ceritaIds.pageHeading" class="space-y-6" data-test="structure-panel">
    <header class="space-y-3">
      <h2
        :id="ceritaIds.pageHeading"
        tabindex="-1"
        class="text-brand-navy text-lg font-semibold break-words outline-none"
        data-test="page-heading"
      >
        {{ page.title }}
      </h2>
      <a
        :href="`/cerita/${page.slug}`"
        target="_blank"
        rel="noopener noreferrer"
        class="text-brand-navy focus-visible:outline-focus-ring inline-flex min-h-11 items-center rounded-xs text-sm font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        data-test="page-public-link"
      >
        Lihat halaman di situs<span class="sr-only"> (dibuka di tab baru)</span>
      </a>
      <div class="flex flex-wrap items-center gap-2">
        <BaseButton
          :id="ceritaIds.pageRename"
          type="button"
          variant="secondary"
          size="sm"
          class="min-h-11"
          :disabled="busy"
          data-test="page-rename"
          @click="emit('rename-page')"
        >
          Ubah judul <span class="sr-only">halaman {{ page.title }}</span>
        </BaseButton>
        <CollectionRowActions
          :row-label="`halaman ${page.title}`"
          :is-first="isFirstPage"
          :is-last="isLastPage"
          :busy="busy"
          :move-up-id="ceritaIds.pageUp"
          :move-down-id="ceritaIds.pageDown"
          :remove-id="ceritaIds.pageDelete"
          @move-up="emit('move-page', -1)"
          @move-down="emit('move-page', 1)"
          @remove="emit('delete-page')"
        />
      </div>
    </header>

    <p
      v-if="page.chapters.length === 0"
      class="rounded-card border-border-strong text-text-muted border border-dashed p-4 text-sm"
      data-test="chapter-empty"
    >
      Halaman ini belum memiliki bab. Pilih “Tambah bab” untuk memulai.
    </p>

    <ol v-else class="space-y-5">
      <li
        v-for="(chapter, chapterIndex) in page.chapters"
        :key="chapter.id"
        class="rounded-card border-border space-y-4 border p-4"
        data-test="chapter-item"
      >
        <div class="space-y-3">
          <h3 class="text-brand-navy text-base font-semibold break-words" data-test="chapter-title">
            <span v-if="chapter.number" class="text-text-muted font-normal"
              >{{ chapter.number }} </span
            >{{ chapter.title }}
          </h3>
          <div class="flex flex-wrap items-center gap-2">
            <BaseButton
              :id="ceritaIds.chapterRename(chapter.id)"
              type="button"
              variant="secondary"
              size="sm"
              class="min-h-11"
              :disabled="busy"
              data-test="chapter-rename"
              @click="emit('rename-chapter', chapter)"
            >
              Ubah judul <span class="sr-only">bab {{ chapter.title }}</span>
            </BaseButton>
            <CollectionRowActions
              :row-label="`bab ${chapter.title}`"
              :is-first="chapterIndex === 0"
              :is-last="chapterIndex === page.chapters.length - 1"
              :busy="busy"
              :move-up-id="ceritaIds.chapterUp(chapter.id)"
              :move-down-id="ceritaIds.chapterDown(chapter.id)"
              :remove-id="ceritaIds.chapterDelete(chapter.id)"
              @move-up="emit('move-chapter', chapter, -1)"
              @move-down="emit('move-chapter', chapter, 1)"
              @remove="emit('delete-chapter', chapter)"
            />
          </div>
        </div>

        <div class="space-y-3">
          <p
            v-if="chapter.sections.length === 0"
            class="text-text-muted text-sm"
            data-test="section-empty"
          >
            Bab ini belum memiliki bagian.
          </p>
          <ol v-else class="space-y-3">
            <li
              v-for="(section, sectionIndex) in chapter.sections"
              :key="section.id"
              class="bg-surface-muted rounded-card space-y-3 p-3"
              data-test="section-item"
            >
              <p
                class="text-brand-navy text-sm font-semibold break-words"
                data-test="section-title"
              >
                {{ sectionLabel(section, sectionIndex) }}
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <BaseButton
                  :id="ceritaIds.sectionOpen(section.id)"
                  type="button"
                  size="sm"
                  class="min-h-11"
                  :disabled="busy"
                  data-test="section-open"
                  @click="emit('open-section', section)"
                >
                  Isi bagian <span class="sr-only">{{ sectionLabel(section, sectionIndex) }}</span>
                </BaseButton>
                <BaseButton
                  :id="ceritaIds.sectionRename(section.id)"
                  type="button"
                  variant="secondary"
                  size="sm"
                  class="min-h-11"
                  :disabled="busy"
                  data-test="section-rename"
                  @click="emit('rename-section', section)"
                >
                  Ubah judul
                  <span class="sr-only">bagian {{ sectionLabel(section, sectionIndex) }}</span>
                </BaseButton>
                <CollectionRowActions
                  :row-label="`bagian ${sectionLabel(section, sectionIndex)}`"
                  :is-first="sectionIndex === 0"
                  :is-last="sectionIndex === chapter.sections.length - 1"
                  :busy="busy"
                  :move-up-id="ceritaIds.sectionUp(section.id)"
                  :move-down-id="ceritaIds.sectionDown(section.id)"
                  :remove-id="ceritaIds.sectionDelete(section.id)"
                  @move-up="emit('move-section', chapter, section, -1)"
                  @move-down="emit('move-section', chapter, section, 1)"
                  @remove="emit('delete-section', section)"
                />
              </div>
            </li>
          </ol>

          <BaseButton
            :id="ceritaIds.addSection(chapter.id)"
            type="button"
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="busy"
            data-test="section-add"
            @click="emit('add-section', chapter)"
          >
            Tambah bagian <span class="sr-only">pada bab {{ chapter.title }}</span>
          </BaseButton>
        </div>
      </li>
    </ol>

    <BaseButton
      :id="ceritaIds.addChapter"
      type="button"
      variant="secondary"
      size="md"
      class="min-h-11"
      :disabled="busy"
      data-test="chapter-add"
      @click="emit('add-chapter')"
    >
      Tambah bab
    </BaseButton>
  </section>
</template>
