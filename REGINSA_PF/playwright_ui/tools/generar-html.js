const fs = require('fs');
const path = require('path');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '0.00';
}

function formatDate(value) {
  if (!value) return 'N/D';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escapeHtml(value);
  return d.toLocaleString('es-PE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getStateMeta(estado) {
  switch (estado) {
    case 'GO':
      return { label: 'GO', color: '#198754', bg: '#d1e7dd' };
    case 'GO_CON_RIESGO':
      return { label: 'GO CON RIESGO', color: '#997404', bg: '#fff3cd' };
    case 'NO_GO':
      return { label: 'NO GO', color: '#842029', bg: '#f8d7da' };
    case 'GO_ESTABLE':
      return { label: 'GO ESTABLE', color: '#0f5132', bg: '#d1e7dd' };
    default:
      return { label: estado || 'N/D', color: '#0c5460', bg: '#d1ecf1' };
  }
}

function getRiskMeta(riesgo) {
  switch (riesgo) {
    case 'BAJO':
      return { color: '#198754', bg: '#d1e7dd' };
    case 'MEDIO':
      return { color: '#997404', bg: '#fff3cd' };
    case 'ALTO':
      return { color: '#842029', bg: '#f8d7da' };
    default:
      return { color: '#0c5460', bg: '#d1ecf1' };
  }
}

function card(title, value, tone = 'default', subtitle = '') {
  const tones = {
    default: { border: '#d0d7de', bg: '#ffffff' },
    success: { border: '#198754', bg: '#f1fbf5' },
    warning: { border: '#f0ad4e', bg: '#fffaf0' },
    danger: { border: '#dc3545', bg: '#fff5f5' },
    info: { border: '#0d6efd', bg: '#f4f8ff' }
  };
  const t = tones[tone] || tones.default;
  return `
    <div class="card metric-card" style="border-top:4px solid ${t.border}; background:${t.bg};">
      <div class="metric-title">${escapeHtml(title)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
      ${subtitle ? `<div class="metric-subtitle">${escapeHtml(subtitle)}</div>` : ''}
    </div>
  `;
}

function fmtNumber(value, digits = 0) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(digits) : (0).toFixed(digits);
}

function fmtPct(value, digits = 1) {
  const n = Number(value ?? 0);
  return `${fmtNumber(n, digits)}%`;
}

function classifyErrors(report) {
  const errors = report?.errors || report?.dualView?.errors || report?.errorSummary || [];
  const hallazgosTecnicos = safeArray(report?.hallazgosTecnicos);
  const buckets = {
    uiTimeout: 0,
    backendTimeout: 0,
    endpointNoCapturado: 0,
    otros: 0
  };

  for (const finding of hallazgosTecnicos) {
    const category = String(finding?.categoria || '').toUpperCase();
    const description = String(finding?.descripcion || '');
    const match = description.match(/(\d+)/);
    const count = match ? Number(match[1]) : 1;

    if (category === 'UI') {
      buckets.uiTimeout += count;
    } else if (category === 'API' || category === 'TIMEOUT') {
      buckets.backendTimeout += count;
    } else if (category === 'PERSISTENCIA') {
      buckets.endpointNoCapturado += count;
    } else if (category) {
      buckets.otros += count;
    }
  }

  for (const err of errors) {
    const raw = `${err?.message || ''} ${err?.type || ''} ${err?.category || ''} ${err?.stack || ''}`.toLowerCase();

    if (
      raw.includes('tobevisible') ||
      raw.includes('locator') ||
      raw.includes('expected visible') ||
      raw.includes('elements not found') ||
      raw.includes('ui timeout')
    ) {
      buckets.uiTimeout += 1;
    } else if (
      raw.includes('api timeout') ||
      raw.includes('backend timeout') ||
      (raw.includes('timeout') && raw.includes('api'))
    ) {
      buckets.backendTimeout += 1;
    } else if (
      raw.includes('no endpoint') ||
      raw.includes('endpoint no capturado') ||
      raw.includes('no_endpoint') ||
      raw.includes('no endpoint captured')
    ) {
      buckets.endpointNoCapturado += 1;
    } else {
      buckets.otros += 1;
    }
  }

  return buckets;
}

function buildFunnelData(report) {
  const sg = report?.summaryGlobal || {};
  const integridad = report?.dualView?.integridad || {};

  const intentos = Number(sg.intentosTotales ?? 0);
  const tests = Number(sg.testsUnicos ?? 0);
  const testsFuncionales = Number(sg.testsFuncionales ?? integridad.testsFuncionales ?? tests);
  const registros = Number(integridad.registrosUnicos ?? 0);
  const evidencias = Number(sg.evidenciasFuncionales ?? integridad.evidenciasFuncionales ?? registros);
  const ratio = Number(
    sg.ratioPersistenciaFuncional ??
    integridad.ratioPersistenciaFuncional ??
    integridad.ratioPersistenciaUnica ??
    integridad.ratioPersistencia ??
    (testsFuncionales > 0 ? (evidencias / testsFuncionales) * 100 : 0)
  );

  return {
    intentos,
    tests,
    testsFuncionales,
    registros,
    evidencias,
    ratio
  };
}

function renderFunnelSvg({ intentos, tests, testsFuncionales, registros, evidencias, ratio }) {
  const max = Math.max(intentos, tests, evidencias, 1);
  const rows = [
    { label: 'Intentos totales', value: intentos, color: '#2563eb' },
    { label: 'Tests únicos', value: tests, color: '#4f46e5' },
    { label: 'Tests funcionales', value: testsFuncionales, color: '#0f766e' },
    { label: 'Evidencias confirmadas', value: evidencias, color: '#16a34a' }
  ];

  const width = 760;
  const height = 280;
  const barHeight = 42;
  const gap = 18;
  const centerX = width / 2;

  const bars = rows.map((row, index) => {
    const usable = 520;
    const barWidth = Math.max(140, (row.value / max) * usable);
    const x = centerX - barWidth / 2;
    const y = 18 + index * (barHeight + gap);
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="12" fill="${row.color}" opacity="0.92"></rect>
      <text x="${centerX}" y="${y + 18}" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff">${escapeHtml(row.label)}</text>
      <text x="${centerX}" y="${y + 34}" text-anchor="middle" font-size="13" font-weight="600" fill="#e5edff">${escapeHtml(String(row.value))}</text>
    `;
  }).join('');

  return `
    <div class="funnel-wrap">
      <svg viewBox="0 0 ${width} ${height}" class="funnel-svg" role="img" aria-label="Embudo de persistencia">
        ${bars}
      </svg>
      <div class="funnel-caption">
        <span class="mini-kpi"><strong>Ratio de persistencia:</strong> ${fmtPct(ratio, 1)}</span>
      </div>
    </div>
  `;
}

function renderPersistenceFunnel(report) {
  const data = buildFunnelData(report);

  return `
    <section class="section">
      <h2>Embudo de Persistencia</h2>
      <p class="section-lead">
        Vista analítica desde actividad ejecutada hasta persistencia confirmada. Ayuda a distinguir volumen bruto, resultado funcional consolidado y evidencia real en BD.
      </p>
      ${renderFunnelSvg(data)}
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Métrica</th>
              <th>Valor</th>
              <th>Lectura</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Intentos totales</td>
              <td>${fmtNumber(data.intentos, 0)}</td>
              <td>Ejecución bruta incluyendo retries</td>
            </tr>
            <tr>
              <td>Tests únicos</td>
              <td>${fmtNumber(data.tests, 0)}</td>
              <td>Resultado técnico consolidado, incluye setup/auth</td>
            </tr>
            <tr>
              <td>Tests funcionales</td>
              <td>${fmtNumber(data.testsFuncionales, 0)}</td>
              <td>Casos funcionales con endpoint/registro, excluye setup/auth</td>
            </tr>
            <tr>
              <td>Registros confirmados</td>
              <td>${fmtNumber(data.registros, 0)}</td>
              <td>Registros con ID cuando aplica</td>
            </tr>
            <tr>
              <td>Evidencias funcionales</td>
              <td>${fmtNumber(data.evidencias, 0)}</td>
              <td>Operaciones de negocio confirmadas por endpoint, ID o evidencia explícita</td>
            </tr>
            <tr>
              <td>Ratio de persistencia</td>
              <td>${fmtPct(data.ratio, 1)}</td>
              <td>Evidencias funcionales / tests funcionales</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderRetriesFlakyAnalysis(report) {
  const ipSummary = report?.dualView?.ipSummary || [];
  const flakyIps = ipSummary.filter(ip => Number(ip?.flakyRate ?? 0) > 0);

  const rows = flakyIps.length
    ? flakyIps.map(ip => {
        const intentos = Number(ip?.intentosEjecutados ?? 0);
        const tests = Number(ip?.testsUnicos ?? 0);
        const extra = Math.max(0, intentos - tests);
        const persisted = Number(ip?.registrosUnicos?.length ?? 0) >= tests;
        return `
          <tr>
            <td>${escapeHtml(ip?.ip)}</td>
            <td>${fmtNumber(tests, 0)}</td>
            <td>${fmtNumber(intentos, 0)}</td>
            <td>${fmtNumber(extra, 0)}</td>
            <td>${fmtPct(ip?.flakyRate ?? 0, 1)}</td>
            <td><span class="status-badge ${persisted ? 'ok' : 'warn'}">${persisted ? 'Persistió' : 'Persistencia parcial'}</span></td>
          </tr>
        `;
      }).join('')
    : `
      <tr>
        <td colspan="6" class="empty-cell">No se detectaron IPs con retries o flaky.</td>
      </tr>
    `;

  return `
    <section class="section">
      <h2>Retries y Flaky</h2>
      <p class="section-lead">
        Identifica las IPs que necesitaron intentos extra para alcanzar el estado final exitoso y si la persistencia quedó finalmente confirmada.
      </p>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>IP</th>
              <th>Tests únicos</th>
              <th>Intentos</th>
              <th>Intentos extra</th>
              <th>Flaky %</th>
              <th>Persistencia final</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderErrorClassification(report) {
  const buckets = classifyErrors(report);
  const total = Object.values(buckets).reduce((a, b) => a + b, 0);

  return `
    <section class="section">
      <h2>Clasificación de Errores</h2>
      <p class="section-lead">
        Clasificación heurística para separar fallos de sincronización UI, backend/API y problemas de captura de endpoint.
      </p>
      <div class="metrics-grid metrics-grid-4">
        <div class="card metric-card">
          <div class="metric-title">UI timeout</div>
          <div class="metric-value">${fmtNumber(buckets.uiTimeout, 0)}</div>
          <div class="metric-subtitle">Patrones tipo toBeVisible / locator</div>
        </div>
        <div class="card metric-card">
          <div class="metric-title">Backend/API timeout</div>
          <div class="metric-value">${fmtNumber(buckets.backendTimeout, 0)}</div>
          <div class="metric-subtitle">Demoras o timeouts de servicio</div>
        </div>
        <div class="card metric-card">
          <div class="metric-title">Endpoint no capturado</div>
          <div class="metric-value">${fmtNumber(buckets.endpointNoCapturado, 0)}</div>
          <div class="metric-subtitle">Llamada sin correlación técnica completa</div>
        </div>
        <div class="card metric-card">
          <div class="metric-title">Otros</div>
          <div class="metric-value">${fmtNumber(buckets.otros, 0)}</div>
          <div class="metric-subtitle">Clasificación residual</div>
        </div>
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Total errores clasificados</th>
              <th>UI timeout</th>
              <th>Backend/API timeout</th>
              <th>Endpoint no capturado</th>
              <th>Otros</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${fmtNumber(total, 0)}</td>
              <td>${fmtNumber(buckets.uiTimeout, 0)}</td>
              <td>${fmtNumber(buckets.backendTimeout, 0)}</td>
              <td>${fmtNumber(buckets.endpointNoCapturado, 0)}</td>
              <td>${fmtNumber(buckets.otros, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderStabilityMetrics(report) {
  const ipSummary = report?.dualView?.ipSummary || [];
  const endpointSummary = report?.dualView?.endpointSummary || [];
  const integridad = report?.dualView?.integridad || {};

  const ipsEstables = ipSummary.filter(ip => Number(ip?.flakyRate ?? 0) === 0).length;
  const ipsInestables = ipSummary.filter(ip => Number(ip?.flakyRate ?? 0) > 0).length;
  const endpointsConRetries = endpointSummary.filter(ep => Number(ep?.retriesNecesarios ?? 0) > 0).length;
  const ratioPersistencia = Number(
    integridad?.ratioPersistenciaFuncional ??
    integridad?.ratioPersistenciaUnica ??
    integridad?.ratioPersistencia ??
    0
  );

  return `
    <section class="section">
      <h2>Métricas de Estabilidad</h2>
      <div class="metrics-grid metrics-grid-4">
        <div class="card metric-card stable-card">
          <div class="metric-title">IPs estables</div>
          <div class="metric-value">${fmtNumber(ipsEstables, 0)}</div>
          <div class="metric-subtitle">Sin flaky ni retries visibles</div>
        </div>
        <div class="card metric-card unstable-card">
          <div class="metric-title">IPs inestables</div>
          <div class="metric-value">${fmtNumber(ipsInestables, 0)}</div>
          <div class="metric-subtitle">Con flakyRate mayor a 0</div>
        </div>
        <div class="card metric-card">
          <div class="metric-title">Endpoints con retries</div>
          <div class="metric-value">${fmtNumber(endpointsConRetries, 0)}</div>
          <div class="metric-subtitle">Superficie técnica sensible</div>
        </div>
        <div class="card metric-card">
          <div class="metric-title">Persistencia funcional</div>
          <div class="metric-value">${fmtPct(ratioPersistencia, 1)}</div>
          <div class="metric-subtitle">Registros únicos confirmados</div>
        </div>
      </div>
    </section>
  `;
}


function buildStandardsApplicationSection() {
  return `
    <section class="section">
      <h2>Marco Normativo y Aplicación en Playwright</h2>
      <p class="section-lead">Esta suite funcional aplica los estándares en diseño de casos, trazabilidad, criterios de aceptación, evidencias, clasificación de hallazgos y decisión ejecutiva.</p>
      <div class="table-responsive">
        <table>
          <thead><tr><th>Referencia</th><th>Uso en QA funcional</th><th>Aplicación concreta en REGINSA_PF</th></tr></thead>
          <tbody>
            <tr><td><strong>ISTQB Foundation Level</strong></td><td>Diseño y priorización de pruebas</td><td>Casos positivos, negativos, regresión, criterios de entrada/salida, severidad y evidencias por defecto.</td></tr>
            <tr><td><strong>ISO/IEC/IEEE 29119</strong></td><td>Proceso y documentación formal de pruebas</td><td>Plan, caso, procedimiento, ejecución, incidencia, trazabilidad, reporte y cierre de pruebas.</td></tr>
            <tr><td><strong>ISO/IEC 25010</strong></td><td>Modelo de calidad del producto</td><td>Clasificación de hallazgos por adecuación funcional, fiabilidad, usabilidad, eficiencia, mantenibilidad y portabilidad.</td></tr>
            <tr><td><strong>ISO 9001:2015</strong></td><td>Gestión de calidad y mejora continua</td><td>Control documental, responsable, evidencia, acciones correctivas, criterio de cierre y seguimiento.</td></tr>
            <tr><td><strong>IEEE 829</strong></td><td>Referencia histórica de documentación</td><td>Estructura clásica de plan, casos, log de ejecución e informe de pruebas.</td></tr>
          </tbody>
        </table>
      </div>
      <div class="table-responsive" style="margin-top:16px;">
        <table>
          <thead><tr><th>Criterio</th><th>Regla operativa en la plantilla</th></tr></thead>
          <tbody>
            <tr><td><strong>Trazabilidad</strong></td><td>Requisito → caso Playwright → dato → usuario/IP → endpoint → evidencia → resultado.</td></tr>
            <tr><td><strong>Criterio funcional</strong></td><td>Sin ID real o sin persistencia confirmada no existe aprobación funcional del guardado.</td></tr>
            <tr><td><strong>Estabilidad</strong></td><td>Passed limpio, flaky rate y retry burden separan éxito funcional de costo operativo.</td></tr>
            <tr><td><strong>Cierre de hallazgos</strong></td><td>Todo hallazgo crítico mantiene recomendación y condición objetiva de cierre.</td></tr>
            <tr><td><strong>Decisión ejecutiva</strong></td><td>GO, GO con riesgo o NO GO se decide por tasa final, fallos, persistencia, flakiness y severidad.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}
function buildMetricLegendSection() {
  const rows = [
    { metric: 'Tests únicos', definition: 'Resultado final consolidado por caso de prueba, sin duplicar retries. Representa el universo real de validación funcional.', formula: 'Casos finales consolidados (sin retries)', threshold: '—', standard: 'ISTQB CTFL 4.4 · IEEE 829' },
    { metric: 'Intentos totales', definition: 'Ejecuciones brutas incluyendo reintentos automáticos. Refleja el costo operacional real de la corrida.', formula: 'Intento inicial + Σ retries por test', threshold: '—', standard: 'ISO/IEC/IEEE 29119-3' },
    { metric: 'Passed limpio', definition: 'Test exitoso en su primer intento sin necesidad de ningún retry. Indicador de estabilidad técnica real del sistema.', formula: 'Tests passed con retryCount = 0', threshold: 'Ideal ≥ 95%', standard: 'ISTQB CTAL-TAE' },
    { metric: 'Flaky rate', definition: 'Porcentaje de tests que terminaron exitosamente pero requirieron al menos un retry. Evidencia deuda técnica oculta de estabilidad.', formula: '(Tests flaky / tests únicos) × 100', threshold: 'Tolerable ≤ 15%', standard: 'ISTQB CTAL-TAE · ISO 25010 §4.2.3' },
    { metric: 'Retry Burden', definition: 'Carga operacional de retries sobre la suite. Separa el resultado funcional final (PASS) del costo de alcanzarlo. Un sistema inestable con PASS total puede tener Retry Burden elevado.', formula: '(Retries totales / tests únicos) × 100', threshold: 'Aceptable ≤ 20%', standard: 'ISTQB CTAL-TAE · IEEE 829 §5' },
    { metric: 'Persistencia funcional', definition: 'Registros confirmados en base de datos respecto a los tests funcionales esperados. Excluye setup/auth y mide adecuación funcional real del sistema bajo prueba.', formula: '(Registros persistidos únicos / tests funcionales) × 100', threshold: 'Objetivo ≥ 95%', standard: 'ISO/IEC 25010 — Adecuación funcional' },
    { metric: 'Ranking estabilidad', definition: 'Índice de estabilidad por IP/worker calculado como complemento del flaky rate. 100% = ningún retry, 0% = todos los tests necesitaron retries.', formula: '100 − flakyRate(%)', threshold: 'Saludable ≥ 85%', standard: 'ISTQB CTFL 4.4 · ISO 25010 §4.2.7 Fiabilidad' },
    { metric: 'Deuda de observabilidad (NO_ENDPOINT)', definition: 'Tests donde el endpoint de guardado no fue interceptado por el framework. No significa fallo funcional, pero impide trazabilidad técnica completa del intento.', formula: 'Presencia de registros con endpoint = NO_ENDPOINT', threshold: 'Objetivo: 0 ocurrencias', standard: 'IEEE 829 §10 — Trazabilidad · ISO 29119-3 §7' },
    { metric: 'Persistencia indeterminada', definition: 'Intentos donde la petición llegó al endpoint backend (capturada) pero la respuesta no fue recibida por el test (timeout post-request). La operación puede haberse completado en BD, pero no hay confirmación en el reporte.', formula: 'Intentos con persistenciaEstado = INDETERMINADA', threshold: 'Objetivo: 0 ocurrencias', standard: 'ISO 25010 — Fiabilidad · IEEE 829 §8 Criterios de salida' }
  ];

  const standardsColor = { 'ISTQB': '#1d4ed8', 'ISO': '#0f5132', 'IEEE': '#7c3aed' };

  function colorStandard(std) {
    return std.split(' · ').map(s => {
      const key = Object.keys(standardsColor).find(k => s.startsWith(k));
      const color = key ? standardsColor[key] : '#374151';
      return `<span style="display:inline-block;background:${color}18;color:${color};border:1px solid ${color}44;border-radius:4px;padding:1px 5px;font-size:11px;font-weight:700;margin:1px;">${escapeHtml(s)}</span>`;
    }).join(' ');
  }

  return `
    <section class="section">
      <h2>12.0 Leyenda y Criterios de Métricas — Auditoría ISTQB/ISO/IEEE</h2>
      <p class="section-lead">
        Definiciones operativas, fórmulas de cálculo, umbrales de aceptación y referencias normativas para cada métrica del reporte.
        Esta leyenda es parte integral de la evidencia de auditoría bajo estándares ISTQB CTFL/CTAL-TAE, ISO/IEC 25010, IEEE 829 e ISO/IEC/IEEE 29119-3.
      </p>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th style="min-width:150px;">Criterio / Métrica</th>
              <th style="min-width:240px;">Definición Operativa</th>
              <th style="min-width:200px;">Fórmula / Método</th>
              <th style="min-width:130px;">Umbral</th>
              <th style="min-width:200px;">Estándar</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, i) => `
              <tr style="${i % 2 === 0 ? '' : 'background:#fafbfc;'}">
                <td><strong style="color:#1d4ed8;">${escapeHtml(row.metric)}</strong></td>
                <td style="font-size:13px;">${escapeHtml(row.definition)}</td>
                <td><code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px;">${escapeHtml(row.formula)}</code></td>
                <td><span style="font-weight:700;color:#0f5132;">${escapeHtml(row.threshold)}</span></td>
                <td>${colorStandard(row.standard)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderMethodologyNote(report) {
  const sg = report?.summaryGlobal || {};
  const integridad = report?.dualView?.integridad || {};

  const testsUnicos = Number(sg.testsUnicos ?? 0);
  const testsFuncionales = Number(sg.testsFuncionales ?? integridad.testsFuncionales ?? testsUnicos);
  const intentosTotales = Number(sg.intentosTotales ?? 0);
  const retriesTotales = Number(sg.retriesTotales ?? 0);
  const passedLimpios = Number(sg.passedLimpios ?? 0);
  const flakyFinal = Number(sg.flakyFinal ?? 0);
  const retryBurden = testsUnicos > 0 ? (retriesTotales / testsUnicos) * 100 : 0;
  const ratioPersistencia = Number(sg.ratioPersistenciaFuncional ?? integridad?.ratioPersistenciaFuncional ?? integridad?.ratioPersistenciaUnica ?? integridad?.ratioPersistencia ?? 0);

  // Colores semafóricos para Flaky Debt
  const flakyDebtColor = flakyFinal === 0 ? '#166534' : flakyFinal <= Math.ceil(testsUnicos * 0.15) ? '#92400e' : '#991b1b';
  const flakyDebtBg = flakyFinal === 0 ? '#dcfce7' : flakyFinal <= Math.ceil(testsUnicos * 0.15) ? '#fef3c7' : '#fee2e2';
  const flakyDebtBorder = flakyFinal === 0 ? '#86efac' : flakyFinal <= Math.ceil(testsUnicos * 0.15) ? '#fde68a' : '#fecaca';
  const flakyDebtLabel = flakyFinal === 0 ? '✅ Ninguno' : flakyFinal <= Math.ceil(testsUnicos * 0.15) ? '⚠️ Tolerable' : '🔴 Elevado';

  const retryBurdenColor = retryBurden === 0 ? '#166534' : retryBurden <= 20 ? '#92400e' : '#991b1b';
  const retryBurdenBg = retryBurden === 0 ? '#dcfce7' : retryBurden <= 20 ? '#fef3c7' : '#fee2e2';
  const retryBurdenLabel = retryBurden === 0 ? '✅ Sin carga' : retryBurden <= 20 ? '⚠️ Aceptable' : '🔴 Alta carga';

  return `
    <section class="section">
      <h2>Nota Metodológica — Éxito Final vs. Costo Operacional</h2>
      <div class="methodology-box">
        <p>
          <strong>Tests únicos</strong> representan el resultado final consolidado por caso de prueba;
          <strong>tests funcionales</strong> representan los casos con operación de negocio auditable;
          <strong>intentos totales</strong> incluyen la ejecución original más cada retry realizado.
          Un <strong>PASS final al 100%</strong> no equivale a un sistema estable si se alcanzó a través de retries.
        </p>
        <p>
          Un test <strong>passed limpio</strong> pasó en su primer intento (sin retries).
          Un test <strong>flaky</strong> terminó exitosamente pero necesitó uno o más retries.
          El <strong>Retry Burden</strong> expresa cuántos retries por test fue necesario hacer en promedio.
        </p>
        <p>
          Por eso puede existir <strong>100% de éxito final</strong> y al mismo tiempo observarse retries, IPs inestables
          o costo operacional adicional durante la corrida — indicando deuda técnica real aunque el resultado funcional sea positivo.
        </p>
        <p>
          En esta corrida: <strong>${fmtNumber(testsUnicos, 0)} tests técnicos</strong>,
          <strong>${fmtNumber(testsFuncionales, 0)} tests funcionales</strong> y
          <strong>${fmtPct(ratioPersistencia, 1)} de persistencia funcional</strong>.
        </p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:18px;">
        <div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:14px;padding:16px;text-align:center;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin-bottom:6px;">Passed Limpio</div>
          <div style="font-size:28px;font-weight:800;color:#166534;">${fmtNumber(passedLimpios, 0)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">primer intento, sin retries</div>
        </div>
        <div style="background:${flakyDebtBg};border:1px solid ${flakyDebtBorder};border-radius:14px;padding:16px;text-align:center;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin-bottom:6px;">Flaky Debt</div>
          <div style="font-size:28px;font-weight:800;color:${flakyDebtColor};">${fmtNumber(flakyFinal, 0)}</div>
          <div style="font-size:12px;color:${flakyDebtColor};margin-top:4px;font-weight:600;">${flakyDebtLabel}</div>
        </div>
        <div style="background:${retryBurdenBg};border:1px solid #e5e7eb;border-radius:14px;padding:16px;text-align:center;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin-bottom:6px;">Retry Burden</div>
          <div style="font-size:28px;font-weight:800;color:${retryBurdenColor};">${fmtPct(retryBurden, 1)}</div>
          <div style="font-size:12px;color:${retryBurdenColor};margin-top:4px;font-weight:600;">${retryBurdenLabel}</div>
        </div>
        <div style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:14px;padding:16px;text-align:center;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin-bottom:6px;">Persistencia</div>
          <div style="font-size:28px;font-weight:800;color:${ratioPersistencia >= 95 ? '#166534' : ratioPersistencia >= 80 ? '#92400e' : '#991b1b'};">${fmtPct(ratioPersistencia, 1)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">registros confirmados</div>
        </div>
      </div>
    </section>
  `;
}

function renderTechnicalAnalytics(report) {
  return `
    ${renderPersistenceFunnel(report)}
    ${renderRetriesFlakyAnalysis(report)}
    ${renderErrorClassification(report)}
    ${renderStabilityMetrics(report)}
    ${renderMethodologyNote(report)}
    ${buildStandardsApplicationSection()}
    ${buildMetricLegendSection()}
  `;
}

function renderIpRows(ipSummary) {
  const items = safeArray(ipSummary);
  return items.map(item => {
    const flaky = Number(item.flakyRate || 0);
    const tasaExito = Number(item.tasaExitoFinal ?? 0);
    const stability = Math.max(0, Math.min(100, 100 - flaky));
    const registros = Array.isArray(item.registrosUnicos) ? item.registrosUnicos.length : 0;

    // Color semafórico para Éxito %
    const exitoColor = tasaExito >= 95 ? '#166534' : tasaExito >= 80 ? '#92400e' : '#991b1b';
    const exitoBg   = tasaExito >= 95 ? '#dcfce7' : tasaExito >= 80 ? '#fef3c7' : '#fee2e2';

    // Color semafórico para Flaky %
    const flakyColor = flaky === 0 ? '#166534' : flaky <= 15 ? '#92400e' : '#991b1b';
    const flakyBg   = flaky === 0 ? '#dcfce7' : flaky <= 15 ? '#fef3c7' : '#fee2e2';

    // Barra de progreso para Ranking Estabilidad
    const barColor  = stability >= 95 ? '#22c55e' : stability >= 80 ? '#f59e0b' : '#ef4444';
    const rowStyle  = flaky > 0 ? ' style="background:#fffbeb;"' : '';

    return `
      <tr${rowStyle}>
        <td><strong>${escapeHtml(item.ip || 'N/D')}</strong></td>
        <td style="text-align:center;">${escapeHtml(item.testsUnicos ?? 0)}</td>
        <td style="text-align:center;">${escapeHtml(item.intentosEjecutados ?? 0)}</td>
        <td style="background:${exitoBg};color:${exitoColor};font-weight:700;text-align:center;">${escapeHtml(num(item.tasaExitoFinal ?? 0, 1))}%</td>
        <td style="background:${flakyBg};color:${flakyColor};font-weight:700;text-align:center;">${escapeHtml(num(item.flakyRate ?? 0, 1))}%</td>
        <td style="text-align:center;">${escapeHtml(registros)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;background:#e5e7eb;border-radius:999px;height:10px;min-width:70px;overflow:hidden;">
              <div style="width:${Math.round(stability)}%;background:${barColor};height:100%;border-radius:999px;"></div>
            </div>
            <span style="font-size:12px;font-weight:800;color:${barColor};min-width:38px;">${Math.round(stability)}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderEndpointRows(endpointSummary) {
  const items = safeArray(endpointSummary);

  if (!items.length) {
    return `<div class="empty-state">No hay datos de endpoint disponibles en esta corrida.</div>`;
  }

  const rows = items.map(item => {
    const isNoEndpoint = String(item.endpoint || '').toUpperCase() === 'NO_ENDPOINT';
    const rowStyle = isNoEndpoint
      ? ' style="background:#fff0f0;border-left:4px solid #dc3545;"'
      : '';

    const endpointCell = isNoEndpoint
      ? `<td>
           <span style="font-weight:700;color:#991b1b;">⚠️ NO_ENDPOINT</span>
           <span style="display:inline-block;background:#dc3545;color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;margin-left:6px;">Deuda de Observabilidad</span>
           <br><span style="font-size:12px;color:#7f1d1d;">El endpoint real no fue interceptado por el test — sin trazabilidad técnica completa</span>
         </td>`
      : `<td><code style="background:#f1f5f9;padding:2px 5px;border-radius:4px;font-size:12px;">${escapeHtml(item.endpoint || 'N/D')}</code></td>`;

    const persistenciaVal = Number(item.tasaPersistencia ?? 0);
    const persistenciaColor = persistenciaVal >= 95 ? '#166534' : persistenciaVal >= 80 ? '#92400e' : '#991b1b';
    const persistenciaBg    = persistenciaVal >= 95 ? '#dcfce7' : persistenciaVal >= 80 ? '#fef3c7' : '#fee2e2';

    return `
      <tr${rowStyle}>
        ${endpointCell}
        <td style="text-align:center;">${escapeHtml(item.llamadasTotales ?? 0)}</td>
        <td style="text-align:center;">${escapeHtml(item.exitososFinales ?? 0)}</td>
        <td style="text-align:center;${Number(item.retriesNecesarios ?? 0) > 0 ? 'color:#92400e;font-weight:700;' : ''}">${escapeHtml(item.retriesNecesarios ?? 0)}</td>
        <td style="background:${isNoEndpoint ? 'transparent' : persistenciaBg};color:${isNoEndpoint ? '#991b1b' : persistenciaColor};font-weight:700;text-align:center;">
          ${isNoEndpoint ? '—' : `${escapeHtml(num(item.tasaPersistencia ?? 0, 1))}%`}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Llamadas</th>
            <th>Éxitos</th>
            <th>Retries</th>
            <th>Persistencia %</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function buildChartData(report) {
  const dualView = report?.dualView || {};
  const attempts = safeArray(dualView.attemptList);
  const ipSummary = safeArray(dualView.ipSummary);
  const endpointSummary = safeArray(dualView.endpointSummary);
  const errors = classifyErrors(report);

  const ipLabels = ipSummary.map(ip => String(ip?.ip || 'N/D'));
  const resultsByIp = {
    labels: ipLabels,
    passed: ipSummary.map(ip => Number(ip?.operacionesFuncionales ?? ip?.registrosCreados ?? ip?.exitososFinales ?? 0)),
    failed: ipSummary.map(ip => Number(ip?.fallidosFinales ?? 0)),
    flaky: ipSummary.map(ip => Number(ip?.flakyRate ?? 0) > 0 ? Number(ip?.testsUnicos ?? 0) : 0)
  };

  const durationByIp = {
    labels: ipLabels,
    avgMs: ipSummary.map(ip => Math.round(Number(ip?.latenciaAvgMs ?? 0)))
  };

  if (!durationByIp.avgMs.some(Boolean) && attempts.length) {
    const grouped = new Map();
    for (const attempt of attempts) {
      const ip = String(attempt?.assignedIp || 'N/D');
      const duration = Number(attempt?.durationMs ?? 0);
      if (!grouped.has(ip)) grouped.set(ip, { total: 0, count: 0 });
      if (duration > 0) {
        grouped.get(ip).total += duration;
        grouped.get(ip).count += 1;
      }
    }
    durationByIp.labels = [...grouped.keys()];
    durationByIp.avgMs = [...grouped.values()].map(v => v.count ? Math.round(v.total / v.count) : 0);
  }

  const errorClassification = {
    labels: ['UI', 'Backend/API', 'Persistencia', 'Otros'],
    values: [errors.uiTimeout, errors.backendTimeout, errors.endpointNoCapturado, errors.otros]
  };

  const endpointCalls = {
    labels: endpointSummary.map(ep => String(ep?.endpoint || 'N/D')),
    values: endpointSummary.map(ep => Number(ep?.llamadasTotales ?? 0))
  };

  return {
    hasIpResults: ipLabels.length > 0,
    hasDuration: durationByIp.labels.length > 0 && durationByIp.avgMs.some(v => v > 0),
    hasErrors: errorClassification.values.some(v => v > 0),
    hasEndpoints: endpointCalls.labels.length > 0 && endpointCalls.values.some(v => v > 0),
    resultsByIp,
    durationByIp,
    errorClassification,
    endpointCalls
  };
}

function renderChartCard(id, title, description, available) {
  if (!available) {
    return `
      <div class="chart-card">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
        <div class="empty-state">Dato no disponible para esta gráfica en el pf-report.json actual.</div>
      </div>
    `;
  }

  return `
    <div class="chart-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      <div class="chart-box"><canvas id="${escapeHtml(id)}"></canvas></div>
    </div>
  `;
}

function renderChartsSection(report) {
  const chartData = buildChartData(report);

  return `
    <section class="section">
      <h2>Visualizaciones Técnicas</h2>
      <p class="section-lead">
        Gráficas generadas desde pf-report.json para facilitar lectura ejecutiva por IP, duración, errores y endpoints. No reemplazan las tablas de evidencia.
      </p>
      <div class="charts-grid">
        ${renderChartCard('chartResultsByIp', 'Resultados por IP', 'Distribución funcional de registros creados, failed y flaky por IP/worker asignado.', chartData.hasIpResults)}
        ${renderChartCard('chartDurationByIp', 'Duración promedio por IP', 'Latencia promedio por intento en milisegundos usando datos agregados o attemptList.', chartData.hasDuration)}
        ${renderChartCard('chartErrors', 'Errores clasificados', 'Distribución de UI, Backend/API, Persistencia y Otros.', chartData.hasErrors)}
        ${renderChartCard('chartEndpoints', 'Llamadas por endpoint', 'Volumen de llamadas detectadas por endpoint durante la corrida.', chartData.hasEndpoints)}
      </div>
    </section>
    <script id="reginsa-chart-data" type="application/json">${safeJsonForScript(chartData)}</script>
  `;
}

function renderChartsScript() {
  return `
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js"></script>
  <script>
    (function () {
      const source = document.getElementById('reginsa-chart-data');
      if (!source || !window.Chart) return;
      const data = JSON.parse(source.textContent || '{}');
      
      const stackedTotalsPlugin = {
        id: 'stackedTotalsPlugin',
        afterDatasetsDraw(chart) {
          if (chart.canvas.id !== 'chartResultsByIp') return;
          const { ctx, scales: { x, y } } = chart;
          const labels = chart.data.labels || [];
          const datasets = chart.data.datasets || [];

          ctx.save();
          ctx.font = 'bold 13px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';

          labels.forEach((_, index) => {
            const total = datasets.reduce((sum, ds) => sum + (Number(ds.data[index]) || 0), 0);
            if (total <= 0) return;
            const xPos = x.getPixelForValue(index);
            const yPos = y.getPixelForValue(total) - 4;
            const label = String(total);
            const textWidth = ctx.measureText(label).width;
            // Fondo blanco para contraste
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillRect(xPos - textWidth / 2 - 3, yPos - 14, textWidth + 6, 16);
            // Texto oscuro encima
            ctx.fillStyle = '#111827';
            ctx.fillText(label, xPos, yPos);
          });
          ctx.restore();
        }
      };

      if (window.ChartDataLabels) {
        Chart.register(window.ChartDataLabels);
      }
      Chart.register(stackedTotalsPlugin);

      const common = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 } } }
      };
      
      const render = (id, config) => {
        const el = document.getElementById(id);
        if (el) new Chart(el, config);
      };
      
      if (data.hasIpResults) {
        render('chartResultsByIp', {
          type: 'bar',
          data: {
            labels: data.resultsByIp.labels,
            datasets: [
              { label: 'Passed', data: data.resultsByIp.passed, backgroundColor: '#22c55e' },
              { label: 'Failed', data: data.resultsByIp.failed, backgroundColor: '#ef4444' },
              { label: 'Flaky', data: data.resultsByIp.flaky, backgroundColor: '#f59e0b' }
            ]
          },
          options: {
            ...common,
            scales: {
              x: { stacked: true, ticks: { autoSkip: false, maxRotation: 45 } },
              y: {
                stacked: true,
                beginAtZero: true,
                grace: '15%',
                ticks: {
                  stepSize: 1,
                  precision: 0,
                  callback: (value) => Number.isInteger(value) ? value : null
                }
              }
            },
            plugins: {
              ...common.plugins,
              datalabels: { display: false }
            }
          }
        });
      }
      
      if (data.hasDuration) {
        render('chartDurationByIp', {
          type: 'bar',
          data: {
            labels: data.durationByIp.labels,
            datasets: [{ label: 'Duración promedio ms', data: data.durationByIp.avgMs, backgroundColor: '#3b82f6' }]
          },
          options: {
            ...common,
            scales: {
              x: { ticks: { autoSkip: false, maxRotation: 45 } },
              y: {
                beginAtZero: true,
                grace: '15%'
              }
            },
            plugins: {
              ...common.plugins,
              datalabels: {
                color: '#1f2937',
                anchor: 'end',
                align: 'top',
                offset: 4,
                font: { weight: '700', size: 11 },
                formatter: (value) => value > 0 ? value : ''
              }
            }
          }
        });
      }
      
      if (data.hasErrors) {
        render('chartErrors', {
          type: 'doughnut',
          data: {
            labels: data.errorClassification.labels,
            datasets: [{ data: data.errorClassification.values, backgroundColor: ['#f59e0b', '#ef4444', '#8b5cf6', '#64748b'] }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom' },
              datalabels: {
                display: (ctx) => {
                  const value = ctx.dataset.data[ctx.dataIndex];
                  if (!value) return false;
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  return total > 0 ? (value / total >= 0.05) : false;
                },
                color: '#ffffff',
                font: { weight: '700', size: 11 },
                formatter: (value, ctx) => {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  if (!value || !total) return '';
                  return (((value / total) * 100).toFixed(1)) + '%';
                }
              }
            }
          }
        });
      }
      
      if (data.hasEndpoints) {
        render('chartEndpoints', {
          type: 'bar',
          data: {
            labels: data.endpointCalls.labels,
            datasets: [{ label: 'Llamadas', data: data.endpointCalls.values, backgroundColor: '#06b6d4' }]
          },
          options: {
            ...common,
            indexAxis: 'y',
            scales: {
              x: { beginAtZero: true, grace: '15%' },
              y: { ticks: { autoSkip: false } }
            },
            plugins: {
              ...common.plugins,
              datalabels: {
                color: '#1f2937',
                anchor: 'end',
                align: 'right',
                offset: 6,
                font: { weight: '700', size: 11 },
                formatter: (value) => value > 0 ? value : ''
              }
            }
          }
        });
      }
    })();
  </script>
  `;
}

function statusBadge(value) {
  const normalized = String(value || 'vigente').toLowerCase();
  const cls = normalized.includes('seguimiento') ? 'tracking' : 'active';
  return `<span class="status-pill ${cls}">${escapeHtml(value)}</span>`;
}

function renderCurrentFindings(report) {
  const findings = safeArray(report?.hallazgosVigentes);

  if (!findings.length) {
    return '';
  }

  const rows = findings.map(item => `
    <tr>
      <td>${escapeHtml(item.id || 'N/D')}</td>
      <td>${statusBadge(item.estado || 'vigente')}</td>
      <td>${priorityBadge(item.severidad || 'Media')}</td>
      <td>${escapeHtml(item.titulo || 'N/D')}</td>
      <td>${escapeHtml(item.detalle || 'N/D')}</td>
      <td>${escapeHtml(item.criterio || 'N/D')}</td>
    </tr>
  `).join('');

  return `
    <section class="section current-findings">
      <h2>Hallazgos Vigentes / Estado Actual Conocido</h2>
      <p class="section-lead">
        Cambios de contrato, endpoint o comportamiento observados en integración que deben permanecer visibles hasta que un nuevo pase a calidad los confirme, refine o cierre con evidencia.
      </p>
      <div class="notice-box">
        No se marca como resuelto ningún punto inferido por comportamiento indirecto. Los elementos en seguimiento requieren reconfirmación explícita.
      </div>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Estado</th>
              <th>Severidad</th>
              <th>Hallazgo</th>
              <th>Detalle</th>
              <th>Criterio de permanencia/cierre</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderList(items, ordered = false) {
  const data = safeArray(items);
  if (!data.length) return `<div class="empty-state">Sin información disponible.</div>`;
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag} class="insight-list">${data.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</${tag}>`;
}

function priorityBadge(priority) {
  const normalized = String(priority || 'Media').toLowerCase();
  const cls = normalized.includes('alta') ? 'high' : normalized.includes('media') ? 'medium' : 'low';
  return `<span class="priority-badge ${cls}">${escapeHtml(priority)}</span>`;
}

function buildDevelopmentActions(report) {
  const summary = report?.summaryGlobal || {};
  const dualView = report?.dualView || {};
  const integridad = dualView.integridad || {};
  const ipSummary = safeArray(dualView.ipSummary);
  const endpointSummary = safeArray(dualView.endpointSummary);
  const hallazgosTecnicos = safeArray(report?.hallazgosTecnicos);

  const tests = Number(summary.testsUnicos ?? integridad.testsUnicos ?? 0);
  const testsFuncionales = Number(summary.testsFuncionales ?? integridad.testsFuncionales ?? tests);
  const flaky = Number(summary.flakyFinal ?? 0);
  const flakyRate = Number(summary.tasaFlaky ?? 0);
  const retries = Number(summary.retriesTotales ?? integridad.retriesTotal ?? 0);
  const registros = Number(summary.evidenciasFuncionales ?? summary.registrosCreados ?? integridad.evidenciasFuncionales ?? integridad.registrosUnicos ?? 0);
  const failed = Number(summary.failedFinal ?? 0);
  const persistencia = Number(summary.ratioPersistenciaFuncional ?? integridad.ratioPersistenciaFuncional ?? integridad.ratioPersistenciaUnica ?? 0);
  const flakyIps = ipSummary.filter(ip => Number(ip?.flakyRate ?? 0) > 0);
  const mainEndpoint = endpointSummary
    .filter(ep => ep?.endpoint && ep.endpoint !== 'NO_ENDPOINT')
    .sort((a, b) => Number(b?.llamadasTotales ?? 0) - Number(a?.llamadasTotales ?? 0))[0];
  const hasUiEvidence = hallazgosTecnicos.some(h => String(h?.categoria || '').toUpperCase() === 'UI');
  const hasPersistenceEvidence = hallazgosTecnicos.some(h => String(h?.categoria || '').toUpperCase() === 'PERSISTENCIA') || registros < testsFuncionales;

  const actions = [];

  if (flaky > 0 || retries > 0) {
    actions.push({
      hallazgo: 'Flaky recuperable bajo concurrencia',
      evidencia: `${flaky} tests flaky (${num(flakyRate, 2)}%) y ${retries} retries sobre ${tests} tests únicos.`,
      impacto: 'El resultado funcional final puede ser PASS, pero la estabilidad técnica no es limpia y puede degradarse en corridas equivalentes.',
      causa: 'Hipótesis técnica: sincronización UI/API, estado del DOM no interactivo, latencia del entorno o datos concurrentes.',
      accion: 'Revisar esperas explícitas, loaders, estado habilitado de controles, apertura del formulario y correlación de intentos por worker/IP.',
      prioridad: flakyRate >= 10 ? 'Alta' : 'Media',
      responsable: 'Frontend / QA Automation / DevOps'
    });
  }

  if (hasPersistenceEvidence) {
    actions.push({
      hallazgo: 'Trazabilidad de persistencia incompleta',
      evidencia: `${registros}/${testsFuncionales} operaciones funcionales confirmadas; persistencia funcional ${num(persistencia, 2)}%.`,
      impacto: 'Existe riesgo de que una ejecución exitosa no deje evidencia completa para auditoría funcional o debugging posterior.',
      causa: 'Causa probable: respuesta backend sin identificador final capturado, anotaciones incompletas o verificación post-guardado insuficiente.',
      accion: 'Validar contrato de respuesta, captura de registroId cuando aplique, consulta post-condición y trazabilidad entre test, request y operación persistida.',
      prioridad: registros < testsFuncionales ? 'Alta' : 'Media',
      responsable: 'Backend / QA Automation / DBA'
    });
  }

  if (mainEndpoint) {
    actions.push({
      hallazgo: 'Endpoint principal concentra la operación crítica',
      evidencia: `${mainEndpoint.endpoint}: ${mainEndpoint.llamadasTotales ?? 0} llamadas, ${mainEndpoint.retriesNecesarios ?? 0} retries, persistencia ${num(mainEndpoint.tasaPersistencia ?? 0, 1)}%.`,
      impacto: 'El endpoint es punto sensible del flujo Registrar Sanción y debe tener trazabilidad suficiente por intento.',
      causa: 'Requiere validación: posible cuello de botella o falta de observabilidad granular por request/registroId.',
      accion: 'Agregar o revisar logs correlacionados por requestId, usuario, IP/worker, registroId, tiempos de respuesta y errores funcionales.',
      prioridad: Number(mainEndpoint.retriesNecesarios ?? 0) > 0 ? 'Media' : 'Baja',
      responsable: 'Backend / Arquitectura / DevOps'
    });
  }

  if (hasUiEvidence) {
    actions.push({
      hallazgo: 'Evidencia de fallos UI o asincronía',
      evidencia: 'Se clasificaron errores UI en los intentos de la corrida, compatibles con visibilidad, locator o timeout.',
      impacto: 'Puede generar retries, tiempos variables y falsos negativos si el formulario no está listo antes de interactuar.',
      causa: 'Hipótesis técnica: render condicional, modal/formulario no listo, campo no visible o evento de apertura incompleto.',
      accion: 'Revisar disponibilidad del formulario Registrar Sanción, especialmente campos críticos como numeroExpediente, loaders y estado interactivo.',
      prioridad: 'Alta',
      responsable: 'Frontend'
    });
  }

  if (flakyIps.length > 0) {
    actions.push({
      hallazgo: 'Comportamiento desigual por IP/worker',
      evidencia: `${flakyIps.length} IPs/workers presentan flakyRate mayor a 0: ${flakyIps.map(ip => ip.ip).join(', ')}.`,
      impacto: 'La inestabilidad puede depender de sesión, nodo, red, datos asignados o distribución de carga.',
      causa: 'Requiere validación: infraestructura, datos de prueba, sesión autenticada o variabilidad por worker.',
      accion: 'Comparar traces y tiempos por IP/worker; repetir corrida controlada aislando IP, usuario y lote de datos.',
      prioridad: flakyIps.length >= 3 ? 'Media' : 'Baja',
      responsable: 'DevOps / QA Automation'
    });
  }

  if (failed > 0) {
    actions.push({
      hallazgo: 'Fallos funcionales definitivos',
      evidencia: `${failed} tests finalizaron en estado fallido.`,
      impacto: 'Bloquea aprobación limpia del flujo funcional hasta corregir y revalidar.',
      causa: 'Causa probable según traza del test fallido; requiere análisis específico de screenshot, trace y error.',
      accion: 'Priorizar corrección del fallo definitivo antes de evaluar mejoras de estabilidad o escalamiento.',
      prioridad: 'Alta',
      responsable: 'Frontend / Backend / QA Automation'
    });
  }

  if (!actions.length) {
    actions.push({
      hallazgo: 'Sin acciones correctivas críticas detectadas',
      evidencia: `${tests} tests únicos, ${failed} fallos, ${flaky} flaky y persistencia ${num(persistencia, 2)}%.`,
      impacto: 'La corrida no evidencia bloqueantes técnicos relevantes.',
      causa: 'No aplica.',
      accion: 'Mantener monitoreo en corridas equivalentes y conservar criterios de salida para prevenir regresiones.',
      prioridad: 'Baja',
      responsable: 'QA Automation'
    });
  }

  return actions;
}

function renderDevelopmentActions(report) {
  const actions = buildDevelopmentActions(report);
  const rows = actions.map(action => `
    <tr>
      <td>${escapeHtml(action.hallazgo)}</td>
      <td>${escapeHtml(action.evidencia)}</td>
      <td>${escapeHtml(action.impacto)}</td>
      <td>${escapeHtml(action.causa)}</td>
      <td>${escapeHtml(action.accion)}</td>
      <td>${priorityBadge(action.prioridad)}</td>
      <td>${escapeHtml(action.responsable)}</td>
    </tr>
  `).join('');

  return `
    <section class="section">
      <h2>13.0 ACCIONES PARA DESARROLLO</h2>
      <p class="section-lead">
        Traducción de la evidencia QA en acciones técnicas asignables. Un PASS final no elimina deuda de estabilidad si existen retries, flakiness o brechas de trazabilidad.
      </p>
      <div class="table-responsive">
        <table class="action-table">
          <thead>
            <tr>
              <th>Hallazgo</th>
              <th>Evidencia</th>
              <th>Impacto técnico</th>
              <th>Causa probable</th>
              <th>Acción recomendada</th>
              <th>Prioridad</th>
              <th>Responsable sugerido</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${renderTechnicalClosureCriteria(report)}
    </section>
  `;
}

function renderTechnicalClosureCriteria(report) {
  const summary = report?.summaryGlobal || {};
  const tests = Number(summary.testsUnicos ?? 0);
  const testsFuncionales = Number(summary.testsFuncionales ?? report?.dualView?.integridad?.testsFuncionales ?? tests);
  const registros = Number(summary.evidenciasFuncionales ?? summary.registrosCreados ?? 0);
  const targetRegistros = testsFuncionales > 0 ? testsFuncionales : registros;

  return `
    <div class="closure-box">
      <h3>13.1 CRITERIOS DE CIERRE TÉCNICO</h3>
      <ul class="insight-list">
        <li>Ejecutar la misma suite con 0 fallos definitivos.</li>
        <li>Reducir flaky rate por debajo de 5% y justificar cualquier retry residual.</li>
        <li>Confirmar persistencia funcional 100%: ${fmtNumber(registros, 0)}/${fmtNumber(targetRegistros, 0)} operaciones funcionales esperadas con trazabilidad verificable.</li>
        <li>Conservar evidencia por test: worker/IP, request o endpoint, registroId, estado final y trace ante fallo.</li>
        <li>Repetir corrida equivalente después del fix y comparar tests únicos, intentos, retries, persistencia y errores clasificados.</li>
      </ul>
    </div>
  `;
}

function generateHTML(report) {
  const metadata = report.metadata || {};
  const summary = report.summaryGlobal || {};
  const interpretacion = report.interpretacionAutomatica || {};
  const dualView = report.dualView || {};
  const ipSummary = safeArray(dualView.ipSummary);
  const endpointSummary = safeArray(dualView.endpointSummary);
  const sourceJson = metadata.sourceJson || metadata.canonicalJson || 'N/D';
  const sourceDir = metadata.sourceDir || 'N/D';

  const stateMeta = getStateMeta(interpretacion.estado);
  const riskMeta = getRiskMeta(interpretacion.riesgo);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reporte Funcional Playwright - ${escapeHtml(metadata.proyecto || 'REGINSA')}</title>
  <style>
    :root {
      --bg: #f5f7fb;
      --surface: #ffffff;
      --text: #1f2937;
      --muted: #6b7280;
      --border: #dfe4ea;
      --shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
      --radius: 16px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px;
    }
    .header, .section, .footer {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      margin-bottom: 20px;
    }
    .header {
      padding: 28px;
      display: flex;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    }
    .title-block h1 {
      margin: 0 0 8px 0;
      font-size: 30px;
    }
    .title-block p {
      margin: 4px 0;
      color: var(--muted);
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(180px, 1fr));
      gap: 12px;
      min-width: 320px;
    }
    .meta-box {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px;
    }
    .meta-label {
      font-size: 12px;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 4px;
      letter-spacing: .04em;
    }
    .meta-value {
      font-size: 15px;
      font-weight: 700;
    }
    .meta-value.path {
      font-size: 12px;
      word-break: break-all;
      line-height: 1.35;
    }
    .section {
      padding: 24px;
    }
    .section h2 {
      margin: 0 0 16px 0;
      font-size: 24px;
    }
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .chart-card {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      box-shadow: var(--shadow);
    }
    .chart-card h3 {
      margin: 0 0 6px 0;
      font-size: 17px;
    }
    .chart-card p {
      margin: 0 0 12px 0;
      color: var(--muted);
      font-size: 13px;
    }
    .chart-box {
      height: 320px;
      position: relative;
    }
    .notice-box {
      border: 1px solid #fcd34d;
      background: #fffbeb;
      color: #92400e;
      border-radius: 12px;
      padding: 12px 14px;
      margin: 12px 0 16px 0;
      font-weight: 600;
    }
    .status-pill {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      border: 1px solid transparent;
    }
    .status-pill.active {
      color: #92400e;
      background: #fef3c7;
      border-color: #fcd34d;
    }
    .status-pill.tracking {
      color: #1d4ed8;
      background: #dbeafe;
      border-color: #bfdbfe;
    }
    .executive {
      display: grid;
      grid-template-columns: 220px 1fr;
      gap: 20px;
      align-items: stretch;
    }
    .signal-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      padding: 20px;
      background: ${stateMeta.bg};
      border: 1px solid ${stateMeta.color}33;
    }
    .signal-light {
      width: 86px;
      height: 86px;
      border-radius: 50%;
      background: ${stateMeta.color};
      box-shadow: 0 0 0 10px ${stateMeta.color}22;
      margin-bottom: 14px;
    }
    .signal-label {
      font-size: 28px;
      font-weight: 800;
      color: ${stateMeta.color};
      text-align: center;
    }
    .executive-text {
      display: flex;
      flex-direction: column;
      gap: 14px;
      justify-content: center;
    }
    .badge {
      display: inline-block;
      width: fit-content;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .03em;
    }
    .risk-badge {
      color: ${riskMeta.color};
      background: ${riskMeta.bg};
      border: 1px solid ${riskMeta.color}33;
    }
    .summary-text {
      margin: 0;
      font-size: 16px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(180px, 1fr));
      gap: 16px;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
      padding: 16px;
    }
    .metric-title {
      font-size: 13px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: .04em;
      margin-bottom: 8px;
    }
    .metric-value {
      font-size: 30px;
      font-weight: 800;
      line-height: 1.1;
    }
    .metric-subtitle {
      margin-top: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 12px;
      border: 1px solid var(--border);
    }
    th, td {
      padding: 12px 14px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    th {
      background: #eef2f7;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    tbody tr:nth-child(even) {
      background: #fafbfc;
    }
    .insight-list {
      margin: 0;
      padding-left: 22px;
    }
    .insight-list li {
      margin: 10px 0;
    }
    .footer {
      padding: 18px 24px;
      color: var(--muted);
      font-size: 13px;
    }
    .empty-state {
      padding: 16px;
      border: 1px dashed var(--border);
      border-radius: 12px;
      color: var(--muted);
      background: #fbfcfe;
    }

    .table-responsive {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin: 0 -4px;
      padding: 0 4px 2px;
    }
    .table-responsive table {
      min-width: 700px;
    }
    .chart-insight {
      margin: 12px 0 0 0;
      padding: 10px 12px;
      border-radius: 12px;
      background: #f8fafc;
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 13px;
      line-height: 1.5;
    }
    .metric-legend summary {
      cursor: pointer;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .metric-legend[open] summary {
      margin-bottom: 16px;
    }
    td.cell-truncate {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: help;
    }
    td.cell-truncate:hover {
      white-space: normal;
      word-break: break-word;
    }

    @media (max-width: 900px) {
      .executive { grid-template-columns: 1fr; }
      .metrics-grid { grid-template-columns: repeat(2, minmax(160px, 1fr)); }
      .meta-grid { grid-template-columns: 1fr; min-width: 0; }
    }
    @media (max-width: 560px) {
      .container { padding: 14px; }
      .header, .section, .footer { padding-left: 16px; padding-right: 16px; }
      .metrics-grid { grid-template-columns: 1fr; }
      .title-block h1 { font-size: 24px; }
      th, td { font-size: 13px; padding: 10px; }
    }

    /* Technical Analytics CSS */
    .section-lead {
      margin: 0 0 16px 0;
      color: var(--muted);
      font-size: 14px;
    }

    .metrics-grid-4 {
      grid-template-columns: repeat(4, minmax(180px, 1fr));
    }

    .funnel-wrap {
      margin: 18px 0 20px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: linear-gradient(180deg, #fbfdff 0%, #f7faff 100%);
      padding: 18px;
    }

    .funnel-svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .funnel-caption {
      margin-top: 10px;
      display: flex;
      justify-content: center;
    }

    .mini-kpi {
      display: inline-block;
      background: #eef6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 13px;
    }

    .status-badge {
      display: inline-block;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 700;
      border: 1px solid transparent;
    }

    .status-badge.ok {
      background: #ecfdf3;
      color: #166534;
      border-color: #bbf7d0;
    }

    .status-badge.warn {
      background: #fff8e6;
      color: #92400e;
      border-color: #fde68a;
    }

    .stable-card {
      background: #f1fbf5;
    }

    .unstable-card {
      background: #fffaf0;
    }

    .methodology-box {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px 18px;
    }

    .methodology-box p {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: var(--text);
    }

    .methodology-box p:last-child {
      margin-bottom: 0;
    }

    .action-table th,
    .action-table td {
      vertical-align: top;
      font-size: 13px;
    }

    .priority-badge {
      display: inline-block;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 800;
      border: 1px solid transparent;
      text-transform: uppercase;
    }

    .priority-badge.high {
      background: #fee2e2;
      color: #991b1b;
      border-color: #fecaca;
    }

    .priority-badge.medium {
      background: #fef3c7;
      color: #92400e;
      border-color: #fde68a;
    }

    .priority-badge.low {
      background: #dcfce7;
      color: #166534;
      border-color: #bbf7d0;
    }

    .closure-box {
      margin-top: 18px;
      border: 1px solid #bfdbfe;
      background: #eff6ff;
      border-radius: 14px;
      padding: 16px 18px;
    }

    .closure-box h3 {
      margin: 0 0 12px 0;
      color: #1d4ed8;
      font-size: 18px;
    }

    .empty-cell {
      text-align: center;
      color: var(--muted);
      background: #fbfcfe;
      font-style: italic;
    }

    @media (max-width: 900px) {
      .metrics-grid-4 {
        grid-template-columns: repeat(2, minmax(160px, 1fr));
      }
    }

    @media (max-width: 560px) {
      .metrics-grid-4 {
        grid-template-columns: 1fr;
      }

      .mini-kpi {
        text-align: center;
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <section class="header">
      <div class="title-block">
        <h1>Reporte Funcional Playwright - REGINSA</h1>
        <p><strong>Proyecto:</strong> ${escapeHtml(metadata.proyecto || 'N/D')}</p>
        <p><strong>Entorno:</strong> ${escapeHtml(metadata.entorno || 'N/D')}</p>
        <p><strong>Fecha de ejecución:</strong> ${formatDate(metadata.timestamp)}</p>
      </div>
      <div class="meta-grid">
        <div class="meta-box">
          <div class="meta-label">Run ID</div>
          <div class="meta-value">${escapeHtml(metadata.runId || 'N/D')}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Schema</div>
          <div class="meta-value">${escapeHtml(report.schemaVersion || 'N/D')}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Tests únicos</div>
          <div class="meta-value">${escapeHtml(summary.testsUnicos ?? 0)}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Intentos totales</div>
          <div class="meta-value">${escapeHtml(summary.intentosTotales ?? 0)}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Retries / Flaky</div>
          <div class="meta-value">${escapeHtml(summary.retriesTotales ?? 0)} / ${escapeHtml(summary.flakyFinal ?? 0)}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">JSON fuente</div>
          <div class="meta-value path">${escapeHtml(sourceJson)}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Carpeta fuente</div>
          <div class="meta-value path">${escapeHtml(sourceDir)}</div>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Resumen Ejecutivo</h2>
      <div class="executive">
        <div class="signal-card">
          <div class="signal-light"></div>
          <div class="signal-label">${escapeHtml(stateMeta.label)}</div>
        </div>
        <div class="executive-text">
          <span class="badge risk-badge">Riesgo: ${escapeHtml(interpretacion.riesgo || 'N/D')}</span>
          <p class="summary-text">${escapeHtml(interpretacion.resumenEjecutivo || 'Sin resumen ejecutivo disponible.')}</p>
        </div>
      </div>
    </section>

    ${renderCurrentFindings(report)}

    <section class="section">
      <h2>Clasificación de Resultados</h2>
      <div class="metrics-grid">
        ${card('Tests Únicos', summary.testsUnicos ?? 0, 'info')}
        ${card('Passed Limpios', summary.passedLimpios ?? 0, 'success')}
        ${card('Flaky', summary.flakyFinal ?? 0, Number(summary.flakyFinal || 0) > 0 ? 'warning' : 'default')}
        ${card('Failed', summary.failedFinal ?? 0, Number(summary.failedFinal || 0) > 0 ? 'danger' : 'default')}
        ${card('Éxito Final', `${num(summary.tasaExitoFinal ?? 0, 2)}%`, 'success')}
        ${card('Flaky Rate', `${num(summary.tasaFlaky ?? 0, 2)}%`, Number(summary.tasaFlaky || 0) > 0 ? 'warning' : 'default')}
        ${card('Intentos Totales', summary.intentosTotales ?? 0, 'info')}
        ${(() => { const t = Number(summary.testsUnicos ?? 0); const r = Number(summary.retriesTotales ?? 0); const burden = t > 0 ? (r / t) * 100 : 0; return card('Retry Burden', `${num(burden, 1)}%`, burden === 0 ? 'default' : burden <= 20 ? 'warning' : 'danger', `${r} retries / ${t} tests únicos`); })()}
      </div>
    </section>

    ${renderChartsSection(report)}

    <section class="section">
      <h2>Análisis por IP — Heatmap de Estabilidad</h2>
      <p class="section-lead">
        Distribución de resultados por IP/worker asignado. Las celdas de <em>Éxito %</em> y <em>Flaky %</em> se colorean semafóricamente
        (verde ≥95%, naranja 80–94%, rojo &lt;80%). El <em>Ranking Estabilidad</em> = 100 − Flaky%.
      </p>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>IP / Worker</th>
              <th style="text-align:center;">Tests Únicos</th>
              <th style="text-align:center;">Intentos</th>
              <th style="text-align:center;">Éxito %</th>
              <th style="text-align:center;">Flaky %</th>
              <th style="text-align:center;">Registros</th>
              <th style="min-width:160px;">Ranking Estabilidad</th>
            </tr>
          </thead>
          <tbody>
            ${renderIpRows(ipSummary)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <h2>Análisis por Endpoint</h2>
      ${renderEndpointRows(endpointSummary)}
    </section>

    ${renderTechnicalAnalytics(report)}

    <section class="section">
      <h2>Hallazgos Técnicos</h2>
      ${renderList(interpretacion.hallazgosClave, false)}
    </section>

    <section class="section">
      <h2>Recomendaciones</h2>
      ${renderList(interpretacion.recomendaciones, true)}
    </section>

    ${renderDevelopmentActions(report)}

    <section class="footer">
      Generado: ${formatDate(new Date().toISOString())} | Schema Version: ${escapeHtml(report.schemaVersion || 'N/D')}
    </section>
  </div>
  ${renderChartsScript()}
</body>
</html>`;
}

function resolveInputPath(inputArg) {
  if (inputArg) return path.resolve(inputArg);
  return path.resolve(process.cwd(), 'playwright-report', 'pf-report.json');
}

function getProjectBasePath(inputPath) {
  // Detecta la ruta base del proyecto a partir del archivo de entrada
  if (inputPath) {
    // Si la ruta contiene 'playwright-report', usa el directorio padre
    if (inputPath.includes('playwright-report')) {
      return path.dirname(path.dirname(inputPath));
    }
    // Si no, usa el directorio del archivo
    return path.dirname(inputPath);
  }
  return process.cwd();
}

function sanitizeForFilename(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 40);
}

function buildOutputDir(report, inputPath, outputArg) {
  const metadata = report.metadata || {};
  const ts = String(metadata.timestamp || new Date().toISOString()).replace(/[:.]/g, '-');
  const basePath = getProjectBasePath(inputPath);

  // Construir nombre descriptivo del archivo
  const casoId = metadata.casoId || metadata.caseId || '00';
  const casoDesc = sanitizeForFilename(metadata.casoDescripcion || metadata.caso || 'registrar_sancion');
  const escenario = sanitizeForFilename(metadata.escenario || metadata.scenario || 'multi_ip');

  const folderName = `caso${casoId}_${casoDesc}-${escenario}_audit-${ts}`;
  const fileName = `${folderName}.html`;
  const resolvedOutput = outputArg ? path.resolve(outputArg) : null;
  const outputBaseName = resolvedOutput ? path.basename(resolvedOutput).toLowerCase() : '';

  return {
    dirPath: resolvedOutput
      ? (outputBaseName === 'reportes' ? path.join(resolvedOutput, folderName) : resolvedOutput)
      : path.resolve(basePath, 'reportes', folderName),
    fileName: fileName
  };
}

function main() {
  try {
    const inputPath = resolveInputPath(process.argv[2]);

    if (!fs.existsSync(inputPath)) {
      throw new Error(`No se encontró el archivo JSON: ${inputPath}`);
    }

    const raw = fs.readFileSync(inputPath, 'utf8');
    const report = JSON.parse(raw);
    const html = generateHTML(report);

    const { dirPath, fileName } = buildOutputDir(report, inputPath, process.argv[3]);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const outputPath = path.join(dirPath, fileName);
    fs.writeFileSync(outputPath, html, 'utf8');

    console.log(`✅ Reporte HTML generado en: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Error al generar HTML: ${error.message}`);
    process.exit(1);
  }
}

main();
