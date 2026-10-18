/* 超盤手 r20 research-only candidate (NOT a verified deployment).
   Daily close decisions; uses matching TWSE/TPEx benchmark; no live orders.
   All levels are conditional references, not forecasts or recommendations.
*/
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanMainTrendV320=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const N=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const ROUND=x=>Math.round(x*100)/100;
const MA=(a,n,end=a.length)=>end>=n?a.slice(end-n,end).reduce((s,v)=>s+v,0)/n:null;
const validDate=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;};
function parseBars(rows,kind){
 if(!Array.isArray(rows))return null;const a=[];let prev='';
 for(const v of rows){let date,o,h,l,c,vol;
  if(Array.isArray(v)){
   [date,o,h,l,c,vol]=v;
  }else if(v&&typeof v==='object'){
   ({date,open:o,high:h,low:l,close:c,volume:vol}=v);
  }else return null;
  if(!validDate(date)||date<=prev||N(c)===null||c<=0)return null;
  if(kind==='stock'){
   if([o,h,l,vol].some(x=>N(x)===null)||o<=0||l<=0||vol<0||h<l||h<Math.max(o,c)||l>Math.min(o,c))return null;
  }else if([o,h,l].every(x=>N(x)!==null)){
   if(o<=0||l<=0||h<l||h<Math.max(o,c)||l>Math.min(o,c))return null;
  }else if([o,h,l].some(x=>x!==undefined&&x!==null))return null;
  a.push({date,open:o,high:h,low:l,close:c,volume:vol});prev=date;
 }
 return a;
}
function benchmarkKey(stockMarket){if(['上市','TWSE','listed'].includes(stockMarket))return 'taiex';if(['上櫃','TPEx','otc'].includes(stockMarket))return 'otc';return null;}
function atr14(bars){if(bars.length<15)return null;const trs=[];for(let i=1;i<bars.length;i++){const b=bars[i],p=bars[i-1];trs.push(Math.max(b.high-b.low,Math.abs(b.high-p.close),Math.abs(b.low-p.close)));}let v=MA(trs.slice(0,14),14);for(let i=14;i<trs.length;i++)v=(v*13+trs[i])/14;return v;}
function regime(indexBars,asOf,breadth=null){
 const a=parseBars(indexBars,'index');if(!a||a.length<66||a.at(-1).date!==asOf)return {kind:'unknown',reason:'對應指數缺至少66日可核對收盤資料或日期不一致'};
 const c=a.map(b=>b.close),last=c.at(-1),m20=MA(c,20),m60=MA(c,60),p20=MA(c,20,c.length-5),p60=MA(c,60,c.length-5);
 let breadthInfo='缺連續20個交易日同日漲跌家數，市場廣度未認證',breadthRatio=null;
 // 20 verified days (index trading calendar), not a single noisy trading day.
 const recent=a.slice(-20).map(x=>x.date);
 if(Array.isArray(breadth)&&breadth.length>=20){
  const selected=breadth.slice(-20);
  const ok=selected.every((r,j)=>r?.date===recent[j]&&Number.isInteger(r.advancers)&&Number.isInteger(r.decliners)&&r.advancers>=0&&r.decliners>=0&&(r.advancers+r.decliners)>0);
  if(ok){
   const ratios=selected.map(x=>x.advancers/(x.advancers+x.decliners));
   breadthRatio=ratios.slice(-5).reduce((v,x)=>v+x,0)/5;
   const adl=selected.map(x=>x.advancers-x.decliners);
   const net5=adl.slice(-5).reduce((v,x)=>v+x,0);
   breadthInfo=`最近5日平均上漲家數比 ${(breadthRatio*100).toFixed(1)}%；5日騰落家數淨和 ${net5}`;
  }
 }
 let kind='mixed',reason='指數均線排列或斜率未同時符合強勢條件';
 if(last<m60&&m20<m60&&m20<p20){kind='weak';reason='指數低於MA60且中期均線轉弱';}
 else if(last>m20&&m20>m60&&m20>p20&&m60>=p60){
  if(breadthRatio===null){kind='positive-unconfirmed';reason='指數趨勢向上，但同日市場廣度未核對';}
  else if(breadthRatio>=.52){kind='positive';reason='指數中期向上且當日市場廣度支持';}
  else {kind='mixed';reason='指數向上但當日漲跌廣度不足，暫不確認多頭環境';}
 }
 return {kind,reason,ma20:ROUND(m20),ma60:ROUND(m60),close:last,breadth:breadthInfo,date:asOf};
}
function relativeStrength(stock,index,period=20){
 const a=parseBars(stock,'stock'),b=parseBars(index,'index');if(!a||!b||a.length<period+1)return null;
 const map=new Map(b.map(x=>[x.date,x.close]));const curr=a.at(-1),old=a.at(-(period+1));
 if(!a.slice(-(period+1)).every(x=>map.has(x.date)))return null;
 // Reject missing or extra index sessions; match all stock/index dates in this window.
 if(b.slice(-(period+1)).map(x=>x.date).join('|')!==a.slice(-(period+1)).map(x=>x.date).join('|'))return null;
 // Same beginning/end trading dates; no comparison across mismatched days.
 const score=100*((curr.close/old.close)-(map.get(curr.date)/map.get(old.date)));
 return ROUND(score);
}
function trailAnalysis(stockBars,entryDate,initialStop,mult=2.5){
 const a=parseBars(stockBars,'stock');if(!a||!validDate(entryDate)||N(initialStop)===null)return null;
 const start=a.findIndex(x=>x.date===entryDate);if(start<0||start<14)return null;
 let trail=initialStop,breachDate=null;
 for(let i=start;i<a.length;i++){
  const atr=atr14(a.slice(0,i+1));if(atr===null)return null;
  const since=a.slice(start,i+1),highestClose=Math.max(...since.map(x=>x.close));
  trail=Math.max(trail,highestClose-mult*atr);
  if(i>start&&a[i].close<trail&&breachDate===null)breachDate=a[i].date;
 }
 return {line:ROUND(trail),breachDate};
}
function calcTrail(stockBars,entryDate,initialStop,mult=2.5){return trailAnalysis(stockBars,entryDate,initialStop,mult)?.line??null;}
function inspect({stock,indexHistory,breadth=null,position=null}){
 const out={status:'unverified',action:'先核對資料，不提出買賣訊號',benchmark:null,market:null,relativeStrength20:null,entry:null,stop:null,riskPct:null,milestone2R:null,trail:null,core:'未確認',tactical:'未確認',reasons:[],asOf:stock?.date||null};
 const key=benchmarkKey(stock?.market);out.benchmark=key;
 if(!key){out.reasons.push('個股上市／上櫃市場不明');return out;}
 const a=parseBars(stock?.bars,'stock');if(!a||a.length<65||a.at(-1).date!==stock.date||stock.possiblePriceAdjustment===true){out.reasons.push('個股歷史OHLCV不足／非法／除權息未核對');return out;}
 const last=a.at(-1),c=last.close,vol=last.volume;
 if(vol<=0||N(stock.close)!==null&&Math.abs(stock.close-c)>Math.max(.001,c*.00001)||N(stock.lots)!==null&&Math.abs(stock.lots-vol)>.01){out.reasons.push('零成交量或個股摘要價量與日K不一致');return out;}
 const i=indexHistory&&indexHistory[key];const m=regime(i,stock.date,breadth?.[key]);out.market=m;
 const other=key==='taiex'?'otc':'taiex';const secondary=regime(indexHistory?.[other],stock.date,breadth?.[other]);out.secondaryMarket=secondary;
 if(m.kind==='unknown'){out.reasons.push(m.reason);return out;}
 const rs=relativeStrength(stock.bars,i,20);out.relativeStrength20=rs;
 if(rs===null){out.reasons.push('股價與指數日期無法核對20日相對強度');return out;}
 const closes=a.map(x=>x.close),ma10=MA(closes,10),ma20=MA(closes,20),ma60=MA(closes,60),atr=atr14(a);
 const vol20=MA(a.slice(-21,-1).map(x=>x.volume),20),r=vol20>0?vol/vol20:null;
 if(atr===null||r===null||ma10===null||ma20===null||ma60===null){out.reasons.push('ATR或成交量比較基準缺失');return out;}
 const high20=Math.max(...a.slice(-21,-1).map(x=>x.high));
 const level=N(stock?.cycle?.level)>0&&a.some(x=>x.date===stock.cycle.initialDate)?stock.cycle.level:
  N(stock?.neck)>0&&a.some(x=>x.date===stock.neckDate)?stock.neck:null;
 const structure=level!==null?Math.max(level,high20):high20;
 const range=last.high-last.low,loc=range>0?(c-last.low)/range:.5,upper=range>0?(last.high-Math.max(last.open,c))/range:0;
 const bias20=100*(c/ma20-1),riskCandle=upper>=.42&&loc<.48&&r>=1.6;
 const breakAbove=c>structure+atr*.12&&r>=1.3&&loc>=.65&&upper<.35;
 const prev=a.at(-2),pullback=prev.volume<=vol20*.85&&prev.low>=Math.min(ma20,structure)*.98&&c>prev.high&&c>ma10&&r>=1&&c>ma20;
 const longBias=c>ma20&&ma20>ma60&&ma20>=MA(closes,20,closes.length-5);
 const marketOK=m.kind==='positive',stockOK=rs>=3&&longBias&&bias20<=12&&!riskCandle;
 if(riskCandle)out.reasons.push('相對巨量長上影與收低，不當成突破買點');
 if(bias20>12)out.reasons.push('MA20正乖離超過12%，避免追價');
 if(m.kind==='weak'){out.reasons.push('對應市場指數中期偏弱，新倉優先暫停');}
 if(m.kind==='positive-unconfirmed'){out.reasons.push('指數趨勢偏多但20日騰落家數資料不足，不認證新買點');}
 if(secondary.kind==='weak')out.reasons.push('另一個市場指數走弱，新倉須降風險而非視為市場全面轉強');
 let pattern=null;
 if(marketOK&&stockOK){if(breakAbove)pattern='突破';else if(pullback&&level!==null&&c>=level)pattern='回測再起';}
 // Only suggest a new entry with index, stock, structure, and candle/volume confirmation.
 if(pattern){
  const supports=[ma20,level,Math.min(...a.slice(-11,-1).map(x=>x.low))].filter(x=>N(x)!==null&&x>0&&x<c);
  const support=supports.length?Math.max(...supports):null;
  if(support!==null){const stop=ROUND(support-.35*atr),distance=c-stop,riskPct=distance/c*100;
   if(stop>0&&distance>=atr*.8&&riskPct<=8&&riskPct>=1){
    out.status='entry-qualified';out.action=pattern==='突破'?'突破條件候選，僅盤後確認；下一交易日仍須核對可成交價':'回測再起候選，僅盤後確認；下一交易日仍須核對可成交價';
    out.entry=ROUND(c);out.stop=stop;out.riskPct=ROUND(riskPct);out.milestone2R=ROUND(c+2*distance);
    out.core='結構有效可列核心倉候選，後續用MA20及移動停利守趨勢';
    out.riskBudgetPct=secondary.kind==='positive'?.5:.25; // illustrative fraction of account equity per trade, not portfolio return

    out.tactical='可規劃分批操作倉，但重新進場要重新確認量價';
    out.reasons.push(`市場、相對強度、${pattern}形態及風險距離均符合示範門檻`);
   }else out.reasons.push('停損距離過大／過小，風險報酬不適合新買點');
  }else out.reasons.push('無已核對且低於現價的結構支撐');
 }
 if(position&&N(position.entryPrice)>0&&validDate(position.entryDate)&&a.some(x=>x.date===position.entryDate)&&N(position.initialStop)>0&&position.initialStop<position.entryPrice){
  const t=trailAnalysis(stock.bars,position.entryDate,position.initialStop);const tr=t?.line??null;out.trail=tr;
  if(tr!==null){
   if(t.breachDate){out.status='exit-warning';out.action='曾於 '+t.breachDate+' 收盤觸及移動停利線，應先查明是否已出場／重新進場，不能自動續抱';out.reasons.push('持倉歷史防守線已曾失效，阻止重新視為原部位持有');}
   else if(c<tr){out.status='exit-warning';out.action='收盤已低於逐日不下移的移動停利參考線，檢查減碼／出場';out.reasons.push('持倉防守訊號高於新買點資格');}
   else if(m.kind==='weak'||c<ma20&&r>=1.2){out.status='reduce-warning';out.action='大盤轉弱或個股放量跌破MA20，優先檢查操作倉／停利';}
   else {out.status=out.status==='entry-qualified'?'entry-and-hold':'hold-review';out.action='已持有部位仍守移動停利，依核心倉與操作倉分開管理';}
   out.core=`原始停損 ${ROUND(position.initialStop)}；移動防守 ${tr}；MA20 ${ROUND(ma20)}`;
   out.tactical='操作倉可用2R作階段檢核，不可把未來目標當保證成交價';
  }else out.reasons.push('持倉軌跡不足，無法重算移動停利');
 }
 if(position&&!([position.entryPrice,position.initialStop].every(v=>N(v)!==null&&v>0)&&position.initialStop<position.entryPrice))out.reasons.push('持倉進場價或初始停損不合法，不能計算已實現獲利');
 if(out.status==='unverified'){
  out.status='watch';out.action='未達新進場條件，先觀察原頸線、量縮回測及市場確認';
  out.reasons.push(!marketOK?'大盤／櫃買環境未完整確認':!stockOK?'個股相對強度、趨勢或乖離不合格':'量價型態或風險距離不足');
 }
 return out;
}
return {inspect,regime,relativeStrength,trailAnalysis,calcTrail,atr14,parseBars,benchmarkKey};
});
