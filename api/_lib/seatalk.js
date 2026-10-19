// Envio de mensagem de texto para grupo SeaTalk.
// Config (env):
//   SEATALK_WEBHOOK_URL                      → webhook do grupo (mais simples), OU
//   SEATALK_APP_ID + SEATALK_APP_SECRET      → bot app (API messaging/v2/group_chat)
//   SEATALK_GROUP_ID                         → grupo (default abaixo), usado com o bot app
const DEFAULT_GROUP_ID = 'ODEwMDU3NzI4NTY0';
const MAX_LEN = 4000;

let tok = null, tokExp = 0;
async function appToken() {
  if (tok && Date.now() < tokExp) return tok;
  const r = await fetch('https://openapi.seatalk.io/auth/app_access_token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: process.env.SEATALK_APP_ID, app_secret: process.env.SEATALK_APP_SECRET }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== 0) throw new Error(`SeaTalk auth falhou: ${j.code ?? r.status} ${j.msg || ''}`.trim());
  tok = j.app_access_token;
  tokExp = Date.now() + Math.max(60, (j.expire || 7200) - 120) * 1000;
  return tok;
}

async function sendGroupText(text) {
  const content = String(text || '').slice(0, MAX_LEN);
  if (!content.trim()) throw new Error('Mensagem vazia');

  if (process.env.SEATALK_WEBHOOK_URL) {
    const r = await fetch(process.env.SEATALK_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: 'text', text: { content } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || (j.code !== undefined && j.code !== 0)) throw new Error(`SeaTalk webhook: ${j.code ?? r.status} ${j.msg || ''}`.trim());
    return;
  }
  if (!process.env.SEATALK_APP_ID || !process.env.SEATALK_APP_SECRET) {
    throw new Error('SeaTalk não configurado (SEATALK_WEBHOOK_URL ou SEATALK_APP_ID + SEATALK_APP_SECRET)');
  }
  const token = await appToken();
  const r = await fetch('https://openapi.seatalk.io/messaging/v2/group_chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      group_id: process.env.SEATALK_GROUP_ID || DEFAULT_GROUP_ID,
      message: { tag: 'text', text: { content } },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== 0) { if (j.code === 100) tok = null; throw new Error(`SeaTalk envio: ${j.code ?? r.status} ${j.msg || ''}`.trim()); }
}

module.exports = { sendGroupText };
