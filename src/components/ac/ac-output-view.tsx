'use client';
export function AcOutputView() {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">AC Output</h2>
      <div className="warning-banner">
        ⚠️ ACS712 measures AC CURRENT only. AC power is ESTIMATED based on assumed 220V / 0.9 PF.
      </div>
      <div className="card-grid">
        <div className="card"><div className="card-label">RMS Current</div><div className="card-value" id="acRms">-- A</div></div>
        <div className="card"><div className="card-label">Peak Current</div><div className="card-value" id="acPeak">-- A</div></div>
        <div className="card"><div className="card-label">Average Current</div><div className="card-value" id="acAvg">-- A</div></div>
        <div className="card"><div className="card-label">Estimated AC Power</div><div className="card-value" id="acEstPower">-- W</div><div className="card-quality estimated">ESTIMATED</div></div>
      </div>
    </div>
  );
}
