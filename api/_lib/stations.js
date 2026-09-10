// Estações de expedição → planilha Google Sheets (aba Daily / SPR)
const STATIONS = {
  'PE-02': {
    label: 'PE-02',
    socTag: 'SOC-PE2',
    spreadsheetId: '1Sk16vRNBUsQitL3cRUSIH86SyfQpxV9t08UW2YrSdmQ',
  },
  'PE-04': {
    label: 'PE-04',
    socTag: 'SOC-PE4',
    // Planilha ainda sem dados — a API responde noData:true enquanto a aba Daily estiver vazia
    spreadsheetId: '12lG1296WUuSzO7oAVYZZ6huQ_UPewsvV8BPRnkpxtNQ',
  },
};

const DEFAULT_STATION = 'PE-02';

// Aceita "PE-02", "pe-02", "PE02", "pe2", " PE 04 " → chave canônica ("PE-02") ou null
function resolveStation(raw) {
  let key = (raw == null || raw === '' ? DEFAULT_STATION : raw)
    .toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = key.match(/^PE0*(\d+)$/);
  if (m) key = 'PE-' + m[1].padStart(2, '0');
  return Object.prototype.hasOwnProperty.call(STATIONS, key) ? key : null;
}

module.exports = { STATIONS, DEFAULT_STATION, resolveStation };
