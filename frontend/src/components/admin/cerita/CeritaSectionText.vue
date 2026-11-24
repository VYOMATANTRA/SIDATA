<script setup lang="ts">
import { nextTick, ref, useId } from 'vue';
import BaseButton from '../../common/BaseButton.vue';
import CeritaFormatToolbar from './CeritaFormatToolbar.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import {
  applyLink,
  isAllowedLinkUrl,
  toggleInlineMarker,
  toggleListPrefix,
  type ProseEditResult,
} from '../../../utils/proseMarkdown';

/**
 * The text card of a section (Main artboard): the title ("Judul bagian") and the one body ("Isi")
 * with its formatting toolbar. The parent owns the saving and the validation; this card only edits
 * the two models and shows the problems it is given. A section that still holds several paragraphs
 * from before says that saving merges them.
 */
const title = defineModel<string>('title', { required: true });
const body = defineModel<string>('body', { required: true });

withDefaults(
  defineProps<{
    disabled?: boolean;
    titleError?: string;
    bodyError?: string;
    /** Prose blocks the section holds now; above one, saving merges them. */
    paragraphCount?: number;
  }>(),
  { disabled: false, titleError: undefined, bodyError: undefined, paragraphCount: 0 },
);

const baseId = useId();
const titleId = `${baseId}-judul`;
const titleErrorId = `${baseId}-judul-galat`;
const bodyId = `${baseId}-isi`;
const hintId = `${baseId}-isi-petunjuk`;
const bodyErrorId = `${baseId}-isi-galat`;
const linkInputId = `${baseId}-tautan`;
const linkErrorId = `${baseId}-tautan-galat`;

const LINK_ADDRESS_MESSAGE =
  'Alamat tautan harus diawali http://, https:// atau mailto:, dan tidak boleh memuat spasi.';

const bodyEl = ref<HTMLTextAreaElement | null>(null);
const linkOpen = ref(false);
const linkUrl = ref('');
const linkError = ref('');
/** Selection in the textarea when Tautan was pressed; the address field takes focus. */
const linkSelection = { start: 0, end: 0 };

/** Puts focus on the first field with a problem (the parent asks after a refused save). */
function focusField(field: 'title' | 'body'): void {
  void nextTick(() => document.getElementById(field === 'title' ? titleId : bodyId)?.focus());
}

defineExpose({ focusField });

/** Puts the new text in the textarea and restores focus and a sensible selection after the edit. */
function applyEdit(result: ProseEditResult): void {
  body.value = result.text;
  void nextTick(() => {
    const el = bodyEl.value;
    if (!el) return;
    el.focus();
    el.setSelectionRange(result.selectionStart, result.selectionEnd);
  });
}

function currentSelection(): { start: number; end: number } {
  const el = bodyEl.value;
  return {
    start: el?.selectionStart ?? body.value.length,
    end: el?.selectionEnd ?? body.value.length,
  };
}

function handleFormat(action: 'bold' | 'italic' | 'link' | 'list'): void {
  const { start, end } = currentSelection();
  if (action === 'bold' || action === 'italic') {
    applyEdit(toggleInlineMarker(body.value, start, end, action === 'bold' ? '**' : '*'));
    return;
  }
  if (action === 'list') {
    applyEdit(toggleListPrefix(body.value, start, end));
    return;
  }
  linkSelection.start = start;
  linkSelection.end = end;
  linkUrl.value = '';
  linkError.value = '';
  linkOpen.value = true;
  void nextTick(() => document.getElementById(linkInputId)?.focus());
}

function closeLinkField(): void {
  linkOpen.value = false;
  linkError.value = '';
  void nextTick(() => {
    const el = bodyEl.value;
    if (!el) return;
    el.focus();
    el.setSelectionRange(linkSelection.start, linkSelection.end);
  });
}

function confirmLink(): void {
  const url = linkUrl.value.trim();
  if (!isAllowedLinkUrl(url)) {
    linkError.value = LINK_ADDRESS_MESSAGE;
    void nextTick(() => document.getElementById(linkInputId)?.focus());
    return;
  }
  const result = applyLink(body.value, linkSelection.start, linkSelection.end, url);
  if (!result) {
    linkError.value = LINK_ADDRESS_MESSAGE;
    return;
  }
  linkOpen.value = false;
  linkError.value = '';
  applyEdit(result);
}
</script>

<template>
  <section
    aria-label="Teks bagian"
    class="rounded-card border-border space-y-5 border bg-white p-6"
    data-test="text-card"
  >
    <div class="space-y-2">
      <label :for="titleId" class="text-brand-navy text-sm font-semibold">Judul bagian</label>
      <input
        :id="titleId"
        v-model="title"
        type="text"
        :class="INPUT_CLASSES"
        :disabled="disabled"
        class="min-h-11 text-[18px] font-semibold"
        :aria-describedby="titleError ? titleErrorId : undefined"
        :aria-invalid="titleError ? 'true' : undefined"
        data-test="section-title"
      />
      <p
        v-if="titleError"
        :id="titleErrorId"
        class="text-status-error text-[12px] font-medium"
        data-test="section-title-error"
      >
        {{ titleError }}
      </p>
    </div>

    <div class="space-y-2">
      <label :for="bodyId" class="text-brand-navy text-sm font-semibold">Isi</label>
      <div class="rounded-btn border-border overflow-hidden border">
        <CeritaFormatToolbar
          :disabled="disabled"
          class="border-border bg-surface-muted gap-1 border-b px-1.5 py-1"
          @format="handleFormat"
        />

        <div
          v-if="linkOpen"
          class="border-border bg-surface-muted space-y-2 border-b px-3 py-3"
          data-test="link-field"
        >
          <label :for="linkInputId" class="text-text-muted block text-sm font-medium">
            Alamat tautan
          </label>
          <input
            :id="linkInputId"
            v-model="linkUrl"
            type="text"
            inputmode="url"
            autocomplete="off"
            placeholder="https://contoh.go.id"
            :class="INPUT_CLASSES"
            :aria-invalid="linkError ? 'true' : undefined"
            :aria-describedby="linkError ? linkErrorId : undefined"
            data-test="link-input"
            @keydown.enter.prevent="confirmLink"
            @keydown.esc.prevent="closeLinkField"
          />
          <p
            v-if="linkError"
            :id="linkErrorId"
            class="text-status-error text-[12px] font-medium"
            data-test="link-error"
          >
            {{ linkError }}
          </p>
          <div class="flex flex-wrap gap-2">
            <BaseButton
              type="button"
              variant="primary"
              size="sm"
              class="min-h-11"
              data-test="link-apply"
              @click="confirmLink"
            >
              Pasang tautan
            </BaseButton>
            <BaseButton
              type="button"
              variant="secondary"
              size="sm"
              class="min-h-11"
              data-test="link-cancel"
              @click="closeLinkField"
            >
              Batal
            </BaseButton>
          </div>
        </div>

        <textarea
          :id="bodyId"
          ref="bodyEl"
          v-model="body"
          rows="8"
          :disabled="disabled"
          :aria-describedby="[hintId, bodyError ? bodyErrorId : undefined].filter(Boolean).join(' ')"
          :aria-invalid="bodyError ? 'true' : undefined"
          class="text-brand-navy focus-visible:outline-focus-ring block w-full resize-y border-0 p-3 text-[15px] leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:opacity-60"
          data-test="section-body"
        ></textarea>
      </div>
      <p :id="hintId" class="text-text-muted text-[13px]" data-test="section-body-hint">
        Satu atau beberapa paragraf. Tekan Enter dua kali untuk paragraf baru.
      </p>
      <p
        v-if="bodyError"
        :id="bodyErrorId"
        class="text-status-error text-[12px] font-medium"
        data-test="section-body-error"
      >
        {{ bodyError }}
      </p>
      <p
        v-if="paragraphCount > 1"
        class="text-text-muted text-sm"
        data-test="section-legacy-note"
      >
        Bagian ini punya beberapa paragraf lama; menyimpan akan menggabungkannya menjadi satu isi.
      </p>
    </div>
  </section>
</template>
