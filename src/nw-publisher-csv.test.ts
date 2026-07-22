import { describe, expect, it } from 'vitest'
import { createNwPublisherCsv, createNwPublisherFilename, NW_PUBLISHER_HEADERS } from './nw-publisher-csv'
import type { StreetSummary } from './types'

const summary: StreetSummary = {
  street: 'Am Mühlenberg',
  addressCount: 8,
  ranges: [{ label: '2–16', parity: 'gerade', values: ['2', '4', '6', '8', '10', '12', '14', '16'] }],
  text: 'Am Mühlenberg 2–16 (gerade)',
  suburb: 'Bahrdorf',
  postalCode: '38459',
  state: 'Niedersachsen',
}

describe('createNwPublisherCsv', () => {
  it('matches the NW Publisher address export columns and keeps imported territory data', () => {
    const csv = createNwPublisherCsv([summary], {
      id: '9004302',
      number: '4302',
      categoryCode: '',
      category: '',
    })
    const [header, row] = csv.replace(/^\uFEFF/, '').split('\r\n')

    expect(header.split(',')).toEqual(NW_PUBLISHER_HEADERS)
    expect(row.split(',')).toEqual([
      '9004302', '4302', '', '', '', '', '', '2-16', 'Am Mühlenberg', 'Bahrdorf', '38459',
      'Niedersachsen', '', '', 'Street', 'Available', '0', '', '', '', '', '', '', '', '',
    ])
  })

  it('leaves the territory fields empty for a hand-drawn area', () => {
    const row = createNwPublisherCsv([summary]).split('\r\n')[1].split(',')
    expect(row.slice(0, 4)).toEqual(['', '', '', ''])
  })

  it('quotes values that contain commas', () => {
    const withComma = { ...summary, street: 'Straße, Nord' }
    expect(createNwPublisherCsv([withComma])).toContain('"Straße, Nord"')
  })

  it('exports every displayed number range as a distinct street with a stable ID', () => {
    const withThreeRanges: StreetSummary = {
      ...summary,
      ranges: [
        { label: '1–9', parity: 'ungerade', values: ['1', '3', '5', '7', '9'] },
        { label: '2–10', parity: 'gerade', values: ['2', '4', '6', '8', '10'] },
        { label: '17', values: ['17'] },
      ],
    }
    const territory = { id: '9004302', number: '4302', categoryCode: '', category: '' }
    const csv = createNwPublisherCsv([withThreeRanges], territory)
    const rows = csv.replace(/^\uFEFF/, '').split('\r\n').slice(1).map((row) => row.split(','))
    const addressIds = rows.map((row) => row[4])

    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row[7])).toEqual(['1-9', '2-10', '17'])
    expect(rows.every((row) => row[8] === 'Am Mühlenberg' && row[14] === 'Street')).toBe(true)
    expect(addressIds.every((id) => /^9\d{8}$/.test(id))).toBe(true)
    expect(new Set(addressIds).size).toBe(3)
    expect(createNwPublisherCsv([withThreeRanges], territory)).toBe(csv)
  })

  it('keeps a street without house numbers as one row with an empty Number field', () => {
    const withoutNumbers = { ...summary, addressCount: 0, ranges: [] }
    const rows = createNwPublisherCsv([withoutNumbers]).replace(/^\uFEFF/, '').split('\r\n').slice(1)

    expect(rows).toHaveLength(1)
    expect(rows[0].split(',')[7]).toBe('')
  })
})

describe('createNwPublisherFilename', () => {
  it('marks the export as an address file and sanitizes the area name', () => {
    expect(createNwPublisherFilename('Gebiet Süd / 12')).toBe('Gebiet-Süd-12-addresses.csv')
  })

  it('removes an imported file extension before adding the export suffix', () => {
    expect(createNwPublisherFilename('Gebiet 12.csv')).toBe('Gebiet-12-addresses.csv')
  })

  it('uses a useful fallback when the area name is empty', () => {
    expect(createNwPublisherFilename()).toBe('gebiet-addresses.csv')
  })
})
