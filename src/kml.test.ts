import { describe, expect, it } from 'vitest'
import { createKml } from './kml'

describe('createKml', () => {
  it('creates a closed KML polygon from map coordinates', () => {
    const source = createKml({
      name: 'Test & Gebiet',
      polygons: [{
        outer: [[13.1, 52.1], [13.2, 52.1], [13.2, 52.2]],
        holes: [],
      }],
    })

    expect(source).toContain('<name>Test &amp; Gebiet</name>')
    expect(source).toContain('13.1000000,52.1000000,0 13.2000000,52.1000000,0 13.2000000,52.2000000,0 13.1000000,52.1000000,0')
  })
})
