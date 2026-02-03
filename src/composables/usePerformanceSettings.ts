import { ref, watch } from 'vue'

export type PerformanceSettings = {
  lowLatencyDrag: boolean
  reduceEffects: boolean
}

const STORAGE_KEY = 'cardz_performance_settings'

const defaultSettings: PerformanceSettings = {
  lowLatencyDrag: false,
  reduceEffects: false,
}

export const usePerformanceSettings = () => {
  const settings = ref<PerformanceSettings>({ ...defaultSettings })

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<PerformanceSettings>
      settings.value = { ...settings.value, ...parsed }
    } catch {
      // Ignore invalid stored values
    }
  }

  watch(
    settings,
    (value) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    },
    { deep: true },
  )

  const updateSettings = (updates: Partial<PerformanceSettings>) => {
    settings.value = { ...settings.value, ...updates }
  }

  return { settings, updateSettings }
}
