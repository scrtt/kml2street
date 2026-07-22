import L, { type LatLng, type LatLngExpression, type Layer, type LeafletMouseEvent } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './style.css'
import { parseBoundaryCsv } from './boundary-csv'
import { polygonAreaApprox } from './geometry'
import { createKml, parseKml } from './kml'
import { createNwPublisherCsv } from './nw-publisher-csv'
import { fetchAreaData } from './overpass'
import { summarizeAddresses } from './summarize'
import type { AddressRecord, ParsedKml, StreetDetails, StreetSummary } from './types'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main>
    <header class="masthead">
      <h1><strong>kml2street</strong> – Straßenerkennung für NW Publisher</h1>
      <span class="source-pill"><span></span>Daten von OpenStreetMap</span>
    </header>

    <section class="workspace" aria-label="KML-Auswertung">
      <div class="map-panel">
        <div id="map" aria-label="Karte des Versammlungsgebiets"></div>
        <div id="map-empty" class="map-empty">
          <div class="map-empty-icon" aria-hidden="true">⌖</div>
          <strong>Gebiet laden oder einzeichnen</strong>
          <span>Mit „Gebiet zeichnen“ setzt du die Außenpunkte direkt auf der Karte.</span>
        </div>
        <div id="map-badge" class="map-badge is-hidden"></div>
        <div class="map-tools">
          <button id="map-draw-button" class="map-tool-button" type="button"><span aria-hidden="true">✦</span> Gebiet zeichnen</button>
          <div id="draw-actions" class="draw-actions is-hidden">
            <button id="undo-point" type="button" disabled>↶ Rückgängig</button>
            <button id="finish-drawing" class="finish" type="button" disabled>Fläche schließen</button>
            <button id="cancel-drawing" type="button" aria-label="Zeichnen abbrechen">×</button>
          </div>
        </div>
        <div id="draw-hint" class="draw-hint is-hidden">Klicke den ersten Außenpunkt an.</div>
      </div>

      <aside class="control-panel">
        <div class="step-label"><span>1</span> Gebietsdatei</div>
        <label id="drop-zone" class="drop-zone" for="file-input">
          <input id="file-input" type="file" accept=".kml,.csv,application/vnd.google-earth.kml+xml,application/xml,text/xml,text/csv" />
          <span class="upload-icon" aria-hidden="true">↑</span>
          <strong>KML- oder CSV-Datei hier ablegen</strong>
          <span>oder vom Computer auswählen</span>
          <small>KML-Polygon oder CSV mit Boundary · max. 10 MB</small>
        </label>

        <div id="draw-option" class="draw-option">
          <span>oder</span>
          <button id="panel-draw-button" type="button">Gebiet direkt auf der Karte zeichnen <span aria-hidden="true">↗</span></button>
        </div>

        <div id="file-card" class="file-card is-hidden">
          <span id="file-icon" class="file-icon">KML</span>
          <span class="file-info"><strong id="file-name"></strong><small id="file-meta"></small></span>
          <button id="download-kml" class="download-kml" type="button">KML ↓</button>
          <button id="remove-file" class="remove-file" type="button" aria-label="Gebiet entfernen">×</button>
        </div>

        <div class="step-label second"><span>2</span> Straßen ermitteln</div>
        <button id="analyze-button" class="primary-button" type="button" disabled>
          <span class="button-label">Straßenliste erstellen</span><span aria-hidden="true">→</span>
        </button>
        <p id="status" class="status" role="status">KML- oder CSV-Datei auswählen oder ein Gebiet direkt auf der Karte zeichnen.</p>

        <section id="results" class="results is-hidden" aria-live="polite">
          <div class="step-label third"><span>3</span> Straßen</div>
          <div class="results-summary">
            <h2 id="results-title">Straßen im Gebiet</h2>
            <p id="results-meta"></p>
          </div>
          <div id="result-list" class="result-list"></div>

          <div class="step-label fourth"><span>4</span> Exportieren</div>
          <div class="result-actions">
            <button id="copy-button" class="secondary-button" type="button">Liste kopieren</button>
            <button id="csv-button" class="secondary-button" type="button">NW Publisher CSV</button>
          </div>
          <p class="osm-note"><strong>Hinweis:</strong> Benannte Straßen werden auch ohne Hausnummern aufgeführt. Hausnummernbereiche sind nur so vollständig wie die Adressdaten in OpenStreetMap. Bitte vor der Verwendung stichprobenartig prüfen.</p>
        </section>
      </aside>
    </section>
  </main>

  <footer>
    <span>kml2street</span>
    <span>OpenStreetMap-Daten unter ODbL</span>
  </footer>
`

const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
const dropZone = document.querySelector<HTMLElement>('#drop-zone')!
const drawOption = document.querySelector<HTMLElement>('#draw-option')!
const fileCard = document.querySelector<HTMLElement>('#file-card')!
const fileIcon = document.querySelector<HTMLElement>('#file-icon')!
const fileName = document.querySelector<HTMLElement>('#file-name')!
const fileMeta = document.querySelector<HTMLElement>('#file-meta')!
const removeFile = document.querySelector<HTMLButtonElement>('#remove-file')!
const downloadKmlButton = document.querySelector<HTMLButtonElement>('#download-kml')!
const analyzeButton = document.querySelector<HTMLButtonElement>('#analyze-button')!
const status = document.querySelector<HTMLElement>('#status')!
const mapEmpty = document.querySelector<HTMLElement>('#map-empty')!
const mapBadge = document.querySelector<HTMLElement>('#map-badge')!
const resultsSection = document.querySelector<HTMLElement>('#results')!
const resultsTitle = document.querySelector<HTMLElement>('#results-title')!
const resultsMeta = document.querySelector<HTMLElement>('#results-meta')!
const resultList = document.querySelector<HTMLElement>('#result-list')!
const copyButton = document.querySelector<HTMLButtonElement>('#copy-button')!
const csvButton = document.querySelector<HTMLButtonElement>('#csv-button')!
const mapDrawButton = document.querySelector<HTMLButtonElement>('#map-draw-button')!
const panelDrawButton = document.querySelector<HTMLButtonElement>('#panel-draw-button')!
const drawActions = document.querySelector<HTMLElement>('#draw-actions')!
const undoPointButton = document.querySelector<HTMLButtonElement>('#undo-point')!
const finishDrawingButton = document.querySelector<HTMLButtonElement>('#finish-drawing')!
const cancelDrawingButton = document.querySelector<HTMLButtonElement>('#cancel-drawing')!
const drawHint = document.querySelector<HTMLElement>('#draw-hint')!

const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([51.1, 10.3], 6)
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map)

let parsedKml: ParsedKml | null = null
let boundaryLayer: Layer | null = null
let addresses: AddressRecord[] = []
let summaries: StreetSummary[] = []
let streets: StreetDetails[] = []
let controller: AbortController | null = null
let isDrawing = false
let drawingPoints: LatLng[] = []
let draftShape: Layer | null = null
const draftVertices = L.layerGroup().addTo(map)

function setStatus(message: string, kind: 'default' | 'loading' | 'error' | 'success' = 'default'): void {
  status.className = `status ${kind}`
  status.textContent = message
}

function escapeHtml(value: string): string {
  const element = document.createElement('span')
  element.textContent = value
  return element.innerHTML
}

function renderBoundary(kml: ParsedKml): void {
  if (boundaryLayer) map.removeLayer(boundaryLayer)
  const latLngs: LatLngExpression[][][] = kml.polygons.map((polygon) => [
    polygon.outer.map(([longitude, latitude]) => [latitude, longitude] as LatLngExpression),
    ...polygon.holes.map((hole) => hole.map(([longitude, latitude]) => [latitude, longitude] as LatLngExpression)),
  ])

  boundaryLayer = L.polygon(latLngs, {
    color: '#153e34',
    weight: 3,
    fillColor: '#d7f26f',
    fillOpacity: 0.28,
  }).addTo(map)

  map.fitBounds((boundaryLayer as L.Polygon).getBounds(), { padding: [34, 34], maxZoom: 17 })
  mapEmpty.classList.add('is-hidden')
  mapBadge.classList.remove('is-hidden')
  mapBadge.textContent = kml.polygons.length === 1 ? '1 Gebietsfläche' : `${kml.polygons.length} Gebietsflächen`
}

function activateArea(kml: ParsedKml, displayName: string): void {
  parsedKml = kml
  addresses = []
  streets = []
  summaries = []
  resultsSection.classList.add('is-hidden')
  fileName.textContent = displayName
  fileIcon.textContent = displayName.toLocaleLowerCase('en').endsWith('.csv') ? 'CSV' : 'KML'
  const approximateKm2 = polygonAreaApprox(kml.polygons) * 7_800
  const territoryMeta = kml.territory?.id ? ` · ID ${kml.territory.id}` : ''
  fileMeta.textContent = `${kml.polygons.length} ${kml.polygons.length === 1 ? 'Fläche' : 'Flächen'} · ca. ${approximateKm2 < 1 ? approximateKm2.toFixed(2) : approximateKm2.toFixed(1)} km²${territoryMeta}`
  dropZone.classList.add('is-hidden')
  drawOption.classList.add('is-hidden')
  fileCard.classList.remove('is-hidden')
  analyzeButton.disabled = false
  setStatus('Gebiet erkannt. Bereit für den OSM-Abgleich.', 'success')
  renderBoundary(kml)
}

function clearDraft(): void {
  if (draftShape) map.removeLayer(draftShape)
  draftShape = null
  draftVertices.clearLayers()
  drawingPoints = []
}

function leaveDrawingMode(): void {
  isDrawing = false
  clearDraft()
  map.getContainer().classList.remove('is-drawing')
  mapDrawButton.classList.remove('is-hidden')
  drawActions.classList.add('is-hidden')
  drawHint.classList.add('is-hidden')
}

function clearArea(resetView = true): void {
  controller?.abort()
  leaveDrawingMode()
  parsedKml = null
  addresses = []
  streets = []
  summaries = []
  fileInput.value = ''
  fileCard.classList.add('is-hidden')
  dropZone.classList.remove('is-hidden')
  drawOption.classList.remove('is-hidden')
  resultsSection.classList.add('is-hidden')
  analyzeButton.disabled = true
  setStatus('KML- oder CSV-Datei auswählen oder ein Gebiet direkt auf der Karte zeichnen.')
  if (boundaryLayer) map.removeLayer(boundaryLayer)
  boundaryLayer = null
  if (resetView) map.setView([51.1, 10.3], 6)
  mapEmpty.classList.remove('is-hidden')
  mapBadge.classList.add('is-hidden')
}

async function loadFile(file: File): Promise<void> {
  if (file.size > 10 * 1024 * 1024) {
    setStatus('Die Datei ist größer als 10 MB.', 'error')
    return
  }

  try {
    const source = await file.text()
    const fallbackName = file.name.replace(/\.(?:kml|csv)$/i, '')
    const area = file.name.toLocaleLowerCase('en').endsWith('.csv')
      ? parseBoundaryCsv(source, fallbackName)
      : parseKml(source, fallbackName)
    activateArea(area, file.name)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Die Gebietsdatei konnte nicht gelesen werden.', 'error')
  }
}

function renderDraft(): void {
  if (draftShape) map.removeLayer(draftShape)
  draftShape = null
  draftVertices.clearLayers()

  for (const point of drawingPoints) {
    L.circleMarker(point, {
      radius: 5,
      color: '#173f34',
      weight: 2,
      fillColor: '#d9f26f',
      fillOpacity: 1,
    }).addTo(draftVertices)
  }

  if (drawingPoints.length === 2) {
    draftShape = L.polyline(drawingPoints, { color: '#f27a3f', weight: 3, dashArray: '7 7' }).addTo(map)
  } else if (drawingPoints.length >= 3) {
    draftShape = L.polygon(drawingPoints, {
      color: '#f27a3f',
      weight: 3,
      dashArray: '7 7',
      fillColor: '#d9f26f',
      fillOpacity: 0.25,
    }).addTo(map)
  }

  undoPointButton.disabled = drawingPoints.length === 0
  finishDrawingButton.disabled = drawingPoints.length < 3
  drawHint.textContent = drawingPoints.length === 0
    ? 'Klicke den ersten Außenpunkt an.'
    : drawingPoints.length < 3
      ? `${drawingPoints.length} ${drawingPoints.length === 1 ? 'Punkt' : 'Punkte'} gesetzt · mindestens 3 erforderlich`
      : `${drawingPoints.length} Punkte gesetzt · weitere setzen oder Fläche schließen`
}

function startDrawing(): void {
  clearArea(false)
  isDrawing = true
  mapEmpty.classList.add('is-hidden')
  map.getContainer().classList.add('is-drawing')
  mapDrawButton.classList.add('is-hidden')
  drawActions.classList.remove('is-hidden')
  drawHint.classList.remove('is-hidden')
  setStatus('Setze mindestens drei Außenpunkte auf der Karte und schließe dann die Fläche.', 'loading')
  renderDraft()
}

function finishDrawing(): void {
  if (drawingPoints.length < 3) return
  const kml: ParsedKml = {
    name: 'Gezeichnetes Gebiet',
    polygons: [{
      outer: drawingPoints.map((point) => [point.lng, point.lat]),
      holes: [],
    }],
  }
  leaveDrawingMode()
  activateArea(kml, 'Gezeichnetes-Gebiet.kml')
}

function cancelDrawing(): void {
  clearArea(false)
}

function downloadKml(): void {
  if (!parsedKml) return
  const url = URL.createObjectURL(new Blob([createKml(parsedKml)], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${parsedKml.name.replace(/[^a-z0-9äöüß_-]+/gi, '-') || 'gebiet'}.kml`
  link.click()
  URL.revokeObjectURL(url)
}

function renderResults(): void {
  resultsTitle.textContent = parsedKml?.name || 'Straßen im Gebiet'
  resultsMeta.textContent = `${summaries.length} ${summaries.length === 1 ? 'Straße' : 'Straßen'} · ${addresses.length} eindeutige ${addresses.length === 1 ? 'Hausnummer' : 'Hausnummern'}`

  if (summaries.length === 0) {
    resultList.innerHTML = `<div class="empty-result"><strong>Keine benannten Straßen gefunden</strong><span>Für dieses Gebiet sind in OpenStreetMap keine benannten Straßen erfasst.</span></div>`
  } else {
    resultList.innerHTML = summaries.map((summary, index) => `
      <article class="street-row">
        <span class="row-number">${String(index + 1).padStart(2, '0')}</span>
        <div class="street-content">
          <div class="street-heading">
            <h3>${escapeHtml(summary.street)}</h3>
            <span class="address-count">${summary.addressCount}<small>Nr.</small></span>
          </div>
          <div class="ranges${summary.ranges.length === 0 ? ' no-addresses' : ''}">${summary.ranges.length > 0
            ? summary.ranges.map((range) => `<span>${escapeHtml(range.label)}${range.parity ? `<small>${range.parity}</small>` : ''}</span>`).join('')
            : '<span>Keine Hausnummern in OSM</span>'}</div>
        </div>
      </article>
    `).join('')
  }

  resultsSection.classList.remove('is-hidden')
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function normalizeStreetName(value: string): string {
  return value.normalize('NFKD').replaceAll('ß', 'ss').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de')
}

function includeStreetsWithoutAddresses(addressSummaries: StreetSummary[], details: StreetDetails[]): StreetSummary[] {
  const byName = new Map(addressSummaries.map((summary) => [normalizeStreetName(summary.street), summary]))
  for (const street of details) {
    const key = normalizeStreetName(street.street)
    if (!byName.has(key)) {
      byName.set(key, {
        ...street,
        addressCount: 0,
        ranges: [],
        text: `${street.street} (keine Hausnummern in OSM)`,
      })
    } else {
      const summary = byName.get(key)!
      summary.suburb ||= street.suburb
      summary.postalCode ||= street.postalCode
      summary.state ||= street.state
    }
  }
  return [...byName.values()].sort((left, right) => left.street.localeCompare(right.street, 'de', { sensitivity: 'base' }))
}

async function analyze(): Promise<void> {
  if (!parsedKml) return
  controller?.abort()
  controller = new AbortController()
  analyzeButton.disabled = true
  analyzeButton.classList.add('is-loading')
  analyzeButton.querySelector('.button-label')!.textContent = 'OSM-Daten werden geladen …'
  setStatus('Adressen werden bei OpenStreetMap abgefragt. Das kann bis zu einer Minute dauern.', 'loading')

  try {
    const areaData = await fetchAreaData(parsedKml, controller.signal)
    addresses = areaData.addresses
    streets = areaData.streets
    summaries = includeStreetsWithoutAddresses(summarizeAddresses(addresses), streets)
    setStatus(`${summaries.length} Straßen erfolgreich zusammengefasst.`, 'success')
    renderResults()
  } catch (error) {
    if (!controller.signal.aborted) {
      setStatus(error instanceof Error ? error.message : 'Die Abfrage ist fehlgeschlagen.', 'error')
    }
  } finally {
    analyzeButton.disabled = false
    analyzeButton.classList.remove('is-loading')
    analyzeButton.querySelector('.button-label')!.textContent = 'Straßenliste neu erstellen'
  }
}

function plainText(): string {
  return summaries.map((summary) => summary.text).join('\n')
}

async function copyResults(): Promise<void> {
  await navigator.clipboard.writeText(plainText())
  const original = copyButton.textContent
  copyButton.textContent = 'Kopiert ✓'
  window.setTimeout(() => { copyButton.textContent = original }, 1800)
}

function downloadCsv(): void {
  const csv = createNwPublisherCsv(summaries, parsedKml?.territory)
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${(parsedKml?.name || 'strassenliste').replace(/[^a-z0-9äöüß_-]+/gi, '-')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void loadFile(file)
})

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    dropZone.classList.add('is-dragging')
  })
}

for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    dropZone.classList.remove('is-dragging')
  })
}

dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files[0]
  if (file) void loadFile(file)
})

map.on('click', (event: LeafletMouseEvent) => {
  if (!isDrawing) return
  drawingPoints.push(event.latlng)
  renderDraft()
})

mapDrawButton.addEventListener('click', startDrawing)
panelDrawButton.addEventListener('click', startDrawing)
undoPointButton.addEventListener('click', () => {
  drawingPoints.pop()
  renderDraft()
})
finishDrawingButton.addEventListener('click', finishDrawing)
cancelDrawingButton.addEventListener('click', cancelDrawing)
downloadKmlButton.addEventListener('click', downloadKml)
removeFile.addEventListener('click', () => clearArea())
analyzeButton.addEventListener('click', () => void analyze())
copyButton.addEventListener('click', () => void copyResults())
csvButton.addEventListener('click', downloadCsv)
