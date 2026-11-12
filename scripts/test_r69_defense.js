const fs=require('fs'),vm=require('vm'),assert=require('assert');
const s=fs.readFileSync(require('path').join(__dirname,'../app-detail-swipe-v222.js'),'utf8');
const part=s.slice(s.indexOf('function defensiveEarlyWarning(c){'),s.indexOf('function guidanceCard(c){'));
const ctx={};vm.createContext(ctx);vm.runInContext(part,ctx);
const f=ctx.defensiveEarlyWarning;
const bars=(n,fn)=>Array.from({length:n},(_,i)=>{const x=fn(i);return [`2026-10-${String(i+1).padStart(2,'0')}`,x,x+1,x-1,x,1000]});
assert.strictEqual(f({bars:[]}).stage,'unknown');
const stable=bars(30,()=>100);assert.strictEqual(f({bars:stable}).stage,'normal');
const gap=bars(30,()=>100);gap[29][5]=null;assert.strictEqual(f({bars:gap}).stage,'unknown');
// Falling series must not generate a bullish-stage warning.
const falling=bars(30,i=>140-i);assert.notStrictEqual(f({bars:falling}).stage,'zero');
// A first weak day can only be labeled first, never second.
const first=bars(30,i=>100+i*.7);first[29][4]=first[29][2]=first[29][3]=first[29][1]=105;
assert.notStrictEqual(f({bars:first}).stage,'second');
// Avoid stale second-day labels when two weak closes are not sequential first/second.
const stale=bars(30,i=>i<20?100+i:115);assert.notStrictEqual(f({bars:stale}).stage,'second');
console.log('r69 defensive checks passed: 6');
