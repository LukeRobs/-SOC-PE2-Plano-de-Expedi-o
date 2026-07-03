// Vercel Serverless Function — /api/data
const { getServiceAccountToken } = require('./_lib/auth');
const { fetchRange }             = require('./_lib/sheets');
const { processRawData }         = require('./_lib/process');

const RANGE     = 'Daily!A1:R3000';
const SPR_RANGE = 'SPR!A1:F500';

let cache = null, cacheExp = 0;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (cache && Date.now() < cacheExp) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json(cache);
  }

  try {
    const token = await getServiceAccountToken();
    const [raw, sprRaw] = await Promise.all([
      fetchRange(token, RANGE),
      fetchRange(token, SPR_RANGE, '?valueRenderOption=UNFORMATTED_VALUE').catch(() => ({ values: [] })),
    ]);
    const result = processRawData(raw, sprRaw);
    cache    = result;
    cacheExp = Date.now() + 60_000;
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    res.status(200).json(result);
  } catch (e) {
    console.error('[api/data]', e);
    res.status(500).json({ error: e.message });
  }
};
