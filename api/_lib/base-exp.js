// Aba "Base de Expedição": TURNO (col A) por TRIP (col B) — fonte de verdade do turno quando
// diverge do "Turno Real" calculado na Daily. Colunas resolvidas pelo header (TURNO / TRIP).
const BASE_EXP_RANGE = "'Base de Expedição'!A1:T3000";

function parseBaseTurnos(raw) {
  const v = Array.isArray(raw && raw.values) ? raw.values : [];
  const h = (v[0] || []).map(x => (x || '').toString().trim().toUpperCase());
  const iT = h.indexOf('TURNO') >= 0 ? h.indexOf('TURNO') : 0;
  const iL = h.indexOf('TRIP')  >= 0 ? h.indexOf('TRIP')  : 1;
  const map = {};
  v.slice(1).forEach(r => {
    const lt = (r[iL] || '').toString().trim();
    const tr = (r[iT] || '').toString().trim().toUpperCase();
    if (lt && /^T[1-3]$/.test(tr)) map[lt] = tr;
  });
  return map;
}

module.exports = { BASE_EXP_RANGE, parseBaseTurnos };
