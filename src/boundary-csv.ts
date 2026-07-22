import type { Coordinate, ParsedKml, PolygonGeometry, TerritoryInfo } from './types'

function parseDelimited(source: string, delimiter: ',' | ';'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]

    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      row.push(cell)
      cell = ''
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      if (character === '\r' && source[index + 1] === '\n') index += 1
    } else {
      cell += character
    }
  }

  if (quoted) throw new Error('Die CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.')
  row.push(cell)
  if (row.some((value) => value.trim() !== '')) rows.push(row)
  return rows
}

function rowsWithBoundaryColumn(source: string): { rows: string[][]; boundaryIndex: number } | null {
  for (const delimiter of [',', ';'] as const) {
    const rows = parseDelimited(source, delimiter)
    const headers = rows[0]?.map((header) => header.replace(/^\uFEFF/, '').trim().toLocaleLowerCase('en')) ?? []
    const boundaryIndex = headers.indexOf('boundary')
    if (boundaryIndex !== -1) return { rows, boundaryIndex }
  }
  return null
}

function sameCoordinate(left: Coordinate, right: Coordinate): boolean {
  return left[0] === right[0] && left[1] === right[1]
}

function parseBoundary(value: string): Coordinate[] {
  const coordinates: Coordinate[] = []
  const coordinatePattern = /\[\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?)\s*,\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?)\s*\]/g

  for (const match of value.matchAll(coordinatePattern)) {
    const longitude = Number(match[1])
    const latitude = Number(match[2])
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      throw new Error('Die Boundary-Spalte enthält eine Koordinate außerhalb des gültigen Bereichs.')
    }

    const coordinate: Coordinate = [longitude, latitude]
    if (!coordinates.at(-1) || !sameCoordinate(coordinates.at(-1)!, coordinate)) coordinates.push(coordinate)
  }

  if (coordinates.length > 1 && sameCoordinate(coordinates[0], coordinates.at(-1)!)) coordinates.pop()
  if (new Set(coordinates.map(([longitude, latitude]) => `${longitude},${latitude}`)).size < 3) {
    throw new Error('Die Boundary-Spalte enthält weniger als drei gültige Außenpunkte.')
  }

  return coordinates
}

function rowName(headers: string[], row: string[]): string {
  const value = (name: string): string => row[headers.indexOf(name)]?.trim() ?? ''
  const category = value('category') || value('area')
  const number = `${value('number')}${value('suffix')}`
  return [category, number].filter(Boolean).join(' ')
}

function territoryInfo(headers: string[], row: string[]): TerritoryInfo {
  const value = (name: string): string => row[headers.indexOf(name)]?.trim() ?? ''
  return {
    id: value('territoryid'),
    number: value('number'),
    categoryCode: value('categorycode'),
    category: value('category'),
  }
}

function commonTerritory(territories: TerritoryInfo[]): TerritoryInfo | undefined {
  const populated = territories.filter((territory) => Object.values(territory).some(Boolean))
  if (populated.length === 0) return undefined
  const first = populated[0]
  return populated.every((territory) => (
    territory.id === first.id
    && territory.number === first.number
    && territory.categoryCode === first.categoryCode
    && territory.category === first.category
  )) ? first : undefined
}

export function parseBoundaryCsv(source: string, fallbackName = 'Versammlungsgebiet'): ParsedKml {
  const parsed = rowsWithBoundaryColumn(source)
  if (!parsed) throw new Error('In dieser CSV-Datei wurde keine Spalte „Boundary“ gefunden.')

  const headers = parsed.rows[0].map((header) => header.replace(/^\uFEFF/, '').trim().toLocaleLowerCase('en'))
  const polygons: PolygonGeometry[] = []
  const names: string[] = []
  const territories: TerritoryInfo[] = []

  for (const [index, row] of parsed.rows.slice(1).entries()) {
    const boundary = row[parsed.boundaryIndex]?.trim()
    if (!boundary) continue

    try {
      polygons.push({ outer: parseBoundary(boundary), holes: [] })
      const name = rowName(headers, row)
      if (name) names.push(name)
      territories.push(territoryInfo(headers, row))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Die Boundary-Spalte konnte nicht gelesen werden.'
      throw new Error(`CSV-Zeile ${index + 2}: ${message}`)
    }
  }

  if (polygons.length === 0) {
    throw new Error('In der Boundary-Spalte wurde keine geschlossene Polygonfläche gefunden.')
  }

  const territory = commonTerritory(territories)
  return {
    name: polygons.length === 1 && names[0] ? names[0] : fallbackName,
    polygons,
    ...(territory ? { territory } : {}),
  }
}
