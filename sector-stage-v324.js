/* Chaopan RADAR r24 - automatic EOD sector and neckline observation radar.
   Self-contained, testable; this is NOT a certified entry signal or live feed.
   The curated passive component tag is a limited, explicitly disclosed sample.
*/
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanSectorV324=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const num=x=>x===null||x===undefined||x===''||typeof x==='boolean'||!Number.isFinite(Number(x))?null:Number(x);
 const mean=(a)=>a.length?a.reduce((p,c)=>p+c,0)/a.length:null;
 const median=a=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y);return (b[(b.length-1)>>1]+b[b.length>>1])/2};
 const themeCodes=new Set(['2327','2492','2375','2472','3026']); // limited, not the entire passive-components universe
 const banned=/假突破|跌破|突破失敗|結構破壞|出貨|賣壓|轉弱|不宜追價|破位|長上影警戒/;
 function sectorName(c){const name=String(c?.industry||c?.fundamentals?.industry||'').trim();if(!name||/未分類|待分類|不詳|未知/.test(name))return null;
  if(themeCodes.has(String(c.code))&&name==='電子零組件業')return '被動元件（代表股5檔）';
  return name;
 }
 function validate(c,asOf){
  if(!c||c.date!==asOf||!/^(19|20)\d{2}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf+'T00:00:00Z'))||new Date(asOf+'T00:00:00Z').toISOString().slice(0,10)!==asOf||!/^[0-9]{4}$/.test(String(c.code)))return null;
  const bars=c.bars;if(!Array.isArray(bars)||bars.length<22)return null;
  let previous='';let i=0;
  for(const b of bars){
   if(!Array.isArray(b)||b.length<6||typeof b[0]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b[0])||b[0]<=previous||b[0]>asOf)return null;
   previous=b[0];const [o,h,l,x,v]=b.slice(1,6).map(num);
   if([o,h,l,x,v].some(k=>k===null)||Math.min(o,h,l,x)<=0||h<Math.max(o,x)||l>Math.min(o,x)||v<0)return null;
   i++;
  }
  if(bars.at(-1)[0]!==asOf)return null;
  const last=bars.at(-1),[o,h,l,cl,v]=last.slice(1,6).map(num);
  for(const [key,value] of [['close',cl],['open',o],['high',h],['low',l],['lots',v]]){
   const actual=num(c[key]);if(actual===null||Math.abs(actual-value)>Math.max(.001,value*.00001))return null;
  }
  if(!(v>0))return null;
  const avg20=mean(bars.slice(-21,-1).map(x=>num(x[5])));
  const ma=(n,end=bars.length)=>mean(bars.slice(end-n,end).map(x=>num(x[4])));
  if(!(avg20>0))return null;
  const prev=num(bars.at(-2)[4]),prev2=num(bars.at(-3)[4]);
  const range=h-l,position=range>0?(cl-l)/range:1,upper=range>0?(h-Math.max(o,cl))/range:0;
  const neck=num(c.neck),close20=ma(20),close10=ma(10),old20=ma(20,bars.length-5);
  const ratio=v/avg20;
  return {close:cl,open:o,high:h,low:l,prev,prev2,neck,ma20:close20,ma10:close10,old20,
   volume:v,ratio,position,upper,changePct:prev>0?100*(cl/prev-1):null,
   dayTradingValue:cl*v,avgLots:avg20};
 }
 function inspect(c,asOf,stage){
  const v=validate(c,asOf);if(!v)return {stage:'unknown',reason:'價格／日期／成交量資料不完整',snapshot:null};
  const x={stage:'none',reason:'暫不符合本輪觀察條件',snapshot:v};
  if(c.possiblePriceAdjustment||c.overextended||c.onePriceLimit||c.riskFirst||['high','medium'].includes(String(c.riskLevel||''))||
     banned.test([c.followStatus,c.unifiedStage,c.trading?.status].join(' '))||
     ['danger','supply','unknown'].includes(stage?.kind)){
   x.stage='blocked';x.reason='結構或賣壓風險，禁止列入進場觀察';return x;
  }
  // Minimum liquidity, wick and chase gate independent of upstream scores.
  if(v.avgLots<300||v.volume<50||v.dayTradingValue<10000||v.high<=v.low||v.upper>=.44&&v.position<=.45||
     v.ratio>=2&&v.position<.32||v.ma20===null||v.close<v.ma20*.99||
     v.close/v.ma20>1.12){x.stage='blocked';x.reason='量能、長上影、MA20位置或乖離未通過';return x;}
  if(!(v.neck>0&&v.neck<Infinity)){x.reason='缺可核對的歷史頸線';return x;}
  const bars=c.bars;
  const cycleDate=String(c.cycle?.initialDate||'');
  const ix=bars.findIndex(b=>b[0]===cycleDate);
  const eventBar=ix>0?bars[ix]:null,preEvent=ix>0?bars[ix-1]:null;
  // Stage 2/3 only applies to an actual historical breakout event; a matching
  // cycle date/price label alone is insufficient and may refer to a failed push.
  const reliableBreak=Boolean(eventBar&&preEvent&&num(c.cycle?.level)!==null&&
   Math.abs(Number(c.cycle.level)/v.neck-1)<.03&&
   Number(eventBar[4])>=v.neck&&Number(preEvent[4])<=v.neck&&
   Number(eventBar[5])>0);
  const trendOK=v.ma20!==null&&v.old20!==null&&v.ma20>=v.old20*.98;
  const maGrowing=v.old20!==null&&v.ma20>=v.old20*.995;
  if(v.close>=v.neck&&v.prev<=v.neck&&v.ratio>=1.2&&v.position>=.55&&v.upper<.4&&trendOK&&v.close>=v.ma10){
   x.stage='first';x.reason='收盤首度站回歷史頸線，量比與K棒位置通過；下一日仍要守穩';return x;
  }
  if(reliableBreak&&ix===bars.length-2&&v.prev>v.neck&&v.close>v.neck&&v.position>=.45&&v.ratio>=.65&&trendOK){
   x.stage='second';x.reason='有前一交易日突破事件，第二日仍守住原頸線';return x;
  }
  if(reliableBreak&&ix===bars.length-3&&
     Number(bars.at(-2)[4])>v.neck&&v.close>v.neck&&
     v.close>=v.ma10&&v.position>=.45&&v.ratio>=.60&&trendOK){
   x.stage='third';x.reason='有效突破事件後第三根仍守住原頸線；屬續強觀察而非保證買點';return x;
  }
  if(v.close<v.neck&&v.close>=v.neck*.96&&v.close>=v.ma10*.995&&maGrowing&&v.ratio>=.60&&v.position>=.35&&
     (c.preLaunch===true||/接近|預備|頸線/.test([c.unifiedStage,c.followStatus].join(' ')))){
   x.stage='ready';x.reason='距歷史頸線不足4%，均線與量價仍在觀察區；不是已突破';return x;
  }
  if(reliableBreak&&ix<bars.length-2&&v.close>v.neck&&v.close>=v.ma10&&v.prev<=v.ma10*1.015&&v.close>v.prev&&v.position>=.50){
   x.stage='reentry';x.reason='已知突破事件後，回測短均線再向上；須防範假反彈';return x;
  }
  if(stage?.kind==='strong'&&reliableBreak&&v.close>v.neck&&v.close>=v.ma10&&v.ratio>=.65){
   x.stage='trend';x.reason='多頭趨勢延續觀察，若回落仍須依支撐與移動停利管理';return x;
  }
  return x;
 }
 function analyze(rows,asOf,stageFn){
  const groups=new Map(),observations=[];
  for(const c of Array.isArray(rows)?rows:[]){
   const sector=sectorName(c);if(!sector)continue;
   const snap=validate(c,asOf);if(!snap)continue;
   if(!groups.has(sector))groups.set(sector,{name:sector,total:0,ups:0,returns:[],stocks:[]});
   const group=groups.get(sector);group.total++;
   if(snap.changePct>0)group.ups++;
   group.returns.push(snap.changePct);
   const stage=inspect(c,asOf,typeof stageFn==='function'?stageFn(c):null);
   if(!['unknown','blocked','none'].includes(stage.stage)){
    const item={row:c,sector,stage:stage.stage,reason:stage.reason,snapshot:stage.snapshot};
    group.stocks.push(item);observations.push(item);
   }
  }
  const coverage=Array.from(groups.values()).map(g=>({name:g.name,total:g.total,advancers:g.ups,breadth:g.ups/g.total,
   median:median(g.returns),count:g.stocks.length,stocks:g.stocks}));
  // Sector strength is the actual EOD median & participation, not the count of one winner.
  const strong=coverage.filter(g=>g.total>=(g.name.startsWith('被動元件')?3:6)&&g.breadth>=.55&&g.median>=.8&&g.count>0)
   .sort((a,b)=>b.median-a.median||b.breadth-a.breadth||b.count-a.count);
  const priority={first:0,second:1,third:2,ready:3,reentry:4,trend:5};
  observations.sort((a,b)=>priority[a.stage]-priority[b.stage]||(b.snapshot.ratio-a.snapshot.ratio)||String(a.row.code).localeCompare(String(b.row.code)));
  for(const g of strong)g.stocks.sort((a,b)=>priority[a.stage]-priority[b.stage]||(b.snapshot.ratio-a.snapshot.ratio));
  return {asOf,strong,watch:observations,coverage,counts:observations.reduce((a,x)=>(a[x.stage]=(a[x.stage]||0)+1,a),{})};
 }
 return {sectorName,validate,inspect,analyze,themeCodes:[...themeCodes]};
});
