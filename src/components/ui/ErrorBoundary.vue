<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

defineProps<{
  fallbackMessage?: string
}>()

const emit = defineEmits<{
  error: [error: Error, info: string]
}>()

const hasError = ref(false)
const errorMessage = ref('')
const errorStack = ref('')

// Capture errors from child components
onErrorCaptured((error: Error, instance, info: string) => {
  hasError.value = true
  errorMessage.value = error.message
  errorStack.value = error.stack ?? ''

  // Log to console for debugging
  console.error('[ErrorBoundary] Caught error:', error)
  console.error('[ErrorBoundary] Component info:', info)

  // Emit error event for parent handling (e.g., error reporting)
  emit('error', error, info)

  // Return false to prevent the error from propagating further
  return false
})

const reset = () => {
  hasError.value = false
  errorMessage.value = ''
  errorStack.value = ''
}

// Expose reset method for parent components
defineExpose({ reset })
</script>

<template>
  <slot v-if="!hasError" />
  <div v-else class="error-boundary">
    <div class="error-content">
      <div class="error-icon">⚠️</div>
      <h3>{{ fallbackMessage || 'Something went wrong' }}</h3>
      <p class="error-message">{{ errorMessage }}</p>
      <details v-if="errorStack" class="error-details">
        <summary>Technical details</summary>
        <pre>{{ errorStack }}</pre>
      </details>
      <button class="retry-button" @click="reset">Try Again</button>
    </div>
  </div>
</template>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 8px;
  color: #fff;
}

.error-content {
  text-align: center;
  max-width: 500px;
}

.error-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

h3 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
  color: #ff6b6b;
}

.error-message {
  margin: 0 0 1rem;
  color: #aaa;
  font-size: 0.875rem;
}

.error-details {
  margin-bottom: 1rem;
  text-align: left;
}

.error-details summary {
  cursor: pointer;
  color: #888;
  font-size: 0.75rem;
  margin-bottom: 0.5rem;
}

.error-details pre {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.625rem;
  overflow-x: auto;
  max-height: 150px;
  color: #ccc;
}

.retry-button {
  padding: 0.5rem 1.5rem;
  background: #4a9eff;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.retry-button:hover {
  background: #3a8eef;
}
</style>
