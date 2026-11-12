<script setup lang="ts">
/**
 * Paginated list of map points for `/admin/peta`. It is the keyboard and screen-reader path to
 * every point (the map is an enhancement, `docs/ACCESSIBILITY.md` §4), so each row carries the
 * same actions as the map's detail panel. Rows with a coverage problem say what is wrong and what
 * to do about it.
 */
import { computed, nextTick, ref, watch } from 'vue';
import BaseButton from '../../common/BaseButton.vue';
import type { SpatialPointDTO } from '../../../types/maps';
import { formatRtList, typeLabel, type CoverageIssue } from '../../../utils/adminMapPoints';

const props = withDefaults(
  defineProps<{
    points: readonly SpatialPointDTO[];
    selectedId: string | null;
    issues: ReadonlyMap<string, CoverageIssue[]>;
    /** True when the map sits beside the list; otherwise rows offer "Lihat di peta". */
    mapBeside?: boolean;
    pageSize?: number;
  }>(),
  { mapBeside: false, pageSize: 10 },
);

const emit = defineEmits<{
  (event: 'select', point: SpatialPointDTO): void;
  (event: 'edit', point: SpatialPointDTO): void;
  (event: 'delete', point: SpatialPointDTO): void;
  (event: 'show-on-map', point: SpatialPointDTO): void;
}>();

const page = ref(1);
const pagination = ref<HTMLElement | null>(null);

const totalPages = computed(() => Math.max(1, Math.ceil(props.points.length / props.pageSize)));
const rows = computed(() =>
  props.points.slice((page.value - 1) * props.pageSize, page.value * props.pageSize),
);

// A smaller result set (new filter, a delete) must never leave the list on a page that no
// longer exists. If the button that was focused self-disabled with it, hand focus to a live one.
watch(totalPages, async (pages) => {
  const focused = document.activeElement;
  if (page.value > pages) page.value = pages;
  await nextTick();
  handOffFocus(focused);
});

// Choosing a point on the map brings its row into view.
watch(
  () => props.selectedId,
  (id) => {
    if (!id) return;
    const index = props.points.findIndex((point) => point.id === id);
    if (index >= 0) page.value = Math.floor(index / props.pageSize) + 1;
  },
);

function handOffFocus(previous: Element | null): void {
  if (
    previous instanceof HTMLButtonElement &&
    previous.disabled &&
    pagination.value?.contains(previous)
  ) {
    (
      pagination.value.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? pagination.value
    ).focus();
  }
}

async function changePage(next: number): Promise<void> {
  const focused = document.activeElement;
  page.value = next;
  await nextTick();
  handOffFocus(focused);
}

defineExpose({ page });
</script>

<template>
  <div class="space-y-4">
    <ul class="space-y-3" data-test="point-list">
      <li
        v-for="point in rows"
        :key="point.id"
        class="rounded-card bg-surface border p-4"
        :class="
          point.id === selectedId ? 'border-brand-navy ring-brand-navy ring-2' : 'border-border'
        "
        :aria-current="point.id === selectedId ? 'true' : undefined"
        :data-test="`point-row-${point.id}`"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="text-brand-navy text-base leading-snug font-semibold break-words">
              {{ point.name }}
            </h3>
            <p class="text-text-muted mt-1 text-sm" data-test="point-meta">
              {{ typeLabel(point.type) }} · {{ formatRtList(point.rts) }}
            </p>
          </div>
          <span
            v-if="point.id === selectedId"
            class="bg-brand-navy inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
          >
            Dipilih
          </span>
        </div>

        <div
          v-if="issues.get(point.id)?.length"
          class="rounded-btn border-status-warning-border bg-status-warning-surface text-status-warning mt-3 border px-3 py-2 text-sm"
          data-test="point-issue"
        >
          <p class="font-semibold">Perlu diperbaiki</p>
          <ul class="mt-1 list-disc space-y-1 pl-5">
            <li v-for="issue in issues.get(point.id)" :key="issue.kind + (issue.rtNumber ?? '')">
              {{ issue.message }}
            </li>
          </ul>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <BaseButton
            variant="secondary"
            size="md"
            class="min-h-11"
            :aria-label="`Pilih ${point.name} di peta`"
            :aria-pressed="point.id === selectedId"
            data-test="point-select"
            @click="emit('select', point)"
          >
            Pilih
          </BaseButton>
          <BaseButton
            v-if="!mapBeside"
            variant="secondary"
            size="md"
            class="min-h-11"
            :aria-label="`Lihat di peta: ${point.name}`"
            data-test="point-show-on-map"
            @click="emit('show-on-map', point)"
          >
            Lihat di peta
          </BaseButton>
          <BaseButton
            variant="secondary"
            size="md"
            class="min-h-11"
            :aria-label="`Ubah titik ${point.name}`"
            data-test="point-edit"
            @click="emit('edit', point)"
          >
            Ubah
          </BaseButton>
          <BaseButton
            variant="secondary"
            size="md"
            class="min-h-11"
            :aria-label="`Hapus titik ${point.name}`"
            data-test="point-delete"
            @click="emit('delete', point)"
          >
            Hapus
          </BaseButton>
        </div>
      </li>
    </ul>

    <div
      v-if="totalPages > 1"
      ref="pagination"
      tabindex="-1"
      class="flex items-center justify-between gap-2 text-sm"
      data-test="point-pagination"
    >
      <BaseButton
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="page <= 1"
        data-test="point-prev"
        @click="changePage(page - 1)"
      >
        Sebelumnya
      </BaseButton>
      <span class="text-brand-navy text-center">Halaman {{ page }} dari {{ totalPages }}</span>
      <BaseButton
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="page >= totalPages"
        data-test="point-next"
        @click="changePage(page + 1)"
      >
        Selanjutnya
      </BaseButton>
    </div>
  </div>
</template>
