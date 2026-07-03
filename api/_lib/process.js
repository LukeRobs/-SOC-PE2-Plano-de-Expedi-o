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

function perdeuCPT(row) {
  const robo = normalizeStr(row[9]);
  const plan = normalizeStr(row[4]);
  if (!robo || !plan) return false;
  return robo > plan;
}

function parseShipments(s) {
  if (!s || s === '.0' || s === '0.0' || s === '0') return 0;
  return Math.round(parseFloat(s.trim().replace(/\./g, '').replace(',', '.')) || 0);
}

function getShipments(r) {
  const real = r[15];
  if (real && real !== '.0' && real !== '0' && real !== '0.0') return parseShipments(real);
  return parseShipments(r[12]);
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

function processRawData(raw, sprRaw) {
  const rows    = Array.isArray(raw.values) ? raw.values.slice(1) : [];
  const byDate  = {};
  const allRows = [];

  rows.forEach((r, i) => {
    const dateSoc = (r[7] || r[0] || '').substring(0, 10);
    if (!dateSoc || dateSoc.length < 10) return;
    const turno  = r[13] || '';
    if (!turno) return;

    const destino = r[11] || '';
    const doca    = r[14] || '';
    const statusR = r[10] || '';
    const pct     = perdeuCPT(r);
    const ship    = getShipments(r);
    const isCarr  = CARREGADAS.has(statusR);

    allRows.push({
      d:       dateSoc,
      lt:      r[1]  || '',
      vt:      r[2]  || '',
      ep:      extractTime(r[3]),
      cp:      extractTime(r[4]),
      cr:      extractTime(r[9]),
      sr:      statusR,
      dest:    destino,
      doca:    doca,
      tr:      turno,
      ship:    ship,
      pct:     pct ? 1 : 0,
      just:    r[16] || '',
      justSpr: r[17] || '',
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

module.exports = { processRawData, parseSprRaw };
