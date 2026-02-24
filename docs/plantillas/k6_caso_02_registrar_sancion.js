import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_API = __ENV.BASE_API || 'https://reginsaapiqa.sunedu.gob.pe/api';
const TOKEN = __ENV.TOKEN || '';

export const options = {
  vus: 1,
  iterations: 1, // sube si tu backend lo permite
};

function headers() {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `${TOKEN}`.trim()
    }
  };
}

// Listar cabeceras paginadas
function listarCabecerasPaginado(page = 1, pageSize = 10) {
  const url = `${BASE_API}/CabeceraInfraccionSancion/ListarPaginado`;
  const payload = JSON.stringify({
    nPageNumber: page,
    nPageSize: pageSize,
    sSortColumnName: 'FECHA_REGISTRO',
    sSortOrder: 'DESC',
    fechaRegistroIni: null,
    fechaRegistroFin: null,
    filtroEstado: null,
    numeroExpediente: null,
    numeroResolucion: null,
    sFilterValue: ''
  });
  const res = http.post(url, payload, headers());
  console.log('listarCabecerasPaginado response status:', res.status);
  console.log('listarCabecerasPaginado response body:', res.body);
  check(res, { 'listar cabeceras paginado 200': (r) => r.status === 200 });
  try {
    return res.json()?.oData;
  } catch (e) {
    console.log('Error parsing JSON in listarCabecerasPaginado:', e.message);
    return null;
  }
}

// 1. Listar infracciones (ejemplo con idRis=1)
function listarInfracciones(idRis) {
  const payload = JSON.stringify({ idRis });
  const res = http.post(`${BASE_API}/Infraccion/Listar`, payload, headers());
  check(res, { 'listar infracciones 200': (r) => r.status === 200 });
  return res.json()?.oData;
}

// 2. Crear cabecera
function crearCabecera() {
  const payload = JSON.stringify({
    IdEntidad: 3,
    NumeroExpediente: `EXP N° ${Math.floor(Math.random() * 1000)}-2026`,
    NumeroResolucion: `RES N° ${Math.floor(Math.random() * 1000)}-2026`,
    FechaResolucion: '2026-02-01',
    RutaResolucionSancion: 'GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf'
    // ArchivoResolucion: (no se puede enviar binario desde k6 fácilmente)
  });
  const res = http.post(`${BASE_API}/CabeceraInfraccionSancion/Crear`, payload, headers());
  check(res, { 'cabecera creada': (r) => r.status === 200 || r.status === 201 });
  return res.json()?.oData;
}

// 3. Crear medida correctiva
function crearMedida(idCabecera, descripcion, orden) {
  const payload = JSON.stringify({
    idCabeceraInfraccionSancion: idCabecera,
    descripcionMedidaCorrectiva: descripcion,
    orden: orden
  });
  const res = http.post(`${BASE_API}/MedidaCorrectiva/Crear`, payload, headers());
  check(res, { 'medida creada': (r) => r.status === 200 || r.status === 201 });
  return res.json()?.oData;
}

// 4. Crear detalle infracción sanción
function crearDetalle(detalle) {
  const res = http.post(`${BASE_API}/DetalleInfraccionSancion/Crear`, JSON.stringify(detalle), headers());
  check(res, { 'detalle creado': (r) => r.status === 200 || r.status === 201 });
  return res.json()?.oData;
}

export default function main() {
  // 1. Listar cabeceras paginadas (nuevo paso)
  const cabecerasPaginadas = listarCabecerasPaginado(1, 10);
  if (cabecerasPaginadas && cabecerasPaginadas.Results && cabecerasPaginadas.Results.length > 0) {
    console.log(`Cabeceras paginadas encontradas: ${cabecerasPaginadas.Results.length}`);
  } else {
    console.log('No se encontraron cabeceras paginadas');
  }

  // 2. Listar infracciones para RIS 2
  const infraccionesRis2 = listarInfracciones(2);

  // 3. Crear cabecera
  const cabeceraId = crearCabecera();
  if (!cabeceraId) {
    console.log('No se pudo crear cabecera');
    return;
  }

  // 4. Crear medida correctiva
  crearMedida(cabeceraId, 'Medida Correctiva 1', 1);

  // 5. Crear detalle (ejemplo usando una infracción de RIS 2)
  const infraccion = infraccionesRis2 && infraccionesRis2[1]; // por ejemplo, la segunda infracción
  if (!infraccion) {
    console.log('No hay infracción disponible');
    return;
  }

  const detallePayload = {
    idCabeceraInfraccionSancion: cabeceraId,
    IdInfraccion: infraccion.IdInfraccion,
    desInfraccion: infraccion.DisplayInfraccion,
    desSancion: "Suspensión",
    bitReconsidera: 0,
    bitReincidente: 0,
    bitPago: 0,
    desSuspension: "A",
    bitCancelacion: 0,
    canSuspension: 2,
    tipoMulta: null,
    numMonto: 0,
    idRis: 2,
    desHechoInfractor: "Hecho Infractor",
    numCorrelativo: 2,
    bitMedida: 1,
    desMedidaCorrectivaGen: "Medida Correctiva 1",
    tempId: -2
  };

  crearDetalle(detallePayload);

  sleep(1); // para evitar rate limit
}