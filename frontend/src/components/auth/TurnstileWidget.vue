<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits<{
  (e: 'verify', token: string): void
  (e: 'expire'): void
  (e: 'error'): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let widgetId: string | null = null

const siteKey =
  import.meta.env.VITE_TURNSTILE_SITE_KEY

function renderWidget() {
  if (!containerRef.value || !window.turnstile) return

  widgetId = window.turnstile.render(containerRef.value, {
    sitekey: siteKey,
    action: 'turnstile-spin-v2',
    callback: (token: string) => {
      emit('verify', token)
    },
    'expired-callback': () => {
      emit('expire')
    },
    'error-callback': () => {
      emit('error')
    },
  })
}

onMounted(() => {
  if (window.turnstile) {
    renderWidget()
    return
  }

  const existingScript = document.getElementById('turnstile-script')
  if (!existingScript) {
    const script = document.createElement('script')
    script.id = 'turnstile-script'
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.turnstile) {
        renderWidget()
      }
    }
    document.head.appendChild(script)
  } else {
    existingScript.addEventListener('load', () => {
      if (window.turnstile) {
        renderWidget()
      }
    })
  }
})

onUnmounted(() => {
  if (widgetId && window.turnstile) {
    window.turnstile.remove(widgetId)
  }
})
</script>

<template>
  <div class="turnstile-container flex justify-center my-3">
    <div
      ref="containerRef"
      class="cf-turnstile"
      data-action="turnstile-spin-v2"
      :data-sitekey="siteKey"
    ></div>
  </div>
</template>

<style scoped>
.turnstile-container {
  min-height: 65px;
}
</style>
