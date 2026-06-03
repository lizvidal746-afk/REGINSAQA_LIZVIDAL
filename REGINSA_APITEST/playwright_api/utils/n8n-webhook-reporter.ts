import type {
  Reporter, FullResult, Suite, TestCase, TestResult
} from '@playwright/test/reporter';

class N8nWebhookReporter implements Reporter {
  private url: string;
  private token: string;

  constructor() {
    this.url = process.env.N8N_WEBHOOK_URL || '';
    this.token = process.env.N8N_WEBHOOK_TOKEN || '';
    if (!this.url) {
      console.warn('[N8nReporter] N8N_WEBHOOK_URL no configurada. El reporter no enviará notificaciones.');
    }
  }

  async onEnd(result: FullResult) {
    if (!this.url) return;

    const payload = {
      project: 'REGINSA_APITEST',
      timestamp: new Date().toISOString(),
      status: result.status.toUpperCase(), // 'PASSED', 'FAILED', 'TIMEDOUT', 'INTERRUPTED'
      metrics: {
        total: this.totalTests,
        passed: this.passedTests,
        failed: this.failedTests,
        skipped: this.skippedTests,
      },
    };

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-REGINSA-Token': this.token,
        },
        body: JSON.stringify(payload),
        // Timeout para no bloquear el pipeline
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.error(`[N8nReporter] Error enviando webhook: ${response.status} ${response.statusText}`);
      } else {
        console.log('[N8nReporter] Notificación enviada correctamente a n8n.');
      }
    } catch (error) {
      // Capturamos cualquier error de red o timeout sin propagarlo
      console.error(`[N8nReporter] Fallo al contactar con n8n: ${(error as Error).message}`);
    }
  }

  // Métodos para acumular métricas (se llenan durante la ejecución)
  private totalTests = 0;
  private passedTests = 0;
  private failedTests = 0;
  private skippedTests = 0;

  onTestEnd(test: TestCase, result: TestResult) {
    this.totalTests++;
    switch (result.status) {
      case 'passed':
        this.passedTests++;
        break;
      case 'failed':
      case 'timedOut':
        this.failedTests++;
        break;
      case 'skipped':
        this.skippedTests++;
        break;
    }
  }
}

export default N8nWebhookReporter;
