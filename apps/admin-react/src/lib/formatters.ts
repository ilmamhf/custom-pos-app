/**
 * Integer-only currency & basis points formatting utilities.
 * All monetary amounts are handled as integers (smallest currency unit, IDR).
 */

/**
 * Format an integer IDR amount to display string, e.g. 18000 -> "Rp 18.000".
 * Handles negative values, e.g. -5000 -> "-Rp 5.000".
 */
export function formatIdr(amount: number): string {
  if (isNaN(amount) || !isFinite(amount)) return 'Rp 0'

  const isNegative = amount < 0
  const absAmount = Math.abs(Math.round(amount))
  const formatted = absAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  return isNegative ? `-Rp ${formatted}` : `Rp ${formatted}`
}

/**
 * Parse an IDR formatted string (or raw digits) into an integer.
 * e.g. "Rp 18.000" -> 18000, "-Rp 5.000" -> -5000, "25000" -> 25000.
 */
export function parseIdr(value: string | number): number {
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : Math.round(value)
  }

  if (!value || typeof value !== 'string') return 0

  const trimmed = value.trim()
  const isNegative = trimmed.startsWith('-') || trimmed.includes('-')
  const cleanDigits = trimmed.replace(/[^\d]/g, '')

  if (!cleanDigits) return 0

  const parsed = parseInt(cleanDigits, 10)
  return isNegative ? -parsed : parsed
}

/**
 * Strictly parse a whole-rupiah input. Unlike {@link parseIdr}, this never
 * repairs malformed input: decimal points or exponent notation return null so
 * `18.5` cannot silently become `185`.
 */
export function parseIntegerIdr(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  }

  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null

  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

/**
 * Format basis points into percentage display string.
 * e.g. 1100 -> "11%", 1150 -> "11.5%", 0 -> "0%".
 */
export function formatBps(bps: number): string {
  if (isNaN(bps) || !isFinite(bps)) return '0%'
  const percentage = bps / 100
  // Strip trailing zeros after decimal if any
  return `${parseFloat(percentage.toFixed(2))}%`
}

/**
 * Parse a percentage string or number into basis points integer.
 * e.g. "11%" -> 1100, "11" -> 1100, "11.5%" -> 1150, "11.25" -> 1125.
 */
export function parseBps(value: string | number): number {
  if (typeof value === 'number') {
    return Math.round(value * 100)
  }

  if (!value || typeof value !== 'string') return 0

  const clean = value.replace(/%/g, '').trim()
  const parsed = parseFloat(clean)

  if (isNaN(parsed)) return 0

  return Math.round(parsed * 100)
}

/**
 * Format an ISO date string to a human-readable format.
 * e.g. "2026-11-21T14:10:00Z" -> "21 Nov 2026, 14:10"
 */
export function formatDateTime(isoString?: string | null): string {
  if (!isoString) return '-'
  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date)
  } catch {
    return '-'
  }
}

/**
 * Format an ISO date string to date only.
 * e.g. "2026-11-21T14:10:00Z" -> "21 Nov 2026"
 */
export function formatDate(isoString?: string | null): string {
  if (!isoString) return '-'
  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date)
  } catch {
    return '-'
  }
}

/**
 * Format an ISO date string to time only.
 * e.g. "2026-11-21T14:10:00Z" -> "14:10"
 */
export function formatTime(isoString?: string | null): string {
  if (!isoString) return '-'
  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date)
  } catch {
    return '-'
  }
}
