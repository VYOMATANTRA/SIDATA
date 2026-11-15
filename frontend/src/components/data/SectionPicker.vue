<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePagesStore } from '../../stores/pages.store';
import { INPUT_CLASSES } from '../../utils/formStyles';

/**
 * Chooses the section a data item belongs to (SPEC §4: an indicator or table must attach to a
 * `section`). Three linked selects — Halaman › Bab › Bagian — built from the hierarchy the
 * `/data` view already loads. Changing a level above clears the levels below it, so a section
 * can never be paired with a chapter it does not belong to.
 *
 * The value is a section id (`v-model`); an empty string means "not chosen yet".
 */

export interface SectionPickerProps {
  modelValue: string;
  /** Validation message for the section choice, shown in text and tied to the last select. */
  error?: string;
  idPrefix?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<SectionPickerProps>(), {
  error: undefined,
  idPrefix: 'section',
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', sectionId: string): void;
}>();

const pagesStore = usePagesStore();

const pageId = ref('');
const chapterId = ref('');

const fieldId = (name: string): string => `${props.idPrefix}-${name}`;

/** The page and chapter that contain a section, or null when the section is not in the hierarchy. */
function locate(sectionId: string): { pageId: string; chapterId: string } | null {
  for (const page of pagesStore.hierarchyPages) {
    for (const chapter of page.chapters) {
      if (chapter.sections.some((section) => section.id === sectionId)) {
        return { pageId: page.id, chapterId: chapter.id };
      }
    }
  }
  return null;
}

/**
 * A section id that arrives from outside (a preset, or a draft restored by the parent) must show
 * its own page and chapter, otherwise Bagian stays disabled with a value it cannot display. Runs
 * again when the hierarchy loads, since a preset can arrive before the pages do.
 */
function syncFromModel(): void {
  if (!props.modelValue) return;
  const found = locate(props.modelValue);
  if (!found) return;
  pageId.value = found.pageId;
  chapterId.value = found.chapterId;
}

watch(
  () => [props.modelValue, pagesStore.hierarchyPages] as const,
  () => syncFromModel(),
  { immediate: true },
);

const pages = computed(() => pagesStore.hierarchyPages);

const chapters = computed(() => {
  const page = pages.value.find((item) => item.id === pageId.value);
  return page?.chapters ?? [];
});

const sections = computed(() => {
  const chapter = chapters.value.find((item) => item.id === chapterId.value);
  return chapter?.sections ?? [];
});

function chapterLabel(number: string | null, title: string): string {
  return number ? `${number}. ${title}` : title;
}

/**
 * An untitled section is named by its position in the chapter ("Bagian 1", "Bagian 2"), so two
 * untitled sections in one chapter never look identical in the list.
 */
function sectionLabel(title: string | null, position: number): string {
  return title && title.trim() !== '' ? title : `Bagian ${position + 1}`;
}

function onPageChange(event: Event): void {
  pageId.value = (event.target as HTMLSelectElement).value;
  chapterId.value = '';
  emit('update:modelValue', '');
}

function onChapterChange(event: Event): void {
  chapterId.value = (event.target as HTMLSelectElement).value;
  emit('update:modelValue', '');
}

function onSectionChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value);
}

const errorId = computed(() => fieldId('error'));
</script>

<template>
  <fieldset class="space-y-4">
    <legend class="text-brand-navy text-sm font-semibold tracking-wide uppercase">
      Lokasi di Situs
    </legend>

    <p v-if="pages.length === 0" class="text-text-muted text-sm" data-test="no-pages">
      Belum ada halaman yang bisa dipilih. Periksa struktur halaman di menu Cerita.
    </p>

    <div v-else class="grid gap-4 sm:grid-cols-3">
      <div>
        <label :for="fieldId('page')" class="text-text-muted block text-sm font-medium">
          Halaman <span class="sr-only">(wajib dipilih)</span>
        </label>
        <select
          :id="fieldId('page')"
          :value="pageId"
          :disabled="disabled"
          :class="INPUT_CLASSES"
          class="mt-1.5"
          @change="onPageChange"
        >
          <option value="">Pilih halaman</option>
          <option v-for="page in pages" :key="page.id" :value="page.id">
            {{ page.title }}
          </option>
        </select>
      </div>

      <div>
        <label :for="fieldId('chapter')" class="text-text-muted block text-sm font-medium">
          Bab <span class="sr-only">(wajib dipilih)</span>
        </label>
        <select
          :id="fieldId('chapter')"
          :value="chapterId"
          :disabled="disabled || pageId === ''"
          :class="INPUT_CLASSES"
          class="mt-1.5"
          @change="onChapterChange"
        >
          <option value="">{{ pageId === '' ? 'Pilih halaman dulu' : 'Pilih bab' }}</option>
          <option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">
            {{ chapterLabel(chapter.number, chapter.title) }}
          </option>
        </select>
      </div>

      <div>
        <label :for="fieldId('section')" class="text-text-muted block text-sm font-medium">
          Bagian <span class="sr-only">(wajib dipilih)</span>
        </label>
        <select
          :id="fieldId('section')"
          :value="modelValue"
          :disabled="disabled || chapterId === ''"
          :class="INPUT_CLASSES"
          class="mt-1.5"
          :aria-describedby="error ? errorId : undefined"
          :aria-invalid="error ? 'true' : undefined"
          @change="onSectionChange"
        >
          <option value="">{{ chapterId === '' ? 'Pilih bab dulu' : 'Pilih bagian' }}</option>
          <option v-for="(section, position) in sections" :key="section.id" :value="section.id">
            {{ sectionLabel(section.title, position) }}
          </option>
        </select>
      </div>
    </div>

    <p v-if="error" :id="errorId" class="text-status-error text-xs font-medium">
      {{ error }}
    </p>
  </fieldset>
</template>
