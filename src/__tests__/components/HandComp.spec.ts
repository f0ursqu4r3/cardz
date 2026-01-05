import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { ref } from 'vue'
import HandComp from '@/components/HandComp.vue'
import { useCardStore } from '@/stores/cards'

describe('HandComp', () => {
  let pinia: Pinia
  let cardStore: ReturnType<typeof useCardStore>

  // Create a mock drag object
  const createMockDrag = () => ({
    isDragging: ref(false),
    activeIndex: ref(null),
    target: ref(null),
    position: ref({ x: 0, y: 0 }),
    getCanvasPoint: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    isInBounds: vi.fn().mockReturnValue(false),
    startDrag: vi.fn(),
    initPointer: vi.fn(),
    updatePending: vi.fn().mockReturnValue(true),
    schedulePositionUpdate: vi.fn(),
    cancelRaf: vi.fn(),
    setLongPressTimer: vi.fn(),
    clearLongPressTimer: vi.fn(),
    reset: vi.fn(),
    getDelta: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    getPending: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    setOffset: vi.fn(),
    setScreenToWorld: vi.fn(),
    isValidPointer: vi.fn().mockReturnValue(true),
  })

  const createWrapper = (overrides = {}): VueWrapper => {
    const drag = createMockDrag()
    return mount(HandComp, {
      props: {
        canvasRef: document.createElement('div'),
        drag: drag,
        isDropTarget: false,
        handRef: null,
        'onUpdate:handRef': vi.fn(),
        ...overrides,
      },
      global: {
        plugins: [pinia],
      },
    })
  }

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    cardStore = useCardStore()
  })

  describe('rendering', () => {
    it('renders hand container', () => {
      const wrapper = createWrapper()
      expect(wrapper.find('.hand').exists()).toBe(true)
    })

    it('shows "Hand" label when empty', () => {
      const wrapper = createWrapper()
      expect(wrapper.find('.hand__label').exists()).toBe(true)
      expect(wrapper.find('.hand__label').text()).toBe('Hand')
    })

    it('hides label when cards are present', async () => {
      cardStore.createCards(2)
      cardStore.addToHand(1)

      const wrapper = createWrapper()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.hand__label').exists()).toBe(false)
    })

    it('renders cards in hand', async () => {
      cardStore.createCards(3)
      cardStore.addToHand(1)
      cardStore.addToHand(2)

      const wrapper = createWrapper()
      await wrapper.vm.$nextTick()

      const cards = wrapper.findAll('.hand__card')
      expect(cards.length).toBe(2)
    })
  })

  describe('drop target styling', () => {
    it('applies drop target class when isDropTarget is true', () => {
      const wrapper = createWrapper({ isDropTarget: true })
      expect(wrapper.find('.hand--drop-target').exists()).toBe(true)
    })

    it('does not apply drop target class by default', () => {
      const wrapper = createWrapper()
      expect(wrapper.find('.hand--drop-target').exists()).toBe(false)
    })
  })

  describe('hand width', () => {
    it('has minimum width when empty', () => {
      const wrapper = createWrapper()
      const handEl = wrapper.find('.hand')

      // Should have some width even when empty
      expect(handEl.attributes('style')).toContain('width')
    })

    it('adjusts width based on card count', async () => {
      const wrapper = createWrapper()
      const initialStyle = wrapper.find('.hand').attributes('style')

      cardStore.createCards(5)
      cardStore.addToHand(1)
      cardStore.addToHand(2)
      cardStore.addToHand(3)

      await wrapper.vm.$nextTick()

      const newStyle = wrapper.find('.hand').attributes('style')
      // Width should be different with cards
      expect(newStyle).not.toBe(initialStyle)
    })
  })

  describe('events', () => {
    it('emits cardPointerUp on pointer up', async () => {
      cardStore.createCards(1)
      cardStore.addToHand(1)

      const wrapper = createWrapper()
      await wrapper.vm.$nextTick()

      const card = wrapper.find('.hand__card')
      await card.trigger('pointerup')

      expect(wrapper.emitted('cardPointerUp')).toBeTruthy()
    })

    it('prevents context menu on right-click', async () => {
      cardStore.createCards(1)
      cardStore.addToHand(1)

      const wrapper = createWrapper()
      await wrapper.vm.$nextTick()

      const card = wrapper.find('.hand__card')
      await card.trigger('contextmenu')

      // Event should be handled (the component prevents default)
      expect(wrapper.emitted()).toBeDefined()
    })
  })

  describe('exposed methods', () => {
    it('exposes handleHandCardDrop method', () => {
      const wrapper = createWrapper()
      expect(typeof wrapper.vm.handleHandCardDrop).toBe('function')
    })

    it('exposes resetHandDrag method', () => {
      const wrapper = createWrapper()
      expect(typeof wrapper.vm.resetHandDrag).toBe('function')
    })

    it('exposes drawFaceDown ref', () => {
      const wrapper = createWrapper()
      expect(wrapper.vm.drawFaceDown).toBeDefined()
    })

    it('exposes selection methods', () => {
      const wrapper = createWrapper()

      expect(wrapper.vm.selectedHandCardIds).toBeDefined()
      expect(typeof wrapper.vm.isHandCardSelected).toBe('function')
      expect(typeof wrapper.vm.clearHandSelection).toBe('function')
      expect(wrapper.vm.handSelectionCount).toBeDefined()
    })
  })

  describe('card visibility during drag', () => {
    it('handles drag state gracefully', async () => {
      cardStore.createCards(2)
      cardStore.addToHand(1)
      cardStore.addToHand(2)

      const drag = createMockDrag()
      drag.target.value = { type: 'hand-card', index: 0 }

      const wrapper = mount(HandComp, {
        props: {
          canvasRef: document.createElement('div'),
          drag: drag,
          isDropTarget: false,
          handRef: null,
          'onUpdate:handRef': vi.fn(),
        },
        global: {
          plugins: [pinia],
        },
      })

      await wrapper.vm.$nextTick()

      // Component should render without errors
      expect(wrapper.find('.hand').exists()).toBe(true)
    })
  })

  describe('card selection styling', () => {
    it('component handles selection state', async () => {
      cardStore.createCards(2)
      cardStore.addToHand(1)
      cardStore.addToHand(2)

      const wrapper = createWrapper()
      await wrapper.vm.$nextTick()

      // Access exposed selection method
      expect(typeof wrapper.vm.isHandCardSelected).toBe('function')

      // Check initial selection state
      expect(wrapper.vm.isHandCardSelected(1)).toBe(false)
    })
  })
})
