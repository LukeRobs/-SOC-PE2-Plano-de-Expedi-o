// Vercel Serverless Function — GET /api/spr?station=PE-02|PE-04  (debug: raw SPR tab)
const { getServiceAccountToken }              = require('./_lib/auth');
const { fetchRange }                          = require('./_lib/sheets');
const { parseSprRaw }                         = require('./_lib/process');
const { STATIONS, DEFAULT_STATION, resolveStation } = require('./_lib/stations');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const station = resolveStation(req.query.station) || DEFAULT_STATION;
  const { spreadsheetId } = STATIONS[station];

  try {
    const token  = await getServiceAccountToken();
    const raw    = await fetchRange(token, spreadsheetId, 'SPR!A1:F500', '?valueRenderOption=UNFORMATTED_VALUE');
    const sprMap = parseSprRaw(raw);
    res.status(200).json({ station, raw: raw.values, SPR_MAP: sprMap });
  } catch (e) {
    console.error('[api/spr]', station, e);
    res.status(500).json({ error: e.message, station });
  }
};
