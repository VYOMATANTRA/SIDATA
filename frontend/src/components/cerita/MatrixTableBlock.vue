<script setup lang="ts">
import { computed } from 'vue';
import BarDiagram, { type BarDiagramItem } from '../common/BarDiagram.vue';
import { isSexSplitKind, type IndicatorTableDetailDto } from '../../stores/indicatorTables.store';

export interface MatrixTableBlockProps {
  table: IndicatorTableDetailDto;
}

const props = defineProps<MatrixTableBlockProps>();

const sexSplit = computed(() => isSexSplitKind(props.table.kind));

const chartItems = computed<BarDiagramItem[]>(() => {
  if (sexSplit.value) {
    return props.table.rows.flatMap((row) => [
      {
        id: `${row.id}-male`,
        label: `${row.label} — Laki-laki`,
        value: row.male ?? 0,
        color: 'bg-brand-navy',
      },
      {
        id: `${row.id}-female`,
        label: `${row.label} — Perempuan`,
        value: row.female ?? 0,
        color: 'bg-brand-cyan',
      },
    ]);
  }

  return props.table.rows.map((row) => ({
    id: row.id,
    label: row.label,
    value: row.total ?? 0,
  }));
});
</script>

<template>
  <div data-test="matrix-table-block">
    <BarDiagram :title="table.title" :items="chartItems" />

    <details class="mt-3" data-test="matrix-table-details">
      <summary class="text-brand-navy cursor-pointer text-sm font-medium">
        Lihat sebagai tabel
      </summary>

      <div class="mt-3 overflow-x-auto">
        <table class="w-full border-collapse text-sm" data-test="matrix-table-data">
          <caption class="sr-only">
            {{
              table.title
            }}, periode {{ table.period }}
          </caption>
          <thead>
            <tr class="border-b border-slate-200 text-left text-slate-500">
              <th scope="col" class="py-2 pr-4 font-medium">Label</th>
              <template v-if="sexSplit">
                <th scope="col" class="py-2 pr-4 text-right font-medium">Laki-laki</th>
                <th scope="col" class="py-2 pr-4 text-right font-medium">Perempuan</th>
              </template>
              <th scope="col" class="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in table.rows" :key="row.id" class="border-b border-slate-100">
              <th scope="row" class="py-2 pr-4 text-left font-normal text-slate-700">
                {{ row.label }}
              </th>
              <template v-if="sexSplit">
                <td class="py-2 pr-4 text-right tabular-nums">{{ row.male ?? '—' }}</td>
                <td class="py-2 pr-4 text-right tabular-nums">{{ row.female ?? '—' }}</td>
              </template>
              <td class="py-2 text-right font-semibold tabular-nums">{{ row.total ?? '—' }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-slate-200 font-semibold">
              <th scope="row" class="py-2 pr-4 text-left">Total</th>
              <template v-if="sexSplit">
                <td class="py-2 pr-4 text-right tabular-nums">{{ table.totals.male ?? '—' }}</td>
                <td class="py-2 pr-4 text-right tabular-nums">{{ table.totals.female ?? '—' }}</td>
              </template>
              <td class="py-2 text-right tabular-nums">{{ table.totals.total ?? '—' }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </details>

    <p v-if="table.source" class="mt-2 text-xs text-slate-400" data-test="matrix-table-source">
      Sumber: {{ table.source }}
    </p>
  </div>
</template>
