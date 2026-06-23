export function normalizarRuc(ruc: string): string {
  const soloDigitos = ruc.replace(/\D/g, '');
  return soloDigitos.padStart(11, '0').slice(0, 11);
}

export const ESTADOS_INSTITUCION = {
  LICENCIADA: 2,
  LEY_CREACION: 4,
  DENEGADA: 3
} as const;
