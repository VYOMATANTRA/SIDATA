<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

/**
 * Accessible modal dialog primitive.
 *
 * `docs/ACCESSIBILITY.md` §5 lists the existing `UserManagement.vue` modals as a known gap:
 * no `role="dialog"`, no `aria-modal`, no Escape handling, no focus trap, no focus restore.
 * This component is the reference implementation that closes that gap for new work, so the
 * CMS forms do not inherit the same defects.
 *
 * Presentation: a full-screen sheet below `sm` (so a long matrix table stays usable on a
 * phone) and a centred, height-capped card from `sm` up. One implementation, two layouts.
 */

export interface BaseModalProps {
  open: boolean;
  /** Accessible name for the dialog; also rendered as the visible `<h2>`. */
  title: string;
  /** Optional supporting sentence, wired via `aria-describedby`. */
  description?: string;
  size?: 'md' | 'lg' | 'xl';
  /** While true the dialog refuses to close — a save is in flight. */
  busy?: boolean;
}

const props = withDefaults(defineProps<BaseModalProps>(), {
  description: undefined,
  size: 'md',
  busy: false,
});

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const dialogRef = ref<HTMLElement | null>(null);
const baseId = useId();
const titleId = `${baseId}-title`;
const descriptionId = `${baseId}-description`;

let previouslyFocused: HTMLElement | null = null;
let previousBodyOverflow = '';
let scrollLocked = false;

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'xl':
      return 'sm:max-w-5xl';
    case 'lg':
      return 'sm:max-w-3xl';
    case 'md':
    default:
      return 'sm:max-w-2xl';
  }
});

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(): HTMLElement[] {
  const root = dialogRef.value;
  if (!root) return [];
  // No visibility filtering: the dialog only ever contains the controls it renders, and
  // `offsetParent`/`getClientRects()` are unreliable in jsdom (always empty), which would
  // silently break the wrap-around used by the focus trap.
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function requestClose(): void {
  if (props.busy) return;
  emit('close');
}

function handleOverlayClick(): void {
  requestClose();
}

function lockScroll(): void {
  if (typeof document === 'undefined' || scrollLocked) return;
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  scrollLocked = true;
}

function unlockScroll(): void {
  if (typeof document === 'undefined' || !scrollLocked) return;
  document.body.style.overflow = previousBodyOverflow;
  scrollLocked = false;
}

function restoreFocus(): void {
  if (!previouslyFocused) return;
  // The trigger may have been removed by the save that closed the dialog (a row deleted, a
  // card re-rendered). Fall back to nothing rather than throwing.
  if (previouslyFocused.isConnected) {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return;

  if (event.key === 'Escape') {
    event.stopPropagation();
    requestClose();
    return;
  }

  if (event.key !== 'Tab') return;

  const elements = focusableElements();
  if (elements.length === 0) {
    event.preventDefault();
    dialogRef.value?.focus();
    return;
  }

  const first = elements[0];
  const last = elements[elements.length - 1];
  if (!first || !last) return;

  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || active === dialogRef.value || !dialogRef.value?.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (typeof document === 'undefined') return;

    if (isOpen) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      lockScroll();
      document.addEventListener('keydown', onKeydown, true);
      void nextTick(() => {
        const autoFocus = dialogRef.value?.querySelector<HTMLElement>('[data-autofocus]');
        (autoFocus ?? dialogRef.value)?.focus();
      });
      return;
    }

    document.removeEventListener('keydown', onKeydown, true);
    unlockScroll();
    restoreFocus();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return;
  document.removeEventListener('keydown', onKeydown, true);
  unlockScroll();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="open"
        class="bg-brand-navy/60 fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
        role="presentation"
        @click.self="handleOverlayClick"
      >
        <div
          ref="dialogRef"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="description ? descriptionId : undefined"
          tabindex="-1"
          class="flex h-full max-h-none w-full flex-col overflow-hidden bg-white shadow-2xl outline-none sm:h-auto sm:max-h-[90vh] sm:rounded-card"
          :class="sizeClasses"
        >
          <header
            class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7 sm:py-5"
          >
            <div class="min-w-0">
              <h2 :id="titleId" class="text-lg leading-snug font-semibold text-brand-navy">
                {{ title }}
              </h2>
              <p v-if="description" :id="descriptionId" class="mt-1 text-sm text-slate-500">
                {{ description }}
              </p>
              <slot name="header" />
            </div>

            <button
              type="button"
              class="focus-visible:ring-brand-navy -mr-1.5 shrink-0 rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-navy focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="busy"
              aria-label="Tutup dialog"
              @click="requestClose"
            >
              <svg
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div class="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            <slot />
          </div>

          <footer
            v-if="$slots.footer"
            class="border-t border-slate-200 bg-slate-50 px-5 py-4 sm:rounded-b-card sm:px-7"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 150ms ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
