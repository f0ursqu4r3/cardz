<script setup lang="ts">
defineProps<{
  title?: string
  active?: boolean
  size?: 'sm' | 'md'
}>()

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    class="table-btn"
    :class="[`table-btn--${size ?? 'md'}`, { 'table-btn--active': active }]"
    :title="title"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.table-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.15s ease;
}

.table-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.table-btn:active {
  background: rgba(255, 255, 255, 0.25);
}

.table-btn--active {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.table-btn--sm {
  width: 24px;
  height: 24px;
}

.table-btn--md {
  width: 32px;
  height: 32px;
}

/* Icon sizing */
.table-btn--sm :deep(svg) {
  width: 14px;
  height: 14px;
}

.table-btn--md :deep(svg) {
  width: 16px;
  height: 16px;
}
</style>
