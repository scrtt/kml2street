import type { AddressRecord, NumberRange, StreetSummary } from './types'

interface ParsedNumber {
  raw: string
  numeric: number
  suffix: string
}

function parseNumber(raw: string): ParsedNumber | null {
  const match = raw.trim().match(/^(\d+)\s*([a-zA-Z]?)$/)
  if (!match) return null
  return { raw: raw.trim(), numeric: Number(match[1]), suffix: match[2].toLocaleLowerCase('de') }
}

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, 'de', { numeric: true, sensitivity: 'base' })
}

function streetKey(street: string): string {
  return street
    .normalize('NFKD')
    .replaceAll('ß', 'ss')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('de')
}

function makeRange(values: ParsedNumber[], parity?: 'gerade' | 'ungerade'): NumberRange {
  const first = values[0].raw
  const last = values.at(-1)?.raw ?? first
  return {
    label: first === last ? first : `${first}–${last}`,
    parity,
    values: values.map((value) => value.raw),
  }
}

function consecutiveGroups(
  values: ParsedNumber[],
  step: number,
  parity?: 'gerade' | 'ungerade',
  suffixBridges: ParsedNumber[] = [],
): NumberRange[] {
  if (values.length === 0) return []
  const groups: ParsedNumber[][] = [[values[0]]]
  const bridgeNumbers = new Set(suffixBridges.map((value) => value.numeric))

  for (const value of values.slice(1)) {
    const group = groups.at(-1)!
    const previous = group.at(-1)!
    const difference = value.numeric - previous.numeric
    const gapIsCoveredBySuffixes = difference > step
      && difference % step === 0
      && Array.from(
        { length: difference / step - 1 },
        (_, index) => previous.numeric + (index + 1) * step,
      ).every((number) => bridgeNumbers.has(number))

    if (difference === step || gapIsCoveredBySuffixes) group.push(value)
    else groups.push([value])
  }

  return groups.map((group) => makeRange(group, group.length > 1 ? parity : undefined))
}

function consecutiveSuffixGroups(values: ParsedNumber[]): NumberRange[] {
  if (values.length === 0) return []

  const sorted = [...values].sort((left, right) => {
    if (left.numeric !== right.numeric) return left.numeric - right.numeric
    return left.suffix.localeCompare(right.suffix, 'de')
  })
  const groups: ParsedNumber[][] = [[sorted[0]]]

  for (const value of sorted.slice(1)) {
    const group = groups.at(-1)!
    const previous = group.at(-1)!
    const followsPreviousSuffix = value.numeric === previous.numeric
      && value.suffix.charCodeAt(0) - previous.suffix.charCodeAt(0) === 1

    if (followsPreviousSuffix) group.push(value)
    else groups.push([value])
  }

  return groups.map((group) => makeRange(group))
}

function summarizeNumbers(numbers: string[]): NumberRange[] {
  const unique = [...new Set(numbers.map((number) => number.trim()).filter(Boolean))]
  const parsed = unique.map(parseNumber)
  const plain = parsed.filter((value): value is ParsedNumber => value !== null && value.suffix === '')
  const suffixed = parsed.filter((value): value is ParsedNumber => value !== null && value.suffix !== '')
  const nonStandard = unique.filter((_, index) => parsed[index] === null)

  plain.sort((left, right) => left.numeric - right.numeric)
  const numericSet = new Set(plain.map((value) => value.numeric))
  const minimum = plain[0]?.numeric
  const maximum = plain.at(-1)?.numeric
  const fullyConsecutive = minimum !== undefined
    && maximum !== undefined
    && maximum - minimum + 1 === numericSet.size

  const ranges: NumberRange[] = []
  if (fullyConsecutive) {
    ranges.push(makeRange(plain))
  } else {
    const odd = plain.filter((value) => value.numeric % 2 !== 0)
    const even = plain.filter((value) => value.numeric % 2 === 0)
    ranges.push(...consecutiveGroups(odd, 2, 'ungerade', suffixed))
    ranges.push(...consecutiveGroups(even, 2, 'gerade', suffixed))
  }

  const numbersCoveredByRanges = new Set(
    ranges
      .filter((range) => range.values.length > 1)
      .flatMap((range) => {
        const first = parseNumber(range.values[0])!
        const last = parseNumber(range.values.at(-1)!)!
        const step = range.parity ? 2 : 1
        return Array.from(
          { length: (last.numeric - first.numeric) / step + 1 },
          (_, index) => first.numeric + index * step,
        )
      }),
  )
  const uncoveredSuffixes = suffixed.filter((value) => !numbersCoveredByRanges.has(value.numeric))

  ranges.push(...consecutiveSuffixGroups(uncoveredSuffixes))
  ranges.push(...nonStandard.sort(naturalCompare).map((value) => ({ label: value, values: [value] })))
  return ranges.sort((left, right) => naturalCompare(left.values[0], right.values[0]))
}

function rangeText(range: NumberRange): string {
  return range.parity ? `${range.label} (${range.parity})` : range.label
}

export function summarizeAddresses(addresses: AddressRecord[]): StreetSummary[] {
  const streets = new Map<string, {
    displayName: string
    numbers: string[]
    suburbs: string[]
    postalCodes: string[]
    states: string[]
  }>()

  const mostCommon = (values: string[]): string => {
    const counts = new Map<string, number>()
    for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1)
    return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? ''
  }

  for (const address of addresses) {
    const key = streetKey(address.street)
    const current = streets.get(key) ?? {
      displayName: address.street,
      numbers: [],
      suburbs: [],
      postalCodes: [],
      states: [],
    }
    current.numbers.push(address.houseNumber)
    current.suburbs.push(address.suburb)
    current.postalCodes.push(address.postalCode)
    current.states.push(address.state)
    streets.set(key, current)
  }

  return [...streets.values()]
    .map(({ displayName, numbers, suburbs, postalCodes, states }) => {
      const ranges = summarizeNumbers(numbers)
      return {
        street: displayName,
        addressCount: new Set(numbers).size,
        ranges,
        text: `${displayName} ${ranges.map(rangeText).join(', ')}`,
        suburb: mostCommon(suburbs),
        postalCode: mostCommon(postalCodes),
        state: mostCommon(states),
      }
    })
    .sort((left, right) => naturalCompare(left.street, right.street))
}

export const testing = { summarizeNumbers, parseNumber }
