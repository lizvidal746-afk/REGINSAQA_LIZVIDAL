import http from 'k6/http';
import { open } from 'k6';

import { open, check, sleep } from 'k6';
const TOKEN = __ENV.TOKEN1;

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

let administrados;
try {
  administrados = open('./docs/plantillas/administrados.txt');
} catch (e) {
  console.error('Ruta actual:', __ENV.PWD);
  throw new Error('❌ administrados.txt no encontrado o no accesible. Debe existir en docs/plantillas/ y ejecutarse el script desde el root del proyecto.');
}

const lista = administrados.split('\n').filter(x => x.trim() !== '');
if (lista.length === 0) {
  throw new Error('❌ administrados.txt está vacío o no contiene IDs válidos. Agregue al menos un ID de administrado activo (uno por línea).');
}

export default function () {
  // Selecciona un ID aleatorio
  const idEntidad = lista[Math.floor(Math.random() * lista.length)];
  // Construye el body según tu API
  const body = JSON.stringify({ idEntidad });
  // Realiza la petición
  const res = http.post(`${BASE_API}/endpoint`, body, { headers });
  // Log de respuesta
  console.log(res.status);
}
// INSTRUCCIONES PARA administrados.txt:
// - Debe estar en la misma carpeta que este script.
// - Debe ser texto plano (UTF-8), sin tabulaciones ni separadores.
// - Cada línea debe contener solo un ID numérico de administrado activo.
// Ejemplo:
// 12345
  administradosRaw = open('./docs/plantillas/administrados.txt'); // Ruta relativa desde el root del proyecto
// 54321


// Leer administrados activos desde administrados.txt (uno por línea)
let administradosRaw;
try {
  administradosRaw = open('docs/plantillas/administrados.txt'); // Ruta relativa desde el root del proyecto
} catch (e) {
  throw new Error('❌ administrados.txt no encontrado o no accesible. Debe existir en docs/plantillas/ y ejecutarse el script desde el root del proyecto.');
}
const administradosActivos = administradosRaw
  ? administradosRaw
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(id => Number.parseInt(id, 10))
  : [];
if (!administradosActivos.length) {
  console.error('❌ administrados.txt está vacío o no contiene IDs válidos. Agregue al menos un ID de administrado activo (uno por línea).');
}
import { open, check, sleep } from 'k6';


function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function nowTimestamp() {
  return Date.now();
}

function generarData() {
  const timestamp = nowTimestamp();
  // Extraer un número variable del timestamp para simular el correlativo
  const correlativo = timestamp % 10000; // 4 dígitos variables
  // Determinar el idEntidad según la iteración
  const idx = (__ITER % administradosActivos.length);
  const idEntidad = administradosActivos[idx];
  return {
    idRis: 1,
    IdEntidad: idEntidad,
    NumeroExpediente: `EXP N° ${correlativo}-2026`,
    NumeroResolucion: `RES N° ${correlativo}-2026`,
    FechaResolucion: new Date().toISOString(), // formato ISO completo con hora
    RutaResolucionSancion: 'GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf',
    ArchivoResolucion: '', // campo vacío
    Medidas: [
      {
        descripcionMedidaCorrectiva: 'Medida Correctiva',
        orden: 1
      }
    ],
    Detalles: [
      {
        desSancion: 'Multa',
        bitReconsidera: 0,
        bitReincidente: 0,
        bitPago: 0,
        desSuspension: null,
        bitCancelacion: 1,
        canSuspension: 0,
        tipoMulta: null,
        numMonto: 0,
        desHechoInfractor: 'Hecho Infractor',
        numCorrelativo: 2,
        bitMedida: 1,
        desMedidaCorrectivaGen: 'Medida Correctiva'
      }
    ]
  };
}

// Si se ejecuta desde k6, ajustar la ruta del PDF solo para k6
const PDF_FOLDER = __ENV.K6_PDF_FOLDER || null;



// Asegura que el token no tenga < > y siempre tenga el prefijo Bearer
const TOKENS = [
  __ENV.TOKEN1 || '', // Usuario 1
  __ENV.TOKEN2 || ''  // Usuario 2
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
  iterations: 1, // Por defecto, 1 iteración (1 registro)
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
  // Si oData es un objeto con idCabeceraInfraccionSancion
  if (typeof oData === 'object' && oData.idCabeceraInfraccionSancion) {
    return oData.idCabeceraInfraccionSancion;
  }
  // Si oData es un array, toma el primer elemento
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
  // Permite definir cuántos registros crear por iteración
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
  sleep(5); // Espera 5 segundos entre iteraciones
}
