export type Coordinate = [longitude: number, latitude: number]

export interface PolygonGeometry {
  outer: Coordinate[]
  holes: Coordinate[][]
}

export interface TerritoryInfo {
  id: string
  number: string
  categoryCode: string
  category: string
}

export interface ParsedKml {
  name: string
  polygons: PolygonGeometry[]
  territory?: TerritoryInfo
}

export interface AddressRecord {
  street: string
  houseNumber: string
  latitude: number
  longitude: number
  suburb: string
  postalCode: string
  state: string
}

export interface StreetDetails {
  street: string
  suburb: string
  postalCode: string
  state: string
}

export interface AreaData {
  addresses: AddressRecord[]
  streets: StreetDetails[]
}

export interface NumberRange {
  label: string
  parity?: 'gerade' | 'ungerade'
  values: string[]
}

export interface StreetSummary {
  street: string
  addressCount: number
  ranges: NumberRange[]
  text: string
  manuallyEdited?: boolean
  suburb: string
  postalCode: string
  state: string
}
