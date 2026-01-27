<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { Users, Hand, LogOut, Ban, Crown, Eye, Shield, ChevronUp, ChevronDown, Pencil, Check, X } from 'lucide-vue-next'
import type { Player } from '../../../shared/types'
import { PLAYER_COLORS } from '../../../shared/types'

const props = defineProps<{
  players: Player[]
  handCounts: Map<string, number>
  currentPlayerId: string | null
  ownHandCount: number
  isCreator: boolean
  isModerator: boolean
  usedColors: Set<string>
}>()

const emit = defineEmits<{
  close: []
  kick: [playerId: string]
  ban: [playerId: string]
  promote: [playerId: string]
  demote: [playerId: string]
  updatePlayer: [updates: { name?: string; color?: string }]
}>()

// Track which player we're confirming ban for
const confirmBanPlayerId = ref<string | null>(null)

// Edit mode for current player
const isEditing = ref(false)
const editName = ref('')
const editColor = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)

const currentPlayer = computed(() =>
  props.players.find((p) => p.id === props.currentPlayerId)
)

const startEditing = () => {
  if (!currentPlayer.value) return
  editName.value = currentPlayer.value.name
  editColor.value = currentPlayer.value.color
  isEditing.value = true
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}

const cancelEditing = () => {
  isEditing.value = false
}

const saveEditing = () => {
  if (!currentPlayer.value) return
  const updates: { name?: string; color?: string } = {}
  if (editName.value.trim() && editName.value.trim() !== currentPlayer.value.name) {
    updates.name = editName.value.trim()
  }
  if (editColor.value !== currentPlayer.value.color) {
    updates.color = editColor.value
  }
  if (Object.keys(updates).length > 0) {
    emit('updatePlayer', updates)
  }
  isEditing.value = false
}

const selectColor = (color: string) => {
  editColor.value = color
}

const isColorAvailable = (color: string): boolean => {
  if (color === currentPlayer.value?.color) return true
  return !props.usedColors.has(color)
}

// Sort players: current player first, then others by name
const sortedPlayers = computed(() => {
  return [...props.players].sort((a, b) => {
    // Current player first
    if (a.id === props.currentPlayerId) return -1
    if (b.id === props.currentPlayerId) return 1
    // Then alphabetically by name
    return a.name.localeCompare(b.name)
  })
})

const getHandCount = (player: Player): number => {
  if (player.id === props.currentPlayerId) {
    return props.ownHandCount
  }
  return props.handCounts.get(player.id) ?? 0
}

const handleKick = (playerId: string) => {
  emit('kick', playerId)
}

const handleBanClick = (playerId: string) => {
  // Show confirmation
  confirmBanPlayerId.value = playerId
}

const confirmBan = () => {
  if (confirmBanPlayerId.value) {
    emit('ban', confirmBanPlayerId.value)
    confirmBanPlayerId.value = null
  }
}

const cancelBan = () => {
  confirmBanPlayerId.value = null
}

// Check if we can kick a player
// Creator can kick anyone except themselves
// Moderator can kick members/spectators (not creator or other moderators)
const canKick = (player: Player): boolean => {
  if (player.id === props.currentPlayerId) return false
  if (props.isCreator) return player.role !== 'creator'
  if (props.isModerator) return player.role === 'member' || player.role === 'spectator'
  return false
}

// Check if we can ban a player (creator only)
const canBan = (player: Player): boolean => {
  return props.isCreator && player.id !== props.currentPlayerId && player.role !== 'creator'
}

// Check if we can promote a player to moderator
// Creator or moderator can promote members
const canPromote = (player: Player): boolean => {
  if (player.id === props.currentPlayerId) return false
  if (!props.isCreator && !props.isModerator) return false
  return player.role === 'member'
}

// Check if we can demote a player from moderator
// Creator or moderator can demote moderators
const canDemote = (player: Player): boolean => {
  if (player.id === props.currentPlayerId) return false
  if (!props.isCreator && !props.isModerator) return false
  return player.role === 'moderator'
}

// Check if we should show any moderation actions
const canModerate = (player: Player): boolean => {
  return canKick(player) || canBan(player) || canPromote(player) || canDemote(player)
}

const handlePromote = (playerId: string) => {
  emit('promote', playerId)
}

const handleDemote = (playerId: string) => {
  emit('demote', playerId)
}
</script>

<template>
  <div class="players-panel" @click.stop>
    <div class="players-panel__header">
      <Users :size="16" />
      <span>Players ({{ players.length }})</span>
    </div>
    <ul class="players-panel__list">
      <li
        v-for="player in sortedPlayers"
        :key="player.id"
        class="players-panel__player"
        :class="{
          'players-panel__player--current': player.id === currentPlayerId,
          'players-panel__player--disconnected': !player.connected,
        }"
      >
        <!-- Edit mode for current player -->
        <template v-if="player.id === currentPlayerId && isEditing">
          <div class="players-panel__edit">
            <div class="players-panel__edit-row">
              <input
                ref="nameInputRef"
                v-model="editName"
                type="text"
                class="players-panel__edit-input"
                maxlength="20"
                placeholder="Your name"
                @keyup.enter="saveEditing"
                @keyup.escape="cancelEditing"
              />
              <button class="players-panel__edit-btn players-panel__edit-btn--save" title="Save" @click="saveEditing">
                <Check :size="14" />
              </button>
              <button class="players-panel__edit-btn players-panel__edit-btn--cancel" title="Cancel" @click="cancelEditing">
                <X :size="14" />
              </button>
            </div>
            <div class="players-panel__edit-colors">
              <button
                v-for="color in PLAYER_COLORS"
                :key="color"
                type="button"
                class="players-panel__edit-color"
                :class="{
                  'players-panel__edit-color--active': editColor === color,
                  'players-panel__edit-color--disabled': !isColorAvailable(color),
                }"
                :style="{ backgroundColor: color }"
                :disabled="!isColorAvailable(color)"
                @click="selectColor(color)"
              />
            </div>
          </div>
        </template>

        <!-- Normal view -->
        <template v-else>
          <span class="players-panel__color" :style="{ backgroundColor: player.color }"></span>
          <span class="players-panel__name">
            {{ player.name }}
            <span v-if="player.id === currentPlayerId" class="players-panel__you">(you)</span>
          </span>

          <!-- Role badges -->
          <span v-if="player.role === 'creator'" class="players-panel__badge players-panel__badge--creator" title="Table Creator">
            <Crown :size="12" />
          </span>
          <span v-else-if="player.role === 'moderator'" class="players-panel__badge players-panel__badge--moderator" title="Moderator">
            <Shield :size="12" />
          </span>
          <span v-else-if="player.role === 'spectator'" class="players-panel__badge players-panel__badge--spectator" title="Spectator">
            <Eye :size="12" />
          </span>

          <!-- Hand count (not for spectators) -->
          <span v-if="player.role !== 'spectator'" class="players-panel__hand" :title="`${getHandCount(player)} cards in hand`">
            <Hand :size="14" />
            <span>{{ getHandCount(player) }}</span>
          </span>

          <!-- Edit button for current player -->
          <button
            v-if="player.id === currentPlayerId"
            class="players-panel__action players-panel__action--edit"
            title="Edit profile"
            @click.stop="startEditing"
          >
            <Pencil :size="14" />
          </button>

          <!-- Moderation actions -->
          <div v-if="canModerate(player)" class="players-panel__actions">
            <!-- Promote to moderator -->
            <button
              v-if="canPromote(player)"
              class="players-panel__action players-panel__action--promote"
              title="Promote to moderator"
              @click.stop="handlePromote(player.id)"
            >
              <ChevronUp :size="14" />
            </button>
            <!-- Demote from moderator -->
            <button
              v-if="canDemote(player)"
              class="players-panel__action players-panel__action--demote"
              title="Demote from moderator"
              @click.stop="handleDemote(player.id)"
            >
              <ChevronDown :size="14" />
            </button>
            <!-- Kick player -->
            <button
              v-if="canKick(player)"
              class="players-panel__action players-panel__action--kick"
              title="Kick player"
              @click.stop="handleKick(player.id)"
            >
              <LogOut :size="14" />
            </button>
            <!-- Ban player (creator only) -->
            <button
              v-if="canBan(player)"
              class="players-panel__action players-panel__action--ban"
              title="Ban player"
              @click.stop="handleBanClick(player.id)"
            >
              <Ban :size="14" />
            </button>
          </div>
        </template>
      </li>
    </ul>

    <!-- Ban confirmation dialog -->
    <div v-if="confirmBanPlayerId" class="players-panel__confirm">
      <p>Ban this player? They won't be able to rejoin.</p>
      <div class="players-panel__confirm-actions">
        <button class="players-panel__confirm-btn players-panel__confirm-btn--cancel" @click="cancelBan">
          Cancel
        </button>
        <button class="players-panel__confirm-btn players-panel__confirm-btn--confirm" @click="confirmBan">
          Ban
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.players-panel {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background: rgba(30, 30, 40, 0.95);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  min-width: 200px;
  max-width: 280px;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  z-index: 1000;
  overflow: hidden;
}

.players-panel__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
}

.players-panel__list {
  list-style: none;
  margin: 0;
  padding: 0.5rem 0;
}

.players-panel__player {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 1rem;
  transition: background 0.15s;
}

.players-panel__player:hover {
  background: rgba(255, 255, 255, 0.05);
}

.players-panel__player--current {
  background: rgba(255, 255, 255, 0.03);
}

.players-panel__player--disconnected {
  opacity: 0.5;
}

.players-panel__color {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 6px currentColor;
}

.players-panel__name {
  flex: 1;
  font-size: 0.875rem;
  color: #e0e0e8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.players-panel__you {
  color: #a0a0b0;
  font-size: 0.75rem;
  margin-left: 0.25rem;
}

.players-panel__hand {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: #a0a0b0;
  font-size: 0.8125rem;
  padding: 0.125rem 0.375rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.players-panel__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.125rem;
  border-radius: 4px;
}

.players-panel__badge--creator {
  color: #fbbf24;
}

.players-panel__badge--moderator {
  color: #a78bfa;
}

.players-panel__badge--spectator {
  color: #60a5fa;
}

.players-panel__actions {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.15s;
}

.players-panel__player:hover .players-panel__actions {
  opacity: 1;
}

.players-panel__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #a0a0b0;
  cursor: pointer;
  transition: all 0.15s;
}

.players-panel__action:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.players-panel__action--promote:hover {
  background: rgba(167, 139, 250, 0.2);
  color: #a78bfa;
}

.players-panel__action--demote:hover {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.players-panel__action--kick:hover {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.players-panel__action--ban:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.players-panel__confirm {
  padding: 0.75rem 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(239, 68, 68, 0.1);
}

.players-panel__confirm p {
  margin: 0 0 0.5rem 0;
  font-size: 0.8125rem;
  color: #e0e0e8;
}

.players-panel__confirm-actions {
  display: flex;
  gap: 0.5rem;
}

.players-panel__confirm-btn {
  flex: 1;
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 4px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.players-panel__confirm-btn--cancel {
  background: rgba(255, 255, 255, 0.1);
  color: #a0a0b0;
}

.players-panel__confirm-btn--cancel:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.players-panel__confirm-btn--confirm {
  background: #ef4444;
  color: #fff;
}

.players-panel__confirm-btn--confirm:hover {
  background: #dc2626;
}

/* Edit mode styles */
.players-panel__edit {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.players-panel__edit-row {
  display: flex;
  gap: 0.375rem;
  align-items: center;
}

.players-panel__edit-input {
  flex: 1;
  padding: 0.375rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #fff;
  font-size: 0.8125rem;
  outline: none;
}

.players-panel__edit-input:focus {
  border-color: #e94560;
}

.players-panel__edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.players-panel__edit-btn--save {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.players-panel__edit-btn--save:hover {
  background: rgba(34, 197, 94, 0.3);
}

.players-panel__edit-btn--cancel {
  background: rgba(255, 255, 255, 0.1);
  color: #a0a0b0;
}

.players-panel__edit-btn--cancel:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.players-panel__edit-colors {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.players-panel__edit-color {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}

.players-panel__edit-color:hover:not(:disabled) {
  transform: scale(1.15);
}

.players-panel__edit-color--active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
}

.players-panel__edit-color--disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.players-panel__action--edit {
  opacity: 0;
  transition: opacity 0.15s;
}

.players-panel__player--current:hover .players-panel__action--edit {
  opacity: 1;
}
</style>
