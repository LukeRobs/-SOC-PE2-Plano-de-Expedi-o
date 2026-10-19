// Abas Packed / Packing → TOs agrupadas por destino (dest_station_name).
// Colunas: A=to_number, B=current_station_id, C=current_station_name, D=complete_time,
//          E=dest_station_name, F=status, G=quantity, H=staging_area_id
const PACKED_RANGE  = 'Packed!A1:H20000';
const PACKING_RANGE = 'Packing!A1:H20000';

// "LM Hub_PE_Recife_ibura" ≈ "lm hub pe recife ibura" — ignora acento, caixa e pontuação
function normDest(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function group(raw, map, kind) {
  const rows = Array.isArray(raw && raw.values) ? raw.values.slice(1) : [];
  rows.forEach(r => {
    const to = (r[0] || '').trim();
    const key = normDest(r[4]);
    if (!to || !key) return;
    // Packed "ainda não endereçada" = sem staging_area (col H vazia ou "-")
    const staging = (r[7] || '').toString().trim();
    if (kind === 'packed' && staging && staging !== '-') return;
    const b = map[key] || (map[key] = { packed: { n: 0, qty: 0, list: [] }, packing: { n: 0, qty: 0, list: [] } });
    const qty = parseInt(r[6], 10) || 0;
    const g = b[kind];
    g.n++; g.qty += qty;
    g.list.push({ to, qty, t: (r[3] || '').toString().substring(11, 16) });
  });
}

function processTOs(packedRaw, packingRaw) {
  const map = {};
  group(packedRaw, map, 'packed');
  group(packingRaw, map, 'packing');
  return map;
}

module.exports = { PACKED_RANGE, PACKING_RANGE, normDest, processTOs };
