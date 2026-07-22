import type { StreetSummary, TerritoryInfo } from './types'

export const NW_PUBLISHER_HEADERS = [
  'TerritoryID',
  'TerritoryNumber',
  'CategoryCode',
  'Category',
  'TerritoryAddressID',
  'TerritoryAddressApartmentID',
  'ApartmentNumber',
  'Number',
  'Street',
  'Suburb',
  'PostalCode',
  'State',
  'Name',
  'Phone',
  'Type',
  'Status',
  'NotHomeAttempt',
  'Date1',
  'Date2',
  'Date3',
  'Date4',
  'Date5',
  'Language',
  'Notes',
  'NotesFromPublisher',
] as const

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function createNwPublisherFilename(areaName?: string): string {
  const sanitizedAreaName = (areaName || 'gebiet')
    .replace(/\.(?:kml|csv)$/i, '')
    .replace(/[^a-z0-9äöüß_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')

  return `${sanitizedAreaName || 'gebiet'}-addresses.csv`
}

function stableAddressId(key: string, usedIds: Set<string>): string {
  let hash = 2166136261
  for (const character of key) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }

  let numericId = 900_000_000 + ((hash >>> 0) % 100_000_000)
  while (usedIds.has(String(numericId))) {
    numericId = numericId === 999_999_999 ? 900_000_000 : numericId + 1
  }

  const id = String(numericId)
  usedIds.add(id)
  return id
}

export function createNwPublisherCsv(
  summaries: StreetSummary[],
  territory?: TerritoryInfo,
  areaName = '',
): string {
  const usedAddressIds = new Set<string>()
  const areaKey = territory?.id || [territory?.categoryCode, territory?.number, areaName].filter(Boolean).join('|')
  const rows = summaries.flatMap((summary) => {
    const ranges = summary.ranges.length > 0 ? summary.ranges : [{ label: '', values: [] }]
    const needsDistinctIds = ranges.length > 1

    return ranges.map((range) => {
      const numberRange = range.label.replaceAll('–', '-')
      const addressId = needsDistinctIds
        ? stableAddressId(`${areaKey}|${summary.street}|${numberRange}`, usedAddressIds)
        : ''

      return [
        territory?.id ?? '',
        territory?.number ?? '',
        territory?.categoryCode ?? '',
        territory?.category ?? '',
        addressId,
        '',
        '',
        numberRange,
        summary.street,
        summary.suburb,
        summary.postalCode,
        summary.state,
        '',
        '',
        'Street',
        'Available',
        '0',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]
    })
  })

  return `\uFEFF${[NW_PUBLISHER_HEADERS, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')}`
}
