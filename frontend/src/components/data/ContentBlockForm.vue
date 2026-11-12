<script setup lang="ts">
import { computed, type Component } from 'vue';
import BaseButton from '../common/BaseButton.vue';
import type { ContentBlock } from '../../stores/contentBlocks.store';
import HeroBlockForm from './blocks/HeroBlockForm.vue';
import SambutanBlockForm from './blocks/SambutanBlockForm.vue';
import ProfilBlockForm from './blocks/ProfilBlockForm.vue';
import HighlightsBlockForm from './blocks/HighlightsBlockForm.vue';
import PublikasiBlockForm from './blocks/PublikasiBlockForm.vue';
import CeritaProseBlockForm from './blocks/CeritaProseBlockForm.vue';
import {
  UNKNOWN_BLOCK_MESSAGE,
  blockPlacement,
  isBlockShownOnSite,
  resolveBlockKind,
  type BlockKind,
} from './blocks/blockMeta';
import type { BlockSavePayload } from './blocks/blockFormShared';

/**
 * Dispatcher for the CMS content-block editor. It picks the named form for the block's purpose;
 * a block no form knows gets a plain message and no editor (there is no raw JSON fallback in any
 * role). Every form states where residents see the block and emits the same save payload.
 */
export interface ContentBlockFormProps {
  block: ContentBlock;
  busy?: boolean;
  serverError?: string;
  idPrefix?: string;
  /** True after a save was refused because someone else saved the block first. */
  stale?: boolean;
  /** "Halaman › Bab" label of a Cerita block's section, for its placement line. */
  sectionLabel?: string;
}

const props = withDefaults(defineProps<ContentBlockFormProps>(), {
  busy: false,
  serverError: '',
  idPrefix: 'block',
  stale: false,
  sectionLabel: undefined,
});

const emit = defineEmits<{
  (e: 'submit', payload: BlockSavePayload): void;
  (e: 'cancel'): void;
  (e: 'reload'): void;
}>();

const FORMS: Readonly<Record<Exclude<BlockKind, 'unknown'>, Component>> = {
  hero: HeroBlockForm,
  sambutan: SambutanBlockForm,
  profil: ProfilBlockForm,
  highlights: HighlightsBlockForm,
  publikasi: PublikasiBlockForm,
  cerita: CeritaProseBlockForm,
};

const kind = computed(() => resolveBlockKind(props.block));
const formComponent = computed(() => (kind.value === 'unknown' ? null : FORMS[kind.value]));
const placement = computed(() => blockPlacement(props.block, props.sectionLabel));
const shownOnSite = computed(() => isBlockShownOnSite(props.block));
</script>

<template>
  <component
    :is="formComponent"
    v-if="formComponent"
    :block="block"
    :busy="busy"
    :server-error="serverError"
    :id-prefix="idPrefix"
    :stale="stale"
    :placement="placement"
    :shown-on-site="shownOnSite"
    @submit="emit('submit', $event)"
    @cancel="emit('cancel')"
    @reload="emit('reload')"
  />

  <div v-else class="space-y-5" data-test="block-unsupported">
    <p class="rounded-card border-border bg-surface-muted text-brand-navy border px-4 py-3 text-sm">
      {{ UNKNOWN_BLOCK_MESSAGE }}
    </p>
    <div class="border-border flex justify-end border-t pt-3">
      <BaseButton variant="secondary" size="md" @click="emit('cancel')">Tutup</BaseButton>
    </div>
  </div>
</template>
