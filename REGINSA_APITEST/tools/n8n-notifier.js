const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

async function sendToN8n() {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.warn('⚠️ N8N_WEBHOOK_URL no está definido. Omitiendo notificación a n8n.');
    return;
  }

  const resultsPath = path.join(__dirname, '../playwright_api/playwright-report/results.json');
  
  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  let duration = 0;
  
  if (fs.existsSync(resultsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      totalTests = data.stats.expected || 0;
      failed = data.stats.unexpected || 0;
      passed = totalTests - failed;
      duration = data.stats.duration || 0;
    } catch (e) {
      console.error('Error parseando results.json', e);
    }
  } else {
    console.warn(`No se encontró el archivo de resultados en: ${resultsPath}`);
  }

  const payload = JSON.stringify({
    project: 'REGINSA_APITEST',
    timestamp: new Date().toISOString(),
    status: failed === 0 ? 'SUCCESS' : 'FAILED',
    metrics: {
      total: totalTests,
      passed: passed,
      failed: failed,
      duration_ms: duration
    },
    message: `Ejecución de pruebas API Finalizada. ${passed}/${totalTests} pruebas pasaron.`
  });

  console.log('Enviando payload a n8n:', payload);

  const url = new URL(webhookUrl);
  const client = url.protocol === 'https:' ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    }
  };

  const req = client.request(options, (res) => {
    console.log(`n8n Webhook Response Status: ${res.statusCode}`);
    res.on('data', (d) => {
      process.stdout.write(d);
    });
  });

  req.on('error', (error) => {
    console.error('Error al enviar webhook a n8n:', error);
  });

  req.write(payload);
  req.end();
}

sendToN8n().catch(console.error);
