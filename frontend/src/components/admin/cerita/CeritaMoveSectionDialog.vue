<script setup lang="ts">
import { ref, watch } from 'vue';
import AlertBanner from '../../common/AlertBanner.vue';
import BaseButton from '../../common/BaseButton.vue';
import BaseModal from '../../common/BaseModal.vue';
import type { FailureKind } from '../../../utils/userMessages';

/**
 * "Pindahkan ke bab lain": picks one of the other chapters of the same page (the server refuses a
 * move across pages) and confirms. The dialog only reports the choice; the view runs the move, so
 * a refused move keeps the choice and says why. The options are native radio buttons in a fieldset.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    sectionTitle: string;
    /** The other chapters of the page, in order. Never empty: the view hides the option instead. */
    targets: { id: string; label: string }[];
    busy?: boolean;
    error?: string;
    errorKind?: FailureKind;
    stale?: boolean;
  }>(),
  { busy: false, error: '', errorKind: undefined, stale: false },
);

const emit = defineEmits<{
  (e: 'submit', chapterId: string): void;
  (e: 'close'): void;
  (e: 'reload'): void;
}>();

const chosen = ref<string>('');

// Each opening starts with the first other chapter selected.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) chosen.value = props.targets[0]?.id ?? '';
  },
  { immediate: true },
);

function submit(): void {
  if (!chosen.value || props.busy) return;
  emit('submit', chosen.value);
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="`Pindahkan “${sectionTitle}” ke bab lain`"
    description="Bagian hanya bisa dipindah ke bab lain di halaman yang sama."
    size="md"
    :busy="busy"
    @close="emit('close')"
  >
    <form v-if="open" novalidate class="space-y-4" data-test="move-dialog" @submit.prevent="submit">
      <fieldset class="space-y-2" :disabled="busy">
        <legend class="text-brand-navy mb-2 text-sm font-semibold">Bab tujuan</legend>
        <div class="grid gap-2">
          <label
            v-for="target in targets"
            :key="target.id"
            class="border-border has-[:checked]:border-brand-navy has-[:checked]:bg-brand-navy/5 has-[:focus-visible]:outline-focus-ring rounded-btn flex min-h-11 cursor-pointer items-center gap-3 border bg-white px-3 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
          >
            <input
              v-model="chosen"
              type="radio"
              name="cerita-pindah-bab"
              :value="target.id"
              class="accent-brand-navy h-4 w-4 shrink-0"
              data-test="move-target"
            />
            <span class="text-brand-navy">{{ target.label }}</span>
          </label>
        </div>
      </fieldset>

      <AlertBanner v-if="error" :message="error" :kind="errorKind" data-test="move-error" />

      <div
        v-if="stale"
        class="rounded-card border-status-warning-border bg-status-warning-surface border px-4 py-3"
        data-test="move-stale"
      >
        <p class="text-status-warning text-sm">
          Isian Anda masih ada di sini. Memuat versi terbaru tidak menghapus pilihan Anda.
        </p>
        <BaseButton
          type="button"
          variant="secondary"
          size="sm"
          class="mt-3 min-h-11"
          :disabled="busy"
          data-test="move-reload"
          @click="emit('reload')"
        >
          Muat versi terbaru
        </BaseButton>
      </div>

      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <BaseButton
          type="button"
          variant="secondary"
          size="md"
          class="min-h-11"
          :disabled="busy"
          data-test="move-cancel"
          @click="emit('close')"
        >
          Batal
        </BaseButton>
        <BaseButton
          type="submit"
          size="md"
          class="min-h-11"
          :disabled="busy || !chosen"
          data-test="move-submit"
        >
          {{ busy ? 'Memindahkan…' : 'Pindahkan bagian' }}
        </BaseButton>
      </div>
    </form>
  </BaseModal>
</template>
