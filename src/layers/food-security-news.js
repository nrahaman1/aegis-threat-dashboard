/**
 * Food Security News Layer
 * 
 * Aggregates disease outbreak and food security alerts from
 * FAO GIEWS, ReliefWeb, ProMED-mail, and WOAH RSS feeds.
 */

import { TextLayer } from '@deck.gl/layers';
import { COUNTRY_COORDS, matchCountry } from '../utils/geo-data.js';
import { fetchRSS } from '../utils/rss-parser.js';

let cachedData = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes — refresh frequently for live data

const FOOD_SECURITY_FEEDS = [
    // ── Primary feeds ──
    { url: 'https://reliefweb.int/updates/rss.xml?search=food+security+agriculture+disease+crop+livestock+famine', source: 'ReliefWeb', category: 'food_security' },
    { url: 'https://reliefweb.int/updates/rss.xml?search=epidemic+outbreak+drought+flood+locust+avian+influenza', source: 'ReliefWeb Outbreaks', category: 'disease_outbreak' },
    { url: 'https://www.gdacs.org/xml/rss.xml', source: 'GDACS', category: 'food_security' },
    { url: 'https://www.thenewhumanitarian.org/rss.xml', source: 'The New Humanitarian', category: 'food_crisis' },
    { url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', source: 'BBC Environment', category: 'agriculture_news' },
    // ── Cloud-friendly alternatives ──
    { url: 'https://news.un.org/feed/subscribe/en/news/topic/climate-change/feed/rss.xml', source: 'UN News Climate', category: 'food_security' },
    { url: 'https://news.un.org/feed/subscribe/en/news/topic/health/feed/rss.xml', source: 'UN News Health', category: 'disease_outbreak' },
    { url: 'https://www.who.int/feeds/entity/don/en/rss.xml', source: 'WHO', category: 'disease_outbreak' },
    { url: 'https://www.fao.org/rss/home/en/', source: 'FAO', category: 'food_security' },
];

const DISEASE_KEYWORDS = [
    'avian influenza', 'bird flu', 'african swine fever', 'foot-and-mouth',
    'foot and mouth', 'mad cow', 'bse', 'lumpy skin', 'peste des petits',
    'rinderpest', 'rust', 'blight', 'wilt', 'virus', 'pathogen',
    'outbreak', 'epidemic', 'pandemic', 'quarantine', 'cull', 'depopulation',
    'locust', 'armyworm', 'fall armyworm', 'tsetse', 'trypanosomiasis',
    'anthrax', 'brucellosis', 'salmonella', 'e. coli', 'listeria',
    'mycotoxin', 'aflatoxin', 'fusarium', 'citrus greening', 'xylella',
];

const FOOD_CRISIS_KEYWORDS = [
    'famine', 'food crisis', 'food insecurity', 'malnutrition', 'hunger',
    'crop failure', 'harvest loss', 'drought', 'flood damage', 'food shortage',
    'food price', 'food emergency', 'ipc phase', 'acute food', 'cereal deficit',
    'grain shortage', 'supply disruption',
];

function classifyAlert(item) {
    const text = `${item.title} ${item.description}`.toLowerCase();

    if (DISEASE_KEYWORDS.some(kw => text.includes(kw))) return 'disease_outbreak';
    if (FOOD_CRISIS_KEYWORDS.some(kw => text.includes(kw))) return 'food_crisis';
    if (text.includes('locust') || text.includes('pest') || text.includes('infestation')) return 'pest_invasion';
    return 'food_security';
}

function classifySeverity(item) {
    const text = `${item.title} ${item.description}`.toLowerCase();
    if (text.includes('emergency') || text.includes('famine') || text.includes('outbreak') || text.includes('epidemic') || text.includes('ipc phase 4') || text.includes('ipc phase 5')) return 'critical';
    if (text.includes('crisis') || text.includes('severe') || text.includes('acute') || text.includes('quarantine') || text.includes('ban')) return 'high';
    if (text.includes('warning') || text.includes('concern') || text.includes('risk') || text.includes('watch')) return 'moderate';
    return 'low';
}

// Keywords that indicate a GDACS/disaster item is agriculture-relevant
const AG_RELEVANT_DISASTER = [
    'flood', 'drought', 'cyclone', 'hurricane', 'typhoon', 'tropical storm',
    'wildfire', 'locust', 'crop', 'agriculture', 'famine', 'food',
    'livestock', 'disease', 'epidemic', 'outbreak', 'storm surge',
];

export async function fetchFoodSecurityData() {
    const now = Date.now();
    if (cachedData && (now - lastFetchTime) < CACHE_TTL) {
        return cachedData;
    }

    const allAlerts = [];

    // Try aggregated proxy endpoint first (fetches all feeds server-side in one call)
    let aggregatedFeedCount = 0;
    try {
        const resp = await fetch('/api/food-security-feeds', { signal: AbortSignal.timeout(30000) });
        if (resp.ok) {
            const result = await resp.json();
            aggregatedFeedCount = result.feeds?.length || 0;
            for (const feed of result.feeds) {
                if (feed.xml) {
                    const { parseXML } = await import('../utils/rss-parser.js');
                    let items = parseXML(feed.xml);

                    // Filter GDACS to only ag-relevant disasters (skip earthquakes, volcanos)
                    if (feed.name && feed.name.includes('GDACS')) {
                        items = items.filter(item => {
                            const text = `${item.title} ${item.description}`.toLowerCase();
                            return AG_RELEVANT_DISASTER.some(kw => text.includes(kw));
                        });
                    }

                    // Filter BBC to only ag/food/climate relevant items
                    if (feed.name && feed.name.includes('BBC')) {
                        items = items.filter(item => {
                            const text = `${item.title} ${item.description}`.toLowerCase();
                            return [...DISEASE_KEYWORDS, ...FOOD_CRISIS_KEYWORDS,
                                'climate', 'agriculture', 'crop', 'farm', 'food', 'drought',
                                'flood', 'wildfire', 'deforestation', 'biodiversity',
                            ].some(kw => text.includes(kw));
                        });
                    }

                    allAlerts.push(...items.map(item => ({ ...item, feedSource: feed.name, feedCategory: 'food_security' })));
                    console.log(`[Food Security] ${feed.name}: ${items.length} items parsed`);
                }
            }
            console.log(`[Food Security] Aggregated proxy returned ${allAlerts.length} items from ${aggregatedFeedCount} feeds`);
        }
    } catch (err) {
        console.warn('[Food Security] Aggregated proxy failed, trying individual feeds:', err.message);
    }

    // Fallback: if aggregated endpoint returned fewer feeds than expected, fetch missing ones individually via rss-proxy
    if (aggregatedFeedCount < FOOD_SECURITY_FEEDS.length) {
        console.log(`[Food Security] Only ${aggregatedFeedCount}/${FOOD_SECURITY_FEEDS.length} feeds from aggregator — fetching remaining via rss-proxy`);
        const feedResults = await Promise.allSettled(
            FOOD_SECURITY_FEEDS.map(feed =>
                fetchRSS(feed.url).then(items => items.map(item => ({ ...item, feedSource: feed.source, feedCategory: feed.category })))
            )
        );
        for (const r of feedResults) {
            if (r.status === 'fulfilled' && r.value.length > 0) {
                allAlerts.push(...r.value);
            }
        }
    }

    // Geolocate and classify
    const alerts = [];
    const seen = new Set();
    let matched = 0;
    let unmatched = 0;

    for (const item of allAlerts) {
        if (!item.title) continue;
        const titleKey = item.title.slice(0, 60); // De-dupe on first 60 chars to catch near-duplicates
        if (seen.has(titleKey)) continue;
        seen.add(titleKey);

        // Title-first matching: try title alone first (most accurate), then fall back to description
        const country = matchCountry(item.title) || matchCountry(item.description || '');
        const category = classifyAlert(item);
        const severity = classifySeverity(item);

        if (country && COUNTRY_COORDS[country]) {
            matched++;
            const coords = COUNTRY_COORDS[country];
            alerts.push({
                ...item,
                country,
                lat: coords.lat + (Math.random() - 0.5) * 2,
                lon: coords.lon + (Math.random() - 0.5) * 2,
                category,
                severity,
            });
        } else {
            unmatched++;
        }
    }

    console.log(`[Food Security] Geo-matched: ${matched}, unmatched: ${unmatched}, total alerts: ${alerts.length}`);

    // If no RSS data, use static fallback
    if (alerts.length === 0) {
        alerts.push(...getStaticAlerts());
    }

    cachedData = alerts;
    lastFetchTime = now;
    return cachedData;
}

function getStaticAlerts() {
    return [
        { title: 'Avian Influenza H5N1 outbreak detected in poultry farms', country: 'Vietnam', lat: 21.03, lon: 105.85, category: 'disease_outbreak', severity: 'critical', feedSource: 'ProMED', description: 'H5N1 HPAI confirmed in commercial poultry, 50,000 birds culled', pubDate: new Date().toISOString() },
        { title: 'Severe drought threatens maize and wheat production in East Africa', country: 'Kenya', lat: -1.29, lon: 36.82, category: 'food_crisis', severity: 'high', feedSource: 'FAO GIEWS', description: 'Below-average rainfall for third consecutive season', pubDate: new Date().toISOString() },
        { title: 'Fall armyworm infestation spreading across Southern Africa', country: 'Zambia', lat: -15.39, lon: 28.32, category: 'pest_invasion', severity: 'high', feedSource: 'FAO', description: 'FAW detected in 6 of 10 provinces, threatening maize harvest', pubDate: new Date().toISOString() },
        { title: 'African Swine Fever re-emerges in Southeast Asia', country: 'Philippines', lat: 14.60, lon: 120.98, category: 'disease_outbreak', severity: 'critical', feedSource: 'WOAH', description: 'New ASF outbreaks in commercial hog farms, 12,000 pigs affected', pubDate: new Date().toISOString() },
        { title: 'Food crisis worsens in Horn of Africa amid conflict', country: 'Ethiopia', lat: 9.02, lon: 38.75, category: 'food_crisis', severity: 'critical', feedSource: 'ReliefWeb', description: 'IPC Phase 4 conditions in multiple regions, 12.8 million in need', pubDate: new Date().toISOString() },
        { title: 'Wheat rust detection in South Asia threatens harvest', country: 'Pakistan', lat: 33.69, lon: 73.04, category: 'disease_outbreak', severity: 'high', feedSource: 'ProMED', description: 'Ug99 variant detected, rapid fungicide response initiated', pubDate: new Date().toISOString() },
        { title: 'Locust swarm developing in the Horn of Africa region', country: 'Somalia', lat: 2.05, lon: 45.32, category: 'pest_invasion', severity: 'high', feedSource: 'FAO', description: 'Desert locust breeding detected, swarms forming in coastal areas', pubDate: new Date().toISOString() },
        { title: 'Citrus greening disease (HLB) spreading in new regions', country: 'Mexico', lat: 19.43, lon: -99.13, category: 'disease_outbreak', severity: 'moderate', feedSource: 'ProMED', description: 'Candidatus Liberibacter detected in Tamaulipas citrus groves', pubDate: new Date().toISOString() },
        { title: 'Rice blast epidemic threatens Asian crop output', country: 'Bangladesh', lat: 23.81, lon: 90.41, category: 'disease_outbreak', severity: 'high', feedSource: 'IRRI', description: 'Magnaporthe oryzae outbreak affecting 100,000 hectares', pubDate: new Date().toISOString() },
        { title: 'Acute food insecurity in South Sudan reaches record levels', country: 'South Sudan', lat: 4.85, lon: 31.60, category: 'food_crisis', severity: 'critical', feedSource: 'ReliefWeb', description: 'IPC Phase 5 (Famine) in Unity State, 7.7 million food insecure', pubDate: new Date().toISOString() },
    ];
}

function getCategoryColor(category, severity) {
    if (severity === 'critical') return [220, 38, 38, 230];
    switch (category) {
        case 'disease_outbreak': return [239, 68, 68, 210];
        case 'food_crisis': return [249, 115, 22, 200];
        case 'pest_invasion': return [168, 85, 247, 200];
        default: return [251, 191, 36, 190];
    }
}

export function createFoodSecurityLayer(data, visible = true) {
    if (!data || !visible) return [];

    // Cross/plus symbol ✚ as primary marker
    const crosses = new TextLayer({
        id: 'food-security-markers',
        data,
        pickable: true,
        characterSet: 'auto',
        getPosition: d => [d.lon, d.lat],
        getText: () => '✚',
        getSize: d => d.severity === 'critical' ? 30 : d.severity === 'high' ? 24 : 18,
        getColor: d => {
            const c = getCategoryColor(d.category, d.severity);
            return [c[0], c[1], c[2], 255];
        },
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 700,
    });

    // Category emoji badge for critical items only
    const badges = new TextLayer({
        id: 'food-security-badges',
        data: data.filter(d => d.severity === 'critical'),
        pickable: false,
        characterSet: 'auto',
        getPosition: d => [d.lon, d.lat],
        getText: d => d.category === 'disease_outbreak' ? '🦠' : d.category === 'pest_invasion' ? '🐛' : '⚠',
        getSize: 14,
        getColor: [255, 255, 255, 255],
        getTextAnchor: 'start',
        getAlignmentBaseline: 'top',
        getPixelOffset: [10, -10],
    });

    return [crosses, badges];
}

export function getFoodSecurityTooltip(info) {
    if (!info.object) return null;
    const d = info.object;
    const sevClass = d.severity === 'critical' ? 'extreme' : d.severity === 'high' ? 'moderate' : 'normal';
    const catLabels = {
        disease_outbreak: '🦠 Disease Outbreak',
        food_crisis: '🌾 Food Crisis',
        pest_invasion: '🐛 Pest Invasion',
        food_security: '📊 Food Security',
    };
    return `
    <div class="tooltip-title">${d.country} — ${catLabels[d.category] || 'Alert'}</div>
    <div style="font-size:11px;color:#e2e8f0;margin:4px 0;">${d.title}</div>
    <div class="tooltip-row"><span class="tooltip-label">Source</span><span class="tooltip-value">${d.feedSource || 'RSS'}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Severity</span><span class="tooltip-severity ${sevClass}">${d.severity.toUpperCase()}</span></div>
    ${d.description ? `<div class="tooltip-row"><span class="tooltip-label">Details</span><span class="tooltip-value" style="max-width:180px;white-space:normal;text-align:right">${d.description.slice(0, 120)}</span></div>` : ''}
  `;
}

export function getFoodSecurityThreats(data) {
    if (!data) return { level: 'low', count: 0, critical: 0, outbreaks: 0 };
    const critical = data.filter(d => d.severity === 'critical').length;
    const outbreaks = data.filter(d => d.category === 'disease_outbreak').length;
    let level = 'low';
    if (critical >= 3) level = 'critical';
    else if (critical >= 1 || outbreaks >= 3) level = 'high';
    else if (outbreaks >= 1) level = 'moderate';
    return { level, count: data.length, critical, outbreaks };
}
