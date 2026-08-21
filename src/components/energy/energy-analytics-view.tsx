'use client';
export function EnergyAnalyticsView() {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Energy Analytics</h2>
      <div className="card-grid">
        <div className="card"><div className="card-label">Charge Energy</div><div className="card-value" id="enChargeWh">-- Wh</div></div>
        <div className="card"><div className="card-label">Discharge Energy</div><div className="card-value" id="enDischargeWh">-- Wh</div></div>
        <div className="card"><div className="card-label">Net Energy</div><div className="card-value" id="enNetWh">-- Wh</div></div>
        <div className="card"><div className="card-label">Charge Ah</div><div className="card-value" id="enChargeAh">-- Ah</div></div>
        <div className="card"><div className="card-label">Discharge Ah</div><div className="card-value" id="enDischargeAh">-- Ah</div></div>
        <div className="card"><div className="card-label">Equivalent Full Cycles</div><div className="card-value" id="enEfc">--</div></div>
      </div>
    </div>
  );
}
