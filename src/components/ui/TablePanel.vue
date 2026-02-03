<script setup lang="ts">
defineProps<{
  noPadding?: boolean
  column?: boolean
  allowOverflow?: boolean
}>()
</script>

<template>
  <div
    class="table-panel"
    :class="{
      'table-panel--no-padding': noPadding,
      'table-panel--overflow': allowOverflow,
      column: column,
    }"
  >
    <slot />
  </div>
</template>

<style scoped>
.table-panel {
  display: flex;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  overflow: hidden;
  backdrop-filter: blur(8px);
  justify-content: space-between;
}

.table-panel--overflow {
  overflow: visible;
}

.table-panel.column {
  flex-direction: column;
}

.table-panel:not(.table-panel--no-padding) {
  padding: 6px;
  gap: 2px;
}
</style>
