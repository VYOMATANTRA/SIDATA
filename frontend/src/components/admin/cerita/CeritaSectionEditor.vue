<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import CeritaFigureEditor from './CeritaFigureEditor.vue';
import CeritaParagraphList from './CeritaParagraphList.vue';
import CeritaReloadNotice from './CeritaReloadNotice.vue';

/**
 * Everything a Cerita section holds, in one place: its paragraphs and its one figure. It reports
 * whether anything is being saved (`busy`) and whether an edit is unsaved (`dirty-change`), so
 * the dialog around it can refuse to close mid-save and ask before discarding a draft.
 */
defineProps<{ sectionId: string }>();

const emit = defineEmits<{
  (e: 'busy', value: boolean): void;
  (e: 'dirty-change', value: boolean): void;
}>();

const baseId = useId();
const figure = ref<InstanceType<typeof CeritaFigureEditor> | null>(null);
const paragraphBusy = ref(false);
const figureBusy = ref(false);
const paragraphDirty = ref(false);
const figureDirty = ref(false);
const statusMessage = ref('');

const isBusy = computed(() => paragraphBusy.value || figureBusy.value);
const isDirty = computed(() => paragraphDirty.value || figureDirty.value);

function onBusy(kind: 'paragraph' | 'figure', value: boolean): void {
  if (kind === 'paragraph') paragraphBusy.value = value;
  else figureBusy.value = value;
  emit('busy', isBusy.value);
}

function onDirty(kind: 'paragraph' | 'figure', value: boolean): void {
  if (kind === 'paragraph') paragraphDirty.value = value;
  else figureDirty.value = value;
  emit('dirty-change', isDirty.value);
}

function announce(message: string): void {
  statusMessage.value = '';
  void nextTick(() => {
    statusMessage.value = message;
  });
}

defineExpose({ isDirty: () => isDirty.value });
</script>

<template>
  <div class="space-y-8" data-test="section-editor">
    <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>

    <CeritaReloadNotice />

    <section :aria-labelledby="`${baseId}-paragraf`" class="space-y-3">
      <h3 :id="`${baseId}-paragraf`" class="text-brand-navy text-base font-semibold">Paragraf</h3>
      <CeritaParagraphList
        :section-id="sectionId"
        @busy="onBusy('paragraph', $event)"
        @dirty-change="onDirty('paragraph', $event)"
        @announce="announce"
      />
    </section>

    <section :aria-labelledby="`${baseId}-gambar`" class="space-y-3">
      <h3 :id="`${baseId}-gambar`" class="text-brand-navy text-base font-semibold">Gambar</h3>
      <p class="text-text-muted text-sm">
        Setiap bagian dapat memiliki satu gambar: satu foto, beberapa foto, atau diagram.
      </p>
      <CeritaFigureEditor
        ref="figure"
        :section-id="sectionId"
        @busy="onBusy('figure', $event)"
        @dirty-change="onDirty('figure', $event)"
      />
    </section>
  </div>
</template>
