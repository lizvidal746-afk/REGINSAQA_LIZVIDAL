// lib/requests/reconsideracion.js
// Helper functions for Caso 03 and Caso 04 (reconsideración)

import http from "../http.js";
import { getAuthHeaders } from "./auth.js";

/**
 * Listar cabeceras de infracción/sanción (paginado)
 */
export async function listarCabeceras(params) {
  const { page = 1, pageSize = 50, filters = {} } = params;
  const body = {
    page,
    pageSize,
    ...filters,
  };
  return http.post("/CabeceraInfraccionSancion/Listar", body, getAuthHeaders());
}

/**
 * Guardar cabecera de reconsideración
 */
export async function guardarCabecera(data) {
  return http.post("/Reconsideracion/GuardarCabecera", data, getAuthHeaders());
}

/**
 * Listar detalle de infracción/sanción (paginado)
 */
export async function listarDetalle(params) {
  const { page = 1, pageSize = 50, filters = {} } = params;
  const body = {
    page,
    pageSize,
    ...filters,
  };
  return http.post("/DetalleInfraccionSancion/Listar", body, getAuthHeaders());
}

/**
 * Actualizar detalle de infracción/sanción (PUT)
 */
export async function actualizarDetalle(id, data) {
  return http.put(`/DetalleInfraccionSancion/Actualizar/${id}`, data, getAuthHeaders());
}

/**
 * Actualizar cabecera de infracción/sanción con archivo PDF (multipart)
 */
export async function actualizarCabeceraConPDF(id, data, pdfFilePath) {
  // Using multipart/form-data via http helper (assumes support for file streams)
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    formData.append(key, value);
  }
  // Append the PDF file
  const file = await Deno.readFile(pdfFilePath);
  const blob = new Blob([file], { type: "application/pdf" });
  formData.append("file", blob, "document.pdf");

  const headers = {
    ...getAuthHeaders(),
    // Let http.js add appropriate multipart headers
  };
  return http.putMultipart(`/CabeceraInfraccionSancion/Actualizar/${id}`, formData, headers);
}
