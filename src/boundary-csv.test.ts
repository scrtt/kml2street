import { describe, expect, it } from 'vitest'
import { parseBoundaryCsv } from './boundary-csv'

describe('parseBoundaryCsv', () => {
  it('reads the quoted Boundary format used by Gebiet CSV exports', () => {
    const source = '\uFEFFTerritoryID,CategoryCode,Category,Number,Suffix,Area,Type,Boundary\r\n'
      + '9003002,VE,Velpke,3002,,Velpke,InPerson,"[10.939643020904699,52.414228960968771],[10.941043134002767,52.416041621743304],[10.943092341678748,52.416872672349825],[10.939643020904699,52.414228960968771]"\r\n'

    expect(parseBoundaryCsv(source, 'Gebiet 3002')).toEqual({
      name: 'Velpke 3002',
      polygons: [{
        outer: [
          [10.939643020904699, 52.414228960968771],
          [10.941043134002767, 52.416041621743304],
          [10.943092341678748, 52.416872672349825],
        ],
        holes: [],
      }],
      territory: {
        id: '9003002',
        number: '3002',
        categoryCode: 'VE',
        category: 'Velpke',
      },
    })
  })

  it('accepts semicolon-separated exports and multiple areas', () => {
    const source = 'Category;Number;Boundary\n'
      + 'Nord;1;"[10,52],[11,52],[11,53],[10,52]"\n'
      + 'Süd;2;"[12,52],[13,52],[13,53],[12,52]"'

    const parsed = parseBoundaryCsv(source, 'Zwei Gebiete')
    expect(parsed.name).toBe('Zwei Gebiete')
    expect(parsed.polygons).toHaveLength(2)
  })

  it('reports a missing Boundary column clearly', () => {
    expect(() => parseBoundaryCsv('Name,Coordinates\nTest,"[10,52],[11,52],[11,53]"'))
      .toThrow('keine Spalte „Boundary“')
  })

  it('does not assign one territory when several different territories are imported', () => {
    const source = 'TerritoryID,Number,Boundary\n'
      + '9000001,1,"[10,52],[11,52],[11,53],[10,52]"\n'
      + '9000002,2,"[12,52],[13,52],[13,53],[12,52]"'

    expect(parseBoundaryCsv(source).territory).toBeUndefined()
  })
})
