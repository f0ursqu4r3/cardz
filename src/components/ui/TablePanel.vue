<script setup lang="ts">
defineProps<{
  noPadding?: boolean
}>()
</script>

<template>
  <div class="table-panel" :class="{ 'table-panel--no-padding': noPadding }">
    <slot />
  </div>
</template>

<style scoped>
.table-panel {
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  overflow: hidden;
  backdrop-filter: blur(8px);
}

.table-panel:not(.table-panel--no-padding) {
  padding: 6px;
  gap: 2px;
}
</style>
