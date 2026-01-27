import { ref, watch } from 'vue'
import { PLAYER_COLORS } from '../../shared/types'

const PROFILE_KEY = 'cardz_player_profile'

interface PlayerProfile {
  name: string
  preferredColor: string
}

const defaultProfile: PlayerProfile = {
  name: '',
  preferredColor: PLAYER_COLORS[0],
}

function loadProfile(): PlayerProfile {
  try {
    const stored = localStorage.getItem(PROFILE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        name: typeof parsed.name === 'string' ? parsed.name : '',
        preferredColor: PLAYER_COLORS.includes(parsed.preferredColor)
          ? parsed.preferredColor
          : PLAYER_COLORS[0],
      }
    }
  } catch {
    // Invalid JSON, use defaults
  }
  return { ...defaultProfile }
}

function saveProfile(profile: PlayerProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

// Singleton state shared across all uses
const name = ref('')
const preferredColor = ref<string>(PLAYER_COLORS[0])
let initialized = false

export function usePlayerProfile() {
  if (!initialized) {
    const profile = loadProfile()
    name.value = profile.name
    preferredColor.value = profile.preferredColor
    initialized = true

    // Auto-save on changes
    watch([name, preferredColor], () => {
      saveProfile({
        name: name.value,
        preferredColor: preferredColor.value,
      })
    })
  }

  return {
    name,
    preferredColor,
    PLAYER_COLORS,
  }
}
