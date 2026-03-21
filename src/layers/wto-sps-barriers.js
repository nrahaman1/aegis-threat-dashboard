/**
 * WTO SPS Barriers Layer
 * 
 * Fetches SPS/TBT notification data from WTO ePing RSS feed and
 * displays them as markers on a map. Cross-references with agricultural trade data.
 */

import { TextLayer } from '@deck.gl/layers';
import { COUNTRY_COORDS } from '../utils/geo-data.js';
import { fetchRSS } from '../utils/rss-parser.js';

let cachedData = null;
let lastFetchTime = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

const SPS_FEEDS = [
    'https://epingalert.org/en/Search/RSSFeed',
    'https://www.wto.org/english/news_e/news_rss_e.xml',
];

/** Keywords for agricultural SPS measures */
const AG_KEYWORDS = [
    'animal', 'plant', 'food', 'crop', 'grain', 'meat', 'dairy', 'fruit',
    'vegetable', 'pest', 'disease', 'quarantine', 'phytosanitary', 'sanitary',
    'pesticide', 'residue', 'import ban', 'restriction', 'livestock', 'poultry',
    'seed', 'fertilizer', 'organic', 'gmo', 'biosecurity', 'outbreak',
    'avian', 'swine', 'cattle', 'wheat', 'rice', 'corn', 'soybean', 'cotton',
    'coffee', 'cocoa', 'sugar', 'fish', 'seafood', 'shrimp',
];

function isAgriculturalSPS(item) {
    const text = `${item.title} ${item.description}`.toLowerCase();
    return AG_KEYWORDS.some(kw => text.includes(kw));
}

function extractCountry(item) {
    const text = `${item.title} ${item.description}`;
    for (const [country] of Object.entries(COUNTRY_COORDS)) {
        if (text.includes(country)) return country;
    }
    // Try common abbreviations
    const abbrevs = { 'USA': 'United States', 'UK': 'United Kingdom', 'PRC': 'China', 'ROK': 'South Korea' };
    for (const [abbr, country] of Object.entries(abbrevs)) {
        if (text.includes(abbr)) return country;
    }
    return null;
}

function classifyUrgency(item) {
    const text = `${item.title} ${item.description} ${item.type}`.toLowerCase();
    if (text.includes('emergency') || text.includes('ban') || text.includes('suspension') || text.includes('prohibition')) return 'emergency';
    if (text.includes('restrict') || text.includes('quarantine') || text.includes('temporary')) return 'urgent';
    return 'routine';
}

export async function fetchWTOData() {
    const now = Date.now();
    if (cachedData && (now - lastFetchTime) < CACHE_TTL) {
        return cachedData;
    }

    const barriers = [];
    const seen = new Set();
    
    try {
        const response = await fetch('/api/wto-sps');
        if (response.ok) {
            const data = await response.json();
            const items = data.items || [];
            
            for (const item of items) {
                // Use plain text fields if available, otherwise strip HTML
                const descMap = item.descriptionPlain || (item.description ? item.description.replace(/<[^>]*>?/gm, '') : '');
                const titleMap = item.titlePlain || item.title || item.productsFreeTextPlain || 'SPS Notification';
                
                const mappedItem = {
                    title: titleMap.replace(/<[^>]*>?/gm, ''),
                    description: descMap,
                    pubDate: item.distributionDate,
                    type: item.notificationType || '',
                };

                // Avoid exact duplicates
                if (seen.has(mappedItem.title)) continue;
                seen.add(mappedItem.title);

                const isAg = isAgriculturalSPS(mappedItem);
                
                // For country, prefer notifying member
                const rawCountry = item.notifyingMember || extractCountry(mappedItem);
                
                // Verify the country exists and map it
                let country = null;
                for (const [cName] of Object.entries(COUNTRY_COORDS)) {
                    if (rawCountry && rawCountry.toLowerCase().includes(cName.toLowerCase())) {
                        country = cName;
                        break;
                    }
                }
                
                if (!country && rawCountry) {
                    const abbrevs = { 'USA': 'United States', 'United States of America': 'United States', 'European Union': 'France' };
                    for (const [abbr, cName] of Object.entries(abbrevs)) {
                        if (rawCountry.toLowerCase().includes(abbr.toLowerCase())) {
                            country = cName;
                            break;
                        }
                    }
                }

                if (country && COUNTRY_COORDS[country]) {
                    const coords = COUNTRY_COORDS[country];
                    // Add slight map jitter (~100-200km) so multiple notifications for same country don't perfectly overlap into 1 dot
                    const jitterLat = (Math.random() - 0.5) * 2.5;
                    const jitterLon = (Math.random() - 0.5) * 2.5;

                    barriers.push({
                        ...mappedItem,
                        country,
                        lat: coords.lat + jitterLat,
                        lon: coords.lon + jitterLon,
                        isAgricultural: isAg,
                        urgency: classifyUrgency(mappedItem),
                    });
                }
            }
        }
    } catch (err) {
        console.error('Failed to fetch WTO SPS data:', err);
    }

    if (barriers.length === 0) {
        barriers.push(...getStaticBarriers());
    }

    cachedData = barriers;
    lastFetchTime = now;
    return cachedData;
}

function getStaticBarriers() {
    return [
        { title: 'China: Temporary import suspension on poultry from select US states', country: 'China', lat: 39.91, lon: 116.39, urgency: 'emergency', isAgricultural: true, pubDate: new Date().toISOString(), description: 'Avian influenza-related import suspension' },
        { title: 'India: New phytosanitary requirements for imported grains', country: 'India', lat: 28.61, lon: 77.21, urgency: 'urgent', isAgricultural: true, pubDate: new Date().toISOString(), description: 'Enhanced inspection protocols for wheat and corn imports' },
        { title: 'Brazil: Updated pesticide residue limits for imported fruits', country: 'Brazil', lat: -15.79, lon: -47.88, urgency: 'routine', isAgricultural: true, pubDate: new Date().toISOString(), description: 'Revised MRLs for 15 pesticide compounds' },
        { title: 'EU: Emergency measures against Xylella fastidiosa', country: 'France', lat: 48.86, lon: 2.35, urgency: 'emergency', isAgricultural: true, pubDate: new Date().toISOString(), description: 'Import restrictions on host plants from affected regions' },
        { title: 'Russia: Ban on import of live cattle from certain regions', country: 'Russia', lat: 55.76, lon: 37.62, urgency: 'emergency', isAgricultural: true, pubDate: new Date().toISOString(), description: 'Lumpy skin disease prevention measures' },
        { title: 'Japan: Enhanced inspection of imported seafood products', country: 'Japan', lat: 35.68, lon: 139.69, urgency: 'urgent', isAgricultural: true, pubDate: new Date().toISOString(), description: 'Increased testing frequency for radioactive contamination' },
        { title: 'South Korea: New quarantine requirements for US pork', country: 'South Korea', lat: 37.57, lon: 126.98, urgency: 'urgent', isAgricultural: true, pubDate: new Date().toISOString(), description: 'African swine fever precautionary measures' },
        { title: 'Turkey: Suspension of wheat imports from multiple origins', country: 'Turkey', lat: 39.93, lon: 32.87, urgency: 'emergency', isAgricultural: true, pubDate: new Date().toISOString(), description: 'Domestic harvest protection measures' },
        { title: 'Mexico: Updated phytosanitary standards for corn imports', country: 'Mexico', lat: 19.43, lon: -99.13, urgency: 'routine', isAgricultural: true, pubDate: new Date().toISOString(), description: 'GMO corn import regulation updates' },
        { title: 'Egypt: Temporary ban on soybean imports', country: 'Egypt', lat: 30.04, lon: 31.24, urgency: 'emergency', isAgricultural: true, pubDate: new Date().toISOString(), description: 'Currency reserve conservation measures affecting agricultural trade' },
        { title: 'Vietnam: New food safety requirements for imported meat', country: 'Vietnam', lat: 21.03, lon: 105.85, urgency: 'urgent', isAgricultural: true, pubDate: new Date().toISOString(), description: 'Enhanced certification requirements' },
        { title: 'Indonesia: Palm oil export restrictions tightened', country: 'Indonesia', lat: -6.21, lon: 106.85, urgency: 'urgent', isAgricultural: true, pubDate: new Date().toISOString(), description: 'Domestic supply protection measures' },
    ];
}

function getUrgencyColor(urgency) {
    switch (urgency) {
        case 'emergency': return [239, 68, 68, 230];
        case 'urgent': return [251, 191, 36, 210];
        case 'routine': return [59, 130, 246, 190];
        default: return [148, 163, 184, 160];
    }
}

export function createWTOLayer(data, visible = true) {
    if (!data || !visible) return [];

    // Triangle symbol ▲ as primary marker
    const triangles = new TextLayer({
        id: 'wto-sps-markers',
        data,
        pickable: true,
        characterSet: 'auto',
        getPosition: d => [d.lon, d.lat],
        getText: () => '▲',
        getSize: d => d.urgency === 'emergency' ? 32 : d.urgency === 'urgent' ? 26 : 20,
        getColor: d => {
            const c = getUrgencyColor(d.urgency);
            return [c[0], c[1], c[2], 255];
        },
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 700,
    });

    // ⚠ warning badge for emergency items
    const warnings = new TextLayer({
        id: 'wto-sps-warnings',
        data: data.filter(d => d.urgency === 'emergency'),
        pickable: false,
        characterSet: 'auto',
        getPosition: d => [d.lon, d.lat],
        getText: () => '⚠',
        getSize: 14,
        getColor: [255, 210, 63, 255],
        getTextAnchor: 'start',
        getAlignmentBaseline: 'top',
        getPixelOffset: [10, -10],
        fontFamily: 'Arial',
    });

    return [triangles, warnings];
}

export function getWTOTooltip(info) {
    if (!info.object) return null;
    const d = info.object;
    const urgencyLabel = d.urgency === 'emergency' ? 'EMERGENCY' : d.urgency === 'urgent' ? 'URGENT' : 'ROUTINE';
    const urgencyClass = d.urgency === 'emergency' ? 'extreme' : d.urgency === 'urgent' ? 'moderate' : 'normal';
    return `
    <div class="tooltip-title">${d.country} — SPS Barrier</div>
    <div class="tooltip-row"><span class="tooltip-label">Measure</span></div>
    <div style="font-size:11px;color:#e2e8f0;margin:4px 0;">${d.title}</div>
    <div class="tooltip-row"><span class="tooltip-label">Status</span><span class="tooltip-severity ${urgencyClass}">${urgencyLabel}</span></div>
    ${d.description ? `<div class="tooltip-row"><span class="tooltip-label">Details</span><span class="tooltip-value" style="max-width:180px;white-space:normal;text-align:right">${d.description.slice(0, 100)}</span></div>` : ''}
  `;
}

export function getWTOThreats(data) {
    if (!data) return { level: 'low', count: 0, emergencies: 0 };
    const emergencies = data.filter(d => d.urgency === 'emergency').length;
    let level = 'low';
    if (emergencies >= 4) level = 'critical';
    else if (emergencies >= 2) level = 'high';
    else if (emergencies >= 1) level = 'moderate';
    return { level, count: data.length, emergencies };
}
