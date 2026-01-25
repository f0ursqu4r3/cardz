/**
 * Sanitization utilities for preventing XSS attacks
 *
 * These functions escape HTML special characters to prevent script injection
 * when user-provided content is displayed in the browser.
 */

/**
 * HTML entities to escape
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
}

/**
 * Regular expression for matching characters to escape
 */
const HTML_ESCAPE_REGEX = /[&<>"'`/]/g

/**
 * Escape HTML special characters in a string
 * This prevents XSS attacks when the string is displayed in HTML
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') {
    return ''
  }
  return str.replace(HTML_ESCAPE_REGEX, (char) => HTML_ENTITIES[char] || char)
}

/**
 * Sanitize a zone label
 * - Escapes HTML characters
 * - Trims whitespace
 * - Limits length to prevent abuse
 */
export function sanitizeZoneLabel(label: string, maxLength: number = 50): string {
  if (typeof label !== 'string') {
    return ''
  }

  // Trim and limit length first (before escaping, to get accurate character count)
  let sanitized = label.trim()
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength)
  }

  // Escape HTML characters
  return escapeHtml(sanitized)
}

/**
 * Sanitize a chat message
 * - Escapes HTML characters
 * - Trims whitespace
 * - Limits length to prevent abuse
 * - Preserves intentional whitespace within the message
 */
export function sanitizeChatMessage(message: string, maxLength: number = 1000): string {
  if (typeof message !== 'string') {
    return ''
  }

  // Trim leading/trailing whitespace but preserve internal whitespace
  let sanitized = message.trim()
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength)
  }

  // Escape HTML characters
  return escapeHtml(sanitized)
}

/**
 * Sanitize a player name
 * - Escapes HTML characters
 * - Trims whitespace
 * - Limits length
 */
export function sanitizePlayerName(name: string, maxLength: number = 30): string {
  if (typeof name !== 'string') {
    return ''
  }

  let sanitized = name.trim()
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength)
  }

  return escapeHtml(sanitized)
}

/**
 * Sanitize a table name
 * - Escapes HTML characters
 * - Trims whitespace
 * - Limits length
 */
export function sanitizeTableName(name: string, maxLength: number = 50): string {
  if (typeof name !== 'string') {
    return ''
  }

  let sanitized = name.trim()
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength)
  }

  return escapeHtml(sanitized)
}
