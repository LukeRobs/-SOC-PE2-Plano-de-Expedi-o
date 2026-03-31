// Vercel Serverless Function — POST /api/justify
// Busca a linha pela LT (col B = chave primária) e salva justificativa na col Q

const crypto         = require('crypto');
const SPREADSHEET_ID = '1Sk16vRNBUsQitL3cRUSIH86SyfQpxV9t08UW2YrSdmQ';

function b64url(buf) {
  return buf.toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

async function getServiceAccountToken(sa) {
  const { client_email, private_key } = sa;
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64url(Buffer.from(JSON.stringify({ alg:'RS256', typ:'JWT' })));
  const pay = b64url(Buffer.from(JSON.stringify({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  })));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${hdr}.${pay}`);
  const jwt = `${hdr}.${pay}.${b64url(sign.sign(private_key))}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) throw new Error(`Token error: ${resp.status}`);
  const data = await resp.json();
  return data.access_token;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' }); return;
  }

  try {
    const { lt, text } = req.body;
    if (!lt) throw new Error('LT não informado');

    if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
      res.status(501).json({ error: 'GOOGLE_SERVICE_ACCOUNT não configurado no Vercel' });
      return;
    }

    const sa    = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
    const token = await getServiceAccountToken(sa);

    // 1. Busca col B inteira para encontrar a linha correta pela LT
    const lookupUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent('Daily!B:B')}`;
    const lookupResp = await fetch(lookupUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!lookupResp.ok) throw new Error(`Lookup error: ${lookupResp.status}`);
    const lookupData = await lookupResp.json();
    const colB = lookupData.values || [];

    // Encontra linha onde col B = lt (índice 0 = header, índice 1 = linha 2)
    const rowIndex = colB.findIndex((row, i) => i > 0 && row[0] === lt);
    if (rowIndex === -1) throw new Error(`LT "${lt}" não encontrada na planilha`);

    const rowNum = rowIndex + 1; // sheets são 1-based, rowIndex 1 = linha 2

    // 2. Escreve na col Q da linha encontrada
    const range = `Daily!Q${rowNum}`;
    const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

    const writeResp = await fetch(writeUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[text]] }),
    });

    if (!writeResp.ok) {
      const errText = await writeResp.text();
      throw new Error(`Sheets write ${writeResp.status}: ${errText}`);
    }

    console.log(`[justify] LT="${lt}" → Linha ${rowNum} → Q="${text}"`);
    res.status(200).json({ ok: true, rowNum });
  } catch (e) {
    console.error('[justify] Erro:', e.message);
    res.status(500).json({ error: e.message });
  }
};
