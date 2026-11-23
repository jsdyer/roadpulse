import {mapRecords, featureBounds, eventMapStyle, mapSettings} from './map-model.mjs';
import {label, words} from './model.mjs';
const make = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
let leafletPromise;
function leaflet() {
  if (window.L?.version === '1.9.4') return Promise.resolve(window.L);
  if (!leafletPromise) leafletPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./vendor/leaflet/leaflet.js', import.meta.url).href;
    script.onload = () => window.L?.version === '1.9.4' ? resolve(window.L) : reject(Error('Map library could not be initialized.'));
    script.onerror = () => reject(Error('Map library could not be loaded.'));
    document.head.append(script);
  });
  return leafletPromise;
}
export function createRoadMap({container, status, tileStatus, fitButton, selectedButton, toggleButton, body, attribution, onSelect, onDetails}) {
  let settings, configSignature, map, group, tiles, L, currentRows = [], features = [], selectedId = null;
  let layers = new Map(), showing = true, visible = false, loaded = false, failed = false, initializing = false;
  let pendingFit = true, pendingFocus = false, tileErrors = 0, tileSuccess = 0, hasUpdated = false, fitTimer;

  function showTileStatus(text) { tileStatus.textContent = text; tileStatus.hidden = !text; }
  function setAttribution() {
    attribution.replaceChildren();
    if (!settings?.tileUrl) { attribution.textContent = 'Road geometry: DriveBC · no basemap configured'; return; }
    const a = make('a', settings.attributionText); a.href = settings.attributionUrl; a.target = '_blank'; a.rel = 'noopener';
    attribution.append(a, make('span', ' · Road geometry: DriveBC · '));
    const report = make('a', 'Report a map issue ↗'); report.href = 'https://www.openstreetmap.org/fixthemap'; report.target = '_blank'; report.rel = 'noopener'; attribution.append(report);
  }
  function active() { return visible && showing && !document.hidden && settings?.enabled && !failed; }
  function stopTiles() { if (map && tiles && map.hasLayer(tiles)) map.removeLayer(tiles); }
  function startTiles() {
    if (!active() || !map || !settings.tileUrl) return;
    if (!tiles) {
      tiles = L.tileLayer(settings.tileUrl, {
        minZoom: 2, maxZoom: settings.maxZoom, noWrap: true,
        // Only the current view: no offscreen tile buffer, retina duplication or prefetch.
        keepBuffer: 0, updateWhenIdle: true, updateWhenZooming: false, detectRetina: false,
        referrerPolicy: 'strict-origin-when-cross-origin'
      });
      tiles.on('tileerror', () => {
        tileErrors++;
        showTileStatus('Some background tiles could not load. Road geometry and dated receipts remain available; try a different view or return later.');
      });
      tiles.on('tileload', () => { tileSuccess++; });
      tiles.on('loading', () => { tileErrors = 0; tileSuccess = 0; });
      tiles.on('load', () => { if (!tileErrors && tileSuccess) showTileStatus(''); });
    }
    if (!map.hasLayer(tiles)) tiles.addTo(map);
  }
  function syncVisibility() {
    if (!active()) { stopTiles(); return; }
    if (!map) { initialize(); return; }
    map.invalidateSize({pan: false});
    if (pendingFit) fitResults();
    if (pendingFocus) focusSelected();
    startTiles();
  }
  async function initialize() {
    if (initializing || failed || !active()) return;
    initializing = true;
    try {
      L = await leaflet();
      if (!active()) return;
      map = L.map(container, {
        center: settings.initialCenter, zoom: settings.initialZoom,
        minZoom: 2, maxZoom: settings.maxZoom, scrollWheelZoom: false,
        zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false,
        attributionControl: false, keyboard: true
      });
      L.control.scale({imperial: false, position: 'bottomleft'}).addTo(map);
      group = L.featureGroup().addTo(map);
      loaded = true;
      container.dataset.ready = 'true';
      renderGeometry();
      syncVisibility();
    } catch (error) {
      failed = true;
      status.textContent = `${error.message} Use the synchronized event list below.`;
      container.dataset.ready = 'failed';
      fitButton.disabled = true; selectedButton.disabled = true;
    } finally { initializing = false; }
  }
  function focusSelected() {
    pendingFocus = false;
    const layer = layers.get(selectedId);
    if (!map || !layer || !active()) return;
    const bounds = featureBounds(features.filter(f => f.id === selectedId));
    if (bounds) map.fitBounds(bounds, {padding: [55, 55], maxZoom: settings.fitMaxZoom, animate: false});
    layer.openPopup();
  }
  function fitResults() {
    pendingFit = false;
    if (!map || !active()) { pendingFit = true; return; }
    map.closePopup();
    const bounds = featureBounds(features);
    if (bounds) map.fitBounds(bounds, {padding: [35, 35], maxZoom: settings.fitMaxZoom, animate: false});
    else map.setView(settings.initialCenter, settings.initialZoom, {animate: false});
  }
  function popup(row) {
    const wrap = make('div', undefined, 'road-popup');
    wrap.append(make('strong', label(row.event)), make('p', `${words(row.event.severity ?? 'UNKNOWN')} · ${words(row.event.event_type)}`));
    if (row.change === 'absent') wrap.append(make('p', 'Last known geometry. Absent from this capture; reopening unconfirmed.', 'map-absent-note'));
    const description = String(row.event.description ?? '');
    wrap.append(make('p', description.length > 220 ? description.slice(0, 217) + '…' : description));
    const button = make('button', 'Read full receipt ↓'); button.type = 'button';
    button.addEventListener('click', () => { onSelect(row.event.id); onDetails(); });
    wrap.append(button); return wrap;
  }
  function renderGeometry() {
    if (!loaded) return;
    group.clearLayers(); layers = new Map();
    const byId = new Map(currentRows.map(row => [row.event.id, row]));
    for (const feature of features) {
      const row = byId.get(feature.id);
      const style = eventMapStyle(row, feature.id === selectedId);
      const layer = feature.geometry.type === 'Point'
        ? L.circleMarker([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], style)
        : L.polyline(feature.geometry.coordinates.map(p => [p[1], p[0]]), style);
      layer.bindPopup(popup(row), {maxWidth: 320, autoPan: false});
      const tooltip = make('span', `${label(row.event)} · ${words(row.event.severity ?? 'UNKNOWN')}`);
      layer.bindTooltip(tooltip, {sticky: true, direction: 'top'});
      layer.on('click', () => { onSelect(feature.id); });
      layer.addTo(group); layers.set(feature.id, layer);
      // The complete event list provides a keyboard equivalent for every feature.
      const path = layer.getElement();
      if (path) { path.dataset.mapEvent = feature.id; path.dataset.geometry = feature.geometry.type; }
    }
    highlight();
  }
  function highlight() {
    for (const row of currentRows) {
      const layer = layers.get(row.event.id); if (!layer) continue;
      const selected = row.event.id === selectedId;
      layer.setStyle(eventMapStyle(row, selected));
      if (layer.setRadius) layer.setRadius(selected ? 10 : 7);
      const path = layer.getElement(); if (path) path.dataset.selected = String(selected);
      if (selected) layer.bringToFront();
    }
  }
  fitButton.addEventListener('click', () => { pendingFit = true; syncVisibility(); });
  selectedButton.addEventListener('click', () => { pendingFocus = true; syncVisibility(); });
  toggleButton.addEventListener('click', () => {
    showing = !showing; body.hidden = !showing;
    toggleButton.textContent = showing ? 'Hide map' : 'Show map';
    toggleButton.setAttribute('aria-expanded', String(showing));
    syncVisibility();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; syncVisibility(); }, {threshold: .01}).observe(container);
  } else {
    const check = () => { const rect = container.getBoundingClientRect(); visible = rect.bottom > 0 && rect.top < innerHeight && rect.width > 0 && rect.height > 0; syncVisibility(); };
    window.addEventListener('scroll', check, {passive: true}); window.addEventListener('resize', check, {passive: true}); check();
  }
  document.addEventListener('visibilitychange', syncVisibility);
  return {
    update(rows, selected, config) {
      try {
        const next = mapSettings(config);
        const signature = JSON.stringify(next);
        if (configSignature !== signature) {
          stopTiles(); tiles = null; settings = next; configSignature = signature; setAttribution();
          if (map) map.setMaxZoom(settings.maxZoom);
        }
      } catch (error) { failed = true; stopTiles(); status.textContent = `${error.message} The event list remains available.`; return; }
      currentRows = rows; selectedId = selected;
      const projection = mapRecords(rows); features = projection.features;
      container.dataset.eventCount = String(features.length);
      container.dataset.omittedCount = String(projection.omitted.length);
      const first = !hasUpdated; hasUpdated = true;
      if (!settings.enabled) { body.hidden = true; toggleButton.disabled = true; status.textContent = 'Map disabled in configuration. All records remain in the list.'; stopTiles(); return; }
      status.textContent = features.length
        ? `${features.length.toLocaleString()} of ${rows.length.toLocaleString()} filtered events mapped${projection.omitted.length ? ` · ${projection.omitted.length} without usable geometry stay in the list` : ''}.`
        : rows.length ? 'These filtered events have no usable map geometry. Their receipts remain in the list.' : 'No events match these filters. Try another road or clear filters.';
      fitButton.disabled = !features.length || failed;
      selectedButton.disabled = !features.some(f => f.id === selectedId) || failed;
      if (!settings.tileUrl) showTileStatus('No basemap configured. Source road geometry remains interactive.');
      pendingFit = true;
      renderGeometry();
      clearTimeout(fitTimer);
      if (first) syncVisibility();
      else if (active()) fitTimer = setTimeout(syncVisibility, 180);
    },
    select(id, {focus = false} = {}) {
      selectedId = id; selectedButton.disabled = !features.some(f => f.id === id) || failed;
      highlight();
      if (focus) { pendingFocus = true; syncVisibility(); }
    },
    reveal(id) {
      if (!showing) toggleButton.click();
      if (id) { selectedId = id; pendingFocus = true; highlight(); }
      container.scrollIntoView({behavior: 'smooth', block: 'center'});
      container.focus({preventScroll: true}); syncVisibility();
    }
  };
}
