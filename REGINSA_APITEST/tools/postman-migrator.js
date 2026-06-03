/**
 * postman-migrator.js
 *
 * Lee colecciones JSON de Postman en `REGINSA_APITEST/postman_legacy`
 * y autogenera specs de Playwright API en TypeScript en `REGINSA_APITEST/playwright_api/tests/`.
 *
 * Uso:
 *   node postman-migrator.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const postmanDir = path.resolve(__dirname, '../postman_legacy');
const outputDir = path.resolve(__dirname, '../playwright_api/tests');

// Crear directorio de salida si no existe
if (!fs.existsSync(outputDir) && !DRY_RUN) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('==================================================');
console.log('      MIGRATOR: POSTMAN TO PLAYWRIGHT API        ');
console.log('==================================================');
if (DRY_RUN) {
  console.log('[DRY-RUN ACTIVE] No se escribirán archivos en disco.\n');
}

// Encontrar todas las colecciones json en postman_legacy
fs.readdirSync(postmanDir).forEach(file => {
  if (file.endsWith('.collection.json')) {
    const filePath = path.join(postmanDir, file);
    try {
      migrateCollection(filePath, file);
    } catch (err) {
      console.error(`[ERROR] Falló la migración del archivo ${file}:`, err.message);
    }
  }
});

function migrateCollection(filePath, fileName) {
  console.log(`\n📦 Procesando colección: ${fileName}...`);
  const content = fs.readFileSync(filePath, 'utf8');
  const collection = JSON.parse(content);

  const collectionName = collection.info ? collection.info.name : path.basename(fileName, '.collection.json');
  const safeName = collectionName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  // Extraer todos los requests recursivamente
  const requests = [];
  extractRequests(collection.item, [], requests);

  if (requests.length === 0) {
    console.log(`⚠️  No se encontraron peticiones HTTP en ${fileName}`);
    return;
  }

  console.log(`👉 Encontrados ${requests.length} endpoints para migrar.`);

  // Generar código TypeScript
  const specCode = generateSpecCode(collectionName, requests);

  // Escribir archivo de pruebas
  const outputFileName = `${safeName}.regression.spec.ts`;
  const outputPath = path.join(outputDir, outputFileName);

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Generaría: ${outputFileName} (${requests.length} tests)`);
  } else {
    fs.writeFileSync(outputPath, specCode, 'utf8');
    console.log(`✅ Creado spec de Playwright API en: ${outputPath}`);
  }
}

// Función recursiva para buscar requests
function extractRequests(items, folderPath = [], result = []) {
  if (!items || !Array.isArray(items)) return;

  items.forEach(item => {
    const currentPath = [...folderPath, item.name];
    if (item.request) {
      // Es un request
      result.push({
        name: item.name,
        folderPath: folderPath,
        request: item.request
      });
    } else if (item.item) {
      // Es una carpeta
      extractRequests(item.item, currentPath, result);
    }
  });
}

// Traduce variables de Postman {{variable}} a variables de entorno de Playwright o placeholders
function cleanUrlAndVariables(urlObj) {
  let rawUrl = '';
  if (typeof urlObj === 'string') {
    rawUrl = urlObj;
  } else if (urlObj && urlObj.raw) {
    rawUrl = urlObj.raw;
  }

  // Eliminar referencias de variables de base API para hacerlas relativas a baseURL de Playwright
  // Ej: {{base_api}}/v1/usuarios -> /v1/usuarios
  let cleanUrl = rawUrl
    .replace(/^https?:\/\/[^\/]+/i, '') // Quita dominio absoluto si existe
    .replace(/^\{\{base_api\}\}/i, '')   // Quita {{base_api}}
    .replace(/^\{\{punku_base\}\}/i, '')  // Quita {{punku_base}}
    .replace(/^\{\{url\}\}/i, '');        // Quita {{url}}

  // Si no empieza con barra, agregarla
  if (cleanUrl && !cleanUrl.startsWith('/') && !cleanUrl.startsWith('http')) {
    cleanUrl = '/' + cleanUrl;
  }

  // Convertir otras variables de Postman {{id}} a template literals `${process.env.REGINSA_ID || 'id'}`
  // o dejarlas listas en formato template literal
  const regexVars = /\{\{([^}]+)\}\}/g;
  cleanUrl = cleanUrl.replace(regexVars, (match, g1) => {
    const envVarName = `REGINSA_${g1.toUpperCase()}`;
    return `\${process.env.${envVarName} || '${g1}'}`;
  });

  return cleanUrl;
}

function cleanBody(body) {
  if (!body) return null;
  if (body.mode === 'raw' && body.raw) {
    try {
      // Intentar formatear si es JSON
      const parsed = JSON.parse(body.raw);
      // Reemplazar variables de Postman en el cuerpo JSON
      let stringified = JSON.stringify(parsed, null, 2);
      stringified = stringified.replace(/\"\{\{([^}]+)\}\}\"/g, (match, g1) => {
        return `process.env.REGINSA_${g1.toUpperCase()} || '${g1}'`;
      });
      return stringified;
    } catch (_) {
      // Si no es JSON, retornar como texto plano
      return JSON.stringify(body.raw);
    }
  }
  return null;
}

function generateSpecCode(collectionName, requests) {
  let code = `import { test, expect } from '../utils/auth-fixture';

/**
 * Suite de Pruebas Autogenerada de API
 * Colección: ${collectionName}
 */
test.describe('${collectionName}', () => {
`;

  requests.forEach(req => {
    const method = (req.request.method || 'GET').toLowerCase();
    const cleanUrl = cleanUrlAndVariables(req.request.url);
    const bodyContent = cleanBody(req.request.body);
    
    // Generar nombre de prueba legible
    const testName = req.name.replace(/'/g, "\\'");
    const folderBreadcrumb = req.folderPath.length > 0 ? `[${req.folderPath.join(' > ')}] ` : '';

    code += `
  test('${folderBreadcrumb}${testName}', async ({ request }) => {
    const response = await request.${method}(\`${cleanUrl}\`${bodyContent ? `, {
      data: ${bodyContent}
    }` : ''});

    // Validar status de respuesta
    console.log(\`[Test] ${req.name} -> Status: \${response.status()}\`);
    expect(response.ok()).toBeTruthy();
  });
`;
  });

  code += `});\n`;
  return code;
}
