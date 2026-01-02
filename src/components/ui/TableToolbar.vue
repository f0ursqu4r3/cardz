<script setup lang="ts">
defineProps<{
  borderBottom?: boolean
}>()
</script>

<template>
  <div class="table-toolbar" :class="{ 'table-toolbar--border': borderBottom }">
    <slot />
  </div>
</template>

<style scoped>
.table-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
}

.table-toolbar--border {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

/* Separator styling */
.table-toolbar :deep(.separator) {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 2px;
}

/* Text/label styling */
.table-toolbar :deep(.label) {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  min-width: 36px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
</style>
