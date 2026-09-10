// Vercel Serverless Function — /api/data?station=PE-02|PE-04
const { getServiceAccountToken }              = require('./_lib/auth');
const { fetchRange }                          = require('./_lib/sheets');
const { processRawData }                      = require('./_lib/process');
const { STATIONS, DEFAULT_STATION, resolveStation } = require('./_lib/stations');

const RANGE     = 'Daily!A1:R3000';
const SPR_RANGE = 'SPR!A1:F500';

const caches = {}; // station -> { data, exp }

function emptyResult(station, reason) {
  return {
    DATES: [], BY_DATE: {}, ALL_ROWS: [], SPR_MAP: {},
    generatedAt: Date.now(), rowCount: 0,
    station, noData: true, reason: reason || null,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const station = resolveStation(req.query.station);
  if (!station) {
    return res.status(400).json({ error: `Estação inválida: ${req.query.station || '(vazio)'}` });
  }
  const { spreadsheetId } = STATIONS[station];

  const c = caches[station];
  if (c && Date.now() < c.exp && !req.query.nocache) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json(c.data);
  }

  try {
    const token = await getServiceAccountToken();
    const [raw, sprRaw] = await Promise.all([
      fetchRange(token, spreadsheetId, RANGE).catch(err => {
        // Estação sem acesso / aba Daily inexistente → trata como "sem dados" (só para estações não-padrão)
        if (station === DEFAULT_STATION) throw err;
        return { __error: err.message };
      }),
      fetchRange(token, spreadsheetId, SPR_RANGE, '?valueRenderOption=UNFORMATTED_VALUE').catch(() => ({ values: [] })),
    ]);

    let result;
    if (raw && raw.__error) {
      result = emptyResult(station, raw.__error);
    } else {
      result = processRawData(raw, sprRaw);
      result.station = station;
      if (result.rowCount === 0) result.noData = true;
    }

    caches[station] = { data: result, exp: Date.now() + 60_000 };
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    res.status(200).json(result);
  } catch (e) {
    console.error('[api/data]', station, e);
    res.status(500).json({ error: e.message, station });
  }
};
