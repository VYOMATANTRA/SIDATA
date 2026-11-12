<template>
  <div role="status" data-test="cerita-loading">
    <span class="sr-only">Memuat halaman…</span>
    <div
      class="bg-surface-inverse border-t border-white/15 px-4 py-10 sm:px-6 sm:py-14"
      aria-hidden="true"
    >
      <div class="mx-auto max-w-5xl">
        <div class="h-3 w-16 animate-pulse rounded-md bg-white/20" />
        <div class="mt-4 h-8 w-2/3 max-w-md animate-pulse rounded-md bg-white/20" />
      </div>
    </div>
    <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6" aria-hidden="true">
      <div class="bg-surface-hover h-6 w-1/3 animate-pulse rounded-md" />
      <div class="bg-surface-muted mt-4 h-4 w-full animate-pulse rounded-md" />
      <div class="bg-surface-muted mt-2 h-4 w-5/6 animate-pulse rounded-md" />
      <div class="bg-surface-muted mt-2 h-4 w-2/3 animate-pulse rounded-md" />
    </div>
  </div>
</template>
