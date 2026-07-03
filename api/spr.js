// Vercel Serverless Function — GET /api/spr  (debug: raw SPR tab)
const { getServiceAccountToken } = require('./_lib/auth');
const { fetchRange }             = require('./_lib/sheets');
const { parseSprRaw }            = require('./_lib/process');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token  = await getServiceAccountToken();
    const raw    = await fetchRange(token, 'SPR!A1:F500', '?valueRenderOption=UNFORMATTED_VALUE');
    const sprMap = parseSprRaw(raw);
    res.status(200).json({ raw: raw.values, SPR_MAP: sprMap });
  } catch (e) {
    console.error('[api/spr]', e);
    res.status(500).json({ error: e.message });
  }
};
