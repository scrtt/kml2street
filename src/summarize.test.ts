import { describe, expect, it } from 'vitest'
import { summarizeAddresses, testing } from './summarize'

describe('summarizeNumbers', () => {
  it('merges a complete numeric sequence into one range', () => {
    expect(testing.summarizeNumbers(['1', '2', '3', '4']).map((range) => range.label)).toEqual(['1–4'])
  })

  it('keeps interrupted odd and even sides separate', () => {
    expect(testing.summarizeNumbers(['1', '3', '5', '7', '2', '4', '6', '20'])).toEqual([
      { label: '1–7', parity: 'ungerade', values: ['1', '3', '5', '7'] },
      { label: '2–6', parity: 'gerade', values: ['2', '4', '6'] },
      { label: '20', values: ['20'] },
    ])
  })

  it('merges consecutive suffixes and preserves non-standard house numbers', () => {
    expect(testing.summarizeNumbers(['12', '12a', '12b', '14-16']).map((range) => range.label)).toEqual([
      '12',
      '12a–12b',
      '14-16',
    ])
  })

  it('does not merge interrupted suffix sequences', () => {
    expect(testing.summarizeNumbers(['1a', '1b', '1d', '2a']).map((range) => range.label)).toEqual([
      '1a–1b',
      '1d',
      '2a',
    ])
  })

  it('uses suffixed numbers to bridge matching numeric ranges', () => {
    const numbers = [
      '2', '4',
      ...Array.from({ length: 13 }, (_, index) => String(8 + index * 2)),
      '34a', '34b',
      ...Array.from({ length: 16 }, (_, index) => String(36 + index * 2)),
    ]

    expect(testing.summarizeNumbers(numbers)).toEqual([
      { label: '2–4', parity: 'gerade', values: ['2', '4'] },
      {
        label: '8–66',
        parity: 'gerade',
        values: [
          ...Array.from({ length: 13 }, (_, index) => String(8 + index * 2)),
          ...Array.from({ length: 16 }, (_, index) => String(36 + index * 2)),
        ],
      },
    ])
  })

  it('omits suffixes whose base number is already covered by a numeric range', () => {
    const numbers = [
      '1a', '1b', '1c', '1d', '1e', '1f', '1g', '1h',
      ...Array.from({ length: 29 }, (_, index) => String(2 + index * 2)),
      ...Array.from({ length: 26 }, (_, index) => String(3 + index * 2)),
      '4a', '5a', '29a', '29b', '29c', '29d', '33a', '35a', '35b', '35c',
      '37a', '39a', '39b', '41a', '52a',
    ]

    expect(testing.summarizeNumbers(numbers)).toEqual([
      { label: '1a–1h', values: ['1a', '1b', '1c', '1d', '1e', '1f', '1g', '1h'] },
      {
        label: '2–58',
        parity: 'gerade',
        values: Array.from({ length: 29 }, (_, index) => String(2 + index * 2)),
      },
      {
        label: '3–53',
        parity: 'ungerade',
        values: Array.from({ length: 26 }, (_, index) => String(3 + index * 2)),
      },
    ])
  })
})

describe('summarizeAddresses', () => {
  it('groups street names case-insensitively', () => {
    const result = summarizeAddresses([
      {
        street: 'Siemensstraße', houseNumber: '1', latitude: 0, longitude: 0,
        suburb: 'Wolfsburg', postalCode: '38440', state: 'Niedersachsen',
      },
      {
        street: 'SIEMENSSTRASSE', houseNumber: '2', latitude: 0, longitude: 0,
        suburb: 'Wolfsburg', postalCode: '38440', state: 'Niedersachsen',
      },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Siemensstraße 1–2')
    expect(result[0]).toMatchObject({ suburb: 'Wolfsburg', postalCode: '38440', state: 'Niedersachsen' })
  })
})
