const fs = require('fs');
const path = require('path');
const { PlaywrightReader, resolveTargetJson } = require('./lib/playwright-reader');

async function main() {
  const projectRoot = path.resolve(__dirname, '../..');
  const defaultTechnicalDir = path.join(projectRoot, 'reportes', '_technical');
  const allureResultsDir = process.env.REGINSA_ALLURE_RESULTS_DIR || path.join(defaultTechnicalDir, 'allure-results');
  const reportsDir = process.env.REGINSA_PLAYWRIGHT_REPORT_DIR || path.join(defaultTechnicalDir, 'playwright-report');
  
  if (!fs.existsSync(allureResultsDir)) {
    console.log(`[Allure Post-Processor] Carpeta allure-results no encontrada: ${allureResultsDir}`);
    return;
  }

  // Resolver el results.json más reciente
  let jsonPath;
  try {
    const directResults = path.join(reportsDir, 'results.json');
    if (fs.existsSync(directResults)) {
      jsonPath = directResults;
    } else {
      jsonPath = resolveTargetJson(reportsDir);
    }
  } catch (err) {
    console.log(`[Allure Post-Processor] No se encontró results.json para correlación. (${err.message})`);
  }

  let testListFinal = [];
  if (jsonPath && fs.existsSync(jsonPath)) {
    try {
      const reader = new PlaywrightReader(jsonPath);
      const dual = reader.dualView;
      testListFinal = dual.testListFinal || [];
      console.log(`[Allure Post-Processor] Correlacionando con results.json: ${path.basename(jsonPath)}`);
    } catch (err) {
      console.log(`[Allure Post-Processor] Error leyendo results.json: ${err.message}`);
    }
  }

  // Leer archivos de resultados de Allure
  const files = fs.readdirSync(allureResultsDir).filter(f => f.endsWith('-result.json'));
  const allureResults = [];

  for (const file of files) {
    const filePath = path.join(allureResultsDir, file);
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      allureResults.push({ file, filePath, content });
    } catch (err) {
      console.error(`[Allure Post-Processor] Error leyendo ${file}: ${err.message}`);
    }
  }

  console.log(`[Allure Post-Processor] Procesando ${allureResults.length} archivos de Allure...`);

  // Agrupar por historyId
  const groups = new Map();
  for (const item of allureResults) {
    const historyId = item.content.historyId || item.content.uuid;
    if (!groups.has(historyId)) {
      groups.set(historyId, []);
    }
    groups.get(historyId).push(item);
  }

  let flakyModified = 0;
  let persistenceModified = 0;
  let observabilidadModified = 0;

  for (const [historyId, group] of groups.entries()) {
    // Ordenar por start time
    group.sort((a, b) => (a.content.start || 0) - (b.content.start || 0));

    const finalItem = group[group.length - 1];
    const finalContent = finalItem.content;

    if (finalContent.status === 'passed') {
      let messages = [];
      let traces = [];

      // 1. Detección de Flakiness en Allure
      const failedAttempts = group.slice(0, -1).filter(x => x.content.status === 'failed' || x.content.status === 'broken');
      if (failedAttempts.length > 0) {
        const firstFail = failedAttempts[0].content;
        const errMsg = firstFail.statusDetails?.message || 'Error sin mensaje detallado';
        const errTrace = firstFail.statusDetails?.trace || '';
        
        messages.push(`[FLAKY DEBT] Test inestable. Pasó en el reintento. Fallo inicial: ${errMsg}`);
        if (errTrace) traces.push(errTrace);
        flakyModified++;
      }

      // 2. Correlación con results.json para persistencia y observabilidad
      const pkgLabel = finalContent.labels?.find(l => l.name === 'package')?.value || '';
      const matchedTest = testListFinal.find(t => {
        if (t.title !== finalContent.name) return false;
        if (!t.file) return true;
        const specName = path.basename(t.file).toLowerCase();
        return pkgLabel.toLowerCase().includes(specName);
      });

      if (matchedTest) {
        // Persistencia incompleta
        const isSaveTest = /registrar sancion|registrar sanción|sancion|sanción/i.test(matchedTest.title);
        const hasNoId = !matchedTest.finalRegistroId || matchedTest.finalRegistroId === 'N/A';
        if (isSaveTest && hasNoId) {
          messages.push(`[PERSISTENCIA INCOMPLETA] El test pasó pero no se confirmó la persistencia del registroId en la base de datos (anotación vacía).`);
          persistenceModified++;
        }

        // Deuda de observabilidad
        if (matchedTest.apiEndpoint === 'NO_ENDPOINT' || (matchedTest.annotations || []).some(a => a.type === 'apiEndpoint' && a.description === 'NO_ENDPOINT')) {
          messages.push(`[DEUDA OBSERVABILIDAD] Se llamó a un endpoint sin capturar (NO_ENDPOINT). Falta trazabilidad completa del microservicio.`);
          observabilidadModified++;
        }
      }

      // Si hay messages, actualizar el result JSON final
      if (messages.length > 0) {
        finalContent.statusDetails = finalContent.statusDetails || {};
        finalContent.statusDetails.message = messages.join('\n\n');
        if (traces.length > 0) {
          finalContent.statusDetails.trace = traces.join('\n\n--- SIGUIENTE INTENTO ---\n\n');
        }
        
        fs.writeFileSync(finalItem.filePath, JSON.stringify(finalContent, null, 2), 'utf8');
      }
    }
  }

  console.log(`[Allure Post-Processor] Proceso finalizado.`);
  console.log(` - Tests flaky enriquecidos: ${flakyModified}`);
  console.log(` - Advertencias de persistencia inyectadas: ${persistenceModified}`);
  console.log(` - Advertencias de observabilidad inyectadas: ${observabilidadModified}`);
}

main().catch(err => {
  console.error('[Allure Post-Processor] Error fatal:', err);
});
