/**
 * sonar-to-azdo-sync.js
 *
 * Sincroniza issues de SonarQube (BUG + VULNERABILITY) como Work Items en Azure DevOps.
 *
 * Uso:
 *   node scripts/sonar-to-azdo-sync.js [--dry-run] [--project-key si091reginsabackend]
 *
 * Variables de entorno requeridas:
 *   SONAR_HOST_URL  - URL de SonarQube (ej: http://localhost:9000)
 *   SONAR_TOKEN     - Token de autenticación SonarQube
 *   AZDO_ORG        - Organización Azure DevOps (ej: mi-empresa)
 *   AZDO_PROJECT    - Proyecto Azure DevOps (ej: REGINSA)
 *   AZDO_TOKEN      - Personal Access Token con scope Work Items Read & Write
 *
 * Variables opcionales:
 *   SONAR_PROJECT_KEYS - Claves separadas por coma (default: frontend,backend,enlinea)
 *   AZDO_AREA_PATH     - Area path para los Work Items (default: nombre del proyecto)
 *   SYNC_CLOSE_RESOLVED - '1' para cerrar WI cuando issue se resuelva (default: '1')
 */

const https = require('https');
const http = require('http');

// ─── Configuración ────────────────────────────────────────────────

const SONAR_HOST_URL = (process.env.SONAR_HOST_URL || '').replace(/\/+$/, '');
const SONAR_TOKEN = process.env.SONAR_TOKEN || '';

const AZDO_ORG = process.env.AZDO_ORG || '';
const AZDO_PROJECT = process.env.AZDO_PROJECT || '';
const AZDO_TOKEN = process.env.AZDO_TOKEN || '';
const AZDO_AREA_PATH = process.env.AZDO_AREA_PATH || AZDO_PROJECT;

const SYNC_CLOSE_RESOLVED = (process.env.SYNC_CLOSE_RESOLVED || '1') === '1';

const DEFAULT_PROJECT_KEYS = [
  'si091reginsafrontend',
  'si091reginsabackend',
  'si091reginsaenlinea'
];

// Tag usado para identificar WI creados por este script
const SYNC_TAG = 'sonarqube-sync';

// ─── Argumentos CLI ───────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

let cliProjectKeys = null;
const pkIdx = args.indexOf('--project-key');
if (pkIdx !== -1 && args[pkIdx + 1]) {
  cliProjectKeys = [args[pkIdx + 1]];
}
const pksIdx = args.indexOf('--project-keys');
if (pksIdx !== -1 && args[pksIdx + 1]) {
  cliProjectKeys = args[pksIdx + 1].split(',').map(k => k.trim()).filter(Boolean);
}

const PROJECT_KEYS = cliProjectKeys
  || (process.env.SONAR_PROJECT_KEYS || '').split(',').map(k => k.trim()).filter(Boolean)
  || DEFAULT_PROJECT_KEYS;

// ─── Validación ───────────────────────────────────────────────────

function validateConfig() {
  const missing = [];
  if (!SONAR_HOST_URL) missing.push('SONAR_HOST_URL');
  if (!SONAR_TOKEN) missing.push('SONAR_TOKEN');
  if (!AZDO_ORG) missing.push('AZDO_ORG');
  if (!AZDO_PROJECT) missing.push('AZDO_PROJECT');
  if (!AZDO_TOKEN) missing.push('AZDO_TOKEN');

  if (missing.length > 0) {
    console.error(`[ERROR] Variables de entorno faltantes: ${missing.join(', ')}`);
    console.error('');
    console.error('Uso:');
    console.error('  $env:SONAR_HOST_URL = "http://localhost:9000"');
    console.error('  $env:SONAR_TOKEN = "squ_xxxxx"');
    console.error('  $env:AZDO_ORG = "mi-empresa"');
    console.error('  $env:AZDO_PROJECT = "REGINSA"');
    console.error('  $env:AZDO_TOKEN = "xxxxx"');
    console.error('  node scripts/sonar-to-azdo-sync.js');
    process.exit(1);
  }

  if (!PROJECT_KEYS || PROJECT_KEYS.length === 0) {
    console.error('[ERROR] No hay project keys configurados.');
    process.exit(1);
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: { ...options.headers },
    };

    const req = transport.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} ${reqOptions.method} ${url}: ${data.substring(0, 500)}`));
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }

    req.end();
  });
}

// ─── SonarQube API ────────────────────────────────────────────────

function sonarAuthHeader() {
  const token = Buffer.from(`${SONAR_TOKEN}:`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

async function fetchSonarIssues(projectKey) {
  const allIssues = [];
  let page = 1;
  const pageSize = 500;

  while (true) {
    const encodedKey = encodeURIComponent(projectKey);
    const url = `${SONAR_HOST_URL}/api/issues/search?componentKeys=${encodedKey}&resolved=false&types=BUG,VULNERABILITY&ps=${pageSize}&p=${page}&additionalFields=_all`;

    const res = await request(url, { headers: sonarAuthHeader() });

    if (!res.data.issues || res.data.issues.length === 0) break;

    allIssues.push(...res.data.issues);

    if (!res.data.paging) break;
    const total = res.data.paging.total;
    const current = res.data.paging.pageIndex;
    const ps = res.data.paging.pageSize;
    if (current * ps >= total) break;

    page++;
  }

  return allIssues;
}

async function fetchSonarResolvedIssues(projectKey) {
  // Buscar issues resueltos recientemente (últimos 30 días)
  const allIssues = [];
  let page = 1;
  const pageSize = 500;

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString().split('T')[0];

  while (true) {
    const encodedKey = encodeURIComponent(projectKey);
    const url = `${SONAR_HOST_URL}/api/issues/search?componentKeys=${encodedKey}&resolved=true&types=BUG,VULNERABILITY&ps=${pageSize}&p=${page}&createdAfter=${sinceStr}`;

    try {
      const res = await request(url, { headers: sonarAuthHeader() });
      if (!res.data.issues || res.data.issues.length === 0) break;
      allIssues.push(...res.data.issues);

      if (!res.data.paging) break;
      if (res.data.paging.pageIndex * res.data.paging.pageSize >= res.data.paging.total) break;
      page++;
    } catch {
      break;
    }
  }

  return allIssues;
}

// ─── Azure DevOps API ─────────────────────────────────────────────

function azdoAuthHeader() {
  const token = Buffer.from(`:${AZDO_TOKEN}`).toString('base64');
  return {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json-patch+json',
  };
}

function azdoQueryHeader() {
  const token = Buffer.from(`:${AZDO_TOKEN}`).toString('base64');
  return {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json',
  };
}

const AZDO_BASE = `https://dev.azure.com/${encodeURIComponent(AZDO_ORG)}/${encodeURIComponent(AZDO_PROJECT)}`;

async function findExistingWorkItem(sonarIssueKey) {
  // Buscar WI por tag sonarqube-sync y que contenga el issue key en el título
  const wiql = {
    query: `SELECT [System.Id], [System.Title], [System.State] FROM WorkItems WHERE [System.Tags] CONTAINS '${SYNC_TAG}' AND [System.Title] CONTAINS '${sonarIssueKey}' AND [System.TeamProject] = '${AZDO_PROJECT}'`
  };

  try {
    const url = `${AZDO_BASE}/_apis/wit/wiql?api-version=7.1`;
    const res = await request(url, {
      method: 'POST',
      headers: azdoQueryHeader(),
      body: JSON.stringify(wiql),
    });

    if (res.data.workItems && res.data.workItems.length > 0) {
      // Obtener detalle del primer match
      const wiId = res.data.workItems[0].id;
      const detailUrl = `${AZDO_BASE}/_apis/wit/workitems/${wiId}?api-version=7.1`;
      const detail = await request(detailUrl, { headers: azdoQueryHeader() });
      return detail.data;
    }
  } catch (err) {
    console.warn(`  [WARN] Error buscando WI para ${sonarIssueKey}: ${err.message}`);
  }

  return null;
}

async function createWorkItem(sonarIssue, projectKey) {
  const severity = mapSeverity(sonarIssue.severity);
  const title = `[SonarQube] ${sonarIssue.type} — ${sonarIssue.key}`;
  const component = sonarIssue.component || '';
  const line = sonarIssue.line || '';
  const sonarUrl = `${SONAR_HOST_URL}/project/issues?id=${encodeURIComponent(projectKey)}&issues=${sonarIssue.key}&open=${sonarIssue.key}`;

  const description = [
    `<h3>Issue detectado por SonarQube</h3>`,
    `<table>`,
    `<tr><td><b>Tipo</b></td><td>${sonarIssue.type}</td></tr>`,
    `<tr><td><b>Severidad</b></td><td>${sonarIssue.severity}</td></tr>`,
    `<tr><td><b>Regla</b></td><td>${sonarIssue.rule || ''}</td></tr>`,
    `<tr><td><b>Proyecto</b></td><td>${projectKey}</td></tr>`,
    `<tr><td><b>Archivo</b></td><td>${component}</td></tr>`,
    `<tr><td><b>Línea</b></td><td>${line}</td></tr>`,
    `<tr><td><b>Mensaje</b></td><td>${escapeHtml(sonarIssue.message || '')}</td></tr>`,
    `<tr><td><b>Esfuerzo</b></td><td>${sonarIssue.effort || sonarIssue.debt || 'N/A'}</td></tr>`,
    `</table>`,
    `<p><a href="${sonarUrl}">Ver en SonarQube</a></p>`,
    `<hr/>`,
    `<p><i>Creado automáticamente por sonar-to-azdo-sync.js</i></p>`,
  ].join('\n');

  const patchDoc = [
    { op: 'add', path: '/fields/System.Title', value: title },
    { op: 'add', path: '/fields/System.Description', value: description },
    { op: 'add', path: '/fields/Microsoft.VSTS.Common.Severity', value: severity },
    { op: 'add', path: '/fields/System.Tags', value: `${SYNC_TAG}; sonar-${sonarIssue.type.toLowerCase()}; ${projectKey}` },
    { op: 'add', path: '/fields/System.AreaPath', value: AZDO_AREA_PATH },
    { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: mapPriority(sonarIssue.severity) },
  ];

  const url = `${AZDO_BASE}/_apis/wit/workitems/$Bug?api-version=7.1`;
  const res = await request(url, {
    method: 'POST',
    headers: azdoAuthHeader(),
    body: JSON.stringify(patchDoc),
  });

  return res.data;
}

async function closeWorkItem(workItemId) {
  const patchDoc = [
    { op: 'add', path: '/fields/System.State', value: 'Closed' },
    { op: 'add', path: '/fields/System.Reason', value: 'Fixed' },
    {
      op: 'add',
      path: '/fields/System.History',
      value: '<p>Cerrado automáticamente: issue resuelto en SonarQube.</p>'
    },
  ];

  const url = `${AZDO_BASE}/_apis/wit/workitems/${workItemId}?api-version=7.1`;
  const res = await request(url, {
    method: 'PATCH',
    headers: azdoAuthHeader(),
    body: JSON.stringify(patchDoc),
  });

  return res.data;
}

// ─── Mapeo de severidades ─────────────────────────────────────────

function mapSeverity(sonarSeverity) {
  // SonarQube: BLOCKER, CRITICAL, MAJOR, MINOR, INFO
  // Azure DevOps: 1-Critical, 2-High, 3-Medium, 4-Low
  const map = {
    BLOCKER: '1 - Critical',
    CRITICAL: '1 - Critical',
    MAJOR: '2 - High',
    MINOR: '3 - Medium',
    INFO: '4 - Low',
  };
  return map[sonarSeverity] || '3 - Medium';
}

function mapPriority(sonarSeverity) {
  const map = { BLOCKER: 1, CRITICAL: 1, MAJOR: 2, MINOR: 3, INFO: 4 };
  return map[sonarSeverity] || 2;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Lógica principal ─────────────────────────────────────────────

async function syncProject(projectKey) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[SYNC] Proyecto: ${projectKey}`);
  console.log(`${'='.repeat(60)}`);

  // 1. Leer issues abiertos de SonarQube
  console.log('[1/4] Leyendo issues abiertos de SonarQube...');
  const openIssues = await fetchSonarIssues(projectKey);
  console.log(`  Encontrados: ${openIssues.length} issues (BUG + VULNERABILITY)`);

  const stats = { created: 0, skipped: 0, closed: 0, errors: 0 };

  // 2. Para cada issue, verificar si ya existe WI y si no, crearlo
  console.log('[2/4] Sincronizando issues abiertos → Azure DevOps...');
  for (const issue of openIssues) {
    try {
      const existing = await findExistingWorkItem(issue.key);

      if (existing) {
        const state = existing.fields?.['System.State'] || '';
        if (state === 'Closed' || state === 'Resolved' || state === 'Done') {
          // Issue volvió a aparecer, reabrir
          console.log(`  [REOPEN] ${issue.key} — WI #${existing.id} estaba cerrado, reabriendo...`);
          if (!DRY_RUN) {
            const patchDoc = [
              { op: 'add', path: '/fields/System.State', value: 'Active' },
              { op: 'add', path: '/fields/System.History', value: '<p>Reabierto automáticamente: issue volvió a aparecer en SonarQube.</p>' },
            ];
            await request(`${AZDO_BASE}/_apis/wit/workitems/${existing.id}?api-version=7.1`, {
              method: 'PATCH',
              headers: azdoAuthHeader(),
              body: JSON.stringify(patchDoc),
            });
          }
          stats.created++;
        } else {
          console.log(`  [SKIP] ${issue.key} — ya existe WI #${existing.id} (${state})`);
          stats.skipped++;
        }
        continue;
      }

      // Crear nuevo WI
      if (DRY_RUN) {
        console.log(`  [DRY-RUN] Crearía WI para ${issue.key} (${issue.type} / ${issue.severity})`);
        stats.created++;
      } else {
        const wi = await createWorkItem(issue, projectKey);
        console.log(`  [CREATED] ${issue.key} → WI #${wi.id} (${issue.type} / ${issue.severity})`);
        stats.created++;
      }
    } catch (err) {
      console.error(`  [ERROR] ${issue.key}: ${err.message}`);
      stats.errors++;
    }
  }

  // 3. Cerrar WI que corresponden a issues ya resueltos en SonarQube
  if (SYNC_CLOSE_RESOLVED) {
    console.log('[3/4] Verificando issues resueltos para cerrar WI...');
    const resolvedIssues = await fetchSonarResolvedIssues(projectKey);
    console.log(`  Encontrados: ${resolvedIssues.length} issues resueltos (últimos 30 días)`);

    for (const issue of resolvedIssues) {
      try {
        const existing = await findExistingWorkItem(issue.key);
        if (existing) {
          const state = existing.fields?.['System.State'] || '';
          if (state !== 'Closed' && state !== 'Resolved' && state !== 'Done') {
            if (DRY_RUN) {
              console.log(`  [DRY-RUN] Cerraría WI #${existing.id} para ${issue.key}`);
            } else {
              await closeWorkItem(existing.id);
              console.log(`  [CLOSED] WI #${existing.id} ← ${issue.key} resuelto en SonarQube`);
            }
            stats.closed++;
          }
        }
      } catch (err) {
        console.error(`  [ERROR] Al cerrar WI para ${issue.key}: ${err.message}`);
        stats.errors++;
      }
    }
  } else {
    console.log('[3/4] Cierre automático deshabilitado (SYNC_CLOSE_RESOLVED=0)');
  }

  // 4. Resumen
  console.log('[4/4] Resumen:');
  console.log(`  Creados/Reabiertos: ${stats.created}`);
  console.log(`  Ya existentes (skip): ${stats.skipped}`);
  console.log(`  Cerrados: ${stats.closed}`);
  console.log(`  Errores: ${stats.errors}`);

  return stats;
}

async function main() {
  validateConfig();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   SonarQube → Azure DevOps Work Items Sync             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`SonarQube:     ${SONAR_HOST_URL}`);
  console.log(`Azure DevOps:  https://dev.azure.com/${AZDO_ORG}/${AZDO_PROJECT}`);
  console.log(`Proyectos:     ${PROJECT_KEYS.join(', ')}`);
  console.log(`Modo:          ${DRY_RUN ? 'DRY-RUN (sin cambios reales)' : 'PRODUCCIÓN'}`);
  console.log(`Cerrar resueltos: ${SYNC_CLOSE_RESOLVED ? 'Sí' : 'No'}`);

  const totalStats = { created: 0, skipped: 0, closed: 0, errors: 0 };

  for (const projectKey of PROJECT_KEYS) {
    try {
      const stats = await syncProject(projectKey);
      totalStats.created += stats.created;
      totalStats.skipped += stats.skipped;
      totalStats.closed += stats.closed;
      totalStats.errors += stats.errors;
    } catch (err) {
      console.error(`\n[ERROR FATAL] Proyecto ${projectKey}: ${err.message}`);
      totalStats.errors++;
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('RESUMEN TOTAL');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Creados/Reabiertos: ${totalStats.created}`);
  console.log(`  Ya existentes:      ${totalStats.skipped}`);
  console.log(`  Cerrados:           ${totalStats.closed}`);
  console.log(`  Errores:            ${totalStats.errors}`);

  if (totalStats.errors > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
