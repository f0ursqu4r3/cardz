<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{
  title: string
}>()

const emit = defineEmits<{
  close: []
}>()

const onBackdropClick = (event: MouseEvent) => {
  if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
    emit('close')
  }
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click="onBackdropClick" @keydown="onKeydown">
      <div class="modal-content" @pointerdown.stop>
        <div class="modal-header">
          <h3>{{ title }}</h3>
          <button class="modal-close" @click="emit('close')">
            <X :size="16" />
          </button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--color-surface-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.modal-content {
  background: var(--color-surface-200);
  border-radius: var(--radius-lg);
  min-width: var(--modal-min-width);
  max-width: var(--modal-max-width);
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--modal-header-padding);
  border-bottom: 1px solid var(--color-border-subtle);
}

.modal-header h3 {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.modal-close {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: var(--spacing-2);
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--transition-normal);
}

.modal-close:hover {
  color: var(--color-text-primary);
}

.modal-body {
  padding: var(--modal-body-padding);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}

.modal-footer {
  padding: var(--modal-footer-padding);
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-4);
}
</style>
