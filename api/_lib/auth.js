const crypto = require('crypto');

let saToken = null, saTokenExp = 0;

function b64url(buf) {
  return buf.toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function loadSA() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    return JSON.parse(require('fs').readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8'));
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    return JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
  }
  throw new Error('Nenhuma Service Account configurada (GOOGLE_SERVICE_ACCOUNT ou GOOGLE_SERVICE_ACCOUNT_FILE)');
}

async function getServiceAccountToken() {
  if (saToken && Date.now() < saTokenExp) return saToken;
  const { client_email, private_key } = loadSA();
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
  if (!resp.ok) throw new Error(`Token error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  saToken    = data.access_token;
  saTokenExp = Date.now() + (data.expires_in - 60) * 1000;
  return saToken;
}

module.exports = { getServiceAccountToken };
