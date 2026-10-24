<script setup lang="ts">
import BaseButton from '../common/BaseButton.vue';

/**
 * One row of the Data CMS list — either a scalar indicator or one of the four matrix tables.
 * The body is a description list (`<dl>/<dt>/<dd>`) per `docs/UI_STYLE_GUIDE.md` §4, and the
 * stale flag is always paired with the words "Data berumur" so it is never colour-only
 * (`docs/ACCESSIBILITY.md` §3, 1.4.1).
 */

export interface IndicatorCardStat {
  label: string;
  value: string;
}

export interface IndicatorCardModel {
  id: string;
  type: 'skalar' | 'matriks';
  title: string;
  /** Page title shown as the card kicker (e.g. "Kependudukan"). */
  kicker: string | null;
  /** "Page > chapter" breadcrumb; also the button's accessible name context. */
  sectionLabel: string;
  stats: IndicatorCardStat[];
  source: string | null;
  hedgeNote: string | null;
  isStale: boolean;
}

defineProps<{
  card: IndicatorCardModel;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
}>();
</script>

<template>
  <article
    class="rounded-card flex h-full flex-col border border-slate-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-md"
    :aria-label="`${card.type === 'matriks' ? 'Tabel' : 'Indikator'} ${card.title}`"
  >
    <div class="flex items-start justify-between gap-3">
      <p class="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {{ card.kicker ?? 'Tanpa halaman' }}
      </p>

      <span
        class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase"
        :class="
          card.type === 'skalar'
            ? 'bg-brand-cyan/20 text-brand-navy'
            : 'bg-amber-100 text-amber-900'
        "
      >
        {{ card.type }}
      </span>
    </div>

    <h2 class="mt-1 text-lg leading-snug font-semibold text-brand-navy">
      {{ card.title }}
    </h2>

    <p class="mt-0.5 text-xs text-slate-500">{{ card.sectionLabel }}</p>

    <dl class="mt-4 grid grid-cols-2 gap-2">
      <div
        v-for="stat in card.stats"
        :key="stat.label"
        class="rounded-btn bg-slate-100 px-3 py-2"
        :class="card.stats.length === 1 ? 'col-span-2' : ''"
      >
        <dt class="text-xs leading-snug text-slate-600">{{ stat.label }}</dt>
        <dd class="mt-0.5 text-base font-semibold text-slate-900 tabular-nums">
          {{ stat.value }}
        </dd>
      </div>
    </dl>

    <div class="mt-3 flex flex-wrap gap-2">
      <span
        v-if="card.isStale"
        class="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900"
      >
        Data berumur
      </span>
    </div>

    <p v-if="card.hedgeNote" class="mt-3 text-xs leading-snug text-slate-500">
      <span class="font-medium text-slate-600">Catatan:</span> {{ card.hedgeNote }}
    </p>

    <div class="mt-auto flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
      <p class="min-w-0 truncate text-xs text-slate-500" :title="card.source ?? undefined">
        Sumber: {{ card.source ?? '—' }}
      </p>

      <BaseButton variant="secondary" size="sm" class="shrink-0" @click="emit('edit')">
        Edit<span class="sr-only"> {{ card.title }}</span>
      </BaseButton>
    </div>
  </article>
</template>
