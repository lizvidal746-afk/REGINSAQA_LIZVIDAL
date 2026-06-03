// lib/options-builder.js
import { config } from '../config/env.js';
import thresholds from '../config/thresholds.js';
import { getIpTag } from './ip.js';

export function buildOptions(scenarioName) {
  const base = {
    vus: 1,
    duration: '30s',
    thresholds: thresholds[scenarioName] || thresholds.smoke,
    tags: { scenario: scenarioName },
  };

  // Example of dynamic adjustment based on scenario
  switch (scenarioName) {
    case 'smoke':
      base.vus = 1;
      base.duration = '30s';
      break;
    case 'load':
      base.vus = 10;
      base.duration = '2m';
      break;
    case 'stress':
      base.vus = 20;
      base.duration = '5m';
      break;
    case 'soak':
      base.vus = 15;
      base.duration = '10m';
      break;
    case 'spike':
      base.vus = 30;
      base.duration = '1m';
      break;
    case 'collapse':
      base.vus = 40;
      base.duration = '3m';
      break;
    default:
      break;
  }

  // Attach IP tag for each VU request via setup hook if needed
  // We'll rely on http helper to add tag per request.
  return base;
}
