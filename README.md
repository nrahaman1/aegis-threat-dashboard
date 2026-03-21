# AEGIS — Agriculture Early-warning Geospatial Intelligence System

**[Live Dashboard](https://aegis-threat-dashboard.onrender.com/)**

A real-time global intelligence dashboard for early detection of threats to United States agriculture. AEGIS monitors climate anomalies, trade barriers, disease outbreaks, food insecurity, and maritime shipping disruptions — fusing data from 10+ live sources into a unified operational picture.

> **Note:** The live instance runs on Render's free tier. It may take ~30 seconds to wake up on first visit if the service has been idle.

## Features

- **5 live data layers** with unique map markers for instant visual differentiation
- **AG Risk Index (0–100)** composite threat score computed from all active layers
- **30-second radar sweep** auto-refresh cycle keeps data near-real-time
- **Switchable basemaps** — Dark, Light, Satellite, and Terrain
- **Interactive tooltips** with detailed threat metadata on hover
- **Live alert ticker** scrolling breaking threats across the bottom bar
- **Responsive sidebar** with layer toggles, threat cards, and alert feed

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Browser (localhost:4200)                        │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │  MapLibre GL  │  │  deck.gl MapboxOverlay │   │
│  │  (basemap)    │  │  (5 data layers)       │   │
│  └──────────────┘  └────────────────────────┘   │
│           │                    │                  │
│           └────── Vite Dev Server ───────────┐   │
│                   (port 4200)                │   │
│                       │ /api/* proxy         │   │
└───────────────────────┼──────────────────────────┘
                        ▼
              ┌─────────────────┐
              │  Express Proxy  │
              │  (port 3001)    │
              │                 │
              │  • CORS bypass  │
              │  • RSS fetching │
              │  • AIS WebSocket│
              │  • WFP/WTO APIs │
              └────────┬────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   Open-Meteo    WFP HungerMap   WTO ePing
   ERA5 API      API             API
        ▼              ▼              ▼
   ReliefWeb     GDACS           AISStream.io
   RSS feeds     RSS feed        WebSocket
```

## Data Layers

### 1. Climate Stress — ◆ Diamond markers

| Property | Value |
|----------|-------|
| **Source** | [Open-Meteo Archive API](https://archive-api.open-meteo.com) (ERA5 reanalysis from ECMWF) |
| **Data** | 30-day temperature and precipitation anomalies for 25 major agricultural zones |
| **Refresh** | Every **3 hours** (client cache) |
| **Upstream** | ERA5 updates daily with ~5-day lag |
| **Severity** | EXTREME: >5°C temp delta or >80mm precip delta · MODERATE: >3°C or >40mm · NORMAL: below thresholds |
| **Color** | Red = Extreme · Yellow = Moderate · Green = Normal |

### 2. WTO SPS Barriers — ▲ Triangle markers

| Property | Value |
|----------|-------|
| **Source** | [WTO ePing](https://epingalert.org) SPS/TBT notification system |
| **Data** | Sanitary & phytosanitary trade barrier notifications filtered for agricultural relevance |
| **Refresh** | Every **6 hours** (client cache) |
| **Upstream** | New notifications published as WTO members submit them |
| **Urgency** | EMERGENCY: bans/suspensions · URGENT: restrictions/quarantines · ROUTINE: standard notifications |
| **Color** | Red = Emergency · Yellow = Urgent · Blue = Routine |

### 3. Food Security News — ✚ Cross markers

| Property | Value |
|----------|-------|
| **Sources** | 5 RSS feeds aggregated server-side |
| | • [ReliefWeb](https://reliefweb.int) — food security & agriculture alerts |
| | • [ReliefWeb](https://reliefweb.int) — epidemic/outbreak/drought alerts |
| | • [GDACS](https://www.gdacs.org) — global disaster alerts (filtered to ag-relevant) |
| | • [The New Humanitarian](https://www.thenewhumanitarian.org) |
| | • [BBC Science & Environment](https://www.bbc.co.uk/news/science_and_environment) (filtered to ag/food/climate) |
| **Refresh** | Every **5 minutes** (client cache) |
| **Categories** | Disease Outbreak · Food Crisis · Pest Invasion · General Food Security |
| **Severity** | CRITICAL: famine/epidemic/IPC Phase 4-5 · HIGH: crisis/quarantine · MODERATE: warning/risk · LOW |
| **Color** | Dark Red = Critical · Red = Disease · Orange = Food Crisis · Purple = Pest · Yellow = General |

### 4. WFP HungerMap — ■ Square markers

| Property | Value |
|----------|-------|
| **Source** | [WFP HungerMap API](https://api.hungermapdata.org/v1/foodsecurity/country) (UN World Food Programme) |
| **Data** | Food Consumption Score (FCS) and Reduced Coping Strategy Index (rCSI) prevalence for ~80 countries |
| **Refresh** | Every **30 minutes** (client cache) |
| **Upstream** | WFP updates daily via near-real-time mobile surveys (mVAM) |
| **Severity** | Combined average of FCS and rCSI prevalence (0–1 scale) |
| **Color** | Red = >60% · Orange = >40% · Yellow = >20% · Green = <20% |

### 5. AIS Shipping — ⟿ Arc lines + vessel dots

| Property | Value |
|----------|-------|
| **Sources** | [AISStream.io](https://aisstream.io) WebSocket (live vessel positions) + [WorldMonitor](https://worldmonitor.app) chokepoint API |
| **Data** | Cargo and tanker vessels near agricultural shipping chokepoints (Suez, Panama, Malacca, etc.) |
| **Refresh** | Every **30 seconds** (client cache) |
| **Upstream** | AIS positions stream in real-time; chokepoint status updates every few minutes |
| **Display** | Arc lines from origin to chokepoint + ScatterplotLayer vessel dots |

## AG Risk Index Calculation

The AG Risk Index is a composite score from **0 to 100**, computed from 4 sub-scores (each capped at 25 points):

```
AG Risk Index = Climate Sub + WTO Sub + Food Security Sub + Shipping Sub
```

### Sub-Score Formulas

**Climate (0–25):**
```
min(25, (extreme_zones × 6) + (moderate_zones × 1.5))
```

**WTO SPS (0–25):**
```
min(25, (emergencies × 3) + min(total_notifications × 0.4, 6))
```

**Food Security (0–25):**
```
min(25, (critical_alerts × 2) + (outbreaks × 1) + (hungermap_critical × 0.5) + min(total_alerts × 0.15, 3))
```

**Shipping (0–25):**
```
min(25, min(12, log₂(max(1, flagged_routes)) × 1.5) + (high_risk_chokepoints × 0.5))
```

### Threat Level Thresholds

| Score | Level |
|-------|-------|
| 70–100 | CRITICAL |
| 45–69 | HIGH |
| 25–44 | MODERATE |
| 0–24 | LOW |

Weights are tuned so typical global conditions yield 35–70; a score of 80+ signals a genuinely alarming convergence of threats.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm (comes with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/nrahaman1/aegis-threat-dashboard.git
cd aegis-threat-dashboard

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env and add your API keys (see below)
```

### Environment Variables

| Variable | Required | Description | Get it from |
|----------|----------|-------------|-------------|
| `AISSTREAM_API_KEY` | Yes | Live AIS vessel tracking | [aisstream.io](https://aisstream.io) (free) |
| `WTO_EPING_API_KEY` | Yes | WTO SPS/TBT notifications | [epingalert.org](https://epingalert.org) (free) |

### Running the Dashboard

```bash
# Start both the Express proxy server and Vite dev server
npm run dev:all
```

This starts:
- **Express proxy** on `http://localhost:3001` (handles CORS, RSS fetching, WebSocket relay)
- **Vite dev server** on `http://localhost:4200` (serves the dashboard UI)

Open **http://localhost:4200** in your browser.

### Build for Production

```bash
npm run build    # Outputs to dist/
npm run preview  # Preview the production build
```

## Project Structure

```
aegis-threat-dashboard/
├── index.html              # Main HTML entry point
├── server.js               # Express proxy server (port 3001)
├── start-all.js            # Concurrent dev server launcher
├── package.json            # Dependencies and scripts
├── vite.config.js          # Vite configuration (port 4200, proxy)
├── .env.example            # Environment variable template
├── .gitignore
└── src/
    ├── main.js             # App entry: map init, deck.gl overlay, UI wiring
    ├── layers/
    │   ├── climate-stress.js      # ERA5 climate anomaly layer
    │   ├── wto-sps-barriers.js    # WTO trade barrier layer
    │   ├── food-security-news.js  # RSS-aggregated food security layer
    │   ├── wfp-hungermap.js       # WFP food insecurity layer
    │   └── ais-shipping.js        # AIS vessel tracking layer
    ├── utils/
    │   ├── geo-data.js            # Country coordinates, aliases, ag zones
    │   └── rss-parser.js          # RSS/XML feed parser
    └── styles/
        └── index.css              # Full design system and component styles
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [deck.gl](https://deck.gl) v9.1 | WebGL data visualization layers |
| [MapLibre GL JS](https://maplibre.org) v4.7 | Map rendering engine |
| [Vite](https://vitejs.dev) v6.2 | Frontend build tool and dev server |
| [Express](https://expressjs.com) v5.1 | Backend proxy server |
| [ws](https://github.com/websockets/ws) | WebSocket client for AIS streaming |

## Acknowledgments

- [WFP HungerMap LIVE](https://hungermap.wfp.org/) — World Food Programme
- [Open-Meteo](https://open-meteo.com/) — Free weather and climate API
- [WTO ePing](https://epingalert.org/) — SPS/TBT notification system
- [ReliefWeb](https://reliefweb.int/) — OCHA humanitarian information
- [GDACS](https://www.gdacs.org/) — Global Disaster Alerting Coordination System
- [AISStream.io](https://aisstream.io/) — Real-time AIS vessel data
- [CARTO](https://carto.com/) — Basemap tiles
