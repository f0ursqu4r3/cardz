import { describe, test, expect } from 'bun:test'
import {
  escapeHtml,
  sanitizeZoneLabel,
  sanitizeChatMessage,
  sanitizePlayerName,
  sanitizeTableName,
} from '../utils/sanitize'

describe('escapeHtml', () => {
  test('escapes ampersand', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })

  test('escapes less than', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b')
  })

  test('escapes greater than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b')
  })

  test('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;')
  })

  test('escapes single quotes', () => {
    expect(escapeHtml("it's fine")).toBe('it&#x27;s fine')
  })

  test('escapes forward slash', () => {
    expect(escapeHtml('path/to/file')).toBe('path&#x2F;to&#x2F;file')
  })

  test('escapes backtick', () => {
    expect(escapeHtml('code `here`')).toBe('code &#x60;here&#x60;')
  })

  test('escapes script tags', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;',
    )
  })

  test('handles empty string', () => {
    expect(escapeHtml('')).toBe('')
  })

  test('handles non-string input', () => {
    expect(escapeHtml(null as unknown as string)).toBe('')
    expect(escapeHtml(undefined as unknown as string)).toBe('')
    expect(escapeHtml(123 as unknown as string)).toBe('')
  })

  test('preserves safe characters', () => {
    expect(escapeHtml('Hello World 123!')).toBe('Hello World 123!')
  })
})

describe('sanitizeZoneLabel', () => {
  test('escapes HTML in labels', () => {
    expect(sanitizeZoneLabel('<b>Bold</b>')).toBe('&lt;b&gt;Bold&lt;&#x2F;b&gt;')
  })

  test('trims whitespace', () => {
    expect(sanitizeZoneLabel('  Zone Name  ')).toBe('Zone Name')
  })

  test('limits length to default max', () => {
    const longLabel = 'A'.repeat(100)
    const result = sanitizeZoneLabel(longLabel)
    expect(result.length).toBe(50)
  })

  test('limits length to custom max', () => {
    const label = 'A'.repeat(50)
    const result = sanitizeZoneLabel(label, 20)
    expect(result.length).toBe(20)
  })

  test('handles non-string input', () => {
    expect(sanitizeZoneLabel(null as unknown as string)).toBe('')
  })
})

describe('sanitizeChatMessage', () => {
  test('escapes HTML in messages', () => {
    expect(sanitizeChatMessage('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    )
  })

  test('trims leading/trailing whitespace', () => {
    expect(sanitizeChatMessage('  Hello  ')).toBe('Hello')
  })

  test('preserves internal whitespace', () => {
    expect(sanitizeChatMessage('Hello   World')).toBe('Hello   World')
  })

  test('limits length to default max (1000)', () => {
    const longMessage = 'A'.repeat(1500)
    const result = sanitizeChatMessage(longMessage)
    expect(result.length).toBe(1000)
  })

  test('limits length to custom max', () => {
    const message = 'A'.repeat(100)
    const result = sanitizeChatMessage(message, 50)
    expect(result.length).toBe(50)
  })

  test('handles non-string input', () => {
    expect(sanitizeChatMessage(undefined as unknown as string)).toBe('')
  })
})

describe('sanitizePlayerName', () => {
  test('escapes HTML in names', () => {
    expect(sanitizePlayerName('Player<script>')).toBe('Player&lt;script&gt;')
  })

  test('trims whitespace', () => {
    expect(sanitizePlayerName('  Alice  ')).toBe('Alice')
  })

  test('limits length to default max (30)', () => {
    const longName = 'A'.repeat(50)
    const result = sanitizePlayerName(longName)
    expect(result.length).toBe(30)
  })

  test('limits length to custom max', () => {
    const name = 'A'.repeat(50)
    const result = sanitizePlayerName(name, 10)
    expect(result.length).toBe(10)
  })

  test('handles non-string input', () => {
    expect(sanitizePlayerName(null as unknown as string)).toBe('')
  })
})

describe('sanitizeTableName', () => {
  test('escapes HTML in table names', () => {
    expect(sanitizeTableName('My "Table"')).toBe('My &quot;Table&quot;')
  })

  test('trims whitespace', () => {
    expect(sanitizeTableName('  Game Night  ')).toBe('Game Night')
  })

  test('limits length to default max (50)', () => {
    const longName = 'A'.repeat(100)
    const result = sanitizeTableName(longName)
    expect(result.length).toBe(50)
  })

  test('limits length to custom max', () => {
    const name = 'A'.repeat(50)
    const result = sanitizeTableName(name, 25)
    expect(result.length).toBe(25)
  })

  test('handles non-string input', () => {
    expect(sanitizeTableName(undefined as unknown as string)).toBe('')
  })
})
