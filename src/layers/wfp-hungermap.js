import { TextLayer } from '@deck.gl/layers';
import { COUNTRY_COORDS, matchCountry } from '../utils/geo-data.js';

// WFP API uses official UN names that differ from our COUNTRY_COORDS keys
const WFP_NAME_MAP = {
    "Côte d'Ivoire": 'Ivory Coast',
    "Eswatini": 'Swaziland',
    "Iran (Islamic Republic of)": 'Iran',
    "Iran  (Islamic Republic of)": 'Iran',
    "Syrian Arab Republic": 'Syria',
    "United Republic of Tanzania": 'Tanzania',
    "Viet Nam": 'Vietnam',
    "Lao People's Democratic Republic": 'Laos',
    "Türkiye": 'Turkey',
    "State of Palestine": 'Palestine',
    "Sao Tome and Principe": 'Sao Tome',
    "Timor-Leste": 'Timor-Leste',
    "Congo, Democratic Republic of the": 'DR Congo',
    "Democratic Republic of the Congo": 'DR Congo',
    "Republic of the Congo": 'Congo',
    "Bolivia (Plurinational State of)": 'Bolivia',
    "Venezuela (Bolivarian Republic of)": 'Venezuela',
    "Republic of Moldova": 'Moldova',
    "Moldova, Republic of": 'Moldova',
    "Guinea-Bissau": 'Guinea-Bissau',
    "Cabo Verde": 'Cape Verde',
    "Kyrgyz Republic": 'Kyrgyzstan',
    "Kyrgyzstan": 'Kyrgyzstan',
    "Bosnia and Herzegovina": 'Bosnia',
};

// Cache for WFP data
let cachedData = null;
let lastFetchTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Resolve a WFP country name to a COUNTRY_COORDS key.
 * Tries: WFP name map -> exact match -> matchCountry() alias lookup
 */
function resolveCountryName(wfpName) {
    // 1. WFP-specific name map (try raw name first, then normalized)
    const mapped = WFP_NAME_MAP[wfpName];
    if (mapped && COUNTRY_COORDS[mapped]) return mapped;

    // Normalize whitespace for matching (WFP sometimes has double spaces)
    const normalized = wfpName.replace(/\s+/g, ' ').trim();
    const mappedNorm = WFP_NAME_MAP[normalized];
    if (mappedNorm && COUNTRY_COORDS[mappedNorm]) return mappedNorm;

    // 2. Exact case-insensitive match against COUNTRY_COORDS keys
    for (const name of Object.keys(COUNTRY_COORDS)) {
        if (normalized.toLowerCase() === name.toLowerCase()) return name;
    }

    // 3. Fuzzy match via COUNTRY_ALIASES
    return matchCountry(normalized);
}

/**
 * Fetch live data from our `/api/wfp-hungermap` backend proxy.
 * Returns an array of mapped country metrics.
 */
export async function fetchHungerMapData() {
    const now = Date.now();
    if (cachedData && (now - lastFetchTime) < CACHE_TTL) {
        return cachedData;
    }

    let mapData = [];
    try {
        const response = await fetch('/api/wfp-hungermap');
        if (response.ok) {
            const data = await response.json();

            // Handle both object and string body (Lambda-style responses)
            let body = data?.body;
            if (typeof body === 'string') {
                try { body = JSON.parse(body); } catch { body = null; }
            }
            const countries = body?.countries || [];

            let matched = 0;
            let unmatched = 0;
            for (const c of countries) {
                const iso3 = c.country?.iso3;
                if (!iso3) continue;

                const coordsKey = resolveCountryName(c.country.name);
                if (!coordsKey || !COUNTRY_COORDS[coordsKey]) {
                    unmatched++;
                    continue;
                }

                const coords = COUNTRY_COORDS[coordsKey];
                const fcs = c.metrics?.fcs || { people: 0, prevalence: 0 };
                const rcsi = c.metrics?.rcsi || { people: 0, prevalence: 0 };

                // Average the prevalence of Poor Food Consumption and Crisis Coping Strategies
                const combinedSeverity = (fcs.prevalence + rcsi.prevalence) / 2;

                if (combinedSeverity > 0.1) { // Only track if there's notable insecurity (>10%)
                    mapData.push({
                        countryIso3: iso3,
                        countryName: coordsKey,
                        lat: coords.lat,
                        lon: coords.lon,
                        fcsPrevalence: fcs.prevalence,
                        fcsPeople: fcs.people,
                        rcsiPrevalence: rcsi.prevalence,
                        rcsiPeople: rcsi.people,
                        severity: combinedSeverity,
                    });
                    matched++;
                }
            }
            console.log(`[HungerMap] Matched ${matched} countries, ${unmatched} unmatched out of ${countries.length} total`);
        }
    } catch (err) {
        console.error('Failed to fetch WFP HungerMap data:', err);
    }

    // Fall back to static data if nothing came through
    if (mapData.length === 0) {
        console.warn('[HungerMap] No live data — using fallback');
        mapData = generateFallbackData();
    }

    cachedData = mapData;
    lastFetchTime = now;
    return cachedData;
}

/**
 * Static fallback data for when the WFP API is unreachable.
 * Based on recent WFP food security assessments for worst-affected nations.
 */
function generateFallbackData() {
    const fallback = [
        { iso3: 'AFG', name: 'Afghanistan', fcs: 0.571, rcsi: 0.530, fcsP: 23075100, rcsiP: 21421508 },
        { iso3: 'YEM', name: 'Yemen', fcs: 0.450, rcsi: 0.480, fcsP: 14200000, rcsiP: 15100000 },
        { iso3: 'SSD', name: 'South Sudan', fcs: 0.640, rcsi: 0.580, fcsP: 7100000, rcsiP: 6400000 },
        { iso3: 'SYR', name: 'Syria', fcs: 0.380, rcsi: 0.420, fcsP: 8500000, rcsiP: 9200000 },
        { iso3: 'HTI', name: 'Haiti', fcs: 0.490, rcsi: 0.450, fcsP: 5400000, rcsiP: 4900000 },
        { iso3: 'SDN', name: 'Sudan', fcs: 0.410, rcsi: 0.390, fcsP: 18000000, rcsiP: 17000000 },
        { iso3: 'SOM', name: 'Somalia', fcs: 0.520, rcsi: 0.490, fcsP: 4600000, rcsiP: 4300000 },
        { iso3: 'COD', name: 'DR Congo', fcs: 0.350, rcsi: 0.320, fcsP: 25700000, rcsiP: 23400000 },
        { iso3: 'NGA', name: 'Nigeria', fcs: 0.240, rcsi: 0.210, fcsP: 26800000, rcsiP: 23500000 },
        { iso3: 'ETH', name: 'Ethiopia', fcs: 0.310, rcsi: 0.280, fcsP: 15800000, rcsiP: 14200000 },
        { iso3: 'MOZ', name: 'Mozambique', fcs: 0.280, rcsi: 0.250, fcsP: 3400000, rcsiP: 3000000 },
        { iso3: 'TCD', name: 'Chad', fcs: 0.360, rcsi: 0.340, fcsP: 3200000, rcsiP: 3000000 },
        { iso3: 'MLI', name: 'Mali', fcs: 0.280, rcsi: 0.260, fcsP: 2800000, rcsiP: 2600000 },
        { iso3: 'BFA', name: 'Burkina Faso', fcs: 0.300, rcsi: 0.270, fcsP: 3500000, rcsiP: 3100000 },
        { iso3: 'NER', name: 'Niger', fcs: 0.290, rcsi: 0.260, fcsP: 4100000, rcsiP: 3700000 },
        { iso3: 'MMR', name: 'Myanmar', fcs: 0.250, rcsi: 0.230, fcsP: 3600000, rcsiP: 3300000 },
    ];

    return fallback.map(f => {
        const coords = COUNTRY_COORDS[f.name];
        if (!coords) return null;
        return {
            countryIso3: f.iso3,
            countryName: f.name,
            lat: coords.lat,
            lon: coords.lon,
            fcsPrevalence: f.fcs,
            fcsPeople: f.fcsP,
            rcsiPrevalence: f.rcsi,
            rcsiPeople: f.rcsiP,
            severity: (f.fcs + f.rcsi) / 2,
        };
    }).filter(Boolean);
}

/**
 * Helper to map severity to an RGBA color.
 * Low (Yellow) -> Medium (Orange) -> High (Red) -> Critical (Dark Red)
 */
function getSeverityColor(severity) {
    if (severity > 0.6) return [220, 38, 38, 200];  // Red
    if (severity > 0.4) return [249, 115, 22, 180]; // Orange
    if (severity > 0.2) return [251, 191, 36, 160]; // Yellow
    return [16, 185, 129, 100];                     // Green (Trace)
}

/**
 * Creates the Deck.gl layers to visualize the HungerMap data.
 * Uses square ■ markers to distinguish from other layers' shapes.
 */
export function createHungerMapLayer(data, isVisible) {
    if (!isVisible || !data || data.length === 0) return [];

    // Square symbol ■ as primary marker
    const squares = new TextLayer({
        id: 'hungermap-layer',
        data,
        pickable: true,
        characterSet: 'auto',
        getPosition: d => [d.lon, d.lat],
        getText: () => '■',
        getSize: d => d.severity > 0.6 ? 32 : d.severity > 0.4 ? 26 : 20,
        getColor: d => {
            const c = getSeverityColor(d.severity);
            return [c[0], c[1], c[2], 240];
        },
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 700,
    });

    return [squares];
}

/**
 * Generate native tooltip content for hovering over markers.
 */
export function getHungerMapTooltip(info) {
    if (!info || !info.object) return null;
    const props = info.object.properties || info.object;

    const severityPct = (props.severity * 100).toFixed(1);
    const affectedM = ((props.fcsPeople + props.rcsiPeople) / 2 / 1000000).toFixed(1);

    return `
        <div style="font-weight:700;margin-bottom:4px;color:var(--hungermap-color)">🌾 ${props.countryName}</div>
        <div>Severe Food Insecurity: <strong style="color:#ef4444">${severityPct}%</strong></div>
        <div>Pop. Affected (est): <strong>~${affectedM}M</strong></div>
    `;
}

/**
 * Generates threat metrics for the sidebar Summary UI.
 */
export function getHungerMapThreats(data) {
    if (!data || data.length === 0) return { count: 0, critical: 0, level: 'low' };

    const critical = data.filter(d => d.severity > 0.6).length;
    const high = data.filter(d => d.severity > 0.4).length;

    let level = 'low';
    if (critical >= 5) level = 'critical';
    else if (critical > 0 || high > 10) level = 'high';
    else if (high > 0) level = 'moderate';

    return {
        count: data.length,
        critical,
        high,
        level,
    };
}
