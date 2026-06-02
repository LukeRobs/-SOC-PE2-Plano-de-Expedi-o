// ═══════════════════════════════════════════════════════════════════
//  DASHBOARD STAGE OUT — AUDITORIA
//  Code.gs — Backend Google Apps Script
//  Versão 2.0 | Lucas
// ═══════════════════════════════════════════════════════════════════

const CONFIG = {
  SHEET_ID:   '1FF1DWCqgoHX6KcO58ilqAOynOIuLMBk7p3MEBMStHXs',
  SHEET_NAME: 'dbAudOut',
  CACHE_KEY:  'stageout_audit_v4',
  CACHE_TTL:  300,
};

/**
 * Colunas lógicas → candidatos de header.
 * NOTA: scuttle e gaiola são VALORES da coluna CG_ou_TO, não colunas separadas.
 * Por isso a detecção usa a chave "type" para a coluna CG_ou_TO.
 */
const COL_CANDIDATES = {
  auditId:    ['id','ID'],
  date:       ['data/hora','Data/Hora','DATA/HORA','data','Data','DATA','date'],
  sortcode:   ['sortcode','SortCode','SORTCODE','sort_code','Sort Code'],
  rua:        ['rua','Rua','RUA'],
  type:       ['cg_ou_to','CG_ou_TO','tipo','Tipo','type','Type'],   // valor = Gaiola | Scuttle
  qrcode:     ['qrcode_cg_ou_to','QRCode_CG_ou_TO','qrcode','QRCode','qr_code'],
  ocorrencia: ['ocorrencia','Ocorrencia','Ocorrência','ocorrência'],
  auditor:    ['ops_auditor','Ops_Auditor','auditor','Auditor','operador','Operador'],
  obs:        ['observacao','Observacao','Observação','observação','obs','OBS'],
};

// ─── Entry Point ─────────────────────────────────────────────────
function doGet() {
  return HtmlService
    .createTemplateFromFile('index')
    .evaluate()
    .setTitle('Dashboard Stage Out — Auditoria')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─── Leitura da Planilha ─────────────────────────────────────────
function fetchFromSheet() {
  var ss    = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('Aba "' + CONFIG.SHEET_NAME + '" não encontrada.');

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { headers: [], rows: [], colMap: {}, toColumns: [] };

  var tz      = Session.getScriptTimeZone();
  var headers = values[0].map(function(h) { return String(h).trim(); });
  var colMap  = detectColumns(headers);

  // Detecta colunas de TOs: TO1, TO2 ... TO20 (ou qualquer TON)
  var toColumns = headers.filter(function(h) { return /^TO\d+$/.test(h); });

  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row     = {};
    var isEmpty = true;
    headers.forEach(function(h, j) {
      var v = values[i][j];
      if (v instanceof Date) {
        // Preserva data E hora para Data/Hora
        v = Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm');
      } else if (v === null || v === undefined) {
        v = '';
      } else {
        v = String(v).trim();
      }
      row[h] = v;
      if (v !== '') isEmpty = false;
    });
    if (!isEmpty) rows.push(row);
  }

  return { headers: headers, rows: rows, colMap: colMap, toColumns: toColumns };
}

function detectColumns(headers) {
  var lc     = headers.map(function(h) { return h.toLowerCase(); });
  var result = {};
  Object.keys(COL_CANDIDATES).forEach(function(key) {
    result[key] = null;
    var candidates = COL_CANDIDATES[key];
    for (var i = 0; i < candidates.length; i++) {
      var idx = lc.indexOf(candidates[i].toLowerCase());
      if (idx >= 0) { result[key] = headers[idx]; break; }
    }
  });
  return result;
}

// ─── Função Principal de Dados ────────────────────────────────────
function getData(filters) {
  try {
    var cache  = CacheService.getScriptCache();
    var cached = cache.get(CONFIG.CACHE_KEY);
    var base;

    if (cached) {
      base = JSON.parse(cached);
    } else {
      base = fetchFromSheet();
      try {
        cache.put(CONFIG.CACHE_KEY, JSON.stringify(base), CONFIG.CACHE_TTL);
      } catch (e) {
        Logger.log('Cache skip: ' + e.message);
      }
    }

    var filtered = applyFilters(base.rows, base.colMap, filters || {});

    return {
      success:   true,
      headers:   base.headers,
      rows:      filtered,
      colMap:    base.colMap,
      toColumns: base.toColumns || [],
      totalRows: filtered.length,
    };
  } catch (e) {
    Logger.log('Erro getData: ' + e.message);
    return { success: false, error: e.message };
  }
}

function applyFilters(rows, colMap, f) {
  return rows.filter(function(row) {
    // Usa substring(0,10) para comparar só a data (ignora hora)
    if (f.startDate && colMap.date) {
      var d = (row[colMap.date] || '').substring(0, 10);
      if (d && d < f.startDate) return false;
    }
    if (f.endDate && colMap.date) {
      var d2 = (row[colMap.date] || '').substring(0, 10);
      if (d2 && d2 > f.endDate) return false;
    }
    if (f.sortcode && colMap.sortcode) {
      var sc = (row[colMap.sortcode] || '').toLowerCase();
      if (sc.indexOf(f.sortcode.toLowerCase()) === -1) return false;
    }
    // Filtro por tipo (Gaiola/Scuttle)
    if (f.type && colMap.type) {
      var tp = (row[colMap.type] || '').toLowerCase();
      if (tp !== f.type.toLowerCase()) return false;
    }
    return true;
  });
}

function invalidateCache() {
  CacheService.getScriptCache().remove(CONFIG.CACHE_KEY);
  return { success: true };
}
