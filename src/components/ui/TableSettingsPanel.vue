<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Settings,
  RotateCcw,
  CornerUpLeft,
  CornerUpRight,
  Zap,
  Sparkles,
  Globe,
  Lock,
  KeyRound,
  Users,
  EyeClosed,
  Shield,
  UserCog,
  Palette,
  ChevronDown,
  X,
  Pencil,
  Check,
} from 'lucide-vue-next'
import type {
  TableSettings,
  TableBackground,
  TableJoinPolicy,
  TablePermissionsPreset,
} from '../../../shared/types'

const props = defineProps<{
  settings: TableSettings
  isPublic: boolean
  tableName: string
  snapshots: { id: number; name: string; createdAt: number; createdBy: string }[]
  lastAutosaveAt: number | null
  canManageSnapshots: boolean
  canUndoRedo: boolean
  canManageAccess?: boolean
  inviteLink?: string | null
  inviteToken?: string | null
  performanceSettings: {
    lowLatencyDrag: boolean
    reduceEffects: boolean
  }
}>()

const emit = defineEmits<{
  'update:settings': [settings: Partial<TableSettings>]
  'update:visibility': [isPublic: boolean]
  'update:name': [name: string]
  reset: []
  'snapshot:create': [name?: string]
  'snapshot:restore': [snapshotId: number]
  undo: []
  redo: []
  'update:performance': [settings: { lowLatencyDrag?: boolean; reduceEffects?: boolean }]
  'invite:regenerate': []
  close: []
}>()

const showBackgroundPicker = ref(false)
const isEditingName = ref(false)
const editedName = ref('')
const inviteCopied = ref(false)

// Sync editedName when props change or when starting to edit
watch(
  () => props.tableName,
  (newName) => {
    if (!isEditingName.value) {
      editedName.value = newName
    }
  },
  { immediate: true },
)

const startEditingName = () => {
  editedName.value = props.tableName || ''
  isEditingName.value = true
}

const saveName = () => {
  const trimmedName = editedName.value.trim()
  if (trimmedName && trimmedName !== props.tableName) {
    emit('update:name', trimmedName)
  }
  isEditingName.value = false
}

const cancelEditingName = () => {
  editedName.value = props.tableName
  isEditingName.value = false
}

const handleNameKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    saveName()
  } else if (event.key === 'Escape') {
    cancelEditingName()
  }
}

const backgrounds: { id: TableBackground; name: string; preview: string }[] = [
  {
    id: 'green-felt',
    name: 'Green Felt',
    preview: 'linear-gradient(180deg, #1f7a3a 0%, #0f4f27 100%)',
  },
  {
    id: 'blue-felt',
    name: 'Blue Felt',
    preview: 'linear-gradient(180deg, #1a5a8a 0%, #0f3a5a 100%)',
  },
  {
    id: 'red-felt',
    name: 'Red Felt',
    preview: 'linear-gradient(180deg, #8a1a1a 0%, #5a0f0f 100%)',
  },
  {
    id: 'wood-oak',
    name: 'Oak Wood',
    preview: 'linear-gradient(180deg, #8b6b4e 0%, #5c4033 100%)',
  },
  {
    id: 'wood-dark',
    name: 'Dark Wood',
    preview: 'linear-gradient(180deg, #3d2817 0%, #1a0f0a 100%)',
  },
  { id: 'slate', name: 'Slate', preview: 'linear-gradient(180deg, #4a5568 0%, #2d3748 100%)' },
]

const currentBackground = computed(() => {
  return backgrounds.find((b) => b.id === props.settings.background) ?? backgrounds[0]
})

const canManageAccess = computed(() => props.canManageAccess ?? false)

const selectBackground = (bg: TableBackground) => {
  emit('update:settings', { background: bg })
  showBackgroundPicker.value = false
}

const toggleVisibility = () => {
  emit('update:visibility', !props.isPublic)
}

const updateJoinPolicy = (policy: TableJoinPolicy) => {
  emit('update:settings', { joinPolicy: policy })
}

const updatePermissionsPreset = (preset: TablePermissionsPreset) => {
  emit('update:settings', { permissionsPreset: preset })
}

const copyInviteLink = async () => {
  if (!props.inviteLink) return
  try {
    await navigator.clipboard.writeText(props.inviteLink)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = props.inviteLink
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    try {
      document.execCommand('copy')
    } finally {
      document.body.removeChild(textarea)
    }
  }
  inviteCopied.value = true
  window.setTimeout(() => {
    inviteCopied.value = false
  }, 1500)
}

const confirmReset = () => {
  if (
    confirm('Are you sure you want to reset the table? All cards will be returned to the deck.')
  ) {
    emit('reset')
  }
}

const createSnapshot = () => {
  const name = prompt('Snapshot name (optional):')?.trim()
  emit('snapshot:create', name || undefined)
}

const restoreSnapshot = (snapshotId: number, snapshotName: string) => {
  if (confirm(`Restore snapshot "${snapshotName}"? This will overwrite the current table state.`)) {
    emit('snapshot:restore', snapshotId)
  }
}

const formatAutosave = (timestamp: number | null): string => {
  if (!timestamp) return 'Not saved yet'
  const diffMs = Date.now() - timestamp
  if (diffMs < 10_000) return 'Just now'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  return `${diffHr}h ago`
}
</script>

<template>
  <div class="settings-panel">
    <div class="settings-header">
      <div class="settings-title">
        <Settings :size="18" />
        <span>Table Settings</span>
      </div>
      <button class="settings-close" @click="$emit('close')">
        <X :size="16" />
      </button>
    </div>

    <div class="settings-content">
      <!-- Table Name (editable) -->
      <div class="settings-row settings-row--name">
        <span class="settings-label">Table Name</span>
        <div v-if="isEditingName" class="settings-name-edit">
          <input
            v-model="editedName"
            type="text"
            class="settings-name-input"
            maxlength="50"
            @keydown="handleNameKeydown"
            @blur="saveName"
            ref="nameInputRef"
            autofocus
          />
          <button class="settings-name-save" @click="saveName" title="Save">
            <Check :size="14" />
          </button>
        </div>
        <div v-else class="settings-name-display" @click="startEditingName">
          <span class="settings-value">{{ tableName || 'Unnamed Table' }}</span>
          <button class="settings-name-edit-btn" title="Edit name">
            <Pencil :size="12" />
          </button>
        </div>
      </div>

      <!-- Visibility Toggle -->
      <div class="settings-row settings-row--action" @click="toggleVisibility">
        <div class="settings-label-group">
          <component :is="isPublic ? Globe : Lock" :size="16" />
          <span class="settings-label">Visibility</span>
        </div>
        <div class="settings-toggle" :class="{ 'settings-toggle--active': isPublic }">
          <span class="settings-toggle-label">{{ isPublic ? 'Public' : 'Private' }}</span>
          <div class="settings-toggle-switch">
            <div class="settings-toggle-knob" />
          </div>
        </div>
      </div>

      <!-- Access Controls -->
      <div class="settings-section">
        <div class="settings-section-title">
          <Lock :size="14" />
          <span>Table Access</span>
        </div>
        <div class="settings-options">
          <button
            class="settings-option"
            :class="{
              'settings-option--active': settings.joinPolicy === 'open',
              'settings-option--disabled': !canManageAccess,
            }"
            :disabled="!canManageAccess"
            @click="updateJoinPolicy('open')"
          >
            <Users :size="14" />
            Open
          </button>
          <button
            class="settings-option"
            :class="{
              'settings-option--active': settings.joinPolicy === 'spectators-only',
              'settings-option--disabled': !canManageAccess,
            }"
            :disabled="!canManageAccess"
            @click="updateJoinPolicy('spectators-only')"
          >
            <EyeClosed :size="14" />
            Spectators
          </button>
          <button
            class="settings-option"
            :class="{
              'settings-option--active': settings.joinPolicy === 'invite-only',
              'settings-option--disabled': !canManageAccess,
            }"
            :disabled="!canManageAccess"
            @click="updateJoinPolicy('invite-only')"
          >
            <KeyRound :size="14" />
            Invite-only
          </button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">
          <UserCog :size="14" />
          <span>Permissions</span>
        </div>
        <div class="settings-options">
          <button
            class="settings-option"
            :class="{
              'settings-option--active': settings.permissionsPreset === 'standard',
              'settings-option--disabled': !canManageAccess,
            }"
            :disabled="!canManageAccess"
            @click="updatePermissionsPreset('standard')"
          >
            <Users :size="14" />
            Everyone
          </button>
          <button
            class="settings-option"
            :class="{
              'settings-option--active': settings.permissionsPreset === 'host-only',
              'settings-option--disabled': !canManageAccess,
            }"
            :disabled="!canManageAccess"
            @click="updatePermissionsPreset('host-only')"
          >
            <Shield :size="14" />
            Hosts only
          </button>
        </div>
      </div>

      <div v-if="settings.joinPolicy === 'invite-only'" class="settings-invite">
        <div class="settings-invite-row">
          <span class="settings-label">Invite link</span>
          <button class="settings-invite-copy" @click="copyInviteLink" :disabled="!inviteLink">
            {{ inviteCopied ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <div class="settings-invite-link">
          <span class="settings-invite-text">
            {{
              inviteLink ||
              (canManageAccess ? 'Generating link...' : 'Invite link available to the table creator.')
            }}
          </span>
        </div>
        <div class="settings-invite-row settings-invite-row--actions">
          <button
            class="settings-invite-regenerate"
            :disabled="!canManageAccess"
            @click="$emit('invite:regenerate')"
          >
            Regenerate
          </button>
          <span v-if="inviteToken" class="settings-invite-token">Token: {{ inviteToken }}</span>
        </div>
      </div>

      <!-- Background Selection -->
      <div class="settings-row">
        <div class="settings-label-group">
          <Palette :size="16" />
          <span class="settings-label">Background</span>
        </div>
        <button class="settings-dropdown" @click="showBackgroundPicker = !showBackgroundPicker">
          <div
            class="settings-bg-preview"
            :style="{ background: currentBackground?.preview ?? '' }"
          />
          <span>{{ currentBackground?.name ?? 'Select' }}</span>
          <ChevronDown :size="14" :class="{ rotated: showBackgroundPicker }" />
        </button>
      </div>

      <!-- Background Picker Dropdown -->
      <div v-if="showBackgroundPicker" class="settings-bg-picker">
        <button
          v-for="bg in backgrounds"
          :key="bg.id"
          class="settings-bg-option"
          :class="{ 'settings-bg-option--selected': bg.id === settings.background }"
          @click="selectBackground(bg.id)"
        >
          <div class="settings-bg-preview" :style="{ background: bg.preview }" />
          <span>{{ bg.name }}</span>
        </button>
      </div>

      <!-- Autosave -->
      <div class="settings-row">
        <div class="settings-label-group">
          <RotateCcw :size="16" />
          <span class="settings-label">Autosave</span>
        </div>
        <span class="settings-value">{{ formatAutosave(lastAutosaveAt) }}</span>
      </div>

      <!-- History -->
      <div class="settings-row settings-row--history">
        <div class="settings-label-group">
          <CornerUpLeft :size="16" />
          <span class="settings-label">History</span>
        </div>
        <div class="settings-history-actions">
          <button class="settings-history-btn" :disabled="!canUndoRedo" @click="$emit('undo')">
            <CornerUpLeft :size="14" />
            <span>Undo</span>
          </button>
          <button class="settings-history-btn" :disabled="!canUndoRedo" @click="$emit('redo')">
            <CornerUpRight :size="14" />
            <span>Redo</span>
          </button>
        </div>
      </div>

      <!-- Performance -->
      <div class="settings-row settings-row--performance">
        <div class="settings-label-group">
          <Zap :size="16" />
          <span class="settings-label">Low-latency drag</span>
        </div>
        <button
          class="settings-toggle-btn"
          :class="{ 'settings-toggle-btn--active': performanceSettings.lowLatencyDrag }"
          @click="
            emit('update:performance', { lowLatencyDrag: !performanceSettings.lowLatencyDrag })
          "
        >
          {{ performanceSettings.lowLatencyDrag ? 'On' : 'Off' }}
        </button>
      </div>
      <div class="settings-row settings-row--performance">
        <div class="settings-label-group">
          <Sparkles :size="16" />
          <span class="settings-label">Reduce effects</span>
        </div>
        <button
          class="settings-toggle-btn"
          :class="{ 'settings-toggle-btn--active': performanceSettings.reduceEffects }"
          @click="emit('update:performance', { reduceEffects: !performanceSettings.reduceEffects })"
        >
          {{ performanceSettings.reduceEffects ? 'On' : 'Off' }}
        </button>
      </div>

      <!-- Snapshots -->
      <div class="settings-divider" />

      <div class="settings-row settings-row--snapshots">
        <span class="settings-label">Snapshots</span>
        <button
          class="settings-snapshot-save"
          :disabled="!canManageSnapshots"
          @click="createSnapshot"
        >
          Save Snapshot
        </button>
      </div>
      <div class="settings-snapshots-list">
        <div v-if="snapshots.length === 0" class="settings-snapshot-empty">No snapshots yet</div>
        <div v-for="snapshot in snapshots" :key="snapshot.id" class="settings-snapshot-item">
          <div class="settings-snapshot-info">
            <span class="settings-snapshot-name">{{ snapshot.name }}</span>
            <span class="settings-snapshot-meta">
              {{ new Date(snapshot.createdAt).toLocaleString() }} • {{ snapshot.createdBy }}
            </span>
          </div>
          <button
            class="settings-snapshot-restore"
            :disabled="!canManageSnapshots"
            @click="restoreSnapshot(snapshot.id, snapshot.name)"
          >
            Restore
          </button>
        </div>
      </div>

      <!-- Reset Table -->
      <div class="settings-divider" />

      <button class="settings-reset" @click="confirmReset">
        <RotateCcw :size="16" />
        <span>Reset Table</span>
      </button>
      <p class="settings-reset-hint">Returns all cards to the deck in original order</p>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  position: absolute;
  top: 50px;
  right: 0;
  width: 280px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  overflow: hidden;
  backdrop-filter: blur(12px);
  z-index: 1100;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.settings-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.settings-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.settings-content {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
}

.settings-row--action {
  cursor: pointer;
  padding: 6px 8px;
  margin: -6px -8px;
  border-radius: 6px;
  transition: background 0.15s;
}

.settings-row--action:hover {
  background: rgba(255, 255, 255, 0.08);
}

.settings-label-group {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #a0a0b0;
}

.settings-label {
  font-size: 13px;
  color: #a0a0b0;
}

.settings-value {
  font-size: 13px;
  color: #fff;
}

.settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-toggle-label {
  font-size: 12px;
  color: #888;
  transition: color 0.15s;
}

.settings-toggle--active .settings-toggle-label {
  color: #4ade80;
}

.settings-toggle-switch {
  width: 36px;
  height: 20px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 2px;
  transition: background 0.2s;
}

.settings-toggle--active .settings-toggle-switch {
  background: #22c55e;
}

.settings-toggle-knob {
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.settings-toggle--active .settings-toggle-knob {
  transform: translateX(16px);
}

.settings-dropdown {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-dropdown:hover {
  background: rgba(255, 255, 255, 0.12);
}

.settings-dropdown svg {
  color: #888;
  transition: transform 0.2s;
}

.settings-dropdown svg.rotated {
  transform: rotate(180deg);
}

.settings-bg-preview {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.settings-bg-picker {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 0;
}

.settings-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #b6b6c5;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.settings-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.settings-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: #d0d0dd;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-option:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.settings-option--active {
  border-color: rgba(34, 197, 94, 0.6);
  background: rgba(34, 197, 94, 0.15);
  color: #fff;
}

.settings-option--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-invite {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.settings-invite-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.settings-invite-link {
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.4);
  font-size: 11px;
  color: #d6d6e2;
  word-break: break-all;
}

.settings-invite-copy {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-invite-copy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-invite-copy:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
}

.settings-invite-row--actions {
  justify-content: flex-start;
  gap: 10px;
}

.settings-invite-regenerate {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-invite-regenerate:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-invite-regenerate:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
  color: #fff;
}

.settings-invite-token {
  font-size: 11px;
  color: #9ca3af;
  font-family: 'Monaco', 'Menlo', monospace;
}

.settings-bg-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #a0a0b0;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-bg-option:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.settings-bg-option--selected {
  background: rgba(233, 69, 96, 0.2);
  border-color: #e94560;
  color: #fff;
}

.settings-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 0;
}

.settings-reset {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #ef4444;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-reset:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
}

.settings-reset-hint {
  font-size: 11px;
  color: #666;
  text-align: center;
  margin: 0;
}

.settings-row--history {
  align-items: center;
}

.settings-history-actions {
  display: flex;
  gap: 6px;
}

.settings-history-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-history-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-history-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

.settings-row--performance {
  align-items: center;
}

.settings-toggle-btn {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.settings-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.settings-toggle-btn--active {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.5);
  color: #22c55e;
}

.settings-row--snapshots {
  align-items: center;
}

.settings-snapshot-save {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-snapshot-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-snapshot-save:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

.settings-snapshots-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-snapshot-empty {
  font-size: 12px;
  color: #888;
}

.settings-snapshot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.settings-snapshot-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.settings-snapshot-name {
  font-size: 12px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.settings-snapshot-meta {
  font-size: 10px;
  color: #888;
}

.settings-snapshot-restore {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-snapshot-restore:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-snapshot-restore:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

/* Name editing styles */
.settings-row--name {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.settings-name-display {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  transition: background 0.15s;
}

.settings-name-display:hover {
  background: rgba(255, 255, 255, 0.1);
}

.settings-name-display .settings-value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-name-edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}

.settings-name-edit-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.settings-name-edit {
  display: flex;
  gap: 6px;
}

.settings-name-input {
  flex: 1;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.settings-name-input:focus {
  border-color: #e94560;
}

.settings-name-save {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  background: #e94560;
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
}

.settings-name-save:hover {
  background: #d13a54;
}
</style>
