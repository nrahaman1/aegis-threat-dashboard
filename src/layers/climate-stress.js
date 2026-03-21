/**
 * Climate Stress Layer — ERA5 via Open-Meteo Archive API
 * 
 * Fetches 30-day climate data for 25 major agricultural zones worldwide,
 * computes temperature and precipitation anomalies, classifies severity.
 * Adapted from worldmonitor's list-climate-anomalies.ts
 */

import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { AGRICULTURAL_ZONES, getSeverityColor } from '../utils/geo-data.js';

let cachedData = null;
let lastFetchTime = 0;
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours

function avg(arr) {
    return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function classifySeverity(tempDelta, precipDelta) {
    const absTemp = Math.abs(tempDelta);
    const absPrecip = Math.abs(precipDelta);
    if (absTemp >= 5 || absPrecip >= 80) return 'EXTREME';
    if (absTemp >= 3 || absPrecip >= 40) return 'MODERATE';
    return 'NORMAL';
}

function classifyType(tempDelta, precipDelta) {
    if (tempDelta > 3 && precipDelta < -20) return 'DROUGHT+HEAT';
    if (tempDelta > 3) return 'HEAT STRESS';
    if (tempDelta < -3) return 'COLD SNAP';
    if (precipDelta > 40) return 'EXCESS RAIN';
    if (precipDelta < -40) return 'DROUGHT';
    if (tempDelta > 0) return 'WARM';
    return 'COOL';
}

async function fetchZone(zone, startDate, endDate) {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${zone.lat}&longitude=${zone.lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_mean,precipitation_sum&timezone=UTC`;

    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;

    const data = await response.json();
    const rawTemps = data.daily?.temperature_2m_mean ?? [];
    const rawPrecips = data.daily?.precipitation_sum ?? [];
    const temps = [];
    const precips = [];

    for (let i = 0; i < rawTemps.length; i++) {
        if (rawTemps[i] != null && rawPrecips[i] != null) {
            temps.push(rawTemps[i]);
            precips.push(rawPrecips[i]);
        }
    }

    if (temps.length < 14) return null;

    const recentTemps = temps.slice(-7);
    const baselineTemps = temps.slice(0, -7);
    const recentPrecips = precips.slice(-7);
    const baselinePrecips = precips.slice(0, -7);

    const tempDelta = Math.round((avg(recentTemps) - avg(baselineTemps)) * 10) / 10;
    const precipDelta = Math.round((avg(recentPrecips) - avg(baselinePrecips)) * 10) / 10;
    const severity = classifySeverity(tempDelta, precipDelta);
    const type = classifyType(tempDelta, precipDelta);

    return {
        ...zone,
        tempDelta,
        precipDelta,
        severity,
        type,
        currentTemp: Math.round(avg(recentTemps) * 10) / 10,
        currentPrecip: Math.round(avg(recentPrecips) * 10) / 10,
        period: `${startDate} to ${endDate}`,
    };
}

export async function fetchClimateData() {
    const now = Date.now();
    if (cachedData && (now - lastFetchTime) < CACHE_TTL) {
        return cachedData;
    }

    const endDate = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const startDate = new Date(now - 37 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const results = await Promise.allSettled(
        AGRICULTURAL_ZONES.map(zone => fetchZone(zone, startDate, endDate))
    );

    const anomalies = [];
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value != null) {
            anomalies.push(r.value);
        }
    }

    if (anomalies.length > 0) {
        cachedData = anomalies;
        lastFetchTime = now;
    }

    return cachedData || [];
}

export function createClimateLayer(data, visible = true) {
    if (!data || !visible) return [];

    // Diamond symbol ◆ as primary marker
    const icons = new TextLayer({
        id: 'climate-stress-icons',
        data,
        pickable: true,
        characterSet: 'auto',
        getPosition: d => [d.lon, d.lat],
        getText: () => '◆',
        getSize: d => d.severity === 'EXTREME' ? 32 : d.severity === 'MODERATE' ? 26 : 20,
        getColor: d => {
            const c = getSeverityColor(d.severity);
            return [c[0], c[1], c[2], 240];
        },
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 700,
    });

    return [icons];
}

export function getClimateTooltip(info) {
    if (!info.object) return null;
    const d = info.object;
    return `
    <div class="tooltip-title">${d.name}</div>
    <div class="tooltip-row"><span class="tooltip-label">Region</span><span class="tooltip-value">${d.region}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Crops</span><span class="tooltip-value">${d.crops}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Temp Δ</span><span class="tooltip-value" style="color:${d.tempDelta > 0 ? '#ef4444' : '#3b82f6'}">${d.tempDelta > 0 ? '+' : ''}${d.tempDelta}°C</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Precip Δ</span><span class="tooltip-value" style="color:${d.precipDelta > 0 ? '#3b82f6' : '#f97316'}">${d.precipDelta > 0 ? '+' : ''}${d.precipDelta} mm</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Type</span><span class="tooltip-value">${d.type}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Severity</span><span class="tooltip-severity ${d.severity.toLowerCase()}">${d.severity}</span></div>
  `;
}

export function getClimateThreats(data) {
    if (!data) return { level: 'low', count: 0, extreme: 0, moderate: 0 };
    const extreme = data.filter(d => d.severity === 'EXTREME').length;
    const moderate = data.filter(d => d.severity === 'MODERATE').length;
    let level = 'low';
    if (extreme >= 3) level = 'critical';
    else if (extreme >= 1) level = 'high';
    else if (moderate >= 3) level = 'moderate';
    return { level, count: data.length, extreme, moderate };
}
