// lib/ip.js
// Simple round‑robin IP selector based on configured pool
import { config } from '../config/env.js';

let index = 0;
export function getIpTag() {
  if (!config.localIps || config.localIps.length === 0) {
    return 'none';
  }
  const ip = config.localIps[index % config.localIps.length];
  index += 1;
  return ip;
}
