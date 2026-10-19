// Vercel Serverless Function — POST /api/seatalk-report  { text }
const { sendGroupText } = require('./_lib/seatalk');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await sendGroupText((req.body || {}).text);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[seatalk-report]', e.message);
    res.status(500).json({ error: e.message });
  }
};
