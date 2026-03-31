const fs = require('fs');
const raw = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/daily_3k.json'));
const rows = raw.values.slice(1);

// Check rows with cpt_real_robo filled for today
const today = rows.filter(r => r[0] && r[0].startsWith('2026-03-14') && r[9]);
console.log('Today rows with cpt_real_robo:', today.length);
today.slice(0, 5).forEach(r => {
  console.log('  LT:', r[1], '| cpt_plan:', r[4], '| cpt_real_robo:', r[9], '| turno:', r[13]);
});

// Check Doca - which dates have it filled
const withDoca = rows.filter(r => r[14] && r[14].trim() && r[14] !== '.0');
console.log('\nDoca sample:');
withDoca.slice(0, 10).forEach(r => {
  console.log('  LT:', r[1], '| date:', (r[0]||'').substring(0,10), '| turno:', r[13], '| doca:', r[14]);
});

// Count per date
const docaPerDate = {};
withDoca.forEach(r => {
  const dt = (r[0] || '').substring(0, 10);
  docaPerDate[dt] = (docaPerDate[dt] || 0) + 1;
});
console.log('\nDoca count per date:', JSON.stringify(docaPerDate));
console.log('Total doca rows:', withDoca.length);
