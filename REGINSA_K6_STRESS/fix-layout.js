const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('tools/generar-html.js', 'utf8');

// Replace the CSS with the full exact CSS
const newCss = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: #eef0fb; color: #172033; font-size: 12px; }
    .page { padding: 16px; border-top: 3px solid #283593; }
    .hero { background: linear-gradient(135deg,#1a237e,#3949ab); color: #fff; border-radius: 10px; padding: 14px 20px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .brand { display: flex; align-items: center; gap: 16px; min-width: 0; }
    .logo-box { background: #fff; border-radius: 8px; padding: 6px 10px; display: flex; align-items: center; }
    .logo-box img { height: 48px; width: auto; display: block; }
    .title { font-size: 15px; font-weight: 700; }
    .sub { font-size: 11px; opacity: .88; margin-top: 3px; }
    .std { text-align: right; font-size: 10px; opacity: .82; line-height: 1.35; white-space: nowrap; }
    .section { background: #fff; border-radius: 8px; border: 1px solid #c5cae9; overflow: hidden; margin-bottom: 14px; }
    .section-title, summary { background: #283593; color: #fff; padding: 9px 16px; font-weight: 700; font-size: 13px; cursor: default; }
    summary { list-style: none; cursor: pointer; position: relative; padding-left: 34px; }
    summary::before { content: "▾"; position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 12px; line-height: 1; }
    details:not([open]) > summary::before { content: "▸"; }
    summary::-webkit-details-marker { display: none; }
    .section-body { padding: 12px 16px; }
    .note { padding: 10px 16px; color: #455; line-height: 1.5; }
    .http-grid { display: flex; flex-wrap: wrap; gap: 14px; padding: 14px; }
    .http-card { flex: 1; min-width: 260px; border: 1px solid #66bb6a; border-radius: 8px; overflow: hidden; background: #f9fbe7; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    .http-card-title { background: #4527a0; color: #fff; padding: 10px 16px; font-size: .82rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; background: #fff; font-size: 11px; }
    th { background: #1a237e; color: #fff; padding: 9px 12px; border: 1px solid #283593; text-align: center; white-space: nowrap; }
    td { padding: 8px 12px; border: 1px solid #e4e7f4; text-align: center; }
    .compact td { padding: 8px 12px; font-size: .82rem; }
    .compact td:first-child { text-align: left; font-weight: 600; }
    .compact td:last-child { text-align: right; font-weight: 700; }
    .ok-row { background: #e8f5e9; color: #1b5e20; }
    .left { text-align: left; }
    .strong { font-weight: 700; }
    .mono { font-family: Consolas, "Courier New", monospace; }
    .slo-head, .slo-cell { background: #d1d9ff !important; color: #1a237e !important; font-weight: 700; }
    .master th, .master td { font-size: 10px; padding: 5px 6px; }
    .dot { color: #2e7d32; font-size: 16px; }
    .empty { padding: 14px; color: #666; background: #fafafa; }
    .url { margin-top: 4px; font-family: Consolas, "Courier New", monospace; font-size: 11px; color: #1a237e; }
    .recommendation summary { background: #f9a825; color: #3b2600; }
    .recommendation { border-color: #f9a825; background: #fff8e1; }
    .recommendation table tr:nth-child(odd) td { background: #fff3d7; }
    .k6-shell { margin: 14px -16px 0; padding: 22px 0 28px; background: linear-gradient(135deg,#6b6bd6,#7a4ab0); }
    .k6-panel { max-width: 1400px; width: calc(100% - 48px); margin: 0 auto; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 12px 36px rgba(45, 21, 100, .28); }
    .k6-header { background: linear-gradient(135deg,#7c3aed,#5b21b6); color: white; padding: 18px 28px; font-size: 24px; font-weight: 800; display: flex; align-items: center; gap: 12px; }
    .k6-mark { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 30px; background: white; color: #5b21b6; font-weight: 900; border-radius: 4px 14px 4px 4px; font-size: 14px; }
    .k6-body { padding: 22px; }
    .k6-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px; margin-bottom: 24px; }
    .k6-card { position: relative; border-radius: 8px; padding: 22px; color: white; min-height: 110px; box-shadow: 0 6px 14px rgba(0,0,0,.18); text-transform: uppercase; font-weight: 700; overflow: hidden; }
    .k6-card div { opacity: .92; font-size: 12px; }
    .k6-card strong { display: block; margin-top: 10px; font-size: 34px; line-height: 1; }
    .k6-card-icon { position: absolute; right: 22px; top: 24px; opacity: .16; font-size: 56px; line-height: 1; }
    .k6-card.purple { background: linear-gradient(135deg,#6b6bd6,#6d4bb4); }
    .k6-card.green { background: linear-gradient(135deg,#5cc98a,#48bb78); }
    .k6-tabs { position: relative; }
    .k6-tabs > input { position: absolute; opacity: 0; pointer-events: none; }
    .k6-tab-label { display: inline-flex; align-items: center; justify-content: center; min-width: 180px; min-height: 48px; padding: 12px 18px; background: #f8f9ff; color: #67738f; border: 1px solid transparent; border-radius: 8px 8px 0 0; font-weight: 700; font-size: 13px; cursor: pointer; margin-right: 4px; }
    #k6-tab-metrics:checked ~ .tab-label-metrics,
    #k6-tab-run:checked ~ .tab-label-run,
    #k6-tab-checks:checked ~ .tab-label-checks { color: #7c3aed; background: #fff; border-color: #dfe3f5; border-bottom-color: #fff; }
    .k6-tab-content { display: none; border: 1px solid #dfe3f5; border-radius: 0 8px 8px 8px; margin-top: -1px; padding: 20px 22px; overflow-x: auto; min-height: 280px; }
    #k6-tab-metrics:checked ~ .content-metrics,
    #k6-tab-run:checked ~ .content-run,
    #k6-tab-checks:checked ~ .content-checks { display: block; }
    .k6-tab-content h4 { margin: 12px 0 10px; color: #31406f; font-size: 13px; }
    .k6-tab-content table { margin: 0 0 18px; }
    .k6-tab-content th { background: linear-gradient(90deg,#6574df,#7047a8); font-size: 10px; }
    .k6-detail-grid { display: grid; grid-template-columns: repeat(4, minmax(180px, 1fr)); gap: 18px; margin-bottom: 22px; }
    .k6-detail-card { background: linear-gradient(135deg,#6874df,#7047a8); color: #fff; border-radius: 8px; min-height: 132px; padding: 18px 22px; box-shadow: 0 6px 14px rgba(0,0,0,.18); }
    .k6-detail-card h4 { margin: 0 0 14px; color: #fff; text-transform: uppercase; letter-spacing: .04em; }
    .k6-detail-card div { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; }
    .k6-detail-card span { font-size: 12px; opacity: .9; }
    .k6-detail-card strong { font-size: 24px; line-height: 1; }
    .k6-subtable { margin-bottom: 12px; }
    .k6-check-ip { margin-bottom: 12px; border: 1px solid #dfe3f5; border-radius: 8px; overflow: hidden; background: #fff; }
    .k6-check-ip > summary { background: #f6f7ff; color: #1a237e; font-size: 11px; border-left: 4px solid #283593; }
    .k6-check-ip > summary::before { left: 14px; }
    .k6-check-group { margin: 10px 14px 12px; border: 1px solid #e6e9f7; border-radius: 8px; overflow: hidden; background: #fff; }
    .k6-check-group summary { background: #fbfcff; color: #1a237e; padding: 10px 14px 10px 34px; font-size: 11px; border-left: 4px solid #3949ab; }
    .k6-check-group summary::before { left: 14px; }
    .k6-check-group table { margin: 0; }
    .ok-cell { background: #59c98a; color: #fff; font-weight: 700; }
    footer { text-align: center; padding: 14px; color: #718096; font-size: 11px; border-top: 1px solid #e2e8f0; background: #f7fafc; }
    .badge-summary { float: right; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; margin-top: 2px; }
    .badge-summary.pass { background: #2e7d32; color: #fff; }
    .badge-summary.fail { background: #f57c00; color: #fff; }
    .pill-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; text-align: center; }
    .pill-badge.pass { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; }
    .pill-badge.fail { background: #ffebee; color: #c62828; border: 1px solid #ffcdd2; }
    .sub-card { border: 1px solid #e0e0e0; border-radius: 6px; background: #fafafa; padding: 12px; margin-bottom: 14px; }
    .sub-card-title { font-weight: bold; color: #1a237e; margin-bottom: 10px; font-size: 11px; border-bottom: 1px solid #e0e0e0; padding-bottom: 6px; }
    @media (max-width: 900px) {
      .k6-cards, .k6-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .k6-tab-label { min-width: 0; width: 100%; margin-right: 0; border-radius: 8px; margin-bottom: 4px; }
      .k6-tab-content { border-radius: 8px; }
    }
`;

const newLayout = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>\${esc(r.testName)} – Dashboard SRE</title>
  <style>\${STYLE}</style>
</head>
<body>
  <div class="page">
    <header class="hero">
      <div class="brand">
        <div class="logo-box">
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANQAAAB6CAYAAADHyH2GAAAQAElEQVR4AexdB2AURRf+9tIgJKGDgAgKKCIgvUgRUIrSVQREQEV+CxYQVBBUEFDpIoJYKAJSFSwUlSaogALSe++9JaS3f76528vu5ZLcXZLLBQfybmbevDfl7byd9mbWkqz+KQkoCWSZBCxQ/5QElASyTAJKobJMlCohJQFAKZRqBUoCWSgBpVBZKEyVlFcl4JOZKYXyyceiCpVbJaAUKrc+OVVun5SAUiiffCyqULlVAkqhcuuTU+X2SQkohfLJx+JrhVLlcVUCSqFclZSiUxJwQQJKoVwQkiJREnBVAkqhXJWUolMScEECSqFcEJIiURJwVQJKoVyVlLfoVD65WgJKoXL141OF9zUJKIXytSeiypOrJaAUKlc/PlV4X5OAUihfeyKqPLlaAv9phcrVT04V3icloBTKJx+LKlRulUCOKFTcnz8jau54XGlb2mch/J0nc+szVeXOQQl4XaFi1y5GwslDOVhllbWSQPZJwKsKFbtyPm6Ofz37aqNSVhLIYQl4S6EQs2I2bn76Zg5XV2WvJJC9EvCKQsX8NB2RU97J3pqo1JUEfEAC2a5Q0YunIvKr932gqr5XhNjYeBw7fAYH950wwdFDp32vsKpELkkgWxUqeuEkRM0Y6VJB/mtEK378E32fH4XRw2ZgwoezTTDmg5no23s0fvrud6dimfP1UrzUfYQdJo2e55ROR44fOdtOS749O4/oUTIP4nRYtuQPe5wzz+YNu/FO30/t6fGFoNOt+eUfO15Pz1X34vmrejKgXFzhe+OFsfjkozlY8+s/4MvJnoDBM/Hjb01l2rH1gCE2tXdwv0l2+kGvTUxNkAEm2xQqau44RM0enUH2/73oqMgYjBsxSzbk9GofGxMHKt2Id75E+I3I9EizNG7p4nU4eexcmmlevRKOawLSJPAwwt/fz23O6KgYHNh7HIvm/Ib3+n+GbVv2p0rDYvG8idt4U6WZHsLz3NJJNWrWx4ie90k6FP/dqM/GzMPhAyddFsCZUxfx46K16dInIznd+FSRyenTz5j6QyoWHZGUlKR7pWvM2+iXkW78WPwy1xT50vly4nc4duSMKVfHMmVQdRMvNHPQlVDmauEkh6jpwxG9aLKTGIXaue1Qqgd+Z/lS6PR0C/Qb9DT6vdMdL73RGZWqlDMJa/f2w6awY+PT3H3ymmZKzzFw/uwVfPftSke0DCclmZVRM+Rt9JO4SLGCqFCxjEsQFBRAFqdwV/nbnaYRlj9fKvpN63eacI5lyqDqJl5PAlmqUJFfvofoJV96Uo7/BM/u7eYNbTa2t95/Fs1a1sHdlcri7nvLoGr1CnixbyeTPMJv3ExzjmAi9CBgSWNItPqXv3H44KlUKSY59FCpCAyIxg/VxBuDu7sEeYPzGDjN3hf6PuE0jVGf9UOrdg1MxNevR5jCmQn4WdxXD/c50ihh5JRBiPl5RhqxCk0JcP5EV4dqte7RvSY3INAfbR57EK07NraDxaKZaIwBx2GNMc6p3zTuMfc4RvoZn/8AzuWMuKTE7BnyGfNwx39/DbMM48TKqZHfUW6mqhsJnfjTlowTYhsqSxTq5qcDxMbtHFuSyklLAreVLGyK2iWGgCaEIdC6YyOhVI3tEBDgb4g1ezXDsMsck0bINO7R0iACrl6+gQWzfzXFOyqvZsjb6DcxuRxwnzBvcJCJKdFB4Q3Fk3SmqktM2j+apqUdmUZMphWKpkSxKxekkbxCGyVQo04lYxD79xzDu/0ng0vVR5wMr0zEhkBawzQDSZZ5N67fAc799ASTHOZQOj6nXP8AP1PWSW4MSU2MTgKOvZsTklSoTClUxOiXQWPXVKkqhFMJlLy9KOo1qmqKu3zxGrhUPXb4N3L/Y9TQ6Vg8f7XXlsodX8JcSKjToIqpjNz3uhkRJXHJbjTYfbuOirqtdwni4uJl+pn9cVQob758WPZMKVTcHz8zDQVuSKBLz0dwf03zuN/IfvzIWaxcthFvvzIBQ/p9hvSGhTpfsjsTA53J7pqHNZqmoVO35siTN2UoFREeiTnTlkkOxyGVMe8kh3Ls231U9L7rXYLoqFiZvrs/SQ49puMcDw5lciyjY37G+jjGuRLOlEK5koGiMUuAy8NcxevTvwtq1asExzmAkfrK5euYMn4Btmzaa0Sn8muaWSlSETggjEMZo59kfn4aQkKD8WT3FgzagRYGtJJwbMCalpK3xeC3M7roSaUILvI5KozjQoJmSSkfk7RkVEZDAo6yIX9GoBQqIwllU3zlauXRq89jGDWpH154vRMefrQebi9T3Gluc77+GZcvXbfHOT5ox4UCO2F6njTiNM3aJOo3ul8u5RvJ5s5cgatXbhhRYks5pQVmphwJiYmmdF0NJCam5E+eVLIxRzvqH1lMkFEPZiJ2ErBKz0mEQnlHAlwi5/L5410fxuARvfHqW11R7u7Spsxpp/azwa5P08xvXROxCwFNS5vfzy+lSTzdq7UptZjoWJeGoDpT4SIF7Mv+xi0AZ/7gdPah9PScucnJ5mV8TUu7bs74HXHJpiGk+2mlSM8xZRXOEQlUqlIOA97tiUfaNzTlTxMkO8LxOTu8he10aXiMSqNZzIlpWkq4aLGCaP9k0zRSyRhdpFgB+7J/m8dStgCc+fOF5M04QScU8XEJJqyfxdykDdUx0aUVSDIsulgcZJMWjxFvzt0Yk81+/9IVEPrWFNfgbUH39ucIHThVwBcIHUT4EqHvfGWFwV8jdMg0K7w7HaHvzkDoe4SZCH3/G4S9PwthQwmzETZsDsI+IHyLsOFzrTBiHsJGzEfYSMIChH24EHmfeiPLJbBq+SbQ8pvw+YSFOHXifJp5VHNYuEiIT2k4fhbzY0s0NII0EzRE+KVjiOqoYK3aNkCJUkUM3Gl7NWhpR2ZTTGxsnCllf4f9OouDrEzETgLxhtVGTXO/PuYn4ySDrEble/49+JUoAy65uwyjXkbEqJcQ8fGLAl5AxEeE/yHiw95WGPk8Ikb0ssLw5xAx/FlEfEB4BhHDeiJ8WA+EDyV0R/j7TyP8PUI3hL/7lBWGdEX4kC4IH0zojJjlsxBQuV5WV13Ogw7tPwHCzn8PYtvm1NbReqa/iZU+3U83KE8gHQmBQQHS1X+iIqN1r1PXsdEFB6f0BpqDElicvJV79G7nNF0ijfyOe0KappEkW+GK2Hw2ZhCcL48xCD8/8z5VesvzkTejEWu0tPCg+F5VqJDXxgBBwbg5vq+p0r4UCGzYBqGiN8zKMulpFSqSX/dKl8czpn6yCJs37rEfMDyw97hc2dv6915Jo/9UqV5B9yJ/gVC7n57TJy6AVuxUUN3amkcwVooeceTgr1IdxyjsUA6moYNFS90kypYriQcfrqWTpOmG5Q8xxXHj+nOxSrl08Xr7XhTLxOV0x0OV6TX0I4dO2+XDIxo/LFwjj7/wHNn3c1eZ8nTsTfOF5DXFz/9mBf5cu02md0nsAcaIeeHBvcdleLZY/DESh4QEG4Mu+VNLzyU294k4XEuOiUbk5IHuM3uJIzuViVWoXe8+BAYG0GsHLkdPn7LEfsCQB+Yc957uKHsbWoqhl85U+f7ycGwoPDT45affYfTQGXKD+KP3pmHxvFU4ffKCziZdrt5xIUQGxI/m0CNZ/Jw3iQ6dm6FAQbMiC3bTHxdXWFYjcue2Q6Z9KJbp01Fz7fWlUhDCr980spn8PJZBGgL9v/68QZ4Vo1LqG85k4HJ/w6Y16LVD/cb32/30cL/r2+nLZP7v9Z+Mfv8bgwkfzQHT3rH1IEns8GgH8zzWHpGOx7n00mHwJCrsg2+ReOEUaI3uCb9/+apyXsO5TXZCdvVMep0LFg4Dra8dlUGPd+aWubMEXh/4NAIMcwOmw6MeRYsXcsaSJo5pPSE2bY0EmmYe1zgb8pE+jxhydunZit50oc+ArvKoRbpETiIdh2ZOSNJFFSlWEK+82TWV0rPOXEFNl9khMigoAJ17tPSoHtmuUFSAhIPbPD4KH1ClPkLFokP0HVXw2ujV2QquHLtOj8Z4HNzhGdmDZe4qiXdGPI8WrevjDqEsAQZFsRMJD3syrvQN/KAXHOcFIhqlShfDEDGHJE3x29JXLB4TebJ7S/Qf0tNpWkxPB4sl7SZBCw/2QjqtM5dnlPjSePalDqjzQGXZKIPz5XFGasI5zr9MkekEWKbX3n4Kw8f1AZXHGSn3+IZ8+D80aFIdRgsQZ7Q16tyLwSN7o0nz2s6iM8SlLb0MWTMmoDLF79qIqDljMyZ2QkFlSnp1EsZN+TXDDTkn7F5HubqxWahwfnTs8hAGCWX5dPpAjJ7cD1Qc9joELpuP/bw/2j3RJN06UOlIM3TMy/h89hCMnPCqXHJnGoQ3BvfAJ1+/LXvFpi1qwzjU0xNuLjaUyavD6wO76VFO3ad7tZEHIZk+wXHOojNRmahUVK5xUwfI8ul5OHNDw1IOC7KnYdpGoHxYF0feF/t2wr2V79KzTdPlC4j7ahO+fBNjprxhqgPzeX/Ui7KMvV99HO72/MZMs02hwj5cCCpT9LwJxvxc9lOZIvtMxuiPF+DsqYuu8uVKOjYmvl15wJDAjV1njT+jynHRg7xMg1Ch4h3g8CUjPnfiOVxl2jpk9MZ3J22dtvw9d8jDlnoedCmfrKoL51pM0wi3lSyiZ58pN1sUisqUsG8LMqNMl58bD97+c+1qOJJMu9eZqq9iVhLIVglkuUJRmRKP7vH4xiP2TBefGYeJH30Lrsiw9nJJ1cFqmHifAzctFnyu/KpAmZZAliqUVKYzRxH59TCPChZQsynOdhuFTz/+FlKJPEpFMSkJ5JwEskyhpDKdPOjxPlNgg9Y41nYIeDFhvMHMxi4ah+VdO96XPOYVaF8qmSqLlySQCYVKKaFUJjHMi5w6JAXphi/Poz1wpu3bmPrJQje4FKmSgO9JINMKRWVKOLjd42Fe3q79cKrx87JnQnr/1BwqPemoOB+RQKYUqsBXfyFh72ZEzfzQo+rke2kkjt3XLmNlYupqyEcpKPBxCWRKoZIunYF/pdoemwXtK1oHn42d75KIEhM8O9HpUuKKSEkgiySQKYXiErensCu6AGjM6Wo9XLVCcDU9RfdflkD21T1TCuVpsTas246vJn3vFntumEK5VSEPiXksg1bW+klV0/kdQ5rGz8Po6AvnrshjCuTX+XiPuR6vu8YtC51Oj0vLpVU70yXo/I73T5CX1uGkcfwG1olj52TZjNc/X7/m2rXK4Te893US1iE98LpCrV+9FbO/XppemZzG5Y4pVPaum7Mh/rBoLXb8ewDfz1sl5cQvefAcFAP8PlN0VAy9WLJgtTyDNGPqj/aLKoljGoTwG9bjEnOmLZV0PELyz1+7JO+6VVvtn6zhBTFUREYstN0iyxfiFxMXgfDvP/sYhcXzVkuFkGnbjmLwrsFrV8LFBn2MPMJBQsZv+nMn9u46Ypo7sxyM27/7GMkQGxMnz3gxIPF7rPgl81dj7ozl1t2M9AAAEABJREFU4DmrZUvWMxp/rPlXuvzhi2Zw30n05gh4VaGoTPNmrsiRit4KmfIgYaUq5dCpWwtp66bXKSbGeqddbGwcoqOt/vwFQuV9Dp27t8Rx2ydeEhOTJI53OhQtVlCyBwUFStwT3Zpjn63RMiLWdnI1MSEJi2xf4oiMtCrrAw9WQ/VaFVGz7n2gdTbpNU2T6TBtHqUgjvNeKnF8fCJihIIQRyB/m8ceBC3TecCPuLCwEDs/w/FiL/KGUEweBuRLIi4ugWicPnkRTz37qPxKSd68Vit29ogEEvBQo8WigYcYGfY2eFWh+FbydgVvpfyataqDhIQETJu8BEYr7wTRYFnPxMRExMVaG96N6xGy51m6eB0KFgpjNHg0Qz89y0ZKZILgWfvbZvHWXwEapRJHSLaNscMKhKBY8YLYvuWAw2F5wM8vpfmQXk9bb9yl7igOKoK8O8OWHtPWgYa1+gvg4oWrsrzrVm2R0RaLBfUaVhG960HwIwvJtnszNKEskkD8UB7CgUUoc7LN3nPLpj147uWO+Pef/YzyOqRIxOtZqwzdlUC4mCvw0pQevdti5bJNdvYE2woohzsWiybxefIEyV6sZt1KaNSshsRRAdrYbh/Ka7u2i9TFSxTChXOX0UD0PJLQ8KNpGh7t0AgrfvwDjqaKbPQ6qaal9FA8VkK8n8WCjl0eAodpEPHEGYFfytDPgxUrXkj2UA/ajtqTnJfJtOnYGLxfQ9NYUiAwMOWjCTy6zvSoZAT6T524gLUrN+PooVMMeh28qlDKajxzz3fTHzvw/dyV8qNtkTetd40H5QkUc5fjAk6IRnQa+UWPwlxCw4KlQpUz3PFHheJ8hMDFAdLxKAOHke07NcOOrQeIkhAYZG24gUEB8ibZOg2qwN/htqQ8eQMlLX+ShboxXQKHasQFBPij+G2FcG/lO03HSE4dPy8/lHBT1IH5kzYqKlrWgfwMW/z8EBAQAB7C5DEUloN4nlb+6bvfsXH9DmwWvRFxASKfwMAAeflNgybV8NxLHUDF5EIH470JXlUoDgs8rZyTEYOnSWUbHxtVtiUuEm7R5gHcd3958HKRXq88JjBAeaEwVAYGOvdoBSoY/Q89Uo+OCR7t0Nge1ns19nhE8iTuHWVL0Cs/+la4SAHpb9K8lnQfalXXdFfgXSJffllQRoqfhk2qy4UE4RWdkUYH7Ts3k+7jTzVHAxHPAM8glSpdDIFBAeB11MQRHhM9GV0Ch4w8+1S/cVUG5Zyp4n13Sn+7x5uA/sJFC4ge7UGJa9i0unR5pumBxtWknx97K1TYOtSVCC/9eFWhNM0qaE/qlglWT7LzWR42Jg7N+EbWC8nvTrGhGq9y1nsqnYYu512kIxSwXbhi5OHbn3TFSxSmI0GffzFQRDRiugT6AwzDLy5O8GYmps3FBtKwd6JL0NNhj0QaozIyvkLFMrJHZZxet0KF8zPKBHxhkIag1zHUdtqXrvGueIZNzF4IeFWhPO2hKDgKh0eVfRlKlirqhUemsvBlCXhVoTwRBN+E/Qb3wPyZv8i72HgnG7+fxLnEojm/Yf43v2DezOXg1VCzxf7WN1/+BH7Kkith3DymNQat2KeMmw/eXcfrorIauB9Dhc9j+ASMJ3XNLI/iz3kJeFWh3J0Hccjw6ltPYe70ZdgoJuT8yh9vFjpx9CxOioktd+fPnbkE7vbTMuDyxWu4evkGuMMeLjYuOfGOvBmN6KhYxIp9Fe5tZLXIqUT9BnU3LWNndR4qvdwjAa8qlDtiKSZWh94e9hymTVkiV3/c4fUWLcfz/QY9DeM8xFt5q3x8UwJeVShXFxbYQF9+ozPGjZiV6hphV8X4Ur8n0Xlg72yFDn174miUBb/vueAxuFofRZc9EuCm8Y+L1mZZ4l5VKFdKzYsgn32xg7TVMn3CxRVmGw2XYxcfjsGwRbvQdOgqnwWWz1Zklxzuq+gmPEcPnzbxbNuSYhnAoe0vP/0lLQ/0fR0Og8+fvSx5uE9EOzhaNly5bP2QG4fGTJ8ExHG4TD/hnw276djh+JGzdr+jZ/eOwzJfo10hPynKvAjr12x1ZAHLzjgCh+y86Yr+5T/8gbOnL0l6fnCOw3gG9LpzKM/74UnLO+EZRzDeC6+nRZpLF64yGvqG8IXzV0VZ1yE2Jg5XbR+S4xRCEokfTjGE49afTynUXRVul3sOXDxgZd2qiSAOEBt8/GDZ19tviBCy83JMmb63f/btOio2dlfJbP/+c5d0+UNFmG+wkdy78yj4RQ5aRaz59W+SiIZ5EZx/MkDznsrVKojNz5qY+skiomSD4gIO94BOHD0HmgLJCPHDOeweoSjCK/+2/rNXus5+dm8/LJe/OcqYOfVHSXLl0g2wYXOp23G5nASb/tgpebifVKhIfly/GiGeXTJoCkXFv3EtArRjvHjhGsnB+tEGcPvW/WLDOBCNH6qBdSutJkucK88Ri1O6ItIWsHSZ4mDaS5f8Ifn/tr0gWK/mretLe8Tflm6UcbRb1De4/7YZC8sIF398RqG4D0EDzUmj50rhu1h+Oxn3RF7u3xkfr7uAicv0t7WjsYydPFd6kpKSRGMLx6H9J8VCi9VQlRXZummP3DglnmFaHZS2bdI+9WxropCYkITEROvX/vhG5sWRXJnUvzBBe8CQkLxgwyId6clII9P6jathw/odDEqgiZP0pPFDxSHo5kC0MdRJ9T0mPUyXedPlwhJdgr5nVkJsRdwUC0use5Kt/AkJCfKuxqSkZFABw/KH4Onn25AN/EwQP6xAlwj2vKXL3Abuu+l3nFMZGccFJe6PcaOZLyDiGKYS0k850XUHfEKh+Cbq2KUZJo+dD+NQw9WK8CG90r8L3vz5BGavs5r5k/fWUidIC4S2jz8oj0KwkcH2j8OdEiWLYMvGPRJDGzt9vqpvsvoH+CEp2apQksj2E5TH+jUQi0VDparlcOXSdflC0/cMt285gFKli0IfLtrYXHJ0RWF50mNg3no8e0jdT5dxsbFx0hA3SbxQiNPT9ff3EzIhBvY727eLoS+V0Gg5r3+QTpeFruB+Fmvzt/j52V82HOXQ9pHDTT0/aw6u/VpTdI02W6gqVSkHvjmmjFsAvk3czYQmKrwL+9m5B7F06xkz+62mUaJ2+QuESNMbfR7D7YN8ocEID4/E9WvhggJgA+Y8igEOu+gnjmGCRSiP/va144UGBgUFos3jjbF6xSbZgElLM6dYseVAqwV35xQJNqNdpsP9RPZaxcTqLcMm0CCHfIzny9EYx96E5WI5r4uhH+PYToLz5RFl9EO8zdJ+0be/ySMiF8U86ZTty5Ckp/1iouidycf9SbpJomej6ycUki5lofspm6o17pajAM3ivnq4z8ESZBHQEprj/Elj5nrUM+UNzoPXxbJ1u6k7sOHApVSlutX0icv0eUVDeuiRurj9juKyvmzknbo1B23tSgkc5yrlxFz0r9+3y8+PapoGvnXzFwgFbAKpLOZPC8WmOA8AcnQgExI/bOy04WNawfnyggsEt5cuJtN+skdL2cgEGc6JxQ1uqC+zzUmIMwI31ccN/wbVa1e0o/XycLPdjjR4xo+cLcurD9VIP+HD2dJusZQoA4FDWt7byEUTslIGvy3dIPmodCePngVt+dim2omenGejaKO4avlG8BtQXPAin37Uo3K18vKQI40FatW7j1EIEy8sero+8wjS+zAdaZxBjilUrXqVwPMsEz+eIybQKfOB1IV0jqFNGL/sUO+jTdh/xvpmdk5562CbtawDvsGpIKw7a9a0RW2xqWw1eeKXODgH4LxiwLs9QZqeL7QjGWjv1/ihmtJ/T6Wy6C7mHKRhmkRyTkV7PPpphFuiVBE5P3ms68NEoWixgmjVroH0c++tS89WaN2xkQwbf4jv1acj+ov8afHNuDvLl8KICa/I8vDrFsQZgauyLCuhqugdSM+vgNDM7IXXO0lS1ollJp5fFSGSdeKngcjHut8t6kV5MI5W9vUaVpWf0+H8imXW69pnQBeSoG6DKmB6PXq3lQbBROrGwny5tO/UlCi3wKsKxW6bpXtYvGEbNauJT0fNBYcTxLkD+cVbhA/szrfW4OIN58qogf/dSVXRKglkXgJeVShN00BT/jJ3lcIE0Z1z7OpuFfjtnr7vPoOy/X9Dgm3Vx2kaGqCJuQLUPyUBL0rAqwrF7pT2edMmL/aoihxHv/hWN9z71krExqdesXJMVOiUI0qFlQSyVQJeVaiy5UqiQKHQVF+P41jZFXimbxfUHrIa1yPjslUoKnElAU8lYFYoT1Nxg4+bbFwedRdCbiuGJh+sxdlr0W7kpkiVBLwrAa8rlCfVO34pEi1HrMGRCzc9YVc8SgJek4DPK9TBcxF4fMx67D5pNeL0mmR8MKML566A+zsfvfs1eMchi0g7OLqEZUvW05F7K9zXGT7oC2mKQ+SQfp/J/Zppk5cwiOmf/yDCs+R12LS0IHLxPKudIM2Nxo+chTHDZoLGp4wz0uvGpcQTflyYYq1NI1Ti5kxbJjaaI+i1p8FDoUToLv26pffQtz4X5ZktL88knvzcJxs55CusWr6JKPCCTJaJdaERKxe1WD5u5I4X+1j9Xxwr04iOigVt+WjTJxnFz8SPv5Vxn3w0B+QVKBjLwfpxw5j4zIBPK1RScrJUpn+PWa2EM1PRW4F317ZDoJ3aoOHPQ7e8ppLpdaNlAP2apoF7M68M6CoViuY81etUlDjuEZEmNjpWhHvgf689gVUrrA02IjyKUdi+5QC6PvMo3nz/GZw6fl7ijPQrbfQyQvzQmkI48k8vQ8SNm9CVhZvPjKSVO11aIJCHG8e6XWDF++4U5ekOfd+JytKnf2cMHtEbB/efIBs2/rFTlqnvoG7gSQTWKzY2DpxGsL5lxeoxXd4rwdt0j9ku+CQzLSEYx/rqdol6eWJj43Hs0Gl4YgzLtI3g0woVl5CE3aeuG8v7n/bfW+Uu/Lp0g7QQr177XikL/TgHAzTToatp1vVNWqGzIWliT27rpr3yDa1f4UyjCVoSbFy/A8HBecgG3eaNN74GBPhJXHxCgnSd0csI8cPGLxz5p/tJn1/sF7JRs8EykooUH5+AqmLzli+H7VsPoKbY4GccLSTYyyyY9SuDYBUOHzgFHh3RNE3iWrV9ANPECvHZM5dRq959EO9b6HZ9kBQpP8yXm7ysI7HMl0dZ/tmwC0k2m0DiGLdt8z6xSd0YPHrCcGbA5xUqM5W71Xhpt9h/SA80aV4LSxaskdXTGwUD8Ta7Nr65OfS6fi0cjz/1MCDaIxsu39C0m4T4Z7Ht0fGt/JjtCi+LreGKaOh7eLQ8Z9hEb7OeIJ6g00i/zX6P9I+0a4jlBvMk4kjLq894FIVDzTvLlSKbVDKWr3OPljKsaaLQwrd5w248wToIf4lSRdGrz2Oi1zyHP9f+Cyp9gi0/EW3/o2kSr59et3orqLiMoHVJYmKi4NuGTt1aECUUi2oP2SP/vmqL7H2rES0AAAX7SURBVKV4VERGevjj2wrlwl6Th/XOlWxsIDSK9Q/wR3A+a68SL974HP6wEfH4BStGxaM9W5PmtaWpEnHOoKIYZrVoUx//brYedwmwXQvG9K9djZDGphq10cZM+pail9i+xUpvQ4NbIRzC0VDXQA7aHtaoey9ooKrTJtt6h5CwYPDYhY535tLOsHXHxuDwjfGzv1oKnpOjWRGHa+zxkm2GrozXYceWg+j1ckc5XLxy2Xo2Lk+eQNxb+S55iy4VmbTsqSg/KtrAYc+hxwvtsH/vcUZ5DL6tUGLI53HNbkHGVm0byHH+TjFU0t/aj3ZoJN6w+7Fx/U480qGhrHXDptarl2VA/PDtHBQUCPZavNZYoOSQiW6lKuXk3eX016xbiY680JJv9gXf/IKOXZpJHIdY9LBR6h8DYJjQsXMzeXRk17aD0Hs7nb5+o/vR/smmJEO1mvfA3996I+3Dj9RD0xa1JZ4/oWH5ZPl40pjharUrgnOhsmLvkrfHEte+UxP88uOfOHLwNGgnSCWhgSvjCHUbVKYD2uFxeMwAZUaXdxnSJR8ViP7a9SuDQ9QOT1rryLrR4JpxnoJPK1Ssk+7c04reCnz5QvKCQyIarOpvd1qe8C3OHqlwkQKymrSwlh7DD+MJLVrXl1i9wTPA22jpsgeim1/MfagkNKylRTdxJvqq5YiyA5XhkfYN5TxEVzYjvT6su18oVECgVaFo9VLydqtRLxNq3bERWD7dALd6rYpES9DLRcVimUhL42hG8nJNuoQ6DarQgVHJqJBE6gpGf6Uq1vLXeaCyvGaaZSGeClq1egV6PQafVqi4TPZQ73eqgrVDH85WWDqoCb56sS4+6FwVL7WogPa1b0ed8oVRukgw/P00FAkNwn2l86NZ5dvQtWFZ9GtTER93q44Zferj7faVPH5wOcmo8k5bApa0o3I+xlOF+uKFurizWAh4CUpWwoBZ/6LbxL/QbNgqdJnwJ16fsQWD5+7AJ8v2Y+6fx7Fy53nsPHEd565HIzExGYVCguRK1OkrUfj78GUs+fsUJq04iEFzt+HU5Ui0ql4y54WsSpClErjlFIrKdDM6Hj0/24DMXO/ljHfr0avS9InLtRduxEjl2XHiGvacuiHPZB0+H4FjF28KZYmSdDxacuVmLG5ExSMyJgExYhUuITEJHz5VDe8+YR2eZOnTVInluAR8WqFiRQN0R0Jfv1gP565Gob/oSdzh8ybt2B41MLCD9XSoN/NVeXlHAj6tUO4M+Wa9+gBOX4nE0EW7vCM5D3KZ+Gwt9G9r3ZD1gF2x5AIJ+LRCBfq7Vrz5/Rri0LkIn1amKb3r4LVH73G3SSj6XCYB11psDlXKFYVa8mZjbDlyFcO/892e6bNeteUKYA6JUWXrRQn4tEIFpNNDBfhZsOydpli16zzG/rTXiyJzL6sx3WugT6u73WNS1LlWAj6tUIFCaZxJNiSPP1YMborvN53E5F8OOiPxCRz3pga0U3Mmn3gYXiqEbyuUkx6qsNjbWS56pmlrjmC6AC/Jye1shopNZbU07rbYcj2DTyuU45CvRMG8WC56pvFL92Ge2EjNWulnXWpUpvefrJp1CaqUco0EfFqhjIsSZYvlwwrRMw2ZvwM//HPaZwWslMlnH41XCpYrFOqekmFYOrAp+s7cipU7znlFMJ5kQgsI1TN5Irlbh8enFYoreZVuz4/vBzTG2J/3SlMiXxU9l8YHdVQWEL76fLxVLp9WKA75Fr7RCCO+34WZa496SyZu5/PNK/XV0rjbUrs1GXJGoVyUJRWKRx/m9W2I5EXdfBZ6PHiXizVSZLe6BHxaoTRNu9Xlr+p3i0nApxXqFpO1qs5/QAJKof4DD1lV0XsSUArlPVmrnG4FCWRQB6VQGQhIRSsJuCMBpVDuSEvRKglkIAGlUBkISEUrCbgjAaVQ7khL0SoJZCABpVAZCEhF55wEcmPOSqFy41NTZfZZCSiF8tlHowqWGyWgFCo3PjVVZp+VgFIon300qmC5UQJKoXLjU8v6MqsUs0gCSqGySJAqGSUBSuD/AAAA//8alPvhAAAABklEQVQDANxUH9GN2wf/AAAAAElFTkSuQmCC" alt="SUNEDU">
        </div>
        <div>
          <div class="title">REGINSA - Registro de Infracciones y Sanciones</div>
          <div class="sub">Informe de Pruebas de Rendimiento</div>
          <div class="sub">Prueba: <strong>\${esc(r.testName)}</strong> &nbsp;|&nbsp; \${r.generatedAt} &nbsp;|&nbsp; Modo: <strong>Multi-IP</strong></div>
        </div>
      </div>
      <div class="std">ISTQB PT · ISO/IEC 25010<br>ISO/IEC 25023 · Google SRE<br><span>SUNEDU - Área de Aseguramiento<br>de Calidad de Software</span></div>
    </header>

    \${indexHtml}

    <section class="section" id="modo">
      <div class="section-title">Modo de Ejecución: \${r.testName} (Multi-IP)</div>
      <div class="section-body">
        Ejecución de rendimiento con métricas agregadas por endpoint, SLO e indicadores SRE.<br>
        IP de origen detectada: <strong class="mono" style="color:#1a237e">\${r.localIps.join(', ')}</strong>
      </div>
    </section>

    <section class="section" id="section-graphics" style="display:none;">
      <div class="section-title">📊 Visualización y Análisis Gráfico del Comportamiento (Chart.js)</div>
      <div class="section-body" style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-around;">
        <div style="flex: 1; min-width: 300px; max-width: 600px; background: #fff; padding: 10px; border-radius: 6px; border: 1px solid #dfe3f5;">
          <h4 style="text-align: center; color: #1a237e; margin: 5px 0 15px;">Tiempos de Respuesta (p95 y p99) por Nodo</h4>
          <canvas id="latenciesChart" style="max-height: 280px;"></canvas>
        </div>
        <div style="flex: 1; min-width: 300px; max-width: 600px; background: #fff; padding: 10px; border-radius: 6px; border: 1px solid #dfe3f5;">
          <h4 style="text-align: center; color: #1a237e; margin: 5px 0 15px;">Distribución y Balanceo de Peticiones</h4>
          <canvas id="balanceChart" style="max-height: 280px;"></canvas>
        </div>
      </div>
    </section>

    \${dashboardHtml.replace(/<h2[^>]*>.*?<\\/h2>/, '<div class="section-title">2. Dashboard Maestro de KPIs</div><div class="section-body">').replace(/$/, '</div>')}
    
    <details class="section" open>
      <summary>🖥️ Matriz de Auditoría — Resumen de Desglose de métricas por IP</summary>
      <div style="overflow-x:auto">
        \${multiIpHtml.replace(/<h2[^>]*>.*?<\\/h2>/, '')}
      </div>
    </details>

    <details class="section" open>
      <summary>⚖️ Distribución y Balanceo de Carga por Nodo de Origen</summary>
      <div style="overflow-x:auto">
        \${sreHtml.replace(/<h2[^>]*>.*?<\\/h2>/, '')}
      </div>
    </details>

    <details class="section" open>
      <summary>✅ Criterios de Aceptación QA/SRE</summary>
      <div style="overflow-x:auto">
        \${qaHtml.replace(/<h2[^>]*>.*?<\\/h2>/, '')}
      </div>
    </details>

    <details class="section" open>
      <summary>📝 Resumen de Respuestas HTTP</summary>
      <div class="section-body">
        \${httpHtml.replace(/<h2[^>]*>.*?<\\/h2>/, '')}
      </div>
    </details>

    <details class="section" open>
      <summary>🔍 Análisis Granular por Nodo</summary>
      <div class="section-body">
        \${granularHtml.replace(/<h2[^>]*>.*?<\\/h2>/, '')}
      </div>
    </details>

    <details class="section" open>
      <summary>⏱️ Descomposición de Latencia</summary>
      <div class="section-body">
        \${latencyHtml.replace(/<h2[^>]*>.*?<\\/h2>/, '')}
      </div>
    </details>

    <details class="section" open>
      <summary>🔌 Análisis por Endpoint</summary>
      <div class="section-body">
        \${endpointHtml.replace(/<h2[^>]*>.*?<\\/h2>/, '')}
      </div>
    </details>

    <details class="section" open>
      <summary>🌐 Red e Infraestructura</summary>
      <div class="section-body">
        \${networkHtml.replace(/<h2[^>]*>.*?<\\/h2>/, '')}
      </div>
    </details>

    <details class="section" open>
      <summary>📖 Leyenda de Métricas</summary>
      <div class="section-body">
        \${legendHtml.replace(/<h2[^>]*>.*?<\\/h2>/, '')}
      </div>
    </details>
    
    <details class="section recommendation" open>
      <summary>💡 Recomendación Técnica</summary>
      <div class="section-body">
        \${recommendationHtml.replace(/<h2[^>]*>.*?<\\/h2>/, '')}
      </div>
    </details>
  </div>
  
  \${k6PanelHtml}
  \${chartsScript}
</body>
</html>`;

// Build new string
const regexCss = /const STYLE = \`[\\s\\S]*?\`;/;
const regexLayout = /const html = \`<!DOCTYPE html>[\\s\\S]*?<\/html>\`;/;

let final = content;
final = final.replace(regexCss, 'const STYLE = `' + newCss + '`;');
final = final.replace(regexLayout, 'const html = `' + newLayout + '`;');

fs.writeFileSync('tools/generar-html.js', final);
