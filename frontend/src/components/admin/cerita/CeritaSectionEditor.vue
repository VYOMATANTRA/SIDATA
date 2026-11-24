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
import type { FigureDraft } from '../../../utils/ceritaFigureDraft';
import { containsHtmlTag } from '../../../utils/proseMarkdown';
import { titleTextProblem } from '../../../utils/titleTextRules';
import type { FailureKind } from '../../../utils/userMessages';

/**
 * Everything a Cerita section holds, edited in one place (Main artboard): its title and body (the
 * text card) and its one figure (the Figur card). Nothing is stored until the parent calls `save()`
 * (the header's "Simpan perubahan"). The text goes first when it has changes, then the figure when
 * it has changes; each part is checked on its own, so a figure-only change never waits on the text.
 * A refused part keeps every typed value and says why beside its own card. When the text saved but
 * the figure did not, the screen says so plainly ("Judul dan isi sudah disimpan, tetapi gambar belum").
 *
 * It reports `busy` (a save, a reload or an upload is running), `dirty-change` (anything unsaved)
 * and `draft-change` (the title and body as typed, first emitted on mount), so the screen around it
 * can guard leaving and enable its one save button.
 */
const props = defineProps<{ sectionId: string }>();

const emit = defineEmits<{
  (e: 'busy', value: boolean): void;
  (e: 'dirty-change', value: boolean): void;
  (e: 'draft-change', draft: { title: string; body: string }): void;
  (e: 'figure-draft-change', draft: FigureDraft): void;
}>();

const HTML_BODY_MESSAGE =
  'Isi konten tidak boleh mengandung tag HTML. Gunakan tombol format untuk huruf tebal, miring, tautan atau daftar';
const COULD_NOT_RELOAD = 'Belum bisa memuat versi terbaru. Periksa koneksi lalu coba lagi.';
const FIGURE_CHANGED_MESSAGE =
  'Gambar di bagian ini juga sudah diubah orang lain. Judul dan isi Anda masih ada. Muat versi terbaru gambar di kartu Figur, lalu simpan lagi.';

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

// The draft is emitted at once (initial value included): the live preview draws it.
watch(
  [title, body],
  ([nextTitle, nextBody]) => {
    emit('draft-change', { title: nextTitle, body: nextBody });
  },
  { immediate: true },
);

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

/**
 * Problems are shown once a save was tried. They stay until the text is saved, so a retry still
 * shows them.
 */
const textSubmitted = ref(false);
const textSaving = ref(false);
const textError = ref('');
/** Failure class of `textError`, for AlertBanner. */
const textErrorKind = ref<FailureKind | null>(null);
const textStale = ref(false);
const textReloading = ref(false);
/** Set when the text saved but the figure did not: names both parts, for the figure card. */
const partialMessage = ref('');

const textFailureId = `${baseId}-teks-gagal`;
const partialId = `${baseId}-sebagian`;

/** Saves the text card. Resolves true when it is saved; a refusal is shown beside the text. */
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
  title.value = outcome.value.title;
  body.value = outcome.value.body;
  savedTitle.value = title.value.trim();
  savedBody.value = body.value.trim();
  return true;
}

/**
 * "Muat ulang" after a stale refusal. The newest data is loaded and the typed text stays. If the
 * figure changed too, the figure keeps its old token and shows its own stale notice, so its next save
 * cannot silently replace the other editor's figure; otherwise the drafts move onto the fresh token.
 */
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
  if (store.figureChangedSinceToken(props.sectionId)) {
    figure.value?.markStale();
    textError.value = FIGURE_CHANGED_MESSAGE;
    textErrorKind.value = null;
    announce(FIGURE_CHANGED_MESSAGE);
    focusId(textFailureId);
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

/** One flag for the whole save() sequence, so the header button cannot re-enable between parts. */
const saving = ref(false);
const figureDirty = ref(false);
const figureBusy = ref(false);
const isBusy = computed(() => saving.value || figureBusy.value || textReloading.value);
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
 * Saves what changed: the text, then the figure. Each part is judged on its own, so a figure-only
 * save never depends on the text. Resolves true when everything that had changes is saved.
 */
async function save(): Promise<boolean> {
  if (isBusy.value) return false;
  if (!isDirty.value) return true;

  saving.value = true;
  partialMessage.value = '';
  let textOk = true;
  let textReason = '';
  const textWasDirty = textDirty.value;
  const figureWasDirty = figureDirty.value;
  try {
    if (textWasDirty) {
      textSubmitted.value = true;
      const problem = titleProblem.value ?? bodyProblem.value;
      if (problem) {
        textOk = false;
        textReason = problem;
        text.value?.focusField(titleProblem.value ? 'title' : 'body');
      } else {
        textOk = await saveText();
        if (!textOk) textReason = textError.value;
      }
    }

    let figureOk = true;
    let figureReason = '';
    if (figureWasDirty) {
      figureOk = (await figure.value?.save()) ?? true;
      if (!figureOk) figureReason = figure.value?.failure() ?? 'Gambar belum disimpan.';
    }

    if (textOk && figureOk) {
      textSubmitted.value = false;
      announce('Perubahan disimpan.');
      // The header's save button is disabled once nothing is unsaved, so focus moves to a stable place.
      focusId(ceritaIds.sectionHeading);
      return true;
    }

    if (textOk && !figureOk) {
      if (textWasDirty) {
        partialMessage.value = `Judul dan isi sudah disimpan, tetapi gambar belum: ${figureReason}`;
        announce(partialMessage.value);
        focusId(partialId);
      } else {
        announce(`Gambar belum disimpan: ${figureReason}`);
      }
      textSubmitted.value = false;
      return false;
    }

    // The text was refused; say what happened to the figure as well.
    announce(
      figureWasDirty && figureOk
        ? `Gambar sudah disimpan, tetapi judul dan isi belum: ${textReason}`
        : textReason,
    );
    return false;
  } finally {
    saving.value = false;
  }
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
      :disabled="saving"
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
      <div v-if="partialMessage" :id="partialId" tabindex="-1" class="outline-none">
        <AlertBanner :message="partialMessage" data-test="section-partial-error" />
      </div>
      <CeritaFigureEditor
        ref="figure"
        :section-id="sectionId"
        @busy="figureBusy = $event"
        @dirty-change="figureDirty = $event"
        @draft-change="emit('figure-draft-change', $event)"
      />
    </section>
  </div>
</template>
