<script setup lang="ts">
import { ref } from 'vue';

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
    class="flex flex-wrap items-center gap-0.5"
    data-test="format-toolbar"
    @keydown.left="moveFocus"
    @keydown.right="moveFocus"
  >
    <button
      type="button"
      class="tool-button font-bold"
      :disabled="disabled"
      data-test="format-bold"
      @click="emit('format', 'bold')"
    >
      Tebal
    </button>
    <button
      type="button"
      class="tool-button italic"
      :disabled="disabled"
      data-test="format-italic"
      @click="emit('format', 'italic')"
    >
      Miring
    </button>
    <button
      type="button"
      class="tool-button"
      :disabled="disabled"
      data-test="format-link"
      @click="emit('format', 'link')"
    >
      Tautan
    </button>
    <button
      type="button"
      class="tool-button"
      :disabled="disabled"
      data-test="format-list"
      @click="emit('format', 'list')"
    >
      Daftar
    </button>
  </div>
</template>

<style scoped>
/* Quiet toolbar buttons: no border, highlight on hover, visible focus ring (docs/ACCESSIBILITY.md). */
.tool-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  min-width: 36px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #3b4560;
  background: transparent;
  cursor: pointer;
}
.tool-button:hover:not(:disabled) {
  background: #e7ebf2;
  color: #0a2353;
}
.tool-button:focus-visible {
  outline: 2px solid #0a2353;
  outline-offset: 1px;
}
.tool-button:disabled {
  color: #8491a9;
  cursor: not-allowed;
}
</style>
