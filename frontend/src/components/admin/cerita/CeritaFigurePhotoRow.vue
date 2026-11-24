<script setup lang="ts">
import { computed, useId } from 'vue';
import FormField from '../../common/FormField.vue';
import MediaPhotoField from '../../common/MediaPhotoField.vue';
import CollectionRowActions from '../../data/blocks/CollectionRowActions.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import type { FigureIds } from '../../../utils/ceritaFigureDraft';

/**
 * One photo of a figure, in the layout of its kind (Figur card of the section editor):
 * - `single` ("1 gambar"): the photo on the left, its fields on the right;
 * - `pair` ("2 gambar"): a bordered card with its name and the slot for "Tukar urutan";
 * - `gallery` ("Galeri"): a tile with a drag grip, its number and its fields.
 *
 * Every photo has the file (upload, preview), a required description for people who cannot see it
 * (alt text), and an optional caption and credit. A gallery tile still carries Naik / Turun / Hapus
 * (`showActions`) because the grip has no keyboard path yet.
 */
const props = withDefaults(
  defineProps<{
    variant: 'single' | 'pair' | 'gallery';
    index: number;
    /** "Gambar 1 · depan", "Foto 2": the name of the photo. */
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
    captionLabel: 'Keterangan',
    creditLabel: 'Sumber / kredit',
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

const headingId = `${useId()}-foto`;

/** The upload control's own label; the card's visible name sits in the card heading instead. */
const uploadLabel = computed(() => {
  if (props.variant === 'single') return 'Gambar';
  return props.variant === 'pair' ? 'Berkas gambar' : 'Berkas foto';
});
const cardClass = computed(() => {
  if (props.variant === 'single') return '';
  return `rounded-card border-border bg-white border ${props.variant === 'pair' ? 'p-4' : 'p-3'}`;
});
</script>

<template>
  <div
    role="group"
    :aria-labelledby="headingId"
    class="space-y-4"
    :class="[cardClass, dragging ? 'opacity-60' : '']"
    data-test="figure-photo-row"
  >
    <div v-if="variant === 'pair'" class="flex flex-wrap items-center justify-between gap-3">
      <h3 :id="headingId" class="text-brand-navy text-sm font-semibold">
        {{ label }}
      </h3>
      <slot name="actions" />
    </div>
    <div v-else-if="variant === 'gallery'" class="flex items-center justify-between gap-2">
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
      <span :id="headingId" class="text-text-muted text-[12px] font-semibold">{{ label }}</span>
    </div>
    <span v-else :id="headingId" class="sr-only">{{ label }}</span>

    <div
      :class="
        variant === 'single' ? 'grid items-start gap-5 @min-[560px]:grid-cols-2' : 'space-y-4'
      "
    >
      <MediaPhotoField
        v-model="mediaId"
        purpose="cerita"
        :label="uploadLabel"
        :input-id="ids.photoFile(index)"
        :disabled="busy"
        :error="errors[ids.photoFile(index)]"
        :preview-alt="`Pratinjau ${label.toLowerCase()}`"
        @busy="emit('uploading', $event)"
      />

      <div class="space-y-4">
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
      </div>
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
  </div>
</template>
