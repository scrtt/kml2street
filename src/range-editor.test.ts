import { describe, expect, it } from 'vitest'
import { applyEditedRanges, createEditedRange, mergeNumberRanges, normalizeRangeLabel } from './range-editor'
import type { StreetSummary } from './types'

describe('range editor', () => {
  it('normalizes manually entered separators and expands the represented numbers', () => {
    expect(normalizeRangeLabel(' 1 - 9 ')).toBe('1–9')
    expect(createEditedRange('1-9').values).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(createEditedRange('2-8', 'gerade').values).toEqual(['2', '4', '6', '8'])
  })

  it('merges two selected ranges into their complete outer range', () => {
    expect(mergeNumberRanges([
      createEditedRange('1-3'),
      createEditedRange('7-9'),
    ])).toEqual(createEditedRange('1–9'))
  })

  it('keeps parity only when every merged range has the same parity', () => {
    expect(mergeNumberRanges([
      createEditedRange('1-5', 'ungerade'),
      createEditedRange('9-13', 'ungerade'),
    ])).toEqual(createEditedRange('1–13', 'ungerade'))
    expect(mergeNumberRanges([
      createEditedRange('1-5', 'ungerade'),
      createEditedRange('2-6', 'gerade'),
    ])?.parity).toBeUndefined()
  })

  it('rejects merging free-form ranges but still allows storing them', () => {
    expect(mergeNumberRanges([createEditedRange('Hinterhaus'), createEditedRange('1-3')])).toBeNull()
    expect(createEditedRange('Hinterhaus')).toEqual({ label: 'Hinterhaus', values: ['Hinterhaus'] })
  })

  it('updates count and copy text after editing', () => {
    const summary: StreetSummary = {
      street: 'Dorfstraße', addressCount: 4, ranges: [], text: '', suburb: '', postalCode: '', state: '',
    }
    const edited = applyEditedRanges(summary, [createEditedRange('1-3'), createEditedRange('7')])
    expect(edited.addressCount).toBe(4)
    expect(edited.text).toBe('Dorfstraße 1–3, 7')
  })

  it('allows every existing range to be deleted', () => {
    const summary: StreetSummary = {
      street: 'Dorfstraße', addressCount: 4, ranges: [], text: '', suburb: '', postalCode: '', state: '',
    }
    const edited = applyEditedRanges(summary, [])
    expect(edited.addressCount).toBe(0)
    expect(edited.ranges).toEqual([])
    expect(edited.text).toBe('Dorfstraße (keine Nummernkreise)')
  })
})
