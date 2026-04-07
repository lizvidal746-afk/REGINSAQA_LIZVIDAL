<!-- markdownlint-disable MD001 MD012 MD013 MD034 MD060 -->

# ZAP Scanning Report

ZAP by [Checkmarx](https://checkmarx.com/).

## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 0 |
| Medium | 5 |
| Low | 4 |
| Informational | 2 |

## Insights

| Level | Reason | Site | Description | Statistic |
| --- | --- | --- | --- | --- |
| Low | Warning |  | ZAP errors logged - see the zap.log file for details | 1    |
| Low | Warning |  | ZAP warnings logged - see the zap.log file for details | 8    |
| Info | Informational |  | Percentage of network failures | 45 % |
| Info | Informational | <https://reginsaqa.sunedu.gob.pe> | Percentage of responses with status code 2xx | 100 % |
| Info | Informational | <https://reginsaqa.sunedu.gob.pe> | Percentage of endpoints with content type application/javascript | 30 % |
| Info | Informational | <https://reginsaqa.sunedu.gob.pe> | Percentage of endpoints with content type image/x-icon | 10 % |
| Info | Informational | <https://reginsaqa.sunedu.gob.pe> | Percentage of endpoints with content type text/css | 30 % |
| Info | Informational | <https://reginsaqa.sunedu.gob.pe> | Percentage of endpoints with content type text/html | 30 % |
| Info | Informational | <https://reginsaqa.sunedu.gob.pe> | Percentage of endpoints with method GET | 100 % |
| Info | Informational | <https://reginsaqa.sunedu.gob.pe> | Count of total endpoints | 10    |
| Info | Informational | <https://reginsaqa.sunedu.gob.pe> | Percentage of slow responses | 54 % |

## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| CSP: Failure to Define Directive with No Fallback | Medium | 3 |
| CSP: Wildcard Directive | Medium | 3 |
| CSP: script-src unsafe-eval | Medium | 3 |
| CSP: script-src unsafe-inline | Medium | 3 |
| CSP: style-src unsafe-inline | Medium | 3 |
| CSP: Notices | Low | 3 |
| Server Leaks Information via "X-Powered-By" HTTP Response Header Field(s) | Low | Systemic |
| Server Leaks Version Information via "Server" HTTP Response Header Field | Low | Systemic |
| Timestamp Disclosure - Unix | Low | Systemic |
| Modern Web Application | Informational | 3 |
| Re-examine Cache-control Directives | Informational | 1 |

## Alert Detail

### [CSP: Failure to Define Directive with No Fallback](https://www.zaproxy.org/docs/alerts/10055/)

#### Medium (High)

### Description

The Content Security Policy fails to define one of the directives that has no fallback. Missing/excluding them is the same as allowing anything.

* URL: <https://reginsaqa.sunedu.gob.pe/>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `The directive(s): form-action is/are among the directives that do not fallback to default-src.`
* URL: <https://reginsaqa.sunedu.gob.pe/robots.txt>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/robots.txt`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `The directive(s): form-action is/are among the directives that do not fallback to default-src.`
* URL: <https://reginsaqa.sunedu.gob.pe/sitemap.xml>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `The directive(s): form-action is/are among the directives that do not fallback to default-src.`

Instances: 3

### Solution

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference

* [https://www.w3.org/TR/CSP/](https://www.w3.org/TR/CSP/)
* [https://caniuse.com/#search=content+security+policy](https://caniuse.com/#search=content+security+policy)
* [https://content-security-policy.com/](https://content-security-policy.com/)
* [https://github.com/HtmlUnit/htmlunit-csp](https://github.com/HtmlUnit/htmlunit-csp)
* [https://web.dev/articles/csp#resource-options](https://web.dev/articles/csp#resource-options)

#### CWE Id: [693](https://cwe.mitre.org/data/definitions/693.html)

#### WASC Id: 15

#### Source ID: 3

### [CSP: Wildcard Directive](https://www.zaproxy.org/docs/alerts/10055/)

#### Medium (High) (2)

### Description (2)

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page â€” covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: <https://reginsaqa.sunedu.gob.pe/>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:

script-src, style-src, img-src, font-src, worker-src`

* URL: <https://reginsaqa.sunedu.gob.pe/robots.txt>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/robots.txt`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:

script-src, style-src, img-src, font-src, worker-src`

* URL: <https://reginsaqa.sunedu.gob.pe/sitemap.xml>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `The following directives either allow wildcard sources (or ancestors), are not defined, or are overly broadly defined:

script-src, style-src, img-src, font-src, worker-src`

Instances: 3

### Solution (2)

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference (2)

* [https://www.w3.org/TR/CSP/](https://www.w3.org/TR/CSP/)
* [https://caniuse.com/#search=content+security+policy](https://caniuse.com/#search=content+security+policy)
* [https://content-security-policy.com/](https://content-security-policy.com/)
* [https://github.com/HtmlUnit/htmlunit-csp](https://github.com/HtmlUnit/htmlunit-csp)
* [https://web.dev/articles/csp#resource-options](https://web.dev/articles/csp#resource-options)

#### CWE Id: [693](https://cwe.mitre.org/data/definitions/693.html) (2)

#### WASC Id: 15 (2)

#### Source ID: 3 (2)

### [CSP: script-src unsafe-eval](https://www.zaproxy.org/docs/alerts/10055/)

#### Medium (High) (3)

### Description (3)

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page â€” covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: <https://reginsaqa.sunedu.gob.pe/>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `script-src includes unsafe-eval.`
* URL: <https://reginsaqa.sunedu.gob.pe/robots.txt>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/robots.txt`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `script-src includes unsafe-eval.`
* URL: <https://reginsaqa.sunedu.gob.pe/sitemap.xml>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `script-src includes unsafe-eval.`

Instances: 3

### Solution (3)

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference (3)

* [https://www.w3.org/TR/CSP/](https://www.w3.org/TR/CSP/)
* [https://caniuse.com/#search=content+security+policy](https://caniuse.com/#search=content+security+policy)
* [https://content-security-policy.com/](https://content-security-policy.com/)
* [https://github.com/HtmlUnit/htmlunit-csp](https://github.com/HtmlUnit/htmlunit-csp)
* [https://web.dev/articles/csp#resource-options](https://web.dev/articles/csp#resource-options)

#### CWE Id: [693](https://cwe.mitre.org/data/definitions/693.html) (3)

#### WASC Id: 15 (3)

#### Source ID: 3 (3)

### [CSP: script-src unsafe-inline](https://www.zaproxy.org/docs/alerts/10055/)

#### Medium (High) (4)

### Description (4)

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page â€” covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: <https://reginsaqa.sunedu.gob.pe/>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `script-src includes unsafe-inline.`
* URL: <https://reginsaqa.sunedu.gob.pe/robots.txt>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/robots.txt`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `script-src includes unsafe-inline.`
* URL: <https://reginsaqa.sunedu.gob.pe/sitemap.xml>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `script-src includes unsafe-inline.`

Instances: 3

### Solution (4)

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference (4)

* [https://www.w3.org/TR/CSP/](https://www.w3.org/TR/CSP/)
* [https://caniuse.com/#search=content+security+policy](https://caniuse.com/#search=content+security+policy)
* [https://content-security-policy.com/](https://content-security-policy.com/)
* [https://github.com/HtmlUnit/htmlunit-csp](https://github.com/HtmlUnit/htmlunit-csp)
* [https://web.dev/articles/csp#resource-options](https://web.dev/articles/csp#resource-options)

#### CWE Id: [693](https://cwe.mitre.org/data/definitions/693.html) (4)

#### WASC Id: 15 (4)

#### Source ID: 3 (4)

### [CSP: style-src unsafe-inline](https://www.zaproxy.org/docs/alerts/10055/)

#### Medium (High) (5)

### Description (5)

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page â€” covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: <https://reginsaqa.sunedu.gob.pe/>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `style-src includes unsafe-inline.`
* URL: <https://reginsaqa.sunedu.gob.pe/robots.txt>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/robots.txt`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `style-src includes unsafe-inline.`
* URL: <https://reginsaqa.sunedu.gob.pe/sitemap.xml>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `style-src includes unsafe-inline.`

Instances: 3

### Solution (5)

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference (5)

* [https://www.w3.org/TR/CSP/](https://www.w3.org/TR/CSP/)
* [https://caniuse.com/#search=content+security+policy](https://caniuse.com/#search=content+security+policy)
* [https://content-security-policy.com/](https://content-security-policy.com/)
* [https://github.com/HtmlUnit/htmlunit-csp](https://github.com/HtmlUnit/htmlunit-csp)
* [https://web.dev/articles/csp#resource-options](https://web.dev/articles/csp#resource-options)

#### CWE Id: [693](https://cwe.mitre.org/data/definitions/693.html) (5)

#### WASC Id: 15 (5)

#### Source ID: 3 (5)

### [CSP: Notices](https://www.zaproxy.org/docs/alerts/10055/)

#### Low (High)

### Description (6)

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page â€” covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: <https://reginsaqa.sunedu.gob.pe/>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `Warnings:

Duplicate host https://*.gstatic.com
`

* URL: <https://reginsaqa.sunedu.gob.pe/robots.txt>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/robots.txt`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `Warnings:

Duplicate host https://*.gstatic.com
`

* URL: <https://reginsaqa.sunedu.gob.pe/sitemap.xml>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self';            script-src 'self' 'unsafe-inline' 'unsafe-eval'            https:            https://*.sunedu.gob.pe           https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://*.cloudflare.com           https://api.ipify.org;           style-src 'self' 'unsafe-inline'            https:            https://*.google.com           https://*.gstatic.com           https://*.googleapis.com;           img-src 'self' data:            https:            https://*.google.com            https://*.gstatic.com           https://*.googletagmanager.com           https://*.google-analytics.com           https://stats.g.doubleclick.net           https://*.googleusercontent.com;           font-src 'self'            https:            https://*.gstatic.com           https://*.gstatic.com;           object-src 'none';            base-uri 'self';            frame-src 'self'            https://*.google.com           https://*.googletagmanager.com           https://*.cloudflare.com;           connect-src 'self'            https://*.google.com           https://*.google-analytics.com           https://*.googleapis.com           https://*.gstatic.com           https://*.cloudflare.com           https://stats.g.doubleclick.net           https://api.ipify.org           https://*.sunedu.gob.pe;           frame-ancestors 'self'            https://enlineadesa.sunedu.gob.pe           https://enlineaqa.sunedu.gob.pe           https://enlinea.sunedu.gob.pe           https://reginsa.sunedu.gob.pe           https://reginsaqa.sunedu.gob.pe           https://reginsadesa.sunedu.gob.pe;`
  * Other Info: `Warnings:

Duplicate host https://*.gstatic.com
`

Instances: 3

### Solution (6)

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference (6)

* [https://www.w3.org/TR/CSP/](https://www.w3.org/TR/CSP/)
* [https://caniuse.com/#search=content+security+policy](https://caniuse.com/#search=content+security+policy)
* [https://content-security-policy.com/](https://content-security-policy.com/)
* [https://github.com/HtmlUnit/htmlunit-csp](https://github.com/HtmlUnit/htmlunit-csp)
* [https://web.dev/articles/csp#resource-options](https://web.dev/articles/csp#resource-options)

#### CWE Id: [693](https://cwe.mitre.org/data/definitions/693.html) (6)

#### WASC Id: 15 (6)

#### Source ID: 3 (6)

### [Server Leaks Information via "X-Powered-By" HTTP Response Header Field(s)](https://www.zaproxy.org/docs/alerts/10037/)

#### Low (Medium)

### Description (7)

The web/application server is leaking information via one or more "X-Powered-By" HTTP response headers. Access to such information may facilitate attackers identifying other frameworks/components your web application is reliant upon and the vulnerabilities such components may be subject to.

* URL: <https://reginsaqa.sunedu.gob.pe/>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `X-Powered-By: ASP.NET`
  * Other Info: ``
* URL: <https://reginsaqa.sunedu.gob.pe/assets/layout/styles/layout/preloading.css>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/assets/layout/styles/layout/preloading.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `X-Powered-By: ASP.NET`
  * Other Info: ``
* URL: <https://reginsaqa.sunedu.gob.pe/robots.txt>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `X-Powered-By: ASP.NET`
  * Other Info: ``
* URL: <https://reginsaqa.sunedu.gob.pe/runtime.js>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/runtime.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `X-Powered-By: ASP.NET`
  * Other Info: ``
* URL: <https://reginsaqa.sunedu.gob.pe/sitemap.xml>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/sitemap.xml`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `X-Powered-By: ASP.NET`
  * Other Info: ``

Instances: Systemic

### Solution (7)

Ensure that your web server, application server, load balancer, etc. is configured to suppress "X-Powered-By" headers.

### Reference (7)

* [https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/01-Information_Gathering/08-Fingerprint_Web_Application_Framework](https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/01-Information_Gathering/08-Fingerprint_Web_Application_Framework)
* [https://www.troyhunt.com/shhh-dont-let-your-response-headers/](https://www.troyhunt.com/shhh-dont-let-your-response-headers/)

#### CWE Id: [497](https://cwe.mitre.org/data/definitions/497.html)

#### WASC Id: 13

#### Source ID: 3 (7)

### [Server Leaks Version Information via "Server" HTTP Response Header Field](https://www.zaproxy.org/docs/alerts/10036/)

#### Low (High) (2)

### Description (8)

The web/application server is leaking version information via the "Server" HTTP response header. Access to such information may facilitate attackers identifying other vulnerabilities your web/application server is subject to.

* URL: <https://reginsaqa.sunedu.gob.pe/>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `Microsoft-IIS/10.0`
  * Other Info: ``
* URL: <https://reginsaqa.sunedu.gob.pe/assets/layout/styles/layout/preloading.css>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/assets/layout/styles/layout/preloading.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `Microsoft-IIS/10.0`
  * Other Info: ``
* URL: <https://reginsaqa.sunedu.gob.pe/robots.txt>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `Microsoft-IIS/10.0`
  * Other Info: ``
* URL: <https://reginsaqa.sunedu.gob.pe/runtime.js>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/runtime.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `Microsoft-IIS/10.0`
  * Other Info: ``
* URL: <https://reginsaqa.sunedu.gob.pe/sitemap.xml>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/sitemap.xml`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `Microsoft-IIS/10.0`
  * Other Info: ``

Instances: Systemic

### Solution (8)

Ensure that your web server, application server, load balancer, etc. is configured to suppress the "Server" header or provide generic details.

### Reference (8)

* [https://httpd.apache.org/docs/current/mod/core.html#servertokens](https://httpd.apache.org/docs/current/mod/core.html#servertokens)
* [https://learn.microsoft.com/en-us/previous-versions/msp-n-p/ff648552(v=pandp.10)](https://learn.microsoft.com/en-us/previous-versions/msp-n-p/ff648552(v=pandp.10))
* [https://www.troyhunt.com/shhh-dont-let-your-response-headers/](https://www.troyhunt.com/shhh-dont-let-your-response-headers/)

#### CWE Id: [497](https://cwe.mitre.org/data/definitions/497.html) (2)

#### WASC Id: 13 (2)

#### Source ID: 3 (8)

### [Timestamp Disclosure - Unix](https://www.zaproxy.org/docs/alerts/10096/)

#### Low (Low)

### Description (9)

A timestamp was disclosed by the application/web server. - Unix

* URL: <https://reginsaqa.sunedu.gob.pe/main.js>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/main.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `1667834072`
  * Other Info: `1667834072, which evaluates to: 2022-11-07 15:14:32.`
* URL: <https://reginsaqa.sunedu.gob.pe/main.js>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/main.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `1780907670`
  * Other Info: `1780907670, which evaluates to: 2026-06-08 08:34:30.`
* URL: <https://reginsaqa.sunedu.gob.pe/main.js>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/main.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `1901547113`
  * Other Info: `1901547113, which evaluates to: 2030-04-04 15:31:53.`
* URL: <https://reginsaqa.sunedu.gob.pe/main.js>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/main.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `1904987480`
  * Other Info: `1904987480, which evaluates to: 2030-05-14 11:11:20.`
* URL: <https://reginsaqa.sunedu.gob.pe/main.js>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/main.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `1921955416`
  * Other Info: `1921955416, which evaluates to: 2030-11-26 20:30:16.`

Instances: Systemic

### Solution (9)

Manually confirm that the timestamp data is not sensitive, and that the data cannot be aggregated to disclose exploitable patterns.

### Reference (9)

* [https://cwe.mitre.org/data/definitions/200.html](https://cwe.mitre.org/data/definitions/200.html)

#### CWE Id: [497](https://cwe.mitre.org/data/definitions/497.html) (3)

#### WASC Id: 13 (3)

#### Source ID: 3 (9)

### [Modern Web Application](https://www.zaproxy.org/docs/alerts/10109/)

#### Informational (Medium)

### Description (10)

The application appears to be a modern web application. If you need to explore it automatically then the Ajax Spider may well be more effective than the standard one.

* URL: <https://reginsaqa.sunedu.gob.pe/>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="runtime.js" type="module"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: <https://reginsaqa.sunedu.gob.pe/robots.txt>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="runtime.js" type="module"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: <https://reginsaqa.sunedu.gob.pe/sitemap.xml>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/sitemap.xml`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="runtime.js" type="module"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`

Instances: 3

### Solution (10)

This is an informational alert and so no changes are required.

### Reference (10)

#### Source ID: 3 (10)

### [Re-examine Cache-control Directives](https://www.zaproxy.org/docs/alerts/10015/)

#### Informational (Low)

### Description (11)

The cache-control header has not been set properly or is missing, allowing the browser and proxies to cache content. For static assets like css, js, or image files this might be intended, however, the resources should be reviewed to ensure that no sensitive content will be cached.

* URL: <https://reginsaqa.sunedu.gob.pe/>
  * Node Name: `https://reginsaqa.sunedu.gob.pe/`
  * Method: `GET`
  * Parameter: `cache-control`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``

Instances: 1

### Solution (11)

For secure content, ensure the cache-control HTTP header is set with "no-cache, no-store, must-revalidate". If an asset should be cached consider setting the directives "public, max-age, immutable".

### Reference (11)

* [https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#web-content-caching](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#web-content-caching)
* [https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)
* [https://grayduck.mn/2021/09/13/cache-control-recommendations/](https://grayduck.mn/2021/09/13/cache-control-recommendations/)

#### CWE Id: [525](https://cwe.mitre.org/data/definitions/525.html)

#### WASC Id: 13 (4)

#### Source ID: 3 (11)

