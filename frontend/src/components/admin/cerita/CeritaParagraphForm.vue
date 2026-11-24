<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import BaseButton from '../../common/BaseButton.vue';
import FormErrorSummary from '../../common/FormErrorSummary.vue';
import FormField from '../../common/FormField.vue';
import CeritaFormatToolbar from './CeritaFormatToolbar.vue';
import { BODY_MAX_LENGTH } from '../../data/blocks/blockFormShared';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import {
  applyLink,
  containsHtmlTag,
  isAllowedLinkUrl,
  toggleInlineMarker,
  toggleListPrefix,
  type ProseEditResult,
} from '../../../utils/proseMarkdown';
import { titleTextProblem } from '../../../utils/titleTextRules';

/** Same sentence the backend answers with (`hierarchyAuthoring.ts`), so both sides read alike. */
const HTML_BODY_MESSAGE =
  'Isi konten tidak boleh mengandung tag HTML. Gunakan tombol format untuk huruf tebal, miring, tautan atau daftar';
const BODY_HINT =
  'Gunakan tombol di atas atau ketik **tebal**, *miring*, [teks](alamat), dan baris yang diawali - untuk daftar.';
const LINK_ADDRESS_MESSAGE =
  'Alamat tautan harus diawali http://, https:// atau mailto:, dan tidak boleh memuat spasi.';

/**
 * Title and text of one paragraph of a Cerita section, for adding or editing. It keeps its own
 * draft: a refused save (stale, offline) never clears it, and after a reload the draft stays
 * while `initial` (what is stored now) moves, so "has this changed?" is always against the
 * latest stored text.
 */
const props = withDefaults(
  defineProps<{
    idPrefix: string;
    initial: { title: string; body: string };
    /** A new paragraph needs a title; an existing one may have none. */
    requireTitle?: boolean;
    busy?: boolean;
    /** Approved failure text from the last save attempt. */
    serverError?: string;
    /** Someone else saved this paragraph first. */
    stale?: boolean;
    submitLabel?: string;
  }>(),
  {
    requireTitle: false,
    busy: false,
    serverError: '',
    stale: false,
    submitLabel: 'Simpan paragraf',
  },
);

const emit = defineEmits<{
  (e: 'submit', payload: { title: string; body: string }): void;
  (e: 'cancel'): void;
  (e: 'reload'): void;
  (e: 'dirty-change', value: boolean): void;
}>();

const title = ref(props.initial.title);
const body = ref(props.initial.body);
const submitted = ref(false);
const titleId = computed(() => `${props.idPrefix}-judul`);
const bodyId = computed(() => `${props.idPrefix}-isi`);

// Compared the way saving normalises (trimmed), so text stored without its trailing spaces or
// line breaks does not leave the form looking edited.
const dirty = computed(
  () =>
    title.value.trim() !== props.initial.title.trim() ||
    body.value.trim() !== props.initial.body.trim(),
);
watch(dirty, (value) => emit('dirty-change', value), { immediate: true });

const titleError = computed(() => {
  switch (titleTextProblem(title.value)) {
    case 'empty':
      return props.requireTitle ? 'Judul paragraf wajib diisi.' : undefined;
    case 'too-long':
      return 'Judul paragraf maksimal 255 karakter.';
    case 'html':
      return 'Judul paragraf tidak boleh memuat tag HTML.';
    case 'characters':
      return 'Judul paragraf memuat karakter yang tidak diizinkan.';
    default:
      return undefined;
  }
});

const bodyError = computed(() => {
  if (body.value.trim() === '') return 'Isi paragraf wajib diisi dan tidak boleh hanya spasi.';
  if (body.value.length > BODY_MAX_LENGTH) return 'Isi paragraf maksimal 50.000 karakter.';
  if (containsHtmlTag(body.value)) return HTML_BODY_MESSAGE;
  return undefined;
});

const errors = computed(() => {
  const list: Array<{ fieldId: string; message: string }> = [];
  if (titleError.value) list.push({ fieldId: titleId.value, message: titleError.value });
  if (bodyError.value) list.push({ fieldId: bodyId.value, message: bodyError.value });
  return list;
});

const summaryErrors = computed(() => (submitted.value ? errors.value : []));

const bodyEl = ref<HTMLTextAreaElement | null>(null);
const linkOpen = ref(false);
const linkUrl = ref('');
const linkError = ref('');
const linkInputId = computed(() => `${props.idPrefix}-tautan`);
const linkErrorId = computed(() => `${props.idPrefix}-tautan-error`);
/** Selection in the textarea when Tautan was pressed; the address field takes focus. */
const linkSelection = { start: 0, end: 0 };

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
  return { start: el?.selectionStart ?? body.value.length, end: el?.selectionEnd ?? body.value.length };
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
  void nextTick(() => document.getElementById(linkInputId.value)?.focus());
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
    void nextTick(() => document.getElementById(linkInputId.value)?.focus());
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

function handleSubmit(): void {
  submitted.value = true;
  if (errors.value.length > 0 || props.busy) {
    void nextTick(() => {
      const first = errors.value[0];
      if (first) document.getElementById(first.fieldId)?.focus();
    });
    return;
  }
  emit('submit', { title: title.value.trim(), body: body.value.trim() });
}

onMounted(() => {
  void nextTick(() => document.getElementById(titleId.value)?.focus());
});
</script>

<template>
  <form novalidate class="space-y-4" data-test="paragraph-form" @submit.prevent="handleSubmit">
    <FormErrorSummary
      v-if="summaryErrors.length > 0 || serverError"
      :errors="summaryErrors"
      :form-error="serverError"
    />

    <div
      v-if="stale"
      class="rounded-card border-status-warning-border bg-status-warning-surface border px-4 py-3"
      data-test="paragraph-stale-notice"
    >
      <p class="text-status-warning text-sm">
        Isian Anda masih ada di formulir ini. Memuat versi terbaru tidak menghapus isian Anda.
      </p>
      <BaseButton
        type="button"
        variant="secondary"
        size="sm"
        class="mt-3 min-h-11"
        :disabled="busy"
        data-test="paragraph-reload"
        @click="emit('reload')"
      >
        Muat versi terbaru
      </BaseButton>
    </div>

    <FormField
      :id="titleId"
      label="Judul paragraf"
      hint="Judul singkat untuk mengenali paragraf ini."
      :error="submitted ? titleError : undefined"
      :required="requireTitle"
      v-slot="{ describedBy, invalid }"
    >
      <input
        :id="titleId"
        v-model="title"
        type="text"
        :class="INPUT_CLASSES"
        :disabled="busy"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
        data-test="paragraph-title"
      />
    </FormField>

    <FormField
      :id="bodyId"
      label="Isi paragraf"
      :hint="BODY_HINT"
      :error="submitted ? bodyError : undefined"
      required
      v-slot="{ describedBy, invalid }"
    >
      <div class="space-y-2">
        <CeritaFormatToolbar :disabled="busy" @format="handleFormat" />

        <div
          v-if="linkOpen"
          class="rounded-card border-brand-navy/20 bg-brand-navy/5 space-y-2 border px-3 py-3"
          data-test="link-field"
        >
          <label :for="linkInputId" class="block text-sm font-medium text-text-muted">
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
            class="text-status-error text-xs font-medium"
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
          rows="6"
          :class="INPUT_CLASSES"
          :disabled="busy"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="paragraph-body"
        ></textarea>
      </div>
    </FormField>

    <div class="flex flex-wrap items-center gap-3">
      <BaseButton
        type="submit"
        variant="primary"
        size="md"
        class="min-h-11"
        :disabled="busy"
        data-test="paragraph-save"
      >
        {{ busy ? 'Menyimpan…' : submitLabel }}
      </BaseButton>
      <BaseButton
        type="button"
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="busy"
        data-test="paragraph-cancel"
        @click="emit('cancel')"
      >
        Batal
      </BaseButton>
    </div>
  </form>
</template>
