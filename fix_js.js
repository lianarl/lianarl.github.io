const fs = require('fs');
let code = fs.readFileSync('js/shop.js', 'utf8');
code = code.replace(/https:\/\/www\.medikem\.si\/proizvajalec\/\$\{M\.fold\(p\.brand\)\.replace\(\/\\s\+\/g, '-'\)\}\//g, "izdelki.html?kategorija=${M.fold(p.brand).replace(/\\s+/g, '-')}");
fs.writeFileSync('js/shop.js', code);
console.log("Fixed js/shop.js");
