<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import BaseButton from '../components/common/BaseButton.vue';
import BaseModal from '../components/common/BaseModal.vue';
import ComparisonTemplateForm from '../components/templates/ComparisonTemplateForm.vue';
import {
  inUseMessage,
  useComparisonTemplatesStore,
  type ComparisonTemplate,
} from '../stores/comparisonTemplates.store';
import { describeBody } from '../utils/comparisonTemplateSegments';

/**
 * Admin authoring of tier-1 comparison templates (SPEC §5, §8). Static header title and
 * subtitle live in route `meta` (router/index.ts), seeded by AdminLayout, so this view's own
 * headings start at <h2>. The route is Admin-only; Editors pick a template from the indicator
 * form instead.
 */

const store = useComparisonTemplatesStore();

const editorOpen = ref(false);
const editorBusy = ref(false);
const discardPromptOpen = ref(false);
const editorForm = ref<InstanceType<typeof ComparisonTemplateForm> | null>(null);
const keepEditingButton = ref<HTMLButtonElement | null>(null);
const editing = ref<ComparisonTemplate | null>(null);
const deleting = ref<ComparisonTemplate | null>(null);
const deleteBusy = ref(false);
const deleteError = ref('');
const statusMessage = ref('');
const addButton = ref<InstanceType<typeof BaseButton> | null>(null);

const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' });

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '-' : dateFormat.format(date);
}

const sorted = computed(() => store.templates);

onMounted(() => {
  void store.fetchTemplates(true);
});

function announce(message: string): void {
  // Clearing first makes an identical repeat message announce again.
  statusMessage.value = '';
  void nextTick(() => {
    statusMessage.value = message;
  });
}

function openCreate(): void {
  editing.value = null;
  editorOpen.value = true;
}

function openEdit(template: ComparisonTemplate): void {
  editing.value = template;
  editorOpen.value = true;
}

function closeEditor(): void {
  editorOpen.value = false;
  editorBusy.value = false;
  discardPromptOpen.value = false;
  editing.value = null;
}

// Cancel button, Escape and backdrop all land here. A save in flight is never interrupted
// (BaseModal also refuses while `busy`); a draft that differs from the loaded template asks first.
function requestCloseEditor(): void {
  if (editorBusy.value) return;
  if (discardPromptOpen.value) {
    // Escape or backdrop while the question is showing means "stay".
    keepEditing();
    return;
  }
  if (editorForm.value?.isDirty()) {
    discardPromptOpen.value = true;
    void nextTick(() => keepEditingButton.value?.focus());
    return;
  }
  closeEditor();
}

function keepEditing(): void {
  discardPromptOpen.value = false;
  void nextTick(() => {
    document
      .querySelector<HTMLElement>('[data-test="template-form"] input[type="text"]')
      ?.focus();
  });
}

function handleSaved(template: ComparisonTemplate): void {
  const wasNew = editing.value === null;
  closeEditor();
  announce(`Templat “${template.label}” ${wasNew ? 'ditambahkan' : 'disimpan'}.`);
}

function openDelete(template: ComparisonTemplate): void {
  deleteError.value = '';
  deleting.value = template;
}

function closeDelete(): void {
  if (deleteBusy.value) return;
  deleting.value = null;
  deleteError.value = '';
}

const deleteBlockedMessage = computed(() => {
  const target = deleting.value;
  if (!target) return '';
  return target.usageCount > 0 ? inUseMessage(target.label, target.usageCount) : '';
});

async function confirmDelete(): Promise<void> {
  const target = deleting.value;
  if (!target || deleteBusy.value) return;
  deleteBusy.value = true;
  deleteError.value = '';
  try {
    const outcome = await store.deleteTemplate(target);
    if (outcome.ok) {
      deleting.value = null;
      announce(`Templat “${target.label}” dihapus.`);
      await nextTick();
      addButton.value?.$el?.focus?.();
      return;
    }
    deleteError.value = outcome.message;
  } finally {
    deleteBusy.value = false;
  }
}

function retry(): void {
  void store.fetchTemplates(true);
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-text-muted max-w-2xl text-sm">
        Templat menentukan kalimat perbandingan tahun ke tahun yang tampil di halaman Cerita. Editor
        memilih salah satu templat untuk setiap indikator; kata naik, turun, dan tetap terisi
        otomatis dari angkanya.
      </p>
      <BaseButton ref="addButton" size="md" class="min-h-11 shrink-0" @click="openCreate">
        Tambah templat
      </BaseButton>
    </div>

    <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>

    <div
      v-if="store.error"
      role="alert"
      class="rounded-card border-status-error-border bg-status-error-surface border p-4"
      data-test="list-error"
    >
      <p class="text-status-error text-sm font-semibold">{{ store.error }}</p>
      <BaseButton
        variant="secondary"
        size="md"
        class="mt-3 min-h-11"
        :disabled="store.isLoading"
        @click="retry"
      >
        {{ store.isLoading ? 'Memuat ulang…' : 'Coba lagi' }}
      </BaseButton>
    </div>

    <p
      v-if="store.isLoading && !store.isLoaded"
      class="text-text-muted text-sm"
      role="status"
      data-test="loading"
    >
      Memuat daftar templat…
    </p>

    <section v-else-if="store.isLoaded || sorted.length > 0" aria-labelledby="templat-daftar-judul">
      <h2 id="templat-daftar-judul" class="text-brand-navy text-base font-semibold">
        Daftar templat
        <span class="text-text-muted font-normal">({{ sorted.length }})</span>
      </h2>

      <p
        v-if="sorted.length === 0"
        class="rounded-card border-border-strong text-text-muted mt-3 border border-dashed p-6 text-sm"
        data-test="empty"
      >
        Belum ada templat. Pilih “Tambah templat” untuk membuat kalimat perbandingan pertama.
      </p>

      <ul v-else class="mt-3 grid gap-4 lg:grid-cols-2">
        <li
          v-for="template in sorted"
          :key="template.id"
          class="rounded-card border-border bg-surface flex h-full flex-col border p-4"
          data-test="template-card"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <h3 class="text-brand-navy text-base font-semibold">{{ template.label }}</h3>
            <span
              v-if="template.usageCount > 0"
              class="border-status-success-border bg-status-success-surface text-status-success inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
              data-test="badge-terpasang"
            >
              Terpasang
            </span>
            <span
              v-else
              class="border-border-strong bg-surface-muted text-text-muted inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
              data-test="badge-belum"
            >
              Belum dipakai
            </span>
          </div>

          <p class="text-text-muted mt-2 text-sm" data-test="usage">
            Dipakai {{ template.usageCount }} indikator
          </p>
          <p class="text-brand-navy mt-2 text-sm" data-test="template-body">
            {{ describeBody(template.body) }}
          </p>
          <p class="text-text-muted mt-2 text-xs">
            Terakhir diperbarui {{ formatDate(template.updatedAt) }}
          </p>

          <div class="mt-4 flex flex-wrap gap-2 pt-1">
            <BaseButton
              variant="secondary"
              size="md"
              class="min-h-11"
              :aria-label="`Ubah templat ${template.label}`"
              data-test="edit"
              @click="openEdit(template)"
            >
              Ubah
            </BaseButton>
            <BaseButton
              variant="secondary"
              size="md"
              class="min-h-11"
              :aria-label="`Hapus templat ${template.label}`"
              data-test="delete"
              @click="openDelete(template)"
            >
              Hapus
            </BaseButton>
          </div>
        </li>
      </ul>
    </section>

    <BaseModal
      :open="editorOpen"
      :title="editing ? 'Ubah templat kalimat' : 'Tambah templat kalimat'"
      size="xl"
      :busy="editorBusy"
      @close="requestCloseEditor"
    >
      <!-- v-show, not v-if, while the question is up: the draft must survive "Tetap di sini". -->
      <ComparisonTemplateForm
        v-if="editorOpen"
        v-show="!discardPromptOpen"
        ref="editorForm"
        :key="editing?.id ?? 'baru'"
        :template="editing"
        @saved="handleSaved"
        @cancel="requestCloseEditor"
        @busy="editorBusy = $event"
      />

      <div
        v-if="editorOpen && discardPromptOpen"
        role="alertdialog"
        aria-labelledby="templat-buang-judul"
        aria-describedby="templat-buang-isi"
        class="space-y-4"
        data-test="discard-dialog"
      >
        <h3 id="templat-buang-judul" class="text-brand-navy text-base font-semibold">
          Perubahan belum disimpan
        </h3>
        <p id="templat-buang-isi" class="text-brand-navy text-sm">
          Perubahan belum disimpan. Tutup tanpa menyimpan?
        </p>
        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <BaseButton
            variant="secondary"
            size="md"
            class="min-h-11"
            data-test="discard-confirm"
            @click="closeEditor"
          >
            Tutup tanpa menyimpan
          </BaseButton>
          <button
            ref="keepEditingButton"
            type="button"
            class="bg-brand-navy hover:bg-brand-navy/90 focus-visible:outline-focus-ring min-h-11 rounded-btn px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            data-test="discard-keep"
            @click="keepEditing"
          >
            Tetap di sini
          </button>
        </div>
      </div>
    </BaseModal>

    <BaseModal
      :open="deleting !== null"
      title="Hapus templat?"
      size="md"
      :busy="deleteBusy"
      @close="closeDelete"
    >
      <div v-if="deleting" class="space-y-4" data-test="delete-dialog">
        <template v-if="deleteBlockedMessage">
          <p class="text-brand-navy text-sm" data-test="delete-in-use">
            {{ deleteBlockedMessage }}
          </p>
        </template>
        <template v-else>
          <p class="text-brand-navy text-sm">
            Hapus templat “{{ deleting.label }}”? Tindakan ini tidak bisa dibatalkan.
          </p>
        </template>

        <p
          v-if="deleteError"
          role="alert"
          class="rounded-btn border-status-error-border bg-status-error-surface text-status-error border px-3 py-2 text-sm"
          data-test="delete-error"
        >
          {{ deleteError }}
        </p>

        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <BaseButton
            variant="secondary"
            size="md"
            class="min-h-11"
            :disabled="deleteBusy"
            @click="closeDelete"
          >
            {{ deleteBlockedMessage ? 'Mengerti' : 'Batal' }}
          </BaseButton>
          <BaseButton
            v-if="!deleteBlockedMessage"
            size="md"
            class="min-h-11"
            :disabled="deleteBusy"
            data-test="confirm-delete"
            @click="confirmDelete"
          >
            {{ deleteBusy ? 'Menghapus…' : `Hapus “${deleting.label}”` }}
          </BaseButton>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
