const SPREADSHEET_ID = '1Sk16vRNBUsQitL3cRUSIH86SyfQpxV9t08UW2YrSdmQ';

async function fetchRange(token, range, qs = '') {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}${qs}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Sheets API ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function lookupRowByLT(token, lt) {
  const data = await fetchRange(token, 'Daily!B:B');
  const colB  = data.values || [];
  const idx   = colB.findIndex((row, i) => i > 0 && row[0] === lt);
  if (idx === -1) throw new Error(`LT "${lt}" não encontrada na planilha`);
  return idx + 1; // 1-based
}

async function writeCell(token, range, value) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[value]] }),
  });
  if (!resp.ok) throw new Error(`Sheets write ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

module.exports = { SPREADSHEET_ID, fetchRange, lookupRowByLT, writeCell };
