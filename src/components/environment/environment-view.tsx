'use client';
export function EnvironmentView() {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Environment — Ambient / Enclosure</h2>
      <div className="card-grid">
        <div className="card"><div className="card-label">Temperature</div><div className="card-value" id="envTemp">-- °C</div></div>
        <div className="card"><div className="card-label">Humidity</div><div className="card-value" id="envHum">-- %</div></div>
        <div className="card"><div className="card-label">Dew Point</div><div className="card-value" id="envDew">-- °C</div></div>
        <div className="card"><div className="card-label">Condensation Risk</div><div className="card-value" id="envCond">--</div></div>
      </div>
    </div>
  );
}
