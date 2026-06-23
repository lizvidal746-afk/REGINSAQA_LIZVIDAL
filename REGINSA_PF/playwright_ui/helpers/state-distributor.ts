const ESTADOS = ['Licenciada', 'Informal', 'Licencia denegada'];

export function getEstadoLabel(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') {
    return ESTADOS[0];
  }

  const raw = String(value).trim();
  const numeric = Number.parseInt(raw, 10);
  if (Number.isFinite(numeric)) {
    return ESTADOS[Math.abs(numeric) % ESTADOS.length];
  }

  const normalized = raw.toLowerCase();
  if (normalized.includes('deneg')) return 'Licencia denegada';
  if (normalized.includes('informal')) return 'Informal';
  if (normalized.includes('licenc')) return 'Licenciada';
  return raw;
}
