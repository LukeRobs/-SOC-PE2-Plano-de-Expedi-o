const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/base_lh.json'));
const rows = d.values.slice(1);

// base_LH headers:
// 0:date_cpt 1:trip_number 2:trip_source 3:cpt_plan 4:turno 5:trip_name
// 6:trip_status 7:eta_plan 8:vehicle_number 9:vehicle_type_name
// 10:agency_name 11:sta_plan 12:destination 13:sortcode
// 14:cpt_realized 15:eta_realized 16:orders 17:trip_id

function serialToDate(serial) {
  if (typeof serial === 'number') {
    return new Date((serial - 25569) * 86400 * 1000);
  }
  if (!serial || serial === '') return null;
  return new Date(serial);
}

function fmtDT(serial) {
  const d = serialToDate(serial);
  if (!d || isNaN(d)) return '';
  return d.toISOString().replace('T', ' ').substring(0, 16);
}

function fmtDate(serial) {
  const d = serialToDate(serial);
  if (!d || isNaN(d)) return '';
  return d.toISOString().substring(0, 10);
}

// In base_LH: cpt_realized (col O, idx 14) is what we use for cpt_real_robô equivalent
// perdeu CPT = cpt_realized > cpt_plan (when cpt_realized exists)
function perdeuCPT(row) {
  const cptReal = serialToDate(row[14]);
  const cptPlan = serialToDate(row[3]);
  if (!cptReal || !cptPlan || isNaN(cptReal) || isNaN(cptPlan)) return false;
  return cptReal > cptPlan;
}

// Determine turno from eta_plan (col 7) and vehicle_type (col 9)
function getTurnoReal(row) {
  const etaPlan = serialToDate(row[7]);
  const vtype = (row[9] || '').toUpperCase();
  if (!etaPlan || isNaN(etaPlan)) return '';
  const h = etaPlan.getUTCHours();
  const m = etaPlan.getUTCMinutes();

  if (vtype.includes('TRUCK')) {
    if (h >= 5 && h < 14) return 'T1';
    if ((h >= 14 && h < 21) || (h === 21 && m <= 29)) return 'T2';
    return 'T3';
  } else if (vtype.includes('CARRETA')) {
    if ((h >= 5 && h < 13) || (h === 13 && m === 0)) return 'T1';
    if ((h >= 14 && h < 21) || (h === 21 && m === 0)) return 'T2';
    return 'T3';
  }
  return '';
}

// Status_Real from trip_status and cpt_realized
function getStatusReal(row) {
  const cptRealized = row[14];
  const tripStatus = row[6] || '';
  if (cptRealized && cptRealized !== '') return 'Carregado/Liberado';
  const map = {
    'Arrived': 'Aguardando Liberação',
    'Assigned': 'Aguardando Início',
    'Assigning': 'Pendente',
    'Cancelled': 'Cancelado',
    'Completed': 'Finalizado',
    'Created': 'Criado',
    'Departed': 'Carregado',
    'Loading': 'Carregando',
    'Unseal': 'Unseal'
  };
  return map[tripStatus] || tripStatus;
}

const byDate = {};
const allRows = [];

rows.forEach(r => {
  const date_cpt = fmtDate(r[0]);
  if (!date_cpt) return;

  const turno = r[4] || getTurnoReal(r); // use base turno col
  const statusReal = getStatusReal(r);
  const destino = r[13] || ''; // sortcode as destino

  const row = {
    date_cpt,
    lt: r[1] || '',
    vehicle_type: r[9] || '',
    eta_plan: fmtDT(r[7]),
    cpt_plan: fmtDT(r[3]),
    cpt_realized: fmtDT(r[14]),
    cpt_real_robo: fmtDT(r[14]), // use cpt_realized as proxy
    status_trip: r[6] || '',
    status_real: statusReal,
    destino: destino,
    doca: '', // not in base_LH
    turno_real: turno,
    agency: r[10] || '',
    vehicle_number: r[8] || '',
    perdeu_cpt: perdeuCPT(r),
  };

  allRows.push(row);

  if (!byDate[date_cpt]) byDate[date_cpt] = {};
  if (!byDate[date_cpt][turno]) byDate[date_cpt][turno] = {
    total: 0, statusReal: {}, destinos: {}, docas: {}, perdeuCPT: 0
  };

  const tg = byDate[date_cpt][turno];
  tg.total++;
  tg.statusReal[statusReal] = (tg.statusReal[statusReal] || 0) + 1;
  if (destino) tg.destinos[destino] = (tg.destinos[destino] || 0) + 1;
  if (row.perdeu_cpt) tg.perdeuCPT++;
});

const dates = Object.keys(byDate).sort();
console.log('Dates:', dates[0], '->', dates[dates.length - 1]);
console.log('Total rows:', allRows.length);

// Check perdeu CPT
const perdeuRows = allRows.filter(r => r.perdeu_cpt);
console.log('\nPerderam CPT:', perdeuRows.length);
perdeuRows.slice(0, 8).forEach(r => {
  console.log('  ', r.date_cpt, r.lt, '| Plan:', r.cpt_plan, '| Real:', r.cpt_real_robo, '| T:', r.turno_real, '| Destino:', r.destino);
});

// Sample today
const today = '2026-03-14';
console.log('\n--- Today ---');
['T1','T2','T3'].forEach(t => {
  const data = byDate[today] && byDate[today][t];
  if (data) {
    console.log(t + ': total=' + data.total + ' perdeuCPT=' + data.perdeuCPT);
    console.log('  Status:', JSON.stringify(data.statusReal));
    console.log('  Top5 Destinos:', Object.entries(data.destinos).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>k+':'+v).join(', '));
  }
});

// Export
fs.writeFileSync(process.env.USERPROFILE + '/dashboard_base.json', JSON.stringify({ dates, byDate, allRows }, null, 2));
console.log('\nExported dashboard_base.json');
