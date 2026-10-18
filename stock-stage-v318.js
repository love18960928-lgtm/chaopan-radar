/* Chaopan r18: dated OHLCV-based classification for EVERY stock in universe.
 * No buy signal, no inferred margin position and no data-filling for missing rows.
 */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanStageV318=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const avg=(series,n,end=series.length)=>end>=n?series.slice(end-n,end).reduce((a,b)=>a+b,0)/n:null;
function inspect(row,asOf,options={}){
 const stamp=String(row?.date||''),code=String(row?.code||''),bars=Array.isArray(row?.bars)?row.bars.filter(b=>Array.isArray(b)&&b.length>=6):[];
 if(options.unverified)return {kind:'unknown',reason:'盤後選股／風險資料處理異常，暫不判定',code};
 const last=bars.at(-1),today=num(row?.close),lastClose=last?num(last[4]):null;
 if(!/^\d{4}$/.test(code)||!/^\d{4}-\d{2}-\d{2}$/.test(asOf||'')||stamp!==asOf||!last||last[0]!==asOf||today===null||lastClose===null||Math.abs(today-lastClose)>Math.max(.001,today*.00001))
  return {kind:'unknown',reason:'個股日期、收盤或K線未與全市場同日核對',code};
 const closeSeries=bars.map(b=>num(b[4]));const volumes=bars.map(b=>num(b[5]));
 if(closeSeries.some(x=>x===null||x<=0)||volumes.some(x=>x===null||x<0)||bars.length<22)
  return {kind:'unknown',reason:'有效歷史K線或成交量不足',code};
 const ma5=avg(closeSeries,5),ma10=avg(closeSeries,10),ma20=avg(closeSeries,20),ma60=avg(closeSeries,60);
 const neck=num(row?.cycle?.level);const breakoutDay=row?.cycle?.initialDate;
 const eventIdx=breakoutDay?bars.findIndex(b=>b[0]===breakoutDay):-1;
 const validEvent=neck!==null&&neck>0&&eventIdx>=0&&eventIdx<bars.length;
 const lastTwoStay=validEvent&&bars.length>=eventIdx+2&&closeSeries.at(-2)>neck&&today>neck;
 if(row?.possiblePriceAdjustment)return {kind:'unknown',reason:'疑似除權息或價格調整未核對，暫不做強弱判定',code};
 const risky=Boolean(row?.riskFirst||row?.riskLevel==='high'||options.danger===true||/假突破|突破失敗|結構破壞|趨勢轉弱|跌破/.test(String(row?.followStatus||'')+' '+String(row?.unifiedStage||'')));
 const above20=ma20!==null&&today>ma20;
 const belowShort=ma5!==null&&ma10!==null&&today<ma5&&today<ma10;
 if(risky || (belowShort&&(!validEvent||today<=neck)))
  return {kind:'danger',reason:risky?'有出場／轉弱警戒，強勢資格取消':'股價跌回MA5、MA10且未站穩突破頸線',code};
 if(bars.length>=62&&validEvent&&lastTwoStay&&ma60!==null){
  const sorted=today>ma5&&today>ma10&&today>ma20&&today>ma60&&ma5>ma10&&ma10>ma20&&ma20>ma60;
  const ma5p=avg(closeSeries,5,closeSeries.length-1),ma5pp=avg(closeSeries,5,closeSeries.length-2);
  const ma10p=avg(closeSeries,10,closeSeries.length-1),ma10pp=avg(closeSeries,10,closeSeries.length-2);
  const ma20p=avg(closeSeries,20,closeSeries.length-1);
  const rising=ma5>ma5p&&ma5p>=ma5pp&&ma10>=ma10p&&ma10p>=ma10pp&&ma20>=ma20p;
  const eligible=options.liquid!==false&&options.strongApproved!==false;
  if(sorted&&rising&&eligible)return {kind:'strong',reason:'原大量K頸線連續站穩且MA5／10／20／60多頭排列與走揚',code};
 }
 if(options.watch===true||(validEvent&&today>neck)||(!validEvent&&ma5!==null&&today>=ma5&&above20))
  return {kind:'watch',reason:validEvent?'等待完整均線／突破續強確認':'起漲候選，尚未取得完整突破與均線證據',code};
 return {kind:'neutral',reason:'目前未達已確認強勢或起漲條件',code};
}
function classify(rows,asOf,optionFn){const buckets={strong:0,watch:0,danger:0,neutral:0,unknown:0};const results=[];
 for(const r of Array.isArray(rows)?rows:[]){let opts={};try{opts=optionFn?optionFn(r):{}}catch(_){opts={unverified:true}};const x=inspect(r,asOf,opts);buckets[x.kind]++;results.push({id:String(r.market||'')+'-'+String(r.code||''),code:String(r.code||''),name:String(r.name||''),market:String(r.market||''),industry:String(r.industry||r.fundamentals?.industry||''),date:String(r.date||''),kind:x.kind,reason:x.reason,row:r});}
 return {total:results.length,counts:buckets,rows:results};
}
return {inspect,classify};
});
