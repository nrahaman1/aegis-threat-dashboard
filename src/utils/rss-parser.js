/**
 * RSS/Atom Feed Parser Utility
 * Uses local proxy server (/api/rss-proxy) to avoid CORS issues.
 * Falls back to direct fetch only if proxy is unavailable.
 */

/**
 * Fetch and parse an RSS/Atom feed via the local proxy
 * @param {string} feedUrl - The RSS feed URL to fetch
 * @returns {Promise<Array>} Array of parsed feed items
 */
export async function fetchRSS(feedUrl) {
    const xml = await fetchFeedXML(feedUrl);
    if (!xml) return [];
    return parseXML(xml);
}

/**
 * Fetch raw XML from a feed URL via proxy
 */
export async function fetchFeedXML(feedUrl) {
    // Use local proxy (Vite proxies /api/* to Express server)
    try {
        const proxyUrl = `/api/rss-proxy?url=${encodeURIComponent(feedUrl)}`;
        const resp = await fetch(proxyUrl, {
            signal: AbortSignal.timeout(15000),
        });
        if (resp.ok) {
            return await resp.text();
        }
        console.warn(`[RSS] Proxy returned ${resp.status} for ${feedUrl}`);
    } catch (err) {
        console.warn(`[RSS] Proxy failed for ${feedUrl}:`, err.message);
    }

    // Direct fallback (may fail due to CORS, but worth trying)
    try {
        const resp = await fetch(feedUrl, {
            headers: { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
            signal: AbortSignal.timeout(10000),
        });
        if (resp.ok) return await resp.text();
    } catch { /* CORS blocked — expected */ }

    return null;
}

/**
 * Parse RSS/Atom XML string into normalized items
 */
export function parseXML(xml) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        // Check for parse errors
        const parseError = doc.querySelector('parsererror');
        if (parseError) return [];

        // Try RSS 2.0 first
        const rssItems = doc.querySelectorAll('item');
        if (rssItems.length > 0) {
            return Array.from(rssItems).map(item => ({
                title: item.querySelector('title')?.textContent?.trim() || '',
                link: item.querySelector('link')?.textContent?.trim() || '',
                description: item.querySelector('description')?.textContent?.trim() || '',
                pubDate: item.querySelector('pubDate')?.textContent?.trim() || '',
                category: item.querySelector('category')?.textContent?.trim() || '',
            }));
        }

        // Try Atom
        const atomEntries = doc.querySelectorAll('entry');
        if (atomEntries.length > 0) {
            return Array.from(atomEntries).map(entry => ({
                title: entry.querySelector('title')?.textContent?.trim() || '',
                link: entry.querySelector('link')?.getAttribute('href') || '',
                description: entry.querySelector('summary')?.textContent?.trim() || entry.querySelector('content')?.textContent?.trim() || '',
                pubDate: entry.querySelector('published')?.textContent?.trim() || entry.querySelector('updated')?.textContent?.trim() || '',
                category: entry.querySelector('category')?.getAttribute('term') || '',
            }));
        }

        return [];
    } catch (err) {
        console.error('[RSS] Parse error:', err);
        return [];
    }
}
