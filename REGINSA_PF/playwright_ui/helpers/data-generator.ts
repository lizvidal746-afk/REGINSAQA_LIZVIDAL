export type GeneratedTestData = {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  estado: string;
};

const ESTADOS = ['Licenciada', 'Informal', 'Licencia denegada'];

function buildValidRuc(seed: number): string {
  const baseNumber = Math.abs(seed % 100000000);
  const firstTen = `20${String(baseNumber).padStart(8, '0')}`;
  const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = firstTen
    .split('')
    .reduce((acc, digit, index) => acc + Number(digit) * factors[index], 0);
  const mod = sum % 11;
  const rawDigit = 11 - mod;
  const checkDigit = rawDigit === 10 ? 0 : rawDigit === 11 ? 1 : rawDigit;
  return `${firstTen}${checkDigit}`;
}

export function generateTestData(workerIndex = 0, repeatIndex = 0): GeneratedTestData {
  const runSeed = Number.parseInt(String(process.env.REGINSA_FUNC_RUN_SEED || process.env.TEST_RUN_SEED || ''), 10);
  const fallbackSeed = Number(new Date().toISOString().replace(/\D/g, '').slice(-8));
  const seed = (Number.isFinite(runSeed) ? runSeed : fallbackSeed) + workerIndex * 1000 + repeatIndex;
  const suffix = `${String(workerIndex + 1).padStart(2, '0')}${String(repeatIndex + 1).padStart(2, '0')}${String(seed % 10000).padStart(4, '0')}`;

  return {
    ruc: buildValidRuc(seed),
    razonSocial: `REGINSA AUTOMATIZACION FUNCIONAL ${suffix} S.A.C.`,
    nombreComercial: `REGINSA PF ${suffix}`,
    estado: ESTADOS[Math.abs(workerIndex + repeatIndex) % ESTADOS.length]
  };
}
