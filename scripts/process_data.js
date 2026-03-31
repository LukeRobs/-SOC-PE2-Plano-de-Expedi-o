const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/daily_full.json'));
const rows = d.values.slice(1); // skip header

// Columns:
// 0:date_cpt 1:LT 2:vehicle_type 3:eta_plan 4:cpt_plan 5:cpt_realized
// 6:Status_trip 7:Date_SoC 8:Turno_cpt_plan 9:cpt_real_robô 10:Status_Real
// 11:Destino 12:Shipments 13:Turno_Real 14:Doca

// ── CPT LOST LOGIC (corrected):
// perdeu CPT = cpt_real_robô is filled AND cpt_real_robô > cpt_plan
function parseDate(s) {
  if (!s || s === '') return null;
  return new Date(s.replace(' ', 'T'));
}

function perdeuCPT(row) {
  const cptRobo = parseDate(row[9]);
  const cptPlan = parseDate(row[4]);
  if (!cptRobo || !cptPlan) return false;
  return cptRobo > cptPlan;
}

// ── Group by date + turno
const byDate = {};
const allRows = [];

rows.forEach((r, i) => {
  const date_cpt = r[0] ? r[0].substring(0, 10) : '';
  if (!date_cpt) return;

  const row = {
    idx: i + 2, // spreadsheet row number
    date_cpt,
    lt: r[1] || '',
    vehicle_type: r[2] || '',
    eta_plan: r[3] || '',
    cpt_plan: r[4] || '',
    cpt_realized: r[5] || '',
    status_trip: r[6] || '',
    date_soc: r[7] || '',
    turno_cpt_plan: r[8] || '',
    cpt_real_robo: r[9] || '',
    status_real: r[10] || '',
    destino: r[11] || '',
    shipments: r[12] || '',
    turno_real: r[13] || '',
    doca: r[14] || '',
    perdeu_cpt: perdeuCPT(r),
  };
  allRows.push(row);

  if (!byDate[date_cpt]) byDate[date_cpt] = {};
  const turno = row.turno_real || 'N/A';
  if (!byDate[date_cpt][turno]) byDate[date_cpt][turno] = {
    total: 0, statusReal: {}, destinos: {}, docas: {}, perdeuCPT: 0, rows: []
  };

  const tg = byDate[date_cpt][turno];
  tg.total++;
  tg.statusReal[row.status_real] = (tg.statusReal[row.status_real] || 0) + 1;
  if (row.destino) tg.destinos[row.destino] = (tg.destinos[row.destino] || 0) + 1;
  if (row.doca)    tg.docas[row.doca]       = (tg.docas[row.doca]       || 0) + 1;
  if (row.perdeu_cpt) tg.perdeuCPT++;
  tg.rows.push(row);
});

const dates = Object.keys(byDate).sort();
console.log('Dates:', dates[0], '->', dates[dates.length - 1], '| Total:', dates.length);
console.log('Total rows:', allRows.length);

// Check rows with Doca
const withDoca = allRows.filter(r => r.doca !== '');
console.log('\nRows with Doca:', withDoca.length);
withDoca.slice(0, 10).forEach(r => console.log('  ', r.date_cpt, r.lt, r.doca, r.destino, r.turno_real));

// Check perdeu CPT (correct logic)
const perdeuRows = allRows.filter(r => r.perdeu_cpt);
console.log('\nPerderam CPT (cpt_real_robô > cpt_plan):', perdeuRows.length);
perdeuRows.slice(0, 5).forEach(r => {
  console.log('  ', r.date_cpt, r.lt, '| CPT Plan:', r.cpt_plan, '| CPT Robô:', r.cpt_real_robo, '| Turno:', r.turno_real);
});

// Sample: today's data
const today = '2026-03-14';
console.log('\n--- Today (' + today + ') ---');
['T1', 'T2', 'T3'].forEach(t => {
  const data = byDate[today] && byDate[today][t];
  if (data) {
    console.log(t + ':', data.total, 'total | Status:', JSON.stringify(data.statusReal));
    console.log('   Top Destinos:', Object.entries(data.destinos).sort((a,b)=>b[1]-a[1]).slice(0,5));
    console.log('   Top Docas:', Object.entries(data.docas).sort((a,b)=>b[1]-a[1]).slice(0,5));
    console.log('   Perdeu CPT:', data.perdeuCPT);
  }
});

// Export JSON for dashboard
fs.writeFileSync(process.env.USERPROFILE + '/dashboard_data.json', JSON.stringify({ dates, byDate, allRows }, null, 2));
console.log('\nExported dashboard_data.json');
