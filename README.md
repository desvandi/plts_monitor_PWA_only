# PLTS Monitor PWA — Production Grade

**Version:** 1.0.0 | **Protocol:** v1 | **Status:** Implementation Complete

Frontend PWA for the Production-Grade 48V LiFePO4 PLTS Monitoring System.

## Overview

A trustworthy industrial PLTS monitoring dashboard whose displayed information is traceable, validated, timestamped, quality-qualified, and honest about uncertainty.

**Key Principle (brief §1):** Never fabricate certainty. Every measurement has value/unit/quality/source/timestamp/sequence. Sensor failure → `null` (NEVER `0`). Stale telemetry → marked STALE (NEVER displayed as real-time).

## Features (brief §52-67)

- **Dashboard** — answers "Bagaimana kondisi PLTS sekarang?" within 5 seconds: System Health, Battery V/I/P, SOC, Runtime, AC Current, T/H, Active Alarms, Freshness
- **Battery** — V/I/P/Direction/SOC/Ah/Wh/EFC + 24h graphs (1h/6h/12h/24h/7d/30d)
- **AC Output** — RMS/Peak/Average current, signal quality, estimated power (marked ESTIMATED)
- **Environment** — T/H/Dew Point, condensation risk, labeled "Ambient / Enclosure" (NOT battery temperature)
- **Energy Analytics** — charge/discharge/net Wh + Ah + EFC (NO fake PV metrics — brief §92)
- **Calibration Center** — 3-point voltage calibration (LOW/NOMINAL/FULL), ACS712 zero-cal, SHT31 offset
- **Alarm Center** — Active/Acknowledged/Cleared/History, filters, ACK≠CLEAR lifecycle
- **Diagnostics** — uptime, heap, RSSI, reconnect counts, boot count, reset reason, sensor health
- **Reports** — daily/weekly/monthly + CSV/JSON export
- **Settings** — device config, backend config, danger zone (reboot, factory reset)

## Quality Disclosure (brief §91)

Every measurement visually discloses its quality:
- ✅ **VALID** (green) — measured, trustworthy
- 🟦 **DERIVED** (blue) — computed from measured (e.g., power = V × I)
- 🟠 **ESTIMATED** (orange) — estimate (e.g., SOC, AC power)
- 🟡 **STALE** (yellow) — old data, marked with relative time
- 🔴 **INVALID/SENSOR_ERROR** (red) — N/A value, never 0

## Offline Support (brief §52, §90)

- Real service worker (cache-first for app shell, network-first for telemetry)
- Offline fallback serves cached `index.html`
- Stale detection: if last telemetry > 10s, show "OFFLINE — Last seen: Xs ago"
- If > 60s, show STALE banner

## Files

```
public/
├── index.html           # Main SPA (12 views)
├── styles.css           # Production-grade styling (dark/light theme)
├── app.js               # Application logic (telemetry, charts, calibration, reports)
├── service-worker.js    # PWA offline support (cache-first + network-first)
├── manifest.webmanifest # PWA manifest
├── icon-192.png         # PWA icon
├── icon-512.png         # PWA icon
└── icon-512-maskable.png # PWA maskable icon
README.md
```

## Deployment

### Option 1: Static hosting (Vercel, Netlify, GitHub Pages)

This PWA is a **standalone static site** — no build step required.

```bash
# Vercel
npx vercel --prod public/

# Or upload public/ folder to any static host
```

### Option 2: Local development

```bash
cd public/
python3 -m http.server 8080
# Open http://localhost:8080
```

## Configuration

On first launch, open Settings → Backend Configuration:
- **ESP32 API URL**: `http://192.168.1.100` (LAN) or Cloudflare Tunnel URL
- **GAS URL**: `https://script.google.com/macros/s/<id>/exec`
- **MQTT Broker URL**: `wss://broker.yourdomain.com:8884/mqtt` (optional — for realtime)
- **MQTT Username + Password**: PWA credentials (separate from ESP32 — blast-radius isolation)

Settings are persisted to `localStorage`.

## Backend

This PWA talks to:
1. **ESP32** (REST) — realtime telemetry, config, calibration, OTA
2. **Google Apps Script** (GAS) — historical queries, AI insights, reports
3. **MQTT broker** (optional) — realtime subscribe (no commands — monitoring-only)

The GAS backend + ESP32 firmware live in the companion repo:
`https://github.com/desvandi/plts_monitor_firmware-code.gs-etc`

## Browser Support

- Chrome/Edge 90+ (PWA installable)
- Firefox 88+ (PWA installable)
- Safari 14+ (PWA installable on iOS via "Add to Home Screen")
- Service Worker requires HTTPS (or localhost for development)

## Accessibility

- Text label + color, never color alone (WCAG)
- ARIA labels on all interactive elements
- Keyboard navigation support
- User zoom allowed (NOT disabled — WCAG 1.4.4)
- Dark/light theme toggle

## Honest Disclosure

- Hardware Acceptance Tests (HW-001..HW-025) are NOT EXECUTED — HARDWARE REQUIRED
- Independent audit NOT CLAIMED (brief §108)
- This PWA is Implementation Complete (software layer)
