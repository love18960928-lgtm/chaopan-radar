'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const engine=require(path.join(root,'sector-stage-v325.js'));
const snap=JSON.parse(fs.readFileSync(path.join(root,'data/universe.json'),'utf8'));
let audited=0,selected=0,low=0;
for(const c of snap.rows){
 const v=engine.validate(c,snap.asOf);
 if(!v)continue;
 audited++;
 const eligible=engine.liquidityOK(v);
 if(!eligible)low++;
 const a=engine.inspect(c,snap.asOf);
 const t=engine.inspectTrend(c,snap.asOf);
 const leader=engine.leaderAudit(c,v);
 const six=engine.sixLineAudit(c,v);
 if(!eligible){
   assert.ok(['blocked','unknown','none'].includes(a.stage),`${c.code} incorrectly in ${a.stage}`);
   assert.equal(t,null,`${c.code} incorrectly in trend`);
   assert.equal(leader.eligible,false,`${c.code} incorrectly in leader`);
   assert.equal(six.confirmed,false,`${c.code} incorrectly six-line confirmed`);
 } else if(!['blocked','unknown','none'].includes(a.stage)||t||leader.eligible||six.confirmed) selected++;
}
const result=engine.analyze(snap.rows,snap.asOf);
for(const o of result.watch){assert.ok(engine.liquidityOK(o.snapshot),`${o.row.code} ${o.stage} not liquid`);}
for(const g of result.coverage){for(const l of g.leaders){assert.ok(engine.liquidityOK(l.snapshot),`${l.row.code} leader not liquid`);}}
assert.ok(audited>1000,'snapshot coverage unexpectedly low');
console.log(JSON.stringify({date:snap.asOf,audited,excludedByLiquidity:low,eligibleSelected:selected,watch:result.watch.length,counts:result.counts},null,2));
