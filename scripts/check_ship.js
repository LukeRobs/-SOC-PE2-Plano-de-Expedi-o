const fs = require('fs');
const raw = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/daily_3k.json'));
const rows = raw.values.slice(1);

// Check Shipments (col M, index 12)
const samples = rows.filter(r => r[12] && r[12] !== '.0' && r[12] !== '0.0').slice(0, 15);
console.log('Shipments samples (non-zero):');
samples.forEach(r => {
  console.log('  LT:', r[1], '| Ship:', r[12], '| Status:', r[10], '| Turno:', r[13], '| Date:', (r[0]||'').substring(0,10));
});

// Today stats
const today = rows.filter(r => r[0] && r[0].startsWith('2026-03-14'));
const CARREGADAS = ['Carregado', 'Carregado/Liberado', 'Finalizado'];
let totalShip = 0, countCarregadas = 0, sumShipCarregadas = 0;

today.forEach(r => {
  const ship = parseFloat(r[12]) || 0;
  totalShip += ship;
  if (CARREGADAS.includes(r[10])) {
    countCarregadas++;
    sumShipCarregadas += ship;
  }
});

console.log('\nToday 14/03 (all turnos):');
console.log('  Total Shipments (col M):', totalShip);
console.log('  Count Carregadas (Carregado+C/L+Finalizado):', countCarregadas);
console.log('  Shipments de Carregadas:', sumShipCarregadas);
console.log('  SPR:', countCarregadas > 0 ? (sumShipCarregadas / countCarregadas).toFixed(1) : 0);

// By turno for today
['T1', 'T2', 'T3'].forEach(t => {
  const tRows = today.filter(r => r[13] === t);
  let ts = 0, tc = 0, sc = 0;
  tRows.forEach(r => {
    const ship = parseFloat(r[12]) || 0;
    ts += ship;
    if (CARREGADAS.includes(r[10])) { tc++; sc += ship; }
  });
  console.log(`  ${t}: totalShip=${ts} carregadas=${tc} shipCarregadas=${sc} SPR=${tc>0?(sc/tc).toFixed(1):0}`);
});

// Overall stats
const allShip = rows.reduce((s, r) => s + (parseFloat(r[12]) || 0), 0);
console.log('\nAll rows total shipments:', allShip);
const nonZeroShip = rows.filter(r => (parseFloat(r[12]) || 0) > 0);
console.log('Rows with shipments > 0:', nonZeroShip.length);
