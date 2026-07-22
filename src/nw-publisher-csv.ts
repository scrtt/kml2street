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

export function createNwPublisherCsv(summaries: StreetSummary[], territory?: TerritoryInfo): string {
  const rows = summaries.flatMap((summary) => {
    const numberRanges = summary.ranges.length > 0
      ? summary.ranges.map((range) => range.label.replaceAll('–', '-'))
      : ['']

    return numberRanges.map((numberRange) => [
      territory?.id ?? '',
      territory?.number ?? '',
      territory?.categoryCode ?? '',
      territory?.category ?? '',
      '',
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
    ])
  })

  return `\uFEFF${[NW_PUBLISHER_HEADERS, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')}`
}
