const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/base_lh.json'));
const rows = d.values.slice(1);

function serialToDate(serial) {
  if (typeof serial === 'number') {
    const ms = (serial - 25569) * 86400 * 1000;
    return new Date(ms);
  }
  return new Date(serial);
}

function getStatusReal(row) {
  const cptRealized = row[14]; // col O = cpt_realized
  const tripStatus  = row[6];  // col G = trip_status
  if (cptRealized && cptRealized !== '') return 'Carregado/Liberado';
  const map = {
    'Arrived':   'Aguardando Liberação',
    'Assigned':  'Aguardando Início',
    'Assigning': 'Pendente',
    'Cancelled': 'Cancelado',
    'Completed': 'Finalizado',
    'Created':   'Criado',
    'Departed':  'Carregado',
    'Loading':   'Carregando',
    'Unseal':    'Unseal'
  };
  return map[tripStatus] || tripStatus;
}

const byDate = {};
const perdeuCPTByDate = {};
const today = new Date('2026-03-14T23:59:59');

rows.forEach(r => {
  const dt = serialToDate(r[0]).toISOString().substring(0, 10);
  const turno = r[4] || 'N/A';
  const statusReal = getStatusReal(r);
  const cptPlan = serialToDate(r[3]);
  const tripStatus = r[6] || '';

  if (!byDate[dt]) byDate[dt] = {};
  if (!byDate[dt][turno]) byDate[dt][turno] = {};
  byDate[dt][turno][statusReal] = (byDate[dt][turno][statusReal] || 0) + 1;

  // Perdeu CPT
  const perdeu = cptPlan < today && !['Completed','Departed','Cancelled'].includes(tripStatus);
  if (!perdeuCPTByDate[dt]) perdeuCPTByDate[dt] = { T1: 0, T2: 0, T3: 0 };
  if (perdeu) perdeuCPTByDate[dt][turno] = (perdeuCPTByDate[dt][turno] || 0) + 1;
});

const dates = Object.keys(byDate).sort();
console.log('Dates:', dates[0], '->', dates[dates.length-1], '| Total:', dates.length);

// Print sample
dates.slice(-3).forEach(dt => {
  console.log('\n' + dt + ':');
  Object.keys(byDate[dt]).sort().forEach(turno => {
    console.log('  ' + turno + ':', JSON.stringify(byDate[dt][turno]));
  });
  console.log('  Perdeu CPT:', JSON.stringify(perdeuCPTByDate[dt]));
});

fs.writeFileSync(process.env.USERPROFILE + '/byDate.json', JSON.stringify({ dates, byDate, perdeuCPTByDate }, null, 2));
console.log('\nExported byDate.json');
