const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'..','app-detail-swipe-v222.js'),'utf8');
const part=src.slice(src.indexOf('function detectConsolidation(all){'),src.indexOf('function auditConsolidationBreakout(c){'));
const ctx={};vm.createContext(ctx);vm.runInContext(part,ctx);
function bars(n,up=false){return Array.from({length:n},(_,i)=>{let x=100+Math.sin(i*1.1)*2+(up&&i>=n-5?2:0);return [`2026-${String(Math.floor(i/28)+1).padStart(2,'0')}-${String(i%28+1).padStart(2,'0')}`,x-1,x+3,x-3,x,1000+(i%5)*80]})}
const cases=[{bars:[]},{bars:bars(10)},{bars:bars(40)},{bars:bars(40,true)}];
for(const c of cases){const r=ctx.consolidationDirection(c);assert(r&&typeof r.text==='string');assert(!r.text.includes('已確認向上突破'));}
assert.strictEqual(ctx.consolidationDirection({bars:[]}).status,'unavailable');
const broken=bars(40);broken[15][4]=null;assert.strictEqual(ctx.consolidationDirection({bars:broken}).status,'unavailable');
const down=bars(40).map((b,i)=>[b[0],b[1],b[2]-i*2,b[3]-i*2,b[4]-i*2,b[5]]);
assert.notStrictEqual(ctx.consolidationDirection({bars:down}).status,'prebreakout');
console.log('r64 direction checks passed: 7 assertions');
