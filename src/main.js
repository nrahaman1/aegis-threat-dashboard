/**
 * AEGIS — US Agriculture Early Warning System
 * Main Application Entry Point
 * 
 * Uses MapboxOverlay from @deck.gl/mapbox to render deck.gl layers
 * INSIDE MapLibre's rendering pipeline (layers follow pan/zoom).
 * Adapted from worldmonitor's DeckGLMap.ts pattern.
 */

import { MapboxOverlay } from '@deck.gl/mapbox';
import maplibregl from 'maplibre-gl';

// Layer imports
import { fetchClimateData, createClimateLayer, getClimateTooltip, getClimateThreats } from './layers/climate-stress.js';
import { fetchWTOData, createWTOLayer, getWTOTooltip, getWTOThreats } from './layers/wto-sps-barriers.js';
import { fetchFoodSecurityData, createFoodSecurityLayer, getFoodSecurityTooltip, getFoodSecurityThreats } from './layers/food-security-news.js';
import { fetchShippingData, createShippingLayers, getShippingTooltip, getShippingThreats } from './layers/ais-shipping.js';
import { fetchHungerMapData, createHungerMapLayer, getHungerMapTooltip, getHungerMapThreats } from './layers/wfp-hungermap.js';

// ========================================================================
// State
// ========================================================================

const state = {
    map: null,
    deckOverlay: null,
    layerVisibility: {
        climate: true,
        wto: true,
        foodsec: true,
        hungermap: true,
        shipping: true,
    },
    data: {
        climate: null,
        wto: null,
        foodsec: null,
        hungermap: null,
        shipping: null,
    },
    alerts: [],
    expandedAlert: null,
};

// ========================================================================
// Basemap Definitions (all free, no API key required)
// ========================================================================

const BASEMAPS = {
    dark: {
        tiles: [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        ],
        attribution: '&copy; <a href="https://carto.com">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    light: {
        tiles: [
            'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        ],
        attribution: '&copy; <a href="https://carto.com">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    satellite: {
        tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        attribution: '&copy; <a href="https://www.esri.com">Esri</a> &mdash; Sources: Esri, Maxar, Earthstar Geographics',
    },
    terrain: {
        tiles: [
            'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}@2x.png',
        ],
        attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://stamen.com">Stamen Design</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
};

function buildMapStyle(basemapKey) {
    const bm = BASEMAPS[basemapKey] || BASEMAPS.dark;
    return {
        version: 8,
        sources: {
            'basemap': {
                type: 'raster',
                tiles: bm.tiles,
                tileSize: 256,
                attribution: bm.attribution,
            },
        },
        layers: [{
            id: 'basemap-layer',
            type: 'raster',
            source: 'basemap',
            minzoom: 0,
            maxzoom: 19,
        }],
    };
}

// ========================================================================
// Map Initialization — MapboxOverlay pattern from worldmonitor
// ========================================================================

function initMap() {
    const map = new maplibregl.Map({
        container: 'map-container',
        style: buildMapStyle('dark'),
        center: [0, 20],
        zoom: 2.2,
        minZoom: 1.5,
        maxZoom: 16,
        attributionControl: true,
        renderWorldCopies: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    state.map = map;
    return map;
}

function changeBasemap(basemapKey) {
    if (!state.map) return;
    state.map.setStyle(buildMapStyle(basemapKey));
    // Re-attach deck.gl overlay after style change (MapLibre removes controls on setStyle)
    state.map.once('style.load', () => {
        if (state.deckOverlay) {
            state.map.removeControl(state.deckOverlay);
        }
        initDeckOverlay();
    });
}

/**
 * Initialize the deck.gl MapboxOverlay and attach it as a MapLibre control.
 * This is the KEY pattern from worldmonitor — layers render inside MapLibre's
 * WebGL pipeline, so they automatically follow pan/zoom/pitch.
 */
function initDeckOverlay() {
    const overlay = new MapboxOverlay({
        interleaved: true,
        layers: buildLayers(),
        getTooltip: handleTooltip,
        onClick: handleLayerClick,
        pickingRadius: 12,
    });

    state.map.addControl(overlay);
    state.deckOverlay = overlay;
}

// ========================================================================
// Layer Building
// ========================================================================

function buildLayers() {
    const layers = [];

    // Climate Stress (◆ diamond markers)
    const climateLayers = createClimateLayer(state.data.climate, state.layerVisibility.climate);
    if (climateLayers) layers.push(...(Array.isArray(climateLayers) ? climateLayers : [climateLayers]));

    // WFP HungerMap (■ square markers)
    const hungerMapLayers = createHungerMapLayer(state.data.hungermap, state.layerVisibility.hungermap);
    if (hungerMapLayers) layers.push(...(Array.isArray(hungerMapLayers) ? hungerMapLayers : [hungerMapLayers]));

    // WTO SPS Barriers
    const wtoLayers = createWTOLayer(state.data.wto, state.layerVisibility.wto);
    if (wtoLayers) layers.push(...wtoLayers);

    // Food Security News
    const foodSecLayers = createFoodSecurityLayer(state.data.foodsec, state.layerVisibility.foodsec);
    if (foodSecLayers) layers.push(...foodSecLayers);

    // AIS Shipping (arcs on top)
    const shippingLayers = createShippingLayers(state.data.shipping, state.layerVisibility.shipping);
    if (shippingLayers) layers.push(...shippingLayers);

    return layers;
}

function updateLayers() {
    if (state.deckOverlay) {
        state.deckOverlay.setProps({ layers: buildLayers() });
    }
}

// ========================================================================
// Tooltip Handler
// ========================================================================

function handleTooltip(info) {
    if (!info.object) return null;

    const layerId = info.layer?.id || '';
    let html = null;

    if (layerId.startsWith('climate')) html = getClimateTooltip(info);
    else if (layerId.startsWith('wto')) html = getWTOTooltip(info);
    else if (layerId.startsWith('food-security')) html = getFoodSecurityTooltip(info);
    else if (layerId.startsWith('hungermap')) html = getHungerMapTooltip(info);
    else if (layerId.startsWith('shipping')) html = getShippingTooltip(info);

    if (!html) return null;

    return {
        html,
        style: {
            background: 'rgba(10, 14, 23, 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(0, 240, 255, 0.2)',
            borderRadius: '10px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6), 0 0 20px rgba(0,240,255,0.08)',
            padding: '12px 16px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '12px',
            color: '#e2e8f0',
            maxWidth: '340px',
        },
    };
}

// ========================================================================
// Click Handler for map layers
// ========================================================================

function handleLayerClick(info) {
    if (!info.object) return;
    const d = info.object;
    const layerId = info.layer?.id || '';

    // Fly to clicked item
    if (d.lat && d.lon) {
        state.map?.flyTo({
            center: [d.lon, d.lat],
            zoom: Math.max(state.map.getZoom(), 4),
            duration: 800,
        });
    } else if (d.sourceLon && d.sourceLat) {
        state.map?.flyTo({
            center: [(d.sourceLon + d.targetLon) / 2, (d.sourceLat + d.targetLat) / 2],
            zoom: 3,
            duration: 800,
        });
    }

    // Show detail popup in sidebar
    showDetailPopup(d, layerId);
}

function showDetailPopup(d, layerId) {
    const container = document.getElementById('detail-popup');
    if (!container) return;

    let html = '';
    if (layerId.startsWith('climate')) {
        html = `
      <div class="detail-header" style="border-color: var(--climate-color)">
        <h3>🌡️ ${d.name}</h3>
        <span class="detail-close" onclick="this.closest('.detail-popup').classList.add('hidden')">✕</span>
      </div>
      <div class="detail-body">
        <div class="detail-row"><span>Region</span><strong>${d.region}</strong></div>
        <div class="detail-row"><span>Crops</span><strong>${d.crops}</strong></div>
        <div class="detail-row"><span>Temp Anomaly</span><strong style="color:${d.tempDelta > 0 ? '#ef4444' : '#3b82f6'}">${d.tempDelta > 0 ? '+' : ''}${d.tempDelta}°C</strong></div>
        <div class="detail-row"><span>Precip Anomaly</span><strong style="color:${d.precipDelta > 0 ? '#3b82f6' : '#f97316'}">${d.precipDelta > 0 ? '+' : ''}${d.precipDelta} mm</strong></div>
        <div class="detail-row"><span>Classification</span><strong>${d.type}</strong></div>
        <div class="detail-row"><span>Severity</span><strong>${d.severity}</strong></div>
        <div class="detail-row"><span>Period</span><strong>${d.period}</strong></div>
        <p class="detail-source">Source: Open-Meteo ERA5 Reanalysis</p>
      </div>`;
    } else if (layerId.startsWith('wto')) {
        html = `
      <div class="detail-header" style="border-color: var(--wto-color)">
        <h3>🛃 ${d.country} — SPS Barrier</h3>
        <span class="detail-close" onclick="this.closest('.detail-popup').classList.add('hidden')">✕</span>
      </div>
      <div class="detail-body">
        <div class="detail-row"><span>Urgency</span><strong>${(d.urgency || '').toUpperCase()}</strong></div>
        <p style="margin:8px 0;font-size:12px;color:#e2e8f0">${d.title}</p>
        ${d.description ? `<p style="font-size:11px;color:#94a3b8">${d.description}</p>` : ''}
        <p class="detail-source">Source: WTO ePing / SPS Notifications</p>
      </div>`;
    } else if (layerId.startsWith('food-security')) {
        html = `
      <div class="detail-header" style="border-color: var(--foodsec-color)">
        <h3>🦠 ${d.country} — ${(d.category || '').replace('_', ' ')}</h3>
        <span class="detail-close" onclick="this.closest('.detail-popup').classList.add('hidden')">✕</span>
      </div>
      <div class="detail-body">
        <div class="detail-row"><span>Severity</span><strong>${(d.severity || '').toUpperCase()}</strong></div>
        <p style="margin:8px 0;font-size:12px;color:#e2e8f0">${d.title}</p>
        ${d.description ? `<p style="font-size:11px;color:#94a3b8">${d.description}</p>` : ''}
        <p class="detail-source">Source: ${d.feedSource || 'Global RSS Feeds'}</p>
      </div>`;
    } else if (layerId.startsWith('hungermap')) {
        const props = d.properties || d; // Handle both GeoJSON features and direct objects
        html = `
      <div class="detail-header" style="border-color: var(--hungermap-color)">
        <h3>🌾 ${props.countryName}</h3>
        <span class="detail-close" onclick="this.closest('.detail-popup').classList.add('hidden')">✕</span>
      </div>
      <div class="detail-body">
        <div class="detail-row"><span>Severity Score</span><strong style="color: ${(props.severity > 0.6) ? '#ef4444' : (props.severity > 0.3 ? '#f97316' : '#fbbf24')}">${(props.severity * 10).toFixed(1)} / 10</strong></div>
        <div class="detail-row"><span>Food Consump. (FCS)</span><strong>${(props.fcsPrevalence * 100).toFixed(1)}% Insufficient</strong></div>
        <div class="detail-row"><span>Coping Strat. (rCSI)</span><strong>${(props.rcsiPrevalence * 100).toFixed(1)}% Crisis Coping</strong></div>
        <div class="detail-row"><span>Affected People</span><strong>~${((props.fcsPeople + props.rcsiPeople) / 2 / 1000000).toFixed(1)}M</strong></div>
        <p class="detail-source">Source: WFP HungerMap LIVE</p>
      </div>`;
    } else if (layerId.startsWith('shipping')) {
        if (d.sourceCountry) {
            html = `
        <div class="detail-header" style="border-color: ${d.isFlagged ? '#ef4444' : 'var(--shipping-color)'}">
          <h3>🚢 ${d.sourceCountry} → ${d.targetName}</h3>
          <span class="detail-close" onclick="this.closest('.detail-popup').classList.add('hidden')">✕</span>
        </div>
        <div class="detail-body">
          ${d.isFlagged ? '<div class="detail-flag">⚠ FLAGGED ORIGIN — Enhanced monitoring</div>' : ''}
          <div class="detail-row"><span>Cargo Type</span><strong>${d.cargoType}</strong></div>
          <div class="detail-row"><span>Risk Level</span><strong>${(d.riskLevel || '').toUpperCase()}</strong></div>
          <div class="detail-row"><span>Est. Arrival</span><strong>${d.estimatedArrival}</strong></div>
          <p class="detail-source">Source: AIS Maritime Intelligence</p>
        </div>`;
        }
    }

    if (html) {
        container.innerHTML = html;
        container.classList.remove('hidden');
    }
}

// ========================================================================
// Data Fetching
// ========================================================================

async function loadAllData() {
    updateStatus('loading', 'Fetching data...');

    const fetchers = [
        { key: 'climate', fn: fetchClimateData, badge: 'climate-count' },
        { key: 'wto', fn: fetchWTOData, badge: 'wto-count' },
        { key: 'foodsec', fn: fetchFoodSecurityData, badge: 'foodsec-count' },
        { key: 'hungermap', fn: fetchHungerMapData, badge: 'hungermap-count' },
        { key: 'shipping', fn: fetchShippingData, badge: 'shipping-count' },
    ];

    const results = await Promise.allSettled(
        fetchers.map(async (f) => {
            try {
                const data = await f.fn();
                state.data[f.key] = data;
                const count = Array.isArray(data) ? data.length : (data?.routes?.length || 0);
                const badge = document.getElementById(f.badge);
                if (badge) badge.textContent = count;
                return { key: f.key, count };
            } catch (err) {
                console.error(`[${f.key}] fetch error:`, err);
                return { key: f.key, count: 0, error: err };
            }
        })
    );

    updateLayers();
    updateThreatSummary();
    updateAlertFeed();
    updateTicker();
    updateStatus('ok', 'All feeds connected');

    return results;
}

// ========================================================================
// UI Updates
// ========================================================================

function updateThreatSummary() {
    const container = document.getElementById('threat-cards');
    if (!container) return;

    const threats = {
        climate: getClimateThreats(state.data.climate),
        wto: getWTOThreats(state.data.wto),
        foodsec: getFoodSecurityThreats(state.data.foodsec),
        hungermap: getHungerMapThreats(state.data.hungermap),
        shipping: getShippingThreats(state.data.shipping),
    };

    // ── Ag Risk Index (0-100) ─────────────────────────────────────
    // Dynamically computed from ACTUAL data counts with realistic normalization.
    // Each sub-score is 0-25 (total 0-100). Weights are tuned so typical
    // global conditions yield a score in the 35-70 range; 80+ is genuinely alarming.

    // Climate sub-score (0-25): extreme counts are rare and significant
    const climateExtrCount = threats.climate.extreme || 0;
    const climateModCount = threats.climate.moderate || 0;
    const climateSub = Math.min(25, (climateExtrCount * 6) + (climateModCount * 1.5));

    // WTO sub-score (0-25): emergency bans are the key signal
    const wtoEmergencies = threats.wto.emergencies || 0;
    const wtoTotal = threats.wto.count || 0;
    const wtoSub = Math.min(25, (wtoEmergencies * 3) + Math.min(wtoTotal * 0.4, 6));

    // Food Security sub-score (0-25): normalize by expected global alert volume + WFP HungerMap metrics
    const fsCritical = threats.foodsec.critical || 0;
    const fsOutbreaks = threats.foodsec.outbreaks || 0;
    const fsTotal = threats.foodsec.count || 0;
    const hmCritical = threats.hungermap.critical || 0;
    const fsSub = Math.min(25, (fsCritical * 2) + (fsOutbreaks * 1) + (hmCritical * 0.5) + Math.min(fsTotal * 0.15, 3));

    // Shipping sub-score (0-25): use LOG scale for flagged count (thousands of vessels)
    const shipFlagged = threats.shipping.flaggedRoutes || 0;
    const shipHighRisk = threats.shipping.highRisk || 0;
    const shipFlaggedNorm = Math.min(12, Math.log2(Math.max(1, shipFlagged)) * 1.5);
    const shipSub = Math.min(25, shipFlaggedNorm + (shipHighRisk * 0.5));

    const globalScore = Math.round(climateSub + wtoSub + fsSub + shipSub);

    // Update Ag Risk Index badge
    const badge = document.getElementById('threat-level-badge');
    const scoreEl = document.getElementById('threat-score');
    if (scoreEl) scoreEl.textContent = globalScore;

    let globalLevel = 'low';
    if (globalScore >= 70) globalLevel = 'critical';
    else if (globalScore >= 45) globalLevel = 'high';
    else if (globalScore >= 25) globalLevel = 'moderate';

    if (badge) badge.className = `threat-badge threat-${globalLevel}`;

    // Render threat cards with legends (shapes match map markers)
    container.innerHTML = `
    ${renderThreatCard({
        icon: '🌡️', title: 'Climate Stress', level: threats.climate.level,
        mapShape: '◆',
        stat: `${threats.climate.count} zones monitored`,
        detail: `${threats.climate.extreme || 0} extreme • ${threats.climate.moderate || 0} moderate`,
        legends: [
            { color: '#ef4444', shape: 'diamond', label: 'Extreme (>5°C or >80mm)' },
            { color: '#fbbf24', shape: 'diamond', label: 'Moderate (>3°C or >40mm)' },
            { color: '#10b981', shape: 'diamond', label: 'Normal' },
        ],
        source: 'Open-Meteo ERA5 Reanalysis',
    })}
    ${renderThreatCard({
        icon: '🛃', title: 'WTO SPS Barriers', level: threats.wto.level,
        mapShape: '▲',
        stat: `${threats.wto.count} active notifications`,
        detail: `${threats.wto.emergencies || 0} emergency import bans`,
        legends: [
            { color: '#ef4444', shape: 'triangle', label: 'Emergency ban/suspension' },
            { color: '#fbbf24', shape: 'triangle', label: 'Urgent restriction' },
            { color: '#3b82f6', shape: 'triangle', label: 'Routine notification' },
        ],
        source: 'WTO ePing SPS/TBT',
    })}
    ${renderThreatCard({
        icon: '🦠', title: 'Food Security News', level: threats.foodsec.level,
        mapShape: '✚',
        stat: `${threats.foodsec.count} alerts tracked`,
        detail: `${threats.foodsec.critical || 0} critical • ${threats.foodsec.outbreaks || 0} outbreaks`,
        legends: [
            { color: '#dc2626', shape: 'cross', label: 'Critical (famine/epidemic)' },
            { color: '#ef4444', shape: 'cross', label: 'Disease outbreak' },
            { color: '#f97316', shape: 'cross', label: 'Food crisis' },
            { color: '#a855f7', shape: 'cross', label: 'Pest invasion' },
        ],
        source: 'FAO GIEWS • ReliefWeb • ProMED',
    })}
    ${renderThreatCard({
        icon: '🌾', title: 'WFP HungerMap', level: threats.hungermap.level,
        mapShape: '■',
        stat: `${threats.hungermap.count} nations monitored`,
        detail: `${threats.hungermap.critical || 0} severe famine risk areas`,
        legends: [
            { color: '#ef4444', shape: 'square', label: 'Severe Risk (>60% prevalence)' },
            { color: '#f97316', shape: 'square', label: 'High Risk (>30% prevalence)' },
            { color: '#fbbf24', shape: 'square', label: 'Moderate Risk' },
        ],
        source: 'WFP HungerMap LIVE',
    })}
    ${renderThreatCard({
        icon: '🚢', title: 'Shipping Threats', level: threats.shipping.level,
        mapShape: '⟿',
        stat: `${threats.shipping.count} routes + vessels monitored${threats.shipping.isLive ? ` (${threats.shipping.liveCount} LIVE)` : ''}`,
        detail: `${threats.shipping.flaggedRoutes || 0} flagged • ${threats.shipping.highRisk || 0} high-risk`,
        legends: [
            { color: '#ef4444', shape: 'arc', label: 'High-risk flagged vessel' },
            { color: '#f97316', shape: 'arc', label: 'Moderate-risk flagged' },
            { color: '#3bceac', shape: 'arc', label: 'Normal vessel' },
            { color: '#3bceac', shape: 'circle', label: 'US port' },
        ],
        source: threats.shipping.isLive ? 'AISStream.io LIVE • Lloyd\'s JWC' : 'Simulated Routes • Lloyd\'s JWC',
    })}
  `;
}

function getShapeSwatch(shape, color) {
    const shapeMap = {
        diamond: '◆',
        triangle: '▲',
        cross: '✚',
        square: '■',
        circle: '●',
        arc: '⟿',
    };
    const symbol = shapeMap[shape] || '●';
    return `<span class="legend-shape" style="color:${color}">${symbol}</span>`;
}

function renderThreatCard({ icon, title, level, mapShape, stat, detail, legends, source }) {
    const legendHtml = legends.map(l => `
    <div class="legend-item">
      ${getShapeSwatch(l.shape || 'circle', l.color)}
      <span class="legend-label">${l.label}</span>
    </div>
  `).join('');

    const shapeLabel = mapShape ? `<span class="threat-card-shape" title="Map marker shape">${mapShape}</span>` : '';

    return `
    <div class="threat-card">
      <div class="threat-card-header">
        <span class="threat-card-title">${icon} ${title} ${shapeLabel}</span>
        <span class="threat-card-level ${level}">${level.toUpperCase()}</span>
      </div>
      <div class="threat-card-body">${stat}</div>
      <div class="threat-card-stat"><span>${detail}</span></div>
      <div class="threat-card-legend">${legendHtml}</div>
      <div class="threat-card-source">${source}</div>
    </div>
  `;
}

function updateAlertFeed() {
    const feed = document.getElementById('alert-feed');
    if (!feed) return;

    const alerts = [];

    // Climate alerts
    if (state.data.climate) {
        for (const z of state.data.climate.filter(z => z.severity !== 'NORMAL').slice(0, 5)) {
            alerts.push({
                type: 'climate', title: `${z.name}: ${z.type}`,
                desc: `Temp ${z.tempDelta > 0 ? '+' : ''}${z.tempDelta}°C, Precip ${z.precipDelta > 0 ? '+' : ''}${z.precipDelta}mm`,
                time: 'NOW', severity: z.severity === 'EXTREME' ? 2 : 1,
                fullDetail: `<strong>Zone:</strong> ${z.name} (${z.region})<br><strong>Crops:</strong> ${z.crops}<br><strong>Temperature Δ:</strong> ${z.tempDelta > 0 ? '+' : ''}${z.tempDelta}°C<br><strong>Precipitation Δ:</strong> ${z.precipDelta > 0 ? '+' : ''}${z.precipDelta}mm<br><strong>Type:</strong> ${z.type}<br><strong>Severity:</strong> ${z.severity}<br><strong>Period:</strong> ${z.period}`,
                source: 'Open-Meteo ERA5 Reanalysis',
                sourceUrl: 'https://open-meteo.com/',
                lat: z.lat, lon: z.lon,
            });
        }
    }

    // WTO alerts
    if (state.data.wto) {
        for (const b of state.data.wto.filter(b => b.urgency !== 'routine').slice(0, 5)) {
            alerts.push({
                type: 'wto', title: `${b.country}: ${b.urgency === 'emergency' ? 'SPS BAN' : 'SPS Alert'}`,
                desc: b.title?.slice(0, 80),
                time: 'NEW', severity: b.urgency === 'emergency' ? 2 : 1,
                fullDetail: `<strong>Country:</strong> ${b.country}<br><strong>Urgency:</strong> ${(b.urgency || '').toUpperCase()}<br><strong>Measure:</strong> ${b.title}<br>${b.description ? `<strong>Details:</strong> ${b.description}` : ''}`,
                source: 'WTO ePing SPS/TBT',
                sourceUrl: 'https://epingalert.org/',
                lat: b.lat, lon: b.lon,
            });
        }
    }

    // Food security alerts
    if (state.data.foodsec) {
        for (const a of state.data.foodsec.filter(a => a.severity !== 'low').slice(0, 5)) {
            const catLabels = { disease_outbreak: 'Disease Outbreak', food_crisis: 'Food Crisis', pest_invasion: 'Pest Invasion', food_security: 'Food Security' };
            alerts.push({
                type: 'foodsec', title: `${a.country}: ${catLabels[a.category] || a.category}`,
                desc: a.title?.slice(0, 80),
                time: 'ALERT', severity: a.severity === 'critical' ? 2 : 1,
                fullDetail: `<strong>Country:</strong> ${a.country}<br><strong>Category:</strong> ${catLabels[a.category] || a.category}<br><strong>Severity:</strong> ${(a.severity || '').toUpperCase()}`,
                source: a.feedSource || 'Global RSS Feeds',
                sourceUrl: a.link || '',
                lat: a.lat, lon: a.lon,
            });
        }
    }

    // Shipping alerts
    if (state.data.shipping) {
        const flaggedRoutes = state.data.shipping.routes.filter(r => r.isFlagged && r.riskLevel === 'high');
        for (const r of flaggedRoutes.slice(0, 3)) {
            alerts.push({
                type: 'shipping', title: `⚠ Flagged: ${r.sourceCountry} → ${r.targetName}`,
                desc: `${r.cargoType} — ETA ${r.estimatedArrival}`,
                time: 'TRACK', severity: 1,
                fullDetail: `<strong>Origin:</strong> ${r.sourceCountry} (FLAGGED)<br><strong>Destination:</strong> ${r.targetName}<br><strong>Cargo:</strong> ${r.cargoType}<br><strong>Risk:</strong> ${(r.riskLevel || '').toUpperCase()}<br><strong>ETA:</strong> ${r.estimatedArrival}`,
                source: 'AIS Maritime Intelligence',
                sourceUrl: '',
            });
        }
    }

    alerts.sort((a, b) => b.severity - a.severity);
    state.alerts = alerts;

    feed.innerHTML = alerts.length
        ? alerts.map((a, i) => `
      <div class="alert-item ${a.type}" data-alert-idx="${i}" onclick="window.__aegisExpandAlert(${i})">
        <span class="alert-time">${a.time}</span>
        <div class="alert-content">
          <div class="alert-title">${a.title}</div>
          <div class="alert-desc">${a.desc || ''}</div>
        </div>
        <svg class="alert-expand-icon" viewBox="0 0 24 24" width="14" height="14"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none"/></svg>
      </div>
      <div class="alert-detail hidden" id="alert-detail-${i}">
        <div class="alert-detail-body">${a.fullDetail || ''}</div>
        <div class="alert-detail-footer">
          <span class="alert-detail-source">📡 ${a.source}</span>
          ${a.sourceUrl ? `<a href="${a.sourceUrl}" target="_blank" rel="noopener" class="alert-detail-link">Open Source ↗</a>` : ''}
          ${a.lat ? `<button class="alert-locate-btn" onclick="window.__aegisFlyTo(${a.lat}, ${a.lon})">📍 Locate</button>` : ''}
        </div>
      </div>
    `).join('')
        : '<div class="feed-placeholder">No active alerts</div>';
}

// Global click handlers for alerts
window.__aegisExpandAlert = function (idx) {
    const el = document.getElementById(`alert-detail-${idx}`);
    if (!el) return;
    // Toggle
    const wasHidden = el.classList.contains('hidden');
    // Close all
    document.querySelectorAll('.alert-detail').forEach(d => d.classList.add('hidden'));
    if (wasHidden) el.classList.remove('hidden');
};

window.__aegisFlyTo = function (lat, lon) {
    state.map?.flyTo({ center: [lon, lat], zoom: 5, duration: 1200 });
};

function updateTicker() {
    const ticker = document.getElementById('ticker-content');
    if (!ticker) return;

    const items = [];

    if (state.data.climate) {
        const extreme = state.data.climate.filter(z => z.severity === 'EXTREME');
        if (extreme.length) items.push(`🌡️ ${extreme.length} extreme climate anomalies in agricultural zones`);
        const moderate = state.data.climate.filter(z => z.severity === 'MODERATE');
        if (moderate.length) items.push(`🌡️ ${moderate.length} moderate climate stress alerts`);
    }

    if (state.data.wto) {
        const emergencies = state.data.wto.filter(b => b.urgency === 'emergency');
        if (emergencies.length) items.push(`🛃 ${emergencies.length} emergency SPS import bans active — possible pathogen cover-up indicators`);
    }

    if (state.data.foodsec) {
        const critical = state.data.foodsec.filter(a => a.severity === 'critical');
        if (critical.length) items.push(`🦠 ${critical.length} critical food security / disease outbreak alerts`);
    }

    if (state.data.hungermap) {
        const severe = state.data.hungermap.filter(h => h.severity > 0.6);
        if (severe.length) items.push(`🌾 ${severe.length} nations indicating severe famine metrics (>60% insufficient food consumption) via WFP HungerMap`);
    }

    if (state.data.shipping) {
        const flagged = state.data.shipping.routes.filter(r => r.isFlagged);
        items.push(`🚢 ${flagged.length} flagged shipping routes inbound to US agricultural ports`);
    }

    if (items.length === 0) items.push('All systems nominal — monitoring global agricultural threats — AEGIS active');

    ticker.innerHTML = items.map(i => `<span>${i}</span>`).join('<span class="ticker-sep">│</span>');
}

function updateClock() {
    const clock = document.getElementById('clock');
    if (!clock) return;
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hrs = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    clock.textContent = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ` UTC${sign}${hrs}`;
}

function updateStatus(status, text) {
    const dot = document.querySelector('.status-dot');
    const label = document.querySelector('.status-text');
    if (dot) dot.className = `status-dot status-${status}`;
    if (label) label.textContent = text;
}

// ========================================================================
// Event Handlers
// ========================================================================

function setupLayerToggles() {
    const toggles = document.querySelectorAll('.layer-toggle');
    for (const toggle of toggles) {
        const layerName = toggle.dataset.layer;
        const checkbox = toggle.querySelector('input[type="checkbox"]');

        toggle.addEventListener('click', (e) => {
            if (e.target === checkbox) return;
            e.preventDefault();
            checkbox.checked = !checkbox.checked;
            state.layerVisibility[layerName] = checkbox.checked;
            toggle.classList.toggle('active', checkbox.checked);
            updateLayers();
        });

        checkbox.addEventListener('change', () => {
            state.layerVisibility[layerName] = checkbox.checked;
            toggle.classList.toggle('active', checkbox.checked);
            updateLayers();
        });
    }
}

function setupBasemapSelector() {
    const select = document.getElementById('basemap-select');
    if (select) {
        select.addEventListener('change', (e) => {
            changeBasemap(e.target.value);
        });
    }
}

function setupSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    if (toggle && sidebar) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
}

// ========================================================================
// Radar Sweep — 30-second Unified Refresh Cycle
// ========================================================================

const RADAR_CYCLE_SEC = 30;
let radarCountdown = RADAR_CYCLE_SEC;
let cycleCount = 0;

function startRadarCycle() {
    // Countdown tick every second
    setInterval(() => {
        radarCountdown--;
        const el = document.getElementById('radar-countdown');
        if (el) el.textContent = Math.max(0, radarCountdown);

        // Clock update
        updateClock();

        if (radarCountdown <= 0) {
            radarCountdown = RADAR_CYCLE_SEC;
            cycleCount++;
            triggerRadarRefresh();
        }
    }, 1000);
}

async function triggerRadarRefresh() {
    console.log(`[AEGIS] Radar cycle #${cycleCount} — refreshing all feeds...`);

    // Flash the radar overlay
    const overlay = document.getElementById('radar-overlay');
    if (overlay) {
        overlay.classList.add('refresh-pulse');
        setTimeout(() => overlay.classList.remove('refresh-pulse'), 800);
    }

    // === Always refresh: AIS Shipping (every 30s) ===
    try {
        state.data.shipping = await fetchShippingData();
        document.getElementById('shipping-count').textContent = state.data.shipping?.routes?.length || '--';
    } catch (e) { console.warn('[Refresh] Shipping:', e.message); }

    // === Every 30 cycles (15 min): Food Security & HungerMap ===
    if (cycleCount % 30 === 0 || cycleCount === 1) {
        try {
            state.data.foodsec = await fetchFoodSecurityData();
            document.getElementById('foodsec-count').textContent = state.data.foodsec?.length || '--';
        } catch (e) { console.warn('[Refresh] FoodSec:', e.message); }

        try {
            state.data.hungermap = await fetchHungerMapData();
            document.getElementById('hungermap-count').textContent = state.data.hungermap?.length || '--';
        } catch (e) { console.warn('[Refresh] HungerMap:', e.message); }
    }

    // === Every 360 cycles (3 hours): Climate ===
    if (cycleCount % 360 === 0 || cycleCount === 1) {
        try {
            state.data.climate = await fetchClimateData();
            document.getElementById('climate-count').textContent = state.data.climate?.length || '--';
        } catch (e) { console.warn('[Refresh] Climate:', e.message); }
    }

    // === Every 720 cycles (6 hours): WTO ===
    if (cycleCount % 720 === 0 || cycleCount === 1) {
        try {
            state.data.wto = await fetchWTOData();
            document.getElementById('wto-count').textContent = state.data.wto?.length || '--';
        } catch (e) { console.warn('[Refresh] WTO:', e.message); }
    }

    // Update all UI
    updateLayers();
    updateThreatSummary();
    updateAlertFeed();
    updateTicker();
}

// ========================================================================
// Bootstrap
// ========================================================================

async function init() {
    console.log('[AEGIS] Initializing US Agriculture Early Warning System...');

    const map = initMap();
    map.on('load', async () => {
        console.log('[AEGIS] Map loaded');

        // Init deck.gl as MapLibre overlay (worldmonitor pattern)
        initDeckOverlay();

        // Setup UI
        setupLayerToggles();
        setupSidebarToggle();
        setupBasemapSelector();
        updateClock();

        // Load data
        await loadAllData();

        // Start the radar sweep refresh cycle
        startRadarCycle();

        // Trigger map repaint to ensure layers render
        map.triggerRepaint();

        console.log('[AEGIS] All systems operational — radar sweep active');
    });
}

init();
