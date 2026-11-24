import { describe, it, expect } from 'vitest'
import { parseLocalDate, toApiDateRange } from './date-range'

describe('date range bounds', () => {
  it('parses a calendar date as local midnight, not UTC midnight', () => {
    const parsed = parseLocalDate('2026-11-24')

    expect(parsed).not.toBeNull()
    expect(parsed!.getFullYear()).toBe(2026)
    expect(parsed!.getMonth()).toBe(10)
    expect(parsed!.getDate()).toBe(24)
    expect(parsed!.getHours()).toBe(0)
  })

  it('rejects a date that does not exist instead of rolling it over', () => {
    // `new Date(2026, 1, 31)` silently becomes 3 March.
    expect(parseLocalDate('2026-02-31')).toBeNull()
  })

  it('rejects a malformed value', () => {
    expect(parseLocalDate('24/11/2026')).toBeNull()
    expect(parseLocalDate('')).toBeNull()
  })

  it('turns the picked days into inclusive local-day bounds', () => {
    const { bounds, error } = toApiDateRange('2026-11-24', '2026-11-24')

    expect(error).toBeUndefined()
    expect(bounds.from).toBeDefined()
    expect(bounds.to).toBeDefined()

    const from = new Date(bounds.from!)
    const to = new Date(bounds.to!)

    expect(from.getHours()).toBe(0)
    expect(from.getMinutes()).toBe(0)
    expect(from.getSeconds()).toBe(0)
    expect(from.getMilliseconds()).toBe(0)

    expect(to.getHours()).toBe(23)
    expect(to.getMinutes()).toBe(59)
    expect(to.getSeconds()).toBe(59)
    expect(to.getMilliseconds()).toBe(999)

    // The whole picked day is inside the range.
    expect(from.getTime()).toBeLessThanOrEqual(new Date(2026, 10, 24, 12).getTime())
    expect(to.getTime()).toBeGreaterThanOrEqual(new Date(2026, 10, 24, 12).getTime())
  })

  it('leaves an open bound out when only one side is picked', () => {
    const { bounds, error } = toApiDateRange('2026-11-24', '')

    expect(error).toBeUndefined()
    expect(bounds.from).toBeDefined()
    expect(bounds.to).toBeUndefined()
  })

  it('returns no bounds at all when nothing is picked', () => {
    const { bounds, error } = toApiDateRange('', '')

    expect(error).toBeUndefined()
    expect(bounds.from).toBeUndefined()
    expect(bounds.to).toBeUndefined()
  })

  it('reports a reversed range instead of querying a range that cannot match', () => {
    const { bounds, error } = toApiDateRange('2026-11-25', '2026-11-24')

    expect(error).toBe('reversed')
    expect(bounds.from).toBeUndefined()
    expect(bounds.to).toBeUndefined()
  })

  it('reports an invalid date instead of sending it to the API', () => {
    expect(toApiDateRange('2026-02-31', '').error).toBe('invalid')
    expect(toApiDateRange('', '2026-13-01').error).toBe('invalid')
  })
})
