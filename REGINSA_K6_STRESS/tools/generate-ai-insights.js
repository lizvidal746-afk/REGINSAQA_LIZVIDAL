const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { systemPrompt, buildUserPrompt, buildFallback } = require('./ai-prompts');

const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, 'reports');
const METRICS_FILE = path.join(REPORTS, 'metrics_for_ai.json');
const OUT_FILE = path.join(REPORTS, 'ai-insights.json');

const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1';
const OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || '11434', 10);
const MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

if (!fs.existsSync(METRICS_FILE)) {
  console.error('[IA] Error: No se encontro metrics_for_ai.json');
  process.exit(1);
}

const metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));

function save(jsonOut, label) {
  fs.writeFileSync(OUT_FILE, JSON.stringify(jsonOut, null, 2), 'utf8');
  console.log(`[IA] ${label} guardado en: ${path.basename(OUT_FILE)}`);
}

function saveFallback(reason) {
  console.log(`[IA] Generando diagnostico heuristico (${reason})...`);
  save(buildFallback(metrics), 'Fallback');
}

const payload = JSON.stringify({
  model: MODEL,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildUserPrompt(metrics) },
  ],
  format: 'json',
  options: { temperature: 0.1, num_ctx: 8192 },
  stream: false,
});

const reqOptions = {
  hostname: OLLAMA_HOST,
  port: OLLAMA_PORT,
  path: '/api/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  },
  timeout: parseInt(process.env.OLLAMA_TIMEOUT_MS || '180000', 10),
};

console.log(`[IA] Consultando Ollama (${MODEL}) en http://${OLLAMA_HOST}:${OLLAMA_PORT}/api/chat...`);

let finished = false;
const req = http.request(reqOptions, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    if (finished) return;
    finished = true;
    if (res.statusCode !== 200) {
      saveFallback(`Ollama status ${res.statusCode}`);
      return;
    }
    try {
      const parsed = JSON.parse(data);
      const content = parsed.message?.content || '{}';
      save(JSON.parse(content), 'Diagnostico IA');
    } catch (e) {
      console.error('[IA] Error parseando respuesta de Ollama:', e.message);
      saveFallback('respuesta invalida de Ollama');
    }
  });
});

req.on('error', (e) => {
  if (finished) return;
  finished = true;
  console.error(`[IA] No se pudo conectar a Ollama (${e.message}).`);
  saveFallback('Ollama no disponible');
});

req.on('timeout', () => {
  if (finished) return;
  finished = true;
  console.error('[IA] Timeout esperando a Ollama.');
  req.destroy();
  saveFallback('timeout');
});

req.write(payload);
req.end();
