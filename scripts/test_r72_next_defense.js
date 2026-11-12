// r73 compatibility regression: r72's unconditional '第0根' display was intentionally removed.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../app-detail-swipe-v222.js','utf8');
const start=src.indexOf('function defensiveEarlyWarning(c){'),end=src.indexOf('function defenseHistory(bars, maxBars=60){');
const ctx={};vm.createContext(ctx);
vm.runInContext('const esc=s=>String(s);const price=v=>Number(v).toFixed(2);const overheadResistance=c=>({levels:[]});'+src.slice(start,end)+';this.calc=nextSessionDefense;this.card=nextSessionDefenseCard;',ctx);
const bars=Array.from({length:30},(_,i)=>{const v=100+i*.5;return [`2026-10-${String(i+1).padStart(2,'0')}`,v,v+2,v-2,v,1000]});
const c={bars,date:bars.at(-1)[0]};
assert.equal(ctx.calc(c).status,'none');
assert.equal(ctx.card(c),'');
assert.equal(ctx.calc({...c,date:'2026-11-01'}).status,'stale');
assert.equal(ctx.calc({...c,bars:bars.slice(0,20)}).status,'insufficient');
const broken=bars.map(b=>[...b]);broken.at(-1)[5]=null;assert.equal(ctx.calc({bars:broken,date:c.date}).status,'invalid');
assert.equal(ctx.calc({bars:bars.slice(0,29),date:bars[28][0]}).asOf,bars[28][0]);
console.log('r72 compatibility: 6 checks passed');
