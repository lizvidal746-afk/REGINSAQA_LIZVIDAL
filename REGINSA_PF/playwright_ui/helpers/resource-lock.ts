import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

function safePreview(value: string, maxLength = 2000): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function reserveRunResource(
  namespace: string,
  resourceText: string,
  metadata: Record<string, unknown> = {}
): boolean {
  const runId = process.env.REGINSA_FUNC_RUN_ID || process.env.TEST_RUN_ID || 'manual';
  const reportDir = process.env.REGINSA_PLAYWRIGHT_REPORT_DIR || process.cwd();
  const lockRoot = path.resolve(reportDir, '..', 'resource-locks', runId, namespace);
  const resourceHash = crypto.createHash('sha1').update(safePreview(resourceText)).digest('hex');
  const resourceDir = path.join(lockRoot, resourceHash);

  fs.mkdirSync(lockRoot, { recursive: true });
  try {
    fs.mkdirSync(resourceDir);
    fs.writeFileSync(
      path.join(resourceDir, 'metadata.json'),
      JSON.stringify({ ...metadata, resourceText: safePreview(resourceText), reservedAt: new Date().toISOString() }, null, 2),
      'utf-8'
    );
    return true;
  } catch (err: any) {
    if (err?.code === 'EEXIST') return false;
    throw err;
  }
}
