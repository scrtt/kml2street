import { describe, expect, it } from 'vitest'
import { createNwPublisherCsv, NW_PUBLISHER_HEADERS } from './nw-publisher-csv'
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
})
