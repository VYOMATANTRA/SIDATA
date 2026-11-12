<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import BaseButton from '../../common/BaseButton.vue';
import CollectionRowActions from '../../data/blocks/CollectionRowActions.vue';
import CeritaParagraphForm from './CeritaParagraphForm.vue';
import { useCeritaAdminStore } from '../../../stores/ceritaAdmin.store';
import type { ContentBlock } from '../../../stores/contentBlocks.store';

/**
 * The paragraphs of one Cerita section: add, edit, move and delete. One paragraph form is open
 * at a time, so a draft is never silently replaced; opening another is blocked until the open
 * one is saved or cancelled. A refused save keeps the draft, and a "stale" refusal offers a
 * reload that leaves the draft in place.
 */
const props = defineProps<{ sectionId: string }>();

const emit = defineEmits<{
  (e: 'busy', value: boolean): void;
  (e: 'dirty-change', value: boolean): void;
  (e: 'announce', value: string): void;
}>();

const store = useCeritaAdminStore();
const baseId = useId();

const paragraphs = computed(() => store.paragraphsFor(props.sectionId));

/** `'new'` for the add form, a paragraph slug while editing, null when no form is open. */
const openForm = ref<string | null>(null);
const formBusy = ref(false);
const formError = ref('');
const formStale = ref(false);
const rowBusy = ref(false);
const listError = ref('');
const listStale = ref(false);
const reloading = ref(false);
const deleting = ref<ContentBlock | null>(null);
const deleteError = ref('');
const deleteStale = ref(false);

const editingBlock = computed(() =>
  openForm.value && openForm.value !== 'new'
    ? (paragraphs.value.find((block) => block.slug === openForm.value) ?? null)
    : null,
);

const isBusy = computed(() => formBusy.value || rowBusy.value);
watch(isBusy, (value) => emit('busy', value));

function setDirty(value: boolean): void {
  emit('dirty-change', value);
}

// A paragraph deleted elsewhere while its form was open: close the form instead of leaving a
// form that points at nothing.
watch(editingBlock, (block) => {
  if (openForm.value && openForm.value !== 'new' && !block) {
    closeForm();
    emit('announce', 'Paragraf yang sedang dibuka sudah dihapus oleh orang lain.');
  }
});

function ids(block: ContentBlock): { up: string; down: string; remove: string; edit: string } {
  return {
    up: `${baseId}-p-${block.id}-naik`,
    down: `${baseId}-p-${block.id}-turun`,
    remove: `${baseId}-p-${block.id}-hapus`,
    edit: `${baseId}-p-${block.id}-ubah`,
  };
}
const addButtonId = `${baseId}-tambah`;

function focusId(id: string): void {
  void nextTick(() => document.getElementById(id)?.focus());
}

function preview(block: ContentBlock): string {
  const text = block.body.replace(/\s+/g, ' ').trim();
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

function openAdd(): void {
  formError.value = '';
  formStale.value = false;
  openForm.value = 'new';
}

function openEdit(block: ContentBlock): void {
  formError.value = '';
  formStale.value = false;
  openForm.value = block.slug;
}

function closeForm(returnFocusTo?: string): void {
  openForm.value = null;
  formError.value = '';
  formStale.value = false;
  setDirty(false);
  if (returnFocusTo) focusId(returnFocusTo);
}

async function submitForm(payload: { title: string; body: string }): Promise<void> {
  if (formBusy.value) return;
  formBusy.value = true;
  formError.value = '';
  formStale.value = false;
  const block = editingBlock.value;
  const outcome = block
    ? await store.editParagraph(block, { title: payload.title || null, body: payload.body })
    : await store.addParagraph(props.sectionId, payload);
  formBusy.value = false;

  if (outcome.ok) {
    const label = payload.title || 'tanpa judul';
    closeForm(block ? ids(block).edit : addButtonId);
    emit('announce', block ? `Paragraf “${label}” disimpan.` : `Paragraf “${label}” ditambahkan.`);
    return;
  }
  formError.value = outcome.message;
  formStale.value = outcome.stale;
}

async function reload(): Promise<void> {
  if (reloading.value) return;
  reloading.value = true;
  await store.load();
  reloading.value = false;
  formStale.value = false;
  formError.value = '';
  listStale.value = false;
  listError.value = '';
  deleteStale.value = false;
  deleteError.value = '';
  emit('announce', 'Versi terbaru dimuat. Isian Anda masih ada.');
}

async function move(block: ContentBlock, index: number, direction: -1 | 1): Promise<void> {
  if (rowBusy.value) return;
  rowBusy.value = true;
  listError.value = '';
  listStale.value = false;
  const outcome = await store.moveParagraph(props.sectionId, block.id, direction);
  rowBusy.value = false;
  if (!outcome.ok) {
    listError.value = outcome.message;
    listStale.value = outcome.stale;
    return;
  }
  const target = index + direction;
  const total = paragraphs.value.length;
  emit('announce', `Paragraf dipindah ke urutan ${target + 1} dari ${total}.`);
  // Keep focus on the same kind of button; at the end of the list that one is disabled.
  const canKeepGoing = direction === -1 ? target > 0 : target < total - 1;
  const rowIds = ids(block);
  focusId(
    direction === -1
      ? canKeepGoing
        ? rowIds.up
        : rowIds.down
      : canKeepGoing
        ? rowIds.down
        : rowIds.up,
  );
}

function askDelete(block: ContentBlock): void {
  deleteError.value = '';
  deleteStale.value = false;
  deleting.value = block;
}

function cancelDelete(): void {
  const block = deleting.value;
  deleting.value = null;
  deleteError.value = '';
  if (block) focusId(ids(block).remove);
}

async function confirmDelete(): Promise<void> {
  const block = deleting.value;
  if (!block || rowBusy.value) return;
  rowBusy.value = true;
  deleteError.value = '';
  const outcome = await store.removeParagraph(block);
  rowBusy.value = false;
  if (outcome.ok) {
    deleting.value = null;
    if (openForm.value === block.slug) closeForm();
    emit('announce', `Paragraf “${block.title ?? 'tanpa judul'}” dihapus.`);
    focusId(addButtonId);
    return;
  }
  deleteError.value = outcome.message;
  deleteStale.value = outcome.stale;
}
</script>

<template>
  <div class="space-y-4" data-test="paragraph-list">
    <div
      v-if="listError"
      role="alert"
      class="rounded-card border-status-error-border bg-status-error-surface space-y-3 border p-4"
      data-test="paragraph-list-error"
    >
      <p class="text-status-error text-sm font-semibold">{{ listError }}</p>
      <BaseButton
        v-if="listStale"
        type="button"
        variant="secondary"
        size="sm"
        class="min-h-11"
        :disabled="reloading"
        data-test="paragraph-list-reload"
        @click="reload"
      >
        {{ reloading ? 'Memuat…' : 'Muat ulang' }}
      </BaseButton>
    </div>

    <p
      v-if="paragraphs.length === 0 && openForm !== 'new'"
      class="rounded-card border-border-strong text-text-muted border border-dashed p-4 text-sm"
      data-test="paragraph-empty"
    >
      Belum ada paragraf di bagian ini.
    </p>

    <ol v-if="paragraphs.length > 0" class="space-y-3">
      <li
        v-for="(block, index) in paragraphs"
        :key="block.id"
        class="rounded-card border-border bg-surface space-y-3 border p-4"
        data-test="paragraph-item"
      >
        <template v-if="openForm === block.slug">
          <CeritaParagraphForm
            :id-prefix="`${baseId}-edit-${block.id}`"
            :initial="{ title: block.title ?? '', body: block.body }"
            :busy="formBusy"
            :server-error="formError"
            :stale="formStale"
            @submit="submitForm"
            @cancel="closeForm(ids(block).edit)"
            @reload="reload"
            @dirty-change="setDirty"
          />
        </template>
        <template v-else>
          <div class="space-y-1">
            <p class="text-brand-navy text-sm font-semibold" data-test="paragraph-heading">
              Paragraf {{ index + 1 }}<template v-if="block.title">: {{ block.title }}</template>
            </p>
            <p class="text-text-muted text-sm" data-test="paragraph-preview">
              {{ preview(block) }}
            </p>
          </div>

          <div
            v-if="deleting?.id === block.id"
            role="alertdialog"
            :aria-labelledby="`${baseId}-hapus-${block.id}`"
            class="rounded-card border-border-strong bg-surface-muted space-y-3 border p-4"
            data-test="paragraph-delete-confirm"
          >
            <p :id="`${baseId}-hapus-${block.id}`" class="text-brand-navy text-sm">
              Hapus paragraf {{ index + 1
              }}<template v-if="block.title"> “{{ block.title }}”</template>? Tindakan ini tidak
              bisa dibatalkan.
            </p>
            <p
              v-if="deleteError"
              role="alert"
              class="text-status-error text-sm font-medium"
              data-test="paragraph-delete-error"
            >
              {{ deleteError }}
            </p>
            <BaseButton
              v-if="deleteStale"
              type="button"
              variant="secondary"
              size="sm"
              class="min-h-11"
              :disabled="reloading"
              data-test="paragraph-delete-reload"
              @click="reload"
            >
              {{ reloading ? 'Memuat…' : 'Muat ulang' }}
            </BaseButton>
            <div class="flex flex-wrap gap-3">
              <BaseButton
                type="button"
                variant="secondary"
                size="md"
                class="min-h-11"
                :disabled="rowBusy"
                data-test="paragraph-delete-cancel"
                @click="cancelDelete"
              >
                Batal
              </BaseButton>
              <BaseButton
                type="button"
                variant="primary"
                size="md"
                class="min-h-11"
                :disabled="rowBusy"
                data-test="paragraph-delete-yes"
                @click="confirmDelete"
              >
                {{ rowBusy ? 'Menghapus…' : 'Ya, hapus paragraf' }}
              </BaseButton>
            </div>
          </div>

          <div v-else class="flex flex-wrap items-center gap-2">
            <BaseButton
              :id="ids(block).edit"
              type="button"
              variant="secondary"
              size="sm"
              class="min-h-11"
              :disabled="rowBusy || openForm !== null"
              data-test="paragraph-edit"
              @click="openEdit(block)"
            >
              Ubah <span class="sr-only">paragraf {{ index + 1 }}</span>
            </BaseButton>
            <CollectionRowActions
              :row-label="`paragraf ${index + 1}`"
              :is-first="index === 0"
              :is-last="index === paragraphs.length - 1"
              :busy="rowBusy"
              :move-up-id="ids(block).up"
              :move-down-id="ids(block).down"
              :remove-id="ids(block).remove"
              @move-up="move(block, index, -1)"
              @move-down="move(block, index, 1)"
              @remove="askDelete(block)"
            />
          </div>
        </template>
      </li>
    </ol>

    <div
      v-if="openForm === 'new'"
      class="rounded-card border-border-strong bg-surface space-y-3 border p-4"
      data-test="paragraph-new"
    >
      <p class="text-brand-navy text-sm font-semibold">Paragraf baru</p>
      <CeritaParagraphForm
        :id-prefix="`${baseId}-baru`"
        :initial="{ title: '', body: '' }"
        require-title
        submit-label="Tambah paragraf"
        :busy="formBusy"
        :server-error="formError"
        :stale="formStale"
        @submit="submitForm"
        @cancel="closeForm(addButtonId)"
        @reload="reload"
        @dirty-change="setDirty"
      />
    </div>

    <div v-else class="space-y-2">
      <BaseButton
        :id="addButtonId"
        type="button"
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="rowBusy || openForm !== null"
        data-test="paragraph-add"
        @click="openAdd"
      >
        Tambah paragraf
      </BaseButton>
      <p v-if="openForm !== null" class="text-text-muted text-xs">
        Simpan atau batalkan paragraf yang sedang dibuka sebelum membuka yang lain.
      </p>
    </div>
  </div>
</template>
