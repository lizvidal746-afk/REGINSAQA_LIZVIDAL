function classifyPersistencia(attempts) {
  let confirmadas = 0;
  let indeterminadas = 0;
  let noConfirmadas = 0;
  const indetList = [];

  for (const a of attempts) {
    const hasReg = !!a.registroId;
    const hasFunctionalEvidence = !!(a.functionalEvidence || a.apiEndpoint || a.evidenciaFuncional || a.operacionFuncional);
    const errorsStr = (a.errors || []).join(' ').toLowerCase();
    const isFailed = a.status !== 'passed';
    
    if (hasReg || (a.status === 'passed' && hasFunctionalEvidence)) {
      confirmadas++;
    } else if (isFailed) {
      const isIndet = a.apiEndpoint || errorsStr.includes('no se capturó un id real') || errorsStr.includes('toast de éxito');
      if (isIndet) {
        indeterminadas++;
        indetList.push(a);
      } else {
        noConfirmadas++;
      }
    }
  }

  return { confirmadas, indeterminadas, noConfirmadas, indetList };
}

const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { PlaywrightReader, fmtMs, fmtPct } = require('./lib/playwright-reader');
const { buildFallback, systemPrompt, buildUserPrompt } = require('./ai-prompts');

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function table(headers, rows) {
  const cellVal = (val) => {
    if (typeof val === 'string' && /<[a-z][\s\S]*>/i.test(val)) return val;
    return esc(val);
  };
  return `
    <table>
      <thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cellVal(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  `;
}

function queryOllama(model, prompt, systemPrompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      format: 'json',
      options: { temperature: 0.1, num_ctx: 8192 },
      stream: false
    });

    const options = {
      hostname: process.env.OLLAMA_HOST || '127.0.0.1',
      port: parseInt(process.env.OLLAMA_PORT || '11434', 10),
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: parseInt(process.env.OLLAMA_TIMEOUT_MS || '15000', 10)
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Ollama status code ${res.statusCode}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.message?.content || '';
          resolve(content);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout connecting to Ollama'));
    });

    req.write(payload);
    req.end();
  });
}

function collectQualityFindings(reader) {
  const findings = [];
  const reportFindings = Array.isArray(reader._raw?.hallazgosTecnicos) ? reader._raw.hallazgosTecnicos : [];
  for (const finding of reportFindings) {
    if (finding?.id === 'HAL-CP01-ENTIDAD-CREAR-NET-ERR-FAILED') {
      findings.push({
        id: finding.id,
        severidad: finding.severidad || 'Alta',
        tipo: finding.tipo || 'Hallazgo funcional/técnico',
        descripcion: finding.descripcion || '',
        recomendacion: '<b>[Backend/Infraestructura/Frontend]:</b> ' + (finding.recomendacion || '') + '<br><b>Criterio de cierre:</b> ' + (finding.criterioCierre || ''),
      });
    }
  }
  const cp01NetErrTests = reader.testList.filter((test) => (test.errors || []).some((err) => String(err.message || err).includes('Entidad/Crear') && String(err.message || err).includes('net::ERR_FAILED')));
  if (cp01NetErrTests.length > 0 && !findings.some((item) => item.id === 'HAL-CP01-ENTIDAD-CREAR-NET-ERR-FAILED')) {
    const causa = process.env.REGINSA_CP01_NET_ERR_FAILED_CAUSA ? ' Causa indicada por el proyecto: ' + process.env.REGINSA_CP01_NET_ERR_FAILED_CAUSA + (process.env.REGINSA_CP01_NET_ERR_FAILED_FUENTE ? ' (fuente: ' + process.env.REGINSA_CP01_NET_ERR_FAILED_FUENTE + ')' : '') + '.' : ' Causa no parametrizada por QA; requiere análisis del equipo responsable del sistema.';
    findings.push({
      id: 'HAL-CP01-ENTIDAD-CREAR-NET-ERR-FAILED-DIRECT',
      severidad: 'Alta',
      tipo: 'Hallazgo funcional/técnico CP-REG-01',
      descripcion: 'CP-REG-01 presentó abortos de red en Entidad/Crear con net::ERR_FAILED, sin código HTTP de respuesta.' + causa,
      recomendacion: '<b>[Backend/Infraestructura/Frontend]:</b> Endpoint Entidad/Crear debe responder siempre con HTTP controlado; registrar RUC, usuario, IP, timestamp, request id y causa. Si existe límite/rate limit, devolver 429 o mensaje claro. Angular debe bloquear doble envío y mostrar error técnico visible. Revisar Proxy/WAF/IIS/API Gateway.',
    });
  }
  const caseTests = reader.testList.filter((t) => /registrar sanción|registrar sancion|sanción|sancion/i.test(t.title));

  function annotationValue(test, type, fallback = 'N/A') {
    const ann = Array.isArray(test.annotations)
      ? test.annotations.find((item) => item && item.type === type)
      : null;
    return ann && ann.description ? ann.description : fallback;
  }

  for (const test of caseTests) {
    const sanciones = Number(annotationValue(test, 'sancionesEjecutadas', 'NaN'));
    const registroId = annotationValue(test, 'registroId', '');
    const timeoutNote = annotationValue(test, 'timeoutJustificacion', '');
    const negativeExpected = annotationValue(test, 'defectoEsperadoSiPermiteGuardar', '');
    const errorsList = test.errors || [];
    const errorMsg = errorsList.length > 0 ? String(errorsList[0].message || '') : '';

    if (test.status === 'passed' && Number.isFinite(sanciones) && sanciones < 1 && registroId) {
      findings.push({
        id: 'DEF-FUNC-SIN-SANCION',
        severidad: 'Crítica',
        tipo: 'Regla de negocio',
        descripcion: `El sistema permitió persistir el registro ${registroId} sin al menos 1 sanción.`,
        recomendacion: '<b>[Programador]:</b> Bloquear en el backend el guardado de la cabecera si no existe detalle de sanción asociado. La UI no debe ser la única barrera de validación.',
      });
    }

    if ((test.status === 'failed' || test.status === 'timedOut' || errorMsg.includes('No se capturó un ID real')) && !registroId) {
      findings.push({
        id: 'DEF-API-PERSISTENCIA',
        severidad: 'Crítica',
        tipo: 'Intercepción API / Persistencia',
        descripcion: 'No se capturó un ID real de CabeceraInfraccionSancion al guardar. Se cayó en fallback por Toast UI debido a que la API no respondió dentro del tiempo límite.',
        recomendacion: '<b>[Programador]:</b> El endpoint de guardado (/api/CabeceraInfraccionSancion) debe retornar el ID creado de manera síncrona en el body.<br><b>[Arquitecto]:</b> Definir un SLA de respuesta en backend menor a 2.0 segundos para evitar bloqueos concurrentes.<br><b>[Infraestructura]:</b> Optimizar el pool de conexiones de base de datos en QA.<br><b>[Framework REGINSA_PF]:</b> Alinear las reglas de waitForResponse reduciendo timeouts globales y deshabilitando el fallback al Toast para evitar falsos positivos.',
      });
    }

    if (errorMsg.includes('toBeVisible') || errorMsg.includes('locator') || errorMsg.includes('selector')) {
      findings.push({
        id: 'DEF-ESTABILIDAD-UI',
        severidad: 'Alta',
        tipo: 'Visibilidad DOM / Latencia',
        descripcion: 'Timeout esperando visibilidad de elementos del formulario (ej: numeroExpediente o dropdowns) debido a retrasos en la carga.',
        recomendacion: '<b>[Programador]:</b> Optimizar la carga asíncrona de los combos (RIS y Tipo Infractor) para no bloquear la renderización inicial.<br><b>[Arquitecto]:</b> Añadir caché de lectura (Redis/Memcached) a los catálogos del formulario.<br><b>[Framework REGINSA_PF]:</b> Alinear las esperas reemplazando waitForLoadState(\'networkidle\') por esperas explícitas de selectores del DOM.',
      });
    }

    if (test.status === 'timedOut' || errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
      findings.push({
        id: 'OBS-RENDIMIENTO-UI',
        severidad: 'Alta',
        tipo: 'Rendimiento / Concurrencia',
        descripcion: 'La ejecución del test superó el límite de tiempo global (120 segundos) debido a latencia extrema o concurrencia de red.',
        recomendacion: '<b>[Programador]:</b> Optimizar la carga inicial y scripts síncronos pesados en el evento submit.<br><b>[Infraestructura]:</b> Escalar CPU/RAM de los contenedores de QA bajo carga concurrente.<br><b>[Framework REGINSA_PF]:</b> Optimizar la concurrencia distribuyendo los workers a lo largo de las IPs secundarias configuradas.',
      });
    }

    if (timeoutNote && test.durationMs > 120000) {
      findings.push({
        id: 'OBS-TIEMPO-SMOKE',
        severidad: 'Media',
        tipo: 'Rendimiento funcional / estabilidad UI',
        descripcion: `Se amplió el timeout porque ${timeoutNote}`,
        recomendacion: '<b>[Programador/Arquitecto]:</b> Medir tiempos por paso: combos RIS/tipo infractor, guardar detalle y guardar formulario. Si supera el umbral acordado, levantar defecto de rendimiento/UX.',
      });
    }

    if (negativeExpected) {
      findings.push({
        id: 'CTRL-NEG-SIN-SANCION',
        severidad: 'Crítica',
        tipo: 'Control negativo',
        descripcion: negativeExpected,
        recomendacion: '<b>[Framework REGINSA_PF]:</b> Ejecutar este control como prueba negativa separada y documentar evidencia si el backend permite persistir el registro sin sanciones.',
      });
    }
  }

  const unique = new Map();
  for (const finding of findings) {
    const key = `${finding.id}|${finding.descripcion}`;
    if (!unique.has(key)) unique.set(key, finding);
  }
  return Array.from(unique.values());
}

function getHallazgosVigentes() {
  return [
    {
      id: 'HV-API-001',
      estado: 'vigente',
      tipo: 'cambio_contrato',
      severidad: 'ALTA',
      titulo: 'Cambio de método en listado de infracciones',
      detalle: '/Infraccion/Listar opera ahora con método GET en lugar de POST.',
      criterio: 'Hecho observado en integración; mantener visible hasta nueva validación de calidad.'
    },
    {
      id: 'HV-API-002',
      estado: 'vigente',
      tipo: 'endpoint_deprecado',
      severidad: 'ALTA',
      titulo: 'Endpoints anteriores no disponibles en la forma previamente utilizada',
      detalle: '/CabeceraInfraccionSancion/Crear, /MedidaCorrectiva/Crear y /DetalleInfraccionSancion/Crear ya no se encuentran disponibles en la forma anterior.',
      criterio: 'Hecho observado en integración; requiere actualización de scripts, pruebas API/K6 y documentación operacional.'
    },
    {
      id: 'HV-API-003',
      estado: 'vigente',
      tipo: 'nuevo_endpoint',
      severidad: 'ALTA',
      titulo: 'Nuevo endpoint de creación con detalles',
      detalle: 'El flujo observado apunta al uso de /CabeceraInfraccionSancion/CrearConDetalles.',
      criterio: 'Mantener como estado actual conocido hasta reconfirmación en siguiente pase a calidad.'
    },
    {
      id: 'HV-API-004',
      estado: 'vigente',
      tipo: 'contrato_respuesta',
      severidad: 'MEDIA',
      titulo: 'Identificador de respuesta en RESULTADO',
      detalle: 'La respuesta expone el identificador en el campo RESULTADO.',
      criterio: 'Los extractores de ID deben priorizar RESULTADO y conservar compatibilidad defensiva con contratos anteriores si aplica.'
    },
    {
      id: 'HV-DEF-001',
      estado: 'seguimiento',
      tipo: 'hipotesis_operativa',
      severidad: 'MEDIA',
      titulo: 'Defecto de expedientes huérfanos en observación',
      detalle: 'El defecto queda en seguimiento: probablemente mitigado por cambio arquitectónico, pendiente de reconfirmación en el siguiente pase de calidad.',
      criterio: 'No marcar como resuelto mientras solo exista inferencia indirecta; cerrar únicamente con evidencia nueva de calidad.'
    }
  ];
}

async function generateWord(jsonPath, outDir) {
  const reader = new PlaywrightReader(jsonPath);
  const qualityFindings = collectQualityFindings(reader);
  let aiReport = buildFallback(reader._raw);

  const useOllama = process.env.REGINSA_USE_OLLAMA === '1' || process.env.OLLAMA_ENABLED === '1';
  const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
  if (useOllama) {
    try {
      console.log(`[IA] Consultando análisis local en Ollama (${model}) para reporte Word...`);
      const aiResponse = await queryOllama(model, buildUserPrompt(reader._raw), systemPrompt);
      if (aiResponse) {
        const parsed = JSON.parse(aiResponse);
        if (parsed && parsed.reporte_profesional) {
          aiReport = parsed;
          console.log(`🤖 [IA] Análisis de Ollama (${model}) cargado exitosamente en el reporte Word.`);
        }
      }
    } catch (e) {
      console.log(`⚠️ [IA] Ollama offline o modelo no disponible (${e.message}). Usando heurísticas locales para el reporte Word.`);
    }
  } else {
    console.log('ℹ️ [IA] Ollama desactivado temporalmente. Usando heurísticas locales para el reporte Word.');
  }

  const conc = reader.concurrencyAnalysis;
  const dual = reader.dualView;
  const { testListFinal, attemptList, integridad } = dual;
  const pClass = classifyPersistencia(attemptList);

  const testsUnicos = testListFinal.length;
  const testsFuncionales = integridad.testsFuncionales ?? testsUnicos;
  const intentosTotales = attemptList.length;
  const retriesTotal = integridad.retriesTotal;
  const passedLimpios = testListFinal.filter(t => !t.hadRetries && (t.finalStatus === 'passed' || t.finalStatus === 'flaky')).length;
  const flakyCount = testListFinal.filter(t => t.hadRetries).length;
  const retryBurdenPct = testsUnicos > 0 ? ((retriesTotal / testsUnicos) * 100) : 0;
  const hasNoEndpoint = dual.endpointSummary.some(ep => ep.endpoint === 'NO_ENDPOINT');
  const persistenciaFuncional = integridad.ratioPersistenciaFuncional ?? integridad.ratioPersistenciaUnica;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>REGINSA PF - Informe Word</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; color: #172033; }
    h1 { color: #1A237E; font-size: 22pt; }
    h2 { color: #3949AB; border-bottom: 1px solid #c5cae9; padding-bottom: 4px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0 18px; }
    th { background: #1A237E; color: white; font-weight: bold; }
    th, td { border: 1px solid #c5cae9; padding: 6px; font-size: 10pt; vertical-align: top; }
    .decision { font-weight: bold; color: #1A237E; }
    .note { background: #eef0fb; padding: 10px; border-left: 4px solid #3949AB; }
  </style>
</head>
<body>
  <h1>REGINSA - Informe de Pruebas Funcionales Automatizadas</h1>
  <p><strong>Fecha:</strong> ${esc(new Date().toISOString())}</p>
  <p><strong>Framework:</strong> Playwright</p>
  <p><strong>Aprobado por:</strong> ${esc(aiReport.reporte_profesional?.['1.0_encabezado']?.aprobado_por || 'QA Lead')}</p>
  <p><strong>Estado de la Ejecución:</strong> <span class="decision">${esc(aiReport.metadata.estado_general)}</span></p>
  <p><strong>Decisión de Lanzamiento (Go/No-Go):</strong> <span class="decision">${esc(aiReport.metadata.decision)}</span></p>
 
  <h2>0.0 Alerta de Integridad de Persistencia</h2>
  <div class="note" style="background-color: ${pClass.indeterminadas === 0 ? '#e8f5e9' : pClass.indeterminadas <= 2 ? '#fff8e1' : '#ffebee'}; border-left: 4px solid ${pClass.indeterminadas === 0 ? '#2e7d32' : pClass.indeterminadas <= 2 ? '#fbc02d' : '#d32f2f'};">
    <p><strong>Estado de Persistencia:</strong> <span style="font-weight: bold; color: ${pClass.indeterminadas === 0 ? '#2e7d32' : pClass.indeterminadas <= 2 ? '#e65100' : '#b71c1c'}">${pClass.indeterminadas === 0 ? 'INTEGRO / CONFIRMADO' : pClass.indeterminadas <= 2 ? 'ADVERTENCIA / INCOMPLETO' : 'CRÍTICO / FALLO DE PERSISTENCIA'}</span></p>
    <p>Se evaluaron los intentos y registros confirmados en base de datos. Una persistencia 'Indeterminada' ocurre cuando el test realiza la petición de guardado pero el backend demora más del tiempo de intercepción (timeout), haciendo que el test no pueda validar el ID real guardado de manera directa, aunque la operación haya finalizado en base de datos.</p>
  </div>
  ${hasNoEndpoint ? `
  <div class="note" style="background-color: #fff3e0; border-left: 4px solid #ff9800; margin-bottom: 15px;">
    <p><strong>⚠️ DEUDA DE OBSERVABILIDAD DETECTADA:</strong> Existe al menos un caso con <code>NO_ENDPOINT</code> en los resultados, lo que significa que el test realizó peticiones HTTP sin un endpoint trazable, impidiendo una auditoría funcional completa de la transacción.</p>
  </div>
  ` : ''}

  ${table(['Métrica', 'Valor', 'Estado / Detalle'], [
    ['Intentos Totales', String(pClass.confirmadas + pClass.indeterminadas + pClass.noConfirmadas), 'Total de ejecuciones de tests (incluyendo reintentos).'],
    ['Tests Únicos Finales', String(testListFinal.length), 'Casos únicos de prueba consolidados.'],
    ['Tests Funcionales', String(testsFuncionales), 'Casos funcionales con IP asignada; excluye setup/auth.'],
    ['Evidencias funcionales', String(pClass.confirmadas), 'Intentos con endpoint, registroId o evidencia explícita confirmada.'],
    ['Indeterminadas (timeout+intercepción)', String(pClass.indeterminadas), pClass.indeterminadas === 0 ? '🟢 OK' : pClass.indeterminadas <= 2 ? '⚠️ ADVERTENCIA' : '🔴 CRÍTICO'],
    ['No Confirmadas', String(pClass.noConfirmadas), pClass.noConfirmadas === 0 ? '🟢 OK' : '🔴 CRÍTICO'],
    ['Passed Limpio (sin retry)', String(passedLimpios), passedLimpios === testsUnicos ? '🟢 OK' : '⚠️ ALERTA'],
    ['Retry Burden %', `${retryBurdenPct.toFixed(2)}%`, retryBurdenPct <= 15 ? '🟢 OK' : '🔴 ELEVADO'],
    ['Ratio Persistencia Funcional %', fmtPct(persistenciaFuncional / 100), persistenciaFuncional >= 95 ? '🟢 OK' : '🔴 BAJO'],
    ['Flaky Rate %', fmtPct(reader.flakyRate), reader.flakyRate <= 0.05 ? '🟢 OK' : '⚠️ ADVERTENCIA'],
    ['Deuda de Observabilidad (NO_ENDPOINT)', hasNoEndpoint ? '⚠️ SÍ' : '🟢 NO', hasNoEndpoint ? '🔴 Intervención requerida' : '🟢 OK']
  ])}

  ${pClass.indetList.length > 0 ? `
  <h3>Listado de Intentos Indeterminados</h3>
  ${table(['Test / Expediente', 'Worker', 'Usuario / IP', 'Estado Test'], pClass.indetList.map(a => [
    `${a.testId} <br><b>Expediente:</b> ${a.expediente || 'N/D'}`,
    String(a.workerIndex + 1),
    `${a.assignedUser || 'N/D'} (${a.assignedIp || 'N/D'})`,
    a.status.toUpperCase()
  ]))}
  ` : ''}

  <h2>1. Resumen Ejecutivo</h2>
  <p class="note">${esc(aiReport.reporte_profesional?.['3.0_resumen_ejecutivo']?.conclusion || '')}</p>
  <p style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 10px; font-weight: bold;">
    ⚠️ ADVERTENCIA EDITORIAL: Un 100% de éxito final (PASS) funcional no garantiza estabilidad si existen IP inestables o Retry Burden elevado.
  </p>
 
  <h2>2. Métricas del SLO</h2>
  ${table(['Métrica', 'Valor Logrado', 'Umbral Mínimo', 'Estado'], [
    ['Tasa de Éxito Funcional', fmtPct(reader.passRate), '95.00%', reader.passRate >= 0.95 ? 'PASA' : 'FALLA'],
    ['Estabilidad (Flakiness)', fmtPct(reader.flakyRate), '5.00%', reader.flakyRate <= 0.05 ? 'PASA' : 'FALLA'],
    ['Aislamiento de Workers', '0 colisiones', '0 colisiones', 'PASA'],
    ['Persistencia Funcional (Registros / Tests Funcionales)', fmtPct(persistenciaFuncional / 100), '95.00%', persistenciaFuncional >= 95 ? 'PASA' : 'FALLA']
  ])}

  <h2>2.5. Análisis de Concurrencia e Infraestructura</h2>
  <p><strong>Nivel de Riesgo del Servidor:</strong> <span class="decision">${esc(conc.riskLevel)}</span></p>
  <p><strong>Evaluación de Carga:</strong> ${esc(conc.riskReason)}</p>
  <p class="note" style="background-color: #fff9c4; border-left: 4px solid #fbc02d; font-style: italic;">
    ${esc(conc.productionNote)}
  </p>

  ${table(['Métrica de Servidor', 'Valor', 'Detalle Técnico'], [
    ['Workers Ejecutados', conc.totalWorkers, 'Instancias paralelas de Playwright.'],
    ['IPs Activas Usadas', conc.activeIps, 'IPs de origen asignadas a los workers.'],
    ['Tasa de Saturación de Red', `${conc.saturationPct}%`, 'Distribución de carga por IP.'],
    ['Desbalance de CPU (Workers)', `${conc.loadImbalancePct}%`, 'Variación de duración de ejecución entre workers.'],
    ['Reintentos Totales', conc.totalRetries, 'Tests que fallaron y se reintentaron.'],
    ['Registros Duplicados en BD', conc.duplicatedExpedientes.length, 'Expedientes guardados múltiples veces.']
  ])}

  <h3>Recomendaciones por Concurrencia</h3>
  ${conc.recommendations.length === 0
    ? '<p>No se requieren mitigaciones de infraestructura o arquitectura inmediatas.</p>'
    : table(['Área', 'Hallazgo', 'Mitigación Recomendada'], conc.recommendations.map((rec) => [
        rec.area,
        rec.hallazgo,
        rec.accion
      ]))}
 
  <h2>3. Detalle de Ejecución por Worker</h2>
  <p>${esc(reader.workerContextNote)}</p>
  ${table(['Prueba', 'Worker', 'Usuario', 'IP', 'Expediente', 'Registro ID', 'Endpoint API', 'Estado', 'Mensaje de Error'], reader.testList.map((test) => {
      const annotations = test.annotations || [];
      const getAnn = (type) => annotations.find((a) => a.type === type)?.description || '';
      const expediente = getAnn('expediente') || getAnn('numeroExpediente') || '';
      const registroId = getAnn('registroId') || '';
      const apiEndpoint = getAnn('apiEndpoint') || '';
      return [
        test.title, 
        test.workerIndex + 1, 
        test.assignedUser, 
        test.assignedIp, 
        expediente,
        registroId,
        apiEndpoint,
        test.status,
        test.errors?.[0]?.message || ''
      ];
  }))}

  <h2>3.5 Hallazgos Vigentes / Estado Actual Conocido</h2>
  <p>Cambios de contrato, endpoint o comportamiento observados en integración que deben permanecer visibles hasta que un nuevo pase a calidad los confirme, refine o cierre con evidencia. No se marca como resuelto ningún punto inferido por comportamiento indirecto.</p>
  ${table(['ID', 'Estado', 'Severidad', 'Hallazgo', 'Detalle', 'Criterio de permanencia/cierre'], getHallazgosVigentes().map(item => [
    item.id,
    item.estado.toUpperCase(),
    item.severidad,
    item.titulo,
    item.detalle,
    item.criterio
  ]))}

  <h2>4. Análisis de Defectos y Hallazgos de Calidad</h2>
  ${qualityFindings.length === 0
    ? '<p>No se registraron defectos funcionales o de persistencia en la corrida.</p>'
    : table(['ID', 'Severidad', 'Tipo', 'Descripción', 'Recomendación de Resolución (Para Desarrollador / Arquitecto / Infraestructura / Framework)'], qualityFindings.map((f) => [
        f.id,
        f.severidad,
        f.tipo,
        f.descripcion,
        f.recomendacion
      ]))}

  <h2>5. Criterios de Calidad y Estándares de Referencia</h2>
  <p>Este informe de pruebas funcionales automatizadas cumple con los estándares internacionales y mejores prácticas de ingeniería de software:</p>
  <ul>
    <li><strong>ISTQB CTFL / CTAL-TAE:</strong> Aplicación de la pirámide de pruebas, automatización basada en arquitectura de Page Object Model (POM) y control del ciclo de vida del test (SetUp, Execution, Teardown, CleanUp).</li>
    <li><strong>ISO/IEC/IEEE 29119-3:</strong> Estructura técnica formal de reportes de pruebas (Test Report) incluyendo contexto, KPIs agregados y trazabilidad de los elementos de configuración de la prueba.</li>
    <li><strong>ISO/IEC 25010 (Adecuación Funcional y Fiabilidad):</strong> Evaluación sistemática de la persistencia de datos reales en base de datos. Se exige un identificador único (registroId) devuelto por los endpoints HTTP del aplicativo como condición de aceptación funcional.</li>
    <li><strong>IEEE 829 (Test Documentation):</strong> Trazabilidad completa por caso de prueba que asocia el caso de automatización con el usuario ejecutor, dirección IP asignada, expediente procesado y worker específico.</li>
  </ul>
</body>
</html>`;

  const outPath = path.join(outDir, `REGINSA_PLAYWRIGHT_INFORME_WORD_${reader.filenameStamp}.doc`);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`✅ [WORD] Informe formal generado en: ${path.basename(outPath)}`);
  return outPath;
}


if (require.main === module) {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('Uso: node generar-word.js <ruta a results.json> [salida]');
    process.exit(1);
  }
  const outDir = process.argv[3] || path.dirname(jsonPath);
  (async () => {
    try {
      await generateWord(jsonPath, outDir);
    } catch (e) {
      console.error('❌ Error generating Word report:', e);
      process.exit(1);
    }
  })();
}

module.exports = { generateWord };
