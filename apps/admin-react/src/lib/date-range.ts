/**
 * Date-range helpers for the sales filter.
 *
 * The operator picks calendar days; the API filters on an instant. The
 * conversion lives here so the boundary is the operator's local day and not
 * UTC midnight: a branch in WIB that picks "24 Nov" means 00:00 through
 * 23:59:59.999 local time. Sending the bare `2026-11-24` to the API would
 * cover only the first instant of that day and quietly hide the rest of it.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export interface ApiDateRange {
  from?: string
  to?: string
}

export type ApiDateRangeError = 'invalid' | 'reversed'

export interface ApiDateRangeResult {
  bounds: ApiDateRange
  /** Set when the picked range cannot be turned into a query. */
  error?: ApiDateRangeError
}

/**
 * Parses a `YYYY-MM-DD` value into a local midnight date.
 *
 * Returns null for anything that is not a real calendar date. `new Date()`
 * alone is not enough: it parses `2026-11-24` as UTC midnight and rolls
 * `2026-02-31` over into March without complaining.
 */
export function parseLocalDate(value: string): Date | null {
  const match = DATE_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return date
}

/**
 * Turns the picked calendar days into the inclusive bounds the API expects.
 *
 * Both bounds are inclusive, so a range that covers one whole day returns
 * the sales of that day and not only the ones before midnight.
 */
export function toApiDateRange(from: string, to: string): ApiDateRangeResult {
  const bounds: ApiDateRange = {}

  if (from) {
    const start = parseLocalDate(from)
    if (!start) return { bounds: {}, error: 'invalid' }
    start.setHours(0, 0, 0, 0)
    bounds.from = start.toISOString()
  }

  if (to) {
    const end = parseLocalDate(to)
    if (!end) return { bounds: {}, error: 'invalid' }
    end.setHours(23, 59, 59, 999)
    bounds.to = end.toISOString()
  }

  if (bounds.from && bounds.to && new Date(bounds.from) > new Date(bounds.to)) {
    return { bounds: {}, error: 'reversed' }
  }

  return { bounds }
}
