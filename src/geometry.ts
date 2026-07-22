import type { Coordinate, PolygonGeometry } from './types'

function pointOnSegment(point: Coordinate, start: Coordinate, end: Coordinate): boolean {
  const [x, y] = point
  const [x1, y1] = start
  const [x2, y2] = end
  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1)
  if (Math.abs(cross) > 1e-10) return false
  return x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(y1, y2) && y <= Math.max(y1, y2)
}

export function pointInRing(point: Coordinate, ring: Coordinate[]): boolean {
  let inside = false

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index]
    const previousPoint = ring[previous]
    if (pointOnSegment(point, previousPoint, currentPoint)) return true

    const [x, y] = point
    const [xi, yi] = currentPoint
    const [xj, yj] = previousPoint
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }

  return inside
}

export function pointInPolygons(point: Coordinate, polygons: PolygonGeometry[]): boolean {
  return polygons.some((polygon) => {
    if (!pointInRing(point, polygon.outer)) return false
    return !polygon.holes.some((hole) => pointInRing(point, hole))
  })
}

export function polygonAreaApprox(polygons: PolygonGeometry[]): number {
  const ringArea = (ring: Coordinate[]) => {
    let area = 0
    for (let index = 0; index < ring.length; index += 1) {
      const [x1, y1] = ring[index]
      const [x2, y2] = ring[(index + 1) % ring.length]
      area += x1 * y2 - x2 * y1
    }
    return Math.abs(area / 2)
  }

  return polygons.reduce((total, polygon) => {
    return total + ringArea(polygon.outer) - polygon.holes.reduce((sum, hole) => sum + ringArea(hole), 0)
  }, 0)
}
