// thresholds.js
module.exports = {
  // Example thresholds per scenario (adjust as needed)
  smoke: {
    'http_req_duration': ['p(95)<500'], // 95th percentile < 500ms
    'checks': ['rate>0.99']
  },
  load: {
    'http_req_duration': ['p(95)<1000'],
    'checks': ['rate>0.98']
  },
  stress: {
    'http_req_duration': ['p(95)<2000'],
    'checks': ['rate>0.95']
  },
  soak: {
    'http_req_duration': ['p(95)<1500'],
    'checks': ['rate>0.96']
  },
  spike: {
    'http_req_duration': ['p(95)<2500'],
    'checks': ['rate>0.94']
  },
  collapse: {
    'http_req_duration': ['p(95)<3000'],
    'checks': ['rate>0.90']
  }
};
