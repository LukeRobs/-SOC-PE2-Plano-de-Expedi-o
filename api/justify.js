// Vercel Serverless Function — POST /api/justify  (col Q = justif. CPT)
const { getServiceAccountToken }    = require('./_lib/auth');
const { lookupRowByLT, writeCell }  = require('./_lib/sheets');
const { STATIONS, resolveStation }  = require('./_lib/stations');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { lt, text, station: stationRaw } = req.body || {};
    if (!lt) throw new Error('LT não informado');
    const station = resolveStation(stationRaw);
    if (!station) throw new Error(`Estação inválida: ${stationRaw || '(vazio)'}`);
    const { spreadsheetId } = STATIONS[station];

    const token  = await getServiceAccountToken();
    const rowNum = await lookupRowByLT(token, spreadsheetId, lt);
    await writeCell(token, spreadsheetId, `Daily!Q${rowNum}`, text || '');
    console.log(`[justify] ${station} LT="${lt}" → Q${rowNum}="${text}"`);
    res.status(200).json({ ok: true, rowNum, station });
  } catch (e) {
    console.error('[justify]', e.message);
    res.status(500).json({ error: e.message });
  }
};
