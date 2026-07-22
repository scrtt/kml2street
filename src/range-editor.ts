import type { NumberRange, StreetSummary } from './types'

interface RangeBoundary {
  raw: string
  numeric: number
  suffix: string
}

function parseBoundary(raw: string): RangeBoundary | null {
  const match = raw.trim().match(/^(\d+)\s*([a-zA-Z]?)$/)
  if (!match) return null
  return { raw: `${match[1]}${match[2]}`, numeric: Number(match[1]), suffix: match[2].toLocaleLowerCase('de') }
}

function compareBoundaries(left: RangeBoundary, right: RangeBoundary): number {
  if (left.numeric !== right.numeric) return left.numeric - right.numeric
  return left.suffix.localeCompare(right.suffix, 'de')
}

function labelBoundaries(label: string): [RangeBoundary, RangeBoundary] | null {
  const normalized = normalizeRangeLabel(label)
  const range = normalized.match(/^(\d+\s*[a-zA-Z]?)\s*–\s*(\d+\s*[a-zA-Z]?)$/)
  if (range) {
    const first = parseBoundary(range[1])
    const last = parseBoundary(range[2])
    return first && last ? [first, last] : null
  }

  const single = parseBoundary(normalized)
  return single ? [single, single] : null
}

export function normalizeRangeLabel(label: string): string {
  return label.trim().replace(/\s*[-—–]\s*/g, '–')
}

export function valuesForRange(label: string, parity?: NumberRange['parity']): string[] {
  const boundaries = labelBoundaries(label)
  if (!boundaries) return [normalizeRangeLabel(label)].filter(Boolean)
  const [first, last] = boundaries

  if (first.suffix || last.suffix) {
    if (first.numeric === last.numeric && first.suffix && last.suffix) {
      const start = first.suffix.charCodeAt(0)
      const end = last.suffix.charCodeAt(0)
      if (end >= start && end - start <= 26) {
        return Array.from({ length: end - start + 1 }, (_, index) => `${first.numeric}${String.fromCharCode(start + index)}`)
      }
    }
    return first.raw === last.raw ? [first.raw] : [first.raw, last.raw]
  }

  const start = Math.min(first.numeric, last.numeric)
  const end = Math.max(first.numeric, last.numeric)
  const step = parity ? 2 : 1
  if ((end - start) / step > 10_000) return [first.raw, last.raw]
  return Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, index) => String(start + index * step))
}

export function createEditedRange(label: string, parity?: NumberRange['parity']): NumberRange {
  const normalized = normalizeRangeLabel(label)
  return {
    label: normalized,
    ...(parity ? { parity } : {}),
    values: valuesForRange(normalized, parity),
  }
}

export function mergeNumberRanges(ranges: NumberRange[]): NumberRange | null {
  if (ranges.length < 2) return null
  const boundaries = ranges.map((range) => labelBoundaries(range.label))
  if (boundaries.some((boundary) => boundary === null)) return null

  const parsed = boundaries.flatMap((boundary) => boundary ?? [])
  const first = [...parsed].sort(compareBoundaries)[0]
  const last = [...parsed].sort(compareBoundaries).at(-1)!
  const sharedParity = ranges[0].parity && ranges.every((range) => range.parity === ranges[0].parity)
    ? ranges[0].parity
    : undefined
  const label = first.raw === last.raw ? first.raw : `${first.raw}–${last.raw}`
  return createEditedRange(label, sharedParity)
}

function rangeText(range: NumberRange): string {
  return range.parity ? `${range.label} (${range.parity})` : range.label
}

export function applyEditedRanges(summary: StreetSummary, ranges: NumberRange[]): StreetSummary {
  const addressCount = new Set(ranges.flatMap((range) => range.values)).size
  return {
    ...summary,
    ranges,
    addressCount,
    manuallyEdited: true,
    text: ranges.length > 0
      ? `${summary.street} ${ranges.map(rangeText).join(', ')}`
      : `${summary.street} (keine Nummernkreise)`,
  }
}
