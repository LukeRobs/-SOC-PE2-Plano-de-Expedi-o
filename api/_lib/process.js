function normalizeStr(s) {
  if (!s || s.trim() === '' || s === '.0') return null;
  const str = s.trim();
  if (str.includes('/')) {
    const [datePart, timePart = '00:00:00'] = str.split(' ');
    const [m, d, y] = datePart.split('/');
    const [hh, mm, ss = '00'] = timePart.split(':');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${hh.padStart(2,'0')}:${mm}:${ss}`;
  }
  const [datePart, timePart = '00:00:00'] = str.split(' ');
  const [hh, mm, ss = '00'] = timePart.split(':');
  return `${datePart}T${hh.padStart(2,'0')}:${mm}:${ss}`;
}

function extractTime(s) {
  const n = normalizeStr(s);
  return n ? n.substring(11, 16) : '';
}

// Colunas da aba Daily localizadas pelo nome do header (a planilha ganhou a coluna "Destino" e
// deslocou Shipments/Turno/Doca/justificativas). Fallback = layout atual.
const DAILY_COLS = {
  lt: ['LT', 1], vt: ['vehicle_type', 2], ep: ['eta_plan', 3], cp: ['cpt_plan', 4],
  dateSoc: ['Date_SoC', 7], cr: ['cpt_real_robô', 9], sr: ['Status_Real', 10],
  dest: ['Destination', 11], turnoPlan: ['Turno cpt_plan', 8], ship: ['Shipments', 13], turno: ['Turno Real', 14],
  doca: ['Doca', 15], shipReal: ['Pacotes_Real', 16], just: ['Justificativa_CPT', 17],
  justSpr: ['Justificativa_SPR', 18],
};
function dailyCols(header) {
  const h = (Array.isArray(header) ? header : []).map(x => (x || '').toString().trim().toLowerCase());
  const out = {};
  for (const [k, [name, def]] of Object.entries(DAILY_COLS)) {
    const i = h.indexOf(name.toLowerCase());
    out[k] = i >= 0 ? i : def;
  }
  return out;
}
function colLetter(i) { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; }

function perdeuCPT(row, c) {
  const robo = normalizeStr(row[c.cr]);
  const plan = normalizeStr(row[c.cp]);
  if (!robo || !plan) return false;
  return robo > plan;
}

function parseShipments(s) {
  if (!s || s === '.0' || s === '0.0' || s === '0') return 0;
  return Math.round(parseFloat(s.trim().replace(/\./g, '').replace(',', '.')) || 0);
}

function getShipments(r, c) {
  const real = r[c.shipReal];
  if (real && real !== '.0' && real !== '0' && real !== '0.0') return parseShipments(real);
  return parseShipments(r[c.ship]);
}

const CARREGADAS = new Set(['Carregado', 'Carregado/Liberado', 'Finalizado']);

// SPR: col A=nome, col B=sortcode, col C=carreta, col D=truck, col E=3/4, col F=toco
// UNFORMATTED_VALUE retorna decimais em milhar (ex: 11.145 = 11145 pacotes)
function parseSprRaw(raw) {
  const rows = Array.isArray(raw.values) ? raw.values.slice(1) : [];
  const map  = {};
  const parseSprNum = v => {
    if (v === undefined || v === null || v === '' || v === '-') return null;
    if (typeof v === 'number') { const n = Math.round(v * 1000); return n > 0 ? n : null; }
    let s = v.toString().trim();
    s = s.replace(/[.,]0+$/, '');
    s = s.replace(/[.,]/g, '');
    const n = parseInt(s);
    return isNaN(n) || n <= 0 ? null : n;
  };
  rows.forEach(r => {
    const sortcode = (r[1] || '').toString().trim();
    if (!sortcode || sortcode === '-') return;
    map[sortcode] = {
      carreta: parseSprNum(r[2]),
      truck:   parseSprNum(r[3]),
      trq:     parseSprNum(r[4]),
      toco:    parseSprNum(r[5]),
    };
  });
  return map;
}

function processRawData(raw, sprRaw, baseTurnos) {
  const c       = dailyCols(raw.values && raw.values[0]);
  const rows    = Array.isArray(raw.values) ? raw.values.slice(1) : [];
  const byDate  = {};
  const allRows = [];

  const seenLT = new Set();
  rows.forEach((r, i) => {
    // LT duplicada (ex.: linha manual + linha vinda da base_LH): vale a primeira ocorrência
    const ltKey = (r[c.lt] || '').toString().trim();
    if (ltKey) { if (seenLT.has(ltKey)) return; seenLT.add(ltKey); }
    const dateSoc = (r[c.dateSoc] || r[0] || '').substring(0, 10);
    if (!dateSoc || dateSoc.length < 10) return;
    let turno = r[c.turno] || '';
    // Base de Expedição manda: se o turno diverge do "Turno Real" da Daily (ou está vazio/erro), usa o da Base
    const turnoBase = baseTurnos && baseTurnos[(r[c.lt] || '').toString().trim()];
    if (turnoBase && turnoBase !== turno) turno = turnoBase;
    // Sem turno na Base nem na Daily (ex.: 3/4 e TOCO ainda fora da Base): usa o "Turno cpt_plan"
    if (!/^T[1-3]$/.test(turno)) {
      const tp = (r[c.turnoPlan] || '').toString().trim().toUpperCase();
      if (/^T[1-3]$/.test(tp)) turno = tp;
    }
    if (!turno) return;

    const destino = r[c.dest] || '';
    const doca    = r[c.doca] || '';
    const statusR = r[c.sr] || '';
    const pct     = perdeuCPT(r, c);
    const ship    = getShipments(r, c);
    const isCarr  = CARREGADAS.has(statusR);

    allRows.push({
      d:       dateSoc,
      lt:      r[c.lt] || '',
      vt:      r[c.vt] || '',
      ep:      extractTime(r[c.ep]),
      cp:      extractTime(r[c.cp]),
      cr:      extractTime(r[c.cr]),
      sr:      statusR,
      dest:    destino,
      doca:    doca,
      tr:      turno,
      ship:    ship,
      pct:     pct ? 1 : 0,
      just:    r[c.just] || '',
      justSpr: r[c.justSpr] || '',
      rowNum:  i + 2,
    });

    if (!byDate[dateSoc]) byDate[dateSoc] = {};
    if (!byDate[dateSoc][turno]) byDate[dateSoc][turno] = {
      total:0, statusReal:{}, destinos:{}, docas:{}, perdeuCPT:0,
      totalShip:0, carregadas:0, shipCarregadas:0,
    };
    const tg = byDate[dateSoc][turno];
    tg.total++;
    tg.totalShip += ship;
    tg.statusReal[statusR] = (tg.statusReal[statusR]||0) + 1;
    if (destino) tg.destinos[destino] = (tg.destinos[destino]||0) + 1;
    if (doca)    tg.docas[doca]       = (tg.docas[doca]||0)   + 1;
    if (pct)     tg.perdeuCPT++;
    if (isCarr)  { tg.carregadas++; tg.shipCarregadas += ship; }
  });

  const dates  = Object.keys(byDate).sort();
  const sprMap = sprRaw ? parseSprRaw(sprRaw) : {};
  return { DATES: dates, BY_DATE: byDate, ALL_ROWS: allRows,
           SPR_MAP: sprMap, generatedAt: Date.now(), rowCount: allRows.length };
}

module.exports = { processRawData, parseSprRaw, dailyCols, colLetter };
