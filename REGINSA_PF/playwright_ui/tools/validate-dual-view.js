/**
 * validate-dual-view.js
 * Script para validar la arquitectura dual-view y métricas corregidas
 * 
 * Uso: node tools/validate-dual-view.js [ruta/al/results.json]
 */

const fs = require('fs');
const path = require('path');
const { PlaywrightReader } = require('./lib/playwright-reader');

function main() {
  const jsonPath = process.argv[2] || findLatestResultsJson();
  
  console.log('\n🔍 Validación Dual-View Playwright');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`📁 Archivo: ${jsonPath}\n`);

  try {
    const reader = new PlaywrightReader(jsonPath);
    const dual = reader.dualView;

    // 1. Validación de conteos básicos
    console.log('1️⃣  CONTEOS BÁSICOS');
    console.log('───────────────────────────────────────────────────────');
    console.log(`   Tests únicos (finales):  ${dual.testListFinal.length}`);
    console.log(`   Intentos totales:         ${dual.attemptList.length}`);
    console.log(`   Retries ejecutados:       ${dual.integridad.retriesTotal}`);
    console.log(`   Registros creados:        ${dual.integridad.registrosTotal}`);
    console.log(`   Registros únicos:         ${dual.integridad.registrosUnicos}`);
    console.log();

    // 2. Validación de integridad (explicación 32 vs 36)
    console.log('2️⃣  INTEGRIDAD DE PERSISTENCIA');
    console.log('───────────────────────────────────────────────────────');
    console.log(`   Ratio persistencia/total intentos: ${dual.integridad.ratioPersistencia.toFixed(2)}%`);
    console.log(`   Ratio persistencia única/tests:    ${dual.integridad.ratioPersistenciaUnica.toFixed(2)}%`);
    if (Number.isFinite(dual.integridad.ratioPersistenciaFuncional)) {
      console.log(`   Ratio persistencia funcional:      ${dual.integridad.ratioPersistenciaFuncional.toFixed(2)}%`);
    }
    
    if (dual.integridad.duplicados.length > 0) {
      console.log(`   ⚠️  Duplicados detectados: ${dual.integridad.duplicados.length}`);
    } else {
      console.log(`   ✅ Sin duplicados`);
    }
    
    // Explicación automática de discrepancia
    const testsSinRegistro = dual.testListFinal.filter(t => !t.finalRegistroId).length;
    const intentosConRegistroFallido = dual.attemptList.filter(a => a.registroId && a.status !== 'passed').length;
    
    console.log();
    console.log('   📊 Explicación de discrepancia:');
    console.log(`      - Tests finales: ${dual.testListFinal.length}`);
    console.log(`      - Registros en BD: ${dual.integridad.registrosUnicos}`);
    if (intentosConRegistroFallido > 0) {
      console.log(`      - Intentos fallidos que crearon registro: ${intentosConRegistroFallido}`);
      console.log(`      → Esto explica la diferencia: ${dual.testListFinal.length} tests + ${intentosConRegistroFallido} intentos fallidos con persistencia = ${dual.integridad.registrosUnicos} registros`);
    }
    console.log();

    // 3. Validación por IP (fórmulas corregidas)
    console.log('3️⃣  ANÁLISIS POR IP (Fórmulas Corregidas)');
    console.log('───────────────────────────────────────────────────────');
    console.log('   IP                | Tests | Intentos | Éxito% | Flaky% | Registros');
    console.log('   ──────────────────┼───────┼──────────┼────────┼────────┼──────────');
    
    dual.ipSummary.forEach(ip => {
      const exitoPct = ip.tasaExitoFinal.toFixed(1).padStart(6);
      const flakyPct = ip.flakyRate.toFixed(1).padStart(6);
      console.log(
        `   ${ip.ip.padEnd(17)} | ${String(ip.testsUnicos).padStart(5)} | ` +
        `${String(ip.intentosEjecutados).padStart(8)} | ${exitoPct}% | ${flakyPct}% | ` +
        `${ip.registrosUnicos.length}`
      );
      
      // Validación crítica: nunca > 100%
      if (ip.tasaExitoFinal > 100 || ip.flakyRate > 100) {
        console.log(`   ❌ ERROR: Tasa > 100% detectada!`);
      }
    });
    console.log();

    // 4. Validación por Endpoint
    console.log('4️⃣  ANÁLISIS POR ENDPOINT');
    console.log('───────────────────────────────────────────────────────');
    console.log('   Endpoint                          | Llamadas | Éxitos | Retries | Persist%');
    console.log('   ──────────────────────────────────┼──────────┼────────┼─────────┼──────────');
    
    dual.endpointSummary.forEach(ep => {
      const nombre = ep.endpoint.length > 33 ? ep.endpoint.substring(0, 30) + '...' : ep.endpoint;
      console.log(
        `   ${nombre.padEnd(33)} | ${String(ep.llamadasTotales).padStart(8)} | ` +
        `${String(ep.exitososFinales).padStart(6)} | ${String(ep.retriesNecesarios).padStart(7)} | ` +
        `${ep.tasaPersistencia.toFixed(1)}%`
      );
    });
    console.log();

    // 5. Muestra de testListFinal
    console.log('5️⃣  MUESTRA DE TESTS FINALES (primeros 3)');
    console.log('───────────────────────────────────────────────────────');
    dual.testListFinal.slice(0, 3).forEach((test, i) => {
      console.log(`   ${i + 1}. ${test.testId.substring(0, 50)}`);
      console.log(`      Estado: ${test.finalStatus} | Retries: ${test.attemptCount - 1} | IP: ${test.assignedIp || 'N/D'}`);
      console.log(`      Registros: ${test.registroIds.join(', ') || 'Ninguno'}`);
      if (test.errorPattern) {
        console.log(`      Error: ${test.errorPattern} (${test.errorAudience})`);
      }
      console.log();
    });

    // 6. Muestra de attemptList
    console.log('6️⃣  MUESTRA DE INTENTOS (primeros 5)');
    console.log('───────────────────────────────────────────────────────');
    dual.attemptList.slice(0, 5).forEach((att, i) => {
      const retryStr = att.retry === 0 ? '1er intento' : `retry ${att.retry}`;
      const regStr = att.registroId ? `✓ ID:${att.registroId}` : '✗ Sin ID';
      console.log(`   ${i + 1}. ${att.testId.substring(0, 40)}...`);
      console.log(`      ${retryStr} | ${att.status.padEnd(7)} | ${regStr} | ${att.assignedIp || 'N/D'}`);
      if (att.errorCategory !== 'OTRO') {
        console.log(`      Clasificación: ${att.errorCategory} → ${att.errorAudience}`);
      }
      console.log();
    });

    // 7. Resumen de hallazgos técnicos
    console.log('7️⃣  HALLAZGOS TÉCNICOS DETECTADOS');
    console.log('───────────────────────────────────────────────────────');
    
    const endpointsUnicos = [...new Set(dual.attemptList.map(a => a.apiEndpoint).filter(Boolean))];
    if (endpointsUnicos.length > 0) {
      console.log(`   📡 Endpoints detectados: ${endpointsUnicos.length}`);
      endpointsUnicos.forEach(ep => console.log(`      - ${ep}`));
    }
    
    const erroresPorCategoria = {};
    dual.attemptList.forEach(a => {
      if (a.errorCategory) {
        erroresPorCategoria[a.errorCategory] = (erroresPorCategoria[a.errorCategory] || 0) + 1;
      }
    });
    
    if (Object.keys(erroresPorCategoria).length > 0) {
      console.log();
      console.log(`   🚨 Errores clasificados:`);
      Object.entries(erroresPorCategoria).forEach(([cat, count]) => {
        console.log(`      - ${cat}: ${count} ocurrencias`);
      });
    }
    
    console.log();
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Validación completada');
    console.log('───────────────────────────────────────────────────────');
    console.log('Resumen ejecutivo:');
    console.log(`  • Tests: ${dual.integridad.testsUnicos} | Intentos: ${dual.integridad.intentosTotal} | Retries: ${dual.integridad.retriesTotal}`);
  const testsFuncionales = dual.integridad.testsFuncionales ?? dual.integridad.testsUnicos;
  const ratioFuncional = dual.integridad.ratioPersistenciaFuncional ?? dual.integridad.ratioPersistenciaUnica;
  const evidenciasFuncionales = dual.integridad.evidenciasFuncionales ?? dual.integridad.registrosUnicos;
  console.log(`  • Evidencia funcional: ${evidenciasFuncionales}/${testsFuncionales} tests funcionales (${ratioFuncional.toFixed(1)}%)`);
    console.log(`  • IPs: ${dual.ipSummary.length} | Endpoints: ${dual.endpointSummary.length}`);
    console.log(`  • Tasas por IP: Todas ≤100%: ${dual.ipSummary.every(ip => ip.tasaExitoFinal <= 100 && ip.flakyRate <= 100) ? '✅ SÍ' : '❌ NO'}`);
    console.log('═══════════════════════════════════════════════════════\n');

    // 8. Exportar pf-report.json (fuente canónica funcional)
    console.log('💾 Exportando pf-report.json...');
    const outputDir = path.dirname(jsonPath);
    const outputPath = path.join(outputDir, 'pf-report.json');
    const pfReport = buildPfReport(reader, dual, jsonPath, outputPath);
    fs.writeFileSync(outputPath, JSON.stringify(pfReport, null, 2), 'utf8');
    console.log(`✅ pf-report.json guardado en: ${outputPath}`);
    console.log(`📊 Resumen: ${pfReport.summaryGlobal.testsUnicos} tests | ${pfReport.summaryGlobal.intentosTotales} intentos | Estado: ${pfReport.interpretacionAutomatica.estado}\n`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

function findLatestResultsJson() {
  const fs = require('fs');
  const reportsDir = path.join(__dirname, '..', 'reportes');
  
  if (!fs.existsSync(reportsDir)) {
    throw new Error(`Directorio no encontrado: ${reportsDir}`);
  }
  
  const candidates = [];
  
  // Buscar en subdirectorios
  fs.readdirSync(reportsDir)
    .filter(f => fs.statSync(path.join(reportsDir, f)).isDirectory())
    .forEach(dir => {
      const fullDir = path.join(reportsDir, dir);
      fs.readdirSync(fullDir)
        .filter(f => f.endsWith('.json'))
        .forEach(f => candidates.push(path.join(fullDir, f)));
    });
  
  if (!candidates.length) {
    throw new Error('No se encontraron archivos JSON en reportes/');
  }
  
  candidates.sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);
  return candidates[0];
}

/**
 * Genera interpretación automática ejecutiva basada en métricas
 * REGLAS DE NEGOCIO:
 * - failed > 0: GO_CON_RIESGO o NO_GO (según cantidad)
 * - failed = 0 y flaky > 0: GO (con advertencia de flakiness)
 * - failed = 0 y flaky = 0: GO_ESTABLE
 */
function buildInterpretacion(summaryGlobal) {
  const failed = summaryGlobal.failedFinal || 0;
  const flaky = summaryGlobal.flakyFinal || 0;
  const flakyRate = summaryGlobal.tasaFlaky || 0;
  const persistencia = summaryGlobal.ratioPersistenciaFuncional || 0;
  const testsTotal = summaryGlobal.testsUnicos || 0;
  
  let estado = 'GO_ESTABLE';
  let riesgo = 'BAJO';
  let resumenEjecutivo = '';
  
  if (failed > 0) {
    // Escenario 2: Hay fallos definitivos
    estado = failed > 3 ? 'NO_GO' : 'GO_CON_RIESGO';
    riesgo = failed > 3 ? 'ALTO' : 'MEDIO';
    resumenEjecutivo = `La ejecución presentó ${failed} fallos definitivos sobre ${testsTotal} tests, con ${flaky} casos adicionales clasificados como flaky. El resultado no alcanza estabilidad plena y requiere corrección antes de considerar aprobación técnica.`;
  } else if (flaky > 0) {
    // Escenario 1: 100% éxito final pero con flakiness (TU CASO ACTUAL)
    estado = 'GO';
    riesgo = flakyRate > 15 ? 'MEDIO' : 'BAJO';
    resumenEjecutivo = `La ejecución alcanzó 100% de éxito final (${testsTotal}/${testsTotal} tests), sin fallos definitivos. Sin embargo, ${flaky} casos (${flakyRate}%) presentaron comportamiento flaky, evidenciando inestabilidad recuperable bajo concurrencia funcional que debe ser tratada como deuda técnica.`;
  } else {
    // Escenario 3: Éxito limpio perfecto
    resumenEjecutivo = `La ejecución alcanzó éxito limpio: ${testsTotal} tests pasaron al primer intento, sin fallos definitivos ni flakiness.`;
  }
  
  // Construir hallazgos clave automáticos
  const hallazgosClave = [];
  
  if (failed === 0) {
    hallazgosClave.push('✅ No se detectaron fallos definitivos. Todos los tests finalizaron exitosamente.');
  } else {
    hallazgosClave.push(`❌ Se detectaron ${failed} fallos definitivos que bloquean la aprobación limpia.`);
  }
  
  if (flaky > 0) {
    hallazgosClave.push(`⚠️ ${flaky} tests fueron clasificados como flaky (tasa: ${flakyRate}%), indicando inestabilidad operativa.`);
  } else {
    hallazgosClave.push('✅ Ningún test requirió reintento (sin flakiness).');
  }
  
  if (persistencia >= 95) {
    hallazgosClave.push(`✅ Persistencia funcional excelente: ${persistencia}% de tests con registro confirmado.`);
  } else if (persistencia >= 80) {
    hallazgosClave.push(`⚠️ Persistencia funcional aceptable: ${persistencia}%, pero con margen de mejora.`);
  } else {
    hallazgosClave.push(`❌ Persistencia funcional baja: ${persistencia}%. Revisar integridad de datos.`);
  }
  
  // Recomendaciones automáticas
  const recomendaciones = [];
  
  if (flaky > 0) {
    recomendaciones.push(`Analizar causas de flakiness en ${flaky} tests: revisar sincronización UI/API, selectores, timing y estabilidad de entorno.`);
    recomendaciones.push('Monitorear tendencia de flakiness en corridas equivalentes para detectar regresión de estabilidad.');
  }
  
  if (failed > 0) {
    recomendaciones.push(`Priorizar corrección de ${failed} fallos definitivos antes de pasar a producción.`);
    recomendaciones.push('Validar fixes en ambiente QA antes de mergear cambios.');
  }
  
  if (flaky === 0 && failed === 0) {
    recomendaciones.push('Mantener prácticas actuales; el flujo está estable y confiable.');
  }
  
  return {
    estado,
    riesgo,
    resumenEjecutivo,
    hallazgosClave,
    recomendaciones
  };
}

/**
 * Construye el JSON canónico funcional (pf-report.json)
 * Fuente única de verdad para HTML, Word, Excel y Slack
 */
function buildPfReport(reader, dual, sourceJsonPath, outputPath) {
  const now = new Date().toISOString();
  const runId = reader.runId || `PF_${now.replace(/[:.]/g, '-')}`;
  const sourceJson = sourceJsonPath ? path.resolve(sourceJsonPath) : null;
  const canonicalJson = outputPath ? path.resolve(outputPath) : null;
  const inferredCase = inferCaseMetadata(sourceJson);
  
  // Calcular métricas globales desde dualView (Playwright semantics)
  const passedLimpios = dual.testListFinal.filter(t => t.finalStatus === 'passed' && !t.hadRetries).length;
  const flakyFinal = dual.testListFinal.filter(t => t.hadRetries).length;
  const passedFinal = dual.testListFinal.filter(t => t.finalStatus === 'passed' || t.finalStatus === 'flaky').length;
  const failedFinal = dual.testListFinal.filter(t => t.finalStatus === 'failed' || t.finalStatus === 'timedOut').length;
  
  // Extraer hallazgos técnicos clasificados
  const hallazgosTecnicos = [];
  const erroresPorCategoria = {};
  dual.attemptList.forEach(a => {
    if (a.errorCategory && a.errorCategory !== 'OTRO') {
      erroresPorCategoria[a.errorCategory] = (erroresPorCategoria[a.errorCategory] || 0) + 1;
    }
  });
  
  Object.entries(erroresPorCategoria).forEach(([cat, count]) => {
    const severidad = ['UI', 'PERSISTENCIA'].includes(cat) || count > 2 ? 'ALTA' : 'MEDIA';
    hallazgosTecnicos.push({
      categoria: cat,
      tipo: 'ErrorClasificado',
      descripcion: `${count} ocurrencias de errores tipo ${cat}`,
      severidad,
      audiencia: dual.attemptList.find(a => a.errorCategory === cat)?.errorAudience || 'QA'
    });
  });
  
  const entidadCrearErrFailed = dual.attemptList.filter(a => {
    const raw = [a.errorPattern, ...(a.errors || [])].join(' ').toLowerCase();
    return raw.includes('entidad/crear') && raw.includes('net::err_failed');
  });
  const cp01NetErrCausa = String(process.env.REGINSA_CP01_NET_ERR_FAILED_CAUSA || '').trim();
  const cp01NetErrFuente = String(process.env.REGINSA_CP01_NET_ERR_FAILED_FUENTE || '').trim();
  if (inferredCase.casoId === '01' && entidadCrearErrFailed.length > 0) {
    const causaTexto = cp01NetErrCausa
      ? 'Causa indicada por el proyecto: ' + cp01NetErrCausa + (cp01NetErrFuente ? ' (fuente: ' + cp01NetErrFuente + ')' : '') + '.'
      : 'Causa no parametrizada por QA; requiere análisis del equipo responsable del sistema.';
    hallazgosTecnicos.push({
      id: 'HAL-CP01-ENTIDAD-CREAR-NET-ERR-FAILED',
      categoria: 'API',
      tipo: 'Hallazgo funcional/técnico CP-REG-01',
      severidad: 'ALTA',
      audiencia: 'Backend/Infraestructura/Frontend',
      descripcion: `CP-REG-01 no completó todos los registros. Se confirmaron ${dual.integridad.registrosUnicos}/${dual.integridad.testsUnicos}. Las fallas no corresponden a duplicidad de RUC ni datos inválidos; corresponden a abortos de red en Entidad/Crear con net::ERR_FAILED, sin código HTTP de respuesta. ${causaTexto}`,
      recomendacion: 'Endpoint Entidad/Crear debe responder siempre con HTTP controlado (200, 400, 409, 429, 500, etc.) y no terminar como net::ERR_FAILED sin respuesta. Implementar logs por correlación con RUC, usuario, IP recibida, timestamp, request id y causa exacta del rechazo/corte. Si existe rate limit, sesión, proxy, firewall o límite por IP/usuario, devolver 429 Too Many Requests o mensaje claro. En Angular, bloquear doble envío, mostrar estado de carga y manejar error técnico visible. Revisar Proxy/WAF/IIS/API Gateway si está cerrando conexiones cuando cambia X-Forwarded-For, se alternan usuarios o se hacen altas seguidas.',
      criterioCierre: 'Mantener este hallazgo visible hasta que CP-REG-01 complete los registros esperados sin net::ERR_FAILED o hasta que el sistema devuelva errores HTTP controlados y trazables.'
    });
  }
    // Detectar regresiones (tests que fallaron en último intento)
  const regresiones = dual.testListFinal
    .filter(t => t.finalStatus === 'failed' || t.finalStatus === 'timedOut')
    .map(t => ({
      testId: t.testId,
      errorPattern: t.errorPattern,
      audiencia: t.errorAudience,
      ip: t.assignedIp
    }));
  
  // Construir summaryGlobal con Playwright semantics
  const testsFuncionales = dual.integridad.testsFuncionales ?? dual.integridad.testsUnicos;
  const ratioPersistenciaFuncional =
    dual.integridad.ratioPersistenciaFuncional ?? dual.integridad.ratioPersistenciaUnica;
  const summaryGlobal = {
    testsUnicos: dual.integridad.testsUnicos,
    testsFuncionales,
    evidenciasFuncionales: dual.integridad.evidenciasFuncionales ?? dual.integridad.registrosUnicos,
    intentosTotales: dual.integridad.intentosTotal,
    retriesTotales: dual.integridad.retriesTotal,
    passedLimpios,
    flakyFinal,
    passedFinal,
    failedFinal,
    registrosCreados: dual.integridad.registrosUnicos,
    ratioPersistenciaFuncional: parseFloat(ratioPersistenciaFuncional.toFixed(2)),
    tasaExitoFinal: dual.integridad.testsUnicos > 0 
      ? parseFloat(((passedFinal / dual.integridad.testsUnicos) * 100).toFixed(2)) 
      : 0,
    tasaExitoLimpio: dual.integridad.testsUnicos > 0
      ? parseFloat(((passedLimpios / dual.integridad.testsUnicos) * 100).toFixed(2))
      : 0,
    tasaFlaky: dual.integridad.testsUnicos > 0 
      ? parseFloat(((flakyFinal / dual.integridad.testsUnicos) * 100).toFixed(2)) 
      : 0
  };
  
  // Generar interpretación automática ejecutiva
  const interpretacion = buildInterpretacion(summaryGlobal);
  const functionalWorkers = [
    ...new Set(
      (dual.testListFinal || [])
        .filter(test => test.isFunctionalTest || test.hasFunctionalEvidence)
        .map(test => test.workerIndex)
        .filter(workerIndex => Number.isFinite(workerIndex))
    )
  ];
  
  return {
    tipo: 'funcional',
    schemaVersion: '1.0.0',
    metadata: {
      runId,
      timestamp: now,
      proyecto: 'REGINSA_PF_UI',
      entorno: 'QA',
      casoId: inferredCase.casoId,
      caso: inferredCase.caso,
      casoDescripcion: inferredCase.casoDescripcion,
      escenario: inferredCase.escenario,
      sourceJson,
      canonicalJson,
      sourceDir: sourceJson ? path.dirname(sourceJson) : null,
      generatedBy: 'tools/validate-dual-view.js',
      ejecucion: {
        modo: 'concurrente-multi-ip',
        workers: functionalWorkers.length || reader.functionalWorkerList?.length || 0,
        ipsConfiguradas: dual.ipSummary?.length || 0
      }
    },
    summaryGlobal,
    interpretacionAutomatica: interpretacion,
    dualView: {
      testListFinal: dual.testListFinal.slice(0, 100),
      attemptList: dual.attemptList.slice(0, 200),
      ipSummary: dual.ipSummary,
      endpointSummary: dual.endpointSummary,
      integridad: dual.integridad
    },
    regresionVisual: {
      habilitada: false,
      summary: {
        baselinesComparados: 0,
        mismatches: 0,
        testsAfectados: 0
      },
      details: []
    },
    hallazgosTecnicos,
    hallazgosVigentes: buildHallazgosVigentes(),
    regresionesFuncionales: regresiones,
    defectos: [],
    accionesRecomendadas: interpretacion.recomendaciones
  };
}

function inferCaseMetadata(sourceJson) {
  const text = String(sourceJson || '');
  const normalized = text.replace(/\\/g, '/');
  const runFolder = normalized.split('/').find(part => /^CP-REG-\d+_PF_/i.test(part)) || '';
  const match = /^CP-REG-(\d+)_PF_([^_]+)_RUN_/i.exec(runFolder);
  const casoId = match?.[1] || '00';
  const escenario = match?.[2] || 'multi_ip';
  const descriptions = {
    '01': 'agregar_administrado',
    '02': 'registrar_sancion',
    '04': 'reconsiderar_con_sanciones',
  };
  return {
    casoId,
    caso: `CP-REG-${casoId}`,
    casoDescripcion: descriptions[casoId] || 'funcional_reginsa',
    escenario,
  };
}

function buildHallazgosVigentes() {
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

main();
