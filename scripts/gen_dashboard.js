// Generates the embedded JS data for the dashboard
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/dashboard_base.json'));

// Build compact structure
const BY_DATE = {};
Object.keys(data.byDate).sort().forEach(dt => {
  BY_DATE[dt] = {};
  ['T1','T2','T3'].forEach(t => {
    const tData = data.byDate[dt][t];
    if (tData) {
      BY_DATE[dt][t] = {
        total: tData.total,
        statusReal: tData.statusReal,
        destinos: tData.destinos,
        perdeuCPT: tData.perdeuCPT
      };
    }
  });
});

// Minimal rows - only needed fields
const ROWS = data.allRows.map(r => ({
  d: r.date_cpt,
  lt: r.lt,
  vt: r.vehicle_type,
  ep: r.eta_plan ? r.eta_plan.substring(11,16) : '',
  cp: r.cpt_plan ? r.cpt_plan.substring(11,16) : '',
  cr: r.cpt_real_robo ? r.cpt_real_robo.substring(11,16) : '',
  sr: r.status_real,
  dest: r.destino,
  doca: r.doca,
  tr: r.turno_real,
  ag: r.agency,
  vn: r.vehicle_number,
  pct: r.perdeu_cpt ? 1 : 0,
}));

const dates = Object.keys(BY_DATE).sort();
console.log('Total dates:', dates.length);
console.log('Total rows:', ROWS.length);
console.log('Sample row:', JSON.stringify(ROWS[0]));

// Write as JS
const output = `const DATES=${JSON.stringify(dates)};
const BY_DATE=${JSON.stringify(BY_DATE)};
const ALL_ROWS=${JSON.stringify(ROWS)};`;

fs.writeFileSync(process.env.USERPROFILE + '/data.js', output);
console.log('data.js size:', fs.statSync(process.env.USERPROFILE + '/data.js').size, 'bytes');
