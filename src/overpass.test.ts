import { describe, expect, it } from 'vitest'
import { testing } from './overpass'
import type { ParsedKml } from './types'

const area: ParsedKml = {
  name: 'Testgebiet',
  polygons: [{
    outer: [[10, 52], [11, 52], [11, 53], [10, 53]],
    holes: [],
  }],
}

describe('Overpass normalization', () => {
  it('uses OSM address tags and administrative boundaries for export fields', () => {
    const result = testing.normalizeResponse({
      elements: [
        { type: 'relation', id: 1, tags: { boundary: 'administrative', admin_level: '4', name: 'Niedersachsen' } },
        { type: 'relation', id: 2, tags: { boundary: 'administrative', admin_level: '8', name: 'Wolfsburg' } },
        {
          type: 'node', id: 3, lat: 52.5, lon: 10.5,
          tags: {
            'addr:street': 'Sandkrugstraße',
            'addr:housenumber': '7',
            'addr:city': 'Wolfsburg',
            'addr:postcode': '38440',
          },
        },
        {
          type: 'way', id: 4, center: { lat: 52.51, lon: 10.51 },
          tags: { highway: 'residential', name: 'Straße ohne Hausnummern' },
        },
      ],
    }, area)

    expect(result.addresses[0]).toMatchObject({
      suburb: 'Wolfsburg',
      postalCode: '38440',
      state: 'Niedersachsen',
    })
    expect(result.streets.find((street) => street.street === 'Straße ohne Hausnummern')).toMatchObject({
      suburb: 'Wolfsburg',
      postalCode: '38440',
      state: 'Niedersachsen',
    })
  })

  it('includes an administrative lookup for the area center', () => {
    const query = testing.buildQuery(area)
    expect(query).toContain('is_in(52.5000000,10.5000000)->.adminAreas0;')
    expect(query).toContain('rel(pivot.adminAreas0)')
  })
})
