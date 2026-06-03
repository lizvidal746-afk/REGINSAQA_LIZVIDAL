// scripts/_workload.js
import { buildOptions } from '../lib/options-builder.js';
import { login } from '../lib/requests/auth.js';
import { createSummary } from '../lib/summary.js';

export function default function (data) {
  // Placeholder entry point for k6; actual script files will import this module.
}

export const options = buildOptions('smoke'); // default, can be overridden per script.

export function setup() {
  const token = login();
  return { token };
}

export function teardown(data) {
  // Generate basic HTML report
  createSummary(data, 'reports/report.html');
}
