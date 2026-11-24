<script setup lang="ts">
import FormField from '../../common/FormField.vue';
import MediaPhotoField from '../../common/MediaPhotoField.vue';
import CollectionRowActions from '../../data/blocks/CollectionRowActions.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import type { FigureIds } from '../../../utils/ceritaFigureDraft';

/**
 * One photo of a figure: the file (upload, preview), its required description for people who
 * cannot see it (alt text), and an optional caption and credit. In a gallery it also carries the
 * Naik / Turun / Hapus buttons and a drag grip; the buttons are the keyboard path, the grip only a
 * shortcut for pointers. "2 gambar" has its own "Tukar urutan" button in the editor instead.
 */
withDefaults(
  defineProps<{
    index: number;
    /** "Foto 2", "Gambar 1 · depan": the legend of the card. */
    label: string;
    ids: FigureIds;
    /** Problems keyed by field id, shown beside the field they concern. */
    errors: Record<string, string>;
    /** Shows Naik / Turun / Hapus (gallery). */
    showActions: boolean;
    /** Shows the drag grip (gallery). */
    showGrip?: boolean;
    /** In a group, the credit here replaces the shared credit of the group. */
    groupCredit?: boolean;
    captionLabel?: string;
    creditLabel?: string;
    isFirst: boolean;
    isLast: boolean;
    busy: boolean;
    /** Whether the card is being dragged (a visual cue only). */
    dragging?: boolean;
  }>(),
  {
    showGrip: false,
    groupCredit: false,
    captionLabel: 'Keterangan (opsional)',
    creditLabel: 'Sumber foto (opsional)',
    dragging: false,
  },
);

const mediaId = defineModel<string | null>('mediaId', { required: true });
const alt = defineModel<string>('alt', { required: true });
const caption = defineModel<string>('caption', { required: true });
const credit = defineModel<string>('credit', { required: true });

const emit = defineEmits<{
  (e: 'move-up'): void;
  (e: 'move-down'): void;
  (e: 'remove'): void;
  (e: 'uploading', value: boolean): void;
  (e: 'grip-start'): void;
  (e: 'grip-end'): void;
}>();
</script>

<template>
  <fieldset
    class="rounded-card border-border space-y-4 border p-4"
    :class="dragging ? 'opacity-60' : ''"
    data-test="figure-photo-row"
  >
    <legend class="text-brand-navy flex items-center gap-2 px-1 text-sm font-semibold">
      <span
        v-if="showGrip && !busy"
        aria-hidden="true"
        draggable="true"
        class="text-text-muted cursor-grab px-0.5 leading-none select-none"
        title="Seret untuk mengubah urutan. Atau gunakan tombol Naik dan Turun."
        data-test="photo-grip"
        @dragstart="emit('grip-start')"
        @dragend="emit('grip-end')"
        >⠿</span
      >
      {{ label }}
    </legend>

    <MediaPhotoField
      v-model="mediaId"
      purpose="cerita"
      :label="label"
      :input-id="ids.photoFile(index)"
      :disabled="busy"
      :error="errors[ids.photoFile(index)]"
      preview-alt="Pratinjau foto yang dipilih"
      @busy="emit('uploading', $event)"
    />

    <FormField
      :id="ids.photoAlt(index)"
      label="Teks alternatif"
      hint="Tulis apa yang terlihat pada foto, untuk pembaca yang tidak bisa melihatnya."
      :error="errors[ids.photoAlt(index)]"
      required
      v-slot="{ describedBy, invalid }"
    >
      <textarea
        :id="ids.photoAlt(index)"
        v-model="alt"
        rows="2"
        :class="INPUT_CLASSES"
        :disabled="busy"
        :aria-describedby="describedBy"
        :aria-invalid="invalid ? 'true' : undefined"
        data-test="photo-alt"
      ></textarea>
    </FormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <FormField
        :id="ids.photoCaption(index)"
        :label="captionLabel"
        :error="errors[ids.photoCaption(index)]"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="ids.photoCaption(index)"
          v-model="caption"
          type="text"
          :class="INPUT_CLASSES"
          :disabled="busy"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="photo-caption"
        />
      </FormField>
      <FormField
        :id="ids.photoCredit(index)"
        :label="creditLabel"
        :hint="
          groupCredit
            ? 'Isi hanya jika foto ini bersumber lain. Isian ini menggantikan sumber bersama.'
            : 'Contoh: nama pemotret atau lembaga.'
        "
        :error="errors[ids.photoCredit(index)]"
        v-slot="{ describedBy, invalid }"
      >
        <input
          :id="ids.photoCredit(index)"
          v-model="credit"
          type="text"
          :class="INPUT_CLASSES"
          :disabled="busy"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          data-test="photo-credit"
        />
      </FormField>
    </div>

    <CollectionRowActions
      v-if="showActions"
      :row-label="label.toLowerCase()"
      :is-first="isFirst"
      :is-last="isLast"
      :busy="busy"
      :move-up-id="ids.photoUp(index)"
      :move-down-id="ids.photoDown(index)"
      :remove-id="ids.photoRemove(index)"
      @move-up="emit('move-up')"
      @move-down="emit('move-down')"
      @remove="emit('remove')"
    />
  </fieldset>
</template>
