const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const ctx={};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../support-resistance-lines-v1.js'),'utf8'),ctx);
const fn=ctx.ChaopanTrendLines.analyze;
const date=i=>new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);
function make(n=80){return Array.from({length:n},(_,i)=>{let low=90+i*.1+(i%11===5?-5:0),high=low+10+(i%13===6?6:0),close=low+5;return [date(i),low+4,high,low,close,1000+i];});}
let b=make();assert.equal(fn(b,b.at(-1)[0]).status,'ok');assert.ok(fn(b,b.at(-1)[0]).supports.length>0);assert.ok(fn(b,b.at(-1)[0]).resistances.length>0);
assert.equal(fn(b,'2026-01-01').status,'insufficient');assert.equal(fn(b.slice(0,10)).status,'insufficient');
const dup=make();dup[10][0]=dup[9][0];assert.equal(fn(dup).status,'insufficient');
const malformed=make();malformed[10][2]=1;assert.equal(fn(malformed).status,'insufficient');
const future=make();future.push([...future.at(-1)]);future.at(-1)[0]=date(81);assert.equal(fn(future,date(79)).status,'insufficient');
const noLookahead=make();const first=fn(noLookahead.slice(0,70));const later=fn(noLookahead.slice(0,70));assert.equal(JSON.stringify(first),JSON.stringify(later));
console.log('Support/resistance 7 tests passed');
