export function limpiarTextoDetalle(valor: string): string {
  return String(valor || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function uiMuestraSinDetallesInfraccion(texto: string): boolean {
  return /sin\s+detalles\s+de\s+infracci[oó]n/i.test(limpiarTextoDetalle(texto));
}

export function uiMuestraIndicadoresSancion(texto: string): boolean {
  return /multa|suspensi[oó]n|cancelaci[oó]n|\buit\b|\bsoles\b/i.test(limpiarTextoDetalle(texto));
}

export function apiEsSinDetallesInfraccion(detalles: number | undefined): boolean {
  return typeof detalles === 'number' && detalles === 0;
}

export function apiTieneDetallesInfraccion(detalles: number | undefined): boolean {
  return typeof detalles === 'number' && detalles > 0;
}

export function esCampoVacioFuncional(valor: string): boolean {
  const v = limpiarTextoDetalle(valor).toLowerCase();
  if (!v) return true;
  return /^(-|--|—|n\/a|na|s\/d|sin\s+dato|sin\s+informaci[oó]n)$/i.test(v);
}

export function cumpleCamposVaciosReconsideracion(fModificacion: string, nReconsideracion: string, fReconsideracion: string): boolean {
  return esCampoVacioFuncional(fModificacion)
    && esCampoVacioFuncional(nReconsideracion)
    && esCampoVacioFuncional(fReconsideracion);
}

export function fechaEnRango(fecha: Date | null, fechaMinima: Date, fechaMaxima: Date): boolean {
  return Boolean(fecha && fecha >= fechaMinima && fecha <= fechaMaxima);
}

export function evaluarNoSanciones(params: {
  tieneIndicadorConSanciones: boolean;
  conSancionesApi: boolean;
  sinSancionesApi: boolean;
  detalleDisponibleApi: boolean;
  tieneEvidenciaNoSancion: boolean;
  permitirSinEvidenciaExplicita: boolean;
}): { ok: boolean; motivo: 'con-sancion' | 'sin-evidencia-api' | 'sin-evidencia-ui' | 'ok' } {
  const {
    tieneIndicadorConSanciones,
    conSancionesApi,
    sinSancionesApi,
    detalleDisponibleApi,
    tieneEvidenciaNoSancion,
    permitirSinEvidenciaExplicita,
  } = params;

  if (tieneIndicadorConSanciones || conSancionesApi) {
    return { ok: false, motivo: 'con-sancion' };
  }

  if (detalleDisponibleApi && !sinSancionesApi) {
    return { ok: false, motivo: 'sin-evidencia-api' };
  }

  if (!tieneEvidenciaNoSancion && !permitirSinEvidenciaExplicita) {
    return { ok: false, motivo: 'sin-evidencia-ui' };
  }

  return { ok: true, motivo: 'ok' };
}
