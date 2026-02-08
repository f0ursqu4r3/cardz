import { ref } from 'vue'

export interface Toast {
  id: number
  message: string
  type: 'error' | 'success' | 'info'
}

const toasts = ref<Toast[]>([])
let nextId = 0

export function useToast() {
  const show = (message: string, type: Toast['type'] = 'info', duration = 4000) => {
    const existing = toasts.value.find((t) => t.message === message && t.type === type)
    if (existing) return existing.id

    const id = nextId++
    toasts.value.push({ id, message, type })

    setTimeout(() => {
      dismiss(id)
    }, duration)

    return id
  }

  const dismiss = (id: number) => {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      toasts.value.splice(index, 1)
    }
  }

  const error = (message: string, duration?: number) => show(message, 'error', duration)
  const success = (message: string, duration?: number) => show(message, 'success', duration)
  const info = (message: string, duration?: number) => show(message, 'info', duration)

  return {
    toasts,
    show,
    dismiss,
    error,
    success,
    info,
  }
}
