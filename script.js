import http from 'k6/http';
import { open, check, sleep } from 'k6';
const TOKEN = __ENV.TOKEN1;

let administradosRaw;
try {
  administradosRaw = open('administrados.txt'); // Ruta raíz del bundle para k6 cloud
} catch (e) {
  console.error('Ruta actual:', __ENV.PWD);
  throw new Error('❌ administrados.txt no encontrado o no accesible. Debe existir en la raíz del bundle.');
}
const administradosActivos = administradosRaw
  ? administradosRaw
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(id => Number.parseInt(id, 10))
  : [];
if (!administradosActivos.length) {
  throw new Error('❌ administrados.txt está vacío o no contiene IDs válidos. Agregue al menos un ID de administrado activo (uno por línea).');
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function nowTimestamp() {
  return Date.now();
}


function generarData() {
  const timestamp = nowTimestamp();
  const correlativo = timestamp % 10000;
  const idx = (__ITER % administradosActivos.length);
  const idEntidad = administradosActivos[idx];

  // Lógica de sanciones por iteración: 1=8, 2=7, ..., 8=1, luego 3,2,1 cíclico
  let sanciones;
  if (__ITER <= 8) {
    sanciones = 9 - __ITER;
  } else {
    const ciclo = ((__ITER - 9) % 3) + 1;
    sanciones = 4 - ciclo;
  }

  // Generar array de Detalles según sanciones
  const Detalles = [];
  for (let i = 0; i < sanciones; i++) {
    Detalles.push({
      desSancion: 'Multa',
      bitReconsidera: 0,
      bitReincidente: 0,
      bitPago: 0,
      desSuspension: null,
      bitCancelacion: 1,
      canSuspension: 0,
      tipoMulta: null,
      numMonto: Math.floor(Math.random() * 200000) + 10000, // Monto aleatorio
      desHechoInfractor: 'Hecho Infractor',
      numCorrelativo: i + 1,
      bitMedida: 1,
      desMedidaCorrectivaGen: 'Medida Correctiva'
    });
  }

  return {
    idRis: 1,
    IdEntidad: idEntidad,
    NumeroExpediente: `EXP N° ${correlativo}-2026`,
    NumeroResolucion: `RES N° ${correlativo}-2026`,
    FechaResolucion: new Date().toISOString(),
    RutaResolucionSancion: 'GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf',
    ArchivoResolucion: '',
    Medidas: [
      {
        descripcionMedidaCorrectiva: 'Medida Correctiva',
        orden: 1
      }
    ],
    Detalles
  };
}

const PDF_FOLDER = __ENV.K6_PDF_FOLDER || null;

const TOKENS = [
  __ENV.TOKEN1 || '',
  __ENV.TOKEN2 || ''
];

function getTokenForVU() {
  let token = TOKENS[__VU - 1] || TOKENS[0];
  if (token.startsWith('<') && token.endsWith('>')) {
    token = token.slice(1, -1);
  }
  if (!token.startsWith('Bearer ')) {
    token = 'Bearer ' + token;
  }
  return token;
}

export const options = {
  vus: 1,
  iterations: 1,
};

const PDF_PATH = 'test-files/GENERAL_00001-2026-SUNEDU-SG-OTI.pdf';

function headers() {
  return {
    'Content-Type': 'application/json',
    'Authorization': getTokenForVU().trim()
  };
}

function listarInfracciones(idRis) {
  const payload = JSON.stringify({ idRis });
  const authHeader = headers();
  console.log('Enviando a /Infraccion/Listar');
  console.log('Payload:', payload);
  console.log('Headers:', authHeader);
  const res = http.post(`${BASE_API}/Infraccion/Listar`, payload, { headers: authHeader });
  console.log('STATUS listar:', res.status);
  console.log('BODY listar:', res.body);
  const json = res.json();
  if (!json || !Array.isArray(json.oData)) {
    console.error('❌ oData no es array:', JSON.stringify(json));
    return [];
  }
  return json.oData;
}

function crearCabecera(data) {
  let rutaPdf = data.RutaResolucionSancion;
  if (PDF_FOLDER && rutaPdf && !rutaPdf.startsWith(PDF_FOLDER)) {
    rutaPdf = PDF_FOLDER + rutaPdf;
  }
  const payload = JSON.stringify({
    IdEntidad: data.IdEntidad,
    NumeroExpediente: data.NumeroExpediente,
    NumeroResolucion: data.NumeroResolucion,
    FechaResolucion: data.FechaResolucion,
    RutaResolucionSancion: rutaPdf,
    ArchivoResolucion: data.ArchivoResolucion
  });
  const res = http.post(`${BASE_API}/CabeceraInfraccionSancion/Crear`, payload, { headers: headers() });
  console.log('STATUS cabecera:', res.status);
  console.log('BODY cabecera:', res.body);
  check(res, { 'cabecera creada': (r) => r.status === 200 || r.status === 201 });
  const oData = res.json()?.oData;
  if (!oData) return null;
  if (typeof oData === 'object' && oData.idCabeceraInfraccionSancion) {
    return oData.idCabeceraInfraccionSancion;
  }
  if (Array.isArray(oData) && oData.length > 0 && oData[0].idCabeceraInfraccionSancion) {
    return oData[0].idCabeceraInfraccionSancion;
  }
  return null;
}

function crearMedida(idCabecera, medida) {
  const payload = JSON.stringify({
    idCabeceraInfraccionSancion: idCabecera,
    descripcionMedidaCorrectiva: medida.descripcionMedidaCorrectiva,
    orden: medida.orden
  });
  const res = http.post(`${BASE_API}/MedidaCorrectiva/Crear`, payload, { headers: headers() });
  console.log('STATUS medida:', res.status);
  console.log('BODY medida:', res.body);
  check(res, { 'medida creada': (r) => r.status === 200 || r.status === 201 });
  return res.json()?.oData;
}

function crearDetalle(idCabecera, detalle, idInfraccion, displayInfraccion) {
  const payload = JSON.stringify({
    idCabeceraInfraccionSancion: idCabecera,
    IdInfraccion: idInfraccion,
    desInfraccion: displayInfraccion,
    ...detalle,
    idRis: 2,
    tempId: -2
  });
  const res = http.post(`${BASE_API}/DetalleInfraccionSancion/Crear`, payload, { headers: headers() });
  console.log('STATUS detalle:', res.status);
  console.log('BODY detalle:', res.body);
  check(res, { 'detalle creado': (r) => r.status === 200 || r.status === 201 });
  return res.json()?.oData;
}

export default function () {
  const registrosPorIteracion = parseInt(__ENV.K6_REGISTROS_POR_ITERACION || '1', 10);
  for (let i = 0; i < registrosPorIteracion; i++) {
    const data = generarData();
    const infracciones = listarInfracciones(data.idRis);
    if (!infracciones || infracciones.length === 0) {
      console.log('No hay infracciones para RIS', data.idRis);
      continue;
    }
    const cabeceraId = crearCabecera(data);
    if (!cabeceraId) {
      console.log('No se pudo crear cabecera');
      continue;
    }
    data.Medidas.forEach(medida => crearMedida(cabeceraId, medida));
    const infraccion = infracciones[1];
    if (!infraccion) {
      console.log('No hay infracción disponible');
      continue;
    }
    data.Detalles.forEach(detalle => {
      crearDetalle(
        cabeceraId,
        detalle,
        infraccion.IdInfraccion,
        infraccion.DisplayInfraccion
      );
    });
  }
  sleep(5);
}
