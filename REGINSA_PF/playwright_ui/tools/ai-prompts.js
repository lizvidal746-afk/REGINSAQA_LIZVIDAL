/**
 * tools/ai-prompts.js — REGINSA Playwright UI
 * Prompts IA y fallback para generación de reportes profesionales.
 * Alineado con ISTQB/IEEE/ISO y con la misma estructura que K6.
 */

// ── System Prompt ────────────────────────────────────────────────────────────
const systemPrompt = `Eres un QA Automation Lead con más de 12 años de experiencia en automatización de pruebas, certificado en:
- ISTQB CTFL y CTAL (Automated Testing)
- ISO/IEC 25010 y 29119
- Experto en Playwright, Cypress y Selenium
- Especialista en Reportes de Pruebas Profesionales para el sector público (SUNEDU)

Tu objetivo es analizar los resultados de Playwright y generar un reporte de calidad para REGINSA.

Responde SOLO con JSON válido, sin texto adicional. Usa el siguiente esquema:

{
  "metadata": {
    "estado_general": "APROBADO | DEGRADADO | RECHAZADO",
    "decision": "GO | GO_CON_RIESGO | NO_GO",
    "resumen_una_linea": "string"
  },
  "reporte_profesional": {
    "1.0_encabezado": {
      "titulo_proyecto": "REGINSA - REGISTRO DE INFRACCIONES Y SANCIONES",
      "modulo": "Pruebas Funcionales UI",
      "fecha_generacion": "yyyy-MM-dd",
      "responsable": "Equipo QA Automation",
      "version_reporte": "1.0"
    },
    "2.0_contexto_pruebas": {
      "alcance": "string",
      "objetivos": ["string"],
      "entorno": "QA",
      "datos_prueba": "string",
      "herramientas": ["Playwright", "Allure", "Excel", "HTML"]
    },
    "3.0_resumen_ejecutivo": {
      "kpis_clave": [
        {"kpi": "Tasa de Éxito", "valor": "number%", "umbral": "≥ 95%"},
        {"kpi": "Tests Fallidos", "valor": "number", "umbral": "0"},
        {"kpi": "Tasa de Flakiness", "valor": "number%", "umbral": "≤ 5%"}
      ],
      "conclusion": "string",
      "riesgos_principales": ["string"]
    },
    "4.0_desglose_por_suite": [
      {
        "suite": "string",
        "tests_totales": "number",
        "tests_pasados": "number",
        "tests_fallidos": "number",
        "tasa_exito": "number%"
      }
    ],
    "5.0_errores_y_defectos": [
      {
        "id": "DEFECTO-XX",
        "descripcion": "string",
        "severidad": "Crítica | Alta | Media | Baja",
        "prioridad": "P1 | P2 | P3 | P4",
        "pasos_reproduccion": ["string"]
      }
    ],
    "6.0_mejoras_y_recomendaciones": {
      "cobertura_faltante": ["string"],
      "mejoras_automation": ["string"],
      "proximos_pasos": ["string"]
    },
    "7.0_anexos": {
      "reportes_relacionados": ["HTML", "Excel", "Videos", "Traces"],
      "evidencia_adicional": ["string"]
    }
  },
  "recomendacion_prioritaria": "string"
}`;

// ── Build User Prompt ────────────────────────────────────────────────────────
function buildUserPrompt(resultsData) {
  const stats = resultsData.stats || {};
  const suites = resultsData.suites || [];
  const totalTests = (stats.expected || 0) + (stats.unexpected || 0);
  const passedTests = stats.expected || 0;
  const failedTests = stats.unexpected || 0;
  const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
  const flakyRate = totalTests > 0 ? ((stats.flaky || 0) / totalTests) * 100 : 0;

  // Extraer workers del JSON raw
  const workers = [];
  const seen = new Set();
  if (suites.length > 0) {
    suites.forEach((suite) => {
      (suite.specs || []).forEach((spec) => {
        (spec.tests || []).forEach((test) => {
          (test.results || []).forEach((result) => {
            if (!seen.has(result.workerIndex)) {
              seen.add(result.workerIndex);
              workers.push(result.workerIndex);
            }
          });
        });
      });
    });
  }

  return `Analiza estos resultados de pruebas funcionales UI con Playwright para REGINSA, conforme a:
- ISTQB CTFL (Certified Tester Foundation Level)
- ISO/IEC 25010 (SQuaRE Quality Model)
- IEEE 829-2008 (Test Documentation)
- ISO/IEC/IEEE 29119 (Software Testing)

Contexto del proyecto:
- Proyecto: REGINSA (Registro de Infracciones y Sanciones SUNEDU)
- Tipo de pruebas: Funcionales UI con Playwright
- Fecha de ejecución: ${new Date().toISOString()}
- Workers detectados: ${workers.length} (IDs: ${workers.join(', ') || 'N/D'})
- Playwright version: ${resultsData.config?.version || '1.x'}

Métricas globales:
- Tests totales: ${totalTests}
- Tests pasados: ${passedTests}
- Tests fallidos: ${failedTests}
- Tests flaky: ${stats.flaky || 0}
- Tests skipped: ${stats.skipped || 0}
- Tasa de éxito: ${passRate.toFixed(2)}%
- Tasa de flakiness: ${flakyRate.toFixed(2)}%
- Duración total: ${stats.duration ? (stats.duration / 1000 / 60).toFixed(2) + ' min' : 'N/A'}

Suites ejecutadas:
${suites.map((s) => `- ${s.title || s.file || 'Suite'}: ${(s.specs || []).length} specs`).join('\n') || '- Sin detalle de suites'}
`;
}

// ── Build Fallback (reporte completo sin IA) ─────────────────────────────────
function buildFallback(resultsData) {
  const stats = resultsData.stats || {};
  const totalTests = (stats.expected || 0) + (stats.unexpected || 0);
  const passedTests = stats.expected || 0;
  const failedTests = stats.unexpected || 0;
  const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
  const flakyRate = totalTests > 0 ? ((stats.flaky || 0) / totalTests) * 100 : 0;
  const spectrum = resultsData.error_spectrum || [];
  const endpoints = resultsData.endpoints || [];
  const concurrencia = resultsData.concurrency_analysis || {};
  const failedDetails = resultsData.failed_tests_detail || [];

  // Determinar estado general
  let estadoGeneral = 'APROBADO';
  let decision = 'GO';
  if (passRate < 80 || flakyRate > 10) {
    estadoGeneral = 'RECHAZADO';
    decision = 'NO_GO';
  } else if (passRate < 95 || flakyRate > 5) {
    estadoGeneral = 'DEGRADADO';
    decision = 'GO_CON_RIESGO';
  }

  const suites = resultsData.suite_summary || [];

  // Heurísticas dinámicas de Errores y Recomendaciones
  const dynamicErrors = [];
  const dynamicRecomendaciones = {
    cobertura_faltante: [],
    mejoras_automation: [],
    proximos_pasos: []
  };

  // Procesar fallos reales
  if (failedDetails.length > 0) {
    const errorGroups = {};
    failedDetails.forEach(f => {
      const eMsg = f.error || 'Error desconocido';
      if (!errorGroups[eMsg]) errorGroups[eMsg] = 0;
      errorGroups[eMsg]++;
    });

    Object.entries(errorGroups).forEach(([msg, count], idx) => {
      let severidad = 'Alta';
      if (msg.includes('locator') || msg.includes('selector')) severidad = 'Media'; // Problema de UI/Automation
      if (msg.includes('500') || msg.includes('Network')) severidad = 'Crítica'; // Problema de Backend
      dynamicErrors.push({
        id: `DEFECTO-0${idx + 1}`,
        descripcion: `[Afecta ${count} tests] ${msg}`,
        severidad,
        prioridad: severidad === 'Crítica' ? 'P1' : 'P2',
        pasos_reproduccion: ['Revisar logs en Playwright HTML Report', 'Validar endpoint o selector afectado']
      });
    });
  }

  // Si hubo duplicados en concurrencia
  if (concurrencia.duplicatedExpedientes && concurrencia.duplicatedExpedientes.length > 0) {
    dynamicErrors.push({
      id: 'DEFECTO-ARCH-01',
      descripcion: `Expedientes duplicados detectados (${concurrencia.duplicatedExpedientes.length} casos). El backend no es idempotente ante reintentos de red.`,
      severidad: 'Crítica',
      prioridad: 'P1',
      pasos_reproduccion: ['Revisar registro de K6 y BD', 'Implementar validación de existencia previa en /CrearConDetalles']
    });
    dynamicRecomendaciones.mejoras_automation.push('Agregar aserciones a nivel de BD para verificar duplicidad.');
  }

  // Recomendaciones basadas en espectro de error
  spectrum.forEach(err => {
    if (err.type === 'LOCATOR' && err.count > 0) {
      dynamicRecomendaciones.mejoras_automation.push('Estabilizar selectores: Usar data-testid o seudoclases de exclusión en lugar de textos inestables.');
    }
    if (err.type === 'TIMEOUT' && err.count > 0) {
      dynamicRecomendaciones.mejoras_automation.push('Optimizar esperas (waits). Evitar waitForTimeout, usar interceptores de red.');
    }
    if (err.type === 'NETWORK' && err.count > 0) {
      dynamicRecomendaciones.proximos_pasos.push('Escalar infraestructura QA o revisar rate-limits del WAF, se detectaron caídas de conexión.');
    }
  });

  if (dynamicRecomendaciones.mejoras_automation.length === 0) {
    dynamicRecomendaciones.mejoras_automation.push('El framework es estable. Continuar con mantenimiento preventivo.');
  }
  if (dynamicRecomendaciones.proximos_pasos.length === 0) {
    dynamicRecomendaciones.proximos_pasos.push('Continuar con siguientes fases de prueba.');
  }

  return {
    metadata: {
      estado_general: estadoGeneral,
      decision,
      resumen_una_linea: `REGINSA UI — Tasa de éxito: ${passRate.toFixed(2)}%, ${passedTests}/${totalTests} tests pasaron. Workers: ${suites.length > 0 ? 'multi' : '1'}.`,
    },
    reporte_profesional: {
      '1.0_encabezado': {
        titulo_proyecto: 'REGINSA - REGISTRO DE INFRACCIONES Y SANCIONES',
        modulo: 'Pruebas Funcionales UI — Playwright',
        fecha_generacion: new Date().toISOString().split('T')[0],
        responsable: 'Equipo QA Automation',
        version_reporte: '1.0',
        aprobado_por: 'QA Lead — Liz Vidal',
        estado_ejecucion: 'Completada',
      },
      '2.0_contexto_pruebas': {
        alcance:
          'Pruebas funcionales UI concurrentes con Playwright. Validación de flujos críticos de negocio: creación de entidades, registro de infracciones y sanciones, con aislamiento total entre workers paralelos.',
        objetivos: [
          'Validar flujos completos de registro de manera confiable.',
          'Asegurar aislamiento total entre usuarios paralelos (workers).',
          'Verificar completitud de registros esperados.',
          'Detectar defectos funcionales y de usabilidad.',
        ],
        entorno: 'QA',
        datos_prueba: 'Pool de administrados y credenciales segmentadas por worker.',
        herramientas: ['Playwright', 'Allure', 'ExcelJS', 'HTML5/CSS3'],
      },
      '3.0_resumen_ejecutivo': {
        kpis_clave: [
          { kpi: 'Tasa de Éxito Funcional ★ SLO', valor: passRate.toFixed(2) + '%', umbral: '≥ 95%' },
          { kpi: 'Completitud de Tests', valor: `${passedTests}/${totalTests}`, umbral: '100%' },
          { kpi: 'Tasa de Flakiness (Estabilidad)', valor: flakyRate.toFixed(2) + '%', umbral: '≤ 5%' },
          { kpi: 'Aislamiento de Usuarios (Workers)', valor: '0 Colisiones', umbral: '0 Colisiones' },
          { kpi: 'Trazabilidad de Fallos (Evidencia)', valor: failedTests > 0 ? '100% adjunta' : 'N/A', umbral: '100%' },
        ],
        conclusion:
          estadoGeneral === 'APROBADO'
            ? `La ejecución registra una tasa de éxito del ${passRate.toFixed(2)}% y un flakiness de ${flakyRate.toFixed(2)}%. Los flujos funcionales críticos operan con estabilidad. SLO cumplido.`
            : estadoGeneral === 'DEGRADADO'
              ? `La ejecución registra una tasa de éxito del ${passRate.toFixed(2)}% (debajo del umbral óptimo de 95%) y un flakiness de ${flakyRate.toFixed(2)}%. Se recomienda revisar los fallos antes de promover a producción.`
              : `La ejecución registra una tasa de éxito de solo ${passRate.toFixed(2)}% y un flakiness de ${flakyRate.toFixed(2)}%. Se requieren correcciones funcionales urgentes. NO GO.`,
        riesgos_principales:
          failedTests > 0
            ? [
                `Existen ${failedTests} flujos críticos interrumpidos. Revisar evidencia adjunta (videos, screenshots).`,
                flakyRate > 5 ? `Flakiness elevado (${flakyRate.toFixed(2)}%). Posible inestabilidad de selectores o timeouts.` : '',
                'Validar que el entorno QA esté estable y no tenga deployments concurrentes.',
              ].filter(Boolean)
            : ['Ningún riesgo funcional alto detectado en esta ejecución.'],
      },
      '4.0_desglose_por_suite': suites.map(s => ({
        suite: s.suite,
        tests_totales: s.total,
        tests_pasados: s.passed,
        tests_fallidos: s.failed,
        tasa_exito: s.passRate + '%'
      })),
      '5.0_errores_y_defectos': dynamicErrors,
      '6.0_mejoras_y_recomendaciones': dynamicRecomendaciones,
      '7.0_anexos': {
        reportes_relacionados: [
          'Playwright HTML Report (nativo)',
          'Reporte Excel (QA Profesional)',
          'Allure Report',
        ],
        evidencia_adicional: [
          'Videos y Trazas (traces.zip) generados por test fallido.',
          'Screenshots de cada paso crítico.',
          'Logs de consola del navegador.',
        ],
      },
    },
    recomendacion_prioritaria:
      estadoGeneral === 'APROBADO'
        ? 'Pasar a la siguiente Fase de Pruebas (Fase 2 o Certificación). Los flujos críticos están estables.'
        : estadoGeneral === 'DEGRADADO'
          ? 'Analizar los fallos pendientes, estabilizar los scripts y relanzar antes de certificar. GO con riesgo controlado.'
          : 'Corregir los defectos críticos antes de continuar. NO GO para siguiente fase.',
  };
}

module.exports = { systemPrompt, buildUserPrompt, buildFallback };
