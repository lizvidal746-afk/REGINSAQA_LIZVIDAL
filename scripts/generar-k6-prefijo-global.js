const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportesDir = path.join(root, 'reportes');
const sequencePath = path.join(reportesDir, 'k6-global-secuencia.json');

if (!fs.existsSync(reportesDir)) {
  fs.mkdirSync(reportesDir, { recursive: true });
}

function readLast() {
  if (!fs.existsSync(sequencePath)) return 0;
  try {
    const raw = fs.readFileSync(sequencePath, 'utf8');
    const json = JSON.parse(raw);
    const last = Number.parseInt(String(json?.last ?? 0), 10);
    return Number.isFinite(last) && last > 0 ? last : 0;
  } catch {
    return 0;
  }
}

const forced = Number.parseInt(String(process.env.K6_PREFIX_SEQUENCE || ''), 10);
const next = Number.isFinite(forced) && forced > 0 ? forced : (readLast() + 1);

const payload = {
  last: next,
  updatedAt: new Date().toISOString()
};
fs.writeFileSync(sequencePath, JSON.stringify(payload, null, 2));

const label = `K6 ${String(next).padStart(2, '0')}`;
const slug = `K6-${String(next).padStart(2, '0')}`;
process.stdout.write(JSON.stringify({ sequence: next, label, slug }));
