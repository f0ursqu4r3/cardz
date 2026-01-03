import { ref, computed, watch, onUnmounted, type Ref } from 'vue'
import { MousePointer2, Pointer, Hand, Grab, type IconNode } from 'lucide'

export type CursorType = 'default' | 'pointer' | 'grab' | 'grabbing'

// Hotspot positions for each cursor type
const CURSOR_HOTSPOTS: Record<CursorType, { x: number; y: number }> = {
  default: { x: 4, y: 4 },
  pointer: { x: 10, y: 2 },
  grab: { x: 12, y: 10 },
  grabbing: { x: 12, y: 12 },
}

// Map cursor types to lucide icons
const CURSOR_ICONS: Record<CursorType, IconNode> = {
  default: MousePointer2,
  pointer: Pointer,
  grab: Hand,
  grabbing: Grab,
}

/**
 * Convert a lucide IconNode to an SVG string with custom color
 * IconNode is [tag, attrs][] - an array of element tuples
 */
function iconToSvg(icon: IconNode, color: string): string {
  // Build child elements (paths, circles, etc.)
  const childrenStr = icon
    .map(([tag, attrs]) => {
      const attrsStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')
      return `<${tag} ${attrsStr}/>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${childrenStr}</svg>`
}

/**
 * Create a data URL for a cursor SVG with the given color
 */
function createCursorUrl(type: CursorType, color: string): string {
  const icon = CURSOR_ICONS[type]
  const { x, y } = CURSOR_HOTSPOTS[type]
  const svg = iconToSvg(icon, color)
  const encoded = encodeURIComponent(svg)
  return `url("data:image/svg+xml,${encoded}") ${x} ${y}, auto`
}

/**
 * Composable for managing custom colored cursors
 */
export function useCursor(playerColor: Ref<string>) {
  const cursorType = ref<CursorType>('default')
  const styleElement = ref<HTMLStyleElement | null>(null)

  // Generate CSS cursor value
  const cursorStyle = computed(() => {
    return createCursorUrl(cursorType.value, playerColor.value)
  })

  // Update CSS custom property when color or type changes
  watch(
    playerColor,
    (color) => {
      // Create or update style element with cursor definitions
      if (!styleElement.value) {
        styleElement.value = document.createElement('style')
        document.head.appendChild(styleElement.value)
      }

      // Generate CSS with all cursor states
      const defaultCursor = createCursorUrl('default', color)
      const pointerCursor = createCursorUrl('pointer', color)
      const grabCursor = createCursorUrl('grab', color)
      const grabbingCursor = createCursorUrl('grabbing', color)

      styleElement.value.textContent = `
        /* Base table view cursor */
        .table-view { cursor: ${defaultCursor}; }

        /* State-based cursor classes */
        .table-view.cursor--pointer { cursor: ${pointerCursor}; }
        .table-view.cursor--grab { cursor: ${grabCursor}; }
        .table-view.cursor--grabbing { cursor: ${grabbingCursor} !important; }

        /* Cards and interactive elements show grab cursor on hover */
        .table-view .card:not(.dragging) { cursor: ${grabCursor}; }
        .table-view .zone:not(.zone--dragging):not(.zone--locked) { cursor: ${grabCursor}; }
        .table-view .hand__card { cursor: ${grabCursor}; }

        /* Override with grabbing when in grabbing state */
        .table-view.cursor--grabbing .card,
        .table-view.cursor--grabbing .zone,
        .table-view.cursor--grabbing .hand__card { cursor: ${grabbingCursor} !important; }
      `
    },
    { immediate: true },
  )

  // Cleanup on unmount
  onUnmounted(() => {
    if (styleElement.value) {
      document.head.removeChild(styleElement.value)
      styleElement.value = null
    }
  })

  const setCursor = (type: CursorType) => {
    cursorType.value = type
  }

  return {
    cursorType,
    cursorStyle,
    setCursor,
  }
}
