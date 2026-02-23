# EPEC Globals Frontend

Standalone React application for reading and writing EPEC/PLC global variables via the `trust-runtime` web service.

## Setup

```bash
npm install
```

## Development

Start the Vite dev server (proxies API calls to `localhost:8080` by default):

```bash
npm run dev
```

Open `http://localhost:5173`.

The runtime must be running at `http://localhost:8080` (or set `VITE_RUNTIME_BASE`):

```bash
VITE_RUNTIME_BASE=http://192.168.1.10:8080 npm run dev
```

> The dev server starts even if the runtime is unavailable — the table will show
> "Disconnected" and API calls will fail until the runtime is reachable.

## Production Build

```bash
npm run build
```

Serve the `dist/` folder with any static HTTP server.  
Set `VITE_RUNTIME_BASE` to the runtime origin at build time:

```bash
VITE_RUNTIME_BASE=http://plc:8080 npm run build
```

## API Endpoints (provided by trust-runtime)

| Endpoint | Method | Description |
|---|---|---|
| `/api/epec/globals` | GET | Returns all PLC global variables |
| `/api/epec/globals` | POST | Writes `{name, value}` to a global |
| `/api/epec/events` | GET | SSE stream — pushes updated globals every 500 ms |

## Features

- Live table of all globals, updated via SSE every 500 ms
- Filter by name or type
- Write form with datalist autocomplete; click **Select** on any row to pre-fill
- Dark industrial theme
