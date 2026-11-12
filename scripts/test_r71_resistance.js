const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../app-detail-swipe-v222.js','utf8');
const block=src.slice(src.indexOf('// r71: ranked overhead resistance;'),src.indexOf('function cyclePanel(c){'));
const ctx={};vm.createContext(ctx);
vm.runInContext('const numeric=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null; const latestNeck=c=>c.neck; const price=n=>Number(n).toFixed(2); const esc=s=>String(s);'+block+';this.run=overheadResistance;this.render=resistanceRadarCard;',ctx);
const bars=[];for(let i=0;i<120;i++){let v=110+i*.15;if(i>55)v=119-(i-55)*.18;bars.push([new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),v,v+2,v-2,v,1000+(i%9)*80]);}
const c={bars,date:bars.at(-1)[0],close:bars.at(-1)[3],neck:115,structureV23:{necklines:[{price:112,date:bars[80][0]}]}};
const a=ctx.run(c);assert(a.levels.length>0);assert(a.levels.every(x=>x.price>c.close));assert(a.levels.every((x,i)=>i===0||x.price>=a.levels[i-1].price));assert(ctx.render(c).includes('上方壓力'));
assert.equal(ctx.run({...c,date:'2026-12-31'}).levels.length,0);
assert.equal(ctx.run({...c,bars:bars.slice(0,10)}).levels.length,0);
assert.equal(ctx.run({...c,close:999}).levels.length,0);
assert.equal(ctx.run({...c,bars:[...bars.slice(0,119),bars[118]]}).levels.length,0);
console.log('r71: 8 checks passed');
