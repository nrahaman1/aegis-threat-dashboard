/**
 * Geo data utilities: country coordinates, agricultural zones,
 * US ports, flagged countries, and chokepoint data.
 */

/** Major agricultural zones worldwide for climate monitoring (ERA5) */
export const AGRICULTURAL_ZONES = [
    { name: 'US Corn Belt', lat: 41.5, lon: -89.0, region: 'North America', crops: 'Corn, Soybeans' },
    { name: 'US Great Plains', lat: 38.0, lon: -99.0, region: 'North America', crops: 'Wheat, Sorghum' },
    { name: 'California Central Valley', lat: 36.8, lon: -119.4, region: 'North America', crops: 'Fruits, Vegetables, Nuts' },
    { name: 'US Delta Region', lat: 33.5, lon: -90.5, region: 'North America', crops: 'Cotton, Rice, Soybeans' },
    { name: 'US Pacific NW', lat: 46.5, lon: -118.0, region: 'North America', crops: 'Wheat, Potatoes' },
    { name: 'Brazil Cerrado', lat: -15.5, lon: -47.5, region: 'South America', crops: 'Soybeans, Corn' },
    { name: 'Argentina Pampas', lat: -35.0, lon: -61.0, region: 'South America', crops: 'Wheat, Soybeans, Corn' },
    { name: 'India Punjab', lat: 30.9, lon: 75.8, region: 'South Asia', crops: 'Wheat, Rice' },
    { name: 'India Deccan Plateau', lat: 18.0, lon: 78.0, region: 'South Asia', crops: 'Cotton, Pulses' },
    { name: 'China North Plain', lat: 36.5, lon: 116.5, region: 'East Asia', crops: 'Wheat, Corn' },
    { name: 'China Yangtze Delta', lat: 31.0, lon: 121.0, region: 'East Asia', crops: 'Rice' },
    { name: 'Ukraine Breadbasket', lat: 48.4, lon: 31.2, region: 'Europe', crops: 'Wheat, Sunflower' },
    { name: 'France Beauce', lat: 48.1, lon: 1.5, region: 'Europe', crops: 'Wheat, Barley' },
    { name: 'Australia Murray-Darling', lat: -34.0, lon: 145.0, region: 'Oceania', crops: 'Wheat, Cotton, Rice' },
    { name: 'Sahel Belt', lat: 14.0, lon: 0.0, region: 'Africa', crops: 'Millet, Sorghum' },
    { name: 'East Africa Highlands', lat: -1.5, lon: 37.0, region: 'Africa', crops: 'Coffee, Tea, Maize' },
    { name: 'Nile Delta', lat: 31.0, lon: 31.0, region: 'Africa', crops: 'Cotton, Rice, Wheat' },
    { name: 'SE Asia Rice Bowl', lat: 14.0, lon: 100.5, region: 'SE Asia', crops: 'Rice, Rubber' },
    { name: 'Mekong Delta', lat: 10.0, lon: 106.0, region: 'SE Asia', crops: 'Rice' },
    { name: 'Indonesia Java', lat: -7.0, lon: 110.0, region: 'SE Asia', crops: 'Rice, Palm Oil' },
    { name: 'Central Asia Steppe', lat: 42.0, lon: 65.0, region: 'Central Asia', crops: 'Wheat, Cotton' },
    { name: 'Mediterranean Basin', lat: 38.0, lon: 20.0, region: 'Europe', crops: 'Olives, Grapes, Wheat' },
    { name: 'Mexico Bajio', lat: 21.0, lon: -101.5, region: 'North America', crops: 'Corn, Vegetables' },
    { name: 'Horn of Africa', lat: 8.0, lon: 42.0, region: 'Africa', crops: 'Sorghum, Teff' },
    { name: 'Southern Africa', lat: -25.0, lon: 28.0, region: 'Africa', crops: 'Maize, Sugarcane' },
];

/** US major agricultural ports */
export const US_PORTS = [
    { name: 'Port of Los Angeles', lat: 33.74, lon: -118.27, type: 'West Coast' },
    { name: 'Port of Long Beach', lat: 33.75, lon: -118.19, type: 'West Coast' },
    { name: 'Port of Houston', lat: 29.73, lon: -95.01, type: 'Gulf Coast' },
    { name: 'Port of New Orleans', lat: 29.93, lon: -90.03, type: 'Gulf Coast' },
    { name: 'Port of Savannah', lat: 32.08, lon: -81.09, type: 'East Coast' },
    { name: 'Port of Norfolk', lat: 36.85, lon: -76.29, type: 'East Coast' },
    { name: 'Port of Charleston', lat: 32.78, lon: -79.93, type: 'East Coast' },
    { name: 'Port of Seattle', lat: 47.58, lon: -122.35, type: 'West Coast' },
];

/** Countries with capital coordinates for geolocation */
export const COUNTRY_COORDS = {
    'Afghanistan': { lat: 34.53, lon: 69.17 },
    'Albania': { lat: 41.33, lon: 19.82 },
    'Algeria': { lat: 36.75, lon: 3.04 },
    'Angola': { lat: -8.84, lon: 13.23 },
    'Argentina': { lat: -34.60, lon: -58.38 },
    'Armenia': { lat: 40.18, lon: 44.51 },
    'Australia': { lat: -35.28, lon: 149.13 },
    'Azerbaijan': { lat: 40.41, lon: 49.87 },
    'Bangladesh': { lat: 23.81, lon: 90.41 },
    'Belarus': { lat: 53.90, lon: 27.57 },
    'Benin': { lat: 6.50, lon: 2.63 },
    'Bolivia': { lat: -16.50, lon: -68.15 },
    'Bosnia': { lat: 43.86, lon: 18.41 },
    'Botswana': { lat: -24.65, lon: 25.91 },
    'Brazil': { lat: -15.79, lon: -47.88 },
    'Burkina Faso': { lat: 12.37, lon: -1.52 },
    'Burundi': { lat: -3.38, lon: 29.36 },
    'Cambodia': { lat: 11.56, lon: 104.92 },
    'Cameroon': { lat: 3.87, lon: 11.52 },
    'Canada': { lat: 45.42, lon: -75.70 },
    'Central African Republic': { lat: 4.36, lon: 18.56 },
    'Chad': { lat: 12.13, lon: 15.05 },
    'Chile': { lat: -33.45, lon: -70.67 },
    'China': { lat: 39.91, lon: 116.39 },
    'Colombia': { lat: 4.71, lon: -74.07 },
    'Congo': { lat: -4.27, lon: 15.28 },
    'Costa Rica': { lat: 9.93, lon: -84.08 },
    'Ivory Coast': { lat: 5.35, lon: -4.01 },
    'Croatia': { lat: 45.81, lon: 15.98 },
    'Cuba': { lat: 23.11, lon: -82.37 },
    'DR Congo': { lat: -4.32, lon: 15.31 },
    'Djibouti': { lat: 11.55, lon: 43.15 },
    'Dominican Republic': { lat: 18.47, lon: -69.90 },
    'Ecuador': { lat: -0.18, lon: -78.47 },
    'Egypt': { lat: 30.04, lon: 31.24 },
    'El Salvador': { lat: 13.69, lon: -89.19 },
    'Eritrea': { lat: 15.34, lon: 38.93 },
    'Ethiopia': { lat: 9.02, lon: 38.75 },
    'Fiji': { lat: -18.14, lon: 178.44 },
    'France': { lat: 48.86, lon: 2.35 },
    'Gabon': { lat: 0.39, lon: 9.45 },
    'Gambia': { lat: 13.45, lon: -16.58 },
    'Georgia': { lat: 41.69, lon: 44.83 },
    'Germany': { lat: 52.52, lon: 13.41 },
    'Ghana': { lat: 5.55, lon: -0.20 },
    'Greece': { lat: 37.98, lon: 23.73 },
    'Guatemala': { lat: 14.63, lon: -90.51 },
    'Guinea': { lat: 9.64, lon: -13.58 },
    'Haiti': { lat: 18.54, lon: -72.34 },
    'Honduras': { lat: 14.07, lon: -87.19 },
    'India': { lat: 28.61, lon: 77.21 },
    'Indonesia': { lat: -6.21, lon: 106.85 },
    'Iran': { lat: 35.69, lon: 51.39 },
    'Iraq': { lat: 33.31, lon: 44.37 },
    'Israel': { lat: 31.77, lon: 35.23 },
    'Italy': { lat: 41.90, lon: 12.50 },
    'Jamaica': { lat: 18.01, lon: -76.79 },
    'Japan': { lat: 35.68, lon: 139.69 },
    'Jordan': { lat: 31.95, lon: 35.93 },
    'Kazakhstan': { lat: 51.17, lon: 71.45 },
    'Kenya': { lat: -1.29, lon: 36.82 },
    'Laos': { lat: 17.97, lon: 102.63 },
    'Lebanon': { lat: 33.89, lon: 35.50 },
    'Lesotho': { lat: -29.31, lon: 27.48 },
    'Liberia': { lat: 6.29, lon: -10.76 },
    'Libya': { lat: 32.90, lon: 13.18 },
    'Madagascar': { lat: -18.88, lon: 47.51 },
    'Malawi': { lat: -13.97, lon: 33.79 },
    'Malaysia': { lat: 3.14, lon: 101.69 },
    'Mali': { lat: 12.65, lon: -8.00 },
    'Mauritania': { lat: 18.09, lon: -15.98 },
    'Mexico': { lat: 19.43, lon: -99.13 },
    'Mongolia': { lat: 47.92, lon: 106.91 },
    'Morocco': { lat: 33.97, lon: -6.85 },
    'Mozambique': { lat: -25.97, lon: 32.58 },
    'Myanmar': { lat: 19.76, lon: 96.07 },
    'Namibia': { lat: -22.56, lon: 17.08 },
    'Nepal': { lat: 27.72, lon: 85.32 },
    'Netherlands': { lat: 52.37, lon: 4.90 },
    'New Zealand': { lat: -41.29, lon: 174.78 },
    'Nicaragua': { lat: 12.11, lon: -86.27 },
    'Niger': { lat: 13.51, lon: 2.11 },
    'Nigeria': { lat: 9.06, lon: 7.49 },
    'North Korea': { lat: 39.02, lon: 125.75 },
    'Pakistan': { lat: 33.69, lon: 73.04 },
    'Palestine': { lat: 31.90, lon: 35.20 },
    'Panama': { lat: 8.98, lon: -79.52 },
    'Papua New Guinea': { lat: -6.31, lon: 147.18 },
    'Paraguay': { lat: -25.26, lon: -57.58 },
    'Peru': { lat: -12.05, lon: -77.04 },
    'Philippines': { lat: 14.60, lon: 120.98 },
    'Poland': { lat: 52.23, lon: 21.01 },
    'Portugal': { lat: 38.72, lon: -9.14 },
    'Romania': { lat: 44.43, lon: 26.10 },
    'Russia': { lat: 55.76, lon: 37.62 },
    'Rwanda': { lat: -1.94, lon: 29.87 },
    'Saudi Arabia': { lat: 24.71, lon: 46.68 },
    'Senegal': { lat: 14.69, lon: -17.44 },
    'Serbia': { lat: 44.79, lon: 20.47 },
    'Sierra Leone': { lat: 8.48, lon: -13.23 },
    'Singapore': { lat: 1.35, lon: 103.82 },
    'Somalia': { lat: 2.05, lon: 45.32 },
    'South Africa': { lat: -33.93, lon: 18.42 },
    'South Korea': { lat: 37.57, lon: 126.98 },
    'South Sudan': { lat: 4.85, lon: 31.60 },
    'Spain': { lat: 40.42, lon: -3.70 },
    'Sri Lanka': { lat: 6.93, lon: 79.85 },
    'Sudan': { lat: 15.50, lon: 32.56 },
    'Swaziland': { lat: -26.32, lon: 31.14 },
    'Sweden': { lat: 59.33, lon: 18.07 },
    'Syria': { lat: 33.51, lon: 36.29 },
    'Taiwan': { lat: 25.03, lon: 121.57 },
    'Tajikistan': { lat: 38.56, lon: 68.77 },
    'Tanzania': { lat: -6.16, lon: 35.75 },
    'Thailand': { lat: 13.76, lon: 100.50 },
    'Togo': { lat: 6.13, lon: 1.22 },
    'Tunisia': { lat: 36.81, lon: 10.17 },
    'Turkey': { lat: 39.93, lon: 32.87 },
    'Turkmenistan': { lat: 37.95, lon: 58.38 },
    'UAE': { lat: 24.45, lon: 54.65 },
    'Uganda': { lat: 0.31, lon: 32.58 },
    'Ukraine': { lat: 50.45, lon: 30.52 },
    'United Kingdom': { lat: 51.51, lon: -0.13 },
    'United States': { lat: 38.91, lon: -77.02 },
    'Uruguay': { lat: -34.88, lon: -56.17 },
    'Uzbekistan': { lat: 41.30, lon: 69.28 },
    'Venezuela': { lat: 10.49, lon: -66.88 },
    'Vietnam': { lat: 21.03, lon: 105.85 },
    'Yemen': { lat: 15.37, lon: 44.19 },
    'Zambia': { lat: -15.39, lon: 28.32 },
    'Zimbabwe': { lat: -17.83, lon: 31.05 },
    'Kyrgyzstan': { lat: 42.87, lon: 74.59 },
    'Moldova': { lat: 47.01, lon: 28.86 },
    'Comoros': { lat: -11.70, lon: 43.26 },
    'Cape Verde': { lat: 14.93, lon: -23.51 },
    'Guinea-Bissau': { lat: 11.86, lon: -15.60 },
    'Sao Tome': { lat: 0.34, lon: 6.73 },
    'Solomon Islands': { lat: -9.43, lon: 160.03 },
    'Timor-Leste': { lat: -8.56, lon: 125.57 },
    'Vanuatu': { lat: -17.73, lon: 168.32 },
    'Bhutan': { lat: 27.47, lon: 89.64 },
    'Suriname': { lat: 5.85, lon: -55.17 },
    'Guyana': { lat: 6.80, lon: -58.16 },
    'Belize': { lat: 17.25, lon: -88.77 },
};

/** Countries flagged for agricultural threats (disease outbreaks, SPS violations) */
export const FLAGGED_COUNTRIES = [
    'China', 'Brazil', 'India', 'Vietnam', 'Indonesia', 'Thailand',
    'Mexico', 'Argentina', 'Russia', 'Turkey', 'Egypt', 'Pakistan',
    'Bangladesh', 'Myanmar', 'Cambodia', 'Philippines',
];

/** Maritime chokepoints from worldmonitor */
export const CHOKEPOINTS = [
    { id: 'suez', name: 'Suez Canal', lat: 30.45, lon: 32.35, routes: ['China-Europe (Suez)', 'Gulf-Europe Oil', 'Qatar LNG-Europe'], threatLevel: 'high', description: 'JWC Listed Area — adjacent to active Red Sea conflict' },
    { id: 'malacca', name: 'Strait of Malacca', lat: 1.43, lon: 103.5, routes: ['China-Middle East Oil', 'China-Europe (via Suez)', 'Japan-Middle East Oil'], threatLevel: 'normal', description: 'Critical SE Asia shipping corridor' },
    { id: 'hormuz', name: 'Strait of Hormuz', lat: 26.56, lon: 56.25, routes: ['Gulf Oil Exports', 'Qatar LNG', 'Iran Exports'], threatLevel: 'critical', description: 'Active conflict — Iran blockade risk' },
    { id: 'bab_el_mandeb', name: 'Bab el-Mandeb', lat: 12.58, lon: 43.33, routes: ['Suez-Indian Ocean', 'Gulf-Europe Oil', 'Red Sea Transit'], threatLevel: 'critical', description: 'JWC Listed — active Houthi attacks on shipping' },
    { id: 'panama', name: 'Panama Canal', lat: 9.08, lon: -79.68, routes: ['US East Coast-Asia', 'US East Coast-South America', 'Atlantic-Pacific Bulk'], threatLevel: 'normal', description: 'Key agricultural trade corridor' },
    { id: 'taiwan', name: 'Taiwan Strait', lat: 24.0, lon: 119.5, routes: ['China-Japan Trade', 'Korea-Southeast Asia', 'Pacific Semiconductor'], threatLevel: 'elevated', description: 'Cross-strait military tensions' },
];

/** Get severity color for climate anomalies */
export function getSeverityColor(severity) {
    switch (severity) {
        case 'EXTREME': return [239, 68, 68, 220];
        case 'MODERATE': return [251, 191, 36, 200];
        case 'NORMAL': return [16, 185, 129, 180];
        default: return [148, 163, 184, 150];
    }
}

/** Get threat level color */
export function getThreatColor(level) {
    switch (level) {
        case 'critical': return [220, 38, 38, 230];
        case 'high': return [239, 68, 68, 210];
        case 'elevated': return [249, 115, 22, 200];
        case 'normal': return [16, 185, 129, 180];
        default: return [148, 163, 184, 150];
    }
}

/** Try to match a country name from text — includes aliases, abbreviations, regions */
const COUNTRY_ALIASES = {
    // Abbreviations & common names
    'drc': 'DR Congo', 'democratic republic of congo': 'DR Congo', 'congo-kinshasa': 'DR Congo',
    'roc': 'Congo', 'congo-brazzaville': 'Congo', 'republic of congo': 'Congo',
    'uae': 'UAE', 'united arab emirates': 'UAE', 'emirates': 'UAE',
    'uk': 'United Kingdom', 'britain': 'United Kingdom', 'england': 'United Kingdom',
    'usa': 'United States', 'us': 'United States', 'america': 'United States',
    'opt': 'Palestine', 'gaza': 'Palestine', 'west bank': 'Palestine', 'palestinian': 'Palestine',
    'ivory coast': 'Ivory Coast', "cote d'ivoire": 'Ivory Coast', 'côte d\'ivoire': 'Ivory Coast',
    'eswatini': 'Swaziland', 'swaziland': 'Swaziland',
    'burma': 'Myanmar', 'myanmar': 'Myanmar',
    'north korea': 'North Korea', 'dprk': 'North Korea',
    'south korea': 'South Korea', 'korea': 'South Korea',
    'south sudan': 'South Sudan',
    'south africa': 'South Africa',
    'saudi arabia': 'Saudi Arabia', 'saudi': 'Saudi Arabia',
    'sri lanka': 'Sri Lanka',
    'central african republic': 'Central African Republic', 'car': 'Central African Republic',
    'papua new guinea': 'Papua New Guinea', 'png': 'Papua New Guinea',
    'dominican republic': 'Dominican Republic',
    'el salvador': 'El Salvador',
    'sierra leone': 'Sierra Leone',
    'new zealand': 'New Zealand',
    'turkiye': 'Turkey', 'türkiye': 'Turkey',
    'timor-leste': 'Timor-Leste', 'east timor': 'Timor-Leste',
    // WFP / UN official names
    'iran (islamic republic of)': 'Iran',
    'syrian arab republic': 'Syria',
    'united republic of tanzania': 'Tanzania',
    'viet nam': 'Vietnam',
    "lao people's democratic republic": 'Laos',
    'sao tome and principe': 'Sao Tome',
    'congo, democratic republic of the': 'DR Congo',
    'democratic republic of the congo': 'DR Congo',
    'republic of the congo': 'Congo',
    'bolivia (plurinational state of)': 'Bolivia',
    'venezuela (bolivarian republic of)': 'Venezuela',
    'republic of moldova': 'Moldova',
    'moldova, republic of': 'Moldova',
    'cabo verde': 'Cape Verde',
    'kyrgyz republic': 'Kyrgyzstan',
    'bosnia and herzegovina': 'Bosnia',
    'guinea-bissau': 'Guinea-Bissau',
    // Region names → representative country
    'sahel': 'Niger', 'sahelian': 'Niger',
    'horn of africa': 'Ethiopia',
    'great lakes': 'DR Congo', 'african great lakes': 'DR Congo',
    'middle east': 'Iraq', 'gulf states': 'Saudi Arabia',
    'southeast asia': 'Thailand', 'se asia': 'Thailand',
    'south asia': 'India', 'southern asia': 'India',
    'east africa': 'Kenya', 'eastern africa': 'Kenya',
    'west africa': 'Nigeria', 'western africa': 'Nigeria',
    'southern africa': 'South Africa',
    'central africa': 'Cameroon',
    'north africa': 'Egypt', 'northern africa': 'Egypt',
    'central america': 'Guatemala',
    'caribbean': 'Haiti',
    'pacific islands': 'Fiji', 'pacific island': 'Fiji',
    'mekong': 'Vietnam',
    'levant': 'Lebanon', 'mashreq': 'Lebanon',
};

export function matchCountry(text) {
    if (!text) return null;
    const t = text.toLowerCase();

    // Check aliases — use word-boundary regex for short aliases to avoid false positives
    for (const [alias, country] of Object.entries(COUNTRY_ALIASES)) {
        if (alias.length <= 3) {
            // Short aliases like 'us', 'uk', 'drc' need word boundaries
            const re = new RegExp(`\\b${alias}\\b`, 'i');
            if (re.test(t)) return country;
        } else {
            if (t.includes(alias)) return country;
        }
    }

    // Then check direct country names (longest first to avoid partial matches)
    const countries = Object.keys(COUNTRY_COORDS).sort((a, b) => b.length - a.length);
    for (const country of countries) {
        if (t.includes(country.toLowerCase())) return country;
    }

    return null;
}
