/**
 * AIS Shipping Traffic Layer — LIVE
 * 
 * Fetches real vessel positions from /api/ais-snapshot (AISStream.io relay)
 * and renders them as deck.gl layers with agricultural risk scoring.
 * Falls back to simulated routes when AIS is not configured.
 */

import { ArcLayer, ScatterplotLayer, TextLayer, IconLayer } from '@deck.gl/layers';
import { US_PORTS, CHOKEPOINTS, getThreatColor, COUNTRY_COORDS } from '../utils/geo-data.js';

let cachedData = null;
let lastFetchTime = 0;
const CACHE_TTL = 30 * 1000; // 30 seconds — refresh frequently for live vessels

export async function fetchShippingData() {
    const now = Date.now();
    if (cachedData && (now - lastFetchTime) < CACHE_TTL) {
        return cachedData;
    }

    let vesselData = null;
    let liveVessels = [];
    let aisStats = null;
    let isLive = false;

    // Try live AIS snapshot from proxy server
    try {
        const resp = await fetch('/api/ais-snapshot', { signal: AbortSignal.timeout(10000) });
        if (resp.ok) {
            vesselData = await resp.json();
            aisStats = vesselData.stats;
            isLive = vesselData.stats?.connected || false;
            console.log(`[AIS] Live snapshot: ${vesselData.stats?.total} vessels, ${vesselData.stats?.flagged} flagged, connected: ${vesselData.stats?.connected}`);

            // Convert real vessels to display format
            liveVessels = (vesselData.vessels || [])
                .filter(v => v.lat && v.lon)
                .map(v => ({
                    id: `ais-${v.mmsi}`,
                    mmsi: v.mmsi,
                    shipName: v.shipName || `MMSI ${v.mmsi}`,
                    sourceCountry: v.country || 'Unknown',
                    sourceLat: v.lat,
                    sourceLon: v.lon,
                    targetName: findNearestUSPort(v.lat, v.lon)?.name || 'US Waters',
                    targetLat: findNearestUSPort(v.lat, v.lon)?.lat || 38.0,
                    targetLon: findNearestUSPort(v.lat, v.lon)?.lon || -77.0,
                    isFlagged: v.isFlagged,
                    riskLevel: v.riskLevel,
                    riskReason: v.riskReason || '',
                    cargoType: v.shipCategory || 'Unknown',
                    destination: v.destination || '',
                    sog: v.sog,
                    cog: v.cog,
                    heading: v.heading,
                    imo: v.imo,
                    callSign: v.callSign,
                    lastUpdate: v.timestamp,
                    isLive: true,
                }));
        }
    } catch (err) {
        console.warn('[AIS] Snapshot fetch failed:', err.message);
    }

    // ALWAYS generate strategic arc routes (threat corridors from flagged countries → US ports)
    // These show the POTENTIAL threat vectors regardless of live AIS data
    const strategicArcs = generateFallbackRoutes();

    // Combine: strategic arcs + live vessel dots
    const routes = [...strategicArcs, ...liveVessels];

    // Try to fetch chokepoint status from worldmonitor API
    let chokepointData = CHOKEPOINTS;
    try {
        const resp = await fetch('https://api.worldmonitor.app/api/supply-chain/v1/get-chokepoint-status', {
            signal: AbortSignal.timeout(8000),
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data?.chokepoints?.length) {
                chokepointData = data.chokepoints.map(cp => ({
                    ...cp,
                    threatLevel: cp.status || cp.threatLevel || 'normal',
                }));
            }
        }
    } catch {
        // Use static chokepoint data
    }

    cachedData = {
        routes,
        liveVessels,
        strategicArcs,
        chokepoints: chokepointData,
        portMarkers: US_PORTS,
        isLive,
        aisStats,
    };
    lastFetchTime = now;
    return cachedData;
}

function findNearestUSPort(lat, lon) {
    let nearest = US_PORTS[0];
    let minDist = Infinity;
    for (const port of US_PORTS) {
        const d = Math.sqrt((port.lat - lat) ** 2 + (port.lon - lon) ** 2);
        if (d < minDist) { minDist = d; nearest = port; }
    }
    return nearest;
}

// Fallback simulated routes when AIS is not configured
function generateFallbackRoutes() {
    const FLAGGED_COUNTRIES_STATIC = [
        'China', 'Brazil', 'India', 'Vietnam', 'Indonesia', 'Thailand',
        'Mexico', 'Argentina', 'Russia', 'Turkey', 'Egypt', 'Pakistan',
        'Bangladesh', 'Myanmar', 'Cambodia', 'Philippines',
    ];
    const routes = [];
    for (const country of FLAGGED_COUNTRIES_STATIC) {
        const coords = COUNTRY_COORDS[country];
        if (!coords) continue;
        const targetPorts = US_PORTS.slice(0, Math.floor(Math.random() * 3) + 1);
        for (const port of targetPorts) {
            routes.push({
                id: `sim-${country}-${port.name}`,
                sourceCountry: country,
                sourceLat: coords.lat, sourceLon: coords.lon,
                targetName: port.name, targetLat: port.lat, targetLon: port.lon,
                isFlagged: true,
                riskLevel: Math.random() > 0.5 ? 'high' : 'moderate',
                riskReason: getStrategicRiskReason(country),
                cargoType: randomCargo(),
                estimatedArrival: futureDate(Math.floor(Math.random() * 21) + 3),
                isLive: false,
            });
        }
    }
    const normalExporters = ['Canada', 'Australia', 'France', 'Germany', 'Japan', 'South Korea', 'Chile', 'Colombia', 'Peru'];
    for (const country of normalExporters) {
        const coords = COUNTRY_COORDS[country];
        if (!coords) continue;
        const port = US_PORTS[Math.floor(Math.random() * US_PORTS.length)];
        routes.push({
            id: `sim-${country}-${port.name}`,
            sourceCountry: country,
            sourceLat: coords.lat, sourceLon: coords.lon,
            targetName: port.name, targetLat: port.lat, targetLon: port.lon,
            isFlagged: false, riskLevel: 'low',
            cargoType: randomCargo(),
            estimatedArrival: futureDate(Math.floor(Math.random() * 30) + 5),
            isLive: false,
        });
    }
    return routes;
}

function randomCargo() {
    const types = ['Grain/Cereals', 'Livestock', 'Processed Food', 'Fresh Produce', 'Seafood', 'Fertilizer', 'Seeds', 'Animal Feed', 'Dairy Products', 'Edible Oils'];
    return types[Math.floor(Math.random() * types.length)];
}

// Country-specific risk reasoning for strategic threat corridors
function getStrategicRiskReason(country) {
    const reasons = {
        'China': 'Biosecurity watchlist · History of ASF and avian influenza outbreaks · Major ag commodity exporter to US',
        'Brazil': 'Recurrent foot-and-mouth disease concerns · Major beef and soy exporter · SPS trade friction with US',
        'India': 'Active SPS notifications · Pesticide residue violations on produce · WTO trade barriers detected',
        'Vietnam': 'Biosecurity watchlist · Aquaculture disease concerns · ASF-affected region',
        'Indonesia': 'Palm oil trade disputes · Avian influenza endemic zone · SPS import restrictions',
        'Thailand': 'Shrimp disease history · Active SPS measures on US poultry · Trade reciprocity concerns',
        'Mexico': 'Proximity vector · Fruit fly quarantine zones · Fresh produce pathogen risk corridor',
        'Argentina': 'FMD vaccination zone · Grain export restrictions · Active SPS trade disputes',
        'Russia': 'Fertilizer supply disruption risk · Grain export bans · Geopolitical sanctions impact',
        'Turkey': 'Active SPS barriers on US ag products · Regional disease corridor · Trade instability',
        'Egypt': 'Wheat import dependency signals · Food security instability · Regional conflict spillover risk',
        'Pakistan': 'Locust swarm corridors · Cotton pest concerns · Food security stress indicators',
        'Bangladesh': 'Biosecurity watchlist · Aquaculture disease risk · Garment-ag commodity trade nexus',
        'Myanmar': 'Biosecurity watchlist · Limited disease surveillance capacity · Unregulated cross-border trade',
        'Cambodia': 'Biosecurity watchlist · ASF-affected · Limited veterinary infrastructure',
        'Philippines': 'ASF-affected · Typhoon-driven food security alerts · Aquaculture disease risk',
    };
    return reasons[country] || `${country} flagged for elevated agricultural trade risk`;
}

function futureDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

// ============================================================
// Deck.gl Layers
// ============================================================

export function createShippingLayers(data, visible = true) {
    if (!data || !visible) return [];
    const { chokepoints, portMarkers } = data;
    const strategicArcs = data.strategicArcs || data.routes.filter(r => !r.isLive);
    const liveVessels = data.liveVessels || data.routes.filter(r => r.isLive);
    const layers = [];

    // === ALWAYS: Strategic arc routes (threat corridors) ===
    // Normal trade arcs (teal, dim)
    layers.push(new ArcLayer({
        id: 'shipping-normal-arcs',
        data: strategicArcs.filter(r => !r.isFlagged),
        pickable: true,
        getWidth: 1,
        getSourcePosition: d => [d.sourceLon, d.sourceLat],
        getTargetPosition: d => [d.targetLon, d.targetLat],
        getSourceColor: [59, 206, 172, 80],
        getTargetColor: [59, 206, 172, 140],
        getHeight: 0.2,
        greatCircle: true,
    }));

    // Flagged threat corridor arcs (red/orange)
    layers.push(new ArcLayer({
        id: 'shipping-flagged-arcs',
        data: strategicArcs.filter(r => r.isFlagged),
        pickable: true,
        getWidth: 2.5,
        getSourcePosition: d => [d.sourceLon, d.sourceLat],
        getTargetPosition: d => [d.targetLon, d.targetLat],
        getSourceColor: d => d.riskLevel === 'high' ? [239, 68, 68, 200] : [249, 115, 22, 180],
        getTargetColor: [59, 206, 172, 220],
        getHeight: 0.3,
        greatCircle: true,
        transitions: { getWidth: 500 },
    }));

    // === LIVE OVERLAY: Real AIS vessel positions (when connected) ===
    if (liveVessels.length > 0) {
        const flaggedLive = liveVessels.filter(v => v.isFlagged);
        const normalLive = liveVessels.filter(v => !v.isFlagged);

        // Flagged live vessel markers (red/orange, prominent)
        if (flaggedLive.length > 0) {
            layers.push(new ScatterplotLayer({
                id: 'shipping-flagged-vessels',
                data: flaggedLive,
                pickable: true,
                opacity: 0.9,
                stroked: true,
                filled: true,
                radiusMinPixels: 5,
                radiusMaxPixels: 16,
                lineWidthMinPixels: 1.5,
                getPosition: d => [d.sourceLon, d.sourceLat],
                getRadius: d => d.riskLevel === 'high' ? 10000 : 7000,
                getFillColor: d => d.riskLevel === 'high' ? [239, 68, 68, 230] : [249, 115, 22, 210],
                getLineColor: [255, 255, 255, 200],
                transitions: { getPosition: 1000 },
            }));
        }

        // Normal live vessel markers (teal dots)
        if (normalLive.length > 0) {
            layers.push(new ScatterplotLayer({
                id: 'shipping-normal-vessels',
                data: normalLive,
                pickable: true,
                opacity: 0.7,
                stroked: false,
                filled: true,
                radiusMinPixels: 3,
                radiusMaxPixels: 10,
                getPosition: d => [d.sourceLon, d.sourceLat],
                getRadius: 5000,
                getFillColor: [59, 206, 172, 180],
                transitions: { getPosition: 1000 },
            }));
        }

        // Arcs from flagged live vessels to nearest US port
        if (flaggedLive.length > 0) {
            layers.push(new ArcLayer({
                id: 'shipping-live-threat-arcs',
                data: flaggedLive.filter(v => v.sog > 0.5),
                pickable: true,
                getWidth: 2,
                getSourcePosition: d => [d.sourceLon, d.sourceLat],
                getTargetPosition: d => [d.targetLon, d.targetLat],
                getSourceColor: d => d.riskLevel === 'high' ? [239, 68, 68, 200] : [249, 115, 22, 180],
                getTargetColor: [59, 206, 172, 220],
                getHeight: 0.25,
                greatCircle: true,
            }));
        }
    }

    // US Port markers (always shown)
    layers.push(new ScatterplotLayer({
        id: 'shipping-us-ports',
        data: portMarkers,
        pickable: true,
        opacity: 1,
        stroked: true,
        filled: true,
        radiusMinPixels: 6,
        radiusMaxPixels: 18,
        lineWidthMinPixels: 2,
        getPosition: d => [d.lon, d.lat],
        getRadius: 20000,
        getFillColor: [59, 206, 172, 200],
        getLineColor: [59, 206, 172, 255],
    }));

    // Port labels
    layers.push(new TextLayer({
        id: 'shipping-port-labels',
        data: portMarkers,
        pickable: false,
        getPosition: d => [d.lon, d.lat],
        getText: d => d.name.replace('Port of ', ''),
        getSize: 11,
        getColor: [59, 206, 172, 200],
        getTextAnchor: 'start',
        getAlignmentBaseline: 'center',
        getPixelOffset: [12, 0],
        fontFamily: 'Inter, sans-serif',
        fontWeight: 600,
    }));

    // Chokepoint indicators
    layers.push(new ScatterplotLayer({
        id: 'shipping-chokepoints',
        data: chokepoints,
        pickable: true,
        opacity: 0.9,
        stroked: true,
        filled: true,
        radiusMinPixels: 10,
        radiusMaxPixels: 35,
        lineWidthMinPixels: 2,
        getPosition: d => [d.lon, d.lat],
        getRadius: 50000,
        getFillColor: d => getThreatColor(d.threatLevel),
        getLineColor: d => { const c = getThreatColor(d.threatLevel); return [c[0], c[1], c[2], 255]; },
    }));

    return layers;
}

// ============================================================
// Tooltips
// ============================================================

export function getShippingTooltip(info) {
    if (!info.object) return null;
    const d = info.object;

    // Port tooltip
    if (d.type) {
        return `
      <div class="tooltip-title">${d.name}</div>
      <div class="tooltip-row"><span class="tooltip-label">Coast</span><span class="tooltip-value">${d.type}</span></div>
      <div class="tooltip-row"><span class="tooltip-label">Role</span><span class="tooltip-value">Agricultural Import Hub</span></div>
    `;
    }

    // Chokepoint tooltip
    if (d.routes) {
        const color = d.threatLevel === 'critical' ? 'extreme' : d.threatLevel === 'high' ? 'moderate' : 'normal';
        return `
      <div class="tooltip-title">${d.name}</div>
      <div class="tooltip-row"><span class="tooltip-label">Status</span><span class="tooltip-severity ${color}">${(d.threatLevel || '').toUpperCase()}</span></div>
      ${d.description ? `<div class="tooltip-row"><span class="tooltip-label">Intel</span><span class="tooltip-value" style="max-width:180px;white-space:normal;text-align:right">${d.description}</span></div>` : ''}
      <div class="tooltip-row"><span class="tooltip-label">Routes</span><span class="tooltip-value">${(d.routes || []).length}</span></div>
    `;
    }

    // Vessel/Arc tooltip
    if (d.sourceCountry || d.mmsi) {
        const flagged = d.isFlagged ? `<div class="tooltip-row"><span class="tooltip-severity extreme">⚠ FLAGGED ORIGIN</span></div>` : '';
        const live = d.isLive ? `<div class="tooltip-row"><span class="tooltip-label">Status</span><span class="tooltip-value" style="color:#10b981">● LIVE AIS</span></div>` : '';
        const speed = d.sog !== undefined ? `<div class="tooltip-row"><span class="tooltip-label">Speed</span><span class="tooltip-value">${d.sog.toFixed(1)} kn</span></div>` : '';
        const heading = d.heading !== undefined && d.heading !== 511 ? `<div class="tooltip-row"><span class="tooltip-label">Heading</span><span class="tooltip-value">${d.heading}°</span></div>` : '';
        const dest = d.destination ? `<div class="tooltip-row"><span class="tooltip-label">Dest</span><span class="tooltip-value">${d.destination}</span></div>` : '';
        const vesselName = d.shipName || d.sourceCountry;

        // Risk reason for moderate/high
        let reasonHtml = '';
        if ((d.riskLevel === 'high' || d.riskLevel === 'moderate') && d.riskReason) {
            const color = d.riskLevel === 'high' ? '#ef4444' : '#f97316';
            reasonHtml = `<div class="tooltip-row" style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.08);padding-top:5px">
              <span class="tooltip-value" style="color:${color};font-size:10px;white-space:normal;line-height:1.4;max-width:220px">
                ⚡ ${d.riskReason}
              </span>
            </div>`;
        }

        return `
      <div class="tooltip-title">${vesselName}${d.targetName ? ' → ' + d.targetName : ''}</div>
      ${live}
      ${flagged}
      <div class="tooltip-row"><span class="tooltip-label">Flag</span><span class="tooltip-value">${d.sourceCountry || 'Unknown'}</span></div>
      <div class="tooltip-row"><span class="tooltip-label">Type</span><span class="tooltip-value">${d.cargoType}</span></div>
      <div class="tooltip-row"><span class="tooltip-label">Risk</span><span class="tooltip-value">${(d.riskLevel || '').toUpperCase()}</span></div>
      ${speed}${heading}${dest}
      ${d.mmsi ? `<div class="tooltip-row"><span class="tooltip-label">MMSI</span><span class="tooltip-value">${d.mmsi}</span></div>` : ''}
      ${reasonHtml}
    `;
    }

    return null;
}

// ============================================================
// Threat Summary
// ============================================================

export function getShippingThreats(data) {
    if (!data) return { level: 'low', count: 0, flaggedRoutes: 0, criticalChokepoints: 0 };
    const flaggedRoutes = data.routes.filter(r => r.isFlagged).length;
    const highRisk = data.routes.filter(r => r.riskLevel === 'high').length;
    const liveCount = data.liveVessels?.length || 0;
    const criticalChokepoints = data.chokepoints.filter(c => c.threatLevel === 'critical' || c.threatLevel === 'war_zone').length;
    let level = 'low';
    if (criticalChokepoints >= 2 || highRisk >= 5) level = 'critical';
    else if (criticalChokepoints >= 1 || flaggedRoutes >= 10) level = 'high';
    else if (flaggedRoutes >= 5 || highRisk >= 1) level = 'moderate';
    return {
        level,
        count: data.routes.length,
        flaggedRoutes,
        highRisk,
        liveCount,
        criticalChokepoints,
        isLive: data.isLive || false,
    };
}
