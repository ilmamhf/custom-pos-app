import { describe, it, expect } from 'vitest'
import {
  formatIdr,
  parseIdr,
  formatBps,
  parseBps,
  formatDate,
  formatDateTime,
} from './formatters'

describe('Integer Currency & Basis Points Formatters', () => {
  describe('formatIdr', () => {
    it('formats positive integers with dot thousands separator', () => {
      expect(formatIdr(18000)).toBe('Rp 18.000')
      expect(formatIdr(500000)).toBe('Rp 500.000')
      expect(formatIdr(1250000)).toBe('Rp 1.250.000')
    })

    it('formats zero correctly', () => {
      expect(formatIdr(0)).toBe('Rp 0')
    })

    it('formats negative integers correctly', () => {
      expect(formatIdr(-5000)).toBe('-Rp 5.000')
      expect(formatIdr(-18000)).toBe('-Rp 18.000')
    })

    it('handles rounding floating numbers to integer', () => {
      expect(formatIdr(18000.4)).toBe('Rp 18.000')
      expect(formatIdr(18000.7)).toBe('Rp 18.001')
    })

    it('handles NaN or non-finite values safely', () => {
      expect(formatIdr(NaN)).toBe('Rp 0')
      expect(formatIdr(Infinity)).toBe('Rp 0')
    })
  })

  describe('parseIdr', () => {
    it('parses formatted IDR string to integer', () => {
      expect(parseIdr('Rp 18.000')).toBe(18000)
      expect(parseIdr('Rp 1.250.000')).toBe(1250000)
      expect(parseIdr('18.000')).toBe(18000)
      expect(parseIdr('18000')).toBe(18000)
    })

    it('parses negative IDR strings', () => {
      expect(parseIdr('-Rp 5.000')).toBe(-5000)
      expect(parseIdr('-5000')).toBe(-5000)
    })

    it('handles numbers directly', () => {
      expect(parseIdr(18000)).toBe(18000)
      expect(parseIdr(18000.2)).toBe(18000)
    })

    it('returns 0 for empty or invalid strings', () => {
      expect(parseIdr('')).toBe(0)
      expect(parseIdr('abc')).toBe(0)
    })
  })

  describe('formatBps', () => {
    it('formats basis points to percentage string', () => {
      expect(formatBps(1100)).toBe('11%')
      expect(formatBps(1150)).toBe('11.5%')
      expect(formatBps(1125)).toBe('11.25%')
      expect(formatBps(0)).toBe('0%')
      expect(formatBps(10000)).toBe('100%')
    })

    it('handles NaN/invalid', () => {
      expect(formatBps(NaN)).toBe('0%')
    })
  })

  describe('parseBps', () => {
    it('parses percentage string to basis points', () => {
      expect(parseBps('11%')).toBe(1100)
      expect(parseBps('11')).toBe(1100)
      expect(parseBps('11.5%')).toBe(1150)
      expect(parseBps('11.25')).toBe(1125)
      expect(parseBps('0%')).toBe(0)
    })

    it('handles numbers directly', () => {
      expect(parseBps(11)).toBe(1100)
      expect(parseBps(11.5)).toBe(1150)
    })

    it('returns 0 for invalid inputs', () => {
      expect(parseBps('')).toBe(0)
      expect(parseBps('invalid')).toBe(0)
    })
  })

  describe('Date helpers', () => {
    it('formats ISO dates correctly', () => {
      const iso = '2026-11-21T10:00:00.000Z'
      const formatted = formatDate(iso)
      expect(formatted).toBeDefined()
      expect(formatted).not.toBe('-')

      const formattedTime = formatDateTime(iso)
      expect(formattedTime).toBeDefined()
      expect(formattedTime).not.toBe('-')
    })

    it('handles null or invalid dates safely', () => {
      expect(formatDate(null)).toBe('-')
      expect(formatDate('invalid-date')).toBe('-')
      expect(formatDateTime(undefined)).toBe('-')
    })
  })
})
