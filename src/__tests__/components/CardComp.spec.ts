import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CardComp from '@/components/CardComp.vue'

describe('CardComp', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('rendering', () => {
    it('renders a card element', () => {
      const wrapper = mount(CardComp)

      expect(wrapper.find('.card').exists()).toBe(true)
    })

    it('applies card class correctly', () => {
      const wrapper = mount(CardComp)

      expect(wrapper.classes()).toContain('card')
    })
  })

  describe('CSS classes', () => {
    it('can receive additional CSS classes', () => {
      const wrapper = mount(CardComp, {
        attrs: {
          class: 'in-stack',
        },
      })

      expect(wrapper.classes()).toContain('in-stack')
    })

    it('can receive dragging class', () => {
      const wrapper = mount(CardComp, {
        attrs: {
          class: 'dragging',
        },
      })

      expect(wrapper.classes()).toContain('dragging')
    })

    it('can have stack-bottom class', () => {
      const wrapper = mount(CardComp, {
        attrs: {
          class: 'in-stack stack-bottom',
        },
      })

      expect(wrapper.classes()).toContain('in-stack')
      expect(wrapper.classes()).toContain('stack-bottom')
    })
  })

  describe('CSS custom properties', () => {
    it('accepts style object with CSS variables', () => {
      const wrapper = mount(CardComp, {
        attrs: {
          style: {
            '--col': 3,
            '--row': 2,
          },
        },
      })

      expect(wrapper.attributes('style')).toContain('--col: 3')
      expect(wrapper.attributes('style')).toContain('--row: 2')
    })

    it('accepts transform style for positioning', () => {
      const wrapper = mount(CardComp, {
        attrs: {
          style: {
            transform: 'translate(100px, 200px) rotate(15deg)',
          },
        },
      })

      expect(wrapper.attributes('style')).toContain('transform')
    })
  })
})
