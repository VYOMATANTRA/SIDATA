<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import AlertBanner from '../../common/AlertBanner.vue';
import BaseButton from '../../common/BaseButton.vue';
import { BODY_MAX_LENGTH } from '../../data/blocks/blockFormShared';
import CeritaFigureEditor from './CeritaFigureEditor.vue';
import CeritaReloadNotice from './CeritaReloadNotice.vue';
import CeritaSectionText from './CeritaSectionText.vue';
import { ceritaIds } from './ceritaDomIds';
import { useCeritaAdminStore } from '../../../stores/ceritaAdmin.store';
import { containsHtmlTag } from '../../../utils/proseMarkdown';
import { titleTextProblem } from '../../../utils/titleTextRules';
import type { FailureKind } from '../../../utils/userMessages';

/**
 * Everything a Cerita section holds, edited in one place (Main artboard): its title and body (the
 * text card) and its one figure (the Figur card). Nothing is stored until the parent calls `save()`
 * (the header's "Simpan perubahan"): the text goes first when it has changes, then the figure when
 * it has changes. A refused save keeps every typed value; a "stale" refusal offers a reload that
 * leaves them in place.
 *
 * It reports `busy` (a save or upload is running), `dirty-change` (anything unsaved) and
 * `draft-change` (the title and body as typed, for the preview), so the screen around it can guard
 * leaving and enable its one save button.
 */
const props = defineProps<{ sectionId: string }>();

const emit = defineEmits<{
  (e: 'busy', value: boolean): void;
  (e: 'dirty-change', value: boolean): void;
  (e: 'draft-change', draft: { title: string; body: string }): void;
}>();

const HTML_BODY_MESSAGE =
  'Isi konten tidak boleh mengandung tag HTML. Gunakan tombol format untuk huruf tebal, miring, tautan atau daftar';
const COULD_NOT_RELOAD = 'Belum bisa memuat versi terbaru. Periksa koneksi lalu coba lagi.';

const store = useCeritaAdminStore();
const baseId = useId();
const figure = ref<InstanceType<typeof CeritaFigureEditor> | null>(null);
const text = ref<InstanceType<typeof CeritaSectionText> | null>(null);
const statusMessage = ref('');

// --- Text draft: the title and the body, loaded from the store ---

const storedTitle = computed(() => store.findSection(props.sectionId)?.section.title ?? '');
const paragraphs = computed(() => store.paragraphsFor(props.sectionId));
/** The section's one body: its prose blocks, joined by a blank line (a new paragraph). */
const storedBody = computed(() => paragraphs.value.map((block) => block.body).join('\n\n'));

const title = ref(storedTitle.value);
const body = ref(storedBody.value);
/** What is stored, trimmed the way saving trims it: the comparison point for "unsaved". */
const savedTitle = ref(storedTitle.value.trim());
const savedBody = ref(storedBody.value.trim());
const textDirty = computed(
  () => title.value.trim() !== savedTitle.value || body.value.trim() !== savedBody.value,
);

function loadText(): void {
  title.value = storedTitle.value;
  body.value = storedBody.value;
  savedTitle.value = storedTitle.value.trim();
  savedBody.value = storedBody.value.trim();
}
loadText();

// Stored text changed (a reload, or another editor's save): an untouched draft follows it; a draft
// with edits is kept as typed and only its comparison point moves, so a reload never drops typing.
watch([storedTitle, storedBody], () => {
  if (!textDirty.value) {
    loadText();
    return;
  }
  savedTitle.value = storedTitle.value.trim();
  savedBody.value = storedBody.value.trim();
});

watch([title, body], ([nextTitle, nextBody]) => {
  emit('draft-change', { title: nextTitle, body: nextBody });
});

const titleProblem = computed<string | undefined>(() => {
  switch (titleTextProblem(title.value)) {
    case 'empty':
      return 'Judul bagian wajib diisi.';
    case 'too-long':
      return 'Judul bagian maksimal 255 karakter.';
    case 'html':
      return 'Judul bagian tidak boleh memuat tag HTML.';
    case 'characters':
      return 'Judul bagian memuat karakter yang tidak diizinkan.';
    default:
      return undefined;
  }
});

const bodyProblem = computed<string | undefined>(() => {
  if (body.value.length > BODY_MAX_LENGTH) return 'Isi bagian maksimal 50.000 karakter.';
  if (containsHtmlTag(body.value)) return HTML_BODY_MESSAGE;
  return undefined;
});

/** Problems are shown once a save was tried, and they clear when the text is saved. */
const textSubmitted = ref(false);
const textSaving = ref(false);
const textError = ref('');
/** Failure class of `textError`, for AlertBanner. */
const textErrorKind = ref<FailureKind | null>(null);
const textStale = ref(false);
const textReloading = ref(false);

const textFailureId = `${baseId}-teks-gagal`;

/** Saves the text card when it has changes. Resolves true when it is saved. */
async function saveText(): Promise<boolean> {
  textSaving.value = true;
  const outcome = await store.saveSectionText(props.sectionId, {
    title: title.value.trim(),
    body: body.value.trim(),
  });
  textSaving.value = false;

  if (!outcome.ok) {
    textError.value = outcome.message;
    textErrorKind.value = outcome.kind;
    textStale.value = outcome.stale;
    focusId(textFailureId);
    return false;
  }
  // The server's saved text is the new baseline (it trims and merges the body as it stores it).
  textError.value = '';
  textErrorKind.value = null;
  textStale.value = false;
  textSubmitted.value = false;
  title.value = outcome.value.title;
  body.value = outcome.value.body;
  savedTitle.value = title.value.trim();
  savedBody.value = body.value.trim();
  return true;
}

/** "Muat ulang" after a stale refusal: the newest data is loaded and the typed text stays. */
async function reloadAfterStale(): Promise<void> {
  if (textReloading.value) return;
  textReloading.value = true;
  const loaded = await store.load();
  textReloading.value = false;

  if (!loaded) {
    // Nothing newer was seen: the refusal stays, and the draft keeps its old token.
    textError.value = COULD_NOT_RELOAD;
    textErrorKind.value = store.loadErrorKind;
    announce(COULD_NOT_RELOAD);
    return;
  }
  // Only the explicit reload moves the draft onto the fresh token.
  store.captureSectionToken(props.sectionId);
  textError.value = '';
  textErrorKind.value = null;
  textStale.value = false;
  announce('Versi terbaru dimuat. Isian Anda masih ada.');
}

// --- Combined state ---

const figureDirty = ref(false);
const figureBusy = ref(false);
const isBusy = computed(() => textSaving.value || figureBusy.value);
const isDirty = computed(() => textDirty.value || figureDirty.value);

watch(isBusy, (value) => emit('busy', value));
watch(isDirty, (value) => emit('dirty-change', value));

function announce(message: string): void {
  statusMessage.value = '';
  void nextTick(() => {
    statusMessage.value = message;
  });
}

function focusId(id: string): void {
  void nextTick(() => document.getElementById(id)?.focus());
}

/**
 * Saves what changed: the text first, then the figure. Resolves true when everything that had
 * changes is saved. On a refusal the failure stays on screen beside its card, focus moves to it,
 * and nothing typed is lost.
 */
async function save(): Promise<boolean> {
  if (isBusy.value) return false;
  if (!isDirty.value) return true;

  if (textDirty.value) {
    textSubmitted.value = true;
    if (titleProblem.value || bodyProblem.value) {
      text.value?.focusField(titleProblem.value ? 'title' : 'body');
      return false;
    }
    if (!(await saveText())) return false;
  }

  if (figureDirty.value) {
    const figureSaved = (await figure.value?.save()) ?? true;
    if (!figureSaved) return false;
  }

  textSubmitted.value = false;
  announce('Perubahan disimpan.');
  // The header's save button is disabled once nothing is unsaved, so focus moves to a stable place.
  focusId(ceritaIds.sectionHeading);
  return true;
}

defineExpose({
  isDirty: () => isDirty.value,
  isBusy: () => isBusy.value,
  save,
  /** The title and body as typed (the preview reads them as drafts). */
  draft: () => ({ title: title.value, body: body.value }),
});
</script>

<template>
  <div class="space-y-6" data-test="section-editor">
    <p class="sr-only" role="status" aria-live="polite" data-test="section-status">
      {{ statusMessage }}
    </p>

    <CeritaReloadNotice />

    <div v-if="textError" :id="textFailureId" tabindex="-1" class="outline-none">
      <AlertBanner
        :message="textError"
        :kind="textErrorKind ?? undefined"
        data-test="section-text-error"
      >
        <template v-if="textStale" #action>
          <BaseButton
            type="button"
            variant="secondary"
            size="sm"
            class="min-h-11"
            :disabled="textReloading"
            data-test="section-text-reload"
            @click="reloadAfterStale"
          >
            {{ textReloading ? 'Memuat…' : 'Muat ulang' }}
          </BaseButton>
        </template>
      </AlertBanner>
    </div>

    <CeritaSectionText
      ref="text"
      v-model:title="title"
      v-model:body="body"
      :disabled="textSaving"
      :title-error="textSubmitted ? titleProblem : undefined"
      :body-error="textSubmitted ? bodyProblem : undefined"
      :paragraph-count="paragraphs.length"
    />

    <section
      :aria-labelledby="`${baseId}-figur`"
      class="rounded-card border-border space-y-5 border bg-white p-6"
      data-test="figure-card"
    >
      <div>
        <h2 :id="`${baseId}-figur`" class="text-brand-navy text-base font-bold">Figur</h2>
        <p class="text-text-muted mt-1 text-sm">
          Pilih bentuk figur. Tampilannya di situs menyesuaikan otomatis.
        </p>
      </div>
      <CeritaFigureEditor
        ref="figure"
        :section-id="sectionId"
        @busy="figureBusy = $event"
        @dirty-change="figureDirty = $event"
      />
    </section>
  </div>
</template>
