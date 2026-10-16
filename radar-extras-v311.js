/* V3.1.1-r3: helper functions tested independently in tests/test_patch_v311.js. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanExtrasV311=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
// 0050 was absent from the equity universe by design (the scanner excludes
// leading-zero ETF codes). Never use that missing equity label to erase a
// valid security name from the official institutional feed.
const confirmedFallbackNames=Object.freeze({'上市-0050':'元大台灣50'});
const cleanName=value=>{
 const s=String(value??'').trim();
 if(!s||/^(?:None|null|undefined|NaN|—|-|名稱待核對|待資料)$/i.test(s))return '';
 return s.slice(0,60);
};
function institutionalRanking(intel, asOf, stockNames={}) {
 if(!intel||intel.schema!=='chaopan.market.v311'||intel.asOf!==asOf||!/^\d{4}-\d\d-\d\d$/.test(String(asOf)))return {ready:false,buys:[],sells:[],available:0,unnamed:0};
 const entries=[];
 for(const [id,v] of Object.entries(intel.stocks||{})) {
  if(!/^(上市|上櫃)-(?:\d{4}|0\d{4,5}[A-Z]?)$/.test(id)||!v||v.date!==asOf)continue;
  const foreign=n(v.foreignLots),trust=n(v.trustLots),dealer=n(v.dealerLots);
  if([foreign,trust,dealer].some(v=>v===null))continue;
  const net=Math.round((foreign+trust+dealer)*1000)/1000;
  const parts=id.split('-');
  // For non-ETF stocks the recorded equity name is normally complete; the
  // official feed name is essential for ETFs that are not in the stock scanner.
  const name=cleanName(v.name)||cleanName(stockNames[id])||confirmedFallbackNames[id]||'名稱待核對';
  entries.push({id,code:parts[1],market:parts[0],name,assetType:/^0\d/.test(parts[1])?'ETF／其他證券':'股票',net,foreign,trust,dealer});
 }
 const buys=entries.filter(e=>e.net>0).sort((a,b)=>b.net-a.net||a.code.localeCompare(b.code)).slice(0,20);
 const sells=entries.filter(e=>e.net<0).sort((a,b)=>a.net-b.net||a.code.localeCompare(b.code)).slice(0,20);
 return {ready:entries.length>0,buys,sells,available:entries.length,unnamed:entries.filter(x=>x.name==='名稱待核對').length};
}

function averages(rowOrBars) {
 const bars=Array.isArray(rowOrBars)?rowOrBars:rowOrBars?.bars;
 const matched=rowOrBars&&!Array.isArray(rowOrBars)&&rowOrBars.maAll?.asOf===rowOrBars.date?rowOrBars.maAll:null;
 const valid=(Array.isArray(bars)?bars:[]).filter(b=>Array.isArray(b)&&n(b[4])!==null&&n(b[4])>0);
 const closes=valid.map(b=>Number(b[4])), last=closes.at(-1), values={};
 for(const d of [5,10,20,60,120,240]){
   // Never combine an old-dated server field with today's price.
   values[d]=matched?n(matched.values?.[String(d)]):(closes.length>=d?closes.slice(-d).reduce((a,b)=>a+b,0)/d:null);
 }
 const complete=[5,10,20,60,120,240].every(d=>values[d]!==null);
 const short=[5,10,20].every(d=>values[d]!==null&&last>=values[d]);
 const long=[60,120,240].filter(d=>values[d]!==null&&last<values[d]);
 const full=complete&&short&&long.length===0;
 const status=full?'站上全部六條均線':short&&long.length>0?'短線站上MA5／10／20；長線仍有壓力':short&&!complete?'站上短線三線；長線資料不足':short?'短線站上三線／長線未全數確認':'短線均線尚未全部站上';
 return {values,close:last??null,count:matched?Number(matched.count)||closes.length:closes.length,complete,short,full,long,status};
}
function breakoutTracks(row){
 const bars=(row?.bars||[]).filter(b=>Array.isArray(b)&&typeof b[0]==='string'&&n(b[1])!==null&&n(b[4])!==null);
 if(!bars.length)return [];
 const events=[
  {date:row?.breakoutSequence?.initialDate,level:row?.breakoutSequence?.level,source:'原大量K突破事件'},
  {date:row?.cycle?.initialDate,level:row?.cycle?.level,source:'原突破事件'},
  {date:row?.continuationContext?.breakoutDate,level:row?.continuationContext?.originalNeckline,source:row?.continuationContext?.source||'歷史延續事件'},
  {date:row?.continuationV303?.anchorDate,level:row?.continuationV303?.anchorLevel,source:row?.continuationV303?.source||'歷史延續事件'}
 ];
 const unique=new Map();for(const e of events)if(e.date&&n(e.level)>0&&bars.some(b=>b[0]===e.date))unique.set(e.date,e);
 return [...unique.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2).map(e=>{
  const start=bars.findIndex(b=>b[0]===e.date),span=bars.slice(Math.max(start,bars.length-10));
  const red=span.filter(b=>Number(b[4])>Number(b[1])).length,green=span.filter(b=>Number(b[4])<Number(b[1])).length;
  const doji=span.length-red-green,ma=averages(bars),close=Number(bars.at(-1)[4]);
  const label=ma.values[5]!==null&&close>=ma.values[5]&&close<=ma.values[5]*1.04?'沿MA5觀察':ma.values[10]!==null&&close>=ma.values[10]*.995&&close<ma.values[5]*1.04?'回測MA10觀察':ma.values[10]!==null&&close<ma.values[10]?'跌回MA10下方／警戒':'待均線確認';
  return {...e,red,green,doji,window:span.length,days:bars.length-start,trend:label,close};
 });
}
return {institutionalRanking,averages,breakoutTracks};
});
