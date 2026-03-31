const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/dashboard_base.json'));

// Perdeu CPT by date+turno
const perdeuByDate = {};
data.allRows.filter(r => r.perdeu_cpt).forEach(r => {
  const key = r.date_cpt + '|' + r.turno_real;
  perdeuByDate[key] = (perdeuByDate[key] || 0) + 1;
});
console.log('Perdeu CPT by date+turno:');
Object.entries(perdeuByDate).sort().forEach(([k,v]) => console.log(' ', k, v));

// Last 17 dates for line chart
const last17 = Object.keys(data.byDate).sort().slice(-17);
console.log('\nLast dates totals:');
last17.forEach(dt => {
  const d = data.byDate[dt];
  const t1 = d.T1 ? d.T1.total : 0;
  const t2 = d.T2 ? d.T2.total : 0;
  const t3 = d.T3 ? d.T3.total : 0;
  const pT1 = d.T1 ? d.T1.perdeuCPT : 0;
  const pT2 = d.T2 ? d.T2.perdeuCPT : 0;
  const pT3 = d.T3 ? d.T3.perdeuCPT : 0;
  console.log(dt, '| T1:', t1, 'T2:', t2, 'T3:', t3, '| perdeu T1:', pT1, 'T2:', pT2, 'T3:', pT3);
});

// Serialize compact data for JS embed
const compact = {};
Object.keys(data.byDate).forEach(dt => {
  compact[dt] = {};
  ['T1','T2','T3'].forEach(t => {
    const tData = data.byDate[dt][t];
    if (tData) {
      compact[dt][t] = {
        total: tData.total,
        statusReal: tData.statusReal,
        destinos: tData.destinos,
        perdeuCPT: tData.perdeuCPT
      };
    }
  });
});

// All rows compacted (for the table - today only initially)
const today = '2026-03-14';
const todayRows = data.allRows.filter(r => r.date_cpt === today);
console.log('\nToday rows:', todayRows.length);
console.log('Sample:', JSON.stringify(todayRows[0]));

fs.writeFileSync(process.env.USERPROFILE + '/compact.json', JSON.stringify({ compact, allRows: data.allRows }, null, 0));
console.log('\nExported compact.json -', fs.statSync(process.env.USERPROFILE + '/compact.json').size, 'bytes');
