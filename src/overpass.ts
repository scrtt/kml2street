import { pointInPolygons } from './geometry'
import type { AddressRecord, AreaData, ParsedKml, PolygonGeometry, StreetDetails } from './types'

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements: OverpassElement[]
}

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

function closeRing(ring: PolygonGeometry['outer']): PolygonGeometry['outer'] {
  if (ring.length === 0) return ring
  const first = ring[0]
  const last = ring.at(-1)
  return last && first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
}

function overpassPolygon(polygon: PolygonGeometry): string {
  return closeRing(polygon.outer)
    .map(([longitude, latitude]) => `${latitude.toFixed(7)} ${longitude.toFixed(7)}`)
    .join(' ')
}

function polygonCenter(polygon: PolygonGeometry): { latitude: number; longitude: number } {
  const sum = polygon.outer.reduce(
    (current, [longitude, latitude]) => ({
      longitude: current.longitude + longitude,
      latitude: current.latitude + latitude,
    }),
    { longitude: 0, latitude: 0 },
  )
  return {
    longitude: sum.longitude / polygon.outer.length,
    latitude: sum.latitude / polygon.outer.length,
  }
}

function buildQuery(kml: ParsedKml): string {
  const adminLookups = kml.polygons.map((polygon, index) => {
    const center = polygonCenter(polygon)
    return `is_in(${center.latitude.toFixed(7)},${center.longitude.toFixed(7)})->.adminAreas${index};`
  }).join('\n')
  const selectors = kml.polygons
    .map((polygon, index) => ({ polygon: overpassPolygon(polygon), index }))
    .map(({ polygon, index }) => `
  nwr["addr:housenumber"]["addr:street"](poly:"${polygon}");
  way["highway"]["name"](poly:"${polygon}");
  rel(pivot.adminAreas${index})["boundary"="administrative"]["admin_level"~"^(4|8|9|10)$"];`)
    .join('\n')

  return `[out:json][timeout:60];\n${adminLookups}\n(\n${selectors}\n);\nout center tags;`
}

function coordinateOf(element: OverpassElement): { latitude: number; longitude: number } | null {
  const latitude = element.lat ?? element.center?.lat
  const longitude = element.lon ?? element.center?.lon
  if (latitude === undefined || longitude === undefined) return null
  return { latitude, longitude }
}

function normalizeName(value: string): string {
  return value.normalize('NFKD').replaceAll('ß', 'ss').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de')
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>()
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? ''
}

function locationTags(tags: Record<string, string> | undefined): Omit<StreetDetails, 'street'> {
  return {
    suburb: tags?.['addr:city']?.trim()
      || tags?.['addr:place']?.trim()
      || tags?.['addr:suburb']?.trim()
      || tags?.['is_in:city']?.trim()
      || '',
    postalCode: tags?.['addr:postcode']?.trim() || tags?.postal_code?.trim() || '',
    state: tags?.['addr:state']?.trim() || tags?.['is_in:state']?.trim() || '',
  }
}

function normalizeResponse(data: OverpassResponse, kml: ParsedKml): AreaData {
  const seen = new Set<string>()
  const addresses: AddressRecord[] = []
  const streets = new Map<string, {
    street: string
    suburbs: string[]
    postalCodes: string[]
    states: string[]
    coordinates: Array<{ latitude: number; longitude: number }>
  }>()
  const stateFallback = mostCommon(data.elements
    .filter((element) => element.type === 'relation' && element.tags?.admin_level === '4')
    .map((element) => element.tags?.name?.trim() ?? ''))
  const suburbFallback = mostCommon(data.elements
    .filter((element) => element.type === 'relation' && ['8', '9', '10'].includes(element.tags?.admin_level ?? ''))
    .map((element) => element.tags?.name?.trim() ?? ''))

  const addStreet = (
    street: string,
    coordinate: { latitude: number; longitude: number } | null,
    location: Omit<StreetDetails, 'street'>,
  ): void => {
    const key = normalizeName(street)
    const current = streets.get(key) ?? {
      street,
      suburbs: [],
      postalCodes: [],
      states: [],
      coordinates: [],
    }
    current.suburbs.push(location.suburb)
    current.postalCodes.push(location.postalCode)
    current.states.push(location.state)
    if (coordinate) current.coordinates.push(coordinate)
    streets.set(key, current)
  }

  for (const element of data.elements) {
    const coordinate = coordinateOf(element)
    const location = locationTags(element.tags)
    const highwayName = element.tags?.name?.trim()
    if (element.type === 'way' && element.tags?.highway && highwayName) {
      addStreet(highwayName, coordinate, location)
    }

    const street = element.tags?.['addr:street']?.trim()
    const houseNumber = element.tags?.['addr:housenumber']?.trim()
    if (!street || !houseNumber || !coordinate) continue
    if (!pointInPolygons([coordinate.longitude, coordinate.latitude], kml.polygons)) continue

    addStreet(street, coordinate, location)
    const key = `${normalizeName(street)}\u0000${houseNumber.toLocaleLowerCase('de')}`
    if (seen.has(key)) continue
    seen.add(key)
    addresses.push({
      street,
      houseNumber,
      ...coordinate,
      suburb: location.suburb,
      postalCode: location.postalCode,
      state: location.state || stateFallback,
    })
  }

  const nearestAddressValue = (
    coordinates: Array<{ latitude: number; longitude: number }>,
    field: 'suburb' | 'postalCode' | 'state',
  ): string => {
    const origin = coordinates[0]
    if (!origin) return ''
    let nearest: { distance: number; value: string } | undefined
    for (const address of addresses) {
      const value = address[field]
      if (!value) continue
      const distance = (address.latitude - origin.latitude) ** 2 + (address.longitude - origin.longitude) ** 2
      if (!nearest || distance < nearest.distance) nearest = { distance, value }
    }
    return nearest?.value ?? ''
  }

  const streetDetails = [...streets.values()].map((street): StreetDetails => ({
    street: street.street,
    suburb: mostCommon(street.suburbs) || nearestAddressValue(street.coordinates, 'suburb') || suburbFallback,
    postalCode: mostCommon(street.postalCodes) || nearestAddressValue(street.coordinates, 'postalCode'),
    state: mostCommon(street.states) || nearestAddressValue(street.coordinates, 'state') || stateFallback,
  })).sort((left, right) => left.street.localeCompare(right.street, 'de', { sensitivity: 'base' }))

  return { addresses, streets: streetDetails }
}

export async function fetchAreaData(kml: ParsedKml, signal?: AbortSignal): Promise<AreaData> {
  const query = buildQuery(kml)
  let lastError: unknown

  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: query }),
        signal,
      })

      if (!response.ok) throw new Error(`OpenStreetMap antwortet mit Status ${response.status}.`)
      const data = (await response.json()) as OverpassResponse
      return normalizeResponse(data, kml)
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Die OpenStreetMap-Daten konnten gerade nicht geladen werden.')
}

export const testing = { buildQuery, normalizeResponse }
