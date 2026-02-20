import { getEstadoByRepeatIndex, type EstadoCodigo } from './state-distributor';

export type TestData = {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  estado: EstadoCodigo;
};

const RUC_PREFIXES = ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19'];

export function generateTestData(workerIndex: number, repeatIndex: number): TestData {
  const timestamp = Date.now();
  const base = `${workerIndex}${repeatIndex}${timestamp}`.replace(/\D/g, '');
  const prefix = RUC_PREFIXES[Math.abs(workerIndex) % RUC_PREFIXES.length];
  const suffix = base.slice(-9).padStart(9, '0');
  const ruc = `${prefix}${suffix}`;

  return {
    ruc,
    razonSocial: `RS_${workerIndex}_${repeatIndex}_${timestamp}`,
    nombreComercial: `NC_${workerIndex}_${repeatIndex}_${timestamp}`,
    estado: getEstadoByRepeatIndex(repeatIndex),
  };
}
