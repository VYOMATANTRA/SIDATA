<script setup lang="ts">
import FormField from '../../common/FormField.vue';
import MediaPhotoField from '../../common/MediaPhotoField.vue';
import CollectionRowActions from '../../data/blocks/CollectionRowActions.vue';
import { INPUT_CLASSES } from '../../../utils/formStyles';
import type { FigureIds } from '../../../utils/ceritaFigureDraft';

/**
 * One photo of a figure: the file (upload, preview), its required description for people who
 * cannot see it (alt text), and an optional caption and credit. In a series it also carries the
 * move up / move down / remove buttons; ordering is never drag-only.
 */
defineProps<{
  index: number;
  /** "Foto 2" for a series, "Foto" for a single photo. */
  label: string;
  ids: FigureIds;
  /** Problems keyed by field id, shown beside the field they concern. */
  errors: Record<string, string>;
  showActions: boolean;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
}>();

const mediaId = defineModel<string | null>('mediaId', { required: true });
const alt = defineModel<string>('alt', { required: true });
const caption = defineModel<string>('caption', { required: true });
const credit = defineModel<string>('credit', { required: true });

const emit = defineEmits<{
  (e: 'move-up'): void;
  (e: 'move-down'): void;
  (e: 'remove'): void;
  (e: 'uploading', value: boolean): void;
}>();
</script>

<template>
  <fieldset class="rounded-card border-border space-y-4 border p-4" data-test="figure-photo-row">
    <legend class="text-brand-navy px-1 text-sm font-semibold">{{ label }}</legend>

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
      label="Teks pengganti foto"
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
        label="Keterangan foto (opsional)"
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
        label="Sumber foto (opsional)"
        hint="Contoh: nama pemotret atau lembaga."
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
