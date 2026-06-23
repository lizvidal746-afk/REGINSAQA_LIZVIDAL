// src/services/sancion.js
// v2.0 — Adaptado al nuevo endpoint unificado CabeceraInfraccionSancion/CrearConDetalles
// Cambio arquitectónico del pase v2.0: las 3 llamadas separadas se fusionaron en una sola.

import http from 'k6/http';
import { sleep } from 'k6';
import { apiRequest, getSourceIp, recordResponseMetrics } from '../api/client.js';
import { getAuthHeaders } from '../api/auth.js';
import { config } from '../config/index.js';
import { createdRecordsCounter } from '../../lib/metrics.js';

/**
 * Listar infracciones disponibles por RIS.
 * v2.0: Cambió de POST con body JSON a GET con query param.
 */
export function listarInfracciones(idRis) {
  return apiRequest('GET', `/Infraccion/Listar?idRis=${idRis}`, null, {
    headers: getAuthHeaders(),
    tags: { name: 'Infraccion/Listar', endpoint: 'infraccion_listar' }
  });
}

/**
 * Crear cabecera + medidas + detalles en una sola llamada transaccional.
 * v2.0: Reemplaza los 3 endpoints anteriores:
 *   - CabeceraInfraccionSancion/Crear     (ELIMINADO)
 *   - MedidaCorrectiva/Crear              (ELIMINADO)
 *   - DetalleInfraccionSancion/Crear      (ELIMINADO)
 *
 * Payload: multipart/form-data con notación de array indexado.
 * Respuesta: { bSuccess, oData: { RESULTADO: <id>, MENSAJE_ERROR, LINEA_ERROR } }
 *
 * @param {Object} cabecera  - Datos de la cabecera del expediente
 * @param {Array}  medidas   - Lista de medidas correctivas
 * @param {Array}  detalles  - Lista de detalles de sanción
 * @param {Object} archivo   - Objeto { contenido: bytes, nombre: string } para el PDF
 */
export function crearConDetalles(cabecera, medidas, detalles, archivo) {
  const url    = `${config.baseUrl}/CabeceraInfraccionSancion/CrearConDetalles`;
  const sourceIp = getSourceIp();

  // Construir el payload multipart manualmente con notación de array indexado
  // que espera el backend ASP.NET (model binding estándar)
  const formData = {
    // --- Cabecera ---
    IdEntidad:            String(cabecera.idEntidad || ''),
    NumeroExpediente:     String(cabecera.numeroExpediente || ''),
    NumeroResolucion:     String(cabecera.numeroResolucion || ''),
    FechaResolucion:      String(cabecera.fechaResolucion || ''),
    RutaResolucionSancion: String(cabecera.rutaResolucionSancion || archivo.nombre || ''),
  };

  // --- Archivo PDF (binario) ---
  formData['ArchivoResolucion'] = http.file(
    archivo.contenido,
    archivo.nombre,
    'application/pdf'
  );

  // --- Medidas (array indexado) ---
  medidas.forEach((m, i) => {
    formData[`Medidas[${i}].DesMedidaCorrectiva`] = String(m.desMedidaCorrectiva || '');
    formData[`Medidas[${i}].Orden`]               = String(i + 1);
  });

  // --- Detalles de sanción (array indexado) ---
  detalles.forEach((d, i) => {
    formData[`Detalles[${i}].IdInfraccion`]         = String(d.idInfraccion || '');
    formData[`Detalles[${i}].IdRis`]                = String(d.idRis || '1');
    formData[`Detalles[${i}].DesSancion`]            = String(d.desSancion || '');
    formData[`Detalles[${i}].DesHechoInfractor`]     = String(d.desHechoInfractor || '');
    formData[`Detalles[${i}].NumCorrelativo`]        = String(i + 1);
    formData[`Detalles[${i}].BitMedida`]             = d.bitMedida !== false ? 'true' : 'false';
    formData[`Detalles[${i}].DesMedidaCorrectivaGen`]= String(d.desMedidaCorrectivaGen || '');
    formData[`Detalles[${i}].BitReconsidera`]        = d.bitReconsidera ? 'true' : 'false';
    formData[`Detalles[${i}].BitReincidente`]        = d.bitReincidente ? 'true' : 'false';
    formData[`Detalles[${i}].BitPago`]               = d.bitPago ? 'true' : 'false';
    formData[`Detalles[${i}].BitCancelacion`]        = d.bitCancelacion ? 'true' : 'false';
    formData[`Detalles[${i}].CanSuspension`]         = String(d.canSuspension ?? 0);
    formData[`Detalles[${i}].DesSuspension`]         = String(d.desSuspension || '');
    // TipoMulta: 'S' = Soles, 'U' = UIT (confirmado por captura de red v2.0)
    formData[`Detalles[${i}].TipoMulta`]             = d.tipoMulta ? String(d.tipoMulta) : '';
    formData[`Detalles[${i}].NumMonto`]              = String(d.numMonto ?? 0);
  });

  const params = {
    headers: {
      'Authorization': getAuthHeaders().Authorization,
      // NO establecer Content-Type: K6 genera el boundary automáticamente para multipart
    },
    tags: {
      name:      'CabeceraInfraccionSancion/CrearConDetalles',
      endpoint:  'cabecerainfraccionsancion_crearcondetalles',
      source_ip: sourceIp
    },
    timeout: config.timeoutMs
  };

  let response;
  const retries  = config.maxRetries || 3;
  let waitSecs   = 1.5;

  for (let attempt = 0; attempt <= retries; attempt++) {
    params.tags.retry = String(attempt);
    response = http.post(url, formData, params);
    recordResponseMetrics(response, sourceIp, params.tags);

    if (response.status !== 429) break;

    if (attempt < retries) {
      console.warn(`[WARN] 429 Rate Limit en CrearConDetalles. Intento ${attempt + 1}/${retries}. Esperando ${waitSecs}s...`);
      sleep(waitSecs);
      waitSecs *= 2.0;
    }
  }

  // Contabilizar registro si fue exitoso
  if (response.status === 200 || response.status === 201) {
    try {
      const oData = response.json('oData');
      const idResultado = oData?.RESULTADO || oData?.resultado;
      if (idResultado) {
        createdRecordsCounter.add(1, {
          operation:  'cabecera_con_detalles',
          endpoint:   'cabecerainfraccionsancion_crearcondetalles',
          source_ip:  sourceIp,
        });
      }
    } catch (_) {}
  }

  return response;
}

// ── LEGACY: conservados como stub para no romper imports existentes ──────────
// Estos endpoints ya NO existen en el backend v2.0.
// Si algún script los llama, recibirá un warning y retornará null.

export function crearCabecera(_payload) {
  console.warn('[WARN] crearCabecera() está OBSOLETO en v2.0. Usa crearConDetalles().');
  return null;
}

export function crearMedida(_payload) {
  console.warn('[WARN] crearMedida() está OBSOLETO en v2.0. Usa crearConDetalles().');
  return null;
}

export function crearDetalle(_payload) {
  console.warn('[WARN] crearDetalle() está OBSOLETO en v2.0. Usa crearConDetalles().');
  return null;
}
