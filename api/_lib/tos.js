// Abas Packed / Packing → TOs agrupadas por destino (dest_station_name).
// Colunas: A=to_number, B=current_station_id, C=current_station_name, D=complete_time,
//          E=dest_station_name, F=status, G=quantity, H=pack_name (tipo: Saca, Scuttle...), I=staging_area_id; colunas resolvidas pelo header
const PACKED_RANGE  = 'Packed!A1:J20000';
const PACKING_RANGE = 'Packing!A1:J20000';

// "LM Hub_PE_Recife_ibura" ≈ "lm hub pe recife ibura" — ignora acento, caixa e pontuação
function normDest(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const COLS = { to: ['to_number', 0], time: ['complete_time', 3], dest: ['dest_station_name', 4], qty: ['quantity', 6], type: ['pack_name', 7], staging: ['staging_area_id', 8] };
function cols(header) {
  const h = (header || []).map(x => (x || '').toString().trim().toLowerCase());
  const o = {};
  for (const [k, [n, d]] of Object.entries(COLS)) { const i = h.indexOf(n); o[k] = i >= 0 ? i : d; }
  return o;
}

function group(raw, map, kind) {
  const c = cols(raw && raw.values && raw.values[0]);
  const rows = Array.isArray(raw && raw.values) ? raw.values.slice(1) : [];
  rows.forEach(r => {
    const to = (r[c.to] || '').trim();
    const key = normDest(r[c.dest]);
    if (!to || !key) return;
    // Packed "ainda não endereçada" = sem staging_area (col H vazia ou "-")
    const staging = (r[c.staging] || '').toString().trim();
    if (kind === 'packed' && staging && staging !== '-') return;
    const b = map[key] || (map[key] = { packed: { n: 0, qty: 0, list: [] }, packing: { n: 0, qty: 0, list: [] } });
    const qty = parseInt(r[c.qty], 10) || 0;
    const type = (r[c.type] || '').toString().trim() || 'Sem tipo';
    const g = b[kind];
    g.n++; g.qty += qty;
    g.list.push({ to, qty, type, t: (r[c.time] || '').toString().substring(11, 16) });
  });
}

function processTOs(packedRaw, packingRaw) {
  const map = {};
  group(packedRaw, map, 'packed');
  group(packingRaw, map, 'packing');
  return map;
}

module.exports = { PACKED_RANGE, PACKING_RANGE, normDest, processTOs };
