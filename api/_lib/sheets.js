// Planilha PE-02 (padrão histórico). Outras estações passam o spreadsheetId explicitamente.
const DEFAULT_SPREADSHEET_ID = '1Sk16vRNBUsQitL3cRUSIH86SyfQpxV9t08UW2YrSdmQ';

async function fetchRange(token, spreadsheetId, range, qs = '') {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}${qs}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Sheets API ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function lookupRowByLT(token, spreadsheetId, lt) {
  const data = await fetchRange(token, spreadsheetId, 'Daily!B:B');
  const colB  = data.values || [];
  const idx   = colB.findIndex((row, i) => i > 0 && row[0] === lt);
  if (idx === -1) throw new Error(`LT "${lt}" não encontrada na planilha`);
  return idx + 1; // 1-based
}

async function writeCell(token, spreadsheetId, range, value) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[value]] }),
  });
  if (!resp.ok) throw new Error(`Sheets write ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// Letra da coluna (ex.: "R") da aba Daily pelo nome do header; fallback = letra padrão
async function dailyColLetter(token, spreadsheetId, headerName, fallback) {
  try {
    const { values } = await fetchRange(token, spreadsheetId, 'Daily!1:1');
    const i = (values && values[0] || []).findIndex(h => (h || '').toString().trim().toLowerCase() === headerName.toLowerCase());
    if (i >= 0) return require('./process').colLetter(i);
  } catch (_) {}
  return fallback;
}

module.exports = {
  dailyColLetter,
  DEFAULT_SPREADSHEET_ID,
  SPREADSHEET_ID: DEFAULT_SPREADSHEET_ID, // alias retrocompatível
  fetchRange, lookupRowByLT, writeCell,
};
