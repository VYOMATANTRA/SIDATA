<script setup lang="ts">
import { ref } from 'vue';
import BaseButton from '../../common/BaseButton.vue';

/**
 * Formatting buttons for a paragraph body. Each button shows its name as visible text, so the
 * accessible name contains the visible label (WCAG 2.5.3). The parent does the text editing and
 * puts focus back in the textarea. Left and Right arrows move between buttons (toolbar pattern);
 * Tab leaves the toolbar.
 */
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });

const emit = defineEmits<{
  (e: 'format', action: 'bold' | 'italic' | 'link' | 'list'): void;
}>();

const root = ref<HTMLElement | null>(null);

function buttons(): HTMLButtonElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLButtonElement>('button') ?? []);
}

function moveFocus(event: KeyboardEvent): void {
  const list = buttons();
  const current = list.indexOf(event.target as HTMLButtonElement);
  if (current === -1) return;
  event.preventDefault();
  const step = event.key === 'ArrowRight' ? 1 : -1;
  const next = (current + step + list.length) % list.length;
  list[next]?.focus();
}
</script>

<template>
  <div
    ref="root"
    role="toolbar"
    aria-label="Format teks"
    class="flex flex-wrap gap-2"
    data-test="format-toolbar"
    @keydown.left="moveFocus"
    @keydown.right="moveFocus"
  >
    <BaseButton
      type="button"
      variant="secondary"
      size="sm"
      :disabled="disabled"
      class="min-h-11 min-w-11 font-bold"
      data-test="format-bold"
      @click="emit('format', 'bold')"
    >
      Tebal
    </BaseButton>
    <BaseButton
      type="button"
      variant="secondary"
      size="sm"
      :disabled="disabled"
      class="min-h-11 min-w-11 italic"
      data-test="format-italic"
      @click="emit('format', 'italic')"
    >
      Miring
    </BaseButton>
    <BaseButton
      type="button"
      variant="secondary"
      size="sm"
      :disabled="disabled"
      class="min-h-11 min-w-11"
      data-test="format-link"
      @click="emit('format', 'link')"
    >
      Tautan
    </BaseButton>
    <BaseButton
      type="button"
      variant="secondary"
      size="sm"
      :disabled="disabled"
      class="min-h-11 min-w-11"
      data-test="format-list"
      @click="emit('format', 'list')"
    >
      Daftar
    </BaseButton>
  </div>
</template>
