import { useEffect, useRef, useState } from 'react';

// In dev, Vite proxies /api/epec → trust-runtime.
// In production, set VITE_RUNTIME_BASE to the runtime origin (e.g. http://plc:8080).
const API_BASE = (import.meta.env.VITE_RUNTIME_BASE ?? '') as string;

interface Global {
  name: string;
  value: string;
  type: string;
}

interface GlobalsPayload {
  globals: Global[];
  connected: boolean;
  timestamp_ms: number;
}

function valueToInput(value: string): string {
  return value;
}

export default function App() {
  const [globals, setGlobals] = useState<Global[]>([]);
  const [connected, setConnected] = useState(false);
  const [writeTarget, setWriteTarget] = useState('');
  const [writeValue, setWriteValue] = useState('');
  const [writeStatus, setWriteStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Initial fetch
    fetch(`${API_BASE}/api/epec/globals`)
      .then((r) => r.json())
      .then((data: GlobalsPayload) => {
        setGlobals(data.globals ?? []);
        setConnected(data.connected ?? false);
      })
      .catch(() => setConnected(false));

    // SSE stream
    const es = new EventSource(`${API_BASE}/api/epec/events`);
    esRef.current = es;
    es.onmessage = (event) => {
      try {
        const data: GlobalsPayload = JSON.parse(event.data);
        setGlobals(data.globals ?? []);
        setConnected(data.connected ?? false);
      } catch {
        // ignore malformed events
      }
    };
    es.onerror = () => setConnected(false);
    es.onopen = () => setConnected(true);

    return () => {
      es.close();
    };
  }, []);

  const handleWrite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!writeTarget.trim()) return;
    setWriteStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/epec/globals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: writeTarget, value: writeValue }),
      });
      const data = await res.json();
      if (data.ok) {
        setWriteStatus('✓ Queued');
      } else {
        setWriteStatus(`Error: ${data.error ?? 'unknown'}`);
      }
    } catch (err) {
      setWriteStatus(`Error: ${String(err)}`);
    }
    setTimeout(() => setWriteStatus(null), 3000);
  };

  const filtered = globals.filter(
    (g) =>
      !filter ||
      g.name.toLowerCase().includes(filter.toLowerCase()) ||
      g.type.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="epec-root">
      <header className="epec-header">
        <h1>EPEC Globals</h1>
        <span className={`epec-status ${connected ? 'epec-status--ok' : 'epec-status--err'}`}>
          {connected ? '● Connected' : '○ Disconnected'}
        </span>
      </header>

      <section className="epec-write">
        <h2>Write Global</h2>
        <form onSubmit={handleWrite} className="epec-write-form">
          <label>
            Name
            <input
              list="epec-global-names"
              value={writeTarget}
              onChange={(e) => {
                setWriteTarget(e.target.value);
                const g = globals.find((x) => x.name === e.target.value);
                if (g) setWriteValue(valueToInput(g.value));
              }}
              placeholder="Variable name"
              required
            />
            <datalist id="epec-global-names">
              {globals.map((g) => (
                <option key={g.name} value={g.name} />
              ))}
            </datalist>
          </label>
          <label>
            Value
            <input
              value={writeValue}
              onChange={(e) => setWriteValue(e.target.value)}
              placeholder="New value"
            />
          </label>
          <button type="submit">Write</button>
          {writeStatus && <span className="epec-write-status">{writeStatus}</span>}
        </form>
      </section>

      <section className="epec-table-section">
        <div className="epec-table-header">
          <h2>Globals ({filtered.length})</h2>
          <input
            className="epec-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or type…"
          />
        </div>
        <div className="epec-table-wrap">
          <table className="epec-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Value</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="epec-empty">
                    {globals.length === 0 ? 'No globals available' : 'No matches'}
                  </td>
                </tr>
              ) : (
                filtered.map((g) => (
                  <tr key={g.name}>
                    <td className="epec-name">{g.name}</td>
                    <td className="epec-type">{g.type}</td>
                    <td className="epec-value">{g.value}</td>
                    <td>
                      <button
                        className="epec-select-btn"
                        onClick={() => {
                          setWriteTarget(g.name);
                          setWriteValue(valueToInput(g.value));
                        }}
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
