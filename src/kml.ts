import type { Coordinate, ParsedKml, PolygonGeometry } from './types'

function localElements(parent: Element | Document, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS('*', localName))
}

function firstLocal(parent: Element, localName: string): Element | undefined {
  return localElements(parent, localName)[0]
}

function parseCoordinates(raw: string | null): Coordinate[] {
  if (!raw) return []

  const coordinates = raw
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(',').map(Number))
    .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude))
    .map(([longitude, latitude]) => [longitude, latitude] as Coordinate)

  if (coordinates.length > 1) {
    const first = coordinates[0]
    const last = coordinates.at(-1)
    if (last && first[0] === last[0] && first[1] === last[1]) coordinates.pop()
  }

  return coordinates
}

function boundaryCoordinates(boundary: Element | undefined): Coordinate[] {
  if (!boundary) return []
  return parseCoordinates(firstLocal(boundary, 'coordinates')?.textContent ?? null)
}

function parsePolygon(element: Element): PolygonGeometry | null {
  const outer = boundaryCoordinates(firstLocal(element, 'outerBoundaryIs'))
  if (outer.length < 3) return null

  const holes = localElements(element, 'innerBoundaryIs')
    .map(boundaryCoordinates)
    .filter((ring) => ring.length >= 3)

  return { outer, holes }
}

export function parseKml(source: string, fallbackName = 'Versammlungsgebiet'): ParsedKml {
  const xml = new DOMParser().parseFromString(source, 'application/xml')
  const parserError = xml.querySelector('parsererror')
  if (parserError) throw new Error('Die Datei ist kein gültiges KML/XML-Dokument.')

  const polygons = localElements(xml, 'Polygon')
    .map(parsePolygon)
    .filter((polygon): polygon is PolygonGeometry => polygon !== null)

  if (polygons.length === 0) {
    throw new Error('In dieser KML-Datei wurde keine geschlossene Polygonfläche gefunden.')
  }

  const documentElement = localElements(xml, 'Document')[0]
  const name = documentElement ? firstLocal(documentElement, 'name')?.textContent?.trim() : undefined

  return { name: name || fallbackName, polygons }
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function serializeRing(coordinates: Coordinate[]): string {
  if (coordinates.length === 0) return ''
  const closed = [...coordinates, coordinates[0]]
  return closed.map(([longitude, latitude]) => `${longitude.toFixed(7)},${latitude.toFixed(7)},0`).join(' ')
}

export function createKml(kml: ParsedKml): string {
  const polygons = kml.polygons.map((polygon) => `
      <Placemark>
        <name>${escapeXml(kml.name)}</name>
        <Polygon>
          <outerBoundaryIs><LinearRing><coordinates>${serializeRing(polygon.outer)}</coordinates></LinearRing></outerBoundaryIs>
          ${polygon.holes.map((hole) => `<innerBoundaryIs><LinearRing><coordinates>${serializeRing(hole)}</coordinates></LinearRing></innerBoundaryIs>`).join('\n          ')}
        </Polygon>
      </Placemark>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(kml.name)}</name>${polygons}
  </Document>
</kml>
`
}
