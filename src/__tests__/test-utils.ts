/**
 * Test utilities and mocks for the cardz client test suite
 */
import { vi } from 'vitest'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import type { CardData, Stack, Zone } from '@/types'

// ============================================================================
// Mock Data Factories
// ============================================================================

let cardIdCounter = 1
let stackIdCounter = 1
let zoneIdCounter = 1

export function resetIdCounters() {
  cardIdCounter = 1
  stackIdCounter = 1
  zoneIdCounter = 1
}

export function createMockCard(overrides: Partial<CardData> = {}): CardData {
  return {
    id: cardIdCounter++,
    col: 0,
    row: 0,
    x: 100,
    y: 100,
    isInDeck: false,
    stackId: null,
    z: 100,
    faceUp: true,
    inHand: false,
    lockedBy: null,
    ...overrides,
  }
}

export function createMockStack(overrides: Partial<Stack> = {}): Stack {
  return {
    id: stackIdCounter++,
    cardIds: [],
    anchorX: 100,
    anchorY: 100,
    kind: 'free',
    lockedBy: null,
    ...overrides,
  }
}

export function createMockZone(overrides: Partial<Zone> = {}): Zone {
  return {
    id: zoneIdCounter++,
    x: 200,
    y: 200,
    width: 150,
    height: 150,
    label: 'Test Zone',
    faceUp: true,
    locked: false,
    stackId: null,
    visibility: 'public',
    ownerId: null,
    layout: 'stack',
    cardSettings: {
      cardScale: 1.0,
      cardSpacing: 0.5,
      randomOffset: 0,
      randomRotation: 0,
    },
    ...overrides,
  }
}

// ============================================================================
// Pinia Setup
// ============================================================================

export function setupPinia(): Pinia {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

// ============================================================================
// DOM Mocks
// ============================================================================

export function createMockElement(rect: Partial<DOMRect> = {}): HTMLElement {
  const defaultRect: DOMRect = {
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
    toJSON: () => ({}),
    ...rect,
  }

  return {
    getBoundingClientRect: () => defaultRect,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    style: {},
  } as unknown as HTMLElement
}

export function createMockPointerEvent(
  type: string,
  options: Partial<PointerEvent> = {},
): PointerEvent {
  return {
    type,
    clientX: 100,
    clientY: 100,
    pointerId: 1,
    button: 0,
    buttons: 1,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...options,
  } as unknown as PointerEvent
}

export function createMockWheelEvent(options: Partial<WheelEvent> = {}): WheelEvent {
  return {
    type: 'wheel',
    clientX: 400,
    clientY: 300,
    deltaX: 0,
    deltaY: 0,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    ...options,
  } as unknown as WheelEvent
}

// ============================================================================
// Animation Frame Mocks
// ============================================================================

export function setupAnimationFrameMock() {
  let frameId = 0
  const callbacks: Map<number, FrameRequestCallback> = new Map()

  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++frameId
      callbacks.set(id, callback)
      return id
    }),
  )

  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      callbacks.delete(id)
    }),
  )

  return {
    runFrame: (timestamp = performance.now()) => {
      const currentCallbacks = [...callbacks.entries()]
      callbacks.clear()
      currentCallbacks.forEach(([, callback]) => callback(timestamp))
    },
    runAllFrames: (maxFrames = 100, timestamp = performance.now()) => {
      let frames = 0
      while (callbacks.size > 0 && frames < maxFrames) {
        const currentCallbacks = [...callbacks.entries()]
        callbacks.clear()
        currentCallbacks.forEach(([, callback]) => callback(timestamp + frames * 16))
        frames++
      }
    },
    getPendingCount: () => callbacks.size,
  }
}

// ============================================================================
// Performance Mock
// ============================================================================

export function setupPerformanceMock() {
  let now = 0

  vi.stubGlobal('performance', {
    now: vi.fn(() => now),
  })

  return {
    setTime: (time: number) => {
      now = time
    },
    advanceTime: (delta: number) => {
      now += delta
    },
    getTime: () => now,
  }
}

// ============================================================================
// WebSocket Mock
// ============================================================================

export function createMockWebSocket() {
  const listeners: Map<string, Set<(event: unknown) => void>> = new Map()

  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn((event: string, callback: (event: unknown) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }
      listeners.get(event)!.add(callback)
    }),
    removeEventListener: vi.fn((event: string, callback: (event: unknown) => void) => {
      listeners.get(event)?.delete(callback)
    }),
    dispatchEvent: (event: string, data: unknown) => {
      listeners.get(event)?.forEach((callback) => callback(data))
    },
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  }
}

// ============================================================================
// Vue Test Utils Helpers
// ============================================================================

export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
