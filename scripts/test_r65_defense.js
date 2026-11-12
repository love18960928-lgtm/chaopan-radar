// r65 static checks (runtime scenarios require complete app harness)
const fs=require('fs'),assert=require('assert');
const s=fs.readFileSync(require('path').join(__dirname,'../app-detail-swipe-v222.js'),'utf8');
assert(s.includes('function defensiveEarlyWarning(c)'));
assert(s.includes('bars.length<26'));
assert(s.includes("stage:'zero'"));
assert(s.includes("stage:'first'"));
assert(s.includes("stage:'second'"));
assert(s.includes('esc(defensiveEarlyWarning(c).text)'));
console.log('r65 static checks: 6 passed');
