const {spawn} = require('child_process');
const fs = require('fs');

const params = JSON.stringify({
  spreadsheetId: '1Sk16vRNBUsQitL3cRUSIH86SyfQpxV9t08UW2YrSdmQ',
  range: 'Daily!A1:P3000'
});
const child = spawn('cmd.exe', ['/c', 'gws', 'sheets', 'spreadsheets', 'values', 'get', '--params', params], {env: process.env});

let out = '';
child.stdout.on('data', d => { out += d; });
child.stderr.on('data', d => { /* ignore keyring warning */ });
child.on('close', code => {
  if (code !== 0) { console.error('gws failed code:', code); process.exit(1); }
  fs.writeFileSync(process.env.USERPROFILE + '/daily_3k.json', out);
  const vals = JSON.parse(out).values;
  const rows = vals.slice(1);
  const comReal = rows.filter(r => r[15] && r[15] !== '.0' && r[15] !== '0' && r[15] !== '0.0').length;
  const exemplo = rows.find(r => r[15] && r[15] !== '.0' && r[15] !== '0' && r[15] !== '0.0');
  console.log('Total linhas:', rows.length);
  console.log('Com Pacotes_Real preenchido:', comReal);
  if (exemplo) console.log('Exemplo:', 'LT='+exemplo[1], 'Shipments='+exemplo[12], 'Pacotes_Real='+exemplo[15]);
});
