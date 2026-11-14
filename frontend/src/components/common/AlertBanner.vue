<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue';
import BaseButton from './BaseButton.vue';
import { useAuthStore } from '../../stores/auth';
import { isRetryable, type FailureKind } from '../../utils/userMessages.js';

export interface AlertBannerProps {
  message: string;
  kind?: FailureKind;
  tone?: 'error' | 'warning' | 'info';
  live?: 'assertive' | 'polite';
  retryLabel?: string;
  busy?: boolean;
}

const props = withDefaults(defineProps<AlertBannerProps>(), {
  kind: undefined,
  tone: 'error',
  live: 'assertive',
  retryLabel: 'Coba lagi',
  busy: false,
});

const emit = defineEmits<{ (e: 'retry'): void }>();

// Declared emits are not exposed in attrs, so read the listener from the vnode props.
const instance = getCurrentInstance();
const hasRetryListener = computed(() => Boolean(instance?.vnode.props?.onRetry));

// A dead session is announced once by the global notice, so the banner steps aside only then.
// Otherwise (e.g. a 401 outside AdminLayout) the message still has to be visible.
const authStore = useAuthStore();
const hidden = computed(() => props.kind === 'session' && authStore.sessionEnded);
const showRetry = computed(
  () => hasRetryListener.value && (props.kind === undefined || isRetryable(props.kind)),
);
const role = computed(() => (props.live === 'assertive' ? 'alert' : 'status'));

const toneClasses = computed(() => {
  switch (props.tone) {
    case 'warning':
      return 'border-status-warning-border bg-status-warning-surface text-status-warning';
    case 'info':
      return 'border-border bg-surface-muted text-brand-navy';
    default:
      return 'border-status-error-border bg-status-error-surface text-status-error';
  }
});
</script>

<template>
  <div v-if="!hidden" :role="role" class="rounded-card border p-4" :class="toneClasses">
    <p class="text-sm font-semibold">{{ message }}</p>
    <div v-if="showRetry || $slots.action" class="mt-3 flex flex-wrap gap-2">
      <BaseButton
        v-if="showRetry"
        variant="secondary"
        size="md"
        class="min-h-11"
        :disabled="busy"
        data-test="alert-banner-retry"
        @click="emit('retry')"
      >
        {{ retryLabel }}
      </BaseButton>
      <slot name="action" />
    </div>
  </div>
</template>
