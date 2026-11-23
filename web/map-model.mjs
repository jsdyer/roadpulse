// Geometry stays in source longitude/latitude order until the Leaflet adapter.
// Reject a malformed geometry as a whole: dropping bad vertices would invent a road segment.
export const MERCATOR_MAX_LAT = 85.05112878;
export function validPosition(point) {
  return Array.isArray(point) && point.length >= 2 && point.slice(0, 2).every(Number.isFinite)
    && point[0] >= -180 && point[0] <= 180 && Math.abs(point[1]) <= MERCATOR_MAX_LAT;
}
export function eventGeometry(event) {
  const g = event?.geography;
  if (!g || typeof g !== 'object') return null;
  if (g.type === 'Point' && validPosition(g.coordinates)) {
    return {type: 'Point', coordinates: g.coordinates.slice(0, 2)};
  }
  if (g.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2
      && g.coordinates.length <= 100000 && g.coordinates.every(validPosition)) {
    return {type: 'LineString', coordinates: g.coordinates.map(p => p.slice(0, 2))};
  }
  return null;
}
export function mapRecords(rows) {
  const features = [], omitted = [];
  for (const row of rows) {
    const geometry = eventGeometry(row.event);
    if (!geometry) { omitted.push(row.event.id); continue; }
    features.push({type: 'Feature', id: row.event.id, properties: {id: row.event.id, change: row.change, severity: row.event.severity ?? 'UNKNOWN'}, geometry});
  }
  return {features, omitted, count: features.length};
}
export function featureBounds(features) {
  if (!features.length) return null;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const feature of features) {
    const points = feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const [lon, lat] of points) { west = Math.min(west, lon); east = Math.max(east, lon); south = Math.min(south, lat); north = Math.max(north, lat); }
  }
  return [[south, west], [north, east]];
}
export function eventMapStyle(row, selected = false) {
  const absent = row.change === 'absent';
  const color = absent ? '#66716b' : row.event.severity === 'MAJOR' ? '#a63c21'
    : row.event.severity === 'MODERATE' ? '#93630b' : '#315e48';
  return {color: selected ? '#142f55' : color, fillColor: color, weight: selected ? 7 : 4,
    opacity: absent ? .7 : .9, fillOpacity: selected ? 1 : .8, radius: selected ? 10 : 7,
    dashArray: absent ? '6 5' : undefined};
}
export const DEFAULT_MAP = Object.freeze({
  enabled: true,
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attributionText: '© OpenStreetMap contributors',
  attributionUrl: 'https://www.openstreetmap.org/copyright',
  maxZoom: 18,
  fitMaxZoom: 12,
  initialCenter: [54, -125],
  initialZoom: 5
});
export function mapSettings(input = {}) {
  const settings = {...DEFAULT_MAP, ...input};
  if (typeof settings.enabled !== 'boolean') throw Error('Map enabled must be true or false.');
  if (typeof settings.tileUrl !== 'string') throw Error('Map tileUrl must be an HTTPS template or an empty string.');
  if (settings.tileUrl) {
    if (!['{z}', '{x}', '{y}'].every(token => settings.tileUrl.includes(token))) throw Error('Tile URL must contain {z}, {x} and {y}.');
    const url = new URL(settings.tileUrl.replaceAll('{z}', '5').replaceAll('{x}', '1').replaceAll('{y}', '1'));
    if (url.protocol !== 'https:' || url.username || url.password) throw Error('Map tiles require HTTPS without embedded credentials.');
    // OSM's community server requires this exact URL, not rotating subdomains.
    if (url.hostname.endsWith('tile.openstreetmap.org') && settings.tileUrl !== DEFAULT_MAP.tileUrl) throw Error('Use the documented OpenStreetMap tile URL.');
    const attribution = new URL(settings.attributionUrl);
    if (attribution.protocol !== 'https:' || typeof settings.attributionText !== 'string' || !settings.attributionText.trim()) throw Error('A visible HTTPS map attribution is required.');
  }
  for (const key of ['maxZoom', 'fitMaxZoom', 'initialZoom']) {
    if (!Number.isInteger(settings[key]) || settings[key] < 1 || settings[key] > 19) throw Error(`Invalid map ${key}.`);
  }
  if (settings.fitMaxZoom > settings.maxZoom) settings.fitMaxZoom = settings.maxZoom;
  if (!Array.isArray(settings.initialCenter) || !validPosition([settings.initialCenter[1], settings.initialCenter[0]])) throw Error('Map initialCenter must be latitude, longitude.');
  return settings;
}
