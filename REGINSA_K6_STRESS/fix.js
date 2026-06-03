const fs = require('fs');
let c = fs.readFileSync('tools/generar-html.js', 'utf8');
c = c.replace(/\\`/g, '`');
c = c.replace(/\\\${/g, '${');
c = c.replace(/\\\\s/g, '\\s');
c = c.replace(/\\\\d/g, '\\d');
fs.writeFileSync('tools/generar-html.js', c);
console.log('Fixed');
