/* Chaopan V3.1.1-r12: dated institutional flow + dated cash-equity close.
   Official T86/TPEx institutional feeds report SHARES, not executed value.
   Estimated net value (NTD 100m) = sum(net LOTS) * close NTD * 1000 / 1e8.
   Do not mislabel the derived value as an official transaction amount. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanInstitutionV312=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const n=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
 const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''));
 const validStatuses=new Set(['ok','retained']);
 const netLots=r=>{
  const f=n(r?.foreignLots),t=n(r?.trustLots),d=n(r?.dealerLots);
  return [f,t,d].some(x=>x===null)?null:f+t+d;
 };
 const stockCode=code=>/^[1-9][0-9]{3}$/.test(code);
 const isFundCode=code=>/^0\d{3,5}[A-Z]?$/.test(code);
 const equityRecord=(id,source)=>{
  const ix=id.indexOf('-'); if(ix<0)return false;
  const code=id.slice(ix+1);
  return (source==='stock'?stockCode(code):source==='etf'?isFundCode(code):stockCode(code)||isFundCode(code));
 };
 const lastBar=(record,date)=>{
  const bars=record?.bars;if(!Array.isArray(bars)||!bars.length)return null;
  const bar=bars[bars.length-1];
  if(!Array.isArray(bar)||bar[0]!==date)return null;
  const close=n(bar[4]);return close!==null&&close>0?close:null;
 };
 const roundTo=(v,digits)=>Number(v.toFixed(digits));
 function ranking(intel,universe,asOf,opts={}){
  const market=['all','listed','otc'].includes(opts.market)?opts.market:'all';
  const asset=['stock','etf','all'].includes(opts.asset)?opts.asset:'stock';
  const order=['amount','shares'].includes(opts.order)?opts.order:'amount';
  const empty={ready:false,buys:[],sells:[],available:0,quoted:0,excludedNoQuote:0,excludedWrongDate:0,
   sourceStatus:{listed:'missing',otc:'missing'},partial:false,reason:'',unit:order==='amount'?'億元（估算）':'張',market,asset,order};
  if(!validDate(asOf)||!intel||intel.asOf!==asOf||intel.schema!=='chaopan.market.v311'||universe?.asOf!==asOf)
   return {...empty,reason:'法人資料、全市場收盤資料與指定交易日未全部一致'};
  const health=intel.sources||{},status={listed:health.twse_t86?.status||'missing',otc:health.tpex?.status||'missing'};
  const relevant=market==='listed'?['listed']:market==='otc'?['otc']:['listed','otc'];
  if(relevant.some(s=>!validStatuses.has(status[s])))return {...empty,sourceStatus:status,reason:'所選市場法人來源尚未通過同交易日核對（上市／上櫃須各自成功）'};
  const quotes=new Map();
  for(const c of universe.rows||[]){
   if(!c||!['上市','上櫃'].includes(c.market))continue;
   const id=c.market+'-'+String(c.code||'');const q=lastBar(c,asOf);
   if(q!==null)quotes.set(id,{close:q,name:c.name||''});
  }
  const result=[],seen=new Set();let dated=0,noQuote=0,wrongDate=0;
  for(const [id,r] of Object.entries(intel.stocks||{})){
   if(seen.has(id)||!r)continue;
   const p=/^(上市|上櫃)-(.+)$/.exec(id);if(!p)continue;
   const m=p[1]==='上市'?'listed':'otc',code=p[2];
   if(!relevant.includes(m)||!equityRecord(id,asset))continue;
   if(r.date!==asOf){wrongDate++;continue;}
   const lots=netLots(r);if(lots===null)continue;
   dated++;
   const q=quotes.get(id);
   let close=q?.close??null;
   // ETF daily histories are published separately from the ordinary-equity universe.
   if(close===null && isFundCode(code)){
    const hist=intel.etfOHLCV?.[id];
    if(hist?.latestDate===asOf)close=lastBar(hist,asOf);
   }
   if(order==='amount'&&close===null){noQuote++;continue;}
   const amountYi=close===null?null:(lots*close/100000);
   const name=String(r.name||q?.name||'名稱待核對').trim()||'名稱待核對';
   seen.add(id);
   result.push({id,code,name,market:p[1],assetType:isFundCode(code)?'ETF':'股票',date:asOf,
    foreign:Number(r.foreignLots),trust:Number(r.trustLots),dealer:Number(r.dealerLots),
    net:roundTo(lots,3),close,amountYi:amountYi===null?null:roundTo(amountYi,5),
    value:order==='amount'?amountYi:lots,source:r.source||'',pricingMethod:'同日收盤價乘法人淨股數（估算，非實際成交金額）'});
  }
  const sortBuy=(a,b)=>b.value-a.value||a.code.localeCompare(b.code),sortSell=(a,b)=>a.value-b.value||a.code.localeCompare(b.code);
  const buys=result.filter(x=>x.value>0).sort(sortBuy).slice(0,20);
  const sells=result.filter(x=>x.value<0).sort(sortSell).slice(0,20);
  const etfPartial=asset!=='stock'&&order==='amount';
  return {...empty,ready:true,buys,sells,available:dated,quoted:result.length,excludedNoQuote:noQuote,
    excludedWrongDate:wrongDate,sourceStatus:status,partial:etfPartial,
    reason:etfPartial?'ETF價格可能只有部分官方歷史資料，無法保證全市場ETF依金額完整排序':'',
    unit:order==='amount'?'億元（估算）':'張',market,asset,order};
 }
 return {ranking,netLots,stockCode,lastBar};
});
