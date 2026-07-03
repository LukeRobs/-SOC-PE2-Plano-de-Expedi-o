// Vercel Serverless Function — POST /api/justify-spr  (col R = justif. SPR)
const { getServiceAccountToken } = require('./_lib/auth');
const { lookupRowByLT, writeCell } = require('./_lib/sheets');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { lt, text } = req.body || {};
    if (!lt) throw new Error('LT não informado');
    const token  = await getServiceAccountToken();
    const rowNum = await lookupRowByLT(token, lt);
    await writeCell(token, `Daily!R${rowNum}`, text || '');
    console.log(`[justify-spr] LT="${lt}" → R${rowNum}="${text}"`);
    res.status(200).json({ ok: true, rowNum });
  } catch (e) {
    console.error('[justify-spr]', e.message);
    res.status(500).json({ error: e.message });
  }
};
