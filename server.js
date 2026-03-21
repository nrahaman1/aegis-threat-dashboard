/**
 * AEGIS Proxy Server + AIS WebSocket Relay
 * 
 * - Proxies RSS/API calls server-side (eliminates CORS)
 * - Maintains live WebSocket to AISStream.io for real vessel positions
 * - In-memory caching with configurable TTLs
 * 
 * Usage: node server.js
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In production, serve the Vite-built static files
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(join(__dirname, 'dist')));
}

// ============================================================
// In-memory cache
// ============================================================

const cache = new Map();

function getCached(key, ttlMs) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// ============================================================
// AIS WebSocket Relay — Live Vessel Tracking
// ============================================================

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const AISSTREAM_API_KEY = process.env.AISSTREAM_API_KEY || '';

// In-memory vessel store
const vessels = new Map();  // MMSI → vessel data
const MAX_VESSELS = 5000;
const VESSEL_EXPIRY_MS = 30 * 60 * 1000; // 30 min stale threshold
let aisSocket = null;
let aisConnected = false;
let aisMessageCount = 0;
let aisLastMessage = null;
let aisReconnectTimer = null;

// MMSI mid (Maritime Identification Digits) → country mapping
// First 3 digits of MMSI identify the flag state
const MID_TO_COUNTRY = {
    201: 'Albania', 202: 'Andorra', 203: 'Austria', 204: 'Portugal', 205: 'Belgium',
    206: 'Belarus', 207: 'Bulgaria', 208: 'Vatican', 209: 'Cyprus', 210: 'Cyprus',
    211: 'Germany', 212: 'Cyprus', 213: 'Georgia', 214: 'Moldova', 215: 'Malta',
    216: 'Armenia', 218: 'Germany', 219: 'Denmark', 220: 'Denmark', 224: 'Spain',
    225: 'Spain', 226: 'France', 227: 'France', 228: 'France', 229: 'Malta',
    230: 'Finland', 231: 'Denmark', 232: 'United Kingdom', 233: 'United Kingdom',
    234: 'United Kingdom', 235: 'United Kingdom', 236: 'Gibraltar', 237: 'Greece',
    238: 'Croatia', 239: 'Greece', 240: 'Greece', 241: 'Greece', 242: 'Morocco',
    243: 'Hungary', 244: 'Netherlands', 245: 'Netherlands', 246: 'Netherlands',
    247: 'Italy', 248: 'Malta', 249: 'Malta', 250: 'Ireland', 251: 'Iceland',
    252: 'Liechtenstein', 253: 'Luxembourg', 254: 'Monaco', 255: 'Portugal',
    256: 'Malta', 257: 'Norway', 258: 'Norway', 259: 'Norway', 261: 'Poland',
    263: 'Portugal', 264: 'Romania', 265: 'Sweden', 266: 'Sweden', 267: 'Slovakia',
    268: 'San Marino', 269: 'Switzerland', 270: 'Czech Republic', 271: 'Turkey',
    272: 'Ukraine', 273: 'Russia', 274: 'North Macedonia', 275: 'Latvia',
    276: 'Estonia', 277: 'Lithuania', 278: 'Slovenia', 279: 'Montenegro',
    301: 'Anguilla', 303: 'Alaska', 304: 'Antigua', 305: 'Antigua',
    306: 'Netherlands Antilles', 307: 'Aruba', 308: 'Bahamas', 309: 'Bahamas',
    310: 'Bermuda', 311: 'Bahamas', 312: 'Belize', 314: 'Barbados',
    316: 'Canada', 319: 'Cayman Islands', 321: 'Costa Rica', 323: 'Cuba',
    325: 'Dominica', 327: 'Dominican Republic', 329: 'Guadeloupe',
    330: 'Grenada', 331: 'Greenland', 332: 'Guatemala', 334: 'Honduras',
    336: 'Haiti', 338: 'United States', 339: 'Jamaica', 341: 'Saint Kitts',
    343: 'Saint Lucia', 345: 'Mexico', 347: 'Martinique', 348: 'Montserrat',
    350: 'Nicaragua', 351: 'Panama', 352: 'Panama', 353: 'Panama',
    354: 'Panama', 355: 'Panama', 356: 'Panama', 357: 'Panama',
    358: 'Puerto Rico', 359: 'El Salvador', 361: 'Saint Pierre',
    362: 'Trinidad', 364: 'Turks and Caicos', 366: 'United States',
    367: 'United States', 368: 'United States', 369: 'United States',
    370: 'Panama', 371: 'Panama', 372: 'Panama', 373: 'Panama',
    374: 'Panama', 375: 'Saint Vincent', 376: 'Saint Vincent',
    377: 'Saint Vincent', 378: 'British Virgin Islands', 379: 'US Virgin Islands',
    401: 'Afghanistan', 403: 'Saudi Arabia', 405: 'Bangladesh',
    408: 'Bahrain', 410: 'Bhutan', 412: 'China', 413: 'China',
    414: 'China', 416: 'Taiwan', 417: 'Sri Lanka', 419: 'India',
    422: 'Iran', 423: 'Azerbaijan', 425: 'Iraq', 428: 'Israel',
    431: 'Japan', 432: 'Japan', 434: 'Turkmenistan', 436: 'Kazakhstan',
    437: 'Uzbekistan', 438: 'Jordan', 440: 'South Korea', 441: 'South Korea',
    443: 'Palestine', 445: 'North Korea', 447: 'Kuwait', 450: 'Lebanon',
    451: 'Kyrgyzstan', 453: 'Macao', 455: 'Maldives', 457: 'Mongolia',
    459: 'Nepal', 461: 'Oman', 463: 'Pakistan', 466: 'Qatar',
    468: 'Syria', 470: 'UAE', 472: 'Tajikistan', 473: 'Yemen',
    475: 'Yemen', 477: 'Hong Kong', 478: 'Bosnia', 501: 'Antarctica',
    503: 'Australia', 506: 'Myanmar', 508: 'Brunei', 510: 'Micronesia',
    511: 'Palau', 512: 'New Zealand', 514: 'Cambodia', 515: 'Cambodia',
    516: 'Christmas Island', 518: 'Cook Islands', 520: 'Fiji',
    523: 'Cocos Islands', 525: 'Indonesia', 529: 'Kiribati',
    531: 'Laos', 533: 'Malaysia', 536: 'Northern Mariana Islands',
    538: 'Marshall Islands', 540: 'New Caledonia', 542: 'Niue',
    544: 'Nauru', 546: 'French Polynesia', 548: 'Philippines',
    553: 'Papua New Guinea', 555: 'Pitcairn', 557: 'Solomon Islands',
    559: 'American Samoa', 561: 'Samoa', 563: 'Singapore',
    564: 'Singapore', 565: 'Singapore', 566: 'Singapore',
    567: 'Thailand', 570: 'Tonga', 572: 'Tuvalu', 574: 'Vietnam',
    576: 'Vanuatu', 577: 'Vanuatu', 578: 'Wallis and Futuna',
    601: 'South Africa', 603: 'Angola', 605: 'Algeria', 607: 'Saint Paul',
    608: 'Ascension Island', 609: 'Burundi', 610: 'Benin',
    611: 'Botswana', 612: 'Central African Republic', 613: 'Cameroon',
    615: 'DR Congo', 616: 'Comoros', 617: 'Cape Verde', 618: 'Antarctica',
    619: 'Ivory Coast', 620: 'Comoros', 621: 'Djibouti',
    622: 'Egypt', 624: 'Ethiopia', 625: 'Eritrea', 626: 'Gabon',
    627: 'Ghana', 629: 'Gambia', 630: 'Guinea-Bissau', 631: 'Equatorial Guinea',
    632: 'Guinea', 633: 'Burkina Faso', 634: 'Kenya', 635: 'Antarctica',
    636: 'Liberia', 637: 'Liberia', 638: 'South Sudan', 642: 'Libya',
    644: 'Lesotho', 645: 'Mauritius', 647: 'Madagascar', 649: 'Mali',
    650: 'Mozambique', 654: 'Mauritania', 655: 'Malawi', 656: 'Niger',
    657: 'Nigeria', 659: 'Namibia', 660: 'Reunion', 661: 'Rwanda',
    662: 'Sudan', 663: 'Senegal', 664: 'Seychelles', 665: 'Saint Helena',
    666: 'Somalia', 667: 'Sierra Leone', 668: 'Sao Tome', 669: 'Swaziland',
    670: 'Chad', 671: 'Togo', 672: 'Tunisia', 674: 'Tanzania',
    675: 'Uganda', 676: 'DR Congo', 677: 'Tanzania', 678: 'Zambia',
    679: 'Zimbabwe',
};

// Countries with known agricultural biosecurity concerns
const BASELINE_FLAGGED = new Set([
    'China', 'Vietnam', 'Myanmar', 'Cambodia', 'North Korea', 'Iran', 'Syria',
]);

function getMidCountry(mmsi) {
    if (!mmsi || mmsi < 200000000) return null;
    const mid = Math.floor(mmsi / 1000000);
    return MID_TO_COUNTRY[mid] || null;
}

// Bounding boxes — GLOBAL shipping lanes for comprehensive coverage
// AISStream requires [[minLon, minLat], [maxLon, maxLat]] format
const US_BOUNDING_BOXES = [
    // Americas — US coasts + Caribbean + Gulf
    [[-130, 15], [-60, 55]],
    // North Atlantic — Europe to US shipping lanes
    [[-60, 25], [10, 60]],
    // Mediterranean + Suez approach
    [[-10, 28], [45, 48]],
    // Red Sea + Bab el-Mandeb + Gulf of Aden + Arabian Sea
    [[30, 5], [75, 32]],
    // South Atlantic + West Africa
    [[-45, -40], [20, 15]],
    // Indian Ocean + East Africa
    [[20, -40], [80, 5]],
    // SE Asia + Strait of Malacca + South China Sea
    [[95, -10], [125, 25]],
    // East Asia — China, Japan, Korea
    [[110, 20], [145, 50]],
    // Pacific Ocean — trans-Pacific lanes
    [[140, 10], [180, 55]],
    // Panama Canal zone + Central America
    [[-90, 5], [-75, 15]],
];

function connectAIS() {
    if (!AISSTREAM_API_KEY) {
        console.log('[AIS] No AISSTREAM_API_KEY configured — using simulated data');
        return;
    }

    console.log('[AIS] Connecting to AISStream.io...');

    try {
        aisSocket = new WebSocket(AISSTREAM_URL);
    } catch (err) {
        console.error('[AIS] WebSocket creation failed:', err.message);
        scheduleReconnect();
        return;
    }

    aisSocket.on('open', () => {
        console.log('[AIS] Connected to AISStream.io');
        aisConnected = true;

        // Subscribe to vessel positions in US approach zones
        const subscribeMsg = JSON.stringify({
            APIKey: AISSTREAM_API_KEY,
            BoundingBoxes: US_BOUNDING_BOXES,
            FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'StandardClassBPositionReport'],
        });

        aisSocket.send(subscribeMsg);
        console.log(`[AIS] Subscribed to ${US_BOUNDING_BOXES.length} global shipping lane zones`);
    });

    aisSocket.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            aisMessageCount++;
            aisLastMessage = Date.now();
            processAISMessage(msg);
        } catch { /* ignore malformed */ }
    });

    aisSocket.on('close', (code, reason) => {
        console.log(`[AIS] Disconnected (code: ${code}, reason: ${reason || 'none'})`);
        aisConnected = false;
        aisSocket = null;
        scheduleReconnect();
    });

    aisSocket.on('error', (err) => {
        console.error('[AIS] WebSocket error:', err.message);
        aisConnected = false;
    });
}

function scheduleReconnect() {
    if (aisReconnectTimer) return;
    const delay = 10000; // 10s reconnect delay
    console.log(`[AIS] Reconnecting in ${delay / 1000}s...`);
    aisReconnectTimer = setTimeout(() => {
        aisReconnectTimer = null;
        connectAIS();
    }, delay);
}

function processAISMessage(msg) {
    const msgType = msg.MessageType;

    if (msgType === 'PositionReport' || msgType === 'StandardClassBPositionReport') {
        const pos = msg.Message?.PositionReport || msg.Message?.StandardClassBPositionReport;
        const meta = msg.MetaData;
        if (!pos || !meta) return;

        const mmsi = meta.MMSI;
        if (!mmsi) return;

        const existing = vessels.get(mmsi) || {};
        vessels.set(mmsi, {
            ...existing,
            mmsi,
            lat: pos.Latitude,
            lon: pos.Longitude,
            cog: pos.Cog,      // Course over ground
            sog: pos.Sog,      // Speed over ground (knots)
            heading: pos.TrueHeading,
            navStatus: pos.NavigationalStatus,
            timestamp: meta.time_utc || new Date().toISOString(),
            shipName: meta.ShipName?.trim() || existing.shipName || '',
            country: getMidCountry(mmsi) || existing.country || '',
            lastUpdate: Date.now(),
        });
    }

    if (msgType === 'ShipStaticData') {
        const data = msg.Message?.ShipStaticData;
        const meta = msg.MetaData;
        if (!data || !meta) return;

        const mmsi = meta.MMSI;
        if (!mmsi) return;

        const existing = vessels.get(mmsi) || {};
        vessels.set(mmsi, {
            ...existing,
            mmsi,
            shipName: data.Name?.trim() || meta.ShipName?.trim() || existing.shipName || '',
            shipType: data.Type,
            imo: data.ImoNumber,
            callSign: data.CallSign?.trim() || '',
            destination: data.Destination?.trim() || '',
            draught: data.MaximumStaticDraught,
            dimensionA: data.Dimension?.A,
            dimensionB: data.Dimension?.B,
            country: getMidCountry(mmsi) || existing.country || '',
            lastUpdate: Date.now(),
        });
    }

    // Enforce vessel limit
    if (vessels.size > MAX_VESSELS) {
        pruneVessels();
    }
}

function pruneVessels() {
    const cutoff = Date.now() - VESSEL_EXPIRY_MS;
    for (const [mmsi, v] of vessels) {
        if (v.lastUpdate < cutoff) vessels.delete(mmsi);
    }
    // If still over limit, remove oldest
    if (vessels.size > MAX_VESSELS) {
        const sorted = [...vessels.entries()].sort((a, b) => a[1].lastUpdate - b[1].lastUpdate);
        const toRemove = sorted.slice(0, sorted.length - MAX_VESSELS);
        for (const [mmsi] of toRemove) vessels.delete(mmsi);
    }
}

// Ship type codes → agricultural relevance
function classifyShipType(typeCode) {
    if (!typeCode) return { category: 'unknown', agRelevance: 'low' };
    if (typeCode >= 70 && typeCode <= 79) return { category: 'Cargo', agRelevance: 'high' };
    if (typeCode >= 80 && typeCode <= 89) return { category: 'Tanker', agRelevance: 'moderate' };
    if (typeCode >= 40 && typeCode <= 49) return { category: 'HSC', agRelevance: 'low' };
    if (typeCode >= 60 && typeCode <= 69) return { category: 'Passenger', agRelevance: 'low' };
    if (typeCode === 30) return { category: 'Fishing', agRelevance: 'moderate' };
    return { category: 'Other', agRelevance: 'low' };
}

// ============================================================
// AIS Snapshot Endpoint
// ============================================================

app.get('/api/ais-snapshot', (req, res) => {
    pruneVessels();

    // Build dynamic flagged set from WTO data
    const dynamicFlagged = new Set(BASELINE_FLAGGED);
    const wtoCache = getCached('wto:sps', 24 * 60 * 60 * 1000);
    // If we have WTO data, parse for countries with bans
    if (wtoCache && typeof wtoCache === 'string') {
        const banCountries = extractBanCountries(wtoCache);
        for (const c of banCountries) dynamicFlagged.add(c);
    }

    const vesselList = [...vessels.values()].map(v => {
        const shipClass = classifyShipType(v.shipType);
        const isFlagged = dynamicFlagged.has(v.country);
        let riskLevel = 'low';
        if (isFlagged && shipClass.agRelevance === 'high') riskLevel = 'high';
        else if (isFlagged) riskLevel = 'moderate';
        else if (shipClass.agRelevance === 'high') riskLevel = 'elevated';

        // Build human-readable risk reason
        let riskReason = '';
        if (riskLevel === 'high' || riskLevel === 'moderate') {
            const reasons = [];
            if (BASELINE_FLAGGED.has(v.country)) {
                reasons.push(`${v.country} is on the biosecurity watchlist`);
            }
            // Check if country was dynamically flagged via WTO bans
            const wtoFlagged = !BASELINE_FLAGGED.has(v.country) && dynamicFlagged.has(v.country);
            if (wtoFlagged) {
                reasons.push(`Active WTO SPS import ban detected for ${v.country}`);
            }
            if (BASELINE_FLAGGED.has(v.country) && dynamicFlagged.has(v.country) && !wtoFlagged) {
                // Check if WTO also flagged this baseline country
                const banCountries = wtoCache ? extractBanCountries(typeof wtoCache === 'string' ? wtoCache : '') : new Set();
                if (banCountries.has(v.country)) {
                    reasons.push(`Active WTO SPS ban also detected`);
                }
            }
            if (shipClass.agRelevance === 'high') {
                reasons.push(`${shipClass.category} vessel — high agricultural cargo probability`);
            } else if (shipClass.agRelevance === 'moderate') {
                reasons.push(`${shipClass.category} vessel — potential ag-related cargo`);
            }
            if (v.destination) {
                const destUpper = v.destination.toUpperCase();
                const usKeywords = ['US', 'USA', 'HOUSTON', 'NEW ORLEANS', 'NORFOLK', 'SAVANNAH', 'CHARLESTON', 'LA', 'LONG BEACH', 'SEATTLE', 'MIAMI', 'BALTIMORE', 'NEW YORK', 'BOSTON', 'JACKSONVILLE'];
                if (usKeywords.some(kw => destUpper.includes(kw))) {
                    reasons.push(`US-bound destination: ${v.destination}`);
                }
            }
            riskReason = reasons.join(' · ');
        }

        return {
            ...v,
            shipCategory: shipClass.category,
            agRelevance: shipClass.agRelevance,
            isFlagged,
            riskLevel,
            riskReason,
        };
    });

    res.json({
        vessels: vesselList,
        stats: {
            total: vesselList.length,
            flagged: vesselList.filter(v => v.isFlagged).length,
            highRisk: vesselList.filter(v => v.riskLevel === 'high').length,
            cargo: vesselList.filter(v => v.shipCategory === 'Cargo').length,
            connected: aisConnected,
            messageCount: aisMessageCount,
            lastMessage: aisLastMessage ? new Date(aisLastMessage).toISOString() : null,
        },
        flaggedCountries: [...dynamicFlagged],
        timestamp: new Date().toISOString(),
    });
});

function extractBanCountries(xmlText) {
    const countries = new Set();
    // Simple extraction of country names from WTO RSS feed items about bans
    const banTerms = ['ban', 'suspend', 'prohibit', 'restrict', 'emergency'];
    const countryNames = Object.keys({
        'China': 1, 'India': 1, 'Brazil': 1, 'Russia': 1, 'Vietnam': 1,
        'Indonesia': 1, 'Thailand': 1, 'Mexico': 1, 'Argentina': 1, 'Turkey': 1,
        'Egypt': 1, 'Pakistan': 1, 'Bangladesh': 1, 'Philippines': 1, 'Myanmar': 1,
        'Cambodia': 1, 'South Korea': 1, 'Japan': 1, 'Malaysia': 1, 'Nigeria': 1,
        'Kenya': 1, 'Ethiopia': 1, 'South Africa': 1, 'Colombia': 1, 'Peru': 1,
        'Chile': 1, 'Ukraine': 1, 'Iran': 1, 'Iraq': 1, 'Saudi Arabia': 1,
    });
    const lowerXml = xmlText.toLowerCase();
    if (banTerms.some(t => lowerXml.includes(t))) {
        for (const country of countryNames) {
            if (lowerXml.includes(country.toLowerCase())) {
                countries.add(country);
            }
        }
    }
    return countries;
}

// ============================================================
// Generic RSS Proxy
// ============================================================

const ALLOWED_RSS_DOMAINS = [
    'epingalert.org', 'www.wto.org', 'reliefweb.int', 'www.fao.org', 'fao.org',
    'promedmail.org', 'feeds.fao.org', 'news.un.org', 'rss.app',
    'www.aphis.usda.gov', 'www.who.int', 'www.oie.int', 'www.woah.org',
    'alerts.weather.gov',
    'www.gdacs.org', 'gdacs.org',
    'www.thenewhumanitarian.org', 'thenewhumanitarian.org',
    'feeds.bbci.co.uk',
];

app.get('/api/rss-proxy', async (req, res) => {
    const feedUrl = req.query.url;
    if (!feedUrl) return res.status(400).json({ error: 'Missing url parameter' });

    try {
        const parsedUrl = new URL(feedUrl);
        const hostname = parsedUrl.hostname;
        const bare = hostname.replace(/^www\./, '');
        const isDev = process.env.NODE_ENV !== 'production';
        const isAllowed = isDev || ALLOWED_RSS_DOMAINS.some(d => d === hostname || d === bare);
        if (!isAllowed) return res.status(403).json({ error: 'Domain not allowed' });

        const cacheKey = `rss:${feedUrl}`;
        const cached = getCached(cacheKey, 15 * 60 * 1000);
        if (cached) {
            res.set('X-Cache', 'HIT');
            res.set('Content-Type', 'application/xml');
            return res.send(cached);
        }

        const response = await fetch(feedUrl, {
            headers: {
                'User-Agent': 'AEGIS-AgriThreat-Monitor/1.0 (RSS Aggregator)',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) return res.status(response.status).json({ error: `Upstream returned ${response.status}` });

        const data = await response.text();
        setCache(cacheKey, data);
        res.set('X-Cache', 'MISS');
        res.set('Content-Type', response.headers.get('content-type') || 'application/xml');
        res.send(data);
    } catch (err) {
        console.error(`[RSS Proxy] Error fetching ${feedUrl}:`, err.message);
        res.status(502).json({ error: 'Failed to fetch feed', details: err.message });
    }
});

// ============================================================
// Climate Data Proxy
// ============================================================

app.get('/api/climate', async (req, res) => {
    const { lat, lon, start, end } = req.query;
    const cacheKey = `climate:${lat}:${lon}:${start}:${end}`;
    const cached = getCached(cacheKey, 3 * 60 * 60 * 1000);
    if (cached) { res.set('X-Cache', 'HIT'); return res.json(cached); }

    try {
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
        const data = await response.json();
        setCache(cacheKey, data);
        res.set('X-Cache', 'MISS');
        res.json(data);
    } catch (err) {
        console.error('[Climate Proxy] Error:', err.message);
        res.status(502).json({ error: 'Climate data fetch failed', details: err.message });
    }
});

// ============================================================
// WFP HungerMap LIVE Proxy (api.hungermapdata.org)
// ============================================================

app.get('/api/wfp-hungermap', async (req, res) => {
    const cacheKey = 'wfp:hungermap:json';
    const cached = getCached(cacheKey, 6 * 60 * 60 * 1000); // 6 hour cache
    if (cached) {
        res.set('X-Cache', 'HIT');
        res.set('Content-Type', 'application/json');
        return res.send(cached);
    }

    try {
        const url = 'https://api.hungermapdata.org/v1/foodsecurity/country';
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
            const data = await response.text();
            try {
                const parsed = JSON.parse(data);
                const bodyObj = typeof parsed?.body === 'string' ? JSON.parse(parsed.body) : parsed?.body;
                console.log(`[WFP HungerMap] Fetched ${bodyObj?.countries?.length || 0} countries from API`);
            } catch { /* logging only */ }
            setCache(cacheKey, data);
            res.set('X-Cache', 'MISS');
            res.set('Content-Type', 'application/json');
            return res.send(data);
        } else {
            console.error(`[WFP HungerMap API] Error ${response.status}: ${await response.text()}`);
            res.status(502).json({ error: 'HungerMap API returned an error', status: response.status });
        }
    } catch (err) {
        console.error('[WFP Proxy] Fetch failed:', err.message);
        res.status(502).json({ error: 'WFP HungerMap fetch failed', details: err.message });
    }
});

// ============================================================
// WTO SPS ePing Live API Proxy
// ============================================================

app.get('/api/wto-sps', async (req, res) => {
    const cacheKey = 'wto:sps:json';
    const cached = getCached(cacheKey, 6 * 60 * 60 * 1000); // 6 hour cache respects the severe rate limits
    if (cached) { 
        res.set('X-Cache', 'HIT'); 
        res.set('Content-Type', 'application/json'); 
        return res.send(cached); 
    }

    try {
        const apiKey = process.env.WTO_EPING_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'WTO_EPING_API_KEY is not configured in .env' });
        }

        // Fetch the latest 50 SPS notifications (domainIds=2) in English (language=1)
        const ePingUrl = 'https://api.wto.org/eping/notifications/search?language=1&domainIds=2&pageSize=50';
        
        const response = await fetch(ePingUrl, {
            headers: { 
                'User-Agent': 'AEGIS-AgriThreat-Monitor/1.0', 
                'Accept': 'application/json',
                'Ocp-Apim-Subscription-Key': apiKey 
            },
            signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
            const data = await response.text();
            setCache(cacheKey, data);
            res.set('X-Cache', 'MISS');
            res.set('Content-Type', 'application/json');
            return res.send(data);
        } else {
            console.error(`[WTO ePing API] Error ${response.status}: ${await response.text()}`);
            res.status(502).json({ error: 'WTO API returned an error', status: response.status });
        }
    } catch (err) {
        console.error('[WTO Proxy] Fetch failed:', err.message);
        res.status(502).json({ error: 'WTO data fetch failed', details: err.message });
    }
});

// ============================================================
// Food Security RSS Aggregator
// ============================================================

const FOOD_SECURITY_FEEDS = [
    // ── Primary feeds ──
    { name: 'ReliefWeb Food Security', url: 'https://reliefweb.int/updates/rss.xml?search=food+security+agriculture+disease+crop+livestock+famine' },
    { name: 'ReliefWeb Outbreaks', url: 'https://reliefweb.int/updates/rss.xml?search=epidemic+outbreak+drought+flood+locust+avian+influenza' },
    { name: 'GDACS Disasters', url: 'https://www.gdacs.org/xml/rss.xml' },
    { name: 'The New Humanitarian', url: 'https://www.thenewhumanitarian.org/rss.xml' },
    { name: 'BBC Environment', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
    // ── Cloud-friendly alternatives (work from datacenter IPs) ──
    { name: 'UN News Climate', url: 'https://news.un.org/feed/subscribe/en/news/topic/climate-change/feed/rss.xml' },
    { name: 'UN News Health', url: 'https://news.un.org/feed/subscribe/en/news/topic/health/feed/rss.xml' },
    { name: 'WHO Disease Outbreaks', url: 'https://www.who.int/feeds/entity/don/en/rss.xml' },
    { name: 'FAO News', url: 'https://www.fao.org/rss/home/en/' },
];

app.get('/api/food-security-feeds', async (req, res) => {
    const cacheKey = 'foodsec:feeds';
    const cached = getCached(cacheKey, 15 * 60 * 1000);
    if (cached) { res.set('X-Cache', 'HIT'); return res.json(cached); }

    try {
        const results = await Promise.allSettled(
            FOOD_SECURITY_FEEDS.map(async (feed) => {
                try {
                    console.log(`[Food Security] Fetching: ${feed.name} — ${feed.url}`);
                    const response = await fetch(feed.url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (compatible; AEGIS-AgriThreat-Monitor/1.0)',
                            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                        },
                        signal: AbortSignal.timeout(25000),
                    });
                    if (!response.ok) {
                        console.warn(`[Food Security] ${feed.name} returned ${response.status}`);
                        return { name: feed.name, error: response.status, xml: null };
                    }
                    const xml = await response.text();
                    console.log(`[Food Security] ${feed.name} — OK (${xml.length} bytes)`);
                    return { name: feed.name, xml, error: null };
                } catch (err) {
                    console.warn(`[Food Security] ${feed.name} failed: ${err.message}`);
                    return { name: feed.name, error: err.message, xml: null };
                }
            })
        );

        const feeds = results.filter(r => r.status === 'fulfilled').map(r => r.value).filter(f => f.xml);
        const failed = results.filter(r => r.status === 'fulfilled').map(r => r.value).filter(f => f.error);
        console.log(`[Food Security] Succeeded: ${feeds.map(f => f.name).join(', ')} | Failed: ${failed.map(f => `${f.name}(${f.error})`).join(', ') || 'none'}`);
        const response = { feeds, failed, fetchedAt: new Date().toISOString() };
        setCache(cacheKey, response);
        res.set('X-Cache', 'MISS');
        res.json(response);
    } catch (err) {
        res.status(502).json({ error: 'Food security feeds fetch failed', details: err.message });
    }
});

// ============================================================
// Health / Status endpoint
// ============================================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'AEGIS Proxy + AIS Relay',
        uptime: process.uptime(),
        ais: {
            connected: aisConnected,
            vessels: vessels.size,
            messageCount: aisMessageCount,
            lastMessage: aisLastMessage ? new Date(aisLastMessage).toISOString() : null,
            apiKeyConfigured: !!AISSTREAM_API_KEY,
        },
        cache: { entries: cache.size, keys: [...cache.keys()] },
        timestamp: new Date().toISOString(),
    });
});

// ============================================================
// SPA Fallback (production only — serves index.html for all non-API routes)
// ============================================================

if (process.env.NODE_ENV === 'production') {
    app.get('/{*splat}', (req, res) => {
        res.sendFile(join(__dirname, 'dist', 'index.html'));
    });
}

// ============================================================
// Start
// ============================================================

app.listen(PORT, () => {
    console.log(`[AEGIS] Proxy + AIS Relay running on http://localhost:${PORT}`);
    console.log(`[AEGIS] AISStream API key: ${AISSTREAM_API_KEY ? '✓ configured' : '✗ not set'}`);

    // Connect to AISStream
    if (AISSTREAM_API_KEY) {
        connectAIS();
    }

    // Periodic vessel pruning
    setInterval(pruneVessels, 5 * 60 * 1000);

    // Log AIS stats every 30 seconds
    setInterval(() => {
        if (AISSTREAM_API_KEY) {
            console.log(`[AIS] Vessels: ${vessels.size} | Messages: ${aisMessageCount} | Connected: ${aisConnected}`);
        }
    }, 30000);
});
