const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','app-detail-swipe-v222.js'),'utf8');
const src=s.slice(s.indexOf('function detectConsolidation(all){'),s.indexOf('function detectPriceGaps(all){'));
const ctx={};vm.createContext(ctx);vm.runInContext(src,ctx);
const bar=(i,h,l,c,v=1000)=>['d'+i,c,h,l,c,v];
const base=Array.from({length:29},(_,i)=>bar(i,i%6===0?106:103,i%6===3?94:97,100+(i%3-1)));
assert(ctx.detectConsolidation([...base,bar(29,114,108,112,2000)]));
assert.equal(ctx.auditConsolidationBreakout({bars:base.map((b,i)=>i===5?[b[0],b[1],null,b[3],b[4],b[5]]:b)}).status,'data_gap');
assert.equal(ctx.auditConsolidationBreakout({bars:[...base,bar(29,114,108,112,null)]}).status,'pending');
// Repeated touches of the same upper edge without an intervening retreat must not count as two tests.
const sticky=Array.from({length:30},(_,i)=>bar(i,106,i%6===3?94:97,104.8));
assert.equal(ctx.detectConsolidation(sticky),null);
console.log('r60: 4 boundary/data assertions passed');
