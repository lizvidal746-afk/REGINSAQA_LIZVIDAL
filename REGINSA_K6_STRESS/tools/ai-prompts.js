function buildUserPrompt(metrics) {
  const gm = metrics.global_metrics || {};
  const tc = metrics.test_context || {};
  const lb = metrics.latency_breakdown || {};
  const eb = metrics.error_budget || {};
  const endpoints = metrics.endpoints || [];
  const statusCodes = metrics.status_codes || [];
  const counters = metrics.custom_counters || {};
  const ips = metrics.ip_summary || [];

  return `Analiza estas métricas de rendimiento SI058:

Contexto:
- Run: ${tc.name}
- Run ID: ${tc.run_id}
- Duración: ${tc.duration}
- VUs max: ${tc.vus_max}
- IP origen: ${tc.source_ip}
- SLO p95: ${tc.slo_latency_ms}ms
- SLO error rate: ${(tc.slo_error_rate * 100).toFixed(2)}%

Métricas globales:
- Total requests: ${gm.total_requests}
- RPS: ${gm.rps}
- p50: ${gm.duration_p50}ms
- p90: ${gm.duration_p90}ms
- p95: ${gm.duration_p95}ms
- p99: ${gm.duration_p99}ms
- avg: ${gm.duration_avg}ms
- error rate: ${((gm.error_rate || 0) * 100).toFixed(2)}%
- checks rate: ${((gm.checks_rate || 0) * 100).toFixed(2)}%
- APDEX: ${gm.apdex}
- SLO passed: ${gm.slo_passed}
- Estado: ${gm.status}

Latencia:
- TTFB avg/p95: ${lb.ttfb_avg_ms}ms / ${lb.ttfb_p95_ms}ms
- TLS avg/p95: ${lb.tls_avg_ms}ms / ${lb.tls_p95_ms}ms
- Blocked avg/p95: ${lb.blocked_avg_ms}ms / ${lb.blocked_p95_ms}ms
- Connecting avg: ${lb.connecting_avg_ms}ms
- Sending avg: ${lb.sending_avg_ms}ms
- Receiving avg: ${lb.receiving_avg_ms}ms

Error budget:
- Consumido: ${eb.consumed_pct}%
- Restante: ${eb.remaining_pct}%
- Margen: ${eb.margin_ms}ms

Contadores:
- 429/rate limit: ${counters.rate_limited_requests}
- business limits: ${counters.business_limit_hits}
- unexpected errors: ${counters.unexpected_errors}
- timeout errors: ${counters.timeout_errors}

Status codes:
${statusCodes.map((s) => `- HTTP ${s.status}: ${s.count}`).join('\n') || '- Sin desglose de status'}

Endpoints:
${endpoints.map((ep) => `- ${ep.endpoint}: reqs=${ep.reqs || ep.totalRequests}, p95=${Math.round(ep.p95 || 0)}ms, p99=${Math.round(ep.p99 || 0)}ms, error_rate=${((ep.errorRate || 0) * 100).toFixed(2)}%, checks=${ep.successRate}%`).join('\n') || '- Sin endpoints'}

Resumen por IP:
${ips.map((ip) => `- ${ip.ip}: reqs=${ip.requests}, p95=${ip.p95}ms, p99=${ip.p99}ms, error_rate=${(ip.error_rate * 100).toFixed(2)}%, ttfb=${ip.ttfb_avg}ms`).join('\n') || '- Sin métricas por IP'}`;
}

const systemPrompt = `Eres un equipo senior de performance engineering para SUNEDU SI058.

Debes analizar resultados k6 con criterios ISTQB Performance Testing, ISO/IEC 25010/25023 y Google SRE.

Responde SOLO con JSON válido. No uses markdown. No agregues texto fuera del JSON.

Esquema requerido:
{
  "metadata": {
    "estado_general": "Aprobado | Degradado | Rechazado",
    "decision": "GO | GO_CON_RIESGO | NO_GO",
    "resumen_una_linea": "string"
  },
  "analisis_ejecutivo": {
    "conclusion": "string",
    "riesgos": ["string"],
    "decision_go_no_go": "string",
    "proximos_pasos": ["string"]
  },
  "analisis_tecnico_profundo": {
    "cuello_probable": "cliente | red | WAF | backend | base_datos | datos_prueba | indeterminado",
    "hipotesis_priorizadas": [{"hipotesis": "string", "evidencia": "string", "prioridad": "alta | media | baja"}],
    "metricas_clave": ["string"],
    "acciones_recomendadas": ["string"]
  },
  "revision_collapse": {
    "aplica": true,
    "aprobacion_requerida": true,
    "precondiciones_faltantes": ["string"],
    "criterios_abort": ["string"],
    "evidencia_esperada": ["string"]
  },
  "mejora_plan_pruebas": {
    "cobertura_faltante": ["string"],
    "duplicidades_o_riesgos": ["string"],
    "orden_recomendado": ["string"],
    "casos_con_aprobacion_formal": ["string"]
  },
  "comparacion_carnet_grados": {
    "disponible": true,
    "endpoint_mas_degradado": "carnet | grados | empate | no_disponible",
    "evidencia": ["string"]
  },
  "recomendacion_prioritaria": "string"
}`;

function buildFallback(metrics) {
  const gm = metrics.global_metrics || {};
  const eb = metrics.error_budget || {};
  const endpoints = metrics.endpoints || [];
  const counters = metrics.custom_counters || {};
  const status =
    gm.slo_passed && (gm.apdex || 0) >= 0.9 ? 'Aprobado' : (gm.duration_p95 || 0) < 1800 ? 'Degradado' : 'Rechazado';
  const decision = status === 'Aprobado' ? 'GO' : status === 'Degradado' ? 'GO_CON_RIESGO' : 'NO_GO';
  const hasCarnet = endpoints.some((e) => e.endpoint === 'carnet_consulta');
  const hasGrados = endpoints.some((e) => e.endpoint === 'grados_consulta');
  const endpointMasDegradado = (() => {
    const carnet = endpoints.find((e) => e.endpoint === 'carnet_consulta');
    const grados = endpoints.find((e) => e.endpoint === 'grados_consulta');
    if (!carnet || !grados) return 'no_disponible';
    const cScore = (carnet.p95 || 0) + (carnet.errorRate || 0) * 10000;
    const gScore = (grados.p95 || 0) + (grados.errorRate || 0) * 10000;
    if (Math.abs(cScore - gScore) < 50) return 'empate';
    return cScore > gScore ? 'carnet' : 'grados';
  })();

  return {
    metadata: {
      estado_general: status,
      decision,
      resumen_una_linea: `p95=${gm.duration_p95}ms, p99=${gm.duration_p99}ms, error_rate=${((gm.error_rate || 0) * 100).toFixed(2)}%, APDEX=${gm.apdex}.`,
    },
    analisis_ejecutivo: {
      conclusion: `El run ${metrics.test_context?.name} registra p95=${gm.duration_p95}ms, error_rate=${((gm.error_rate || 0) * 100).toFixed(2)}% y APDEX=${gm.apdex}. Estado heuristico: ${status}.`,
      riesgos: [
        counters.rate_limited_requests > 0
          ? 'Se observaron eventos 429/rate limit.'
          : 'No hay evidencia agregada de 429 en contadores custom.',
        counters.timeout_errors > 0 ? 'Se observaron timeouts.' : 'No hay timeouts agregados en contadores custom.',
      ],
      decision_go_no_go: decision,
      proximos_pasos:
        decision === 'GO'
          ? ['Ejecutar el siguiente nivel de carga controlado.', 'Monitorear p95, p99, 5xx y TTFB.']
          : ['Revisar errores y TTFB antes de escalar.', 'Repetir baseline despues de correcciones.'],
    },
    analisis_tecnico_profundo: {
      cuello_probable: (metrics.latency_breakdown?.ttfb_avg_ms || 0) > 500 ? 'backend' : 'indeterminado',
      hipotesis_priorizadas: [
        {
          hipotesis: 'Backend/BD como posible contribuyente si TTFB crece con VUs.',
          evidencia: `TTFB avg=${metrics.latency_breakdown?.ttfb_avg_ms}ms, p95=${metrics.latency_breakdown?.ttfb_p95_ms}ms.`,
          prioridad: 'media',
        },
        {
          hipotesis: 'WAF/rate limit si aparecen 429.',
          evidencia: `rate_limited_requests=${counters.rate_limited_requests}.`,
          prioridad: counters.rate_limited_requests > 0 ? 'alta' : 'baja',
        },
      ],
      metricas_clave: [
        `p95=${gm.duration_p95}ms`,
        `p99=${gm.duration_p99}ms`,
        `error_rate=${((gm.error_rate || 0) * 100).toFixed(2)}%`,
        `APDEX=${gm.apdex}`,
        `budget_restante=${eb.remaining_pct}%`,
      ],
      acciones_recomendadas: [
        'Cruzar resultado con logs de API/gateway/BD.',
        'Comparar por endpoint e IP antes de concluir causa raiz.',
      ],
    },
    revision_collapse: {
      aplica: String(metrics.test_context?.name || '')
        .toLowerCase()
        .includes('collapse'),
      aprobacion_requerida: true,
      precondiciones_faltantes: ['Confirmar ventana autorizada.', 'Confirmar monitoreo backend y plan de abortar.'],
      criterios_abort: ['5xx sostenidos > 60s.', 'CPU/BD saturada sin recuperacion.', 'Impacto fuera de QA.'],
      evidencia_esperada: ['JSON k6.', 'HTML.', 'Excel/Word.', 'Logs gateway/API/BD.', 'Tiempo de recuperacion.'],
    },
    mejora_plan_pruebas: {
      cobertura_faltante: [
        'Soak/endurance si no se ejecuto.',
        'Spike si no se ejecuto.',
        'Carga mixta realista si solo hay endpoints aislados.',
      ],
      duplicidades_o_riesgos: [
        'No confundir cp03 con collapse: tienen objetivos distintos.',
        'No aplicar thresholds de smoke a pruebas destructivas.',
      ],
      orden_recomendado: [
        'smoke',
        'audit multi-IP',
        'baseline/load',
        'stress',
        'spike',
        'soak',
        'WAF',
        'cp03',
        'collapse',
      ],
      casos_con_aprobacion_formal: ['cp01 WAF', 'cp03 saturacion', 'collapse'],
    },
    comparacion_carnet_grados: {
      disponible: hasCarnet && hasGrados,
      endpoint_mas_degradado: endpointMasDegradado,
      evidencia: endpoints.map(
        (e) => `${e.endpoint}: p95=${Math.round(e.p95 || 0)}ms, error_rate=${((e.errorRate || 0) * 100).toFixed(2)}%`,
      ),
    },
    recomendacion_prioritaria:
      decision === 'GO'
        ? 'Escalar ordenadamente al siguiente escenario con monitoreo backend.'
        : 'Corregir o explicar degradacion antes de aumentar carga.',
  };
}

module.exports = { systemPrompt, buildUserPrompt, buildFallback };
