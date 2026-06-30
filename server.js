const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Load .env if present (local dev)
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  envFile.split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  });
} catch (_) {}

const SPREADSHEET_ID = '1Sk16vRNBUsQitL3cRUSIH86SyfQpxV9t08UW2YrSdmQ';
const RANGE          = 'Daily!A1:R3000';
const SPR_RANGE      = 'SPR!A1:F500';
const CACHE_TTL      = 60 * 1000; // 60 seconds

// ── Auth mode detection ───────────────────────────────────────────────
// Priority: 1) Service Account file  2) Service Account base64  3) API Key  4) gws CLI
function loadServiceAccount() {
  try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE)
      return JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8'));
    if (process.env.GOOGLE_SERVICE_ACCOUNT)
      return JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
  } catch (e) { console.error('[auth] Failed to load service account:', e.message); }
  return null;
}
const SERVICE_ACCOUNT = loadServiceAccount();
const USE_API_KEY     = !SERVICE_ACCOUNT && !!process.env.SHEETS_API_KEY;
const USE_GWS         = !SERVICE_ACCOUNT && !USE_API_KEY;
console.log(`[auth] Mode: ${SERVICE_ACCOUNT ? 'Service Account' : USE_API_KEY ? 'API Key' : 'gws CLI'}`);

// ── Service Account JWT auth ──────────────────────────────────────────
let saToken = null, saTokenExp = 0;

function b64url(buf) {
  return buf.toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

async function getServiceAccountToken() {
  if (saToken && Date.now() < saTokenExp) return saToken; // cached
  const { client_email, private_key } = SERVICE_ACCOUNT;
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64url(Buffer.from(JSON.stringify({ alg:'RS256', typ:'JWT' })));
  const pay = b64url(Buffer.from(JSON.stringify({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  })));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${hdr}.${pay}`);
  const jwt = `${hdr}.${pay}.${b64url(sign.sign(private_key))}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) throw new Error(`Token error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  saToken    = data.access_token;
  saTokenExp = Date.now() + (data.expires_in - 60) * 1000; // refresh 60s before expiry
  return saToken;
}

let dataCache      = null;
let cacheFetchedAt = 0;
let fetchInProgress = false;
let fetchCallbacks  = [];

// ── Data-processing helpers (mirrors gen_daily.js logic) ──────────────

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

// Pacotes_Real (col P, index 15): use if filled; fallback to Shipments (col M, index 12)
function getShipments(r) {
  const real = r[15];
  if (real && real !== '.0' && real !== '0' && real !== '0.0') return parseShipments(real);
  return parseShipments(r[12]);
}

const CARREGADAS = new Set(['Carregado', 'Carregado/Liberado', 'Finalizado']);

// SPR: col A=nome, col B=sortcode, col C=carreta, col D=truck, col E=3/4, col F=toco
function parseSprRaw(raw) {
  const rows = Array.isArray(raw.values) ? raw.values.slice(1) : [];
  const map  = {};
  const parseSprNum = v => {
    if (v === undefined || v === null || v === '' || v === '-') return null;
    // Se já é número (UNFORMATTED_VALUE), arredonda direto
    if (typeof v === 'number') return Math.round(v) > 0 ? Math.round(v) : null;
    let s = v.toString().trim();
    // Remove sufixo decimal de zeros: "4,116.00" → "4,116" / "4.116,00" → "4.116"
    s = s.replace(/[.,]0+$/, '');
    // Remove separadores de milhar restantes
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
  const rows   = Array.isArray(raw.values) ? raw.values.slice(1) : [];
  const byDate = {};
  const allRows = [];

  rows.forEach((r, i) => {
    // Date_SoC (col H, index 7) = operational date; fallback to date_cpt (col A)
    const dateSoc = (r[7] || r[0] || '').substring(0, 10);
    if (!dateSoc || dateSoc.length < 10) return;

    const turno   = r[13] || '';
    if (!turno) return;

    const destino = r[11] || '';
    const doca    = r[14] || '';
    const statusR = r[10] || '';
    const pct     = perdeuCPT(r);
    const ship    = getShipments(r);  // Pacotes_Real (col P) se preenchido, senão Shipments (col M)
    const isCarr  = CARREGADAS.has(statusR);

    allRows.push({
      d:      dateSoc,
      lt:     r[1]  || '',
      vt:     r[2]  || '',
      ep:     extractTime(r[3]),
      cp:     extractTime(r[4]),
      cr:     extractTime(r[9]),
      sr:     statusR,
      dest:   destino,
      doca:   doca,
      tr:     turno,
      ship:   ship,
      pct:    pct ? 1 : 0,
      just:    r[16] || '',   // Col Q — justificativa da perda de CPT
      justSpr: r[17] || '',  // Col R — justificativa de SPR abaixo da meta
      rowNum: i + 2,         // Número da linha na planilha (header=1, dados a partir de 2)
    });

    if (!byDate[dateSoc]) byDate[dateSoc] = {};
    if (!byDate[dateSoc][turno]) byDate[dateSoc][turno] = {
      total:0, statusReal:{}, destinos:{}, docas:{}, perdeuCPT:0,
      totalShip:0, carregadas:0, shipCarregadas:0
    };
    const tg = byDate[dateSoc][turno];
    tg.total++;
    tg.totalShip += ship;
    tg.statusReal[statusR] = (tg.statusReal[statusR]||0) + 1;
    if (destino) tg.destinos[destino] = (tg.destinos[destino]||0) + 1;
    if (doca)    tg.docas[doca]       = (tg.docas[doca]||0) + 1;
    if (pct)     tg.perdeuCPT++;
    if (isCarr)  { tg.carregadas++; tg.shipCarregadas += ship; }
  });

  const dates  = Object.keys(byDate).sort();
  const sprMap = sprRaw ? parseSprRaw(sprRaw) : {};
  return { DATES: dates, BY_DATE: byDate, ALL_ROWS: allRows,
           SPR_MAP: sprMap,
           generatedAt: Date.now(), rowCount: allRows.length };
}

// ── Cache / fetch logic ────────────────────────────────────────────────

// Helper: fetch a single range via gws CLI, returns Promise<rawJson>
function gwsFetch(range) {
  return new Promise((resolve, reject) => {
    const params = JSON.stringify({ spreadsheetId: SPREADSHEET_ID, range });
    const child  = spawn('cmd.exe', ['/c', 'gws', 'sheets', 'spreadsheets', 'values', 'get', '--params', params],
                          { env: process.env, maxBuffer: 20 * 1024 * 1024 });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', code => {
      if (code !== 0) {
        const msg = stderr.replace(/Using keyring.*\n?/g, '').trim() || `gws exited ${code}`;
        return reject(new Error(msg));
      }
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
    });
    child.on('error', reject);
  });
}

function getData(cb) {
  if (dataCache && Date.now() - cacheFetchedAt < CACHE_TTL) {
    return cb(null, dataCache);
  }

  fetchCallbacks.push(cb);
  if (fetchInProgress) return;
  fetchInProgress = true;

  const finish = (raw, sprRaw) => {
    fetchInProgress = false;
    const cbs = fetchCallbacks.splice(0);
    dataCache      = processRawData(raw, sprRaw);
    cacheFetchedAt = Date.now();
    const sprCount = Object.keys(dataCache.SPR_MAP || {}).length;
    console.log(`[api/data] Refreshed — ${dataCache.rowCount} rows, ${sprCount} destinos SPR`);
    cbs.forEach(fn => fn(null, dataCache));
  };

  const fail = err => {
    fetchInProgress = false;
    const cbs = fetchCallbacks.splice(0);
    console.error('[api/data] error:', err.message);
    if (dataCache) return cbs.forEach(fn => fn(null, dataCache));
    cbs.forEach(fn => fn(err));
  };

  const safeSpr = p => p.catch(e => {
    console.warn('[spr] fetch failed, SPR_MAP will be empty:', e.message.split('\n')[0]);
    return { values: [] };
  });

  if (SERVICE_ACCOUNT) {
    getServiceAccountToken()
      .then(token => {
        const fetchRange = (range, qs = '') => fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}${qs}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ).then(r => { if (!r.ok) throw new Error(`Sheets API ${r.status}`); return r.json(); });
        return Promise.all([
          fetchRange(RANGE),
          safeSpr(fetchRange(SPR_RANGE, '?valueRenderOption=UNFORMATTED_VALUE')),
        ]);
      })
      .then(([raw, sprRaw]) => finish(raw, sprRaw))
      .catch(fail);

  } else if (USE_API_KEY) {
    const key = process.env.SHEETS_API_KEY;
    const fetchRange = (range, extra = '') => fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${key}${extra}`
    ).then(r => { if (!r.ok) throw new Error(`Sheets API ${r.status}`); return r.json(); });

    Promise.all([
      fetchRange(RANGE),
      safeSpr(fetchRange(SPR_RANGE, '&valueRenderOption=UNFORMATTED_VALUE')),
    ])
      .then(([raw, sprRaw]) => finish(raw, sprRaw))
      .catch(fail);

  } else {
    // gws CLI — fetch both ranges in parallel
    // SPR usa UNFORMATTED_VALUE para evitar problemas de formatação numérica
    const gwsFetchSpr = () => {
      const params = JSON.stringify({
        spreadsheetId: SPREADSHEET_ID,
        range: SPR_RANGE,
        valueRenderOption: 'UNFORMATTED_VALUE',
      });
      return new Promise((resolve, reject) => {
        const child = spawn('cmd.exe', ['/c', 'gws', 'sheets', 'spreadsheets', 'values', 'get', '--params', params],
                            { env: process.env, maxBuffer: 20 * 1024 * 1024 });
        let stdout = '', stderr = '';
        child.stdout.on('data', d => { stdout += d; });
        child.stderr.on('data', d => { stderr += d; });
        child.on('close', code => {
          if (code !== 0) return reject(new Error(stderr.replace(/Using keyring.*\n?/g, '').trim()));
          try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
        });
        child.on('error', reject);
      });
    };

    Promise.all([gwsFetch(RANGE), safeSpr(gwsFetchSpr())])
      .then(([raw, sprRaw]) => finish(raw, sprRaw))
      .catch(err => {
        console.error('[api/data] gws error:', err.message.split('\n')[0]);
        if (dataCache) {
          fetchInProgress = false;
          const cbs = fetchCallbacks.splice(0);
          console.warn('[api/data] Serving stale cache');
          return cbs.forEach(fn => fn(null, dataCache));
        }
        fail(err);
      });
  }
}

// Pre-warm cache on startup
getData((err, data) => {
  if (err) console.error('[startup] Initial data fetch failed:', err.message);
  else     console.log(`[startup] Data ready — ${data.rowCount} rows across ${data.DATES.length} dates`);
});

// ── Stage-out cache (fed by Tampermonkey) ─────────────────────────────
let stageCache = null; // { list, total, fetchedAt }

// ── HTTP server ────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const urlPath = req.url.split('?')[0];

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /api/stage-data — receives data from Tampermonkey userscript
  if (urlPath === '/api/stage-data' && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        stageCache = JSON.parse(body);
        console.log(`[stage-out] Received ${stageCache.list?.length}/${stageCache.total} positions`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // POST /api/justify — busca linha pela LT (col B = chave primária) e salva na col Q
  if (urlPath === '/api/justify' && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', async () => {
      try {
        const { lt, text } = JSON.parse(body);
        if (!lt) throw new Error('LT não informado');

        if (!SERVICE_ACCOUNT) {
          res.writeHead(501, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Escrita requer Service Account configurado' }));
          return;
        }

        const token = await getServiceAccountToken();

        // 1. Busca col B inteira para encontrar a linha correta pela LT
        const lookupUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent('Daily!B:B')}`;
        const lookupResp = await fetch(lookupUrl, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!lookupResp.ok) throw new Error(`Lookup error: ${lookupResp.status}`);
        const lookupData = await lookupResp.json();
        const colB = lookupData.values || [];

        const rowIndex = colB.findIndex((row, i) => i > 0 && row[0] === lt);
        if (rowIndex === -1) throw new Error(`LT "${lt}" não encontrada na planilha`);
        const rowNum = rowIndex + 1; // 1-based

        // 2. Escreve na col Q da linha encontrada
        const range = `Daily!Q${rowNum}`;
        const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

        const resp = await fetch(url, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[text]] }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`Sheets write ${resp.status}: ${errText}`);
        }

        // Invalida cache para próxima leitura pegar a coluna Q atualizada
        cacheFetchedAt = 0;

        console.log(`[justify] LT="${lt}" → Linha ${rowNum} → Q="${text}"`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rowNum }));
      } catch (e) {
        console.error('[justify] Erro:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // POST /api/justify-spr — busca linha pela LT e salva justificativa de SPR na col R
  if (urlPath === '/api/justify-spr' && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', async () => {
      try {
        const { lt, text } = JSON.parse(body);
        if (!lt) throw new Error('LT não informado');

        if (!SERVICE_ACCOUNT) {
          res.writeHead(501, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Escrita requer Service Account configurado' }));
          return;
        }

        const token = await getServiceAccountToken();

        const lookupUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent('Daily!B:B')}`;
        const lookupResp = await fetch(lookupUrl, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!lookupResp.ok) throw new Error(`Lookup error: ${lookupResp.status}`);
        const lookupData = await lookupResp.json();
        const colB = lookupData.values || [];

        const rowIndex = colB.findIndex((row, i) => i > 0 && row[0] === lt);
        if (rowIndex === -1) throw new Error(`LT "${lt}" não encontrada na planilha`);
        const rowNum = rowIndex + 1;

        const range = `Daily!R${rowNum}`;
        const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

        const resp = await fetch(url, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[text]] }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`Sheets write ${resp.status}: ${errText}`);
        }

        cacheFetchedAt = 0;
        console.log(`[justify-spr] LT="${lt}" → Linha ${rowNum} → R="${text}"`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rowNum }));
      } catch (e) {
        console.error('[justify-spr] Erro:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /api/spr — debug: retorna o SPR_MAP atual em cache
  if (urlPath === '/api/spr') {
    getData((err, data) => {
      if (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ SPR_MAP: data.SPR_MAP, count: Object.keys(data.SPR_MAP || {}).length }));
    });
    return;
  }

  // GET /api/stage-out — serves stage-out data to dashboard
  if (urlPath === '/api/stage-out') {
    if (!stageCache) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No data yet — open SPX page with Tampermonkey active' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(stageCache));
    return;
  }

  if (urlPath === '/api/data') {
    getData((err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(data));
    });
    return;
  }

  let filePath = path.join(__dirname, urlPath === '/' ? 'dashboard.html' : urlPath);
  if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext  = path.extname(filePath);
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

const PORT = process.env.PORT || 4200;
server.listen(PORT, () => console.log(`Dashboard → http://localhost:${PORT}`));
