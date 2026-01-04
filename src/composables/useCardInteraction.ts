import { ref, type Ref } from 'vue'
import { useCardStore } from '@/stores/cards'
import { useDrag } from '@/composables/useDrag'
import { useHover } from '@/composables/useHover'
import { useShake } from '@/composables/useShake'
import { useCardPhysics } from '@/composables/useCardPhysics'
import type { DragTarget, Zone } from '@/types'
import { CARD_BACK_COL, CARD_BACK_ROW, CARD_W, CARD_H } from '@/types'
import type { ClientMessage } from '../../shared/types'

interface CardInteractionOptions {
  onHandCardDrop?: (event: PointerEvent) => boolean
  addToHand?: (event: PointerEvent, cardId: number) => boolean
  handRef?: Ref<HTMLElement | null>
  sendMessage?: (msg: ClientMessage) => void
}

export function useCardInteraction(options: CardInteractionOptions = {}) {
  const canvasRef = ref<HTMLElement | null>(null)

  const cardStore = useCardStore()
  const drag = useDrag()
  const hover = useHover()
  const shake = useShake()
  const physics = useCardPhysics()

  // Helper to send WebSocket messages (optional)
  const send = (msg: ClientMessage) => {
    options.sendMessage?.(msg)
  }

  // Track selection start positions for smooth dragging
  const selectionStartPositions = ref<Map<number, { x: number; y: number }>>(new Map())
  const selectionDragStart = ref<{ x: number; y: number } | null>(null)

  // Track when dragging over hand zone
  const isOverHand = ref(false)

  // Mutable handler for hand card drop (set after hand composable is created)
  let handCardDropHandler: ((event: PointerEvent) => boolean) | undefined = options.onHandCardDrop

  const setHandCardDropHandler = (handler: (event: PointerEvent) => boolean) => {
    handCardDropHandler = handler
  }

  // Zone hit detection helper
  const findZoneAtPoint = (x: number, y: number): Zone | null => {
    // Check zones in reverse order (top-most first)
    for (let i = cardStore.zones.length - 1; i >= 0; i--) {
      const zone = cardStore.zones[i]
      if (
        zone &&
        x >= zone.x &&
        x <= zone.x + zone.width &&
        y >= zone.y &&
        y <= zone.y + zone.height
      ) {
        return zone
      }
    }
    return null
  }

  // Check if point is in resize handle (bottom-right corner)
  const isInResizeHandle = (x: number, y: number, zone: Zone): boolean => {
    const handleSize = 16
    return (
      x >= zone.x + zone.width - handleSize &&
      x <= zone.x + zone.width &&
      y >= zone.y + zone.height - handleSize &&
      y <= zone.y + zone.height
    )
  }

  // Apply pending position during drag
  const applyPendingPosition = () => {
    if (!drag.isDragging.value || !drag.target.value) return

    const { x, y } = drag.getDelta()
    const target = drag.target.value

    if (target.type === 'zone') {
      const zone = cardStore.zones.find((z) => z.id === target.zoneId)
      if (!zone) return
      cardStore.updateZone(zone.id, { x, y })
      return
    }

    if (target.type === 'zone-resize') {
      const zone = cardStore.zones.find((z) => z.id === target.zoneId)
      if (!zone) return
      const { x: pendingX, y: pendingY } = drag.getPending()
      cardStore.updateZone(zone.id, {
        width: pendingX - zone.x,
        height: pendingY - zone.y,
      })
      return
    }

    if (target.type === 'stack') {
      const stackId = target.stackId
      const stack = cardStore.stacks.find((item) => item.id === stackId)
      if (!stack) return

      stack.anchorX = x
      stack.anchorY = y
      cardStore.updateStackPositions(stack)
      return
    }

    if (drag.target.value.type === 'selection') {
      // Move all selected cards relative to their start positions
      const { x: currentX, y: currentY } = drag.getPending()
      if (!selectionDragStart.value) return

      const deltaX = currentX - selectionDragStart.value.x
      const deltaY = currentY - selectionDragStart.value.y

      selectionStartPositions.value.forEach((startPos, id) => {
        const card = cardStore.cards.find((c) => c.id === id)
        if (card) {
          card.x = startPos.x + deltaX
          card.y = startPos.y + deltaY
        }
      })
      return
    }

    if (target.type === 'card' || target.type === 'hand-card') {
      const card = cardStore.cards[target.index]
      if (!card) return

      card.x = x
      card.y = y
    }
  }

  // Start dragging a stack (long press)
  const startStackDrag = (index: number) => {
    if (drag.isDragging.value) return

    const card = cardStore.cards[index]
    if (!card || card.stackId === null) return

    const stack = cardStore.stacks.find((item) => item.id === card.stackId)
    if (!stack) return

    // Send lock message to server so other players see the grab
    send({ type: 'stack:lock', stackId: stack.id })

    // Detach stack from its zone so it can be moved out (e.g., right-click drag)
    if (stack.kind === 'zone' && stack.zoneId !== undefined) {
      const zone = cardStore.zones.find((z) => z.id === stack.zoneId)
      if (zone && zone.stackId === stack.id) {
        zone.stackId = null
      }
      stack.zoneId = undefined
      stack.kind = 'free'
    }

    const { x, y } = drag.getPending()
    const target: DragTarget = { type: 'stack', stackId: stack.id, index }

    drag.target.value = target
    drag.activeIndex.value = index
    drag.isDragging.value = true

    // Set offset so that getDelta() returns current stack anchor (no initial movement)
    drag.setOffset(x - stack.anchorX, y - stack.anchorY)

    hover.reset()
  }

  // Start dragging a single card
  const startCardDrag = (index: number): boolean => {
    if (drag.isDragging.value) return false

    const card = cardStore.cards[index]
    if (!card) return false

    // If card is in a stack, only allow dragging from top
    if (card.stackId !== null) {
      const stack = cardStore.stacks.find((item) => item.id === card.stackId)
      if (!stack) return false

      const topId = stack.cardIds[stack.cardIds.length - 1]
      if (topId !== card.id) return false

      // Notify server that card is being removed from stack
      send({ type: 'stack:remove_card', cardId: card.id })
      cardStore.removeFromStack(card.id)
    }

    const { x, y } = drag.getPending()
    const target: DragTarget = { type: 'card', index }

    drag.startDrag(
      { pointerId: 0, clientX: x, clientY: y } as PointerEvent,
      index,
      card.x,
      card.y,
      canvasRef,
      target,
    )

    // Send lock message to server so other players see the grab
    send({ type: 'card:lock', cardId: card.id })

    // Pass grab offset (where on card user clicked)
    const grabOffsetX = x - card.x
    physics.startDrag(x, y, grabOffsetX)
    hover.reset()
    drag.schedulePositionUpdate(applyPendingPosition)
    return true
  }

  // Start dragging multiple selected cards
  const startSelectionDrag = (index: number): boolean => {
    if (drag.isDragging.value) return false

    const card = cardStore.cards[index]
    if (!card) return false

    const { x, y } = drag.getPending()
    const target: DragTarget = { type: 'selection' }

    drag.startDrag(
      { pointerId: 0, clientX: x, clientY: y } as PointerEvent,
      index,
      card.x,
      card.y,
      canvasRef,
      target,
    )

    // Store initial positions for all selected cards
    selectionStartPositions.value = new Map()
    cardStore.getSelectedIds().forEach((id) => {
      const c = cardStore.cards.find((card) => card.id === id)
      if (c) {
        selectionStartPositions.value.set(id, { x: c.x, y: c.y })
      }
    })

    hover.reset()
    drag.schedulePositionUpdate(applyPendingPosition)
    return true
  }

  // Pointer event handlers
  const onCardPointerDown = (event: PointerEvent, index: number) => {
    // Left-click (0) or right-click (2) only
    if (event.button !== 0 && event.button !== 2) return

    event.preventDefault()
    const targetEl = event.currentTarget as HTMLElement | null
    targetEl?.setPointerCapture(event.pointerId)

    drag.initPointer(event, canvasRef)
    drag.activeIndex.value = index

    const card = cardStore.cards[index]
    const isInStack = card && card.stackId !== null

    // Ctrl+click (mouse) or two-finger tap detection for selection toggle
    // For touch: we detect multi-touch via event.isPrimary being false or checking touches
    const isMultiTouch = !event.isPrimary
    const isCtrlClick = event.ctrlKey || event.metaKey

    if ((isCtrlClick || isMultiTouch) && !isInStack && event.button === 0 && card) {
      // Toggle selection
      cardStore.toggleSelect(card.id)
      return
    }

    // If clicking on a selected card, drag the entire selection
    if (card && cardStore.isSelected(card.id) && event.button === 0) {
      const { x, y } = drag.getPending()
      selectionDragStart.value = { x, y }
      startSelectionDrag(index)
      return
    }

    // Clicking on unselected card clears selection (unless Ctrl held)
    if (!isCtrlClick && cardStore.hasSelection) {
      cardStore.clearSelection()
    }

    // Right-click on stacked card = immediate stack drag
    if (event.button === 2 && isInStack) {
      startStackDrag(index)
      return
    }

    // Left-click on stacked card = long-press for stack, move for card
    if (isInStack) {
      drag.setLongPressTimer(() => startStackDrag(index))
    } else {
      startCardDrag(index)
    }
  }

  // Prevent context menu on right-click drag
  const onCardContextMenu = (event: Event) => {
    event.preventDefault()
  }

  // Double-click to flip card
  const onCardDoubleClick = (event: MouseEvent, index: number) => {
    event.preventDefault()
    const card = cardStore.cards[index]
    if (!card) return

    if (card.stackId !== null) {
      // Double-click on stacked card = flip entire stack
      cardStore.flipStack(card.stackId)
      send({ type: 'stack:flip', stackId: card.stackId })
    } else {
      // Double-click on free card = flip single card
      cardStore.flipCard(card.id)
      send({ type: 'card:flip', cardId: card.id })
    }
  }

  // Get the sprite column for a card (face or back)
  const getCardCol = (index: number) => {
    const card = cardStore.cards[index]
    return card?.faceUp ? card.col : CARD_BACK_COL
  }

  // Get the sprite row for a card (face or back)
  const getCardRow = (index: number) => {
    const card = cardStore.cards[index]
    return card?.faceUp ? card.row : CARD_BACK_ROW
  }

  // Computed z-index for cards
  const getCardZ = (index: number) => {
    const card = cardStore.cards[index]
    if (!card) return 0

    const draggingStackId = drag.target.value?.type === 'stack' ? drag.target.value.stackId : null

    return cardStore.cardZ(card, index, drag.activeIndex.value, draggingStackId)
  }

  const onCardPointerMove = (event: PointerEvent) => {
    if (!drag.isValidPointer(event.pointerId)) return

    drag.updatePending(event, canvasRef)

    // Try to start card drag if not already dragging
    if (!drag.isDragging.value && drag.activeIndex.value !== null) {
      const card = cardStore.cards[drag.activeIndex.value]
      if (card && card.stackId !== null) {
        if (startCardDrag(drag.activeIndex.value)) {
          drag.clearLongPressTimer()
        }
      }
    }

    if (!drag.isDragging.value) return

    // Update physics for tilt effect
    if (drag.target.value?.type === 'card' || drag.target.value?.type === 'hand-card') {
      const { x, y } = drag.getPending()
      physics.updateVelocity(x, y)
    }

    // Detect shake gesture during selection drag
    if (drag.target.value?.type === 'selection') {
      const { x, y } = drag.getPending()
      if (shake.update(x, y)) {
        // Shake detected! Stack the selection and continue holding the new stack
        const anchorCard = cardStore.cards[drag.activeIndex.value!]
        if (anchorCard) {
          const newStack = cardStore.stackSelection(anchorCard.x, anchorCard.y)
          if (newStack) {
            // Clean up selection drag state
            selectionStartPositions.value.clear()
            selectionDragStart.value = null
            shake.reset()

            // Transition to stack drag (keep holding)
            const topCardId = newStack.cardIds[newStack.cardIds.length - 1]
            const topCardIndex = cardStore.cards.findIndex((c) => c.id === topCardId)
            if (topCardIndex !== -1) {
              const target: DragTarget = {
                type: 'stack',
                stackId: newStack.id,
                index: topCardIndex,
              }
              drag.target.value = target
              drag.activeIndex.value = topCardIndex

              // Update offset for stack anchor
              const offsetX = x - newStack.anchorX
              const offsetY = y - newStack.anchorY
              drag.setOffset(offsetX, offsetY)
            }
            cardStore.updateAllStacks()
          }
          return
        }
      }
    }

    // Detect shake gesture during stack drag -> shuffle
    if (drag.target.value?.type === 'stack') {
      const { x, y } = drag.getPending()
      if (shake.update(x, y)) {
        cardStore.shuffleStack(drag.target.value.stackId)
        send({ type: 'stack:shuffle', stackId: drag.target.value.stackId })
        shake.reset()
        // Continue dragging, don't return
      }

      // Update hover target for stack-on-stack merging
      const draggingStackId = drag.target.value.stackId
      const stack = cardStore.stacks.find((s) => s.id === draggingStackId)
      const excludeIds = stack ? stack.cardIds : []
      hover.update(x, y, cardStore.cards, excludeIds, (card, idx) =>
        cardStore.cardZ(card, idx, drag.activeIndex.value, draggingStackId),
      )
    }

    // Update hover target for card drags
    if (drag.target.value?.type === 'card') {
      const draggingId =
        drag.activeIndex.value !== null ? (cardStore.cards[drag.activeIndex.value]?.id ?? -1) : -1
      const { x, y } = drag.getPending()
      hover.update(x, y, cardStore.cards, draggingId, (card, idx) =>
        cardStore.cardZ(card, idx, drag.activeIndex.value, null),
      )

      // Check if over hand zone
      if (options.handRef) {
        isOverHand.value = drag.isInBounds(event, options.handRef)
      }
    }

    drag.schedulePositionUpdate(applyPendingPosition)
  }

  const onCardPointerUp = (event: PointerEvent, handRef?: Ref<HTMLElement | null>) => {
    if (!drag.isValidPointer(event.pointerId)) return

    const targetEl = event.currentTarget as HTMLElement | null
    targetEl?.releasePointerCapture(event.pointerId)

    drag.clearLongPressTimer()

    if (!drag.isDragging.value) {
      drag.reset()
      hover.reset()
      return
    }

    applyPendingPosition()

    const { x: dropX, y: dropY } = drag.getPending()

    // Handle zone drag/resize drop (just finalize position)
    if (drag.target.value?.type === 'zone' || drag.target.value?.type === 'zone-resize') {
      // Position already updated in applyPendingPosition
      // Send zone update to server
      const zoneId =
        drag.target.value.type === 'zone' ? drag.target.value.zoneId : drag.target.value.zoneId
      const zone = cardStore.zones.find((z) => z.id === zoneId)
      if (zone) {
        send({
          type: 'zone:update',
          zoneId: zone.id,
          updates: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
        })
      }
    }
    // Handle stack drop
    else if (drag.target.value?.type === 'stack') {
      const stackId = drag.target.value.stackId
      const stack = cardStore.stacks.find((item) => item.id === stackId)
      let handled = false

      // Try to merge with another stack (hover target)
      if (hover.state.ready && hover.state.cardId) {
        const targetCard = cardStore.cards.find((c) => c.id === hover.state.cardId)
        if (targetCard && targetCard.stackId !== null && targetCard.stackId !== stackId) {
          // Merge into target stack
          handled = cardStore.mergeStacks(stackId, targetCard.stackId)
          if (handled) {
            send({ type: 'stack:merge', sourceStackId: stackId, targetStackId: targetCard.stackId })
          }
        } else if (targetCard && targetCard.stackId === null) {
          // Dropping on a free card - create stack with that card, then merge
          const targetStack = cardStore.createStackAt(targetCard.x, targetCard.y, 'free')
          targetStack.cardIds.push(targetCard.id)
          targetCard.stackId = targetStack.id
          targetCard.isInDeck = true
          handled = cardStore.mergeStacks(stackId, targetStack.id)
          if (handled) {
            send({
              type: 'stack:create',
              cardIds: [targetCard.id, ...stack!.cardIds],
              anchorX: targetCard.x,
              anchorY: targetCard.y,
            })
          }
        }
      }

      // Try to add to a zone
      if (!handled && stack) {
        const zone = findZoneAtPoint(dropX, dropY)
        if (zone) {
          const ids = [...stack.cardIds]
          ids.forEach((id) => {
            cardStore.addToZone(id, zone.id)
            send({ type: 'zone:add_card', zoneId: zone.id, cardId: id })
          })
          handled = true
        }
      }

      // Try to add stack to hand zone
      if (!handled && handRef && drag.isInBounds(event, handRef)) {
        if (stack) {
          cardStore.addStackToHand(stackId)
          send({ type: 'hand:add_stack', stackId })
          handled = true
        }
      }

      // If not handled, just send stack move
      if (!handled && stack) {
        send({ type: 'stack:move', stackId, anchorX: stack.anchorX, anchorY: stack.anchorY })
      }

      // Release the stack lock so other players no longer see the grab
      send({ type: 'stack:unlock', stackId })
    }
    // Handle selection drop
    else if (drag.target.value?.type === 'selection') {
      // Check if dropped on a zone
      const zone = findZoneAtPoint(dropX, dropY)
      if (zone) {
        cardStore.getSelectedIds().forEach((id) => {
          cardStore.addToZone(id, zone.id)
          send({ type: 'zone:add_card', zoneId: zone.id, cardId: id })
        })
        cardStore.clearSelection()
      } else {
        // Bump z-index of all selected cards and send moves
        cardStore.bumpSelectionZ()
        cardStore.getSelectedIds().forEach((id) => {
          const card = cardStore.cards.find((c) => c.id === id)
          if (card) {
            send({ type: 'card:move', cardId: card.id, x: card.x, y: card.y })
          }
        })
      }
      selectionStartPositions.value.clear()
      selectionDragStart.value = null
      shake.reset()
    }
    // Handle hand card drop (delegate to handler)
    else if (drag.target.value?.type === 'hand-card') {
      handCardDropHandler?.(event)
    }
    // Handle card drop
    else if (drag.activeIndex.value !== null) {
      const card = cardStore.cards[drag.activeIndex.value]
      if (card) {
        let stacked = false

        // Try to stack on hover target
        if (hover.state.ready && hover.state.cardId) {
          const targetCard = cardStore.cards.find((c) => c.id === hover.state.cardId)
          const targetHadStack = targetCard?.stackId !== null

          stacked = cardStore.stackCardOnTarget(card.id, hover.state.cardId)
          if (stacked && targetCard) {
            if (targetHadStack && targetCard.stackId !== null) {
              // Target already had a stack - just add our card to it
              send({ type: 'stack:add_card', stackId: targetCard.stackId, cardId: card.id })
            } else if (targetCard.stackId !== null) {
              // Target didn't have a stack - create a new stack with both cards
              send({
                type: 'stack:create',
                cardIds: [targetCard.id, card.id],
                anchorX: targetCard.x,
                anchorY: targetCard.y,
              })
            }
          }
        }

        // Try to add to a zone
        if (!stacked) {
          const zone = findZoneAtPoint(dropX, dropY)
          if (zone) {
            stacked = cardStore.addToZone(card.id, zone.id)
            if (stacked) {
              send({ type: 'zone:add_card', zoneId: zone.id, cardId: card.id })
            }
          }
        }

        // Try to add to hand zone
        if (!stacked && handRef && drag.isInBounds(event, handRef)) {
          stacked = cardStore.addToHand(card.id)
          if (stacked) {
            send({ type: 'hand:add', cardId: card.id })
          }
        }

        // If not stacked, check for throw
        if (!stacked) {
          card.stackId = null
          card.isInDeck = false
          cardStore.bumpCardZ(card.id)

          // Send card move to server
          send({ type: 'card:move', cardId: card.id, x: card.x, y: card.y })

          // Get throw velocity
          const { vx, vy } = physics.endDrag()
          const speed = Math.sqrt(vx * vx + vy * vy)

          // Only throw if moving fast enough
          if (speed > 3) {
            physics.startThrow(
              card.id,
              card.x,
              card.y,
              vx,
              vy,
              (x, y) => {
                card.x = x
                card.y = y
              },
              () => {
                // Throw complete - send final position
                send({ type: 'card:move', cardId: card.id, x: card.x, y: card.y })
              },
            )
          }
        } else {
          physics.endDrag()
        }

        // Release the lock so other players no longer see the grab
        send({ type: 'card:unlock', cardId: card.id })
      }
    }

    drag.reset()
    hover.reset()
    shake.reset()
    isOverHand.value = false
    cardStore.updateAllStacks()
  }

  // Zone interaction handlers
  const onZonePointerDown = (event: PointerEvent, zoneId: number) => {
    if (event.button !== 0) return

    const zone = cardStore.zones.find((z) => z.id === zoneId)
    if (!zone) return

    // If zone is locked, don't allow dragging or resizing
    if (zone.locked) return

    event.preventDefault()
    event.stopPropagation()
    const targetEl = event.currentTarget as HTMLElement | null
    targetEl?.setPointerCapture(event.pointerId)

    drag.initPointer(event, canvasRef)

    const { x, y } = drag.getPending()

    // Check if clicking on resize handle
    if (isInResizeHandle(x, y, zone)) {
      const target: DragTarget = { type: 'zone-resize', zoneId, handle: 'se' }
      drag.target.value = target
      drag.isDragging.value = true
      drag.setOffset(0, 0)
    } else {
      // Regular zone drag
      const target: DragTarget = { type: 'zone', zoneId }
      drag.target.value = target
      drag.isDragging.value = true
      drag.setOffset(x - zone.x, y - zone.y)
    }
  }

  const onZonePointerMove = (event: PointerEvent) => {
    if (!drag.isValidPointer(event.pointerId)) return
    drag.updatePending(event, canvasRef)
    drag.schedulePositionUpdate(applyPendingPosition)
  }

  const onZonePointerUp = (event: PointerEvent) => {
    if (!drag.isValidPointer(event.pointerId)) return

    const targetEl = event.currentTarget as HTMLElement | null
    targetEl?.releasePointerCapture(event.pointerId)

    applyPendingPosition()

    // Send zone update to server
    if (drag.target.value?.type === 'zone' || drag.target.value?.type === 'zone-resize') {
      const zoneId =
        drag.target.value.type === 'zone' ? drag.target.value.zoneId : drag.target.value.zoneId
      const zone = cardStore.zones.find((z) => z.id === zoneId)
      if (zone) {
        send({
          type: 'zone:update',
          zoneId: zone.id,
          updates: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
        })
      }
    }

    drag.reset()
  }

  const initCards = (count: number, externalCanvasRef?: Ref<HTMLElement | null>) => {
    const canvas = externalCanvasRef?.value ?? canvasRef.value
    canvasRef.value = canvas
    const rect = canvas?.getBoundingClientRect()
    cardStore.createCards(count, rect?.width, rect?.height)

    // Create default deck zone in bottom-right
    if (cardStore.zones.length === 0 && rect) {
      cardStore.createZone(rect.width - 90, rect.height - 180, 'Deck', false)
    }

    cardStore.updateAllStacks()
  }

  return {
    canvasRef,
    drag,
    hover,
    physics,
    isOverHand,
    findZoneAtPoint,
    getCardCol,
    getCardRow,
    getCardZ,
    onCardPointerDown,
    onCardPointerMove,
    onCardPointerUp,
    onCardContextMenu,
    onCardDoubleClick,
    onZonePointerDown,
    onZonePointerMove,
    onZonePointerUp,
    initCards,
    setHandCardDropHandler,
  }
}
