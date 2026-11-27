/* CHAOPAN_RADAR_BUILD: R220-20261127-chart-support-guard */
/* Prior tested build (historical, not deployed version): CHAOPAN_RADAR_BUILD: R165-20261120-visual-card-red-up-green-down */
'use strict';
const $ = s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const state={r41Page:'card',r41Advanced:null,payload:null,mode:'empty',tab:'all',query:'',market:'all',sector:'all',sort:'score',confirmed:false,limitMin:false,visible:30,watch:new Set(),detail:null,chartDays:60,marketIntel:null,universe:null,detailIds:[],detailHistory:false,etfDetail:null,rankView:'20',rankLens:'launch',stageView:'all',liquidityOnly:true,loadingExtra:false,instMarket:'all',instAsset:'stock',instSort:'amount'};
// R214: the TAIEX session list is a market reference, not proof of a stock's individual trading status.
let r214Sessions=null,r214SessionRevision=0;
function r214InstallSessions(raw,parsed){
 if(!parsed||!Array.isArray(raw?.missingMonths)||raw.missingMonths.length!==0)return false;
 const dates=parsed.bars.map(b=>b[0]);
 const key=dates.join('|');
 if(r214Sessions?.key===key)return false;
 r214Sessions={key,dates,asOf:parsed.asOf};r214SessionRevision++;return true;
}
function r214SessionGate(c){
 const stage=r204Stage(c);if(!stage||c?.assetType==='ETF')return null;
 const event=r205EventDate(c),days={first:1,second:2,third:3,fourth:4}[stage];
 const wait=(reason)=>({status:'unknown',reasons:[reason],signals:['r214_session_review']});
 if(event.conflict||!event.date||!Array.isArray(c?.bars))return wait('突破事件日期待核對');
 const a=r214Sessions?.dates;
 if(!a||!a.includes(c.date)||!a.includes(event.date))return wait('市場交易日參考尚未同步，突破根數待核對');
 const expected=a.filter(d=>d>=event.date&&d<=c.date);
 const actual=c.bars.filter(b=>Array.isArray(b)&&b[0]>=event.date&&b[0]<=c.date).map(b=>b[0]);
 const missing=expected.filter(d=>!actual.includes(d));
 if(missing.length)return wait('市場交易日參考缺少個股K棒：'+missing.join('、')+'；停牌／無成交／資料缺漏待核對');
 if(expected.length!==days||actual.join('|')!==expected.join('|'))return wait('突破根數與市場交易日參考不一致，待核對');
 return null;
}
/* R144: shared, conservative EOD stock selection risk audit.
   Values are research thresholds, not validated win rates nor proof of actual distribution.
   This module is embedded in the main script; no extra <script> reference is required. */
// R205: backend certification emits initialDate; older rules emit firstDate.
// Accept explicit event date aliases only when they agree and are valid.
function r205EventDate(c){
 const e=c?.breakoutEvent;if(!e||typeof e!=='object')return {date:null,conflict:false};
 const ds=['date','initialDate','firstDate'].map(k=>e[k]).filter(v=>v!==null&&v!==undefined&&v!=='');
 if(!ds.length)return {date:null,conflict:false};
 const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 if(ds.some(d=>!valid(d))||new Set(ds).size!==1)return {date:null,conflict:true};
 const seq=c?.breakoutSequence?.initialDate;
 if(seq!==null&&seq!==undefined&&seq!==''&&(!valid(seq)||seq!==ds[0]))return {date:null,conflict:true};
 return {date:ds[0],conflict:false};
}
// R208 validation: the independent stock-flow feed stores lots, while row fields store shares.
// Never mix markets, sessions, invalid values or conflicting sources.
function r208Institution(c,intel){
 if(!c)return null;
 const date=c.date,iso=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 if(!iso(date))return null;
 const num=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
 const keys=['foreignNetShares','trustNetShares','dealerNetShares'];
 const shares=(values,scale)=>{const out=values.map(v=>{const n=num(v);if(n===null)return null;const x=n*scale,y=Math.round(x);return Number.isSafeInteger(y)&&Math.abs(x-y)<1e-6?y:null;});return out.every(v=>v!==null)?out:null;};
 const raw=c.institutional,direct=raw?.date===date&&(!raw.unit||raw.unit==='shares')?shares(keys.map(k=>raw[k]),1):null;
 if(intel===undefined&&typeof state!=='undefined'&&state.mode!=='demo')intel=state.marketIntel;
 const market=c.market,source=market==='上市'?'TWSE T86':market==='上櫃'?'TPEx 3insti':null,sourceKey=market==='上市'?'twse_t86':'tpex';
 const item=c.assetType!=='ETF'&&source&&intel?.schema==='chaopan.market.v311'&&intel.asOf===date&&['ok','retained'].includes(intel.sources?.[sourceKey]?.status)?intel.stocks?.[market+'-'+c.code]:null;
 const feed=item?.date===date&&item.source===source?shares(['foreignLots','trustLots','dealerLots'].map(k=>item[k]),1000):null;
 if(direct&&feed&&direct.some((x,i)=>x!==feed[i]))return null;
 const values=feed||direct;if(!values)return null;
 return {date,source:feed?source:(raw.source||'row'),unit:'shares',...Object.fromEntries(keys.map((k,i)=>[k,values[i]]))};
}
const R143StrictRisk = (() => {
 'use strict';
 const stageDays={first:1,second:2,third:3,fourth:4};
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s))&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const n=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
 const read=x=>{
  if(!Array.isArray(x)||x.length<6||!validDate(x[0]))return null;
  const [o,h,l,c,v]=[1,2,3,4,5].map(i=>n(x[i]));
  if([o,h,l,c,v].some(z=>z===null)||l<=0||h<l||o<l||o>h||c<l||c>h||v<0)return null;
  return {date:x[0],o,h,l,c,v};
 };
 const mean=(a,start,end)=>start<0||end>a.length||start>=end?null:a.slice(start,end).reduce((s,x)=>s+x.v,0)/(end-start);
 const vRatio=(a,i)=>{const m=mean(a,i-20,i);return m>0?a[i].v/m:null};
 const upperPct=b=>b.h>b.l?(b.h-Math.max(b.o,b.c))/(b.h-b.l):0;
 const closePos=b=>b.h>b.l?(b.c-b.l)/(b.h-b.l):0.5;
 const reason=(status,reasons,signals=[],evidence={})=>({status,reasons:[...new Set(reasons)],signals:[...new Set(signals)],evidence});
 function parse(c,asOf){
  const raw=Array.isArray(c?.bars)?c.bars:[];
  if(raw.length<25)return {status:'unknown',reasons:['至少需要25根日K以核對連續賣壓及20日均量']};
  const lastRaw=raw.slice(-Math.min(raw.length,160));
  const bars=lastRaw.map(read);
  if(bars.some(x=>x===null))return {status:'unknown',reasons:['歷史OHLCV資料缺漏或高低價錯置']};
  if(bars.some((b,i)=>i>0&&b.date<=bars[i-1].date))return {status:'unknown',reasons:['交易日資料重複或沒有依日期排序']};
  const last=bars.at(-1),rowDate=c?.date;
  if(!validDate(last.date)||rowDate!==last.date||asOf&&last.date!==asOf)return {status:'unknown',reasons:['股票、歷史K棒或盤後快照的交易日期不一致']};
  if(n(c.close)===null||n(c.close)<=0||Math.abs(Number(c.close)-last.c)>Math.max(0.011,last.c*.0002))return {status:'unknown',reasons:['股票收盤價與日K收盤價不一致']};
  if(c?.possiblePriceAdjustment===true)return {status:'unknown',reasons:['除權息／減資／分割價格尚未還原']};
  // R159: A missing backend corporate-action flag is not proof that prices
  // have already been adjusted. Exceptional adjacent-session gaps may reflect
  // a split, capital reduction, an unadjusted ex-rights event, a new listing,
  // or a feed error. Never classify these unverified price discontinuities as
  // bullish breakthroughs or bearish distribution using unadjusted averages.
  // 35% is an intentionally conservative data-quality heuristic, not an
  // official Taiwan exchange limit or proof of a corporate action.
  for(let i=1;i<bars.length;i++){
   const prev=bars[i-1],next=bars[i];
   if(prev.c>0&&(Math.abs(next.o/prev.c-1)>.35||Math.abs(next.c/prev.c-1)>.35))
    return {status:'unknown',reasons:[`在${prev.date}與${next.date}間發現大幅價格斷層（超過35%），需核對公司行動、特殊交易狀態及歷史價格還原，不能直接判定出貨或突破`]};
  }
  if(last.v<=0)return {status:'unknown',reasons:['最新日K成交量為零，無法認證有效交易']};
  const m=mean(bars,bars.length-21,bars.length-1);
  if(!(m>0))return {status:'unknown',reasons:['過去20日均量為零或不足']};
  return {status:'ok',bars,last,volRatio:last.v/m};
 }
 function breakoutAudit(c,stage,context){
  const days=stageDays[stage];
  if(!days)return reason('unknown',['突破階段不是第一至第四根']);
  const ready=context||parse(c,c?.date);
  if(ready.status!=='ok')return reason('unknown',ready.reasons);
  const a=ready.bars,first=a.length-days;
  if(first<21)return reason('unknown',['突破前歷史K棒不足']);
  const firstBar=a[first],prev=a[first-1];
  const evDate=r205EventDate(c);if(evDate.conflict)return reason('unknown',['突破事件日期欄位衝突或無效']);
  let level=n(c?.breakoutEvent?.level),eventDate=evDate.date;
  let source='backend',anchorDate=null;
  if(eventDate&&eventDate!==firstBar.date)return reason('unknown',['突破事件日期與第一至第四根的歷史日K不一致']);
  if(level===null||level<=0||!eventDate){
   // Search all 60–120-session heavy-volume neckline candidates; do not rely
   // on only the largest-volume candle when a different valid anchor exists.
   const choices=[];
   for(let age=60;age<=120;age++){
    const j=first-age;
    if(j<20)continue;
    const base=mean(a,j-20,j),anchor=a[j];
    if(!(base>0&&anchor.v/base>=1.8))continue;
    if(a.slice(j+1,first).some(b=>b.c>anchor.h))continue;
    if(prev.c<=anchor.h&&firstBar.c>anchor.h&&firstBar.h>anchor.h)choices.push({level:anchor.h,date:anchor.date,ratio:anchor.v/base,age});
   }
   if(!choices.length)return reason('unknown',['缺乏可驗證的60～120日大量K頸線事件（不能判定股票不好）']);
   choices.sort((x,y)=>y.ratio-x.ratio||x.age-y.age);
   level=choices[0].level;anchorDate=choices[0].date;source='historical-candidate';
   eventDate=firstBar.date;
  }
  if(!(prev.c<=level&&firstBar.c>level&&firstBar.h>level))return reason('risk',['沒有在該日首次收盤突破核對頸線']);
  const eventVr=vRatio(a,first),evidence={date:eventDate,level,source,anchorDate,breakoutVolumeRatio:eventVr};
  if(eventVr===null)return reason('unknown',['突破前均量無法核對'],[],evidence);
  const warnings=[],sellWarnings=[];let heavyDown=0,pullbackIndex=-1;
  for(let i=first;i<a.length;i++){
   const b=a[i],vr=vRatio(a,i);
   if(b.v<=0)return reason('unknown',['突破期間無有效成交量'],[],evidence);
   if(vr===null)return reason('unknown',['突破延續K棒均量無法核對'],[],evidence);
   if(i>first&&b.c<level)return reason('risk',['收盤跌破突破頸線'],['failed_breakout'],evidence);
   if(i>first&&b.c<firstBar.l)return reason('risk',['收盤跌破首次突破K棒低點'],['failed_breakout'],evidence);
   if(b.c<b.o&&vr>=1.5&&closePos(b)<=.45)heavyDown++;
   else heavyDown=0;
   if(heavyDown>=2)return reason('risk',['突破後連續兩根放量收低'],['distribution_suspected'],evidence);
   if(upperPct(b)>=.4&&vr>=1.5&&closePos(b)<=.58)warnings.push(b.h);
   // R211: isolated heavy low-close selling during continuation is a watch,
   // not proof of distribution. Use the same rolling prior-20 volume baseline.
   if(i>first&&b.c<b.o&&vr>=1.5&&closePos(b)<=.32)sellWarnings.push({i,high:b.h});
   if(i>first&&b.c<a[i-1].c&&b.c>=level&&vr<=.85)pullbackIndex=i;
  }
  const last=a.at(-1);
  if(warnings.some(h=>last.c<h))return reason('watch',['突破後放量長上影尚未收復'],['distribution_watch'],evidence);
  if(sellWarnings.length){
   const priorHigh=Math.max(...a.slice(first,-1).map(b=>b.h));
   const recovered=sellWarnings.every(w=>w.i<a.length-1)&&last.c>priorHigh&&last.c>last.o&&vRatio(a,a.length-1)>=1.3;
   if(!recovered)return reason('watch',['突破續強期間放量收低，賣壓尚待確認'],['continuation_sell_watch'],evidence);
   evidence.sellPressureResolved=true;
  }
  if(eventVr<1.3)return reason('watch',['首次突破未達1.3倍均量'],['weak_volume'],evidence);
  // R209 validation: a resolved low-volume pullback must not remain a permanent veto.
  // Only the latest close strictly above every earlier event high, on at least
  // 1.3x prior-20-day volume, can clear this particular warning. Other vetoes remain.
  if(pullbackIndex>=0){
   const priorHigh=Math.max(...a.slice(first,-1).map(b=>b.h));
   const recovered=pullbackIndex<a.length-1&&last.c>priorHigh&&last.c>last.o&&vRatio(a,a.length-1)>=1.3;
   if(!recovered)return reason('watch',['量縮回測候選，守住頸線但仍需再轉強'],['healthy_pullback'],evidence);
   evidence.pullbackResolved=true;
  }
  return reason(source==='historical-candidate'?'watch':'eligible',
   [source==='historical-candidate'?'歷史大量K候選頸線尚未與盤後事件交叉認證':'突破事件量價初步通過'],
   ['breakout_'+stage],evidence);
 }
 const memo=new WeakMap();
 function audit(c,asOf){
  if(!c||typeof c!=='object')return reason('unknown',['個股資料不存在']);
  // R144: fingerprint all data used by the decision, not just the session date.
  // Late corrections to OHLCV, risk labels and institutional flow must invalidate it.
  const key=JSON.stringify([asOf||'',c.date,c.close,c.lots,c.riskFirst,c.riskLevel,c.unifiedStage,
   c.followStatus,c.trading?.status,c.overextended,c.possiblePriceAdjustment,
   c.breakoutSequence,c.breakoutEvent,r208Institution(c),Array.isArray(c.bars)?c.bars.slice(-160):null]);
  const cached=memo.get(c);
  if(cached&&cached.key===key)return cached.value;
  const result=compute(c,asOf);memo.set(c,{key,value:result});return result;
 }
 function compute(c,asOf){
  const p=parse(c,asOf);
  if(p.status!=='ok')return reason('unknown',p.reasons);
  const a=p.bars,L=a.length,last=a.at(-1),prev=a.at(-2),vr=p.volRatio;
  const reasons=[],signals=[],watch=[],missing=[];
  const labels=[c?.riskLevel,(c?.unifiedStage==='跌破後重新站回／待確認'?'重新站回待確認':c?.unifiedStage),c?.followStatus,c?.trading?.status].filter(Boolean).join(' ');
  if(c?.riskFirst===true||c?.riskLevel==='high'||/假突破|出貨|賣壓|轉弱|突破失敗|結構破壞|跌破|減碼警戒|高風險/.test(labels))reasons.push('既有風險資料標記轉弱／可能出貨');
  if(c?.unifiedStage==='跌破後重新站回／待確認')watch.push('歷史失守後重新站回，待重新認證');
  if(c?.riskLevel==='medium'||c?.overextended===true)watch.push('中度風險或短期過熱，停止自動強勢認證');
  const highVolumeUpper=b=>upperPct(b)>=.38&&closePos(b)<=.6;
  if(vr>=1.5&&highVolumeUpper(last)){
   if(last.c<=last.o||vr>=1.9)reasons.push('當日放量長上影、收盤位置偏低');
   else watch.push('當日放量長上影，上方有賣壓疑慮');
   signals.push('distribution_watch');
  }
  if(last.c<last.o&&vr>=1.8&&closePos(last)<=.32){reasons.push('當日大量收黑、收盤靠近最低價');signals.push('distribution_suspected');}
  let redRun=0;
  for(let i=Math.max(20,L-5);i<L;i++){
   const b=a[i],ratio=vRatio(a,i);
   redRun=b.c<b.o&&ratio!==null&&ratio>=1.45&&closePos(b)<=.5?redRun+1:0;
   if(redRun>=2){
    const dangerHigh=Math.max(a[i-1].h,b.h);
    if(i<L-1&&last.c>dangerHigh)watch.push('近期曾連續放量收黑，但最新收盤已收復賣壓K棒高點');
    else reasons.push('近五根K棒內連續兩根放量收黑');
    signals.push('distribution_suspected');
   }
  }
  for(let i=Math.max(20,L-4);i<L-1;i++){
   const b=a[i],ratio=vRatio(a,i);
   if(ratio!==null&&ratio>=1.65&&highVolumeUpper(b)&&last.c<b.h){
    watch.push('近期放量長上影尚未收復高點');signals.push('distribution_watch');break;
   }
  }
  const closes=a.slice(-20).map(b=>b.c),ma20=closes.reduce((x,y)=>x+y,0)/20;
  const ma5=a.slice(-5).reduce((s,b)=>s+b.c,0)/5;
  if(last.c<ma20&&vr>=1.5&&last.c<prev.c){reasons.push('放量下破MA20且收低');signals.push('trend_breakdown');}
  else if(last.c<ma20&&last.c<prev.c)watch.push('收盤跌破MA20，短線趨勢待確認');
  if(last.c<ma5&&last.c<prev.c&&vr>1.3)watch.push('跌破MA5且量能偏高');
  if(last.c<prev.l&&vr>=1.3){watch.push('跌破前日低點且放量');signals.push('support_warning');}
  // Avoid treating a quiet, neckline-holding pullback as confirmed distribution.
  const neck=n(c?.breakoutEvent?.level);
  if(last.c<prev.c&&vr<=.85&&neck!==null&&neck>0&&last.c>=neck){
   watch.push('量縮回測且守住突破頸線，屬健康整理候選');signals.push('healthy_pullback');
  }
  const institutional=r208Institution(c);
  if(institutional){
   const f=n(institutional.foreignNetShares),t=n(institutional.trustNetShares);
   // c.bars volume is in lots; foreign/trust numbers are in shares.
   if(f!==null&&t!==null&&f<0&&t<0){
    const reportedLots=n(c.lots);
    const barIsLots=reportedLots>0&&Math.abs(last.v/reportedLots-1)<.03;
    const barIsShares=reportedLots>0&&Math.abs(last.v/(reportedLots*1000)-1)<.03;
    const shares=barIsLots!==barIsShares?(barIsLots?last.v*1000:last.v):null;
    const sellFraction=shares>0&&Math.abs(f)<=shares&&Math.abs(t)<=shares&&(-f-t)<=shares?(-f-t)/shares:null;
    if(sellFraction!==null&&sellFraction>=.08&&last.c<last.o){reasons.push('同日外資投信同步賣超且合計達成交股數8%以上，配合收黑');signals.push('institutional_selling');}
    else {watch.push('同日外資投信同步賣超（不單獨判定出貨）');signals.push('institutional_watch');}
   }
  }
  const stage=String(c?.breakoutSequence?.phase||'');
  if(stageDays[stage]){
   const evt=breakoutAudit(c,stage,p);
   if(evt.status==='risk')reasons.push(...evt.reasons);
   else if(evt.status==='watch')watch.push(...evt.reasons);
   else if(evt.status==='unknown')missing.push(...evt.reasons);
   signals.push(...evt.signals);
  }
  if(reasons.length)return reason('risk',reasons,signals,{date:last.date,volumeRatio:+vr.toFixed(2)});
  if(missing.length)return reason('unknown',[...missing,...watch],signals,{date:last.date,volumeRatio:+vr.toFixed(2)});
  if(watch.length)return reason('watch',watch,signals,{date:last.date,volumeRatio:+vr.toFixed(2)});
  return reason('eligible',['日K量價未觸發嚴格賣壓排除條件（非買進認證）'],signals,{date:last.date,volumeRatio:+vr.toFixed(2)});
 }
 return {audit,breakoutAudit,parse};
})();


const TAGS={first:'第一根發動',prep:'發動前預備',near:'接近頸線',volume:'新大量超越',limit:'20日多漲停',follow:'突破後追蹤'};
const price=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n))? Number(n).toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const integer=n=>Number.isFinite(Number(n))?Math.round(Number(n)).toLocaleString('zh-TW'):'—';
const sign=n=>Number(n)>0?'+':'';
const pct=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n))?`${sign(n)}${Number(n).toFixed(2)}%`:'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));


// V1.1 Top 60 candidate workflow. Generic CSV is NOT the proprietary 三竹匯入格式.
const sixtyKey='chaopan-sixty-strength-snapshot-v308';
const hasData=c=>c?.investment?.overall!==null&&Number.isFinite(Number(c?.investment?.overall));
const investing=c=>hasData(c)? Number(c.investment.overall): null;
const showField=v=>v===null||v===undefined||v===''?'待資料':String(v);
const tradeScore=c=>c?.trading?.score!=null&&Number.isFinite(Number(c.trading.score))?Number(c.trading.score):-1;
const candidateRank=c=>tradeScore(c)+(c.priceConfirmed?12:c.followStatus==='突破續強'?8:c.preLaunch?4:0)+(c.investment?.growth==null?0:Math.min(10,Number(c.investment.growth)*.1))-(c.trading?.status==='不宜追價'?35:c.followStatus==='假突破警戒'?20:0);

// V3.1.1-r2: row calculations are immutable within a daily snapshot.
// Cache expensive 5/10/20/60-day computations to prevent repeated sorting
// from recalculating identical technical evidence thousands of times.
// R145: same-session corrections may mutate an existing row and OHLCV arrays.
// Full stable JSON fingerprint detects amendments to any candle or decision field.
// This is an EOD UI-cache consistency check, not a market-data authentication tool.
// R185: share fingerprints only within one synchronous render, not across events.
let r185StampScope=null;
function r185Scoped(fn){
 if(r185StampScope)return fn();
 r185StampScope=new WeakMap();
 try{return fn()}finally{r185StampScope=null}
}
function r145RowStamp(c){
 if(!r185StampScope||!c||typeof c!=='object')return r185RawRowStamp(c);
 if(r185StampScope.has(c))return r185StampScope.get(c);
 const stamp=r185RawRowStamp(c);r185StampScope.set(c,stamp);return stamp;
}
function r185RawRowStamp(c){
 if(!c||typeof c!=='object')return 'missing';
 // Native JSON serialization is substantially faster than a JavaScript candle-by-candle
 // checksum on Android-class engines, and compares the *entire* candle timeline.
 const meta=[c.code,c.market,c.date,c.close,c.lots,c.changePct,c.score,c.riskLevel,c.riskFirst,
  c.unifiedScore,c.unifiedStage,c.followStatus,c.starPhase,c.breakoutQuality,c.continuationEligible,
  c.abovePrevHigh,c.overextended,c.possiblePriceAdjustment,c.onePriceLimit,c.fallingLimitRisk,
  c.assetType,c.changeAmount,c.distributionDetail,c.priceConfirmed,c.preLaunch,c.launchStage,c.neck,c.neckDate,c.volumeRatio,c.avgVolume20,
  c.tags,c.trading,r208Institution(c),c.breakoutSequence,c.breakoutEvent,c.cycle,c.supportEvidence,
  c.structureV23,c.investment,c.fundamentals,c.decision,c.opportunityScore,c.riskFlags];
 return JSON.stringify([Array.isArray(c.bars)?c.bars:null,meta,r214SessionRevision]);
}
function r145UniverseStamp(rows){
 // Separator 0x1f is escaped by JSON.stringify; order and member revisions matter.
 return rows.map(c=>r145RowStamp(c)).join('\u001f');
}
const memoByRow=fn=>{const cache=new WeakMap();return row=>{
 if(!row||typeof row!=='object')return fn(row);
 const asOf=typeof state==='undefined'?'':String(state?.payload?.asOf||'');
 const key=asOf+'|'+r145RowStamp(row),record=cache.get(row);
 if(record?.key===key)return record.value;
 const value=fn(row);cache.set(row,{key,value});return value;
};};
function movingMean(values,n){return values.length>=n?values.slice(-n).reduce((a,b)=>a+b,0)/n:null}
const techMetrics=memoByRow(techMetricsCore);
function techMetricsCore(c){
 // Share the same strict daily-bar validation as indicatorSnapshot: never
 // compress the timeline by silently removing a corrupt trading day.
 const bars=Array.isArray(c?.bars)?c.bars:[];
 const empty={ret20:null,ret60:null,ma5:null,ma10:null,ma20:null,ma60:null,avg20:null,rsi14:null};
 if(!bars.length)return empty;
 let previousDate='';
 for(const b of bars){
  if(!Array.isArray(b)||b.length<6)return empty;
  const [date,open,high,low,close,volume]=b;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return empty;
  const stamp=Date.parse(date+'T00:00:00Z');
  if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==date||date<=previousDate)return empty;
  previousDate=date;
  const o=numeric(open),h=numeric(high),l=numeric(low),cl=numeric(close),v=numeric(volume);
  if([o,h,l,cl,v].some(x=>x===null)||l<=0||h<l||o<l||o>h||cl<l||cl>h||v<0)return empty;
 }
 if(typeof c.date==='string'&&c.date&&bars.at(-1)[0]!==c.date)return empty;
 const cls=bars.map(b=>Number(b[4])), lots=bars.map(b=>Number(b[5]));
 const ret=n=>cls.length>n&&cls.at(-n-1)>0?100*(cls.at(-1)/cls.at(-n-1)-1):null;
 const sma=n=>movingMean(cls,n);
 const avg20=lots.length>20?movingMean(lots.slice(0,-1),20):null;
 const recent=cls.slice(-15),changes=recent.slice(1).map((v,i)=>v-recent[i]);
 const ups=changes.reduce((a,n)=>a+Math.max(0,n),0),downs=changes.reduce((a,n)=>a+Math.max(0,-n),0);
 const rsi=changes.length>=14?(downs===0?(ups===0?50:100):100-100/(1+ups/downs)):null;
 return {ret20:ret(20),ret60:ret(60),ma5:sma(5),ma10:sma(10),ma20:sma(20),ma60:sma(60),avg20, rsi14:rsi};
}
// V3.0 daily closing-price averages and locked original breakout reference.
// The backend fields win when present; the fallback is expressly a local
// calculation on the available displayed bars, not an invented event.
const maReadout=memoByRow(maReadoutCore);
function maReadoutCore(c){
 if(c.lineContext && c.lineContext.maStage)return c.lineContext;
 const bars=(c.bars||[]).filter(b=>numeric(b[4])!==null),cls=bars.map(b=>+b[4]);
 const meanAt=(n,end=cls.length)=>end>=n?cls.slice(end-n,end).reduce((a,b)=>a+b,0)/n:null;
 const a=meanAt(5),b=meanAt(10),d=meanAt(20),old5=meanAt(5,cls.length-1),old10=meanAt(10,cls.length-1),old20=meanAt(20,cls.length-1);
 if(d===null)return {ma5:a,ma10:b,ma20:d,maStage:'資料不足',necklineHoldDays:null};
 const close=cls.at(-1),above=close>=a&&close>=b&&close>=d,stacked=a>b&&b>d;
 const rising=old5!==null&&a>=old5&&b>=old10&&d>=old20;
 const near5=close>=a&&close<=a*1.03;
 const maStage=above&&stacked&&rising&&near5?'沿5日線強勢／多頭排列':above&&stacked&&rising?'均線多頭／偏離5日線':above?'站上三線／排列待確認':close>=b&&close>=d&&stacked?'回測5日線／觀察10日線':close<d?'跌回20日線下方／警戒':'均線交錯／盤整';
 const cy=c.cycle||{},level=numeric(cy.level),day=cy.initialDate;
 let held=null;if(level!==null&&day){const ix=bars.findIndex(b=>b[0]===day);if(ix>=0){held=0;for(let j=bars.length-1;j>=ix && +bars[j][4]>level;j--)held++}}
 return {ma5:a,ma10:b,ma20:d,aboveAll:above,bullAligned:stacked&&rising,nearMa5:near5,maStage,
    ma5SlopePct:old5===null?null:100*(a/old5-1),ma10SlopePct:old10===null?null:100*(b/old10-1),ma20SlopePct:old20===null?null:100*(d/old20-1),
    necklineHoldDays:held,originalNeckline:level,breakoutDate:day||null,
    necklineHoldLabel:held===null?'尚無固定突破事件':held===0?'目前未站穩原頸線':`連續站上原頸線 ${held} 日`,maRisk:close>a*1.08?'股價距5日線逾8%，追高風險':null};
}
function sixMaPanel(c){
 const a=ChaopanExtrasV311.averages(c),fmt=x=>price(a.values[x]);
 const grids=[5,10,20,60,120,240].map(d=>`<div class="six-ma-unit ${a.values[d]===null?'unknown':a.close>=a.values[d]?'above':'below'}"><small>MA${d}</small><strong>${fmt(d)}</strong><span>${a.values[d]===null?'歷史不足':a.close>=a.values[d]?'站上':'下方壓力'}</span></div>`).join('');
 return `<section class="ma-structure-panel six-ma-panel"><div class="panel-head"><span>六條均線攻防｜MA5 / 10 / 20 / 60 / 120 / 240</span><small>${a.count}根日K</small></div><div class="six-ma-grid">${grids}</div><p class="ma-structure-stage"><b>${esc(a.status)}</b>${a.long.length?'｜壓力：'+a.long.map(d=>'MA'+d).join('、'):''}</p><small>需至少240根有效交易日K才能驗證六線全部站上；均線未還原除權息。</small></section>`;
}
function breakoutTrackPanel(c){
 const events=ChaopanExtrasV311.breakoutTracks(c);
 if(!events.length)return '<section class="ma-structure-panel"><div class="panel-head">突破K線紅綠K／前兩個事件</div><p>尚無可核對的歷史突破事件，不能把一般紅K誤判成突破第一根。</p></section>';
 return `<section class="ma-structure-panel"><div class="panel-head"><span>突破後紅綠K／前兩個已記錄事件</span><small>盤後追蹤</small></div>`+events.map((e,i)=>`<div class="breakout-track-row"><b>${i+1}. ${esc(e.date)}｜${esc(e.source)}</b><span>原突破價 ${price(e.level)}｜${esc(e.trend)}</span><strong class="k-track-count">紅K ×${e.red} ／ 綠K ×${e.green}${e.doji?' ／ 平K ×'+e.doji:''}</strong><small>計算突破日起最近${e.window}根K（事件後合計${e.days}根）；紅K=收盤高於開盤，非漲跌幅顏色。</small></div>`).join('')+'</section>';
}
function institutionalBoard(){
 const board=$('#institutionalBoard');if(!board)return;
 const asOf=state.payload?.asOf;
 if(!globalThis.ChaopanInstitutionV312){
  $('#instDay').textContent='法人金額模組尚未載入';
  $('#institutionalBuys').textContent='請確認 institutional-amount-v312.js 已部署。';
  $('#institutionalSells').textContent='不可顯示未核對的金額排名。';return;
 }
 const options={market:state.instMarket,asset:state.instAsset,order:state.instSort};
 const lists=ChaopanInstitutionV312.ranking(state.marketIntel,state.universe,asOf,options);
 $('#instDay').textContent=lists.ready?'交易日 '+asOf+'｜非即時'+(lists.partial?'｜部分市場／資產':''):'法人／收盤資料尚未全部核對日期';
 const fmtLots=x=>Number(x).toLocaleString('zh-TW',{maximumFractionDigits:3});
 const fmtAmount=x=>Number(x).toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2});
 const mk=rows=>rows.length?rows.map((r,i)=>{
  const value=lists.order==='amount'?`${fmtAmount(r.amountYi)} 億元（估）`:`${fmtLots(r.net)} 張`;
  return `<button type="button" class="inst-stock" data-inst-id="${esc(r.id)}" aria-label="查看${esc(r.name)}法人與走勢詳情"><span class="inst-rank">${i+1}</span><span class="inst-title"><b>${esc(r.code)} ${esc(r.name)}</b><small>${esc(r.market)} · ${esc(r.assetType)}｜外 ${fmtLots(r.foreign)}／投 ${fmtLots(r.trust)}／自 ${fmtLots(r.dealer)} 張${r.close===null?'':`｜收盤 ${price(r.close)}`}</small></span><strong class="${r.net>0?'rising':'falling'}">${r.net>0?'+':''}${value}</strong></button>`;
 }).join(''):'<div class="inst-empty">此分類沒有可核對的同日合格證券，不以舊資料或其他類別補足名單。</div>';
 $('#institutionalBuys').innerHTML=lists.ready?mk(lists.buys):`<div class="inst-empty">${esc(lists.reason)}</div>`;
 $('#institutionalSells').innerHTML=lists.ready?mk(lists.sells):`<div class="inst-empty">${esc(lists.reason)}</div>`;
 const mode=lists.order==='amount'?'法人淨買賣超股數 × 同日收盤價之估算金額，非官方實際成交金額':'法人淨買賣超張數';
 $('#instFoot').textContent=lists.ready?`範圍：${lists.market==='all'?'上市＋上櫃':lists.market==='listed'?'上市':'上櫃'}；${lists.asset==='stock'?'一般股票':lists.asset==='etf'?'ETF':'全部證券'}；依${mode}排名。來源上市 ${lists.sourceStatus.listed}／上櫃 ${lists.sourceStatus.otc}。同日法人欄位 ${integer(lists.available)} 檔，入選排序 ${integer(lists.quoted)} 檔，缺同日收盤 ${integer(lists.excludedNoQuote)} 檔，錯日期 ${integer(lists.excludedWrongDate)} 檔；買超 ${lists.buys.length}、賣超 ${lists.sells.length} 檔。${lists.reason} 非即時，不代表法人持有部位。`:
  `等待來源驗證：${lists.reason}。未取得時保留缺資料提示，不改用單一市場偽稱合併排名。`;
 const rowById=new Map([...lists.buys,...lists.sells].map(r=>[r.id,r]));
 $$('#institutionalBoard [data-inst-id]').forEach(b=>b.onclick=()=>{
  const r=rowById.get(b.dataset.instId);if(r)showInstitutionalDetail(r);
 });
 $$('#institutionalBoard [data-inst-filter]').forEach(btn=>{
  btn.classList.toggle('active',({market:'instMarket',asset:'instAsset',order:'instSort'}[btn.dataset.instFilter] in state)
   &&state[{market:'instMarket',asset:'instAsset',order:'instSort'}[btn.dataset.instFilter]]===btn.dataset.value);
  btn.setAttribute('aria-pressed',String(btn.classList.contains('active')));
  btn.onclick=()=>{
   const key={market:'instMarket',asset:'instAsset',order:'instSort'}[btn.dataset.instFilter];
   if(!key)return;state[key]=btn.dataset.value;institutionalBoard();
  };
 });
}

function showInstitutionalDetail(r){
 // A fund listed in official flow may be absent from equity breakout scanner.
 // Never redirect it to another stock or generate stock-specific breakout levels.
 state.detail=null;state.etfDetail=r;state.chartDays=60;
 if($('#modalOverlay').hidden){history.pushState({chaopanDetail:true},'',location.href);state.detailHistory=true;}
 renderInstitutionalDetail();$('#modalOverlay').hidden=false;document.body.style.overflow='hidden';
}
function renderInstitutionalDetail(){
 const r=state.etfDetail;if(!r)return;
 if(r.isR177Etf===true){renderR177EtfDetail(r);return;}
 const asOf=state.payload?.asOf||'—';
 const match=allRows().find(c=>rowId(c)===r.id);
 if(match){
  const layout=sectorBattleCard(match,{source:'institution',rankText:'三大法人排行・股票',institutional:r});
  $('#modalContent').innerHTML=`<h2 id="modalTitle" class="card-dialog-title">法人排行｜個股作戰卡</h2>${layout}<p class="detail-note">法人資料日期 ${esc(asOf)}。金額排行按同日收盤價推估，不是實際成交金額；技術價位以個股歷史K為準。</p>`;
  return;
 }
 const intel=state.marketIntel||{};
 const history=intel.asOf===asOf?intel.etfOHLCV?.[r.id]:null;
 const bars=Array.isArray(history?.bars)?history.bars:[];
 const latest=bars.length?bars.at(-1):null;
 const dated=Boolean(latest&&latest[0]===asOf&&history?.latestDate===asOf);
 const official=dated&&bars.length>=10;
 const averages=official?ChaopanExtrasV311.averages(bars):null;
 const maVal=d=>averages?.values?.[d];
 const fmtValue=x=>numeric(x)===null?'待資料':price(x);
 const close=dated?numeric(latest[4]):null;
 const stage=r.assetType?.includes('ETF')?'ETF｜法人資料':'證券｜法人資料';
 const info=official?'ETF行情與法人分開核對':'僅法人資料・K線待核對';
 const tone=d=>numeric(maVal(d))===null?'missing':close>=maVal(d)?'above':'below';
 const six=[5,10,20,60,120,240].map(d=>`<span class="sector-ma-dot ${tone(d)}" title="MA${d} ${fmtValue(maVal(d))}">${d}</span>`).join('');
 const overview=`<div class="sector-mini-status"><b>${esc(info)}</b><span class="sector-card-tag muted">非即時</span></div>
 <div class="sector-mini-stats"><span>官方收盤 <b>${fmtValue(close)}</b></span><span>MA5 <b>${fmtValue(maVal(5))}</b></span><span>MA10 <b>${fmtValue(maVal(10))}</b></span></div>
 <div class="sector-six-dots"><span>六均線</span>${six}</div><p class="sector-phase-note">${esc(asOf)}｜${esc(r.assetType)}；ETF不套用個股突破第一根與頸線買賣判斷。</p>`;
 const levels=`<p class="sector-tab-note">目前沒有ETF專用、已驗證的買進、減碼或移動停利模型。不得以法人買賣超直接推定買點。</p>
 <div class="sector-mini-stats"><span>參考收盤 <b>${fmtValue(close)}</b></span><span>MA5 <b>${fmtValue(maVal(5))}</b></span><span>MA10 <b>${fmtValue(maVal(10))}</b></span></div>`;
 const lots=x=>Number(x).toLocaleString('zh-TW',{maximumFractionDigits:3});
 const evidence=`<div class="etf-stat-grid"><div><small>外資</small><b>${lots(r.foreign)}張</b></div><div><small>投信</small><b>${lots(r.trust)}張</b></div><div><small>自營商</small><b>${lots(r.dealer)}張</b></div></div>
 <p class="sector-tab-note">同日法人合計 ${lots(r.net)}張；${esc(r.market)}｜${esc(r.assetType)}；不代表持股或隔日走勢。</p>`;
 const card=unifiedCardShell({key:'institution|'+r.id,rankText:'三大法人排行',stage,
  code:r.code,name:r.name,industry:`${r.market} · ${r.assetType}`,
  closeText:fmtValue(close),changeText:dated?'官方盤後收盤':'收盤待核對',changeClass:'',summary:overview,levels,evidence,
  actions:`<button type="button" data-etf-chart-open="true" ${official?'':'disabled'}>查看走勢圖</button>`});
 const chart=official?makeChart(bars,null,state.chartDays,[],[],null):
  `<div class="battle-chart-empty">${history?.latestDate?'歷史K線最近日期 '+esc(history.latestDate)+'，與法人交易日 '+esc(asOf)+' 不一致。':'尚未取得此ETF的逐日開高低收資料。'}<br>不能使用別檔股票或舊日期資料冒充ETF線圖。</div>`;
 $('#modalContent').innerHTML=`<h2 id="modalTitle" class="card-dialog-title">法人排行｜證券作戰卡</h2>${card}
 <div class="chart-area etf-chart-section"><div class="chart-top"><strong>${esc(r.code)} ${esc(r.name)}｜歷史日K</strong><div class="chart-range">${[20,60,120].map(d=>`<button type="button" class="etf-range-btn ${state.chartDays===d?'active':''}" data-etf-days="${d}">${d}日</button>`).join('')}</div></div>
 <div id="etfChartSvg">${chart}</div></div><p class="detail-note">${bars.length?'來源：'+esc(history.source||'待來源核對')+'｜有效日K '+bars.length+'根':'無完整K線來源'}。資料日期 ${esc(asOf)}，非即時。此卡與個股共用四分頁版型，但不假設有公司財報或個股頸線。</p>`;
 $$('#modalContent [data-etf-days]').forEach(b=>b.onclick=()=>{state.chartDays=Number(b.dataset.etfDays);renderInstitutionalDetail()});
}
function maPanel(c){
 const m=maReadout(c),maTag=m.maStage||'待資料',slope=v=>numeric(v)===null?'待資料':(Number(v)>=0?'↑':'↓')+Math.abs(Number(v)).toFixed(2)+'%';
 const hold=m.necklineHoldDays===null||m.necklineHoldDays===undefined?'尚未有固定突破事件':(m.necklineHoldDays===0?'目前跌回原突破頸線':`連續 ${m.necklineHoldDays} 個交易日收盤站上原頸線`);
 return `<section class="ma-structure-panel" aria-label="五十廿日均線與突破站穩天數"><div class="panel-head"><span>均線強勢結構｜MA5 / MA10 / MA20</span><small>依盤後收盤價計算</small></div>
 <div class="ma-number-grid"><div><small>5日均線</small><strong>${price(m.ma5)}</strong><span>${slope(m.ma5SlopePct)}</span></div><div><small>10日均線</small><strong>${price(m.ma10)}</strong><span>${slope(m.ma10SlopePct)}</span></div><div><small>20日均線</small><strong>${price(m.ma20)}</strong><span>${slope(m.ma20SlopePct)}</span></div></div>
 <p class="ma-structure-stage"><b>${esc(maTag)}</b>｜${esc(hold)}</p>
 <p class="ma-structure-note">${m.originalNeckline?`原頸線 ${price(m.originalNeckline)} 元（${esc(m.breakoutDate||'日期待核對')}）；`:''}站上三線不等於可以追高；未還原K線遇除權息需核對。${m.maRisk?' ⚠ '+esc(m.maRisk):''}</p></section>`;
}
function confirmedStrengthPanel(c){
 const audit=confirmedStrengthAudit(c),src=strengthSource(c),e=continuationReadout(c);
 const head=src?src+'｜符合排行資格':'尚未符合嚴格四線認證';
 const why=src==='持續強勢'?e.reason:src==='新突破強勢'?'首日／次日量價較佳且站上短期均線；後續仍需驗證是否守穩原頸線':audit.confirmed?'MA5＞MA10＞MA20＞MA60、均線上揚且有固定頸線事件':audit.reasons.slice(0,4).join('；');
 return `<section class="ma-structure-panel"><div class="panel-head"><span>強勢資格｜${esc(head)}</span><small>非買進建議</small></div><p>MA60 ${price(audit.ma60)} 元｜短期事件站穩 ${audit.holdDays===null?'待資料':integer(audit.holdDays)+' 日'}｜長期追蹤 ${e.holdDays==null?'待資料':integer(e.holdDays)+' 日'}</p><p class="ma-structure-note">${esc(why)}</p><p class="ma-structure-note">四線嚴格認證和長期沿5／10／20日線續強分開核對，強勢回測保留觀察但不保證續漲。</p></section>`;
}
// V3.0.3: continuing trend remains eligible long after day 1/day 2.
// Backend follows the original as-of event across a longer interval;
// legacy snapshots lacking that result remain explicitly unverified.
// V3.0.5 compatibility fix: V3.0.3 Python writes continuationV303.stage,
// while a later frontend expected continuationContext.kind. Accept both real
// structures; do not infer a certified breakout from an absent data field.
function hasContinuationEvidence(c){
 return Boolean((c?.continuationContext&&typeof c.continuationContext.kind==='string')||
                (c?.continuationV303&&typeof c.continuationV303.stage==='string'));
}
const continuationReadout=memoByRow(continuationReadoutCore);
function continuationReadoutCore(c){
 const e=c.continuationContext;
 if(e&&typeof e==='object'&&typeof e.kind==='string')return e;
 const v=c.continuationV303;
 if(v&&typeof v==='object'&&typeof v.stage==='string'){
   const kinds={continued:'trend',pullback:'pullback',risk:'warning',weak:'weak',
      consolidation:'consolidation',insufficient:'insufficient',not_established:'not_established'};
   const reason=[...(Array.isArray(v.reasons)?v.reasons:[]),...(v.warning?[v.warning]:[])].filter(Boolean).join('；');
   return {kind:kinds[v.stage]||'unverified',label:v.label||'趨勢待確認',
      qualified:v.qualified===true,breakoutDate:v.anchorDate||null,
      originalNeckline:v.anchorLevel??null,daysSinceBreakout:v.daysSinceBreakout??null,
      holdDays:v.consecutiveHoldDays??null,reason:reason||v.label||'待完整驗證',
      source:v.source||'V3.0.3 歷史日K判斷',riskFlags:Array.isArray(v.reasons)?v.reasons:[]};
 }
 return {kind:'unverified',label:'持續趨勢待新版盤後掃描',holdDays:null,
   reason:'未收到 V3.0.3 趨勢判斷欄位；需檢查 scripts 與盤後資料重算'};
}
function continuationDataSummary(){
 const rows=allRows();
 const available=rows.reduce((n,c)=>n+(hasContinuationEvidence(c)?1:0),0);
 return {total:rows.length,available,rulesVersion:state.universe?.rulesVersion||state.payload?.rulesVersion||'未知'};
}
function continuationPanel(c){
 const e=continuationReadout(c),type=e.kind==='trend'?'confirmed':e.kind==='warning'?'risk':'near';
 const flags=(e.riskFlags||[]).slice(0,4).map(x=>'<li>'+esc(x)+'</li>').join('');
 return `<section class="ma-structure-panel continuation-panel"><div class="panel-head"><span>突破後長期追蹤｜${esc(e.label)}</span><small>非保證漲幅</small></div>
 <p>突破事件 ${esc(e.breakoutDate||'待資料')}｜原參考區 ${price(e.originalNeckline)} 元｜距首破 ${e.daysSinceBreakout==null?'待資料':integer(e.daysSinceBreakout)+' 交易日'}｜連續守住 ${e.holdDays==null?'待資料':integer(e.holdDays)+' 日'}</p>
 <p class="ma-structure-note">${esc(e.reason||'等待盤後完整歷史資料')}；${esc(e.source||'來源待確認')}。歷史32日區間高點不冒稱大量K頸線。</p><p class="ma-structure-note">突破後逐日守 MA5＋MA10：${e.strictMA510Hold===true?'全程收盤守住':e.strictMA510Hold===false?'過程曾收盤跌破（非一路守穩）':'尚無逐日驗證資料'}${e.ma510CloseBreakDays?.length?'｜收盤跌破日期 '+esc(e.ma510CloseBreakDays.join('、')):''}${e.ma510WickBreakDays?.length?'｜盤中下影曾跌破 '+integer(e.ma510WickBreakDays.length)+' 次（部分日期）':''}</p>${flags?'<ul>'+flags+'</ul>':''}</section>`;
}
function earlyStrengthEligible(c){
 const p=breakoutReadout(c),m=maReadout(c),v=numeric(c.close),mv=techMetrics(c);
 return ['first','second'].includes(p.phase)&&p.tone==='good'&&v!==null&&
    mv.ma20!==null&&v>mv.ma20&&v>m.ma5&&v>m.ma10&&
    m.ma5>m.ma10&&m.ma10>m.ma20;
}
// V3.0.4: a hard, auditable *liquidity* gate for rankings and export lists.
// This is a historical EOD check, not proof of a real-time quote or suspension.
const liquidityMemo=new WeakMap();
function liquidityEvidence(c){
 const stamp=r145RowStamp(c)+'|'+String(state.payload?.asOf||'');
 const prev=liquidityMemo.get(c);if(prev?.stamp===stamp)return prev.value;
 // R215 candidate: do not compress missing or malformed trading bars into a 20-day window.
 const bars=Array.isArray(c.bars)?c.bars:[];
 const last=bars.at(-1),recent=bars.slice(-20);
 // Where the same-day market reference covers the entire sample, require every session.
 const firstDate=recent[0]?.[0],sessions=r214Sessions?.dates;
 const covered=Array.isArray(sessions)&&sessions.includes(firstDate)&&sessions.includes(c.date);
 const expected=covered?sessions.filter(d=>d>=firstDate&&d<=c.date):null;
 const sessionMatch=!expected||(expected.length===recent.length&&expected.every((d,i)=>d===recent[i]?.[0]));
 const full=sessionMatch&&recent.length===20&&recent.every((b,i)=>r129ValidCandle(b)&&r211HoldingDate(b[0])&&
   (!i||b[0]>recent[i-1][0]))&&
   last?.[0]===c.date && (!state.payload?.asOf || state.payload.asOf===c.date);
 const avgLots=full?recent.reduce((n,b)=>n+Number(b[5]),0)/20:null;
 const avgAmountM=full?recent.reduce((n,b)=>n+Number(b[4])*Number(b[5]),0)/20000:null;
 const dayLots=full?Number(last[5]):null;
 const result={valid:full,avgLots,avgAmountM,dayLots,
   strength:full&&avgLots>=1000&&avgAmountM>=20&&dayLots>=100,
   launch:full&&avgLots>=300&&avgAmountM>=10&&dayLots>=50};
 result.label=!sessionMatch?'近20根K與市場交易日不一致（停牌／無成交／缺漏待核對）':!full?'當日資料或20日成交量不足':result.strength?'強勢可交易':result.launch?'突破追蹤可交易':'低流動性（只供研究）';
 liquidityMemo.set(c,{stamp,value:result});return result;
}
function liquidityPanel(c){
 const v=liquidityEvidence(c),num=x=>x===null?'待資料':Number(x).toLocaleString('zh-TW',{maximumFractionDigits:1});
 return `<section class="ma-structure-panel"><div class="panel-head"><span>可交易性檢查｜盤後歷史量能</span><small>${esc(v.label)}</small></div><p>最近20根日K均量（含當日） <b>${num(v.avgLots)} 張</b> ／ 平均每日成交金額 <b>${num(v.avgAmountM)} 百萬元</b> ／ 最新交易日 <b>${num(v.dayLots)} 張</b></p><p class="ma-structure-note">強勢榜門檻：1000張＋2000萬元＋最近日100張；突破追蹤門檻：300張＋1000萬元＋最近日50張。未達門檻仍保留搜尋與自選。這不是即時成交檢查；當日無成交、停牌與券商報價缺漏仍須另外查證。</p></section>`;
}
const strengthSource=memoByRow(strengthSourceCore);
function strengthSourceCore(c){
 const a=confirmedStrengthAudit(c),e=continuationReadout(c);
 if(e.kind==='trend')return '持續強勢';
 if(a.confirmed)return '已確認強勢';
 if(earlyStrengthEligible(c))return '新突破強勢';
 return null;
}
function sixtyScore(c){
 const tag=new Set(c.tags||[]);
 let s=Math.min(160,Number(c.score)||0);
 if(tag.has('first'))s+=32;
 if(tag.has('prep'))s+=22;
 if(tag.has('near'))s+=14;
 if(tag.has('volume'))s+=12;
 if(c.confirmed)s+=10;
 if(Number(c.limit20)>=3)s+=4; // 漲停加分有限，不能主導排名
 if(c.overextended)s-=45;
 if(Number.isFinite(+c.distancePct) && +c.distancePct>5)s-=20;
 const tech=techMetrics(c);
 if(tech.ma20&&Number(c.close)<tech.ma20)s-=12;
 if(tech.ret20!=null && tech.ret20>45)s-=18;
 return Math.round(s);
}
function allRows(){return state.universe?.rows||state.payload?.candidates||[];}
function rowId(c){return c.market+'-'+c.code;}
// V2.8: All stocks share ONE strength ranking; strength is not buy readiness.
// Quantities below are heuristic research weights, not a fitted win probability.
// Missing evidence does not pretend to be zero-risk. High-risk stocks remain searchable.
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const strengthScore=memoByRow(strengthScoreCore);
function strengthScoreCore(c){
 const t=c.trading||{};
 const trend=numeric(t.trend),r5=numeric(t.return5Pct),vol=numeric(c.volumeRatio);
 if(trend===null||r5===null||vol===null||c.unifiedStage==='資料不足')return null;
 // 25 trend, 12 5-day momentum, 12 relative-market, 8 relative-industry,
 // 16 volume expansion, 12 recent breakout state, 10 daily candle, 5 entry quality.
 let result=.25*clamp(trend,0,100);
 result+=12*clamp(r5/10,0,1);
 const market=numeric(c.relMarket5Pct),sector=numeric(c.relSector5Pct);
 result+=market===null?5:12*clamp((market+2)/10,0,1);
 result+=sector===null?3:8*clamp((sector+2)/8,0,1);
 result+=16*clamp((vol-.6)/1.4,0,1);
 const stage=String(c.unifiedStage||'');
 let phase=2;
 if(stage.includes('近期首次突破')||breakoutReadout(c).phase==='first')phase=12;
 else if(breakoutReadout(c).phase==='second' && breakoutReadout(c).tone==='good')phase=11;
 else if(stage.includes('重新站回後確認')||stage.includes('突破後續強')||stage.includes('突破後趨勢續行'))phase=11;
 else if(breakoutReadout(c).phase==='second' && breakoutReadout(c).tone==='danger')phase=0;
 else if(stage.includes('突破後量縮整理／守頸線')||stage.includes('接近頸線')||stage.includes('接近近期頸線'))phase=9;
 else if(breakoutReadout(c).phase==='ready')phase=8;
 else if(stage.includes('準備區')||stage.includes('待確認'))phase=6;
 if(stage.includes('品質偏弱'))phase=Math.min(phase,4);
 if(stage.includes('突破失敗')||stage.includes('結構破壞')||stage.includes('趨勢轉弱'))phase=0;
 result+=phase;
 const hi=numeric(c.high),lo=numeric(c.low),close=numeric(c.close),open=numeric(c.open);
 if(hi!==null&&lo!==null&&close!==null&&hi>lo){
   const closePos=clamp((close-lo)/(hi-lo),0,1);
   result+=10*closePos*(open!==null&&close<open?.5:1);
 }
 result+=.05*clamp(numeric(t.entryQuality)??0,0,100);
 const m=maReadout(c);
 if(m.bullAligned && m.aboveAll)result+=m.nearMa5?7:4;
 else if(m.aboveAll)result+=2;
 const hold=numeric(m.necklineHoldDays);
 if(hold!==null&&hold>=2&&hold<=10&&m.originalNeckline)result+=Math.min(4,hold);
 if(continuationReadout(c).kind==='trend')result+=10;
 if(continuationReadout(c).kind==='pullback')result-=6;
 if(m.maRisk)result-=7;
 if(c.riskLevel==='medium')result-=12;
 if(c.riskLevel==='high')result-=32;
 if(c.riskFirst)result-=32;
 if(c.possiblePriceAdjustment)result-=25;
 if(c.onePriceLimit)result-=10;
 if(c.overextended)result-=10;
 const r20=numeric(t.return20Pct);
 if(r20!==null&&r20>40)result-=Math.min(15,(r20-40)*.4+4);
 if(stage.includes('突破失敗')||stage.includes('結構破壞'))result-=18;
 return Math.round(clamp(result,0,100)*10)/10;
}
// At most twenty authentic strength candidates; do not pad a weak market to 20.
// One classifier for ranking labels, phase tabs and stock details.
// Before the V2.9 backend rebuild, only explicitly existing cycle/history
// facts are reused; no fabricated new breakout assessment.
const breakoutReadout=memoByRow(breakoutReadoutCore);
function breakoutReadoutCore(c){
 if(c.breakoutSequence && c.breakoutSequence.phase)return c.breakoutSequence;
 const e=c.cycle,neck=latestNeck(c),close=numeric(c.close);
 if(e && Number.isInteger(Number(e.daysSinceFirst))){
   const n=Number(e.daysSinceFirst),ph=n===0?'first':n===1?'second':'follow';
   return {phase:ph,level:e.level,initialDate:e.initialDate,daysSinceFirst:n,
     label:ph==='first'?'突破頸線｜第一根':ph==='second'?'突破頸線｜第二根':'突破後持續追蹤',
     assessment:'舊版資料只有突破事件；第二根量價診斷待V2.9掃描更新',tone:'watch',reasons:[]};
 }
 if(neck && close && close<neck && (neck/close-1)<=.03)
   return {phase:'ready',level:neck,label:'接近頸線｜第一根預備',
     assessment:'尚未突破；明日觀察能否形成第一根',tone:'watch',reasons:[]};
 return {phase:'none',label:'一般觀察',assessment:'尚未形成可驗證的第一根事件',tone:'neutral',reasons:[]};
}
// Star labels are derived only from confirmed backend event data.
// A prior screening appearance is shown only when stageHistory is present.
function breakoutStar(c){
 if(r133RiskGate(c).status==='risk')return null;
 // The official EOD star state is authoritative; no star survives a close below its event neckline.
 const close=numeric(c.close);
 const eventLevel=numeric(c.breakoutEvent?.level);
 const neck=eventLevel>0?eventLevel:numeric(c.neck);
 if(neck>0&&Number.isFinite(close)&&close<neck)return null;
 const official=String(c.starPhase||'').toLowerCase();
 const officialMarks={ready:'☆',first:'★1',second:'★2',third:'★3',fourth_plus:'★4+'};
 if(official){
   if(!officialMarks[official])return null;
   if(official!=='ready'&&!(neck>0&&(official==='first'?close>neck:close>=neck)))return null;
   return {mark:officialMarks[official],title:official==='ready'?'預備突破':`同一頸線突破階段 ${officialMarks[official]}`};
 }
 // Legacy snapshots have no canonical event state. Do not fabricate a ★ from an unrelated structural neckline.
 const b=breakoutReadout(c);
 if(b.phase==='ready'&&neck>0&&close<=neck)return {mark:'☆',title:'預備突破（舊資料，待盤後核對）'};
 return null;
}
function breakoutQualityExplanation(c){
 const p=String(c.starPhase||'').toLowerCase();
 const q=String(c.breakoutQuality||'').toLowerCase();
 const names={ready:'預備突破',first:'第一根突破',second:'第二根守頸線',third:'第三根守頸線',fourth_plus:'第四根以上',invalid:'已跌破頸線'};
 const desc={strong:'量價條件偏強（非買進保證）',watch:'條件尚未完全確認，列觀察',weak:'均線或量價轉弱，避免視為續攻',invalid:'收盤跌破事件頸線，星號取消'};
 if(!p||p==='none')return '<div class="breakout-stage-audit">突破階段：待最新盤後資料確認</div>';
 const reasons=(c.breakoutQualityReasons||[]).map(x=>esc(x)).join('、');
 return `<div class="breakout-stage-audit"><b>${esc(names[p]||p)}</b>｜${esc(desc[q]||'品質資料待更新')}${reasons?'｜原因：'+reasons:''}<small>星號＝突破進度；紅黃綠燈＝量價品質。每日盤後資料未更新時，畫面不會自行變更。</small></div>`;
}
function breakoutQualityHTML(c){
 const q=String(c.breakoutQuality||'');
 const map={strong:['🟢','續強'],watch:['🟡','觀察'],weak:['🔴','轉弱'],invalid:['🔴','突破失效']};
 if(!map[q])return '';
 const [icon,label]=map[q];
 return `<span class="breakout-quality" title="${esc((c.breakoutQualityReasons||[]).join('；'))}">${icon} ${label}</span>`;
}
function breakoutStarHTML(c){
 const star=breakoutStar(c);if(!star)return '<span class="breakout-star-empty">突破階段待核對</span>';
 return `<span class="breakout-star-badge" title="${esc(star.title)}" aria-label="${esc(star.title)}">${esc(star.mark)} ${esc(star.title)}</span>`;
}
function phasePanel(c){
 const b=breakoutReadout(c),reasons=(b.reasons||[]).slice(0,3);
 const k=c.intradayPlan||{};
 const outline=b.phase==='ready'&&k.crossPrice!=null?`<p>下一交易日預設跨越 <strong>${price(k.crossPrice)} 元</strong>；收盤確認前只能算盤中預警。</p>`:'';
 const compare=b.phase==='second'?`<div class="phase-compare"><div><small>原突破頸線</small><b>${price(b.level)}</b></div><div><small>第一根收盤</small><b>${price(b.firstClose)}</b></div><div><small>第二根收盤</small><b>${price(b.secondClose)}</b></div><div><small>次日量／首日量</small><b>${numeric(b.secondVsFirstVolumeRatio)===null?'待新版資料':Number(b.secondVsFirstVolumeRatio).toFixed(2)+' 倍'}</b></div></div>`:'';
 return `<section class="phase-panel phase-${esc(b.tone||'neutral')}" aria-label="突破K線第一根第二根判斷">
 <div class="phase-header"><strong>突破階段｜${esc(b.label)}</strong><span>${esc(c.date||'日期待資料')} · 盤後</span></div>
 <p>${esc(b.assessment||'待盤後資料重算')}</p>${outline}${compare}
 ${reasons.length?`<ul>${reasons.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}
 <div class="phase-next"><b>接下來看：</b>${esc(b.next||'核對最新K棒、原頸線與量價；不是保證買賣訊號')}</div>
 <small>「第二根」指首次突破後的下一個交易日，不是第二根紅K；疑似賣壓不能證實主力出貨。</small>
 </section>`;
}
// V3.0.2: Confirmed continuing strength is an eligibility CHECK, not
// a small weighted bonus. New first-bar breakouts remain visible in stage tabs.
// Only use observed daily bars and a recorded original breakout event.
const confirmedStrengthAudit=memoByRow(confirmedStrengthAuditCore);
function confirmedStrengthAuditCore(c){
 const bars=(c.bars||[]).filter(b=>Array.isArray(b)&&numeric(b[4])!==null&&numeric(b[4])>0);
 const m=maReadout(c),t=techMetrics(c),close=numeric(c.close),ma60=t.ma60;
 const reasons=[];
 if(bars.length<61||ma60===null)reasons.push('不足61根有效日K，無法檢查60日均線與斜率');
 if([m.ma5,m.ma10,m.ma20,ma60,close].some(x=>numeric(x)===null))reasons.push('均線資料不足');
 else {
   if(!(close>m.ma5&&close>m.ma10&&close>m.ma20&&close>ma60))reasons.push('股價未收在全部MA5/10/20/60之上');
   if(!(m.ma5>m.ma10&&m.ma10>m.ma20&&m.ma20>ma60))reasons.push('MA5＞MA10＞MA20＞MA60排列不完整');
 }
 // MA5/10 must rise for two consecutive observations, MA20 may be flat
 // but must not fall. This avoids one-day positive noise determining strength.
 const cls=bars.map(b=>+b[4]);
 const meanAt=(n,end)=>end>=n?cls.slice(end-n,end).reduce((x,y)=>x+y,0)/n:null;
 if(cls.length>=62){
   const p1=meanAt(5,cls.length-1),p2=meanAt(5,cls.length-2);
   const q1=meanAt(10,cls.length-1),q2=meanAt(10,cls.length-2);
   const w1=meanAt(20,cls.length-1),w0=meanAt(20,cls.length);
   if(!(m.ma5>p1&&p1>=p2&&m.ma10>=q1&&q1>=q2&&w0>=w1))reasons.push('5/10日線未連續走揚，或20日線轉下');
 } else reasons.push('缺少連續均線方向資料');
 const held=numeric(m.necklineHoldDays),original=numeric(m.originalNeckline);
 if(held===null||original===null)reasons.push('缺少可核對的原始突破頸線事件');
 else if(held<2||!(close>original))reasons.push('原頸線尚未連續2個交易日收盤站穩');
 const phase=breakoutReadout(c),stage=String(c.unifiedStage||'')+' '+String(c.followStatus||'');
 if(c.riskLevel==='high'||c.riskLevel==='medium'||c.riskFirst||c.possiblePriceAdjustment)reasons.push('存在較高風險／未核對調整價格');
 if(phase.tone==='danger'||/假突破|突破失敗|結構破壞|趨勢轉弱|跌破|轉弱|回弱/.test(stage))reasons.push('近期有失守或轉弱訊號');
 if(bars.length>=21){
   const today=bars.at(-1),prev=bars.at(-2),o=+today[1],h=+today[2],l=+today[3],c=+today[4],v=+today[5];
   const prior20=bars.slice(-21,-1).map(b=>+b[5]).filter(v=>v>=0);
   const avg=prior20.length===20?prior20.reduce((a,b)=>a+b,0)/20:null;
   if(avg&&h>l&&v/avg>=1.5&&c<o&&(c-l)/(h-l)<=.35)reasons.push('放量收低，可能存在明顯賣壓');
   if(prev&&cls.length>=3&&c<+prev[4]&&+prev[4]<cls.at(-3)&&c<meanAt(5,cls.length-1))reasons.push('連兩日收低且跌回前一日5日均線');
 }
 return {confirmed:reasons.length===0,reasons,ma60,holdDays:held};
}
const isStrengthCandidate=memoByRow(isStrengthCandidateCore);
function isStrengthCandidateCore(c){
 const sc=strengthScore(c),trend=numeric(c.trading?.trend);
 return r133RiskGate(c).status==='eligible' && liquidityEvidence(c).strength && sc!==null&&sc>=58&&trend!==null&&trend>=55&&
   !c.riskFirst&&c.riskLevel!=='high'&&c.riskLevel!=='medium'&&
   !c.possiblePriceAdjustment&&!!strengthSource(c)&&
   !(continuationReadout(c).riskFlags||[]).some(x=>x.includes('放量收低'));
}
function rankingScore(c){return strengthScore(c)}
let rankedCacheRows=null,rankedCache=null,rankedCacheStamp='';
function rankedUniverse(){return r185Scoped(()=>rankedUniverseR185())}
function rankedUniverseR185(){
 const rows=state.universe?.rows||state.payload?.candidates||[];
 const stamp=r145UniverseStamp(rows)+'|'+String(state.payload?.asOf||'');
 if(rankedCacheRows===rows&&rankedCache&&rankedCacheStamp===stamp)return rankedCache;
 rankedCacheRows=rows;rankedCacheStamp=stamp;
 rankedCache=rows.slice().sort((a,b)=>
   Number(isStrengthCandidate(b))-Number(isStrengthCandidate(a)) ||
   (strengthScore(b)??-1)-(strengthScore(a)??-1) ||
   (numeric(b.unifiedScore)??-1)-(numeric(a.unifiedScore)??-1) ||
   String(a.code).localeCompare(String(b.code),'zh-Hant',{numeric:true}) ||
   String(a.market).localeCompare(String(b.market),'zh-Hant'));
 return rankedCache;
}
function strengthCandidates(){return rankedUniverse().filter(c=>r204Breakout(c).eligible&&isStrengthCandidate(c))}
// V3.0.8: Three independent ranking lenses share the same EOD bars and event history.
// All historical stage tabs and direct stock searches continue to use rankedUniverse().
// V3.1.0: two real user intents. All scoring uses the current EOD snapshot only.
// The desk shortlist is not a recommendation or a live market scan.
const deskMemo=new WeakMap();
function deskEvidence(c){
 const stamp=r145RowStamp(c)+'|'+String(state.payload?.asOf||'');
 const cached=deskMemo.get(c);if(cached?.stamp===stamp)return cached.value;
 const plan=ChaopanDeskV310.evaluate(c,{asOf:state.payload?.asOf,phase:breakoutReadout(c)});
 deskMemo.set(c,{stamp,value:plan});return plan;
}
let deskCacheRows=null,deskCacheStamp='';const deskCache=new Map();
function deskRankedCandidates(lens=state.rankLens){
 const rows=state.universe?.rows||state.payload?.candidates||[];
 const stamp=r145UniverseStamp(rows)+'|'+String(state.payload?.asOf||'');
 if(rows!==deskCacheRows||stamp!==deskCacheStamp){deskCacheRows=rows;deskCacheStamp=stamp;deskCache.clear()}
 if(deskCache.has(lens))return deskCache.get(lens);
 const launch=lens==='launch';
 const sorted=rows.filter(c=>{if(!r204Breakout(c).eligible)return false;const p=deskEvidence(c);return launch?Boolean(p.qualified&&p.stage):
   Boolean(p.momentumStage&&lensEvidence(c).qualified.momentum);}).sort((a,b)=>{
   const aa=deskEvidence(a),bb=deskEvidence(b);
   return (bb.score.potential??0)-(aa.score.potential??0)||
      (bb.score.entry??0)-(aa.score.entry??0)||String(a.code).localeCompare(String(b.code),'zh-Hant',{numeric:true});
 });
 deskCache.set(lens,sorted);return sorted;
}
function deskPlanHTML(c,small=false){
 const p=deskEvidence(c),type={ready:'頸線預備',first:'突破第一根',second:'突破第二根',third:'突破第三根',surge:'主升段延續',reentry:'回測再發動',caution:'高波動警戒'};
 const label=type[p.stage]||type[p.momentumStage]||'條件不足';
 const riskText=p.flags.length?p.flags.slice(0,2).join('；'):'仍須盤中核對K棒、量價及支撐';
 if(!p.score.potential)return `<div class="desk-mini warn">資料日期或日K不足，交易計畫待核對</div>`;
 const tag=p.priority?'優先觀察':p.momentumStage==='caution'?'不宜追價':'等待確認';
 if(small)return `<div class="desk-mini"><div><b>${esc(label)}</b><span class="desk-smallpill ${p.priority?'good':p.momentumStage==='caution'?'bad':''}">${esc(tag)}</span></div>
 <div class="desk-mini-scores"><span>動能潛力 <b>${p.score.potential}</b></span><span>進場品質 <b>${p.score.entry}</b></span></div>
 <div class="desk-mini-levels"><span>觀察 ${price(p.trigger)}</span><span>追價警戒 ${price(p.chase)}</span><span>頸線防守 ${price(p.defense)}</span></div>
 <small>${esc(riskText)}</small>${ChaopanIntel.miniLights(state.marketIntel,c,p)}</div>`;
 return `<section class="desk-detail" aria-label="盤後觀察交易計畫"><div class="desk-detail-head"><strong>盤後隔日觀察計畫｜${esc(label)}</strong><span class="desk-smallpill ${p.priority?'good':p.momentumStage==='caution'?'bad':''}">${esc(tag)}</span></div>
  <div class="desk-detail-grid"><div><small>飆股／發動潛力</small><b>${p.score.potential}分</b></div><div><small>當前進場品質</small><b>${p.score.entry}分</b></div><div><small>下一日觀察價</small><b>${price(p.trigger)}</b></div><div><small>價格追高警戒</small><b>${price(p.chase)}</b></div><div><small>原頸線防守參考</small><b>${price(p.defense)}</b></div><div><small>半ATR風險預算參考</small><b>${price(p.riskBudget)}</b></div></div>
  <p><b>判斷：</b>${esc(p.status)}。${esc(riskText)}。</p>
  <p class="desk-disclaimer">${p.rr!==null?`已知壓力／風險預算約 ${p.rr} 倍；不是目標價或成交保證。`:'無可核對的上方壓力與獲利空間時，不給虛構風險報酬比。'}觀察價是前一交易日預先規劃，下一日必須核對券商即時價格、K棒和量能；任何計算分數都不是買進指令。</p></section>`;
}
// Guardrail: do not present an outdated EOD shortlist as today's trade plan.
// Count weekdays since the snapshot; no holiday calendar is available, so if
// uncertain we suppress the shortlist rather than imply fresh real-time data.
// R126: one shared Taiwan EOD freshness gate. Optional official session dates must
// be loaded by the data pipeline into ChaopanTradingCalendar.sessions (YYYY-MM-DD).
// Without that calendar, weekdays are only a conservative approximation.
function chaopanEodFreshness(asOf){
 const iso=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 if(!iso(asOf))return {stale:true,reason:'盤後日期無效'};
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 const today=`${parts.year}-${parts.month}-${parts.day}`;
 if(asOf>today)return {stale:true,reason:'盤後日期晚於台灣當日'};
 const sessions=globalThis.ChaopanTradingCalendar?.sessions;
 const valid=Array.isArray(sessions)&&sessions.length>0&&sessions.every(iso)&&sessions.includes(asOf);
 // Calendar coverage must reach today (or most recent previous trading day),
 // otherwise a partial/stale calendar cannot certify freshness.
 const sorted=valid?[...new Set(sessions)].sort():[];
 const coverageEnd=globalThis.ChaopanTradingCalendar?.coverageEnd;
 const covered=valid&&iso(coverageEnd)&&coverageEnd>=today&&sorted[0]<=asOf;
 const todayUTC=Date.parse(today+'T00:00:00Z'),sourceUTC=Date.parse(asOf+'T00:00:00Z');
 let elapsed=0;
 if(covered){elapsed=sorted.filter(d=>d>asOf&&d<=today).length;}
 else for(let d=sourceUTC+86400000;d<=todayUTC;d+=86400000){const w=new Date(d).getUTCDay();if(w>0&&w<6)elapsed++;}
 const weekday=new Date(todayUTC).getUTCDay(),hour=Number(parts.hour);
 const stale=elapsed>1||(elapsed>0&&weekday>0&&weekday<6&&hour>=16);
 return {stale,calendarVerified:covered,elapsed,reason:stale?(covered?'已超過可核對的交易日':'缺少完整交易日曆；依工作日保守判定資料可能過期'):''};
}
function staleDeskSnapshot(asOf){return chaopanEodFreshness(asOf).stale;}

function renderSectorPulse(rows){return r185Scoped(()=>renderSectorPulseR185(rows))}
function renderSectorPulseR185(rows){
 const output=$('#sectorPulse');if(!output)return;
 const scan=r42Scan(),leaders=scan?.sectorLeaders||[];
 output.innerHTML=leaders.length?
  `<div>${leaders.map(x=>`<b>${esc(x.name)} <small>5日中位 ${x.median5>0?'+':''}${x.median5.toFixed(1)}%｜上漲 ${Math.round(x.advanceRatio*100)}%｜${x.sample} 檔</small></b>`).join('')}</div>`:
  '目前沒有同時符合「近5日正報酬、族群過半上漲、優於市場中位數」的領漲族群，不把相對抗跌當成領漲。';
}
// r8: Expanded sectors use data-driven battle cards, not the old compact rows.
// Keep expansion and pagination in memory; refreshing the same EOD snapshot does
// not trigger another fetch or re-render unexpanded stock cards.
let sectorPacked=[],sectorRanks=new Map(),sectorDate='',sectorMode='strong',sectorAudit=null,sectorAuditSource=null;
const sectorOpen=new Set(),sectorShown=new Map();
let sectorInteracted=false;
const SECTOR_BATCH=5;
const sectorCardTabs=new Map();
// Verified model valuation is displayed per card when available; never filters the radar list.
// r10 single source of truth for every expanded battle card (sector/rank/desk/institution/ETF).
// Differences belong to the data and guarded fields, never to the card skeleton.
// r14: Research tab on the SAME battle card, not hidden only inside the chart modal.
// Keep the price dashboard compact; never synthesize missing official fundamentals.
// r14-valuation: never show an estimated price unless original financial
// evidence, quarterly EPS reconciliation and PE history have passed backend
// checks. Individual stock technical cards remain usable without valuation.
function verifiedValuation(c){
 const f=c?.fundamentals||{},v=numeric;
 const keys=['epsTtm','peRiverLow','peRiverMid','peRiverHigh','modelTargetLow','modelTargetMid','modelTargetHigh'];
 if(keys.some(k=>v(f[k])===null))return null;
 const t=v(f.epsTtm),pes=['peRiverLow','peRiverMid','peRiverHigh'].map(k=>v(f[k]));
 const targets=['modelTargetLow','modelTargetMid','modelTargetHigh'].map(k=>v(f[k]));
 if(!f.epsTtmSource?.includes('FinMind')||!f.modelType||f.epsTtmPeriod!==f.epsPeriod ||v(f.eps)===null ||v(f.pe)===null ||v(f.revenueYoY)===null || !f.revenuePeriod)return null;
 if(!f.modelAsOf||!c?.date)return null;
 const dayMs=Date.parse(c.date+'T00:00:00Z')-Date.parse(f.modelAsOf+'T00:00:00Z');
 if(!Number.isFinite(dayMs)||dayMs<0||dayMs>40*86400000)return null;
 if(!(t>0&&Number(f.peRiverSample)>=120&&pes[0]>=3&&pes[0]<=pes[1]&&pes[1]<=pes[2]&&pes[2]<=100))return null;
 if(targets.some((p,i)=>!(p>0&&Math.abs(p-t*pes[i])<=Math.max(.1,p*.002))))return null;
 return {eps:t,pes,targets,date:f.modelAsOf,period:f.epsTtmPeriod,samples:Number(f.peRiverSample),source:f.epsTtmSource};
}
// r15: verified published revenue/EPS may be shown even when a full
// 4-quarter valuation is unavailable. No silent quarter-to-year extrapolation.
function financeSnapshot(c){
 const f=c?.fundamentals||{},as=String(c?.date||'');
 const cur=/^\d{4}-\d{2}-\d{2}$/.test(as)?new Date(as+'T00:00:00Z'):null;
 if(!cur||!Number.isFinite(cur.getTime()))return {revenue:null,eps:null,pe:null};
 const rp=String(f.revenuePeriod||'');let revenue=null;
 if(/^\d{4}-(0[1-9]|1[0-2])$/.test(rp)){
  const months=(cur.getUTCFullYear()-Number(rp.slice(0,4)))*12+cur.getUTCMonth()+1-Number(rp.slice(5,7));
  if(months>=0&&months<=4){
   const yoy=numeric(f.revenueYoY),monthly=numeric(f.revenueMonthThousand);
   if(yoy!==null||monthly!==null){revenue={period:rp,yoy,monthly:monthly!==null&&monthly>=0?monthly:null};}
  }
 }
 const ep=String(f.epsPeriod||'');let eps=null;
 const m=ep.match(/^(\d{4})Q([1-4])$/);
 if(m){
  const y=Number(m[1]),q=Number(m[2]),release=f.epsStatementDate|| (q===1?`${y}-05-16`:q===2?`${y}-08-16`:q===3?`${y}-11-16`:`${y+1}-04-01`);
  const released=new Date(release+'T00:00:00Z'),age=(cur-released)/86400000,amount=numeric(f.eps);
  if(amount!==null&&Number.isFinite(age)&&age>=0&&age<=520){eps={period:ep,amount};}
 }
 const pd=String(f.valuationDate||'');const d=/^\d{4}-\d{2}-\d{2}$/.test(pd)?new Date(pd+'T00:00:00Z'):null;
 const pe=numeric(f.pe),peAge=d?(cur-d)/86400000:Infinity;
 return {revenue,eps,pe:(pe!==null&&pe>0&&peAge>=0&&peAge<=40)?{value:pe,date:pd}:null};
}
function financeQuickCard(c){
 const m=verifiedValuation(c),info=financeSnapshot(c);
 if(!m&&!info.revenue&&!info.eps&&!info.pe)return '';
 const bits=[];
 if(info.revenue){const r=info.revenue;
  const val=r.yoy!==null?`年增 ${pct(r.yoy)}`:r.monthly!==null?`${(r.monthly/100000).toFixed(2)} 億元`:null;
  if(val)bits.push(`<span><small>月營收 ${esc(r.period)}</small><b>${esc(val)}</b></span>`);
 }
 if(info.eps)bits.push(`<span><small>累計EPS ${esc(info.eps.period)}</small><b>${price(info.eps.amount)} 元</b></span>`);
 if(info.pe)bits.push(`<span><small>官方本益比 ${esc(info.pe.date)}</small><b>${price(info.pe.value)} 倍</b></span>`);
 const valuationGap=m&&numeric(c.close)>0?m.targets[1]/numeric(c.close):null;
 const valuationWarn=valuationGap!==null&&(valuationGap<.65||valuationGap>1.5)?`<p class="fin-r13-warning">⚠ 模型基準價與市價差距 ${Math.abs((valuationGap-1)*100).toFixed(1)}%；歷史PE估值可能不適用目前市場環境，請核對EPS期別、PE樣本與價格調整，不能直接當作買賣價。</p>`:'';
 const bands=m?`<div class="finance-glance-band" aria-label="歷史本益比模型估值三區間">
   ${['便宜','合理','昂貴'].map((label,i)=>`<span class="${i===1?'fair':''}"><small>${label}情境</small><strong>${price(m.targets[i])} 元</strong></span>`).join('')}
  </div><div class="finance-glance-caveat">模型合理價 ${price(m.targets[1])} 元｜近四季EPS ${price(m.eps)} × 歷史PE中位數；不是券商目標價</div>`:'';
 return `<section class="finance-glance" aria-label="已核對公司營收與估值"><div class="finance-glance-title">公司研究 · 已取得資料 <small>${esc(c.date)} 盤後</small></div>${bits.length?`<div class="finance-glance-facts">${bits.join('')}</div>`:''}${bands}${valuationWarn}</section>`;
}
function valuationBadge(c){
 const m=verifiedValuation(c);
 if(!m)return '';
 const close=numeric(c.close),diff=close>0?`<small>較收盤 ${pct(100*(m.targets[1]/close-1))}</small>`:'';
 return `<div class="model-target-mini" aria-label="已驗證模型合理價"><span>模型合理價（非券商喊價）<small>歷史本益比中位數 × 近四季EPS</small></span><strong>${price(m.targets[1])} 元</strong>${diff}</div>`;
}
function financeCardPreview(c){
 const m=verifiedValuation(c),info=financeSnapshot(c);
 if(!m&&!info.revenue&&!info.eps&&!info.pe)return '';
 return financeQuickCard(c);
}

function unifiedCardShell({key,rankText,stage,code,name,industry,closeText,changeText,changeClass,summary,levels,evidence,finance,actions}){
 const kinds=['summary','levels'];
 const active=kinds.includes(sectorCardTabs.get(key))?sectorCardTabs.get(key):(rankText==='超盤手｜個股完整分析'?'levels':'summary');
 const tab=(id,label)=>`<button type="button" role="tab" data-card-tab="${id}" aria-selected="${active===id}" class="${active===id?'active':''}">${label}</button>`;
 const panel=(id,content)=>`<div role="tabpanel" data-card-panel="${id}" ${active===id?'':'hidden'}>${content}</div>`;
 return `<article class="sector-battle-card sector-r9 unified-battle-card" data-card-key="${esc(key)}">
  <div class="sector-card-eyebrow"><b>${esc(rankText)}</b><span>${esc(stage)}</span></div>
  <div class="sector-card-identity"><div><strong>${esc(code)} ${esc(name)}</strong><div class="sector-card-meta">${esc(industry)}</div></div><div class="sector-card-quote"><b>${esc(closeText)}</b><small class="${esc(changeClass||'')}">${esc(changeText||'—')}</small></div></div>
  <div class="sector-r9-tabs" role="tablist" aria-label="${esc(code)}作戰資訊分頁">${tab('summary','速覽')}${tab('levels','明日操作')}</div>
  ${panel('summary',summary)}${panel('levels',levels)}
  <div class="sector-card-actions">${actions}</div>
 </article>`;
}
function unifiedCardEvents(e){
 const btn=e.target.closest('[data-card-tab]');if(btn){
  const card=btn.closest('.unified-battle-card');if(!card)return;
  const selected=btn.dataset.cardTab;sectorCardTabs.set(card.dataset.cardKey,selected);
  card.querySelectorAll('[data-card-tab]').forEach(x=>{let yes=x.dataset.cardTab===selected;x.classList.toggle('active',yes);x.setAttribute('aria-selected',String(yes))});
  card.querySelectorAll('[data-card-panel]').forEach(x=>x.hidden=x.dataset.cardPanel!==selected);return;
 }
 const stock=e.target.closest('[data-card-detail]');if(stock){showDetails(stock.dataset.cardDetail);return;}

 const chart=e.target.closest('[data-etf-chart-open]');if(chart){const target=$('#etfChartSvg');if(target)target.scrollIntoView({block:'nearest',behavior:'smooth'});return;}
}
// r47: one consolidated, evidence-based selection audit. Unknown is not pass.
// r50: detail-card-only evidence audit (not shared with homepage). Missing data never counts as a pass.
function r48SelectionState(c){
 const close=numeric(c.close),bars=Array.isArray(c.bars)?c.bars:[];
 const latest=bars.length?bars[bars.length-1]:null;
 const latestDate=Array.isArray(latest)?latest[0]:(latest?.date??latest?.Date);
 const dayKey=v=>{const s=String(v??'').trim();const m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[T\s].*)?$/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:null;};
 const stockDay=dayKey(c.date),marketDay=dayKey(state.payload?.asOf),barDay=dayKey(latestDate);
 const valid=close!==null&&close>0&&bars.length>=20&&stockDay!==null&&stockDay===marketDay&&barDay===stockDay;
 const neck=latestNeck(c),ma=globalThis.ChaopanExtrasV311?.averages?.(c);
 const ma20=numeric(ma?.values?.[20]),vr=numeric(c.volumeRatio);
 const aboveMA=valid&&ma20!==null?close>=ma20:null;
 const aboveNeck=valid&&neck!==null&&neck>0?close>neck:null;
 const volReady=valid&&vr!==null&&vr>=0?vr>=1.3:null;
 // supportLines() deliberately removes broken levels; audit the original evidence.
 const raw=[...(c.supportEvidence?.levels||[]),...(c.structureV23?.recentSupports||[]),...(c.structureV23?.supports||[])];
 // Historical break records are not proof of a currently broken support.
 // Only confirmed breaks at a valid level still above the latest close count as active.
 const activeBreak=raw.some(v=>{
   const lo=numeric(v?.lower),hi=numeric(v?.upper);
   return v?.confirmedBreak===true&&lo!==null&&hi!==null&&lo>0&&hi>=lo&&close!==null&&close<lo;
 });
 const supports=valid?supportLines(c):[];
 const supportSafe=valid?(activeBreak?false:supports.length?true:null):null;
 const broken=activeBreak;
 const invalid=c.starPhase==='invalid'||c.breakoutQuality==='invalid';
 const risk=invalid||activeBreak||c.fallingLimitRisk===true||c.riskLevel==='high';
 const quality=c.breakoutQuality==='strong'?true:['weak','invalid','watch'].includes(c.breakoutQuality)?false:null;
 const pending=!valid||aboveMA===null||aboveNeck===null||volReady===null||quality===null||supportSafe===null;
 const qualified=!pending&&!risk&&aboveMA===true&&aboveNeck===true&&volReady===true&&quality===true;
 const status=risk?'風險排除':pending?'資料待核對':qualified?'符合突破觀察':'等待確認';
 const lots=numeric(c.lots),avg20=numeric(c.avgVolume20??c.avg20Volume??c.volume20Avg);
 const target=valid&&avg20!==null&&avg20>0?Math.ceil(avg20*1.3):null;
 return {valid,close,neck,aboveMA,aboveNeck,volReady,quality,broken,supportSafe,risk,pending,qualified,status,target};
}
function r47SelectionAudit(c){
 const a=r48SelectionState(c),supports=supportLines(c);
 const rows=[['站上 MA20',a.aboveMA],['站上近期頸線',a.aboveNeck],['量比達 1.3 倍',a.volReady],['突破品質強勢',a.quality],['重要支撐未確認失守',a.supportSafe]];
 const up=a.valid&&a.neck!==null&&a.neck>0&&a.close<a.neck?(a.neck/a.close-1)*100:null;
 const symbol=v=>v===true?'✓':v===false?'×':'?';
 const reason=!a.valid?'K線不足、最後一根K線日期或盤後資料日期不一致，暫不判定。':a.risk?'已有支撐失守、突破失效或其他高風險訊號，排除突破候選。':a.qualified?'趨勢、頸線、量能及突破品質符合初步觀察條件，仍需後續守穩。':a.pending?'必要資料不足，不能視為符合進場觀察。':a.aboveNeck===false?'尚未站上近期頸線，先觀察反彈壓力。':'突破條件未全部通過，持續觀察。';
 return `<section class="r47-audit" aria-label="選股資格與近期戰況"><div class="r47-head"><strong>近期戰況・字卡資格檢查</strong><span class="r47-status ${a.qualified?'pass':a.risk?'fail':'wait'}">${a.status}</span></div>
 <p class="r47-summary">${reason}</p>
 <div class="r47-checks">${rows.map(([label,value])=>`<div><span class="r47-symbol ${value===true?'ok':value===false?'bad':'unknown'}">${symbol(value)}</span>${label}<small>${value===true?'通過':value===false?'未通過':'待核對'}</small></div>`).join('')}</div>
 <div class="r47-levels"><div><small>近期壓力</small><b>${a.valid&&a.neck>0?price(a.neck):'待核對'}</b><small>${up!==null?'尚需上漲 '+up.toFixed(2)+'%':'尚無可用漲幅'}</small></div><div><small>第一支撐</small><b>${a.valid&&supports[0]?price(supports[0].lower):'待核對'}</b><small>失守須重新檢查</small></div><div><small>參考量能</small><b>${a.target!==null?integer(a.target)+' 張':'待核對'}</b><small>20日均量×1.3；缺資料不推估</small></div></div>
 <small class="r47-disclaimer">突破追價與支撐低接是不同策略；低接未完成驗證時不標示合格。量能1.3倍為待回測參數。</small></section>`;
}

function sectorBattleCard(c,options={}){
 const p=deskEvidence(c),g=ChaopanGuidance.evaluate(c,p,supportLines(c));
 const seq=breakoutReadout(c),track=ChaopanExtrasV311.breakoutTracks(c);
 const ma=ChaopanExtrasV311.averages(c),hold=continuationReadout(c);
 const sixAudit=globalThis.ChaopanSectorV325?.sixLineAudit(c);
 const rank=sectorRanks.get(rowId(c)),key=rowId(c);
 const rankText=options.rankText||(Number.isInteger(rank)&&rank>0?`#${rank} 起漲排名`:'未列入起漲排名');
 const cardKey=(options.source||'sector')+'|'+key;
 const phases={launch:'量價啟動',hold:'沿MA5／MA10續強觀察',ready:'頸線預備',first:'第一根',second:'第二根',third:'第三根',reclaim:'舊頸線站回',surge:'主升續強',reentry:'回測再發動',caution:'高波動警戒'};
 const stage=options.stageLabel||phases[p.stage]||phases[p.momentumStage]||phases[seq.phase]||'階段待核對';
 const n=v=>numeric(v)===null?'—':price(v);
 const score=v=>numeric(v)===null?null:Math.max(0,Math.min(100,Number(v)));
 const barscore=(name,val)=>`<div class="sector-meter"><div><small>${name}</small><b>${val===null?'待核對':val.toFixed(0)}</b></div><span class="sector-meter-track"><i style="width:${val===null?'0':val}%"></i></span></div>`;
 const six=[5,10,20,60,120,240].map(d=>{
   const val=numeric(ma.values?.[d]);const tone=val===null?'missing':numeric(ma.close)!==null&&ma.close>=val?'above':'below';
   return `<span class="sector-ma-dot ${tone}" title="MA${d}：${val===null?'缺歷史':n(val)}">${d}</span>`;
 }).join('');
 const label=g.level==='danger'?'出場警戒':g.level==='warn'?'減碼警戒':g.level==='unknown'?'資料不足':'待價量確認';
 const strictRisk=r133RiskGate(c);
 const strictLabel={eligible:'量價可追蹤（非買點）',watch:'黃燈／賣壓待確認',risk:'紅燈／出貨或轉弱警戒',unknown:'資料不足／待補'}[strictRisk.status];
 const strictHTML=`<div class="sector-phase-note"><b>R160嚴格驗證｜${esc(strictLabel)}</b>｜${esc(strictRisk.reasons.slice(0,3).join('；'))}</div>`;
 const levelOk=g.level!=='unknown'&&c.date===state.payload?.asOf;
 const light=state.marketIntel?ChaopanIntel.miniLights(state.marketIntel,c,p):'<small>法人與量能依來源資料顯示</small>';
 const marginBrief=state.marketIntel&&globalThis.ChaopanIntel?.marginPreview?ChaopanIntel.marginPreview(state.marketIntel,c):'';
 const ma510=hold.strictMA510Hold===true?'歷史突破後全程守5／10':hold.recentCloseHold10===true?'近10日守5／10':'逐日守線待核對';
 const riskClass=g.level==='danger'?'danger':g.level==='warn'?'caution':'muted';
 const overview=`<div class="sector-mini-status"><b>${esc(g.title)}</b><span class="sector-card-tag ${riskClass}">${esc(label)}</span></div>
 <div class="sector-mini-stats"><span>觀察關卡 <b>${levelOk?n(g.breakoutLevel):'待核對'}</b></span><span>MA5 <b>${levelOk?n(g.ma5):'待核對'}</b></span><span>MA10 <b>${levelOk?n(g.ma10):'待核對'}</b></span></div>
 <div class="sector-six-dots"><span>六均線</span>${six}</div>
 <div class="r28-ma-audit ${sixAudit?.confirmed?'confirmed':sixAudit?.status==='below'?'rejected':'pending'}"><b>${esc(sixAudit?.label||'六線待核對')}</b>｜${esc(sixAudit?.reason||'六線資料尚未核對')}</div>
 <div class="sector-phase-note">${esc(ma510)} · ${esc(c.date||'資料日待核對')}盤後</div>${strictHTML}${marginBrief}${financeQuickCard(c)}${options.source==='lookup-detail'?`<details class="finance-full-details"><summary>展開年度EPS與估值詳細資料</summary>${financialPanel(c)}</details>`:''}`;
 const levelVals=[
  ['突破觀察',g.breakoutLevel],['回測觀察',g.pullbackZone?.[0]],['MA5減碼警戒',g.ma5],['MA10防守',g.ma10],['歷史支撐',g.support],['移動停利',g.trailingStop]
 ];
 const finite=levelVals.map(x=>numeric(x[1])).filter(v=>v!==null&&v>0);
 const lo=finite.length?Math.min(...finite):null,hi=finite.length?Math.max(...finite):null;
 const ruler=levelVals.map(([name,val])=>{const v=levelOk?numeric(val):null;
  const w=v===null?0:hi===lo?60:12+(v-lo)/(hi-lo)*88;
  return `<div class="sector-price-line"><small>${esc(name)}</small><span class="sector-price-track"><i style="width:${w.toFixed(1)}%"></i></span><b>${v===null?'—':n(v)}</b></div>`;
 }).join('');
 // r87: same reduction/price panel across lookup and all candidate cards.
 const levels=nextSessionDefenseCard(c);
 const trackLine=track.length?`紅K×${track[0].red}／綠K×${track[0].green}；${esc(track[0].source)}`:'歷史突破K線事件尚未核對';
 const institutional=options.institutional;
 const institutionFacts=institutional?`<div class="sector-card-institution">三大法人淨買賣超：外資 ${Number(institutional.foreign).toLocaleString('zh-TW')} 張／投信 ${Number(institutional.trust).toLocaleString('zh-TW')} 張／自營商 ${Number(institutional.dealer).toLocaleString('zh-TW')} 張；交易日 ${esc(state.payload?.asOf||'待核對')}。</div>`:'';
 const evidence=`${institutionFacts}<div class="sector-mini-meters">${barscore('發動潛力',score(p.score?.potential))}${barscore('進場品質',score(p.score?.entry))}</div>
 <div class="sector-card-lights">${light}</div>
 <div class="sector-card-tags"><span class="sector-card-tag ok">${esc(ma510)}</span><span class="sector-card-tag muted">${trackLine}</span></div>
 <div class="sector-ma-row">${[5,10,20,60,120,240].map(d=>`<span class="sector-ma ${numeric(ma.values?.[d])===null?'missing':ma.close>=ma.values[d]?'above':'below'}">MA${d} ${n(ma.values[d])}</span>`).join('')}</div>
 <small>排名為研究排序，不是勝率；缺資料不補零。完整走勢請使用個股的「走勢圖」分頁。</small>`;
 const actions=options.source==='lookup-detail'?'':`<button type="button" class="sector-open-detail" data-card-detail="${esc(key)}">開啟個股分析與走勢圖</button>`;
 return unifiedCardShell({key:cardKey,rankText,stage:stage+(strictRisk.status==='risk'?' ｜ 🔴賣壓警戒':strictRisk.status==='watch'?' ｜ 🟡待確認':strictRisk.status==='unknown'?' ｜ ⚪待補':' ｜ 🟢量價初審')+(breakoutStar(c)?" ｜ "+breakoutStar(c).mark:"")+(c.breakoutQuality==='weak'?" 🔴轉弱":c.breakoutQuality==='watch'?" 🟡觀察":c.breakoutQuality==='strong'?" 🟢續強":""),code:c.code,name:c.name,
  industry:c.industry||c.fundamentals?.industry||c.market||'產業待核對',
  closeText:n(c.close),changeText:pct(c.changePct),changeClass:numeric(c.changePct)>0?'rising':numeric(c.changePct)<0?'falling':'',
  summary:overview,levels,evidence,finance:financeCardPreview(c),actions});
}
function renderSectorPage(groupEl){
 const idx=Number(groupEl.dataset.sectorIndex),group=sectorPacked[idx];if(!group)return;
 const container=groupEl.querySelector('.sector-rows');if(!container)return;
 const limit=Math.min(group.arr.length,sectorShown.get(group.name)||SECTOR_BATCH);
 // Only an expanded group creates expensive full battle cards.
 container.innerHTML=group.arr.slice(0,limit).map(sectorBattleCard).join('')+(limit<group.arr.length?
  `<button class="sector-load-more" type="button" data-sector-more="${idx}">再顯示 ${Math.min(SECTOR_BATCH,group.arr.length-limit)} 檔（${limit}／${group.arr.length}） ↓</button>`:'');
}
// r23: SEPARATE verified-entry shortlist from independent, risk-vetted EOD observation radar.
// Missing index/breadth suppresses ONLY "qualified new entry", not neckline/sector observations.
let sectorRadarCacheRows=null,sectorRadarCacheDate='',sectorRadarCacheStamp='',sectorRadarCache=null;
function sectorRadar(){
 const rows=state.universe?.rows||[],asOf=state.payload?.asOf||'';
 const stamp=r145UniverseStamp(rows);
 if(rows===sectorRadarCacheRows&&asOf===sectorRadarCacheDate&&stamp===sectorRadarCacheStamp&&sectorRadarCache)return sectorRadarCache;
 sectorRadarCacheRows=rows;sectorRadarCacheDate=asOf;sectorRadarCacheStamp=stamp;
 sectorRadarCache=globalThis.ChaopanSectorV325&&globalThis.ChaopanStageV318&&state.universe?.asOf===asOf&&state.mode!=='demo'?
  ChaopanSectorV325.analyze(rows,asOf,c=>ChaopanStageV318.inspect(c,asOf)):
  {asOf,strong:[],watch:[],counts:{},coverage:[]};
 return sectorRadarCache;
}
// r46: only a verified backend EOD decision can enter a strict breakout continuation list.
// Missing values are NOT interpreted as a positive institutional/technical confirmation.
// R137: a clean last candle cannot erase distribution evidence on the breakout candle.
// This is a conservative veto for breakout certification, NOT proof of insider selling.
// R140: evaluate EVERY candle of the breakout event, not just the breakout day.
// Status is a conservative certification gate, not a claim about actual seller identity.
// R140: reconstruct a candidate event from actual daily bars, never from a label alone.
// The 60-session prior-high neckline is a transparent candidate, not a certified
// historical large-volume neckline. Missing bars remain unknown.
function r140ReconstructEvent(c,stage){
 const days={first:1,second:2,third:3,fourth:4}[stage];
 const bars=Array.isArray(c?.bars)?c.bars:[];
 if(!days||bars.length<60+days)return {status:'unknown',reason:'重建突破事件需至少60根前置日K及完整追蹤K棒'};
 const valid=x=>Array.isArray(x)&&x.length>=6&&Number.isFinite(Date.parse(String(x[0])))&&
  [1,2,3,4,5].every(i=>x[i]!==''&&x[i]!=null&&Number.isFinite(Number(x[i])))&&
  Number(x[3])>0&&Number(x[2])>=Math.max(Number(x[1]),Number(x[4]))&&
  Number(x[3])<=Math.min(Number(x[1]),Number(x[4]))&&Number(x[5])>=0;
 const sample=bars.slice(-(60+days));
 if(!sample.every(valid)||sample.some((x,i)=>i>0&&String(x[0])<=String(sample[i-1][0])))
  return {status:'unknown',reason:'重建突破事件的歷史日K品質或日期異常'};
 const eventIndex=bars.length-days;
 const previous=bars.slice(eventIndex-60,eventIndex);
 const level=Math.max(...previous.map(x=>Number(x[2])));
 const event=bars[eventIndex],prior=bars[eventIndex-1];
 if(!(Number(prior[4])<=level&&Number(event[4])>level&&Number(event[2])>level))
  return {status:'not_breakout',reason:'未符合前60交易日高點首次收盤突破'};
 return {status:'derived',event:{date:String(event[0]),level},reason:'依前60交易日最高價重建的候選突破事件（非大量K頸線認證）'};
}
// R146: Recover a transparently labelled breakout OBSERVATION stage from raw OHLCV.
// A 60-session closing breakout is NOT equivalent to the historical 60–120-day
// heavy-volume K neckline. This function never authorizes a new-entry order.
// No future candle contributes to the reference high: all levels are computed
// from the 60 trading sessions strictly BEFORE the candidate event date.
// R156: Track the FIRST close below each separate defense level, using only
// daily bars already visible at the selected as-of date. A later reclaim does
// not erase a failed breakout or automatically promote a stock to green.
function r156FailureTimeline(follow,neckline,breakoutLow){
 const firstNeck=follow.find(b=>b.c<neckline)||null;
 const firstLow=follow.find(b=>b.c<breakoutLow)||null;
 const lastTwo=follow.slice(-2);
 const regained=x=>follow.length>=2&&lastTwo.every(b=>b.c>x);
 return {
  necklineFailure:firstNeck?{date:firstNeck.date,close:firstNeck.c}:null,
  breakoutLowFailure:firstLow?{date:firstLow.date,close:firstLow.c}:null,
  necklineReclaimed:!!firstNeck&&regained(neckline),
  breakoutLowReclaimed:!!firstLow&&regained(breakoutLow)
 };
}

function r146HistoricalStage(c,asOf,parsedContext){
 const parsed=parsedContext||R143StrictRisk.parse(c,asOf||c?.date);
 if(parsed.status!=='ok')return {status:'unknown',reason:parsed.reasons.join('；')};
 const a=parsed.bars;
 if(a.length<64)return {status:'unknown',reason:'至少64根有效歷史K棒才能尋找第一至第四根'};
 const phases={1:'first',2:'second',3:'third',4:'fourth'};
 const seen=[],failedEvents=[];
 for(let days=4;days>=1;days--){
  const eventIndex=a.length-days;
  if(eventIndex<60)continue;
  const old=a.slice(eventIndex-60,eventIndex);
  const level=Math.max(...old.map(b=>b.h));
  const event=a[eventIndex],prior=a[eventIndex-1];
  if(!(level>0&&prior.c<=level&&event.c>level&&event.h>level))continue;
  // If another close had already crossed this exact level among the lookback,
  // the event is not its first close above the reference high.
  if(old.slice(0,-1).some(b=>b.c>level))continue;
  const follow=a.slice(eventIndex+1);
  // R153: A close below the breakout candle's LOW is not necessarily a
  // close below the neckline. Keep the two pieces of evidence separate.
  const timeline=r156FailureTimeline(follow,level,event.l);
  const necklineFailed=!!timeline.necklineFailure;
  const breakoutLowFailed=!!timeline.breakoutLowFailure;
  const failed=necklineFailed||breakoutLowFailed;
  const last=a.at(-1);
  const candidate={status:'candidate',stage:phases[days],days,date:event.date,
   level,low:event.l,failed,necklineFailed,breakoutLowFailed,...timeline,priceNow:last.c,
   source:'prior60-high',
   reason:necklineFailed?'前60日高點候選頸線已收盤失守，列警戒':
    breakoutLowFailed?'突破K棒低點已收盤失守，但前60日高點頸線仍守住；列警戒':
    `前60日高點的第${days}根候選，尚未核對60～120日大量K頸線及續攻資格`};
  seen.push(candidate);
  if(failed)failedEvents.push({date:event.date,stage:phases[days],level,low:event.l,source:'prior60-high',necklineFailed,breakoutLowFailed,...timeline});
 }
 // R157: Prefer the *most recent* candidate for the headline. Earlier
 // events remain independent risk evidence and are never discarded; different
 // first-breakout dates must be labelled ambiguous, not certified as one event.
 if(seen.length){
  const newest=seen[seen.length-1];
  return {...newest,ambiguous:seen.length>1,
   recentEventFailures:failedEvents,recentEventStages:seen.map(x=>x.stage)};
 }
 return {status:'none',reason:'最近四個交易日無前60日高點首次收盤突破事件'};
}

// R148: Independently find a historical 60–120 trading-session *high-volume K*
// anchor from verified OHLCV. This is observation evidence, NEVER EOD buy
// certification. It intentionally remains distinct from a prior-60-day high.
function r148HeavyVolumeStage(c,asOf,parsedContext){
 const parsed=parsedContext||R143StrictRisk.parse(c,asOf||c?.date);
 if(parsed.status!=='ok')return {status:'unknown',reason:parsed.reasons.join('；')};
 const a=parsed.bars,N=a.length;
 if(N<81)return {status:'unknown',reason:'核對60～120日大量K需至少81根有效日K'};
 const found=[];
 const volumePrefix=new Float64Array(N+1);
 for(let k=0;k<N;k++)volumePrefix[k+1]=volumePrefix[k]+a[k].v;
 for(let days=1;days<=4;days++){
  const i=N-days,first=a[i],prev=a[i-1];
  if(i<80||!first||!prev)continue;
  const eventMean=(volumePrefix[i]-volumePrefix[i-20])/20;
  const eventRatio=eventMean>0?first.v/eventMean:null;
  for(let age=60;age<=120;age++){
   const j=i-age;
   if(j<20)continue;
   const anchor=a[j];
   const baseline=(volumePrefix[j]-volumePrefix[j-20])/20;
   if(!(baseline>0&&anchor.v/baseline>=1.8))continue;
   const neck=anchor.h;
   if(!(prev.c<=neck&&first.c>neck&&first.h>neck))continue;
   // Never retrospectively call a later return above an already-broken
   // neckline the 'first breakout' of this exact anchor.
   if(a.slice(j+1,i).some(b=>b.c>neck))continue;
   const follow=a.slice(i+1);
   const timeline=r156FailureTimeline(follow,neck,first.l);
   const necklineFailed=!!timeline.necklineFailure;
   const breakoutLowFailed=!!timeline.breakoutLowFailure;
   const failed=necklineFailed||breakoutLowFailed;
   const healthy=follow.some((b,k)=>b.c<a[i+k].c&&b.c>=neck&&b.c>=first.l&&
     b.v<.85*((volumePrefix[i+k+1]-volumePrefix[i+k-19])/20));
   found.push({status:'candidate',stage:['','first','second','third','fourth'][days],days,
    date:first.date,level:neck,anchorDate:anchor.date,anchorAge:age,
    anchorVolumeRatio:+(anchor.v/baseline).toFixed(3),
    eventVolumeRatio:eventRatio===null?null:+eventRatio.toFixed(3),
    source:'volume-k-60-120',failed,necklineFailed,breakoutLowFailed,...timeline,healthyPullback:healthy,
    low:first.l,priceNow:a.at(-1).c});
  }
 }
 if(!found.length)return {status:'none',reason:'近四日未找到可核對的60～120日大量K候選頸線突破'};
 // If separate breakout days or materially different anchor necklines fit the
 // same window, withhold an authoritative stage/neckline classification.
 const eventDays=new Set(found.map(x=>x.date));
 const mostRecent=found.slice().sort((x,y)=>x.days-y.days||y.level-x.level||y.anchorVolumeRatio-x.anchorVolumeRatio)[0];
 const same=found.filter(x=>x.date===mostRecent.date);
 const highest=same.slice().sort((x,y)=>y.level-x.level||y.anchorVolumeRatio-x.anchorVolumeRatio)[0];
 const ambiguous=eventDays.size>1||same.some(x=>Math.abs(x.level-highest.level)/highest.level>.005);
 // R155: Do not discard older failed heavy-K events simply because a newer
 // candidate is intact. Keep distinct dates/necklines and their exact failure.
 const recentEventFailures=found.filter(x=>x.failed).map(x=>({date:x.date,stage:x.stage,level:x.level,
  source:'volume-k-60-120',anchorDate:x.anchorDate,low:x.low,necklineFailed:x.necklineFailed,
  breakoutLowFailed:x.breakoutLowFailed,necklineFailure:x.necklineFailure,
  breakoutLowFailure:x.breakoutLowFailure,necklineReclaimed:x.necklineReclaimed,
  breakoutLowReclaimed:x.breakoutLowReclaimed}));
 const recentEventStages=[...new Set(found.map(x=>x.stage))];
 return {...highest,recentEventFailures,recentEventStages,ambiguous,possibleEventCount:eventDays.size,possibleAnchorCount:same.length,
  reason:ambiguous?'出現不同突破日期或多組價差明顯的大量K頸線，禁止直接認證':
   highest.necklineFailed?'歷史大量K候選頸線已收盤失守':
   highest.breakoutLowFailed?'突破K棒低點已收盤失守，但歷史大量K候選頸線仍守住':
   highest.healthyPullback?'量縮回測守住歷史大量K候選頸線，續強待確認':
   '歷史大量K候選頸線已由日K核對，正式盤後事件資格仍待核對'};
}
function r148ObservedBreakout(c,asOf){
 const parsed=R143StrictRisk.parse(c,asOf||c?.date);
 const heavy=r148HeavyVolumeStage(c,asOf,parsed);
 const high=r146HistoricalStage(c,asOf,parsed);
 if(heavy.status==='candidate'){
  // R154: The prior-60-day breakout can be a DIFFERENT event within the
  // four-day window. Do not silently discard its confirmed defensive failure
  // just because the older heavy-volume-K neckline is still holding.
  // Keep event dates, price levels and failure references separate.
  const comparable=high.status==='candidate'&&high.date===heavy.date;
  const crossEvent=high.status==='candidate'&&high.date!==heavy.date;
  const heavyNecklineFailed=heavy.necklineFailed===true;
  const prior60HighFailed=comparable?high.necklineFailed===true:null;
  const breakoutLowFailed=heavy.breakoutLowFailed===true;
  const otherEventNecklineFailed=crossEvent?high.necklineFailed===true:null;
  const otherEventBreakoutLowFailed=crossEvent?high.breakoutLowFailed===true:null;
  const references=[];
  if(heavyNecklineFailed)references.push('heavy-volume-k');
  if(prior60HighFailed)references.push('prior60-high');
  if(breakoutLowFailed)references.push('breakout-k-low');
  if(otherEventNecklineFailed)references.push('other-event-prior60-high');
  if(otherEventBreakoutLowFailed)references.push('other-event-breakout-k-low');
  // R155: Failed earlier (or alternate neckline) observations must not be
  // overwritten by the representative newest/highest candidate. A red warning
  // is about the verified price-level violation, never proof of distribution.
  const represented=x=>x.source==='volume-k-60-120'&&x.date===heavy.date&&x.level===heavy.level ||
   x.source==='prior60-high'&&high.status==='candidate'&&x.date===high.date&&x.level===high.level;
  const all=[...(heavy.recentEventFailures||[]),...(high.recentEventFailures||[])];
  const seenFailures=new Set();
  const recentFailedEvents=all.filter(x=>{
   if(represented(x))return false;
   const k=[x.source,x.date,x.level].join('|');if(seenFailures.has(k))return false;
   seenFailures.add(k);return true;
  });
  if(recentFailedEvents.some(x=>x.source==='volume-k-60-120'))references.push('other-heavy-event');
  if(recentFailedEvents.some(x=>x.source==='prior60-high'))references.push('other-prior60-event');
  const failed=references.length>0;
  const recentEventStages=[...new Set([...(heavy.recentEventStages||[]),...(high.recentEventStages||[])])];
  // R158: When the newest prior-60-high breakout follows an older heavy-K
  // breakout, the headline must reflect the NEW event without relabelling the
  // old heavy-K neckline or erasing its separate failure evidence.
  const latest= crossEvent&&high.date>heavy.date ? high : heavy;
  const latestEvent={date:latest.date,stage:latest.stage,days:latest.days,
   level:latest.level,low:latest.low,source:latest.source};
  const otherLabel=crossEvent?`另一突破事件（${high.date}，前60日高點${high.level}）`:'';
  const parts=[
   heavyNecklineFailed?'60～120日大量K頸線已收盤失守':null,
   prior60HighFailed?'同事件前60日高點已收盤失守':null,
   breakoutLowFailed?'突破K棒低點已收盤失守':null,
   otherEventNecklineFailed?otherLabel+'頸線已收盤失守':null,
   otherEventBreakoutLowFailed?otherLabel+'突破K棒低點已收盤失守':null,
   ...recentFailedEvents.map(x=>`${x.date}的${x.source==='volume-k-60-120'?'大量K':'前60日高點'}候選${x.level}（${x.stage}）${x.necklineFailed?'頸線失守':''}${x.necklineFailed&&x.breakoutLowFailed?'、':''}${x.breakoutLowFailed?'突破K低點失守':''}`),
   !heavyNecklineFailed?'大量K頸線仍守住':null,
   comparable&&!prior60HighFailed?'同事件前60日高點仍守住':null
  ].filter(Boolean);
  const reason=failed?parts.join('；')+'；列風險警戒（非主力出貨證明）':
   latest===high ?
    `最新前60日高點第${high.days}根（${high.date}，參考價${high.level}）與較早大量K候選（${heavy.date}，頸線${heavy.level}）是兩次事件；均須分別認證`:
    heavy.reason+(crossEvent?'；另有'+otherLabel+'，不得把不同日期事件視為同一突破認證':'');
  return {...heavy,latestEvent,failed,ambiguous:heavy.ambiguous===true||crossEvent,
   heavyNecklineFailed,prior60HighLevel:comparable?high.level:null,
   prior60HighFailed,breakoutLowFailed,failedReferences:references,
   failedReference:references[0]||null,
   recentFailedEvents,recentEventStages,
   otherEventDate:crossEvent?high.date:null,
   otherEventStage:crossEvent?high.stage:null,
   otherEventLevel:crossEvent?high.level:null,
   otherEventNecklineFailed,otherEventBreakoutLowFailed,
   otherEventNecklineFailure:crossEvent?high.necklineFailure:null,
   otherEventBreakoutLowFailure:crossEvent?high.breakoutLowFailure:null,
   otherEventNecklineReclaimed:crossEvent?high.necklineReclaimed:false,
   otherEventBreakoutLowReclaimed:crossEvent?high.breakoutLowReclaimed:false,
   reason};
 }
 if(high.status==='candidate'){
  // If history cannot establish a heavy-volume neckline, report this
  // distinction as a prior-60-day observation, NEVER as certified.
  const references=[...(high.necklineFailed?['prior60-high']:[]),
   ...(high.breakoutLowFailed?['breakout-k-low']:[])];
  const recentFailedEvents=(high.recentEventFailures||[]).filter(x=>x.date!==high.date||x.level!==high.level);
  if(recentFailedEvents.length)references.push('other-prior60-event');
  return {...high,recentFailedEvents,recentEventStages:high.recentEventStages||[high.stage],
   failed:references.length>0,prior60HighLevel:high.level,prior60HighFailed:high.necklineFailed,
   heavyNecklineFailed:null,failedReferences:references,failedReference:references[0]||null,
   heavyVolumeUnverified:heavy.status==='unknown',
   reason:high.reason+(heavy.status==='unknown'?'；大量K錨點資料不足':'；尚無大量K突破候選')};
 }
 return high;
}

// R147: The same UNLABELLED historical breakout observation must affect every
// bullish screener, not only the four breakout-stage observation panels.
// This is a conservative candidate veto; a prior-60-day high is NOT a
// verified historical 60–120-day high-volume neckline and does not prove selling.
const r147HistoricalGateCache=new WeakMap();
function r147HistoricalBreakoutGate(c,asOf){
 function breachHistory(e,label){
  if(!e)return [];
  const head=label||'本次候選';
  const items=[];
  if(e.necklineFailure)items.push(`${head}頸線${e.level}首次於${e.necklineFailure.date}以${e.necklineFailure.close}收盤失守${e.necklineReclaimed?'；最近兩根收盤已重新站回，原失敗紀錄仍保留':''}`);
  if(e.breakoutLowFailure)items.push(`${head}突破K棒低點首次於${e.breakoutLowFailure.date}以${e.breakoutLowFailure.close}收盤失守${e.breakoutLowReclaimed?'；最近兩根收盤已重新站回，須重新認證':''}`);
  return items;
 }
 if(!c||typeof c!=='object')return null;
 const phase=String(c?.breakoutSequence?.phase||'');
 // R155: Backend labels are NOT an exemption from independently observed
 // historical failures, but a clean reconstructed candidate is not a new veto.
 const backendStage=['first','second','third','fourth'].includes(phase)||
   phase==='follow'&&c?.cycle?.firstHistoricalBreakout===true;
 if(!Array.isArray(c.bars)||c.bars.length<64)return null;
 // Only the last 160 daily bars and event metadata can change this observation.
 // Do not hash unrelated investment/fundamental objects on every screener pass.
 const key=JSON.stringify([asOf||'',c.date,c.close,c.possiblePriceAdjustment,
  c.breakoutSequence,c.cycle,c.bars.slice(-160)]);
 const cached=r147HistoricalGateCache.get(c);
 if(cached?.key===key)return cached.value;
 const observation=r148ObservedBreakout(c,asOf||c.date);
 let result=null;
 if(observation.status==='candidate'&&(!backendStage||observation.failed===true)){
  const displayEvent=observation.latestEvent||observation;
  const label=(displayEvent.source==='volume-k-60-120'?'60～120日大量K候選':'前60交易日高點候選')+'第'+displayEvent.days+'根（'+displayEvent.date+'，參考價'+displayEvent.level+'）';
  // R151: Actual failure overrides neckline ambiguity; uncertainty can never
  // downgrade observed close-below-reference risk into a yellow watch state.
  const failureParts=[
   observation.heavyNecklineFailed===true?'60～120日大量K頸線已收盤失守':null,
   observation.prior60HighFailed===true?'同事件前60日高點已收盤失守':null,
   observation.breakoutLowFailed===true?'突破K棒低點已收盤失守':null,
   observation.otherEventNecklineFailed===true?'另一事件（'+observation.otherEventDate+'，前60日高點'+observation.otherEventLevel+'）頸線已收盤失守':null,
   observation.otherEventBreakoutLowFailed===true?'另一事件（'+observation.otherEventDate+'）突破K棒低點已收盤失守':null,
   ...(observation.recentFailedEvents||[]).map(x=>`${x.date}的${x.source==='volume-k-60-120'?'大量K':'前60日高點'}候選頸線${x.level}：${x.necklineFailed?'頸線收盤失守':''}${x.necklineFailed&&x.breakoutLowFailed?'、':''}${x.breakoutLowFailed?'突破K棒低點失守':''}`),
   observation.heavyNecklineFailed===false?'大量K頸線仍守住':null,
   observation.prior60HighFailed===false?'前60日高點仍守住':null
  ].filter(Boolean);
  // R156: An event date is NOT a breach date. Report both independently.
  // A genuine recovery is separately labelled, but the conservative risk veto
  // continues until the primary formal event has been independently certified.
  const chronology=[
   ...breachHistory(observation,observation.latestEvent?.source==='prior60-high'?'較早大量K事件':'代表事件'),
   ...(observation.otherEventDate&&observation.otherEventLevel?[
    ...(observation.otherEventNecklineFailure?[`另一事件（${observation.otherEventDate}）頸線${observation.otherEventLevel}首次於${observation.otherEventNecklineFailure.date}以${observation.otherEventNecklineFailure.close}收盤失守${observation.otherEventNecklineReclaimed?'，已連兩根站回':''}`]:[]),
    ...(observation.otherEventBreakoutLowFailure?[`另一事件（${observation.otherEventDate}）K低點首次於${observation.otherEventBreakoutLowFailure.date}以${observation.otherEventBreakoutLowFailure.close}收盤失守${observation.otherEventBreakoutLowReclaimed?'，已連兩根站回':''}`]:[])
   ]:[]),
   ...(observation.recentFailedEvents||[]).flatMap(x=>breachHistory(x,x.date+'的'+(x.source==='volume-k-60-120'?'大量K候選':'前60日高點候選')))
  ];
  const failureDetail=(failureParts.length?failureParts.join('；'):
   '後續收盤失守候選參考價')+(chronology.length?'；首次失守逐日紀錄：'+chronology.join('；'):'')+'；列候選突破失敗警戒（非主力出貨證明）';
  result=observation.failed?
   {status:'risk',reasons:[label+'：'+failureDetail+(observation.ambiguous?'；頸線與事件日期有歧義，仍應保留失敗風險':'')],
    signals:['historical_candidate_failed',...(observation.ambiguous?['historical_candidate_ambiguous']:[])],evidence:observation}:observation.ambiguous?
   {status:'watch',reasons:[label+'存在不同突破日期或頸線歧義，需人工核對，不得自動認證'],signals:['historical_candidate_ambiguous'],evidence:observation}:
   {status:'watch',reasons:[label+(observation.source==='volume-k-60-120'?'已由OHLCV重建大量K候選，仍缺正式盤後事件及續攻資料；僅列觀察':'仍未核對60～120日歷史大量K頸線，僅列觀察不列入自動合格')],
    signals:['historical_candidate_unverified'],evidence:observation};
 }
 r147HistoricalGateCache.set(c,{key,value:result});
 return result;
}
function r147CombineRisk(...gates){
 const g=gates.filter(Boolean),rank={eligible:0,watch:1,unknown:2,risk:3};
 if(!g.length)return {status:'unknown',reasons:['未取得風險審查資料'],signals:[],evidence:null};
 // R160: A large UNVERIFIED price gap invalidates candle comparisons.
 // A legacy red flag derived from the same unadjusted candles must NOT
 // override the price-continuity UNKNOWN result. Keep the stock visible in
 // the data-review bucket, with no automatic green certification or red
 // assertion of selling, until a credible adjusted history is available.
 // R161: explicit unadjusted corporate-action prices need the same priority
 // as an inferred >35% gap. A reconstructed historical red signal can be
 // mathematically invalid when built from these unadjusted bars.
 const unresolvedGap=g.find(x=>x.status==='unknown'&&Array.isArray(x.reasons)&&
  x.reasons.some(r=>/價格斷層|價格尚未還原|公司行動.*還原|除權息.*還原/.test(String(r))));
 if(unresolvedGap){
  const discontinuity=unresolvedGap.reasons.some(r=>String(r).includes('價格斷層'));
  return {status:'unknown',
   reasons:[...new Set([...unresolvedGap.reasons,discontinuity?'股價斷層尚未核對；其他量價紅燈待價格還原後重新計算，不能據此判定出貨':'公司行動價格尚未還原；量價及歷史突破失敗風險須重新計算，不能直接判定出貨'])],
   signals:[discontinuity?'price_continuity_review':'corporate_action_review'],evidence:unresolvedGap.evidence||null,historical:null};
 }
 const status=g.reduce((best,x)=>rank[x.status]>rank[best]?x.status:best,'eligible');
 const reasons=[...new Set(g.flatMap(x=>x.status==='eligible'&&status!=='eligible'?[]:x.reasons||[]))];
 const signals=[...new Set(g.flatMap(x=>x.signals||[]))];
 const evidence=(gates[1]&&gates[1].evidence)||g.find(x=>x.evidence)?.evidence||null;
 const historical=gates.find(x=>x?.signals?.includes('historical_candidate_failed')||x?.signals?.includes('historical_candidate_unverified'))?.evidence||null;
 return {status,reasons,signals,evidence,historical};
}
function r137BreakoutHistoryGate(c,stage){
 const bars=Array.isArray(c?.bars)?c.bars:[];
 const days={first:1,second:2,third:3,fourth:4}[stage];
 if(!days)return {status:'unknown',reason:'突破階段無效'};
 if(bars.length<20+days)return {status:'unknown',reason:'突破事件前20日量能歷史不足'};
 const valid=x=>Array.isArray(x)&&x.length>=6&&typeof x[0]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x[0])&&Number.isFinite(Date.parse(x[0]+'T00:00:00Z'))&&new Date(Date.parse(x[0]+'T00:00:00Z')).toISOString().slice(0,10)===x[0]&&[1,2,3,4,5].every(i=>(typeof x[i]==='number'||typeof x[i]==='string'&&x[i].trim()!=='')&&Number.isFinite(Number(x[i])))&&
   Number(x[3])>0&&Number(x[2])>=Number(x[3])&&Number(x[1])>=Number(x[3])&&Number(x[1])<=Number(x[2])&&
   Number(x[4])>=Number(x[3])&&Number(x[4])<=Number(x[2])&&Number(x[5])>=0;
 const start=bars.length-days;
 const evDate=r205EventDate(c);if(evDate.conflict)return {status:'unknown',reason:'突破事件日期欄位衝突或無效'};
 const eventDate=evDate.date;
 if(!eventDate)return {status:'unknown',reason:'缺少可核對的突破事件日期'};
 if(String(bars[start]?.[0])!==String(eventDate))return {status:'unknown',reason:'突破事件日期與日K不一致'};
 const sample=bars.slice(start-20);
 if(sample.some((x,i)=>i>0&&String(x[0])<=String(sample[i-1][0])))return {status:'unknown',reason:'突破歷史日K日期未依序遞增'};
 if(sample.length!==20+days||!sample.every(valid))return {status:'unknown',reason:'突破期間或前20日K線資料異常'};
 const rawLevel=c?.breakoutEvent?.level;
 const level=(typeof rawLevel==='number'||typeof rawLevel==='string'&&rawLevel.trim()!=='')?Number(rawLevel):NaN;
 if(!Number.isFinite(level)||level<=0)return {status:'unknown',reason:'缺少可核對的突破頸線價'};
 const event=bars[start],eventHigh=Number(event[2]),eventLow=Number(event[3]);
 if(!(Number(event[4])>level))return {status:'risk',reason:'突破當日未收盤站上事件頸線'};
 if(!(Number(event[2])>level))return {status:'risk',reason:'突破當日最高價未越過事件頸線'};
 // Require evidence the level was not already broken at the prior close.
 if(!(Number(bars[start-1][4])<=level))return {status:'unknown',reason:'突破前一日已站上頸線，首次突破日期待核對'};
 let warning=false,warningReason='',lastWarningIndex=-1;
 let consecutiveHeavyDown=0;
 for(let i=start;i<bars.length;i++){
  const bar=bars[i],o=Number(bar[1]),h=Number(bar[2]),l=Number(bar[3]),cl=Number(bar[4]),v=Number(bar[5]);
  const history=bars.slice(i-20,i);
  if(history.length!==20||!history.every(valid))return {status:'unknown',reason:'突破後逐日量能基準資料不足'};
  const avg=history.reduce((sum,x)=>sum+Number(x[5]),0)/20;
  if(!(avg>0))return {status:'unknown',reason:'突破期間20日均量無法計算'};
  if(v<=0)return {status:'unknown',reason:'突破期間無有效成交量'};
  const range=h-l,upper=h-Math.max(o,cl),body=Math.abs(cl-o);
  const longUpper=range>0&&upper/range>=0.4&&upper>body;
  const heavy=v/avg>=1.5;
  const down=cl<o;
  const distribution=longUpper&&heavy&&cl<=o;
  if(i>start&&cl<eventLow)return {status:'risk',reason:'突破後曾收盤跌破訊號K低點'};
  if(i>start&&cl<level)return {status:'risk',reason:'突破後收盤跌破事件頸線'};
  consecutiveHeavyDown=heavy&&down?consecutiveHeavyDown+1:0;
  if(consecutiveHeavyDown>=2)return {status:'risk',reason:'突破期間連續兩根放量收低'};
  if(distribution){warning=true;lastWarningIndex=i;warningReason=i===start?'突破當日放量長上影收低':'突破後第'+(i-start+1)+'根放量長上影收低';}
  else if(longUpper){warning=true;lastWarningIndex=i;warningReason='突破期間長上影線，需確認賣壓是否消退';}
 }
 // An isolated warning is not automatically erased by a later positive candle.
 // Only a strong final close above the entire warning candle's high can resolve it.
 if(warning){
  const last=bars.at(-1);
  if(days>1&&lastWarningIndex<bars.length-1&&Number(last[4])>Math.max(...bars.slice(start,-1).map(x=>Number(x[2])))&&Number(last[4])>eventHigh){
   return {status:'eligible',reason:'突破期間曾有上影風險，最新收盤已突破全部先前K棒高點（仍須其他認證）'};
  }
  return {status:'watch',reason:warningReason};
 }
 return {status:'eligible',reason:'突破第一至第四根逐日量價未觸發已定義風險否決'};
}
const STRICT_BREAKOUT_STAGES=new Set(['first','second','third','fourth']);
// R209 validation: explicit event, sequence and cycle fields must describe one event.
// Missing optional aliases remain compatible; conflicting supplied evidence cannot certify.
function r209EventConsistency(c,stage){
 const days={first:1,second:2,third:3,fourth:4}[stage];
 const ev=c?.breakoutEvent,seq=c?.breakoutSequence,cy=c?.cycle;
 const present=x=>x!==undefined&&x!==null&&x!=='';
 const num=x=>(typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&Number.isFinite(Number(x))?Number(x):null;
 const bad=reason=>({ok:false,reason});
 if(!days)return bad('突破根數無效');
 const d=r205EventDate(c);if(d.conflict)return bad('突破日期欄位衝突');
 const bar=c?.bars?.at(-days);
 if(!Array.isArray(bar))return bad('缺少對應的首次突破K棒');
 const dates=[d.date,seq?.initialDate,cy?.initialDate,cy?.eventDate].filter(present);
 if(dates.some(x=>typeof x!=='string'||x!==bar[0]))return bad('事件、序列或週期日期與首次突破K棒不一致');
 const levels=[ev?.level,seq?.level,cy?.level].filter(present).map(num);
 if(levels.some(x=>x===null||x<=0)||levels.some(x=>Math.abs(x-levels[0])>1e-8*Math.max(1,levels[0])))return bad('事件、序列或週期頸線不一致');
 const offsets=[seq?.daysSinceFirst,cy?.daysSinceFirst].filter(present).map(num);
 if(offsets.some(x=>x===null||!Number.isInteger(x)||x!==days-1))return bad('突破根數與序列或週期不一致');
 if(present(seq?.firstClose)){
  const a=num(seq.firstClose),b=num(bar[4]);
  if(a===null||b===null||a<=0||Math.abs(a-b)>1e-8*Math.max(1,b))return bad('首次突破收盤價與日K不一致');
 }
 // Existing daily bars store rounded lots, while sequence retains fractional lots.
 if(present(seq?.firstVolumeLots)){
  const a=num(seq.firstVolumeLots),b=num(bar[5]);
  if(a===null||b===null||a<=0||b<=0||Math.abs(a-b)>.500001)return bad('首次突破成交量與日K不一致');
 }
 return {ok:true};
}
function strictBreakoutDecision(c,stage){
 const pass=(reason)=>({eligible:true,pending:false,reason});
 const fail=(reason)=>({eligible:false,pending:false,reason});
 const pending=(reason)=>({eligible:false,pending:true,reason});
 if(!STRICT_BREAKOUT_STAGES.has(stage))return pass('非突破續攻階段');
 if(!c)return pending('個股資料尚未載入');
 // R134: strict breakout lists and unified screener share the same candle/volume veto.
 const gate=r133RiskGate(c);
 if(gate.status==='risk')return fail('K棒／量價風險排除：'+gate.reasons.join('、'));
 if(gate.status==='watch')return pending('量價／風險待後續確認：'+gate.reasons.join('、'));
 if(gate.status==='unknown')return pending('資料品質待確認：'+gate.reasons.join('、'));
 // Reconstruct missing event fields, but never silently certify a different neckline definition.
 let eventRow=c;
 const evDate=r205EventDate(c);
 if(evDate.conflict)return pending('突破事件日期欄位衝突或無效');
 const consistency=r209EventConsistency(c,stage);
 if(!consistency.ok)return pending('突破事件資料待核對：'+consistency.reason);
 if(!evDate.date||!(Number(c.breakoutEvent?.level)>0)){
  const rebuilt=r140ReconstructEvent(c,stage);
  if(rebuilt.status!=='derived')return pending('突破事件資料待補：'+rebuilt.reason);
  eventRow={...c,breakoutEvent:rebuilt.event};
 }
 const cross=R143StrictRisk.breakoutAudit(eventRow,stage);
 if(cross.status==='risk')return fail('獨立日K突破驗證：'+cross.reasons.join('、'));
 if(cross.status==='unknown')return pending('獨立日K突破核對：'+cross.reasons.join('、'));
 if(cross.status==='watch')return pending('獨立量價觀察：'+cross.reasons.join('、'));
 const eventRisk=r137BreakoutHistoryGate(eventRow,stage);
 if(eventRisk.status==='risk')return fail(eventRisk.reason);
 if(eventRisk.status==='watch'||eventRisk.status==='unknown')return pending(eventRisk.reason);
 // Match the certified event to the displayed star stage BEFORE checking price/volume.
 // A day-2 candidate must never qualify as ★1 merely because its candles are strong.
 const seq=c.breakoutSequence;
 if(!seq||typeof seq!=='object'){
  const observed=r148ObservedBreakout(c,c.date);
  return pending(observed.status==='candidate'&&observed.stage===stage?
   '歷史日K已重建'+(OBS_STAGE[stage]||stage)+'；仍缺原始大量K頸線及盤後續攻資格，不可列為已認證':
   '突破階段資料尚未更新');
 }
 const phase=seq.phase,cycle=c.cycle;
 let actualStage=null;
 if(phase==='first'||phase==='second')actualStage=phase;
 else if(phase==='third'||phase==='fourth')actualStage=phase;
 else if(phase==='follow'&&cycle?.firstHistoricalBreakout===true&&Number.isInteger(cycle.daysSinceFirst)){
  if(cycle.daysSinceFirst===2)actualStage='third';
  else if(cycle.daysSinceFirst===3)actualStage='fourth';
 }
 if(!actualStage)return fail('不是有效的首次突破延續事件');
 if(actualStage!==stage)return fail('突破階段不符：實際為'+(OBS_STAGE[actualStage]||actualStage));
 const level=Number(eventRow.breakoutEvent?.level),close=Number(c.close);
 if(!Number.isFinite(level)||level<=0)return pending('缺少有效突破事件頸線');
 if(!Number.isFinite(close)||close<=0)return pending('收盤價格待核對');
 if(stage==='first'&&close<=level)return fail('首次突破未收盤站上頸線');
 if(stage!=='first'&&close<level)return fail('收盤跌破突破頸線');
 if(c.starPhase==='invalid'||c.breakoutQuality==='invalid')return fail('突破事件已失效');
 if(c.fallingLimitRisk===true)return fail('疑似跌停／接近跌停');
 if(c.continuationEligible===false)return fail('量價續攻條件未通過');
 if(c.continuationEligible!==true)return pending('盤後續攻資格尚未更新');
 if(c.breakoutQuality==='weak'||c.breakoutQuality==='watch')return fail('量價品質未達續強標準');
 if(c.breakoutQuality!=='strong')return pending('盤後量價品質尚未更新');
 // r59: chart/EOD cross-audit is a veto, never a source of new breakout eligibility.
 const rangeAudit=auditConsolidationBreakout(c);
 if(rangeAudit.status==='conflict')return fail('盤整框與盤後突破事件衝突：'+rangeAudit.text);
 if(rangeAudit.status==='down')return fail('盤整框向下跌破警戒：'+rangeAudit.text);
 if(rangeAudit.status==='data_gap')return pending('盤整框K線資料不完整，突破證據待核對');
 if(stage!=='first'&&c.abovePrevHigh===false)return fail('未收盤突破昨日高點');
 if(stage!=='first'&&c.abovePrevHigh!==true)return pending('昨日高點比較資料待核對');
 if(eventRow!==c)return pending('已重建60日高點候選事件；尚需核對大量K頸線與原始突破事件');
 return pass('突破事件與量價續攻條件已確認');
}
// R204: one common gate for bullish lists; observations/search/holdings are not buy lists.
function r204Stage(c){
 const p=c?.breakoutSequence?.phase;
 if(STRICT_BREAKOUT_STAGES.has(p))return p;
 if(p==='follow'&&c?.cycle?.firstHistoricalBreakout===true){if(c.cycle.daysSinceFirst===2)return 'third';if(c.cycle.daysSinceFirst===3)return 'fourth';}
 return null;
}
function r207ConfirmedPatternRisk(x){return x?.status==='ok'&&!x.research&&/收盤向下跌破|已在下緣下方|底部支撐失守|盤中突破收回/.test(x.phase);}
function r204PatternRisk(c){
 if(c?.possiblePriceAdjustment||c?.assetType==='ETF')return null;
 const tech=typeof r201TechnicalInput==='function'?r201TechnicalInput(c):{bars:c?.bars,reason:''};
 if(tech.reason)return null;
 const x=r202Pattern(tech.bars,c?.date,Number(c?.close));
 if(r207ConfirmedPatternRisk(x))return {status:'watch',reasons:[x.type+'｜'+x.phase],signals:['pattern_risk']};
 return null;
}
const r204Memo=new WeakMap();
function r204Breakout(c){
 const no=(reason,stage=null)=>({eligible:false,reason,stage});
 const day=state.payload?.asOf;
 if(!c||state.mode!=='live'||!day||state.universe?.asOf!==day||c.date!==day||staleDeskSnapshot(day))return no('非最新同日盤後資料');
 const stage=r204Stage(c);if(!stage)return no('尚無已核對的首次突破事件');
 const stamp=r145RowStamp(c)+'|'+day, cached=r204Memo.get(c);if(cached?.stamp===stamp)return cached.value;
 let out;
 try{
  const old=strictBreakoutDecision(c,stage);
  if(!old.eligible)out=no(old.reason,stage);
  else if(c.riskFirst||['high','medium'].includes(c.riskLevel)||c.overextended||c.onePriceLimit||!liquidityEvidence(c).launch){
   const reasons=[],liq=liquidityEvidence(c);
   if(c.riskFirst)reasons.push('既有風險優先');
   if(['high','medium'].includes(c.riskLevel))reasons.push('既有風險等級：'+(c.riskLevel==='high'?'高':'中'));
   if(c.overextended)reasons.push('追價／過熱');
   if(c.onePriceLimit)reasons.push('一價漲跌停待核對');
   if(!liq.valid)reasons.push('當日資料或20根日K價量不足');
   else if(!liq.launch){
    if(liq.avgLots<300)reasons.push('20根均量未達300張');
    if(liq.avgAmountM<10)reasons.push('20根日均成交金額未達1000萬元（估算）');
    if(liq.dayLots<50)reasons.push('最近日成交量未達50張');
   }
   out=no(reasons.join('、')||'既有風險或流動性待核對',stage);
  }
  else {
   const b=c.bars,cl=Number(c.close),prev=Number(b?.at(-2)?.[2]),level=Number(c.breakoutEvent?.level),v=Number(b?.at(-1)?.[5]);
   const avg=(n,offset=0)=>b.slice(b.length-n-offset,b.length-offset).reduce((a,x)=>a+Number(x[4]),0)/n;
   const tech=typeof r201TechnicalInput==='function'?r201TechnicalInput(c):{bars:b,reason:''};
   const p=tech.reason?{status:'unknown',reason:tech.reason}:r202Pattern(tech.bars,c.date,cl);
   const danger=r207ConfirmedPatternRisk(p);
   if(p.status==='unknown')out=no('形態所需資料未核對：'+p.reason,stage);
   else if(danger)out=no(p.type+'｜'+p.phase,stage);
   else if(!(cl>level&&cl>prev&&v>0&&cl>avg(5)&&cl>avg(10)&&avg(5)>avg(5,1)))out=no('尚未收盤突破昨日高點、站穩MA5／10及短線上揚',stage);
   else {
    const ind=r200Series(tech.bars,c.date,cl),last=ind?.at(-1),before=ind?.at(-2);
    if(!last||!before)out=no('KD／MACD資料待核對',stage);
    else if(r200CrossState(before.k-before.d,last.k-last.d)==='死亡交叉'&&r200CrossState(before.dif-before.dea,last.dif-last.dea)==='死亡交叉')out=no('KD及MACD同步死亡交叉',stage);
    else out={eligible:true,stage,reason:'原突破認證＋收盤創近期突破價、均線及風險通過'};
   }
  }
 }catch(e){out=no('突破審查異常，暫停認證',stage);}
 r204Memo.set(c,{stamp,value:out});return out;
}
const OBS_STAGE={tomorrow:'明日續攻候選（待隔日驗證）',r42pullback:'量縮回測再起（待隔日驗證）',r42pre:'頸線前蓄勢（提前布局觀察）',qualified:'大盤與個股條件已核對',leader:'強勢族群／短中期轉強個股',ready:'預備突破頸線',ma510:'突破前站上MA5／MA10',first:'突破第一根觀察',second:'突破第二根追蹤（非認證買點）',third:'突破第三根追蹤（非認證買點）',fourth:'突破第四根追蹤（非認證買點）',hold:'沿MA5／MA10趨勢追蹤（非追價買點）',maPullback:'沿MA5／MA10上漲後回測防守',launch:'量價啟動（未破大量K頸線）',reentry:'量縮回測／再度轉強觀察',trend:'六線確認／主升延續觀察'};
const R29_PRIORITY=['hold','maPullback','ready','ma510','first','second','third','fourth','launch','reentry','trend'];
// r26: restore the pre-r23 unified full battle card; keep radar stage classification independent.
// The old compact r23 observe card removed 速覽/價位/技術/公司研究 and must not replace the full card.
// r30: compact institutional-style rows; expensive original full cards are
// created ONLY when the individual stock is tapped. Keep just one open per group.
let r26ObserveGroups=new Map();
// r33: priority-watch rows have their own cache. Sector rebuilds reset
// r26ObserveGroups; they must not invalidate the top-five list on tap.
let r33PriorityRows=[];
function radarObserveCard(o){
 const c=o.row,group=String(o.sector||'產業待核對');
 const stage=OBS_STAGE[o.stage]||'價量觀察';
 const maGate=globalThis.ChaopanSectorV325?.sixLineAudit(c,o.snapshot);
 const ratio=Number(o.snapshot?.ratio);
 const note=`<div class="r26-context"><b>${esc(stage)} · ${esc(group)}</b><span>${esc(o.reason||'確認價量與支撐後再觀察')} · 歷史頸線 ${price(o.snapshot?.neck)} · 量比 ${Number.isFinite(ratio)?ratio.toFixed(2):'待資料'} · 同階段品質 ${Number.isFinite(o.quality)?o.quality.toFixed(1):'待核對'}（非勝率）</span><span>六線狀態：${esc(maGate?.label||'待核對')}；${esc(maGate?.reason||'資料不足')}</span><small>盤後觀察，非已認證進場或保證獲利；個股買賣價位仍須核對有效資料日。</small></div>`;
 return `<div class="r26-card-wrap">${sectorBattleCard(c,{source:'r30-expand-'+o.stage,rankText:'超盤手｜'+stage,stageLabel:stage})}</div>`;
}
function r26GroupMarkup(id,arr){
 r26ObserveGroups.set(id,arr);
 if(!arr.length)return `<div class="r23-empty">此階段沒有符合價量與風險條件的股票；不表示其他階段沒有候選。</div>`;
 const rows=arr.map((o,i)=>{
  const c=o.row;const quote=price(c.close);const change=pct(c.changePct);
  const status=o.compactStatus||(o.stage==='leader'?(o.confirmedSix?'六線確認強勢':'短中期轉強／六線待認證'):(OBS_STAGE[o.stage]||'觀察'));
  return `<details class="r30-stock-entry" data-r30-group="${esc(id)}" data-r30-index="${i}"><summary class="r30-stock-row"><span class="r30-stock-identity"><b>${esc(c.code)} ${esc(c.name)}</b><small>${esc(status)}</small></span><span class="r30-stock-quote"><strong>${esc(quote)}</strong><small>${esc(change)}</small></span><span class="r30-arrow" aria-hidden="true">⌄</span></summary><div class="r30-full-slot" data-r30-card-slot><span class="r26-lazy">點選此檔載入完整作戰字卡…</span></div></details>`;
 }).join('');
 return `<div class="r30-stock-list" data-r26-list="${esc(id)}">${rows}</div>`;
}
function r30StockToggle(el){
 const group=el.dataset.r30Group,idx=Number(el.dataset.r30Index);
 const arr=group==='desk-priority'?r33PriorityRows:(r42EventRows.get(group)||r26ObserveGroups.get(group));
 const slot=el.querySelector('[data-r30-card-slot]');
 if(!slot)return;
 if(!el.open){slot.replaceChildren();delete el.dataset.r30Loaded;return;}
 // Only one expanded full card within the current stage/sector.
 const parent=el.parentElement;
 for(const sibling of parent.querySelectorAll(':scope > details.r30-stock-entry[open]')){
  if(sibling!==el)sibling.open=false;
 }
 if(!arr||!Number.isInteger(idx)||idx<0||idx>=arr.length){slot.textContent='個股索引失效，請重新載入';return;}
 if(el.dataset.r30Loaded==='yes')return;
 slot.innerHTML=group==='desk-priority'&&arr[idx]?.verifiedDecision
  ?autoTradingCard({row:arr[idx].row,decision:arr[idx].verifiedDecision},idx)
  :radarObserveCard(arr[idx]);
 el.dataset.r30Loaded='yes';
}
// r42: keep the pre-existing stage audits without promoting "today's strongest" as tomorrow's opportunities.
const r42EventRows=new Map();
function sectorDirectory(){return r185Scoped(()=>sectorDirectoryR185())}
function sectorDirectoryR185(){
 const out=$('#sectorDirectory');if(!out)return;
 out.hidden=false;
 // R149: Never erase the entire technical-stage panel merely because a
 // breakout candidate is absent or optional sector/stage modules fail to load.
 // The status banner is independent of any bullish qualification filters.
 const modulesLoaded=Boolean(globalThis.ChaopanSectorV325&&globalThis.ChaopanStageV318);
 if(!state.universe||!Array.isArray(state.universe.rows)||state.universe.asOf!==state.payload?.asOf||state.mode==='demo'){
  out.innerHTML='<div class="r23-note r149-stage-banner" role="status"><b>技術階段｜資料待補</b><p>全市場交易日資料尚未核對，暫停股票階段認證；不是所有股票都沒有訊號。</p></div>';return;
 }
 let moduleIssue=!modulesLoaded;
 let radar={watch:[]};
 if(modulesLoaded){
  try{
   const result=sectorRadar();
   if(result&&Array.isArray(result.watch))radar=result;
   else moduleIssue=true;
  }catch(error){moduleIssue=true;console.error('技術階段模組暫時無法載入，改顯示可核對的歷史候選',error);}
 }
 r26ObserveGroups=new Map();
 // R150: Stage paint is read-only and self-contained. A malformed candidate must
 // not hide other stocks or make the entire technical-stage panel disappear.
 // Cache results only for this one paint; corrected same-day OHLCV will be
 // re-evaluated on the next paint (never reused across loads).
 const r150RiskMemo=new WeakMap(),r150DecisionMemo=new WeakMap(),r150HistoryMemo=new WeakMap();
 const r150Warn=error=>{scanErrors++;if(scanErrors<=3)console.warn('技術階段個別資料異常，已保留其他股票',error);};
 const r150StageRisk=c=>{
  if(!c||typeof c!=='object')return {status:'unknown',reasons:['股票欄位待補']};
  if(r150RiskMemo.has(c))return r150RiskMemo.get(c);
  let result;
  try{result=r133RiskGate(c)}catch(error){r150Warn(error);result={status:'unknown',reasons:['此檔風險資料異常，需重新核對']};}
  r150RiskMemo.set(c,result);return result;
 };
 const r150StageDecision=(c,stage)=>{
  if(!c||typeof c!=='object')return {eligible:false,pending:true,reason:'股票資料缺漏'};
  let byStage=r150DecisionMemo.get(c);
  if(!byStage){byStage=new Map();r150DecisionMemo.set(c,byStage);}
  if(byStage.has(stage))return byStage.get(stage);
  let result;
  try{result=strictBreakoutDecision(c,stage)}catch(error){r150Warn(error);result={eligible:false,pending:true,reason:'此檔突破判斷異常，暫列待補'};}
  byStage.set(stage,result);return result;
 };
 const r150StageHistory=c=>{
  if(!c||typeof c!=='object')return null;
  if(r150HistoryMemo.has(c))return r150HistoryMemo.get(c);
  let result=null;
  try{
   result=r147HistoricalBreakoutGate(c,state.payload.asOf)?.evidence||null;
   // R158: A risk gate intentionally returns null for an intact, backend-
   // labelled breakout. The technical-stage observation list must still
   // show any additional historical first-to-fourth event, without certifying it.
   if(!result&&c.breakoutSequence)result=r148ObservedBreakout(c,state.payload.asOf);
  }catch(error){r150Warn(error)}
  r150HistoryMemo.set(c,result);return result;
 };
 // Distinguish a raw historical breakout event from a currently qualified
 // trading observation. This prevents a 0-eligible list looking like no events.
 const rawAudit={first:0,second:0,third:0,fourth:0};
 const rawStageRows={first:[],second:[],third:[],fourth:[]};
 let maxBars=0,validRows=0,scanErrors=0;
 for(const c of state.universe.rows){
  if(c?.date!==state.payload.asOf||!Array.isArray(c.bars)||c.bars.at(-1)?.[0]!==state.payload.asOf)continue;
  validRows++;
  maxBars=Math.max(maxBars,c.bars.length);
  const phase=c.breakoutSequence?.phase;
  if(phase==='first')rawStageRows.first.push(c);
  if(phase==='second')rawStageRows.second.push(c);
  if(phase==='third'||(phase==='follow'&&c.cycle?.firstHistoricalBreakout===true&&c.cycle?.daysSinceFirst===2))rawStageRows.third.push(c);
  if(phase==='fourth'||(phase==='follow'&&c.cycle?.firstHistoricalBreakout===true&&c.cycle?.daysSinceFirst===3))rawStageRows.fourth.push(c);
  // R158: Backend-labelled stocks can ALSO have a newer, independently
  // observed breakout stage. Show BOTH observation stages, without ever
  // granting certified status from a reconstructed OHLCV candidate alone.
  // An unlabeled stock with no historical event must remain harmless (R149).
  const candidate=r150StageHistory(c);
  if(candidate?.status==='candidate'){
   const stageNames=[candidate.stage,candidate.latestEvent?.stage,candidate.otherEventStage,
    ...(candidate.recentEventStages||[])];
   for(const historicalStage of stageNames){
    if(Array.isArray(rawStageRows[historicalStage])&&!rawStageRows[historicalStage].includes(c))
     rawStageRows[historicalStage].push(c);
   }
  }
 }
 for(const k of Object.keys(rawStageRows))rawAudit[k]=rawStageRows[k].length;
 const ordered=[]; // R204: only two grouped lists below
 // Audit from BOTH historical events and sector watch results. A historical
 // event without current EOD certification must not silently become "0 stocks".
 const candidatesForStage=stage=>{
  const all=[...(rawStageRows[stage]||[]),...radar.watch.filter(o=>o.stage===stage).map(o=>o.row)];
  // Prefer the most complete certified record when the same stock appears in both sources.
  // Do not let an older raw candidate shadow a newer EOD certification.
  const byCode=new Map();
  for(const c of all){
   if(!c?.code)continue;
   const id=rowId(c);
   const prior=byCode.get(id);
   const quality=x=>(x?.continuationEligible===true||x?.continuationEligible===false?4:0)+
    (['strong','watch','weak','invalid'].includes(x?.breakoutQuality)?2:0)+
    (x?.breakoutEvent?.level>0?1:0);
   if(!prior||quality(c)>quality(prior))byCode.set(id,c);
  }
  return [...byCode.values()];
 };
 const qualifiedRows=stage=>STRICT_BREAKOUT_STAGES.has(stage)
  ?candidatesForStage(stage).filter(c=>r150StageDecision(c,stage).eligible&&r150StageRisk(c).status==='eligible').map(c=>({row:c,stage,sector:c.sector||'產業待核對',compactStatus:'已認證｜'+r150StageDecision(c,stage).reason}))
  :radar.watch.filter(o=>o.stage===stage&&r150StageDecision(o.row,stage).eligible&&r150StageRisk(o.row).status==='eligible');
 // Keep certified nonempty groups visible. Pending is not zero: it remains
 // visible for data-quality review. Empty groups fold into the idle section.
 // R151: A red-risk stock must never be counted as merely 'pending'.
  // Apply risk precedence before the EOD certification/pending outcome.
  const stagePending=stage=>STRICT_BREAKOUT_STAGES.has(stage)
  ?candidatesForStage(stage).some(c=>r150StageRisk(c).status!=='risk'&&(r150StageDecision(c,stage).pending||r150StageDecision(c,stage).eligible&&r150StageRisk(c).status!=='eligible'))
  :radar.watch.some(o=>o.stage===stage&&['watch','unknown'].includes(r150StageRisk(o.row).status));
 const activeStages=[],inactiveStages=[];
 for(const stage of ordered){
  try{
   const active=STRICT_BREAKOUT_STAGES.has(stage)?candidatesForStage(stage).length>0:
    qualifiedRows(stage).length>0||stagePending(stage);
   (active?activeStages:inactiveStages).push(stage);
  }catch(error){r150Warn(error);activeStages.push(stage);}
 }
 const stageBlock=stage=>{
  const arr=qualifiedRows(stage),strict=STRICT_BREAKOUT_STAGES.has(stage);
  const candidates=strict?candidatesForStage(stage):radar.watch.filter(o=>o.stage===stage).map(o=>o.row);
  const pendingCount=strict?candidates.filter(c=>r150StageRisk(c).status!=='risk'&&(r150StageDecision(c,stage).pending||r150StageDecision(c,stage).eligible&&r150StageRisk(c).status!=='eligible')).length:candidates.filter(c=>['watch','unknown'].includes(r150StageRisk(c).status)).length;
  const failedCount=strict?candidates.filter(c=>r150StageRisk(c).status==='risk'||!r150StageDecision(c,stage).eligible&&!r150StageDecision(c,stage).pending).length:candidates.filter(c=>r150StageRisk(c).status==='risk').length;
  const displayCount=stage==='trend'&&maxBars<245?'資料不足，待MA240認證':
   strict?`${arr.length} 已認證｜${pendingCount} 待補｜${failedCount} 未通過`:`${arr.length} 量價通過｜${pendingCount} 待補／觀察｜${failedCount} 警戒`;
  const auditNote=strict?`<p class="r23-note">僅顯示已認證檔數；${pendingCount?'部分股票資料待認證。':''}${failedCount?'未通過者保留在觀察區。':''}不代表買進建議。</p>`:
   stage==='trend'&&maxBars<245?`<p class="r23-note">日K不足以核算MA240，資料待認證。</p>`:'';
  const passedIds=new Set(arr.map(o=>rowId(o.row)));
  const rawOnly=candidates.filter(c=>!passedIds.has(rowId(c)));
  const rawGroup='raw-stage-'+stage;
  // R130: the headline counts certified stocks only. Uncertified candidates
  // live in a separate CLOSED disclosure with their own explicit count.
  // Never render raw candidates as direct siblings of certified rows.
  const rawMarkup=rawOnly.length?`<details class="r130-pending-group" data-r130-stage="${esc(stage)}"><summary>待補／賣壓警戒／認證未通過（${rawOnly.length} 檔）｜展開查看原因</summary><p class="r23-note">以下股票有資料不足、健康整理待確認或疑似出貨警戒，不列入通過數；請看每檔原因。</p>${r26GroupMarkup(rawGroup,rawOnly.map(c=>({row:c,stage,
   compactStatus:(!c.breakoutSequence?.phase&&r150StageHistory(c)?.status==='candidate'?'歷史K候選｜':'觀察｜')+
    (r150StageRisk(c).status==='eligible'?r150StageDecision(c,stage).reason:r150StageRisk(c).reasons.join('；')),
   reason:r150StageRisk(c).status==='eligible'?r150StageDecision(c,stage).reason:r150StageRisk(c).reasons.join('；')})))}</details>`:'';
  return `<details class="sector-group" data-r26-group="stage-${stage}"><summary><span class="sector-nom">${esc(OBS_STAGE[stage])}</span><span class="sector-sum">${displayCount}</span><span class="sector-arrow">⌄</span></summary>${auditNote}${r26GroupMarkup('stage-'+stage,arr)}${rawMarkup}</details>`;
 };
 const fallbackMessage=moduleIssue?'原有產業／技術階段模組未完整載入；以下僅顯示日K可核對的候選，不能視為正式認證。':'';
 const sourceMessage=!validRows?'同交易日標記相符的K棒為0，暫時無法重建候選；請檢查盤後資料更新。':`取得同日標記的K棒 ${validRows} 檔（逐檔品質另行審查）；其餘依資料品質和風險分層，不把0檔當成全部股票轉弱。`;
 const safeStageBlock=stage=>{
  try{return stageBlock(stage)}catch(error){
   r150Warn(error);
   return `<details class="sector-group" data-r26-group="stage-${esc(stage)}"><summary>${esc(OBS_STAGE[stage]||stage)}｜資料檢查異常</summary><p class="r23-note">此分組暫列待補；其他階段仍正常顯示。請核對盤後資料及程式日誌。</p></details>`;
  }
 };
 const uniqueRows=new Map();for(const stage of ['first','second','third','fourth'])for(const c of candidatesForStage(stage))uniqueRows.set(rowId(c),c);
 // R209: formal certification uses the same canonical universe rows as the advanced screener.
 // Sector module copies are useful for discovery, but cannot replace corrected EOD records.
 for(const c of state.universe.rows){if(c?.code&&(uniqueRows.has(rowId(c))||r204Stage(c)))uniqueRows.set(rowId(c),c);}
 const canonicalIds=new Set(state.universe.rows.filter(c=>c?.code).map(rowId));
 const first=[],follow=[],rejected=[];
 for(const c of uniqueRows.values()){
  const q=canonicalIds.has(rowId(c))?r204Breakout(c):{eligible:false,stage:null,reason:'未取得全市場正式同日資料'};const o={row:c,stage:q.stage||'first',compactStatus:q.reason,reason:q.reason};
  if(q.eligible)(q.stage==='first'?first:follow).push(o);else rejected.push(o);
 }
 const group=(id,title,rows)=>`<details class="sector-group"><summary><span class="sector-nom">${title}</span><span class="sector-sum">${rows.length} 檔</span></summary>${r26GroupMarkup(id,rows)}</details>`;
 out.innerHTML=`<div class="r23-note r149-stage-banner"><b>有效突破篩選｜不納入整理股</b><small>${esc(sourceMessage)}${esc(fallbackMessage)}｜通過不等於保證上漲。</small></div>`+
 group('r204-first','有效突破｜第一根',first)+group('r204-follow','突破續強｜第二至第四根',follow)+
 (rejected.length?`<details class="r27-idle"><summary>未通過／待核對（${rejected.length} 檔）</summary>${r26GroupMarkup('r204-rejected',rejected)}</details>`:'');

}

// r44.12: same-session relative performance, never infer missing index history.
function renderRelativeStrength(){return r185Scoped(()=>renderRelativeStrengthR185())}
function renderRelativeStrengthR185(){
 const el=$('#relativeStrengthList');if(!el)return;
 const intel=state.marketIntel||globalThis.ChaopanMarketIntel?.data||null;
 const asOf=state.payload?.asOf;
 const rows=state.universe?.asOf===asOf?state.universe.rows:[];
 const index=state.marketIntel?.indices||state.intel?.indices||null;
 // Market index is loaded asynchronously; use the verified comparison API where possible.
 const cmp=globalThis.ChaopanMarketRegime;
 if(!rows.length){el.textContent='全市場資料尚未核對，暫不排名';return;}
 const results=[];
 for(const c of rows){
  if(!r204Breakout(c).eligible||c.date!==asOf||c.possiblePriceAdjustment||c.riskFirst||c.riskLevel==='high'||!Array.isArray(c.bars)||c.bars.length<21)continue;
  const b=c.bars,prev=Number(b.at(-2)?.[4]),last=b.at(-1);
  if(last?.[0]!==asOf||!(prev>0)||!(Number(c.close)>0)||!(Number(c.lots)>=1000))continue;
  const daily=Number(c.changePct);
  if(!Number.isFinite(daily)||daily<=0||Math.abs((Number(c.close)/prev-1)*100-daily)>.2)continue;
  const m=state.marketIntel||state.intel||null;
  const ix=m?.indices?.[c.market==='上市'?'taiex':'otc'];
  if(!ix||ix.date!==asOf||!Number.isFinite(Number(ix.pct))||!(Number(ix.close)>0))continue;
  const excess=daily-Number(ix.pct);
  if(excess<=0||Number(c.close)<10)continue;
  const ma20=b.slice(-20).reduce((a,v)=>a+Number(v[4]),0)/20;
  if(Number(c.close)<ma20)continue;
  results.push({row:c,excess,daily,marketPct:Number(ix.pct)});
 }
 results.sort((a,b)=>b.excess-a.excess||Number(b.row.lots)-Number(a.row.lots));
 const top=results.slice(0,30);
 r26ObserveGroups.set('relative-daily',top.map(x=>({row:x.row,stage:'leader',reason:`單日超額 ${x.excess.toFixed(2)}%，僅盤後觀察`,compactStatus:`較同市場指數強 ${x.excess.toFixed(2)}%｜個股 ${x.daily.toFixed(2)}%`})));
 el.innerHTML=`<p class="r23-note">${esc(asOf||'—')} 同日指數確認後：${results.length} 檔符合正報酬、單日超額、MA20及基本流動性；顯示前 ${top.length} 檔。未提供有效指數時顯示0檔，不假造資料。</p>`+r26GroupMarkup('relative-daily',r26ObserveGroups.get('relative-daily'));
}
function renderEventRadar(result){
 const target=$('#eventRadar');if(!target)return;
 r42EventRows.clear();
 if(!result||!Array.isArray(result.events)){
  target.innerHTML='<div class="r23-empty">事件雷達暫停：個股交易日期尚未核對，勿用歷史資料判定事件買點。</div>';return;
 }
 if(!result.events.length){target.innerHTML='<div class="r23-empty">目前未接入可核對且符合日期窗口的事件；不編造下一個展覽。</div>';return;}
 target.innerHTML=result.events.map(event=>{
  const group='event-'+event.id;
  const rows=event.selected.filter(x=>r204Breakout(x.row).eligible).map(x=>({row:x.row,stage:r204Breakout(x.row).stage,sector:'事件題材研究',reason:x.reason,
   quality:x.score,snapshot:x.snapshot,compactStatus:`${r204Breakout(x.row).stage==='first'?'有效突破第一根':'突破續強'} · 觀察品質 ${x.score}/100（非勝率）`}));
  r42EventRows.set(group,rows);
  return `<section class="r42-event-card"><div class="r42-event-head"><b>${esc(event.title)}</b><small>${esc(event.status)} · ${esc(event.start)}～${esc(event.end)}</small></div>
   <p>${esc(event.disclosure)}</p><p>本地池內 ${event.matchingCount} 檔；符合相同交易日、價量及風險條件 ${rows.length} 檔。</p>
   ${rows.length?r26GroupMarkup(group,rows):'<div class="r23-empty">這個事件目前沒有符合早期布局條件的個股。不因展覽題材強行推薦，也不使用股價已大漲的標的湊名單。</div>'}
   <small>資料日期 ${esc(result.asOf)}，非盤中即時；<a href="${esc(event.source)}" target="_blank" rel="noopener noreferrer">${esc(event.sourceLabel)}</a>（活動資訊來源）</small></section>`;
 }).join('');
}
/* r7: Each chart is rendered from the selected stock's dated OHLCV rows. */
function annotatedBattleChart(c,g){
 const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
 const rows=(Array.isArray(c?.bars)?c.bars:[]).filter(b=>Array.isArray(b)&&b.length>=6&&[1,2,3,4,5].every(k=>num(b[k])!==null)&&Number(b[2])>=Number(b[3]));
 if(rows.length<10||String(rows.at(-1)[0])!==String(c?.date))return `<div class="battle-chart-empty">K線資料不足或日期不一致，暫不繪製作戰圖；不能把舊K線當今天行情。</div>`;
 const data=rows.slice(-35), W=390,H=277, l=20,r=260,t=26,b=208,volY=221,volH=28;
 const close=num(g.close), closeInChart=close!==null&&Math.abs(close-Number(data.at(-1)[4]))<.0001;
 if(!closeInChart)return `<div class="battle-chart-empty">價量資料尚未核對一致，暫不繪製買賣關卡。</div>`;
 const levels=[
  {name:'突破',v:num(g.breakoutLevel),color:'#ffbc68',key:'breakout'},
  {name:'大量K頸線',v:num(latestNeck(c)),color:'#d6a8ef',key:'neck'},
  {name:'MA5',v:num(g.ma5),color:'#f3d55d',key:'ma5'},
  {name:'MA10',v:num(g.ma10),color:'#85c5ff',key:'ma10'},
  {name:'結構支撐',v:num(g.support),color:'#5bdfbf',key:'support'},
  {name:'移動停利',v:num(g.trailingStop),color:'#f58f9f',key:'trail'}
 ].filter(x=>x.v!==null&&x.v>0);
 const uniq=[];
 for(const lev of levels){const same=uniq.find(a=>Math.abs(a.v-lev.v)<=Math.max(.001,lev.v*.0003));
   if(same){if(same.name==='突破'&&lev.key==='neck')same.name='突破／頸線';}
   else uniq.push({...lev});
 }
 const high=Math.max(...data.map(x=>Number(x[2]))),low=Math.min(...data.map(x=>Number(x[3])));
 const scoped=uniq.filter(v=>v.v>=close*.75&&v.v<=close*1.30);
 let max=Math.max(high,close,...scoped.map(v=>v.v)),min=Math.min(low,close,...scoped.map(v=>v.v));
 const pad=(max-min)*.075||Math.max(close*.012,.1);max+=pad;min-=pad;
 const y=p=>t+(max-p)/(max-min)*(b-t),dx=(r-l)/data.length;
 const f=n=>Number(n).toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2});
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.name||c.code||'個股')} ${esc(c.date)} 日K走勢與買賣價位圖解"><rect x="0.5" y="0.5" width="389" height="276" rx="10" fill="#091928" stroke="#34516a"/>`;
 for(let i=0;i<=4;i++){const yy=t+(b-t)*i/4;svg+=`<line x1="${l}" x2="${r}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#3e576a" opacity=".38" stroke-dasharray="3 5"/>`;}
 if(Array.isArray(g.pullbackZone)&&g.pullbackZone.every(v=>num(v)!==null)){
   const upper=Math.max(...g.pullbackZone),lower=Math.min(...g.pullbackZone);
   const upperY=Math.max(t,y(upper)),lowerY=Math.min(b,y(lower));
   if(lowerY>=upperY)svg+=`<rect x="${l}" y="${upperY.toFixed(1)}" width="${r-l}" height="${Math.max(2,lowerY-upperY).toFixed(1)}" fill="#44bfa3" opacity=".12"/>`;
 }
 const closes=rows.map(x=>Number(x[4])),offset=rows.length-data.length;
 [[5,'#f5d260'],[10,'#87c4f6']].forEach(([n,color])=>{const pts=[];data.forEach((row,i)=>{const j=offset+i;if(j+1<n)return;const a=closes.slice(j+1-n,j+1).reduce((x,v)=>x+v,0)/n;pts.push(`${(l+dx*(i+.5)).toFixed(1)},${y(a).toFixed(1)}`)});if(pts.length>1)svg+=`<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6"/>`;});
 const mv=Math.max(1,...data.map(v=>Math.max(0,Number(v[5]))));
 data.forEach((row,i)=>{
  const op=Number(row[1]),hi=Number(row[2]),lo=Number(row[3]),cl=Number(row[4]),v=Math.max(0,Number(row[5]));
  const x=l+dx*(i+.5),color=cl>=op?'#ff777f':'#39d9ad',wide=Math.max(2,dx*.6);
  svg+=`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y(hi).toFixed(1)}" y2="${y(lo).toFixed(1)}" stroke="${color}" stroke-width="1.1"/>`;
  svg+=`<rect x="${(x-wide/2).toFixed(1)}" y="${Math.min(y(op),y(cl)).toFixed(1)}" width="${wide.toFixed(1)}" height="${Math.max(1.7,Math.abs(y(op)-y(cl))).toFixed(1)}" fill="${color}"/>`;
  svg+=`<rect x="${(x-wide/2).toFixed(1)}" y="${(volY+volH*(1-v/mv)).toFixed(1)}" width="${wide.toFixed(1)}" height="${(volH*v/mv).toFixed(1)}" fill="${color}" opacity=".6"/>`;
 });
 const currentY=y(close);svg+=`<line x1="${l}" x2="${r+7}" y1="${currentY.toFixed(1)}" y2="${currentY.toFixed(1)}" stroke="#f4f8fb" stroke-width="1.3" stroke-dasharray="4 3" opacity=".86"/>`;
 const labels=[...uniq.filter(v=>v.v>=min&&v.v<=max),{name:'收盤',v:close,color:'#f0f9ff',key:'close'}].sort((a,b)=>b.v-a.v);
 // Reserve a readable lane for each overlapping price label while keeping connector at exact price.
 let cursor=t+2;for(const item of labels){item.py=y(item.v);item.ly=Math.max(item.py,cursor);cursor=item.ly+17;}
 if(labels.length&&labels.at(-1).ly>b-4){const shift=labels.at(-1).ly-(b-4);labels.forEach(item=>item.ly-=shift);}
 labels.forEach(item=>{
   svg+=`<path d="M ${r} ${item.py.toFixed(1)} L ${r+9} ${item.py.toFixed(1)} L ${r+15} ${item.ly.toFixed(1)}" fill="none" stroke="${item.color}" stroke-width="1.2" stroke-dasharray="${item.key==='close'?'0':'3 2'}" opacity=".85"/>`;
   svg+=`<circle cx="${r+15}" cy="${item.ly.toFixed(1)}" r="2.1" fill="${item.color}"/>`;
   svg+=`<text x="${r+19}" y="${(item.ly+4).toFixed(1)}" fill="${item.color}" font-size="11" font-weight="700">${esc(item.name)} ${esc(f(item.v))}</text>`;
 });
 svg+=`<text x="${l}" y="${H-8}" fill="#94b2c5" font-size="10">${esc(String(data[0][0]).slice(5,10))}</text><text x="${r}" y="${H-8}" text-anchor="end" fill="#94b2c5" font-size="10">${esc(String(data.at(-1)[0]).slice(5,10))}</text></svg>`;
 return `<div class="battle-chart-wrap"><div class="battle-chart-head"><b>📈 ${esc(c.code)} ${esc(c.name)}｜關卡圖解</b><span>${esc(c.date)} 盤後</span></div>${svg}<div class="battle-chart-caption">紅漲綠跌・淡綠帶為 MA5 附近回測觀察區；水平線均為條件參考，非盤中即時成交價。點開下方歷史K線可查看更多日期。</div></div>`;
}
/* r38: Preserve historical chart and the original annotated K-line image. Only replace duplicated action prose. */
function r38SixPlan(c,g){
 if(!globalThis.ChaopanBattleSixV138)return null;
 const valid=String(c.code||'').match(/^\d{4}$/)&&!String(c.code||'').startsWith('00');
 const lastTen=(c.bars||[]).slice(-11,-1);
 const recentHigh=lastTen.length?Math.max(...lastTen.map(b=>Number(b[2]))):null;
 return ChaopanBattleSixV138.model({
  market:c.market,instrument:valid?'stock':'unverified',date:c.date,snapshotDate:state.payload?.asOf,
  close:c.close,bars:c.bars,neck:latestNeck(c),breakout:g.breakoutLevel,
  support:g.support,ma5:g.ma5,ma10:g.ma10,ma20:c.trading?.ma20,
  atr:c.trading?.atr14,recentHigh,held:false,
  adjusted:false,stale:staleDeskSnapshot(c.date),marketVerified:false,
  volumeVerified:false,candleVerified:false,ma240Verified:false
 });
}
function r38PlanCard(c,g,compact=false){
 const plan=r38SixPlan(c,g);
 return plan?ChaopanBattleSixV138.render(plan,{compact}):'<div class="six-battle">六價位模組尚未載入；不得沿用不完整的舊買賣價</div>';
}
// r65: end-of-day defensive watch. All observations use completed daily bars only.
function defensiveEarlyWarning(c){
 // r69: no future bars. Each stage is computed using data available at that close.
 const bars=c?.bars;
 if(!Array.isArray(bars)||bars.length<26)return {stage:'unknown',text:'防守預警：歷史K線不足（至少26根）'};
 const a=bars.slice(-26);
 if(c?.possiblePriceAdjustment===true||a.some((b,i)=>!r129ValidCandle(b)||!r211HoldingDate(b[0])||Number(b[5])<=0||(i>0&&(b[0]<=a[i-1][0]||Math.abs(Number(b[4])/Number(a[i-1][4])-1)>.105)))||(c?.date&&c.date!==a.at(-1)[0])||(c?.close!==undefined&&(!Number.isFinite(numeric(c.close))||Math.abs(numeric(c.close)-Number(a.at(-1)[4]))>.001)))return {stage:'unknown',text:'防守預警：K線、日期、成交量或價格斷層待核對'};
 const cls=a.map(b=>Number(b[4])),hi=a.map(b=>Number(b[2])),vol=a.map(b=>Number(b[5]));
 const mean=v=>v.reduce((x,y)=>x+y,0)/v.length;
 const ma=(end,n)=>mean(cls.slice(end-n,end));
 const evaluate=end=>{
  const last=cls[end-1],prior=cls[end-2],m5=ma(end,5),m5prev=ma(end-1,5),m5prev2=ma(end-2,5),m10=ma(end,10),m20=ma(end,20);
  const advance=cls[end-6]>cls[end-16]*1.025 || ma(end-5,5)>ma(end-15,5)*1.02;
  const slopeSlow=m5>m5prev && m5-m5prev<m5prev-m5prev2;
  const stalledHigh=Math.max(...hi.slice(end-3,end))<=Math.max(...hi.slice(end-10,end-3))*1.005;
  const volumeDivergence=last>=prior && vol[end-1]<mean(vol.slice(end-21,end-1))*.8;
  const signals=[slopeSlow,stalledHigh,volumeDivergence].filter(Boolean).length;
  const weak=last<m5 && prior>=m5prev;
  const below5=last<m5;
  const zero=advance && last>=m5 && last>=m20 && signals>=2;
  return {advance,zero,weak,below5,below10:last<m10,down: last<=prior,signals};
 };
 const today=evaluate(cls.length),yesterday=evaluate(cls.length-1);
 const asOf=String(a[a.length-1][0]||c.date||'最近收盤');
 // Second candle must FOLLOW a first weak close; consecutive weakness alone is not enough.
 if(yesterday.weak && today.below5 && today.below10 && today.down && yesterday.advance)
  return {stage:'second',text:`${asOf} 收盤｜第二根轉弱確認：前日跌破MA5、今日仍低於MA5與MA10；下一交易日評估防守，非即時賣出指令`};
 if(today.weak && today.advance)
  return {stage:'first',text:`${asOf} 收盤｜第一根轉弱：收盤跌破MA5；下一交易日評估減碼風險，不保證成交價格`};
 if(today.zero)
  return {stage:'zero',text:`${asOf} 收盤｜第0根防守前兆（${today.signals}/3）：動能／高點／量價出現警訊；下一交易日優先觀察，尚未確認轉弱`};
 if(today.below5 && yesterday.below5)
  return {stage:'watch',text:`${asOf} 收盤｜持續弱於MA5，但不符合連續第一、第二根定義；檢查MA10與盤整下緣，不冒稱第二根`};
 return {stage:'normal',text:`${asOf} 收盤｜未達第0根或轉弱條件；持續觀察MA5、MA10與盤整下緣`};
}
// r70: chronological, no-lookahead defense replay. A signal is evaluated only
// on the candle's own historical prefix, never using future candles.
// r73: two-direction next-session plans. A defensive price is published ONLY
// after a confirmed defensive zero; support-bounce candidates use a separate
// bullish setup and are never mislabelled as a defensive zero.
function nextSessionDefense(c){
 const bars=c?.bars;
 if(!Array.isArray(bars)||bars.length<26)return {status:'insufficient',text:'雙向預判：至少需要26根完整日K'};
 const a=bars.slice(-Math.min(120,bars.length));
 const valid=b=>r129ValidCandle(b)&&r211HoldingDate(b[0])&&Number(b[5])>0;
 if(c?.possiblePriceAdjustment===true||!a.every(valid)||a.some((b,i)=>i>0&&(b[0]<=a[i-1][0]||Math.abs(Number(b[4])/Number(a[i-1][4])-1)>.105)))return {status:'invalid',text:'雙向預判：K線、日期或價格斷層待核對，暫停計算'};
 const last=a.at(-1),date=last[0],close=Number(last[4]);
 if(c?.date&&String(c.date).slice(0,10)!==date.slice(0,10))return {status:'stale',text:'雙向預判：資料日期不一致，暫停計算'};
 if(c?.close!==undefined&&(!Number.isFinite(numeric(c.close))||Math.abs(numeric(c.close)-close)>.001))return {status:'stale',text:'雙向預判：收盤價不一致，暫停計算'};
 const avg=v=>v.reduce((x,y)=>x+y,0)/v.length;
 const cls=a.map(b=>Number(b[4])),high=a.map(b=>Number(b[2])),low=a.map(b=>Number(b[3])),vol=a.map(b=>Number(b[5]));
 const ma5Trigger=avg(cls.slice(-4)),ma10Trigger=avg(cls.slice(-9));
 const ma5=avg(cls.slice(-5)),ma5Prior=avg(cls.slice(-6,-1));
 const avg20=avg(vol.slice(-21,-1));
 const recentLow=Math.min(...low.slice(-5));
 const defenseSignal=defensiveEarlyWarning({bars:a,date});
 // r77: every completed daily candle gets a rolling short-swing plan, independent of stage-zero.
 const floorTick=v=>r213SnapFor(c,v,'down');
 const ceilTick=v=>r213SnapFor(c,v,'up');
 const priorHigh=high.at(-2); // previous trading session high, not five-day high
 const fiveDayHigh=Math.max(...high.slice(-6,-1));
 const priorLow=Math.min(...low.slice(-4,-1));
 const prevClose=cls.at(-2);
 const last3Low=Math.min(...low.slice(-3));
 const atrParts=a.slice(-15).map((b,i,arr)=>i===0?null:Math.max(Number(b[2])-Number(b[3]),Math.abs(Number(b[2])-Number(arr[i-1][4])),Math.abs(Number(b[3])-Number(arr[i-1][4])))).filter(Number.isFinite);
 const atr=atrParts.length?avg(atrParts):null;
 const continuation=ceilTick(Math.max(fiveDayHigh,ma5Trigger));
 const earlyWatch=floorTick(Math.max(Math.min(ma5Trigger,close),Math.min(priorLow,close)));
 // Short-swing defense: the prior completed candle's low is a nearby reference;
 // the broader structural low is separate and must not masquerade as a trailing stop.
 const priorDayLow=low.at(-2);
 const shortDefense=floorTick(Math.min(priorDayLow,earlyWatch));
 const structuralSupport=floorTick(Math.min(...low.slice(-10)));
 const intradayRange=Math.max(0,Number(last[2])-Number(last[3]));
 const upperWick=Math.max(0,Number(last[2])-Math.max(Number(last[1]),close));
 const highToClosePct=Number(last[2])>0?(Number(last[2])-close)/Number(last[2]):0;
 const rejection=intradayRange>0 && highToClosePct>=.045 && upperWick/intradayRange>=.3;
 const highVolume=avg20>0&&vol.at(-1)>=avg20*1.3;
 const dailyPlan={continuation,earlyWatch,hardDefense:shortDefense,structuralSupport,priorHigh,fiveDayHigh,sessionHigh:high.at(-1),atr,rejection,highVolume,highToClosePct};
 const format=v=>v===null?'—':price(v);
 const below=values=>[...new Set(values.filter(v=>Number.isFinite(v)&&v>0&&v<close*.999).map(v=>Math.round(v*10000)/10000))].sort((x,y)=>y-x);
 if(defenseSignal.stage==='zero'){
  const levels=below([ma5Trigger,recentLow,ma10Trigger,Math.min(...low.slice(-10))]);
  const early=levels[0]??null;
  const defensive=levels.find(v=>early!==null&&v<early*.997)??null;
  return {status:'ok',mode:'defense',asOf:date,close,dailyPlan,early,defensive,ma5Trigger,ma10Trigger,recentLow,avg20,text:`${date} 第0根成立｜隔日預警 ${format(early)}；防守 ${format(defensive)}；跌破配合量價才評估提前減碼`};
 }
 // Bullish support bounce: prior pullback, a tested recent low, two rising closes,
 // improving short-term trend, and close sufficiently near support. No lookahead.
 const lookback=low.slice(-16,-2),priorPeak=Math.max(...high.slice(-25,-5));
 const support=Math.min(...low.slice(-8));
 const pullback=priorPeak>support*1.055;
 const higherCloses=cls.at(-1)>cls.at(-2)&&cls.at(-2)>cls.at(-3);
 const recovering=close>ma5&&ma5>=ma5Prior&&close>cls.at(-5);
 const nearSupport=(close/support-1)<=.085;
 const bounce=pullback&&higherCloses&&recovering&&nearSupport&&lookback.length>0;
 if(bounce){
  const breakout=Math.max(...high.slice(-6,-1)); // known prior highs, excludes current bar
  const failure=below([Math.min(...low.slice(-3)),support])[0]??null;
  const resistance=overheadResistance({...c,bars:a,close,date}).levels[0]??null;
  return {status:'ok',mode:'bounce',asOf:date,close,dailyPlan,support,breakout:breakout>close?breakout:null,failure,avg20,resistance:resistance?.low??null,text:`${date} 支撐反彈候選｜前高突破 ${format(breakout>close?breakout:null)}；反彈失敗觀察 ${format(failure)}；需量價確認`};
 }
 return {status:'ok',mode:'daily',asOf:date,close,dailyPlan,text:`${date} 收盤｜未符合第0根防守或支撐起漲條件；不提供交易觸發價`};
}
// r80: end-of-day decision engine. All next-session levels use only completed bars.
// Never infer intraday event order from OHLC. Pivot confirmation needs two older bars.
function r80Decision(c){
 const r=nextSessionDefense(c);
 if(r.status!=='ok'||!r.dailyPlan)return {ok:false,reason:r.text||'日K資料不足'};
 const bars=c.bars, n=bars.length, last=bars[n-1];
 const close=Number(last[4]), open=Number(last[1]), high=Number(last[2]), low=Number(last[3]);
 const prev=bars.slice(0,-1), atr=r.dailyPlan.atr;
 const highs=prev.map(x=>Number(x[2])), lows=prev.map(x=>Number(x[3]));
 const snap=(v,dir)=>r213SnapFor(c,v,dir);
 // Confirmed historical pivots: the two bars to the right must already exist.
 const pivots=(values)=>{
  const out=[];
  for(let i=2;i<values.length-2;i++){
   if(values[i]<values[i-1]&&values[i]<values[i-2]&&values[i]<=values[i+1]&&values[i]<=values[i+2])out.push({i,v:values[i]});
  }
  return out;
 };
 const swingLows=pivots(lows), lastSwing=swingLows.at(-1)?.v??null;
 const priorResistance=Math.max(...highs.slice(-5));
 const resistance=snap(close>priorResistance?Math.max(...bars.slice(-5).map(x=>Number(x[2]))):priorResistance, 'up');
 const highRef=Math.max(...bars.slice(-22).map(x=>Number(x[2])));
 const rawTrail=atr>0?highRef-3*atr:null;
 // Short swing low is distinct from the structural stop; do not force a stop above close.
 const shortLow=Math.min(...lows.slice(-3));
 const watch=snap(shortLow,'down');
 const stopCandidates=[lastSwing,rawTrail].filter(v=>Number.isFinite(v)&&v>0&&v<close);
 const exit=stopCandidates.length?snap(Math.max(...stopCandidates),'down'):null;
 const pressure=priorResistance>close?priorResistance:null;
 const failed=high>priorResistance&&close<priorResistance;
 const range=Math.max(high-low,.000001);
 const weakClose=(close-low)/range<.3;
 const pullback=(high-close)/high;
 const earlyRisk=failed&&(weakClose||pullback>=.025);
 const breakShort=close<shortLow;
 const breakSwing=lastSwing!==null&&close<lastSwing;
 const atrBreak=rawTrail!==null&&close<rawTrail;
 const d=defensiveEarlyWarning(c);
 let status='續抱觀察',tone='success',explain='短線結構未出現確認減碼條件，持續追蹤並更新防守。';
 if(breakSwing&&(atrBreak||d.stage==='first'||d.stage==='second')){
  status='出場防守';tone='danger';explain='收盤跌破已確認波段低點，且其他防守訊號配合；評估剩餘部位風險。';
 }else if(breakShort&&(earlyRisk||d.stage==='zero'||d.stage==='first'||d.stage==='second'||atrBreak)){
  status='減碼確認';tone='danger';explain='收盤跌破前3日短線低點，且伴隨突破失敗、ATR或第0根等風險。';
 }else if(earlyRisk||d.stage==='zero'||d.stage==='first'||d.stage==='second'){
  status='減碼預警';tone='warning';explain='出現衝高回落／防守警訊，先規劃隔日減碼條件，不代表盤中已成交。';
 }else if(close>priorResistance&&close>open){
  status='突破續抱';tone='success';explain='收盤站上前5日已知高點；追蹤下一道壓力與防守價。';
 }else if(atr>0&&close>Math.min(...lows.slice(-10))+2*atr){
  status='獲利保護';tone='warning';explain='反彈已有幅度，未出現確認減碼訊號；持續提高風險意識。';
 }
 return {ok:true,status,tone,explain,close,date:r.asOf,pressure:snap(pressure,'up'),breakout:resistance,watch,exit,atr,failed,pullback,stage:d.stage,stageText:d.text,rejection:r.dailyPlan.rejection,highVolume:r.dailyPlan.highVolume,high,priorResistance};
}
// r82: one compact EOD decision card. No legacy six-price / recent-status panels.
// Levels are scenarios from completed daily bars, not intraday signals.
function r82Snap(v,dir='down',c=null){
 return r213SnapFor(c,v,dir);
}
function r82Plan(c){
 const r=nextSessionDefense(c);
 if(r.status!=='ok'||!r.dailyPlan)return {ok:false,reason:r.text||'資料不足'};
 const bars=c.bars||[],last=bars.at(-1),close=Number(last?.[4]),atr=Number(r.dailyPlan.atr);
 if(bars.length<20||!Number.isFinite(close)||close<=0||String(last[0])!==String(c.date))return {ok:false,reason:'歷史K線不足或日期不一致，暫停價位計算'};
 const prior=bars.slice(-21,-1),neck=Number(latestNeck(c));
 const known=prior.map(b=>Number(b[2])).concat([neck]).filter(v=>Number.isFinite(v)&&v>close*1.002);
 const resistance=known.length?r82Snap(Math.min(...known),'up',c):null;
 const risk=defensiveEarlyWarning(c);
 const buffer=Number.isFinite(atr)&&atr>0?Math.max(.005,Math.min(.015,atr/close*.18)):.01;
 const rebound=resistance?r82Snap(resistance*(1-buffer),'down',c):null;
 const recentLow=Math.min(...bars.slice(-5).map(b=>Number(b[3])).filter(v=>Number.isFinite(v)&&v>0));
 const technicalFloor=Number.isFinite(recentLow)?r82Snap(recentLow,'down',c):null;
 const atrFloor=Number.isFinite(atr)&&atr>0?r82Snap(close-atr*.7,'down',c):null;
 const defense=technicalFloor!==null&&atrFloor!==null?Math.max(technicalFloor,atrFloor):technicalFloor??atrFloor;
 const priorCeiling=Math.max(...bars.slice(-6,-1).map(b=>Number(b[2])));
 const rejection=!!r.dailyPlan.rejection||(Number(last[2])>priorCeiling&&close<priorCeiling);
 return {ok:true,date:r.asOf,close,resistance,rebound:rebound!==null&&rebound>close?rebound:null,defense,buffer,rejection,risk:risk.stage,atr,technicalFloor,reason:rebound!==null&&rebound<=close?'反彈減碼區已在收盤價下方，不可視為隔日可成交價':null};
}
// r91: cost-aware, EOD-only profit protection. Never assert an intraday fill.
function r91ProfitPlan(v,cost,c=null){
 if(!Number.isFinite(cost)||cost<=0)return null;
 const gain=(v.close/cost-1)*100;
 // Explicit provisional tiers; must be backtested, not institutional trade rules.
 const lock=gain>=20?.65:gain>=12?.55:gain>=8?.45:gain>=5?.30:gain>=3?.15:0;
 const profitFloor=lock>0?r82Snap(cost+(v.close-cost)*lock,'down',c):null;
 // A higher profit floor than today's close is never a valid tomorrow stop.
 const validProfit=profitFloor!==null&&profitFloor<v.close?profitFloor:null;
 const defense=validProfit!==null?Math.max(v.defense??0,validProfit):v.defense;
 const level=Number.isFinite(defense)&&defense>0?r82Snap(defense,'down',c):null;
 return {gain,lock,profitFloor:validProfit,defense:level,alreadyBroken:level!==null&&v.close<=level,unrealizedPerShare:v.close-cost};
}
// r92: EOD trend/volume/verified-institutional decision. Pure calculation, no intraday inference.
function r92Decision(c,mode='medium'){
 const bars=Array.isArray(c?.bars)?c.bars:[];
 if(bars.length<25)return {status:'資料不足',tone:'muted',reasons:['至少需要25根有效日K'],institution:'待核對',trend:'待核對',volume:'待核對'};
 if(bars.some(b=>!Array.isArray(b)||b.length<6||![1,2,3,4,5].every(i=>Number.isFinite(Number(b[i])))||Number(b[3])<=0||Number(b[2])<Number(b[3])||Number(b[1])<Number(b[3])||Number(b[1])>Number(b[2])||Number(b[4])<Number(b[3])||Number(b[4])>Number(b[2])||Number(b[5])<0))return {status:'資料不足',tone:'muted',reasons:['歷史日K有異常價格或成交量'],institution:'待核對',trend:'待核對',volume:'待核對'};
 const last=bars.at(-1),close=Number(last?.[4]),open=Number(last?.[1]),high=Number(last?.[2]),low=Number(last?.[3]),vol=Number(last?.[5]);
 const closes=bars.map(b=>Number(b[4]));
 const vols=bars.map(b=>Number(b[5]));
 const ma=n=>closes.length>=n&&closes.slice(-n).every(x=>Number.isFinite(x)&&x>0)?closes.slice(-n).reduce((a,b)=>a+b,0)/n:null;
 const priorVols=vols.slice(-21,-1);
 const avgVol=priorVols.length===20&&priorVols.every(x=>Number.isFinite(x)&&x>=0)?priorVols.reduce((a,b)=>a+b,0)/20:null;
 if(![open,high,low,close,vol].every(Number.isFinite)||low<=0||high<low||open<low||open>high||close<low||close>high||vol<0||String(last[0])!==String(c.date))return {status:'資料不足',tone:'muted',reasons:['日K欄位或日期未核對'],institution:'待核對',trend:'待核對',volume:'待核對'};
 const m5=ma(5),m10=ma(10),m20=ma(20),m60=ma(60),m120=ma(120);
 const m20prev=closes.length>=21?closes.slice(-21,-1).reduce((a,b)=>a+b,0)/20:null;
 const m60prev=closes.length>=61?closes.slice(-61,-1).reduce((a,b)=>a+b,0)/60:null;
 const volumeRatio=avgVol>0?vol/avgVol:null;
 const closeLocation=high>low?(close-low)/(high-low):.5;
 const priorLow=Math.min(...bars.slice(-6,-1).map(b=>Number(b[3])));
 const riskBreak=Number.isFinite(priorLow)&&close<priorLow;
 const shortWeak=close<m10&&m5<m10;
 const mediumWeak=close<m20&&(m20prev===null||m20<m20prev);
 const longWeak=m60!==null&&m60prev!==null&&close<m60&&m60<m60prev;
 const trendWeak=mode==='short'?shortWeak:mode==='long'?longWeak:mediumWeak;
 const trendStrong=mode==='short'?close>m5&&m5>=m10:mode==='long'?m60!==null&&close>m60&&m60prev!==null&&m60>=m60prev:close>m20&&m20prev!==null&&m20>=m20prev;
 const sellPressure=volumeRatio!==null&&volumeRatio>=1.4&&closeLocation<=.3&&close<open;
 // r120: each historical signal uses only the twenty sessions preceding that candle.
 // Do not use the latest twenty-session baseline to classify older sessions.
 const recentDistribution=bars.slice(-5).reduce((count,b,i)=>{
  const index=bars.length-5+i,history=bars.slice(index-20,index);
  if(history.length!==20)return count;
  const previousVolumes=history.map(x=>Number(x[5]));
  if(!previousVolumes.every(x=>Number.isFinite(x)&&x>=0))return count;
  const base=previousVolumes.reduce((a,v)=>a+v,0)/20;
  const o=Number(b[1]),h=Number(b[2]),l=Number(b[3]),cl=Number(b[4]),v=Number(b[5]);
  return count+(base>0&&[o,h,l,cl,v].every(Number.isFinite)&&h>l&&o>=l&&o<=h&&cl>=l&&cl<=h&&cl<o&&((cl-l)/(h-l))<=.35&&v>=base*1.4?1:0);
 },0);
 const repeatedSelling=recentDistribution>=2;

 const failedBreak=high>Math.max(...bars.slice(-6,-1).map(b=>Number(b[2])))&&close<Math.max(...bars.slice(-6,-1).map(b=>Number(b[2])))&&closeLocation<=.35;
 const ins=r208Institution(c);
 const foreign=ins?.foreignNetShares,trust=ins?.trustNetShares;
 const validIns=!!ins&&ins.date===last[0];
 const institution=validIns?`同日外資 ${foreign>=0?'+':''}${Math.round(foreign/1000).toLocaleString('zh-TW')}張、投信 ${trust>=0?'+':''}${Math.round(trust/1000).toLocaleString('zh-TW')}張`:'待核對（缺少同日個股法人資料）';
 // Institutional totals are in SHARES; EOD volume can be shares or lots.
 // Only use a sell-pressure ratio when the bar unit is independently confirmed
 // against the stock's displayed lot count. Otherwise mark it unknown.
 const reportedLots=(c.lots===null||c.lots===undefined||c.lots==='')?NaN:Number(c.lots);
 const barIsLots=Number.isFinite(reportedLots)&&reportedLots>0&&Math.abs(vol/reportedLots-1)<.03;
 const barIsShares=Number.isFinite(reportedLots)&&reportedLots>0&&Math.abs(vol/(reportedLots*1000)-1)<.03;
 const volumeShares=(barIsLots!==barIsShares)?(barIsLots?vol*1000:vol):null;
 const institutionalSelling=validIns&&volumeShares!==null&&foreign<0&&trust<0&&(-foreign-trust)<=volumeShares&&(-foreign-trust)/volumeShares>=.08;
 const reasons=[];
 if(trendStrong)reasons.push('所選週期趨勢仍健康');
 else if(trendWeak)reasons.push('所選週期均線轉弱');
 else reasons.push('趨勢尚未確認');
 if(sellPressure)reasons.push('放量收低且收黑，留意賣壓');
 if(repeatedSelling)reasons.push('近5日多次放量收低，疑似連續賣壓（非主力出貨證據）');
 if(failedBreak)reasons.push('盤中突破前5日高點但收盤未站穩');
 if(riskBreak)reasons.push('收盤跌破前5日已知低點');
 if(institutionalSelling)reasons.push('同日外資與投信同步賣超且占量偏高');
 else if(validIns&&foreign<0&&trust<0)reasons.push('同日外資與投信同步賣超，但未確認達高占量警戒（量能單位未核對時不得視為低風險）');
 else if(!validIns)reasons.push('法人資料不足，不推定出貨');
 let status='震盪觀察',tone='warning';
 if(trendWeak&&(sellPressure||riskBreak||repeatedSelling)){status=mode==='long'&&!longWeak?'減碼警戒':'趨勢破壞';tone='danger'}
 else if((trendWeak||riskBreak)&&(sellPressure||failedBreak||institutionalSelling||repeatedSelling)){status='減碼警戒';tone='danger'}
 else if(trendStrong&&!sellPressure&&!riskBreak&&!repeatedSelling&&!institutionalSelling&&!failedBreak){status='多頭續抱';tone='success'}
 return {status,tone,reasons,repeatedSelling,recentDistribution,institution,trend:trendStrong?'偏多':trendWeak?'轉弱':'整理',volume:volumeRatio===null?'待核對':volumeRatio.toFixed(2)+'倍',institutionalSelling,validIns,close,mode};
}
// r95: pure, cost-aware EOD scenario calculator; no implied execution.
function r95PositionScenario(cost,qty,close,defense,sellPrice,sellQty){
 if(!Number.isFinite(cost)||cost<=0||!Number.isSafeInteger(qty)||qty<=0||!Number.isFinite(close)||close<=0)return null;
 const validDefense=Number.isFinite(defense)&&defense>0;
 const validSale=Number.isFinite(sellPrice)&&sellPrice>0&&Number.isSafeInteger(sellQty)&&sellQty>=0&&sellQty<=qty;
 return {breakEven:cost,breakEvenRise:(cost/close-1)*100,unrealized:(close-cost)*qty,
  defenseLoss:validDefense?(defense-close)*qty:null,
  defenseTotal:validDefense?(defense-cost)*qty:null,
  sellPnl:validSale?(sellPrice-cost)*sellQty:null,
  sellRemaining:validSale?qty-sellQty:null};
}
// r98: EOD-only consolidation direction and first-breakout qualification.
// Never backfill missing days, use future bars, or treat a candidate as an order.
function r98Structure(c){
 const bars=c?.bars;
 const unknown=(why)=>({status:'資料不足',direction:'待核對',first:'不可判定',reason:why,detail:'',ready:false});
 if(!Array.isArray(bars)||bars.length<65)return unknown('至少需要65根完整日K，才能核對20／60日結構');
 let prev='';
 for(const b of bars){
  if(!Array.isArray(b)||b.length<6||typeof b[0]!=='string'||!/\d{4}-\d{2}-\d{2}/.test(b[0])||b[0]<=prev)return unknown('日期缺漏或排序錯誤');
  prev=b[0];const o=Number(b[1]),h=Number(b[2]),l=Number(b[3]),cl=Number(b[4]),v=Number(b[5]);
  if(![o,h,l,cl,v].every(Number.isFinite)||l<=0||h<l||o<l||o>h||cl<l||cl>h||v<0)return unknown('日K價量欄位異常');
 }
 if(c.date&&String(c.date)!==bars.at(-1)[0])return unknown('候選資料與最後日K日期不一致');
 const close=+bars.at(-1)[4],open=+bars.at(-1)[1],high=+bars.at(-1)[2],low=+bars.at(-1)[3],vol=+bars.at(-1)[5];
 const closes=bars.map(b=>+b[4]);
 const avg=(arr)=>arr.reduce((a,b)=>a+b,0)/arr.length;
 const ma=(n,end=closes.length)=>avg(closes.slice(end-n,end));
 const m20=ma(20),m60=ma(60),m20past=ma(20,closes.length-10),m60past=ma(60,closes.length-5);
 const prior20=bars.slice(-21,-1),older20=bars.slice(-41,-21);
 const hi=a=>Math.max(...a.map(b=>+b[2])),lo=a=>Math.min(...a.map(b=>+b[3]));
 const top=hi(prior20),bottom=lo(prior20),olderTop=hi(older20),olderBottom=lo(older20);
 const slope20=(m20/m20past-1)*100,slope60=(m60/m60past-1)*100;
 const topShift=(top/olderTop-1)*100,bottomShift=(bottom/olderBottom-1)*100;
 const tolerance=1.5;
 const ascending=topShift>tolerance&&bottomShift>tolerance&&slope20>0;
 const descending=topShift< -tolerance&&bottomShift< -tolerance&&slope20<0;
 const direction=ascending?'上升整理':descending?'下降整理':Math.abs(topShift)<=tolerance&&Math.abs(bottomShift)<=tolerance?'橫向盤整':'混合整理';
 const vol20=avg(prior20.map(b=>+b[5])),vr=vol20>0?vol/vol20:null;
 const location=high>low?(close-low)/(high-low):.5;
 const breakout=close>top;
 const trendOK=close>m20&&m20>=m20past&&m60>=m60past;
 const volumeOK=vr!==null&&vr>=1.5;
 const closeOK=location>=.65&&close>=open;
 const first=breakout&&trendOK&&volumeOK&&closeOK?'第一根候選':breakout?'突破待確認':descending?'下降整理勿追':ascending?'上升整理待突破':'盤整等待';
 const caution=vr!==null&&vr>=1.5&&location<=.3&&close<open?'放量收低，需注意賣壓':'未見本模型定義的放量收低';
 return {status:'已計算',direction,first,ready:first==='第一根候選',reason:caution,
  detail:`20日區間 ${bottom.toFixed(2)}～${top.toFixed(2)} 元｜高點變化 ${topShift.toFixed(1)}%／低點變化 ${bottomShift.toFixed(1)}%｜20日均線10日斜率 ${slope20.toFixed(2)}%｜量比 ${vr===null?'待核對':vr.toFixed(2)+'倍'}`,
  top,bottom,close,volumeRatio:vr,topShift,bottomShift,slope20,slope60,breakout,trendOK,volumeOK,closeOK};
}

function r211HoldingDate(d){const t=typeof d==='string'?Date.parse(d+'T00:00:00Z'):NaN;return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===d;}
// r99: actionable after-close position decision. Uses completed EOD bars only.
// r101: EOD-only, multi-signal risk gating and rolling-high drawdown protection.
// Rolling highs are market observations, NOT a claim about the investor's entry-date peak.
function r101Quality(c,mode){
 const b=c?.bars;
 const needed=mode==='long'?65:mode==='medium'?45:26;
 if(!['short','medium','long'].includes(mode))return {ok:false,why:'持有週期待核對'};
 if(c?.possiblePriceAdjustment===true)return {ok:false,why:'公司行動價格待核對'};
 if(!Array.isArray(b)||b.length<needed)return {ok:false,why:`${mode==='long'?'長期':'目前'}判斷至少需要${needed}根完整日K`};
 let prev='';
 for(const x of b){
  if(!Array.isArray(x)||x.length<6||typeof x[0]!=='string'||!r211HoldingDate(x[0])||x[0]<=prev)return {ok:false,why:'日K日期缺漏、重複或排序錯誤'};
  prev=x[0];
  if(!r129ValidCandle(x))return {ok:false,why:'日K價格或成交量異常'};
 }
 if(String(c.date||'')!==prev)return {ok:false,why:'最新盤後日期與K線不一致'};
 const quote=numeric(c.close);
 if(!Number.isFinite(quote)||quote<=0||Math.abs(quote-Number(b.at(-1)[4]))>.001)return {ok:false,why:'股票收盤價與末根日K不一致'};
 const recent=b.slice(-66);
 if(recent.some((x,i)=>i>0&&Math.abs(Number(x[4])/Number(recent[i-1][4])-1)>.105))return {ok:false,why:'近65個交易日價格斷層待核對'};
 if(Number(b.at(-1)?.[5])<=0)return {ok:false,why:'最新交易日無成交量或可能停牌，暫停買賣價位判斷'};
 // r105: stale EOD snapshots must never be presented as tomorrow's instruction.
 // Allow long weekends/holidays; do not guess the exchange holiday calendar.
 const freshness=chaopanEodFreshness(prev);
 if(freshness.stale)return {ok:false,why:freshness.reason+'，請核對最新盤後資料後再提供明日操作建議'};
 return {ok:true};
}
function r99Action(c,cost,qty,mode='medium'){
 const quality=r101Quality(c,mode);
 const wait=(why,title='等待資料')=>({title,tone:'muted',note:why,condition:'資料不足，暫不給買賣方向',shares:0,valid:false});
 if(!Number.isFinite(cost)||cost<=0||!Number.isSafeInteger(qty)||qty<=0||qty>100000000)return wait('請輸入實際成本價與持股股數，再產生明日操作計畫','請先輸入持股');
 if(!quality.ok)return wait(quality.why);
 // R128: do not run decision engines on invalid or stale candles.
 const v=r82Plan(c),d=r92Decision(c,mode);
 if(!v.ok||d.status==='資料不足')return wait('盤後資料尚未完成核對');
 const bars=c.bars,close=v.close,valid=x=>Number.isFinite(x)&&x>0;
 const breakout=valid(v.resistance)?v.resistance:null;
 const defense=valid(v.defense)?v.defense:null;
 const rebound=valid(v.rebound)&&v.rebound>close?v.rebound:null;
 const recent=bars.slice(-Math.min(60,bars.length));
 const rollingHigh=Math.max(...recent.map(b=>Number(b[2])));
 const drawdown=(close/rollingHigh-1)*100;
 const prev20=bars.slice(-21,-1);
 const prior20Low=Math.min(...prev20.map(b=>Number(b[3])));
 const last=bars.at(-1),prior=bars.at(-2);
 const closeLocation=Number(last[2])>Number(last[3])?(close-Number(last[3]))/(Number(last[2])-Number(last[3])):.5;
 const breakdown20=close<prior20Low;
 const twoDayWeak=close<Number(prior[4])&&Number(prior[4])<Number(bars.at(-3)[4]);
 const volumeRatio=Number.parseFloat(d.volume);
 const distributionRisk=Number.isFinite(volumeRatio)&&volumeRatio>=1.4&&closeLocation<=.3&&close<Number(last[1]);
 const riskCount=Number(distributionRisk)+Number(breakdown20)+Number(twoDayWeak)+Number(d.institutionalSelling)+Number(!!d.repeatedSelling);
 // R120: failed-breakout risk is not the same as confirmed distribution.
 const failedBreakRisk=d.reasons?.some(x=>x.includes('盤中突破前5日高點但收盤未站穩'))===true;
 // r110: independent profit give-back alert must be considered BEFORE a bullish
 // headline. 60-session market highs are NOT the investor's actual holding peak.
 const profitable=close>cost;
 // A 60-session high may predate the user's entry; it must never be called realized or held profit.
 const heldPeak=Number(c?.holdingPeakPrice);
 const heldPeakVerified=c?.holdingPeakVerified===true&&Number.isFinite(heldPeak)&&heldPeak>=close&&heldPeak>=cost;
 const heldDrawdown=heldPeakVerified?(close/heldPeak-1)*100:null;
 const profitGiveback=heldPeakVerified&&heldPeak>=cost*1.08&&heldDrawdown<=-8&&riskCount>=1;
 const priorCloses=bars.map(b=>Number(b[4]));
 const mean=(arr)=>arr.reduce((s,x)=>s+x,0)/arr.length;
 const ma20=mean(priorCloses.slice(-20));
 const ma60=bars.length>=65?mean(priorCloses.slice(-60)):null;
 const ma60past=bars.length>=65?mean(priorCloses.slice(-65,-5)):null;
 const longTrendIntact=ma60!==null&&ma60past!==null&&close>=ma60&&ma60>=ma60past;
 const longTrendBroken=ma60!==null&&ma60past!==null&&close<ma60&&ma60<ma60past;
 const failedTrend=d.trend==='轉弱';
 const hardBreak=breakdown20&&(failedTrend||distributionRisk||d.institutionalSelling);
 // Full exit requires a broken long-term structure, or an unusually sharp
 // multi-evidence break. Short-term weakness alone is never a forced liquidation.
 const urgentBreak=breakdown20&&riskCount>=3&&close<ma20*.94&&close<Number(prior[4])*.94;
 const severe=hardBreak&&riskCount>=2&&failedTrend&&(longTrendBroken||urgentBreak);
 const reduce=!severe&&(
  d.status==='趨勢破壞'||d.status==='減碼警戒'||
  (drawdown<=-12&&riskCount>=2&&failedTrend)||
  (profitGiveback&&riskCount>=2)||
  (failedBreakRisk&&riskCount>=2&&failedTrend)
 );
 let title='盤整等待',tone='warning',fraction=0,trigger=null,condition='尚未達確認條件，等待盤後重新評估',note='暫不加碼';
 if(severe){
  title='止血出場';tone='danger';fraction=1;
  condition='中長期結構破壞並伴隨多項賣壓，下一交易日優先評估出場';
  note='隔日可能跳空，不能保證依收盤價成交';
 }else if(reduce){
  title=profitable?'獲利減碼':'風險減碼';tone='warning';
  // Preserve a core position when the long trend is intact; avoid turning
  // ordinary short-term retracements into 100% liquidation.
  fraction=longTrendIntact ? 0.25 : (riskCount>=2 ? 0.5 : 0.25);
  condition=longTrendIntact?'短線轉弱但長期趨勢未壞，先評估部分減碼':'多項風險訊號成立，規劃條件式減碼';
  note='反彈與跌破情境擇一執行，不是開盤直接賣';
 }else if(profitGiveback){
  // A past profit is NOT a currently realizable profit. Never label a loss as
  // a confirmed profit-taking sale.
  title=profitable?'獲利保護':'風險觀察';tone='warning';trigger=defense;
  condition='已核對持有期間高點回落，但減碼證據尚未確認';
  note='先觀察防守價；目前沒有確認減碼訊號';
 }else if(d.trend==='偏多'&&(d.status==='多頭續抱'||d.status==='突破續抱')){
  title='偏多續抱';tone='success';trigger=breakout;
  condition='所選週期維持偏多，尚未確認減碼訊號';note='突破後仍須檢查量價與收盤站穩';

 }
 // Prevent a 'bullish hold' headline when the selected timeframe is not bullish.
 if((title==='偏多續抱'||title==='加碼觀察')&&d.trend!=='偏多'){
  title='盤整等待';tone='warning';fraction=0;condition='所選週期尚未確認偏多';note='不加碼';
 }
 const shares=fraction===1?qty:fraction>0?Math.max(1,Math.floor(qty*fraction)):0;
 // r121: a missing conditional price must not erase a confirmed risk alert or share estimate.
 // Retain a risk-labelled decision, but explicitly suppress unverified execution levels.
 let levelsVerified=true;
 if(shares>0&&fraction<1){
  const levels=r103ConditionalLevels(c,{close,rebound,breakout});
  levelsVerified=!!(levels&&Number.isFinite(levels.defense)&&levels.defense>0&&levels.defense<close);
  if(!levelsVerified){title='減碼警戒｜價位待核對';tone='warning';condition='減碼風險訊號成立，但條件價格未通過驗證';note='股數僅為風險部位試算，暫不提供委託價格';}
 }
 const value=shares*close,pnl=shares*(close-cost);
 return {title,tone,trigger,stop:defense,rebound,breakout,shares,value,pnl,close,cost,condition,note,asOf:v.date,valid:true,profit:profitable,qty,rollingHigh,drawdown,riskCount,longTrendIntact,longTrendBroken,profitGiveback,heldPeakVerified,heldDrawdown,levelsVerified};
}
// r103: derive next-session conditional prices solely from completed EOD bars.
// Prices are alert thresholds, not executable orders or inferred intraday signals.
function r103ConditionalLevels(c,a){
 const b=c?.bars||[],close=Number(a?.close);
 if(b.length<26||!Number.isFinite(close)||close<=0)return null;
 const sample=b.slice(-26);
 if(c?.possiblePriceAdjustment===true||c?.date!==b.at(-1)?.[0]||Math.abs(close-Number(b.at(-1)?.[4]))>.001||sample.some((x,i)=>!r129ValidCandle(x)||!r211HoldingDate(x[0])||(i>0&&(x[0]<=sample[i-1][0]||Math.abs(Number(x[4])/Number(sample[i-1][4])-1)>.105))))return null;
 const last=b.at(-1),prior=b.slice(-21,-1);
 const highs=prior.map(x=>Number(x[2])),lows=prior.map(x=>Number(x[3]));
 if(!highs.concat(lows).every(x=>Number.isFinite(x)&&x>0))return null;
 const ranges=b.slice(-14).map((x,i,arr)=>{
  const h=Number(x[2]),l=Number(x[3]);
  const pc=i?Number(arr[i-1][4]):Number(b.at(-15)?.[4]);
  return Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc));
 });
 const atr=ranges.every(Number.isFinite)?ranges.reduce((x,y)=>x+y,0)/ranges.length:null;
 if(!Number.isFinite(atr)||atr<=0)return null;
 // Prefer confirmed local swing highs, not any arbitrary day's high a tick above close.
 const pivotHighs=[];
 for(let i=2;i<highs.length-2;i++)if(highs[i]>=highs[i-1]&&highs[i]>=highs[i+1]&&highs[i]>highs[i-2]&&highs[i]>highs[i+2])pivotHighs.push(highs[i]);
 const minGap=Math.max(.5*atr,close*.005);
 const resistanceCandidates=[...pivotHighs,Number(a.rebound),Number(a.breakout)].filter(x=>Number.isFinite(x)&&x>close+minGap);
 const resistance=resistanceCandidates.length?Math.min(...resistanceCandidates):null;
 const priorLow=Math.min(...b.slice(-6,-1).map(x=>Number(x[3])));
 const support=Math.min(...lows.slice(-10));
 const defense=r82Snap(Math.min(priorLow,close-.5*atr),'down',c);
 const exit=r82Snap(Math.min(support,defense-.75*atr),'down',c);
 const rebound=resistance?r82Snap(resistance,'up',c):null;
 const valid=x=>Number.isFinite(x)&&x>0;
 const pct=x=>valid(x)?((x/close-1)*100).toFixed(2):null;
 return {rebound:valid(rebound)?rebound:null,defense:valid(defense)&&defense<close?defense:null,exit:valid(exit)&&exit<defense?exit:null,atr,close,pct};
}
// r104: one EOD decision. Conditional alerts are not automatic orders.
// r109: one glance next-session plan. Every hypothetical sale scenario uses
// ITS OWN price to calculate proceeds/P&L; no default position or implied fill.
// R128: EOD-only candle event tracker. Observations, not proof of market manipulation.
function r129ValidCandle(x){
 if(!Array.isArray(x)||x.length<6||[1,2,3,4,5].some(k=>!(typeof x[k]==='number'||typeof x[k]==='string'&&x[k].trim()!=='')))return false;
 const [o,h,l,cl,v]=[1,2,3,4,5].map(k=>Number(x[k]));
 return [o,h,l,cl,v].every(Number.isFinite)&&l>0&&h>=l&&o>=l&&o<=h&&cl>=l&&cl<=h&&v>=0;
}
// R129: EOD-only historical event evidence; event ordering is preserved.
function r128CandleEvents(c){
 const b=c?.bars;
 if(!Array.isArray(b)||b.length<26)return {ok:false,reason:'至少需要26根日K'};
 const sample=b.slice(-26);
 if(c?.possiblePriceAdjustment===true)return {ok:false,reason:'公司行動價格待核對'};
 if(c?.date&&b.at(-1)?.[0]!==c.date)return {ok:false,reason:'日K與股票日期不一致'};
 if(sample.some((x,i)=>{const d=x?.[0],t=typeof d==='string'?Date.parse(d+'T00:00:00Z'):NaN;return !Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==d||(i>0&&d<=sample[i-1][0]);}))return {ok:false,reason:'日K日期異常或重複'};
 if(!sample.every(r129ValidCandle))return {ok:false,reason:'近26根日K價量資料不完整'};
 if(sample.some((x,i)=>i>0&&Math.abs(Number(x[4])/Number(sample[i-1][4])-1)>.105))return {ok:false,reason:'歷史價格斷層待核對'};
 const events=[];
 // Include a signal five *completed* trading bars ago, not just the latest six bars accidentally truncated.
 for(let i=Math.max(20,b.length-6);i<b.length;i++){
  const x=b[i];
  if(!r129ValidCandle(x))continue;
  const prior=b.slice(i-20,i);
  if(prior.length!==20||!prior.every(r129ValidCandle))continue;
  const prev=b[i-1];
  const o=Number(x[1]),h=Number(x[2]),l=Number(x[3]),cl=Number(x[4]),v=Number(x[5]);
  const span=h-l;if(span<=0)continue;
  const upper=(h-Math.max(o,cl))/span,lower=(Math.min(o,cl)-l)/span,body=Math.abs(cl-o)/span;
  const avg=prior.reduce((sum,y)=>sum+Number(y[5]),0)/20;
  const ratio=avg>0?v/avg:null;
  const types=[];
  if(body<=.1)types.push('十字線候選');
  if(upper>=.45&&body<=.35)types.push('長上影線候選');
  if(lower>=.45&&body<=.35)types.push('長下影線候選');
  if(r129ValidCandle(prev)){
   if(Number(prev[1])>Number(prev[4])&&cl>o&&o<=Number(prev[4])&&cl>=Number(prev[1]))types.push('多頭吞噬候選');
   if(Number(prev[4])>Number(prev[1])&&cl<o&&o>=Number(prev[4])&&cl<=Number(prev[1]))types.push('空頭吞噬候選');
  }
  // Contextual reversal candidates: same candle geometry has different meaning in a prior trend.
  const trendAt=j=>{const a=b.slice(j-8,j);if(a.length!==8||!a.every(r129ValidCandle))return 0;const p=a.slice(0,3).reduce((s,x)=>s+Number(x[4]),0)/3,q=a.slice(-3).reduce((s,x)=>s+Number(x[4]),0)/3;return q/p>=1.03?1:q/p<=.97?-1:0;};
  const trend=trendAt(i);
  if(body>=.12&&body<=.35&&lower>=.6&&upper<=.15)types.push(...(trend<0?['錘子線候選']:trend>0?['吊人線候選']:[]));
  if(body>=.12&&body<=.35&&upper>=.6&&lower<=.15)types.push(...(trend<0?['倒錘線候選']:trend>0?['射擊之星候選']:[]));
  const triple=b.slice(i-2,i+1);
  if(triple.length===3&&triple.every(r129ValidCandle)){
   const [a,m,z]=triple.map(x=>({o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4])}));
   const frac=x=>x.h>x.l?Math.abs(x.c-x.o)/(x.h-x.l):0,mid=(a.o+a.c)/2,lead=trendAt(i-2);
   if(lead<0&&a.c<a.o&&frac(a)>=.55&&frac(m)<=.35&&Math.max(m.o,m.c)<=a.c&&z.c>z.o&&frac(z)>=.55&&z.c>mid)types.push('晨星候選');
   if(lead>0&&a.c>a.o&&frac(a)>=.55&&frac(m)<=.35&&Math.min(m.o,m.c)>=a.c&&z.c<z.o&&frac(z)>=.55&&z.c<mid)types.push('夜星候選');
   const soldiers=dir=>[a,m,z].every(x=>dir*(x.c-x.o)>0&&frac(x)>=.55)&&dir*(m.c-a.c)>0&&dir*(z.c-m.c)>0&&[ [a,m],[m,z] ].every(([p,q])=>q.o>=Math.min(p.o,p.c)&&q.o<=Math.max(p.o,p.c));
   if(soldiers(1))types.push('紅三兵候選');if(soldiers(-1))types.push('黑三兵候選');
  }
  if(!types.length)continue;
  const later=b.slice(i+1,Math.min(b.length,i+6));
  const badAt=later.findIndex(y=>!r129ValidCandle(y));
  const verified=badAt<0?later:later.slice(0,badAt);
  let firstHigh=-1,firstLow=-1;
  verified.forEach((y,j)=>{if(firstHigh<0&&Number(y[4])>h)firstHigh=j+1;if(firstLow<0&&Number(y[4])<l)firstLow=j+1;});
  let status='尚未突破訊號高低點';
  if(badAt>=0)status='後續K棒資料異常，停止確認';
  else if(firstHigh>0&&firstLow>0)status=firstHigh<firstLow?'先突破高點、後跌破低點（突破失敗警戒）':'先跌破低點、後突破高點（反轉待確認）';
  else if(firstHigh>0)status='後續收盤突破訊號高點';
  else if(firstLow>0)status='後續收盤跌破訊號低點';
  else if(!verified.length)status='尚待後續交易日';
  for(const type of types)events.push({date:x[0],type,status,days:verified.length,volumeRatio:ratio,firstHigh,firstLow});
 }
 return {ok:true,events};
}
function r128CandleEventsHTML(c){
 const q=r101Quality(c,'short');
 if(!q.ok)return `<details><summary>近5日K棒事件｜資料待核對</summary><small>${esc(q.why)}</small></details>`;
 const tech=typeof r201TechnicalInput==='function'?r201TechnicalInput(c):null;
 if(tech?.reason)return `<details><summary>近5日K棒事件｜資料待核對</summary><small>${esc(tech.reason)}</small></details>`;
 const r=r128CandleEvents(tech?.bars?{...c,bars:tech.bars}:c);
 if(!r.ok)return `<details><summary>近5日K棒事件｜資料不足</summary><small>${esc(r.reason)}</small></details>`;
 const rows=r.events.length?r.events.map(e=>`<div style="padding:6px 0;border-top:1px solid #355466"><b>${esc(e.date)} ${esc(e.type)}</b>｜${esc(e.status)}<small style="display:block;opacity:.75">後續${e.days}個有效交易日｜當日量比 ${e.volumeRatio===null?'未知':e.volumeRatio.toFixed(2)+'倍'}</small></div>`).join(''):'<small>最近6根日K未出現本模組定義的候選型態。</small>';
 return `<details style="border-top:1px solid #355466;padding-top:8px"><summary>近5日K棒事件追蹤（觀察，不直接交易）</summary>${rows}<small>型態閾值尚未回測；仙人指路、洗盤與出貨不能由單根K棒證實。事件最多追蹤後續5個交易日。${tech?.adjusted?'ETF使用已知現金配息估算調整日K。':''}</small></details>`;
}

function r99ActionHTML(a,c){
 const money=n=>Number.isFinite(n)?Math.round(n).toLocaleString('zh-TW'):'—';
 const level=n=>Number.isFinite(n)&&n>0?price(n)+' 元':'待核對';
 const color={success:'#6ee7c1',warning:'#f5bd67',danger:'#ff9c9c',muted:'#aab7c4'}[a.tone]||'#aab7c4';
 const box=(headline,detail,highlight=false)=>`<div style="padding:9px 0;border-top:1px solid #355466"><b style="color:${highlight?color:'inherit'}">${headline}</b><div style="font-size:.92em">${detail}</div></div>`;
 const base=`<small style="opacity:.85">${esc(a.asOf||'資料待確認')} 盤後｜R135 明日操作</small>`;
 if(!a.valid)return `<div style="border:2px solid ${color};border-radius:12px;padding:13px;display:grid;gap:8px" aria-live="polite">${base}<strong style="font-size:1.65em;color:${color}">${esc(a.title)}</strong><div>${esc(a.note||'請先核對資料')}</div><small>未提供操作價格或股數。</small></div>`;
 const lv=a.levelsVerified===false?null:r103ConditionalLevels(c,a);
 const pct=n=>Number.isFinite(n)&&n>0?`（${(n/a.close-1)*100>=0?'+':''}${((n/a.close-1)*100).toFixed(2)}%）`:'';
 const scenario=(name,n,shares,remark)=>{
  if(!Number.isFinite(n)||n<=0)return box(name,'價位待核對；不能將收盤價當成委託價');
  const pl=(n-a.cost)*shares;
  const sale=Number.isSafeInteger(shares)&&shares>0?`${money(shares)}股｜回收約 ${money(n*shares)} 元｜損益約 ${pl>=0?'+':''}${money(pl)} 元`:'';
  if(name==='開高／反彈遇壓'&&n> a.close*1.1+1e-8)return box('多日反彈壓力',`<b>${level(n)} ${pct(n)}</b>｜超過一般隔日漲幅10%上限，不能作為明日開高賣價`);
  return box(name,`<b>${level(n)} ${pct(n)}</b><div>${sale}</div><small style="opacity:.75">${esc(remark)}</small>`);
 };
 const isExit=a.title==='止血出場',hasSale=a.shares>0;
 let body='';
 if(isExit){
  body=box('明日優先：評估出場 '+money(a.shares)+' 股','已由收盤資料確認結構轉弱；下一交易日依實際可成交價格處理，不用再等跌破更低價',true);
  body+=box('以昨收試算（不是委託價）',`回收約 ${money(a.close*a.shares)} 元｜損益約 ${a.pnl>=0?'+':''}${money(a.pnl)} 元`);
  if(Number.isFinite(a.breakout)&&a.breakout>a.close)body+=box('重新轉強觀察',`<b>${level(a.breakout)} ${pct(a.breakout)}</b>｜出場後如重新站穩，再重新評估進場，不代表當下買回`);
  body+='<small>若跳空開低，昨收與防守價都不保證成交；注意流動性及價格限制。</small>';
 }else if(hasSale){
  body=box(a.levelsVerified===false?'減碼警戒：試算 '+money(a.shares)+' 股':'明日優先：減碼 '+money(a.shares)+' 股',a.levelsVerified===false?'已有風險證據，但價格未核對，股數僅供風險評估，不能直接當作賣出指令':'盤後風險訊號已成立；反彈與跌破是同一筆減碼的替代執行情境，不可重複賣出',true);
  if(lv){
   body+=scenario('開高／反彈遇壓',lv.rebound,a.shares,'觸及壓力且轉弱時評估；強勢突破不要機械式賣出');
   body+=scenario('開低／跌破防守',lv.defense,a.shares,'跌破時優先控管風險；跳空下跌不能保證此價成交');
   if(Number.isFinite(lv.exit)&&lv.exit>0)body+=box('剩餘持股出場警戒',`<b>${level(lv.exit)} ${pct(lv.exit)}</b>｜結構再度失效時評估`);
  }else body+=box('減碼價尚未驗證','保留已確認風險警告，但不提供未核對的委託價格');
  body+='<small>若明日價格介於兩個價位之間，風險仍未解除；盤中是否轉強需人工確認，系統不會即時判定或自動下單。</small>';
 }else{
  body=box('明日優先：'+(a.title==='偏多續抱'?'續抱、不急著賣':a.title==='加碼觀察'?'觀察突破，尚未加碼':a.title==='獲利保護'?'守住獲利防線':a.title==='風險觀察'?'注意高點回落，暫不急賣':'等待，不新增部位'),esc(a.condition||a.note||''),true);
  if(lv){
   const up=Number.isFinite(a.breakout)&&a.breakout>a.close?a.breakout:null;
   if(up)body+=box(up>a.close*1.1+1e-8?'多日上攻關卡':'上攻關卡',`<b>${level(up)} ${pct(up)}</b>｜${up>a.close*1.1+1e-8?'高於一般隔日漲幅10%上限，屬多日目標':'收盤確認量價後才評估加碼或續抱'}`);
   if(Number.isFinite(lv.defense)&&lv.defense>0)body+=box('防守警戒',`<b>${level(lv.defense)} ${pct(lv.defense)}</b>｜跌破後重新評估，不等於現在應賣`);
  }
 }
 return `<div style="border:2px solid ${color};border-radius:12px;padding:13px;display:grid;gap:7px" aria-live="polite">
  ${base}<strong style="font-size:1.75em;color:${color}">${esc(a.title)}${hasSale?' '+money(a.shares)+' 股':''}</strong>
  ${body}
  ${r128CandleEventsHTML(c)}
  <small style="opacity:.7">僅依完成的盤後日K推演明日情境；未扣手續費、證交稅與滑價。操作價為觀察門檻，不是保證成交價。</small>
 </div>`;
}
// R163: minimal, stock-only EOD panel. This replaces the redundant gates page.
// The slope is TODAY's completed MA slope; the next-day touching threshold is conditional,
// not tomorrow's known MA value or an intraday executable stop order.
function r163CompactLevels(c){
 const b=Array.isArray(c?.bars)?c.bars:[],close=numeric(c?.close),last=b.at(-1),asOf=state.payload?.asOf;
 const ok=close!==null&&close>0&&b.length>=26&&c?.date===asOf&&last?.[0]===asOf&&
   Math.abs(Number(last[4])-close)<=.001&&!c.possiblePriceAdjustment&&
   b.slice(-26).every((x,i,a)=>r129ValidCandle(x)&&String(x[0]).match(/^\d{4}-\d\d-\d\d$/)&&
      (i===0||x[0]>a[i-1][0])&&
      (i===0||(Math.abs(Number(x[1])/Number(a[i-1][4])-1)<=.35&&Math.abs(Number(x[4])/Number(a[i-1][4])-1)<=.35)));
 const outer='border:1px solid #35677a;border-radius:12px;padding:8px;background:#071a29;max-width:100%;box-sizing:border-box';
 if(!ok)return `<div class="r163-compact-risk" style="${outer}" role="status"><b>均線／關鍵價位</b> <small style="color:#ffd084">盤後K線不足或待核對</small></div>`;
 const fmt=n=>Number.isFinite(n)&&n>0?price(n):'—';
 const delta=v=>Number.isFinite(v)&&v>0?`${v>=close?'+':''}${((v/close-1)*100).toFixed(2)}%`:'—';
 const sum=a=>a.reduce((n,x)=>n+Number(x[4]),0);
 const item=n=>{
   const today=sum(b.slice(-n))/n,prev=sum(b.slice(-n-1,-1))/n;
   const line=sum(b.slice(-(n-1)))/(n-1);
   const dir=today>prev+.000001?'↗':today<prev-.000001?'↘':'→';
   const color=dir==='↗'?'#55e0b4':dir==='↘'?'#ff858d':'#ffcf73';
   return `<div style="min-width:0;flex:1;text-align:center;border-right:1px solid #294b5d;padding:2px 4px"><b style="color:${color}">MA${n} ${dir}</b><div style="font-weight:700;font-size:1.05em">${fmt(today)}</div><small style="display:block;color:#b7d6e5;font-size:.73em">明日觸線 ${fmt(line)}</small><small style="color:#ffd36e;font-size:.75em">${delta(line)}</small></div>`;
 };
 const levels=r103ConditionalLevels(c,{close,rebound:null,breakout:null});
 const support=supportLines(c)[0]?.lower;
 const neckline=latestNeck(c);
 // Verified price levels from separate existing modules, never guessed from an example screenshot.
 const g=ChaopanGuidance.evaluate(c,deskEvidence(c),supportLines(c));
 const breakout=numeric(g?.breakoutLevel);
 const resistance=numeric(levels?.rebound);
 const good=x=>{const v=numeric(x);return v!==null&&v>0&&Number.isFinite(v)?v:null};
 const keys=[['支撐',good(support),'#48e5ab'],['頸線',good(neckline),'#ffe06c'],
   ['壓力',good(resistance),'#ffaa55'],['突破',good(breakout),'#ff787e']];
 const levelEl=keys.map(([label,v,color],i)=>`<div style="flex:1;min-width:0;text-align:center;padding:2px 3px${i<3?';border-right:1px solid #294b5d':''}"><small style="color:${color}">${label}</small><b style="display:block;font-size:.96em">${v===null?'待核對':fmt(v)}</b><small style="font-size:.73em;color:#b7d6e5">${v===null?'—':delta(v)}</small></div>`).join('');
 return `<div class="r163-compact-risk" style="${outer}" aria-label="隔日均線預警與關鍵價位，非即時指令">
  <div style="display:flex;align-items:stretch;gap:2px;overflow:hidden">${[5,10,20].map(item).join('')}</div>
  <div style="display:flex;height:5px;border-radius:6px;overflow:hidden;margin:5px 3px 7px"><i style="flex:1;background:#35d8a3"></i><i style="flex:1;background:#f2dd5d"></i><i style="flex:1;background:#f1a34b"></i><i style="flex:1;background:#ea607b"></i></div>
  <div style="display:flex;gap:2px;align-items:stretch">${levelEl}</div>
  <small style="color:#879fae;font-size:.7em">今日均線 ↗↘｜明日觸線為收盤條件價，缺資料顯示待核對</small>
 </div>`;
}
// R164: compact mobile-first replacement for the legacy text-only EOD card.
// Market prices and indicators are computed strictly from completed as-of daily bars.
const R164_CSS = `
/* R165: single image-reference dashboard. All legacy decision engines are preserved. */
.r164-board{background:linear-gradient(156deg,#001a2b,#061b2b 55%,#031625);border:1.5px solid #12a0c3;border-radius:18px;padding:10px;display:flex;flex-direction:column;gap:8px;color:#eff8fd;min-width:0;box-sizing:border-box;font-variant-numeric:tabular-nums;box-shadow:inset 0 0 22px #0086a318}
.r164-board *, .r164-board *:before,.r164-board *:after{box-sizing:border-box}
.r164-board .r164-h{display:flex;justify-content:space-between;align-items:center;gap:4px;font-weight:800;font-size:14px}
.r164-board .r164-date{font-size:10px;color:#9ebaca;white-space:nowrap}
.r164-panel{background:linear-gradient(145deg,#031827,#051e30);border:1.3px solid #3694b3;border-radius:13px;padding:9px;min-width:0;box-shadow:inset 0 0 12px #079bc010}
.r164-controls{display:grid;grid-template-columns:1fr 1fr;gap:7px;align-items:end}
.r164-board label{display:block;font-size:11px;color:#c0d8e4;min-width:0}
.r164-board select,.r164-board input{display:block;margin-top:3px;width:100%;max-width:100%;border:1.3px solid #5da5c2;background:#031c2b;border-radius:8px;color:#fff;padding:8px 7px;font:750 13px system-ui;min-height:35px}
.r164-board input:focus,.r164-board select:focus{outline:2px solid #3dd9be;outline-offset:1px}
.r164-headblock{display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(150deg,#054d58,#062b48);border:1.5px solid #33afd5;border-radius:13px;min-width:56px;flex:0 0 56px;padding:7px 3px;text-align:center;color:#fff;font-size:13px;font-weight:900;line-height:1.5;text-shadow:0 0 9px #4cd9ff42}
.r164-strip{display:flex;align-items:stretch;gap:7px;min-width:0}
.r164-strip-data{min-width:0;flex:1}
.r164-mas{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;text-align:center}
.r164-ma-item{min-width:0;padding:2px 3px;border-right:1px solid #3e7284;display:flex;align-items:center;flex-direction:column;justify-content:space-between;gap:2px}
.r164-ma-item:last-child{border-right:0}
.r164-ma-item.r167-index-open{appearance:none;border:0;border-left:1px solid #3e7284;border-radius:7px;background:linear-gradient(160deg,#07394c,#06243b);color:inherit;font:inherit;cursor:pointer;min-width:0;text-align:center;padding:2px 3px}
.r164-ma-item.r167-index-open:focus-visible{outline:2px solid #42d9c0;outline-offset:1px}
.r167-index-hint{color:#83e2fa!important;font-weight:750}
#r167-index-chart{scroll-margin-top:12px}

.r164-ma-item b{font-size:12px;white-space:nowrap}
.r164-ma-item strong{font-size:15px;color:#f3f8fa;white-space:nowrap;letter-spacing:-.3px}
.r164-ma-item small{font-size:10px;color:#afcfdd;line-height:1.25}
.r164-track{width:90%;height:6px;border-radius:9px;background:#3a5260;overflow:hidden;margin-top:5px}
.r164-fill{display:block;height:100%;border-radius:9px;background:var(--accent,#f9ca48);width:var(--length,40%)}
.r164-market-label{font-size:11px;padding:4px 2px;border-radius:6px;background:#15343b;color:#f7c75d;line-height:1.2;max-width:100%}
.r164-status{font-size:10px;color:#d8b780;text-align:right;margin-top:4px}
.r164-position{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:8px}
.r164-position .r164-inputs{display:grid;grid-template-columns:1fr 1fr;gap:7px;min-width:0}
.r164-position .r164-pnlbox{border-left:1px solid #3a7691;padding:2px 4px 2px 8px;display:flex;flex-direction:column;justify-content:center;gap:1px;min-width:0}
.r164-pnlbox strong{font-size:17px;white-space:normal;overflow-wrap:anywhere;line-height:1.25}
.r164-pnlbox small{font-size:10px}
/* Taiwan market: rising RED, falling GREEN; severity bar is independent. */
.r164-positive{color:#ff6976!important}.r164-negative{color:#42e697!important}.r164-neutral{color:#e4edf5!important}
.r164-actionline{display:flex;flex-wrap:wrap;align-items:center;gap:4px;justify-content:space-between}
.r164-actionline strong{font-size:16px;color:#ffcf65}
.r164-actionline .r164-flag{border-radius:8px;background:#173746;color:#ffcf75;border:1px solid #806a37;padding:3px 5px;font-size:10px}
.r164-scenarios{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:5px}
.r164-scenario{border:1.5px solid #d45b67;border-radius:10px;padding:7px;min-width:0;background:linear-gradient(140deg,#35131d,#051c28);display:flex;flex-direction:column;gap:1px}
.r164-scenario.down{border-color:#31b884;background:linear-gradient(140deg,#0a3128,#051c28)}
.r164-scenario b{font-size:11px}.r164-scenario strong{font-size:15px;overflow-wrap:anywhere}
.r164-scenario small{font-size:10px;color:#b6ccd8}
.r164-band-items,.r164-key-items{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px;text-align:center}
.r164-band-items>div,.r164-key-items>div{min-width:0;border-right:1px solid #355a70;padding:0 2px}
.r164-band-items>div:last-child,.r164-key-items>div:last-child{border:0}
.r164-band-items small,.r164-key-items small{display:block;font-size:10px;color:#c2dae5;line-height:1.25}
.r164-band-items b,.r164-key-items b{display:block;font-size:14px;font-weight:800;overflow-wrap:anywhere;line-height:1.3}
.r164-band-items em,.r164-key-items em{font-size:10px;font-style:normal;line-height:1.3}
.r164-gradient{height:9px;border-radius:20px;background:linear-gradient(90deg,#23e5ad 0%,#bcf449 27%,#ffe85d 50%,#ff9d30 73%,#fa5473 100%);display:flex;justify-content:space-around;align-items:center;margin:14px 7px 6px}
.r164-gradient i{width:17px;height:17px;box-shadow:0 0 5px #24769f;border:2px solid #d2f1ef;border-radius:50%;background:var(--dot,#eeca3d)}
.r164-gradient.is-missing{opacity:.28;filter:grayscale(1)}
.r164-mini-note{font-size:10px;color:#a7bdc9;line-height:1.4}
.r164-board.r164-protect-mode .r164-defense,.r164-board.r164-protect-mode .r164-pnlbox{border-color:#eac761;box-shadow:inset 0 0 0 1px #987a3550}
.r164-board:not(.r164-protect-mode) .r164-ma-panel{box-shadow:inset 0 0 0 1px rgba(60,218,194,.2)}
.r164-price-limit{padding:7px;font-size:10px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:5px;border:1px solid #3d7e97;border-radius:12px;background:#0b2536}
.r164-detail-heading{display:flex!important;justify-content:space-between;align-items:start;gap:9px;flex-wrap:wrap;background:transparent!important}
.r164-heading-id{font-size:24px;font-weight:800;line-height:1.25}
.r164-heading-id small{display:block;font-size:11px;letter-spacing:.12em;color:#4ee8db;margin-bottom:5px}
.r164-heading-quote{text-align:right}.r164-heading-quote strong{font-size:25px}.r164-heading-quote small{display:block;font-size:14px}
.r41-detail-tabs.r164-detail-tabs{display:flex;gap:6px;padding:4px;border:1px solid #4b8ba7;border-radius:13px;background:#082437;margin:10px 0 7px}
.r41-detail-tabs.r164-detail-tabs button{flex:1;min-width:0;border:0;background:transparent;color:#b7ccda;font-size:13px;font-weight:750;border-radius:9px;padding:10px 2px}
.r41-detail-tabs.r164-detail-tabs button.active{background:#42d9c0;color:#042333}
.r165-brief{display:flex;flex-direction:column;gap:8px}
.r165-brief-head{display:flex;justify-content:space-between;gap:6px;align-items:center}
.r165-brief-signals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.r165-brief-signals>div{padding:9px 4px;text-align:center;border:1px solid #2c7691;border-radius:9px;background:#061c2e}
.r165-brief-signals b{display:block;font-size:12px}.r165-brief-signals small{font-size:10px}
@media(max-width:375px){.r164-board{padding:6px;gap:6px}.r164-panel{padding:7px}.r164-headblock{min-width:46px;flex-basis:46px;font-size:11px}.r164-ma-item strong{font-size:12px}.r164-ma-item small{font-size:9px}.r164-board select,.r164-board input{font-size:12px}.r164-band-items b,.r164-key-items b{font-size:12px}.r164-actionline strong{font-size:14px}.r164-pnlbox strong{font-size:14px}}

/* R169: preserve exact visual modules when next-session prices are withheld. */
.r169-risk-strip{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:5px;min-width:0;padding:3px 0 6px}
.r169-risk-title{font-size:clamp(14px,3.6vw,19px);font-weight:900;color:#f5cb68;line-height:1.25;min-width:0}
.r169-risk-sub{font-size:10px;color:#dcc187;white-space:normal}
.r169-missing-badge{font-size:10px;color:#f9cd79;border:1px solid #796637;padding:3px 6px;border-radius:8px;background:#3a301b55}
.r169-info{padding:5px 0 0;font-size:11px;line-height:1.4;color:#fad48a}
.r169-static-date{font-size:10px;color:#b9cbd5;margin-top:5px}
.r164-ma-item strong{font-size:clamp(10px,2.55vw,15px);letter-spacing:-.6px;white-space:nowrap;overflow:visible;overflow-wrap:normal}
.r164-ma-item.r167-index-open strong{font-size:clamp(10px,2.6vw,14px)!important}
.r164-band-items b,.r164-key-items b{font-size:clamp(9px,2.55vw,13px);white-space:nowrap;letter-spacing:-.5px;overflow-wrap:normal}
.r164-band-items small,.r164-key-items small{font-size:clamp(9px,2.45vw,10px)}
.r164-band-items em,.r164-key-items em{display:block;font-size:clamp(9px,2.4vw,10px);white-space:nowrap}
.r164-action-preview .r164-actionline{display:none}
.r164-action-preview .r164-scenarios{margin-top:0}
.r164-board .r164-h{font-size:clamp(13px,3.4vw,16px)}
.r164-board .r164-date{font-size:10px}
.r169-industry{display:inline-block;vertical-align:middle;border:1px solid #77b9c8;border-radius:7px;padding:1px 6px;font-size:11px;color:#d1e6ec;margin-left:5px;font-weight:600}
@media(max-width:360px){.r164-strip{gap:4px}.r164-headblock{flex-basis:42px;min-width:42px}.r164-ma-item{padding:2px 1px}.r164-board .r164-date{font-size:9px}.r169-risk-title{font-size:14px}}

`;
const R174_CSS = `
.r174-auto-panel{display:flex;flex-direction:column;justify-content:center;padding:5px 10px;border:1px solid #3cb8c5;border-radius:8px;min-width:0;background:#052d3c}.r174-auto-panel span{font-size:11px;color:#a1c6d5}.r174-auto-panel strong{font-size:14px;color:#48e0c6}
.r174-small-title{display:flex;align-items:center;justify-content:space-between;gap:7px;margin-bottom:7px}.r174-small-title strong{font-size:14px}.r174-small-title span,.r174-small-title small{font-size:11px;color:#aed4e1}
.r174-index-compare .r174-index-rows{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px}.r174-index-rows>div{display:flex;flex-direction:column;gap:2px;align-items:center;border-right:1px solid #36677d;min-width:0}.r174-index-rows>div:last-child{border-right:0}.r174-index-rows span{font-size:11px;color:#dcecf3}.r174-index-rows b{font-size:13px;color:#e8faf9}.r174-index-rows small{font-size:10px;text-align:center;line-height:1.3;overflow-wrap:anywhere}.r174-source,.r174-no-feed{display:block;font-size:10px;line-height:1.4;color:#a5bdcd;margin-top:5px}.r174-muted-placeholder{padding:15px;color:#eccb8f;text-align:center;border:1px dashed #4e7589;border-radius:9px}
.r174-support-alert{border:2px solid #d1a941;background:linear-gradient(150deg,#041929,#112420 62%,#1b1b17)}.r174-warning-cells{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;text-align:center}.r174-warning-cells>div{border:1px solid #36788e;border-radius:8px;padding:7px 3px;min-width:0;background:#09263a}.r174-warning-cells>div:nth-child(2){border-color:#2cc897;background:#062c25}.r174-warning-cells>div:nth-child(3){border-color:#e89644;background:#291f15}.r174-warning-cells>div:nth-child(4){border-color:#dd5974;background:#28171f}.r174-warning-cells small{display:block;font-size:10px;color:#abc7d4}.r174-warning-cells b{display:block;font-size:clamp(11px,2.8vw,15px);overflow-wrap:anywhere;color:#edf5fc}.r174-warning-cells>div:nth-child(2) b{color:#4ee6ac}.r174-warning-cells>div:nth-child(3) b{color:#ffc16e}.r174-warning-cells>div:nth-child(4) b{color:#ff8d9e}.r174-distance{text-align:center;margin:7px 0;font-size:12px}.r174-distance b{color:#f6d079}.r174-warning-bar{height:12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;overflow:hidden;border-radius:20px;margin-top:9px}.r174-warning-bar i:nth-child(1){background:#26df9a}.r174-warning-bar i:nth-child(2){background:#f6df4e}.r174-warning-bar i:nth-child(3){background:#ff9b44}.r174-warning-bar i:nth-child(4){background:#fc5d83}.r174-band-legend{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;font-size:9px;text-align:center;margin-top:4px;color:#bad4dc}
.r174-index-extras{display:grid;gap:9px;margin:11px 0 0}.r174-structure-cols,.r174-ma-cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.r174-data-col{display:flex;flex-direction:column;min-width:0;align-items:center;gap:3px;text-align:center}.r174-data-col strong{font-size:clamp(11px,2.6vw,15px)}.r174-data-col em{font-size:10px;font-style:normal;overflow-wrap:anywhere}.r174-data-col small{font-size:10px}.r174-ma-cols{grid-template-columns:repeat(3,minmax(0,1fr));text-align:center}.r174-ma-cols>div{display:flex;flex-direction:column;gap:3px;min-width:0}.r174-ma-cols b{font-size:13px;color:#eef6fb}.r174-ma-cols em{font-size:10px;overflow-wrap:anywhere;font-style:normal}.r174-research h3{font-size:17px;margin:0 0 9px;color:#e6f5f9}.r174-institution-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:10px 0}.r174-verified-metric{border:1px solid #3c7087;border-radius:10px;text-align:center;padding:8px 4px;display:flex;flex-direction:column;gap:3px;min-width:0}.r174-verified-metric small{font-size:10px;color:#afd0df}.r174-verified-metric b{font-size:clamp(12px,3vw,16px);overflow-wrap:anywhere}.r174-research .visual-tech{border-radius:10px;overflow:hidden}
.r174-five-tabs{overflow-x:auto;scrollbar-width:none;display:flex!important;gap:3px!important;padding:4px!important}.r174-five-tabs button{flex:0 0 auto!important;white-space:nowrap!important;padding:9px 8px!important;font-size:clamp(10px,2.4vw,13px)!important}.r174-index-extras .r174-warning-cells b{font-size:12px}.r174-index-extras .r174-index-structure{border-color:#2baaca}.r174-index-extras .r174-index-ma{border-color:#238da4}
@media(max-width:375px){.r174-warning-cells{gap:3px}.r174-warning-cells>div{padding:6px 2px}.r174-warning-cells b{font-size:11px}.r174-index-rows b{font-size:11px}.r174-index-rows small{font-size:9px}.r174-structure-cols{gap:2px}.r174-data-col strong{font-size:11px}.r174-data-col em{font-size:9px}}
`;

/* R176: selected approved design is the layout contract; never turn research into pages. */
const R176_CSS = `
#modalContent .r176-one-page{display:flex;flex-direction:column;gap:8px;min-width:0}
#modalContent .r176-one-page .r164-board{margin:0}
#modalContent .r176-one-page .r164-controls{display:none}
#modalContent .r176-one-page .r176-main-banner{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#acd6df;font-size:11px}
#modalContent .r176-one-page .r176-main-banner strong{color:#52e1c5;font-size:12px}
#modalContent .r176-one-page .r176-top-position{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(0,.85fr);gap:6px;align-items:stretch}
#modalContent .r176-one-page .r176-top-position .r164-position{margin:0}
#modalContent .r176-one-page .r176-strategy{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5px;gap:3px;background:#052b29;border:1.5px solid #30deab;border-radius:11px;text-align:center}
#modalContent .r176-one-page .r176-strategy small{font-size:10px;color:#b4cfda}
#modalContent .r176-one-page .r176-strategy strong{font-size:12px;color:#45dba4}
#modalContent .r176-one-page .r176-risk-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,.95fr);gap:7px;align-items:stretch}
#modalContent .r176-one-page .r176-risk-layout>.r164-panel{height:100%}
#modalContent .r176-one-page .r176-advice{display:flex;flex-direction:column;gap:6px}
#modalContent .r176-one-page .r176-advice h3{font-size:12px;margin:0;color:#d5f8ff}
#modalContent .r176-one-page .r176-advice strong{font-size:11px;color:#f5c957;background:#33201980;border:1px solid #d98250;border-radius:7px;padding:6px 4px;text-align:center}
#modalContent .r176-one-page .r176-advice p{margin:0;color:#c5dbe5;line-height:1.4;font-size:10px}
#modalContent .r176-one-page .r176-compact-compare .r175-compare-daily{margin-bottom:4px;padding:5px}
#modalContent .r176-one-page .r176-compact-compare .r175-compare-row{grid-template-columns:36px minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,.85fr);gap:2px;padding:4px 0}
#modalContent .r176-one-page .r176-compact-compare .r175-column-head{grid-template-columns:36px minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,.85fr);gap:2px}
#modalContent .r176-one-page .r176-compact-compare .r175-compare-cell{gap:0}
#modalContent .r176-one-page .r176-compact-compare .r175-ma-result span{font-size:8px}
#modalContent .r176-one-page .r176-compact-compare .r174-source{margin:4px 0 0}
#modalContent .r176-one-page .r176-slim-panels{display:grid;gap:6px}
#modalContent .r176-one-page .r176-research-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
#modalContent .r176-research-mini{border:1.4px solid #23bfe1;border-radius:12px;background:linear-gradient(160deg,#032333,#061522);padding:7px 5px;display:flex;flex-direction:column;gap:5px;min-width:0;color:#e3faff}
#modalContent .r176-research-mini h3{font-size:11px;margin:0 0 3px;white-space:nowrap;color:#f5ffff;line-height:1.2}
#modalContent .r176-research-mini small{font-size:9px;color:#abc4d0;line-height:1.25;word-break:break-word}
#modalContent .r176-research-mini b{font-size:10px}
#modalContent .r176-research-mini .r176-metric-row{display:flex;align-items:center;justify-content:space-between;gap:3px;border-top:1px solid #144a5b;padding-top:4px}
#modalContent .r176-research-mini .r176-mini-bar{height:6px;width:100%;background:#294651;border-radius:10px;overflow:hidden;margin-top:2px}
#modalContent .r176-research-mini .r176-mini-bar>i{height:100%;display:block;background:var(--mini-color,#3ee2ab);width:var(--mini-pct,10%);border-radius:10px}
#modalContent .r176-research-mini button{border:1px solid #4f91a1;border-radius:6px;background:#072e3a;color:#83ecf8;font:700 10px system-ui;padding:4px;cursor:pointer}
#modalContent .r176-research-mini svg{width:100%;height:auto;display:block;min-height:63px;max-height:92px}
#modalContent .r176-full-chart{border:1px solid #246e83;border-radius:12px;background:#071d2b;padding:7px}
#modalContent .r176-full-chart>summary{cursor:pointer;font-size:12px;color:#82e5f3;font-weight:700}
#modalContent .r176-full-chart>.chart-area{margin:8px 0 0}
#modalContent .r176-one-page .r164-ma-panel{padding:6px 7px}
#modalContent .r176-one-page .r164-headblock{font-size:11px;min-width:47px;flex-basis:47px}
#modalContent .r176-one-page .r164-ma-item b{font-size:11px}
#modalContent .r176-one-page .r164-ma-item strong{font-size:clamp(9px,2.4vw,14px)}
#modalContent .r176-one-page .r164-ma-item small{font-size:9px}
#modalContent .r176-one-page .r164-strip-data .r164-gradient{margin-top:11px}
#modalContent .r176-one-page .r174-support-alert{padding:7px}
#modalContent .r176-one-page .r174-warning-cells>div{padding:4px 1px}
#modalContent .r176-one-page .r174-band-legend{font-size:8px}
#modalContent .r176-one-page .r164-position{padding:6px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
#modalContent .r176-one-page .r164-position .r164-inputs{gap:3px}
#modalContent .r176-one-page .r164-position .r164-inputs input{font-size:12px;padding:5px 4px;min-height:29px}
#modalContent .r176-one-page .r164-position .r164-pnlbox{padding-left:5px}
#modalContent .r176-one-page .r164-position .r164-pnlbox strong{font-size:13px}
#modalContent .r176-one-page .r164-position .r164-pnlbox small{font-size:9px}
#modalContent .r176-one-page .r176-banner-date{font-size:9px;color:#8cbccc}
#modalContent .r176-one-page .r176-bottom-caption{font-size:9px;color:#a9b9be;text-align:center}
#modalContent .r176-one-page .r164-board .r164-h{display:none}
@media(min-width:630px){#modalContent .r176-one-page .r176-research-grid{gap:10px}#modalContent .r176-research-mini h3{font-size:15px}#modalContent .r176-research-mini b{font-size:13px}#modalContent .r176-one-page .r176-top-position{gap:10px}#modalContent .r176-one-page .r164-position .r164-pnlbox strong{font-size:19px}}
@media(max-width:375px){#modalContent .r176-one-page .r176-risk-layout{grid-template-columns:1fr}#modalContent .r176-research-mini h3{font-size:10px}#modalContent .r176-one-page .r176-top-position{grid-template-columns:minmax(0,1fr) minmax(0,.64fr)}#modalContent .r176-one-page .r176-top-position .r164-position{grid-column:1/-1}#modalContent .r176-one-page .r176-strategy{min-height:38px}}
`;
const R194_COST_CSS = `
#modalContent .r194-cost-card{box-sizing:border-box;border:1.5px solid #eac65f;border-radius:13px;padding:9px;background:linear-gradient(150deg,#062b39,#071d2a);color:#e2f6fc;min-width:0;box-shadow:inset 0 0 0 1px #b8983420}
#modalContent .r194-cost-head{display:flex;align-items:center;justify-content:space-between;gap:5px;flex-wrap:wrap;margin-bottom:4px}
#modalContent .r194-cost-head strong{font-size:14px;color:#f6d36b}
#modalContent .r194-cell[data-r194-ma="5"]{border-color:#36dfa3}#modalContent .r194-cell[data-r194-ma="5"] .r194-cell-title{color:#36dfa3}
#modalContent .r194-cell[data-r194-ma="10"]{border-color:#eaca55}#modalContent .r194-cell[data-r194-ma="10"] .r194-cell-title{color:#eaca55}
#modalContent .r194-cell[data-r194-ma="20"]{border-color:#f8a251}#modalContent .r194-cell[data-r194-ma="20"] .r194-cell-title{color:#f8a251}
#modalContent .r194-extra{border-top:1px solid #b79b5260;margin-top:7px;padding-top:5px;font-size:11px;color:#f5d577}
#modalContent .r194-extra>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:4px}
#modalContent .r194-extra-item{display:flex;flex-wrap:wrap;gap:3px 6px;align-items:baseline;min-width:0;color:#d6ebf5;overflow-wrap:anywhere}
#modalContent .r194-extra-item small{width:100%;font-size:10px}#modalContent .r194-extra-item .r194-value{font-size:11px}
#modalContent .r194-relative{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 7px;padding:7px;margin:7px 0;border:1px solid #eac65f;border-radius:9px;background:#09232f}
#modalContent .r194-relative>div:first-child{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px}#modalContent .r194-relative small{font-size:10px;color:#e2d1a1}#modalContent .r194-relative strong{font-size:14px}
#modalContent .r194-dots{display:flex;align-items:center;gap:3px;font-size:10px;color:#cfebf5}#modalContent .r194-dots i{width:9px;height:9px;border:1px solid #7793a1;border-radius:50%;background:#263f4c}#modalContent .r194-dots i.lit{background:#43dcb2;border-color:#43dcb2}
#modalContent .r194-relative-note{grid-column:1/-1;line-height:1.4;overflow-wrap:anywhere}
#modalContent .r194-peak{display:flex;flex-wrap:wrap;align-items:center;gap:5px 8px;border:1px solid #43849a;border-radius:9px;padding:5px 7px;background:#092a38;font-size:11px;color:#c0d8e5}
#modalContent .r194-peak label{display:flex;gap:5px;align-items:center;white-space:nowrap}#modalContent .r194-peak-input{width:75px;min-width:0;color:#edfaff;border:1px solid #4a90a5;border-radius:5px;background:#081e2a;padding:4px;font:inherit;box-sizing:border-box}#modalContent .r194-peak-values{display:flex;flex-wrap:wrap;gap:4px 8px;flex:1;min-width:120px}#modalContent .r194-peak-values small{font-size:10px}
#modalContent .r194-cost-head small,#modalContent .r194-cost-note{font-size:10px;line-height:1.4;color:#b4cbd7;overflow-wrap:anywhere}
#modalContent .r194-cost-card button{font-family:inherit;cursor:pointer;min-width:0;box-sizing:border-box}
#modalContent .r194-cost-edit,#modalContent .r194-basis button{border:1px solid #3c8299;border-radius:7px;background:#0a2c3c;color:#bce9f2;font-size:10px;font-weight:700;padding:5px 7px}
#modalContent .r194-basis{display:flex;gap:5px;margin:7px 0;align-items:center;flex-wrap:wrap}
#modalContent .r194-basis button[aria-pressed=true]{border-color:#57e6e0;background:#13444d;color:#dbffff}
#modalContent .r194-part{display:flex;flex-direction:column;gap:2px;min-width:0;border-top:1px solid #35748880;padding-top:5px}#modalContent .r194-body{margin-top:7px}#modalContent .r194-below .r194-value{margin:0 4px}#modalContent .r194-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
#modalContent .r194-cell{width:100%;text-align:left;padding:7px 5px;border:1px solid #35a5bd;border-radius:9px;background:linear-gradient(155deg,#092f3b,#071e2d);color:#e4faff;display:flex;flex-direction:column;gap:4px;overflow-wrap:anywhere}
#modalContent .r194-cell[aria-pressed=true]{border-color:#59d9e7;box-shadow:inset 0 0 0 1px #3db0c57a}
#modalContent .r194-cell-title{font-size:14px;color:#a7ecf4;font-weight:800;line-height:1.2}
#modalContent .r194-cell small{font-size:10px;color:#c4d7e2;line-height:1.25}
#modalContent .r194-value{font-size:13px;font-weight:800;line-height:1.25;color:#effaff;font-variant-numeric:tabular-nums}
#modalContent .r194-field{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:2px;min-width:0}
#modalContent .r194-role{font-size:10px;color:#f5ce73;line-height:1.3}
#modalContent .r194-summary{margin-top:7px;border:1px solid #d87989;border-radius:9px;padding:7px 5px;text-align:center;background:#3b2437;color:#e9f8ff;font-size:11px;line-height:1.5;overflow-wrap:anywhere}
#modalContent .r194-summary b{font-size:12px}
#modalContent .r194-below{display:block;border-top:1px solid #58708070;padding-top:3px;margin-top:3px;color:#d6e9f3}
#modalContent .r194-cost-note{display:block;margin-top:5px}
@media(max-width:375px){#modalContent .r194-cost-card{padding:6px}#modalContent .r194-cell{padding:5px 3px}#modalContent .r194-cell small,#modalContent .r194-role{font-size:9px}#modalContent .r194-value{font-size:12px}#modalContent .r194-cost-head strong{font-size:12px}}
`;

const R203_CSS=`
#modalContent .r176-one-page{gap:5px}
#modalContent .r176-one-page .r164-board{gap:5px;padding:6px}
#modalContent .r176-one-page .r164-board .r164-panel{padding:6px;min-height:0}
#modalContent .r176-one-page .r176-main-banner{gap:4px;line-height:1.25}
#modalContent .r176-one-page .r176-banner-date select{min-height:30px;padding:4px 7px;margin-top:2px}
#modalContent .r176-one-page .r176-top-position{gap:4px;grid-template-columns:minmax(0,2.5fr) minmax(0,1fr)}
#modalContent .r176-one-page .r176-top-position .r164-position{grid-column:auto;gap:4px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
#modalContent .r176-one-page .r164-position .r164-inputs{gap:3px}
#modalContent .r176-one-page .r164-position .r164-inputs input{min-height:30px;padding:3px;font-size:12px}
#modalContent .r176-one-page .r176-risk-layout{gap:5px;grid-template-columns:minmax(0,1.8fr) minmax(0,1fr);align-items:start}
#modalContent .r176-one-page .r176-risk-layout>.r164-panel{height:auto;min-height:0}
#modalContent .r176-one-page .r169-risk-strip{padding:0 0 3px;gap:3px}
#modalContent .r176-one-page .r169-risk-title{font-size:13px;line-height:1.2}
#modalContent .r176-one-page .r169-missing-badge{padding:1px 4px;line-height:1.3}
#modalContent .r176-one-page .r164-scenarios{gap:4px;align-items:start}
#modalContent .r176-one-page .r164-scenario{padding:4px;gap:1px;min-height:0;line-height:1.25}
#modalContent .r176-one-page .r164-scenario b{font-size:10px;line-height:1.25}
#modalContent .r176-one-page .r164-scenario strong{font-size:14px;line-height:1.2}
#modalContent .r176-one-page .r164-scenario small{font-size:10px;line-height:1.25;overflow-wrap:anywhere}
#modalContent .r176-one-page .r169-static-date{margin-top:3px;line-height:1.3}
#modalContent .r176-one-page .r176-advice{gap:4px}
#modalContent .r176-one-page .r176-advice strong{padding:4px 3px;line-height:1.25}
#modalContent .r176-one-page .r176-advice p{line-height:1.3}
#modalContent .r176-one-page .r164-headblock{padding:3px 2px;line-height:1.25;flex-basis:42px;min-width:42px}
#modalContent .r176-one-page .r164-ma-item{gap:1px;padding:1px 2px;justify-content:start}
#modalContent .r176-one-page .r164-track{margin-top:3px;height:4px}
#modalContent .r176-one-page .r164-market-label{padding:2px 1px}
#modalContent .r176-one-page .r174-small-title{margin-bottom:4px;gap:4px}
#modalContent .r176-one-page .r176-compact-compare .r175-compare-row{padding:3px 0;line-height:1.2}
#modalContent .r176-one-page .r194-relative{padding:4px;margin:4px 0;gap:2px 4px}
#modalContent .r176-one-page .r200-panel{margin:0;line-height:1.25;padding:6px}
#modalContent .r176-one-page .r200-title{margin-bottom:4px;gap:3px}
#modalContent .r176-one-page .r200-grid{gap:4px;align-items:start}
#modalContent .r176-one-page .r200-cell{padding:5px;gap:2px;line-height:1.25}
#modalContent .r176-one-page .r200-cell .r200-head{gap:2px}
#modalContent .r176-one-page .r200-cell strong{font-size:15px;line-height:1.2}
#modalContent .r176-one-page .r200-summary{margin-top:4px;line-height:1.25}
#modalContent .r176-one-page .r200-levels{margin-top:4px;padding-top:4px;gap:3px 6px;line-height:1.25}
#modalContent .r176-one-page .r194-cost-head{margin-bottom:2px;gap:3px}
#modalContent .r176-one-page .r194-body{margin-top:3px}
#modalContent .r176-one-page .r194-grid{gap:4px}
#modalContent .r176-one-page .r194-cell{padding:4px;gap:2px;line-height:1.2}
#modalContent .r176-one-page .r194-cell-title{font-size:12px}
#modalContent .r176-one-page .r194-part{gap:1px;padding-top:3px}
#modalContent .r176-one-page .r194-extra{margin-top:4px;padding-top:3px}
#modalContent .r176-one-page .r194-cost-note{margin-top:3px;line-height:1.25}
#modalContent .r176-one-page .r176-slim-panels{gap:4px}
#modalContent .r176-one-page .r164-gradient{margin:9px 5px 5px;height:7px}
#modalContent .r176-one-page .r164-gradient i{width:13px;height:13px}
#modalContent .r176-one-page .r176-research-grid{gap:4px}
#modalContent .r176-one-page .r176-research-mini{padding:4px;gap:3px}
#modalContent .r176-one-page .r176-research-mini .r176-metric-row{padding-top:2px}
#modalContent .r176-one-page .r176-research-mini .r176-mini-bar{height:4px;margin-top:0}
#modalContent .r176-one-page .r176-research-mini svg{min-height:0;max-height:72px}
#modalContent .r176-one-page .r196-income .r196-grid{gap:4px;margin:4px 0}
#modalContent .r176-one-page .r196-income .r196-cell{padding:5px}
#modalContent .r176-one-page .r203-explain{font-size:10px;line-height:1.35;color:#b7d1df;margin-top:3px}
#modalContent .r176-one-page .r203-explain>summary{cursor:pointer;color:#a5dbe8;min-height:24px;display:list-item;padding:4px 0}
.r203-pattern{border:1px solid #d5b45c;border-radius:9px;padding:5px;margin-top:5px;min-width:0;line-height:1.3;background:#092430}
.r203-pattern h4{font-size:12px;color:#f5d16b;margin:0;line-height:1.3}.r203-pattern .r203-head{display:flex;justify-content:space-between;align-items:center;gap:4px;flex-wrap:wrap}
.r203-pattern .r203-phase{font-size:11px;color:#f5d16b}.r203-pattern .r203-shape{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:5px;align-items:center;margin:4px 0}
.r203-pattern .r203-meta{display:flex;flex-direction:column;gap:2px;min-width:0}.r203-pattern .r203-meta b{font-size:13px;color:#bdeaf6}.r203-pattern svg{width:100%;height:auto;display:block;max-height:105px}
.r203-pattern .r203-price-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px}.r203-pattern .r203-price-grid>div{border:1px solid #347d96;border-radius:7px;padding:4px 2px;min-width:0;text-align:center;overflow-wrap:anywhere}.r203-pattern .r203-price-grid strong{display:block;font-size:13px;line-height:1.25}.r203-pattern .r203-price-grid small{display:block}
.r203-pattern .r203-checks{font-size:10px;color:#b7d1df;line-height:1.35;margin:4px 0 0;display:flex;gap:3px 7px;flex-wrap:wrap}.r203-pattern .r203-none{font-size:11px;color:#b7d1df;margin-top:3px}
@media(max-width:375px){#modalContent .r176-one-page .r176-risk-layout{grid-template-columns:minmax(0,1fr)}#modalContent .r176-one-page .r176-advice{display:grid;grid-template-columns:minmax(0,.65fr) minmax(0,1fr);align-items:center}#modalContent .r176-one-page .r176-advice p{grid-column:1/-1}#modalContent .r176-one-page .r176-top-position{grid-template-columns:minmax(0,1fr)}#modalContent .r176-one-page .r176-strategy{min-height:0;flex-direction:row;gap:6px}}
`;

function r164EnsureStyle(){
 if(typeof document==='undefined'||!document.head||document.getElementById('r164-dashboard-style'))return;
 const s=document.createElement('style');s.id='r164-dashboard-style';s.textContent=R164_CSS+R174_CSS+R175_CSS+R176_CSS+R194_COST_CSS+R200_CSS+R203_CSS;document.head.appendChild(s);
}
function r164PriceTick(p,kind='stock',date=null){
 if(!Number.isFinite(p)||p<.01||!['stock','etf'].includes(kind))return null;
 if(kind==='etf')return p<50?.01:.05;
 return p<10?.01:p<50?.05:p<100?.1:p<500?.5:p<1000?1:date&&r211HoldingDate(date)&&date>='2027-07-05'?1:5;
}
function r164Snap(p,how,kind='stock',date=null){
 if(!Number.isFinite(p)||p<=0||!['up','down'].includes(how)||!['stock','etf'].includes(kind))return null;
 const bands=kind==='etf'?[[.01,50,.01],[50,Infinity,.05]]:[[.01,10,.01],[10,50,.05],[50,100,.1],[100,500,.5],[500,1000,1],[1000,Infinity,r164PriceTick(1000,kind,date)]];
 const values=[];
 for(const [lo,hi,tick] of bands){
  const scaled=p/tick,eps=1e-9;
  const rounded=(how==='up'?Math.ceil(scaled-eps):Math.floor(scaled+eps))*tick;
  const q=how==='up'?Math.max(lo,rounded):Math.min(hi-tick,rounded);
  if(q>=lo&&q<hi&&q>0)values.push(Number(q.toFixed(2)));
 }
 return values.length?(how==='up'?Math.min(...values):Math.max(...values)):null;
}
function r213SnapFor(c,p,how){return r164Snap(p,how,c?.assetType==='ETF'?'etf':'stock',c?.date||null);}
function r164LimitBand(c){
 const close=numeric(c?.close);
 if(!(close>0)||!['上市','上櫃'].includes(c?.market)||c?.assetType==='ETF'||c?.possiblePriceAdjustment===true)return null;
 // This is only a common-stock ±10% estimate, NOT an authoritative exchange
 // reference on ex-rights, no-price-limit, resumed, or special trading days.
 return {up:r213SnapFor(c,close*1.1,'down'),down:r213SnapFor(c,close*.9,'up'),estimated:true};
}
const R175_CSS = `
.r175-compare{padding:10px 9px!important}.r175-compare .r175-head{margin-bottom:7px}.r175-head .r175-status{font-size:12px;font-weight:700;text-align:right}.r175-compare-daily{display:flex;align-items:center;justify-content:space-between;gap:7px;border-radius:8px;padding:7px 8px;margin-bottom:8px;background:#082a39;border:1px solid #347c8a;font-size:11px;flex-wrap:wrap}.r175-compare-daily b{font-weight:800;font-size:12px}.r175-column-head,.r175-compare-row{display:grid;grid-template-columns:38px minmax(0,1.13fr) minmax(0,1.18fr) minmax(0,0.95fr);gap:3px;align-items:center}.r175-column-head{font-size:9px;color:#8eabbc;text-align:center;margin:4px 0}.r175-compare-row{padding:6px 1px;min-width:0;border-top:1px solid #27566d;line-height:1.3}.r175-ma-id{font-weight:800;font-size:12px;text-align:center;color:#b6eff3}.r175-compare-cell,.r175-ma-result{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-width:0;gap:2px}.r175-compare-cell small{font-size:10px;color:#c0d3e1;overflow-wrap:anywhere}.r175-compare-cell strong{font-size:13px}.r175-compare-cell small.r164-positive{color:#fa8090}.r175-compare-cell small.r164-negative{color:#4fdbb1}.r175-ma-result b{font-size:13px;white-space:nowrap}.r175-ma-result b small{font-size:8px;padding-left:2px}.r175-ma-result span{font-size:9px;color:#cfdfeb;line-height:1.1;text-align:center}
@media(min-width:480px){.r175-compare{padding:12px 13px!important}.r175-compare-row{grid-template-columns:52px 1.2fr 1.2fr 1fr;gap:8px}.r175-column-head{grid-template-columns:52px 1.2fr 1.2fr 1fr;gap:8px;font-size:11px}.r175-compare-cell strong,.r175-ma-result b{font-size:16px}.r175-ma-id{font-size:15px}.r175-compare-cell small,.r175-ma-result span{font-size:12px}}
@media(max-width:340px){.r175-compare-row,.r175-column-head{grid-template-columns:33px minmax(0,1fr) minmax(0,1fr) minmax(0,.86fr);gap:1px}.r175-ma-id{font-size:11px}.r175-compare-cell strong,.r175-ma-result b{font-size:11px}.r175-compare-cell small{font-size:9px}.r175-ma-result span{font-size:8px}}
`;
function r164Data(c){
 const b=Array.isArray(c?.bars)?c.bars:[],close=numeric(c?.close),asOf=state.payload?.asOf;
 // Historical verified K-lines can still be shown. Staleness only disables
 // the next-session decision; it must not erase the neon visual modules.
 const ok=close!==null&&close>0&&b.length>=26&&b.at(-1)?.[0]===c?.date&&
  Math.abs(Number(b.at(-1)?.[4])-close)<=.001&&!c.possiblePriceAdjustment&&
  b.slice(-26).every((x,i,a)=>r129ValidCandle(x)&&r211HoldingDate(x[0])&&
  (i===0||x[0]>a[i-1][0])&&
  (i===0||(Math.abs(Number(x[1])/Number(a[i-1][4])-1)<=.35&&Math.abs(Number(x[4])/Number(a[i-1][4])-1)<=.35)));
 if(!ok){
  const why=!b.length?'尚無歷史日K':b.length<26?`日K只有${b.length}根，至少需要26根`:
    b.at(-1)?.[0]!==c?.date?`個股日期${c?.date||'—'}與末根K棒${b.at(-1)?.[0]||'—'}不符`:
    c.possiblePriceAdjustment?'可能除權息／價格斷層尚未還原':
    '收盤價或K棒價量資料未核實';
  return {ok:false,fresh:false,close,reason:why};
 }
 const fresh=c?.date===asOf&&!chaopanEodFreshness(c.date).stale;
 const sum=a=>a.reduce((s,x)=>s+Number(x[4]),0);
 const mas=[5,10,20].map(n=>{
  const today=sum(b.slice(-n))/n,prev=sum(b.slice(-n-1,-1))/n,touch=sum(b.slice(-(n-1)))/(n-1);
  const turn=Number(b[b.length-n][4]);
  return {n,today,prev,touch,turn,dir:today>prev+.000001?'up':today<prev-.000001?'down':'flat',pct:(touch/close-1)*100};
 });
 let sumTr=0;
 for(let i=b.length-14;i<b.length;i++){
  const x=b[i],prevClose=Number(b[i-1][4]);
  sumTr+=Math.max(Number(x[2])-Number(x[3]),Math.abs(Number(x[2])-prevClose),Math.abs(Number(x[3])-prevClose));
 }
 const atr=sumTr/14,ma5=mas[0],bufferPct=Math.max(.4,Math.min(1.8,.5*atr/ma5.touch*100));
 const margin=r213SnapFor(c,ma5.touch*(1-bufferPct/100),'down');
 const hard=r213SnapFor(c,ma5.touch*(1-2*bufferPct/100),'down');
 return {ok:true,fresh,close,mas,atr,bufferPct,margin,hard,reason:fresh?'':'資料非最新盤後；僅顯示歷史價位'};
}
function r164Fmt(v){return Number.isFinite(v)?Number(v).toLocaleString('zh-TW',{maximumFractionDigits:2}):'—';}
function r164Pct(v){return Number.isFinite(v)?`${v>0?'+':''}${v.toFixed(2)}%`:'—';}
function r164PctColor(p){return p>0?'r164-positive':p<0?'r164-negative':'r164-neutral';}
function r165Gradient(missing=false){
 return `<div class="r164-gradient${missing?' is-missing':''}" aria-hidden="true"><i style="--dot:#27eaaa"></i><i style="--dot:#ffe24f"></i><i style="--dot:#ffa037"></i><i style="--dot:#f95f74"></i></div>`;
}
function r165Value(v){return Number.isFinite(v)&&v>0?r164Fmt(v):'—';}
function r165LevelColumn(label,v,close,cls,icon=''){
 const valid=Number.isFinite(v)&&v>0&&Number.isFinite(close)&&close>0;
 return `<div><small class="${cls}">${icon} ${label}</small><b class="${cls}">${valid?r164Fmt(v):'—'}</b><em class="${valid?r164PctColor(100*(v/close-1)):''}">${valid?r164Pct(100*(v/close-1)):'待補'}</em></div>`;
}
function r164MABox(c,data){
 let badges=[5,10,20].map(n=>{
  const m=data.ok?data.mas.find(x=>x.n===n):null;
  const arrow=m?(m.dir==='up'?'↗':m.dir==='down'?'↘':'→'):'·';
  const dirColor=m?(m.dir==='up'?'#ff6676':m.dir==='down'?'#45e499':'#ffd25e'):'#8aa9b8';
  const width=m?Math.max(8,Math.min(100,Math.abs(m.pct)*15)):0;
  return `<div class="r164-ma-item" data-ma="${n}"><b style="color:${dirColor}">MA${n} ${arrow}</b><strong style="color:${dirColor}">${m?r164Fmt(m.today):'—'}</strong><small>${m?(data.fresh?'隔日觸線 '+r164Fmt(m.touch):'歷史觸線 '+r164Fmt(m.touch)):'觸線待補'}</small><small class="${m?r164PctColor(m.pct):''}">${m?r164Pct(m.pct):'—'}</small><span class="r164-track"><i class="r164-fill" style="--length:${width}%;--accent:${dirColor}"></i></span></div>`;
 }).join('');
 let market='<span class="r164-market-label">待核對</span>';
 // Show official same-day index direction even when stock history is incomplete;
 // relative stock/market strength still needs matched full daily bars.
 if(state.mode!=='demo'){
  const indexBars=r201Benchmark(c,false);
  if(Array.isArray(indexBars)&&indexBars.length>=20){
   const a=indexBars.at(-1),p=indexBars.at(-2),ixPct=(a[4]/p[4]-1)*100;
   const m5=indexBars.slice(-5).reduce((sum,b)=>sum+b[4],0)/5;
   market=`<span class="r164-market-label ${r164PctColor(ixPct)}">${ixPct>0?'大盤上漲':ixPct<0?'大盤下跌':'大盤持平'}<small style="display:block">${a[0].slice(5)} ${r164Fmt(a[4])}點</small><small style="display:block">${r164Pct(ixPct)}</small><small style="display:block">${a[4]>=m5?'站上MA5':'跌破MA5'}</small></span>`;
  }
 }
 if(data.ok)try{
  const checked=globalThis.ChaopanCompareR162?.inspect?.(c,state.marketIntel,20,state.mode!=='demo');
  if(checked?.ok){const excess=checked.excess;market=`<span class="r164-market-label ${r164PctColor(excess)}">${excess>=0?'個股較強':'個股較弱'}<small style="display:block">20日 ${Number.isFinite(excess)?`${excess>0?'+':''}${excess.toFixed(2)}pp`:'—'}</small><small style="display:block">大盤 ${r164Pct((checked.indices.at(-1).close/checked.indices.at(-2).close-1)*100)}</small></span>`;}
 }catch(e){}
 badges+=`<button type="button" class="r164-ma-item r167-index-open" aria-label="查看${c.market==='上櫃'?'櫃買指數':'加權指數'}K線圖" title="點擊開啟對應指數日K"><b>大盤 K</b><strong style="font-size:14px">${market}</strong><small class="r167-index-hint">點我看日K ⤴</small><span class="r164-track"><i class="r164-fill" style="--length:20%;--accent:#36bee2"></i></span></button>`;
 return `<section class="r164-panel r164-ma-panel r163-compact-risk" aria-label="MA5 MA10 MA20 大盤圖形化趨勢"><div class="r164-strip"><div class="r164-headblock">均線<br>趨勢</div><div class="r164-strip-data"><div class="r164-mas">${badges}</div></div></div>${!data.ok?`<div class="r164-status">${esc(data.reason||"資料待核對")} · 不提供隔日價位</div>`:!data.fresh?`<div class="r164-status">${esc(c.date)} 歷史均線 · 舊資料不可當作明日委託價</div>`:''}</section>`;
}
function r164KeyBox(c,data){
 let support=null,neck=null,pressure=null,breakout=null;
 if(data.ok){
  const lv=r103ConditionalLevels(c,{close:data.close,rebound:null,breakout:null});
  support=numeric(supportLines(c)[0]?.lower);neck=numeric(latestNeck(c));
  const guidance=ChaopanGuidance.evaluate(c,deskEvidence(c),supportLines(c));
  pressure=numeric(lv?.rebound);breakout=numeric(guidance?.breakoutLevel);
 }
 const close=data.close,cols=[['♢','支撐',support,'r164-negative'],['⊙','頸線',neck,'r164-neutral'],['▱','壓力',pressure,'r164-positive'],['♛','突破',breakout,'r164-positive']].map(([ic,label,v,cls])=>r165LevelColumn(label,v,close,cls,ic)).join('');
 return `<section class="r164-panel r164-key-panel" aria-label="支撐頸線壓力突破彩色關鍵價位圖條"><div class="r164-strip"><div class="r164-headblock">關鍵<br>價位</div><div class="r164-strip-data"><div class="r164-key-items">${cols}</div>${r165Gradient(!data.ok)}</div></div></section>`;
}
function r164DefenseBox(c,data){
 const ma=data.ok?data.mas[0]:null,p=data.close;
 const info=data.ok?[['彈起',r213SnapFor(c,ma.touch*(1+data.bufferPct/100),'up'),'r164-positive'],['MA5觸線',ma.touch,'r164-neutral'],['容忍',data.margin,'r164-negative'],['防守',data.hard,'r164-negative']]:[['彈起',null,'r164-positive'],['MA5觸線',null,'r164-neutral'],['容忍',null,'r164-negative'],['防守',null,'r164-negative']];
 const entries=info.map(([k,v,cls])=>r165LevelColumn(k,v,p,cls)).join('');
 const note=data.ok?(data.fresh?(ma.touch>=p?'已低於隔日觸線價 · 勿視為下跌掛單':'容忍幅度按ATR估算，尚未回測'):`${c.date}歷史回看 · 不可作明日委託價`):`${data.reason||'行情缺漏'} · 價格待補`;
 return `<section class="r164-panel r164-defense" aria-label="MA5 綠黃橘紅防守帶"><div class="r164-strip"><div class="r164-headblock">MA5<br>防守帶</div><div class="r164-strip-data"><div class="r164-band-items">${entries}</div>${r165Gradient(!data.ok)}</div></div><div class="r164-mini-note">${note}</div></section>`;
}
function r164PnlHTML(cost,qty,close){
 const valid=Number.isFinite(cost)&&cost>0&&Number.isSafeInteger(qty)&&qty>0&&qty<=1e8&&Number.isFinite(close)&&close>0;
 if(!valid){if(Number.isFinite(cost)&&cost>0&&Number.isFinite(close)&&close>0){const pc=(close/cost-1)*100;return `<small>帳面損益率（未計費）</small><strong class="${r164PctColor(pc)}">${r164Pct(pc)}</strong><small>輸入股數顯示金額</small>`;}return `<small>輸入成本與股數，自動計算損益</small>`;}
 const pnl=(close-cost)*qty,pc=(close/cost-1)*100;
 return `<small>帳面損益（未計費）</small><strong class="${r164PctColor(pnl)}">${pnl>0?'+':''}${r164Fmt(Math.round(pnl))}</strong><small class="${r164PctColor(pc)}">${r164Pct(pc)} · ${pnl>0?'獲利中':pnl<0?'虧損中':'打平'}</small>`;
}
function r169StaleWhy(c,data){
 const asOf=String(c?.date||'日期未知');
 if(!data?.ok)return `資料截至${asOf}｜${data?.reason||'價格待核對'}`;
 if(!data.fresh)return `資料截至${asOf}｜未取得更新盤後，停止明日委託價`;
 return '';
}
function r164ActionPreview(a,c,data=null){
 // This is a visual bridge to the UNCHANGED r99Action decision engine.
 // The risk-reduction ROW must stay visible when freshness/quality gates block executable scenarios.
 const fresh=!!(data?.ok&&data.fresh),quantity=Number.isSafeInteger(a?.shares)&&a.shares>0?a.shares:0;
 const valid=!!a?.valid;
 const canDecide=fresh&&valid,canTrade=canDecide&&a.levelsVerified!==false;
 const status=canDecide?(quantity>0?esc(a.title):'目前無確認減碼訊號'):'風險減碼';
 const amount=canDecide?`${quantity.toLocaleString('zh-TW')} 股`:'— 股';
 const badge=canDecide?(a.levelsVerified===false?'風險成立・價位待核對':quantity>0?'依盤後條件試算':'續抱／觀察'):(fresh&&!valid?(a?.title==='請先輸入持股'?'持股資料待補':'行情待核對'):'價位待核對');
 const header=`<div class="r169-risk-strip" aria-label="風險減碼狀態"><strong class="r169-risk-title">◎ ${status} ${amount}</strong><span class="r169-missing-badge">${badge}</span></div>`;
 const riskSub=!canTrade?`<div class="r169-info" role="status">${esc(r169StaleWhy(c,data)||a?.note||'輸入成本與持股數後再判斷')}</div>`:
   `<div class="r169-static-date">${esc(a.asOf||c.date||'')}盤後｜${quantity>0?'反彈及跌破為同一筆股數，勿重複計算':'未觸發減碼，不等於保證安全'}</div>`;
 if(!canTrade){
  return `${header}<div class="r164-scenarios"><div class="r164-scenario"><b class="r164-positive">↗ 開高／反彈</b><strong>—</strong><small>價位待更新</small></div><div class="r164-scenario down"><b class="r164-negative">↘ 開低／防守</b><strong>—</strong><small>價位待更新</small></div></div>${riskSub}`;
 }
 const lv=r103ConditionalLevels(c,a),limit=r164LimitBand(c),validPrice=x=>Number.isFinite(x)&&x>0;
 const rebound=validPrice(lv?.rebound)?lv.rebound:null,defense=validPrice(lv?.defense)?lv.defense:null;
 // A multi-day resistance must never be silently converted into tomorrow's limit-up as a sell instruction.
 const beyond=validPrice(rebound)&&validPrice(limit?.up)&&rebound>limit.up;
 const up=beyond?null:rebound;
 const below=validPrice(defense)&&validPrice(limit?.down)&&defense<limit.down;
 const down=below?null:defense;
 const downTitle=below?'↘ 多日防守（非明日掛價）':'↘ 開低／防守';
 const pct=x=>validPrice(x)?r164Pct((x/a.close-1)*100):'—';
 const downSub=below?`防守${r164Fmt(defense)}元 · 低於隔日估算下限`:pct(down);
 const pnl=x=>quantity>0&&validPrice(x)&&Number.isFinite(a.cost)?`${quantity}股損益 ${r164Fmt(Math.round((x-a.cost)*quantity))}`:'—';
 const upTitle=beyond?'↗ 多日壓力（非明日掛價）':'↗ 開高／反彈';
 const upValue=beyond?'—':r165Value(up);
 const upSub=beyond?`壓力${r164Fmt(rebound)}元 · 超出隔日估算上限`:(validPrice(up)?pct(up):'等待確認');
 return `${header}<div class="r164-scenarios">
  <div class="r164-scenario"><b class="r164-positive">${upTitle}</b><strong class="r164-positive">${upValue}</strong><small>${upSub}</small><small>${pnl(up)}</small></div>
  <div class="r164-scenario down"><b class="r164-negative">${downTitle}</b><strong class="r164-negative">${r165Value(down)}</strong><small>${downSub}</small><small>${pnl(down)}</small></div>
 </div>${riskSub}`;
}
/* R174: The stock and TAIEX use the same compact warning grammar.
   These are historical EOD reference levels, not executable future quotes.
   Unknown = dash; do not convert missing verified fields into zero. */
function r174AutoMode(cost,close){
 if(!Number.isFinite(cost)||cost<=0||!Number.isFinite(close)||close<=0)return '輸入成本後自動判斷';
 const roi=(close/cost-1)*100;
 return roi>1?'獲利保護':roi>=-1?'成本保衛':'均線防守';
}
function r174Dist(v,close,unit){
 if(!(Number.isFinite(v)&&v>0&&Number.isFinite(close)&&close>0))return {amount:'—',pct:'—',valid:false};
 const diff=v-close,pct=diff/close*100;
 const nf=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:unit==='點'?2:2});
 return {amount:(diff>0?'+':'')+nf.format(diff)+' '+unit,pct:r164Pct(pct),valid:true};
}
function r174Bar(label,point,close,unit,colour,sub=''){
 const n=Number(point),ok=Number.isFinite(n)&&n>0&&Number.isFinite(close)&&close>0;
 const d=r174Dist(ok?n:null,close,unit);
 return `<div class="r174-data-col"><small style="color:${colour}">${esc(label)}</small><strong>${ok?r164Fmt(n):'—'}</strong><em class="${d.valid?r164PctColor(n-close):''}">${d.valid?`${d.amount}｜${d.pct}`:'資料待核對'}</em>${sub?`<small class="r174-hint">${esc(sub)}</small>`:''}</div>`;
}
function r174WarnBand(){return `<div class="r174-warning-bar" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="r174-band-legend"><span>安全區</span><span>接近支撐</span><span>跌破支撐</span><span>確認轉弱</span></div>`;}
/* R176: Compare distance-to-each-own-MA, never stock yuan with index points.
 * Index series and verified stock bars must have the exact same EOD date.
 * When stale, show historical readings only, not next-day order triggers. */
// R201: read-only official benchmark selection, same trading day; never substitute TAIEX for OTC.
function r201Benchmark(c,needOHLC=true){
 if(!c?.date||state.mode==='demo'||!['上市','上櫃'].includes(c.market))return null;
 const key=c.market==='上櫃'?'otc':'taiex';
 const feed=state.marketIntel?.marketTrend;
 const independent=key==='taiex'&&typeof R166IndexDaily!=='undefined'?R166IndexDaily.get(c.date):null;
 const verified=feed?.asOf===c.date&&feed.authority==='verified-official-eod'&&feed.sources?.[key]?.status==='ok';
 const source=independent||(verified?feed.indexHistory?.[key]:null);
 const rows=source?R162Compare.readSeries(source):null;
 if(!rows||rows.length<20||rows.at(-1).date!==c.date||rows.some((x,i)=>i&&Math.abs(x.close/rows[i-1].close-1)>.35))return null;
 if(needOHLC&&rows.some(x=>!x.candle))return null;
 return rows.map(x=>[x.date,x.open,x.high,x.low,x.close,x.volume]);
}
// R219: relative MA windows must use the exact same 20 market sessions.
function r219RelativeSessions(bars,index,date){
 if(!Array.isArray(bars)||!Array.isArray(index)||bars.length<20||index.length<20)return false;
 const a=bars.slice(-20),b=index.slice(-20),valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 const price=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))&&Number(v)>0;
 return valid(date)&&a.at(-1)?.[0]===date&&b.at(-1)?.[0]===date&&a.every((x,i)=>Array.isArray(x)&&Array.isArray(b[i])&&valid(x[0])&&x[0]===b[i][0]&&(!i||x[0]>a[i-1][0])&&price(x[4])&&price(b[i][4]));
}
function r175MarketStockModel(c){
 const stock=r164Data(c);
 const stockBars=Array.isArray(c?.bars)?c.bars:[];
 const ix=r201Benchmark(c,false);
 const isReady=Array.isArray(ix)&&ix.length>=20&&ix.at(-1)?.[0]===c.date&&
   ix.at(-2)?.[0]<c.date&&ix.slice(-20).every(b=>Array.isArray(b)&&Number.isFinite(Number(b[4]))&&Number(b[4])>0);
 if(!isReady)return {ok:false,reason:c?.market==='上櫃'?'櫃買指數同日歷史資料尚未核對':'大盤同日歷史資料尚未入庫，不能推定強弱'};
 const ic=Number(ix.at(-1)[4]),ip=Number(ix.at(-2)[4]);
 const aligned=r219RelativeSessions(stockBars,ix,c.date);
 const stockReady=stock.ok&&stockBars.length>=26&&aligned;
 const sc=stockReady?stock.close:null,sp=stockReady?Number(stockBars.at(-2)[4]):null;
 const dayStock=c?.assetType==='ETF'?(stockReady?r189OfficialChange(c):null):(sp>0?(sc/sp-1)*100:null),dayIndex=(ic/ip-1)*100;
 const delta=dayStock===null?null:dayStock-dayIndex;
 const rows=[5,10,20].map(n=>{
  const maIndex=ix.slice(-n).reduce((sum,b)=>sum+Number(b[4]),0)/n;
  const indexPoint=ic-maIndex,indexPct=indexPoint/maIndex*100;
  const maStock=stockReady?stock.mas.find(x=>x.n===n)?.today:null;
  const stockDiff=maStock>0?sc-maStock:null,stockPct=maStock>0?stockDiff/maStock*100:null;
  const relative=stockPct===null?null:stockPct-indexPct;
  const signal=relative===null?'個股待核對':relative<-.5?'個股較弱':relative>.5?'個股較強':'接近同步';
  return {n,maIndex,indexPoint,indexPct,maStock,stockDiff,stockPct,relative,signal};
 });
 const belowStock=rows.filter(r=>r.stockPct!==null&&r.stockPct<0).length;
 const belowIndex=rows.filter(r=>r.indexPct<0).length;
 let trend=stock.ok&&!aligned?'個股與指數交易日不一致，待核對':'個股資料待核對';
 if(stockReady){
  if(belowStock===3&&belowIndex===3)trend='個股／大盤均弱';
  else if(belowStock>=2&&belowIndex<=1)trend='個股偏弱／大盤較強';
  else if(belowStock<=1&&belowIndex>=2)trend='個股抗跌／大盤較弱';
  else if(belowStock===0&&belowIndex===0)trend='個股／大盤均強';
  else trend='個股／大盤均線分歧';
 }
 return {ok:true,stockReady,ic,dayIndex,dayStock,delta,rows,trend,date:c.date,fresh:stock.fresh};
}
function r194RelativeSummary(m){
 if(!m?.ok||!m.stockReady||!Array.isArray(m.rows)||m.rows.length!==3||!m.rows.every(r=>Number.isFinite(r.relative)))return '';
 const strong=m.rows.filter(r=>r.relative>.5).length,weak=m.rows.filter(r=>r.relative<-.5).length;
 const score=Math.round(3+2*(strong-weak)/3), label=['','明顯偏弱','偏弱','分歧／同步','偏強','明顯偏強'][score];
 const text=m.rows.map(r=>'MA'+r.n+' '+(r.relative>.5?'較強':r.relative<-.5?'較弱':'接近同步')).join('｜');
 return `<div class="r194-relative"><div><small>⚖ 與大盤相比｜均線強弱</small><strong class="${r164PctColor(score-3)}">${label}</strong></div><div class="r194-dots" aria-label="相對強弱 ${score}／5">${Array.from({length:5},(_,i)=>`<i class="${i<score?'lit':''}"></i>`).join('')}<b>${score}/5</b></div><small class="r194-relative-note">${text}；僅均線相對位置評級，不代表勝率。</small></div>`;
}
function r174IndexCompare(c){
 const m=r175MarketStockModel(c);
 if(!m.ok)return `<section class="r164-panel r174-index-compare r175-compare r176-compact-compare" aria-label="個股與大盤均線比對">
  <div class="r174-small-title"><strong>大盤比對｜${c.market==='上市'?'加權指數':'櫃買指數'}</strong><span>待核對</span></div>
  <div class="r174-no-feed">${esc(m.reason)}｜MA5／10／20 距離暫不顯示</div>
 </section>`;
 const money=v=>Number.isFinite(v)?r164Fmt(v):'—';
 const signed=(v,unit)=>Number.isFinite(v)?`${v>0?'+':''}${money(v)}${unit}`:'—';
 const p=v=>Number.isFinite(v)?r164Pct(v):'—';
 const col=(d)=>d===null?'':r164PctColor(d);
 const table=m.rows.map(r=>`<div class="r175-compare-row" data-compare-ma="${r.n}">
   <div class="r175-ma-id">MA${r.n}</div>
   <div class="r175-compare-cell r175-stock-side"><small>個股 ${money(r.maStock)}元</small><strong class="${col(r.stockPct)}">${p(r.stockPct)}</strong><small class="${col(r.stockDiff)}">${signed(r.stockDiff,'元')}</small></div>
   <div class="r175-compare-cell r175-index-side"><small>大盤 ${money(r.maIndex)}點</small><strong class="${col(r.indexPct)}">${p(r.indexPct)}</strong><small class="${col(r.indexPoint)}">${signed(r.indexPoint,'點')}</small></div>
   <div class="r175-ma-result"><b class="${col(r.relative)}">${Number.isFinite(r.relative)?`${r.relative>0?'+':''}${r.relative.toFixed(2)}`:'—'}<small>pp</small></b><span>${r.signal}</span></div>
 </div>`).join('');
 const dayDiff=m.delta===null?'個股日漲跌待核對':`${m.delta>0?'+':''}${m.delta.toFixed(2)}pp`;
 const trendColor=/均弱|偏弱/.test(m.trend)?'r164-negative':/均強|抗跌/.test(m.trend)?'r164-positive':'';
 const label=m.delta===null?'待核對':m.delta<-.15?'日漲跌弱於大盤':m.delta>.15?'日漲跌強於大盤':'日漲跌接近大盤';
 return `<section class="r164-panel r174-index-compare r175-compare r176-compact-compare" aria-label="個股與對應市場指數 MA5 MA10 MA20 比較">
  <div class="r174-small-title r175-head"><strong>大盤比對｜${c.market==='上櫃'?'櫃買指數':'加權指數'}</strong><span class="r175-status ${trendColor}">${esc(m.trend)}</span></div>
  <div class="r175-compare-daily"><span>大盤 ${money(m.ic)}點 <b class="${col(m.dayIndex)}">${p(m.dayIndex)}</b></span><span>${label} <b class="${col(m.delta)}">${dayDiff}</b></span></div>
  <div class="r175-column-head"><span>均線</span><span>個股：元／距MA</span><span>大盤：點／距MA</span><span>差距／強弱</span></div>
  <div class="r175-compare-rows">${table}</div>
  ${r194RelativeSummary(m)}
  <details class="r203-explain"><summary>${esc(m.date)}${m.fresh?' 同日盤後':' 歷史盤後'}｜比對說明</summary><small class="r174-source">${esc(m.date)}${m.fresh?' 同日盤後':' 歷史盤後'}｜個股與大盤各算自己的均線距離；兩者差距以百分點(pp)比較，不混算元與指數點；均弱／均強指與均線相對位置，不代表完整趨勢</small></details>
 </section>`;
}
function r174StockSupportAlert(c,data){
 const close=numeric(c?.close),support=data.ok?numeric(supportLines(c)[0]?.lower):null;
 const good=Number.isFinite(support)&&support>0&&Number.isFinite(close)&&close>0;
 const dist=r174Dist(support,close,'元');
 const gap=good?100*(support/close-1):null;
 const phase=!good?'待核對':close<support?'跌破支撐，待確認':Math.abs(gap)<=1?'接近支撐':'尚距支撐';
 return `<section class="r164-panel r174-support-alert" aria-label="個股支撐預警">
  <div class="r174-small-title"><strong>⚠ ${esc(c.code)} 個股｜支撐預警</strong><small>依盤後條件計算</small></div>
  <div class="r174-warning-cells">
   <div><small>現價</small><b>${Number.isFinite(close)?r164Fmt(close):'—'}</b></div>
   <div><small>支撐</small><b>${good?r164Fmt(support):'—'}</b></div>
   <div><small>跌破</small><b>${good&&close<support?'收盤跌破':'待確認'}</b></div>
   <div><small>轉弱</small><b>${good&&close<support?'待量價核對':'待確認'}</b></div>
  </div>
  <div class="r174-distance">距支撐　<b>${good?`${dist.amount}｜${dist.pct}`:'資料待核對'}</b></div>
  ${r174WarnBand()}<div class="r174-source">${esc(phase)}｜收盤跌破後仍須以歷史支撐、量價與均線確認，非自動委託</div>
 </section>`;
}
function r174InstitutionPanel(c){
 const ins=r208Institution(c),asOf=c?.date;
 const valid=Boolean(ins);
 const row=(label,val)=>`<div class="r174-verified-metric"><small>${label}</small><b class="${r164PctColor(val)}">${val>0?'+':''}${r164Fmt(Math.round(val/1000))} 張</b></div>`;
 return `<section class="r164-board r174-research"><h3>法人動向</h3><div class="r174-source">${esc(asOf||'日期未知')}｜${valid?'同日已取得欄位（仍須核對來源）':'同日法人資料待核對，不補零'}</div>
 ${valid?`<div class="r174-institution-grid">${row('外資',Number(ins.foreignNetShares))}${row('投信',Number(ins.trustNetShares))}${row('自營商',Number(ins.dealerNetShares))}</div>`:'<div class="r174-muted-placeholder">法人買賣超暫無可核對資料</div>'}
 <small class="r174-source">法人資料不得因缺失而寫成買超／賣超0，也不單獨當作主力出貨或減碼依據</small></section>`;
}
function r174TechnicalPanel(c){
 const bs=c?.bars||[],valid=bs.length>=26&&bs.at(-1)?.[0]===c.date&&bs.slice(-26).every(x=>r129ValidCandle(x));
 return `<section class="r164-board r174-research"><h3>技術指標</h3>
 ${valid?technicalVisual(c):'<div class="r174-muted-placeholder">歷史日 K 尚未通過核對或少於26根，技術指標暫不計算</div>'}
 <small class="r174-source">以完成的歷史日K計算；需足夠根數，與有無官方現成技術指標不同</small></section>`;
}
// R209 checkpoint 03: historical volume anchor is independently checked against raw daily K.
// A structural neckline may be a clustered price; do not equate it to a single candle high.
function r209LargeKEvidence(c){
 const bars=Array.isArray(c?.bars)?c.bars:[], day=c?.date, s=c?.structureV23;
 const n=x=>(typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&Number.isFinite(Number(x))?Number(x):null;
 const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(Date.parse(x+'T00:00:00Z')).toISOString().slice(0,10)===x;
 const neck=n(s&&Object.prototype.hasOwnProperty.call(s,'primaryNeckline')?s.primaryNeckline:(s?.neckline??c?.neck)), keyDate=s?.primaryNecklineEvidence?.priceAnchorDate||(s&&Object.prototype.hasOwnProperty.call(s,'primaryNeckline')?s.primaryNecklineDate:s?.necklineDate)||c?.neckDate;
 const fresh=date(day)&&bars.at(-1)?.[0]===day;
 const oldDate=c?.oldMaxDate, lots=n(c?.oldMaxLots), high=n(c?.oldMaxHigh), close=n(c?.oldMaxClose);
 const matching=date(oldDate)&&oldDate<day?bars.filter(b=>b?.[0]===oldDate):[];
 const anchor=matching.length===1?matching[0]:null;
 const anchorValid=fresh&&anchor&&r129ValidCandle(anchor)&&lots>0&&n(anchor[5])>0&&Math.abs(n(anchor[5])-lots)<=.500001&&
  (c.oldMaxHigh==null||high>0&&Math.abs(n(anchor[2])-high)<=1e-8*Math.max(1,high))&&
  (c.oldMaxClose==null||close>0&&Math.abs(n(anchor[4])-close)<=1e-8*Math.max(1,close));
 const old=anchorValid?{date:oldDate,lots,high:n(anchor[2]),close:n(anchor[4]),age:bars.length-1-bars.indexOf(anchor)}:null;
 const neckBars=date(keyDate)&&keyDate<=day?bars.filter(b=>b?.[0]===keyDate):[];
 const neckValid=fresh&&neck>0&&neckBars.length===1&&r129ValidCandle(neckBars[0]);
 return {neck:neckValid?{price:neck,date:keyDate}:null,old};
}
function r174LargeKPanel(c){
 const close=numeric(c?.close),e=r209LargeKEvidence(c),neck=e.neck?.price,keyDate=e.neck?.date,good=!!e.neck;
 const d=r174Dist(good?neck:null,close,'元');
 const oldDate=e.old?.date,oldLots=e.old?.lots,verifiedOld=!!e.old;
 return `<section class="r164-board r174-research"><h3>歷史大量K</h3><div class="r174-institution-grid"><div class="r174-verified-metric"><small>結構頸線</small><b>${good?r164Fmt(neck):'—'}</b><small>${good?esc(keyDate):'來源待核對'}</small></div><div class="r174-verified-metric"><small>距頸線</small><b>${good?d.amount:'—'}</b><small>${good?d.pct:'待核對'}</small></div><div class="r174-verified-metric"><small>歷史量K（已核對）</small><b>${verifiedOld?r164Fmt(oldLots)+' 張':'—'}</b><small>${verifiedOld?esc(oldDate):'來源待核對'}</small></div></div>
 <small class="r174-source">結構頸線與歷史量K不同；量K日期及數值已對照日K，不代表已證明為區間最大量。</small></section>`;
}
function r174IndexExtras(bars,indexTitle='加權指數'){
 const last=bars?.at(-1),close=last?.close;
 if(!last||!(close>0)||bars.length<21)return `<div class="r174-no-feed">${indexTitle}歷史不足，關鍵價位待核對</div>`;
 const ma=n=>bars.slice(-n).reduce((sum,b)=>sum+b.close,0)/n;
 const mean5=ma(5),mean10=ma(10),mean20=ma(20);
 // Recent session low is a warning reference only, not a confirmed major support.
 const floor=Math.min(...bars.slice(-21,-1).map(b=>b.low));
 const above=[mean5,mean10,mean20].filter(v=>v>close).sort((a,b)=>a-b);
 const pressure=above[0]??null;
 // Candidate structural neckline only if two separated verified historical pivot highs
 // retest a similar price. Otherwise leave it blank; MA is NOT a neckline.
 const prior=bars.slice(-61,-1),pivots=[];
 for(let i=2;i<prior.length-2;i++){
  const high=prior[i].high;
  if(high>prior[i-1].high&&high>=prior[i+1].high&&high>=prior[i-2].high&&high>=prior[i+2].high)pivots.push({i,high});
 }
 let neck=null;
 for(let i=pivots.length-1;i>0&&neck===null;i--){
  const a=pivots[i];if(a.high<=close*1.005)continue;
  for(let j=i-1;j>=0;j--){
   const b=pivots[j];
   if(a.i-b.i>=5&&Math.abs(a.high-b.high)/Math.min(a.high,b.high)<=.015){neck=Math.min(a.high,b.high);break;}
  }
 }
 // Breakout observation is the nearest confirmed pivot overhead above the
 // candidate neckline; a missing pivot must remain unconfirmed.
 const breakout=neck===null?null:(pivots.filter(x=>x.high>neck*1.01).sort((a,b)=>a.high-b.high)[0]?.high??null);
 const gap=r174Dist(floor,close,'點');
 const phase=close<floor?'收盤跌破':Math.abs((floor/close-1)*100)<=1?'接近支撐':'尚距支撐';
 const cells=[['現價',r164Fmt(close)],['前20日低點',r164Fmt(floor)],['跌破',close<floor?'收盤跌破':'未收盤跌破'],['轉弱','待量價確認']].map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join('');
 const maRow=(n,v)=>{const d=r174Dist(v,close,'點');return `<div><small>MA${n}</small><b>${r164Fmt(v)}</b><em class="${r164PctColor(close-v)}">距離 ${r164Fmt(close-v)}點｜${r164Pct((close/v-1)*100)}</em></div>`};
 return `<section class="r174-index-extras" aria-label="${indexTitle}技術價位與預警">
  <div class="r164-panel r174-support-alert"><div class="r174-small-title"><strong>⚠ ${indexTitle}｜支撐預警</strong><small>${esc(last.date)} 盤後</small></div><div class="r174-warning-cells">${cells}</div><div class="r174-distance">距近期低點　<b>${gap.amount}｜${gap.pct}</b></div>${r174WarnBand()}<div class="r174-source">${phase}｜近期低點 ≠ 已確認結構支撐；有效跌破與轉弱須收盤及量價核對</div></div>
  <div class="r164-panel r174-index-structure"><div class="r174-small-title"><strong>關鍵價位｜技術結構</strong><small>歷史參考</small></div><div class="r174-structure-cols">
  ${r174Bar('低點參考',floor,close,'點','#37dfa8')}${r174Bar('頸線',neck,close,'點','#f2cf66')}${r174Bar('均線壓力',pressure,close,'點','#ff7886')}${r174Bar('突破',breakout,close,'點','#d6a1f7')}
 </div>${r174WarnBand()}<small class="r174-source">頸線／突破依歷史轉折候選推算；不是已認證買點，無轉折時留空</small></div>
  <div class="r164-panel r174-index-ma"><div class="r174-small-title"><strong>均線趨勢｜大盤</strong><span class="${r164PctColor(close-mean5)}">${close<mean5&&close<mean10&&close<mean20?'空頭警戒':'歷史比較'}</span></div><div class="r174-ma-cols">${maRow(5,mean5)}${maRow(10,mean10)}${maRow(20,mean20)}</div></div>
 </section>`;
}

// R194 cost defense is an independent, read-only scenario calculator.
// It never produces orders or modifies the strategy engine.
const r194ValidPrice=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
function r194Scenario(value,cost,qty,close){
 if(!r194ValidPrice(value)||!r194ValidPrice(close))return null;
 const hasCost=r194ValidPrice(cost),hasQty=Number.isSafeInteger(qty)&&qty>0&&qty<=1e8;
 const pct=hasCost?(value/cost-1)*100:null,amount=hasCost&&hasQty?(value-cost)*qty:null;
 return {value,distance:(value/close-1)*100,pct:Number.isFinite(pct)?pct:null,amount:Number.isFinite(amount)?amount:null,role:value<close?'下方回測':value>close?'上方關卡':'位於觸線'};
}
function r194Money(v){if(!Number.isFinite(v))return '—';const x=Math.round(v);return (x>0?'+':'')+r164Fmt(x)+' 元';}
function r194Price(v){return r194ValidPrice(v)?v.toLocaleString('zh-TW',{maximumFractionDigits:4}):'—';}
function r194CostHTML(data,cost,qty){
 const close=data?.close,hasCost=r194ValidPrice(cost),hasQty=Number.isSafeInteger(qty)&&qty>0&&qty<=1e8;
 const basisName=data?.fresh?'隔日觸線':'歷史觸線';
 const models=[5,10,20].map(n=>{const m=data?.ok?data.mas?.find(x=>x.n===n):null;return {n,today:r194Scenario(m?.today,cost,qty,close),touch:r194Scenario(m?.touch,cost,qty,close)};});
 const pnl=v=>v&&Number.isFinite(v.pct)?`<b class="r194-value ${r164PctColor(v.pct)}">${r164Pct(v.pct)}</b>${hasQty?`<b class="r194-value ${r164PctColor(v.amount)}">${r194Money(v.amount)}</b>`:''}`:'<small>—</small>';
 const part=(v,label)=>`<div class="r194-part"><small>${label} · ${v?.role||'待核對'}</small><b class="r194-value">${r194Price(v?.value)}</b>${hasCost?pnl(v):`<b class="r194-value ${r164PctColor(v?.distance)}">${v?r164Pct(v.distance):'—'}</b>`}</div>`;
 const cells=models.map(({n,today,touch})=>`<div class="r194-cell" data-r194-ma="${n}"><span class="r194-cell-title">MA${n} ${today?.value<close?'防守':today?.value>close?'關卡':'觀察'}</span>${part(today,'當日MA')}${part(touch,basisName)}</div>`).join('');
 const v=models[0].today;
 const ext=hasCost&&v&&v.value<=close?[3,5].map(n=>{const x=r194Scenario(v.value*(1-n/100),cost,qty,close);return `<span class="r194-extra-item"><small>低於當日MA5 ${n}%</small><b>${r194Price(x.value)}</b>${pnl(x)}</span>`;}).join(''):'';
 return `${hasCost?`<small class="r194-cost-note">依成本 ${r194Price(cost)} 元${hasQty?`／${qty.toLocaleString('zh-TW')} 股`:""}｜價位情境損益</small>`:""}<div class="r194-grid">${cells}</div>${ext?`<div class="r194-extra"><b>延伸試算</b><div>${ext}</div></div>`:''}<small class="r194-cost-note">${!data?.fresh?'歷史資料｜非明日委託價；':''}${!hasCost?'距收盤百分比｜輸入成本後顯示損益率；':!hasQty?'尚未輸入有效股數，只計損益率；':''}${hasCost?'未含費用、配息及滑價；情境非減碼指令。':'距離以收盤為基準。'}</small>`;
}

// R200 read-only indicators; same initialization as indicatorSnapshot, no strategy mutation.
function r200Series(bars,date,close){
 if(!Array.isArray(bars)||bars.length<35||!date||bars.at(-1)?.[0]!==date)return null;
 let prev='',e12,e26,dea,k=50,d=50;const out=[];
 for(let i=0;i<bars.length;i++){
  const b=bars[i];if(!Array.isArray(b)||b.length<5||typeof b[0]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b[0])||b[0]<=prev)return null;
  const stamp=Date.parse(b[0]+'T00:00:00Z');if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==b[0])return null;
  const [o,h,l,c]=b.slice(1,5).map(v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')?numeric(v):null);if([o,h,l,c].some(v=>!r194ValidPrice(v))||h<Math.max(o,c)||l>Math.min(o,c))return null;
  prev=b[0];e12=i?e12+2/13*(c-e12):c;e26=i?e26+2/27*(c-e26):c;
  const dif=e12-e26;dea=i?dea+.2*(dif-dea):dif;
  if(i>=8){const w=bars.slice(i-8,i+1),hh=Math.max(...w.map(x=>Number(x[2]))),ll=Math.min(...w.map(x=>Number(x[3]))),rsv=hh===ll?50:100*(c-ll)/(hh-ll);k=(2*k+rsv)/3;d=(2*d+k)/3;}
  out.push({k,d,dif,dea,e12,e26,close:c});
 }
 if(!r194ValidPrice(close)||Math.abs(out.at(-1).close-close)>.001)return null;
 return out;
}
function r200CrossState(prev,now){const sign=v=>Math.abs(v)<1e-8?0:Math.sign(v);const a=sign(prev),b=sign(now);return b>0&&a<=0?'黃金交叉':b<0&&a>=0?'死亡交叉':b>0?'多方持續':b<0?'空方持續':'雙線重合';}
function r200KDScenario(s,lo,hi){
 const target=3*s.d-2*s.k;
 if(!(hi>lo)||target<=0||target>=100)return null;
 return lo+(hi-lo)*target/100;
}
function r200MacdTrigger(s){return (s.dea-(11/13*s.e12-25/27*s.e26))/(2/13-2/27);}
function r200NextGaps(s,p,lo,hi){
 const h=Math.max(hi,p),l=Math.min(lo,p),rsv=h===l?50:100*(p-l)/(h-l),k=(2*s.k+rsv)/3,d=(2*s.d+k)/3;
 const dif=11/13*s.e12+2/13*p-(25/27*s.e26+2/27*p),dea=.8*s.dea+.2*dif;return {kd:k-d,macd:dif-dea};
}
function r200Forecast(bars,date,close,fresh,blocked=false){
 const series=blocked?null:r200Series(bars,date,close);if(!series)return null;
 const s=series.at(-1),p=series.at(-2),q=series.at(-3),w=bars.slice(-8),lo=Math.min(...w.map(b=>Number(b[3]))),hi=Math.max(...w.map(b=>Number(b[2])));
 const atr=bars.slice(-14).reduce((sum,b,i)=>{const pc=Number(bars[bars.length-15+i][4]);return sum+Math.max(Number(b[2])-Number(b[3]),Math.abs(Number(b[2])-pc),Math.abs(Number(b[3])-pc));},0)/14;
 const ext=Math.max(atr,close*.005),lo2=Math.min(lo,Math.max(close*.001,close-ext)),hi2=Math.max(hi,close+ext);
 const kd=r200KDScenario(s,lo,hi),kd2=r200KDScenario(s,lo2,hi2),macd=r200MacdTrigger(s);
 const build=(kind,now,prev,older,trigger,alternate,a,b)=>{
  const state=r200CrossState(prev,now),direction=now>1e-8?'死亡':now<-1e-8?'黃金':null;
  const flat=r200NextGaps(s,close,lo,hi)[kind];
  const near=Number.isFinite(trigger)&&trigger>0&&Math.abs(trigger-close)<=ext;
  const contracting=Math.abs(now)<Math.abs(prev)&&Math.abs(prev)<=Math.abs(older);
  const flatCross=direction==='死亡'?flat<-1e-8:direction==='黃金'?flat>1e-8:false;
  const warning=!!(fresh&&direction&&(flatCross||(near&&contracting)));
  // R212: separate hypothetical KD downside scenario from the existing warning.
  const scenarioPrice=Math.max(close*.001,close-.75*ext);
  const downsideScenario=!!(fresh&&kind==='kd'&&direction==='死亡'&&!warning&&r200NextGaps(s,scenarioPrice,lo,hi).kd<-1e-8);
  return {state,direction,trigger:Number.isFinite(trigger)&&trigger>0?trigger:null,alternate:Number.isFinite(alternate)&&alternate>0?alternate:null,warning,a,b,flatCross,downsideScenario,scenarioPrice:downsideScenario?scenarioPrice:null};
 };
 return {date,fresh,close,kd:build('kd',s.k-s.d,p.k-p.d,q.k-q.d,kd,kd2,s.k,s.d),macd:build('macd',s.dif-s.dea,p.dif-p.dea,q.dif-q.dea,macd,null,s.dif,s.dea)};
}
function r200Money(v){if(!Number.isFinite(v))return '—';const x=Math.sign(v)*Math.round(Math.abs(v));return (x>0?'+':'')+r164Fmt(x)+' 元';}
function r207AverageTouch(a,b){return r194ValidPrice(a)&&r194ValidPrice(b)?(8*a+9*b)/17:null;}
function r200AverageHTML(data,cost,qty){
 const m5=data?.ok?data.mas?.find(x=>x.n===5):null,m10=data?.ok?data.mas?.find(x=>x.n===10):null;
 const avg=(a,b)=>r194ValidPrice(a)&&r194ValidPrice(b)?(a+b)/2:null;
 const make=(label,value)=>{const s=r194Scenario(value,cost,qty,data?.close);return `<div class="r200-cell"><small>${label}｜${s?.role||'待核對'}</small><strong>${r194Price(value)}</strong>${s?`<small>距現價 <b class="${r164PctColor(s.distance)}">${r164Pct(s.distance)}</b></small>${Number.isFinite(s.pct)?`<small>距成本 <b class="${r164PctColor(s.pct)}">${(value-cost>0?'+':'')+(value-cost).toLocaleString('zh-TW',{maximumFractionDigits:4})} 元／股 · ${r164Pct(s.pct)}</b></small>`:''}${Number.isFinite(s.amount)?`<b class="${r164PctColor(s.amount)}">${r200Money(s.amount)}</b>`:''}`:''}</div>`;};
 return `<div class="r200-grid">${make('當日平均防守價',avg(m5?.today,m10?.today))}${make(data?.fresh?'隔日平均觸線':'歷史平均觸線',r207AverageTouch(m5?.touch,m10?.touch))}</div><small class="r200-note">當日取MA5／MA10平均；隔日為收盤恰等於隔日兩均線平均的理論價。未計費用，非委託價。</small>`;
}
function r200AverageCard(data,cost,qty){return `<section class="r164-panel r200-panel r200-average"><div class="r200-title"><b>◈ 平均防守線</b><small>MA5／MA10</small></div><div class="r200-average-body">${r200AverageHTML(data,cost,qty)}</div></section>`;}
const R200_CSS=`.r200-panel{box-sizing:border-box;border:1.5px solid #39b9cf;border-radius:13px;padding:9px;background:linear-gradient(150deg,#062b39,#071d2a);color:#e2f6fc;min-width:0;margin:5px 0;line-height:1.4}.r200-average{border-color:#eac65f}.r200-title{display:flex;justify-content:space-between;align-items:baseline;gap:6px;flex-wrap:wrap;margin-bottom:6px}.r200-title b{color:#f6d36b;font-size:14px}.r200-panel small{font-size:10px;color:#b7d1df;overflow-wrap:anywhere}.r200-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.r200-cell{display:flex;flex-direction:column;gap:3px;min-width:0;padding:7px;border:1px solid #347d96;border-radius:9px;background:#082431;overflow-wrap:anywhere}.r200-cell strong{font-size:16px;color:#e9f8ff}.r200-cell b{font-size:12px}.r200-cell .r200-warn{color:#ffd36b}.r200-panel .r164-positive{color:#ff7887}.r200-panel .r164-negative{color:#48dba7}.r200-note{display:block;margin-top:6px}.r200-levels{display:flex;flex-wrap:wrap;gap:5px 12px;border-top:1px solid #347d96;margin-top:7px;padding-top:6px;font-size:11px}.r200-summary{color:#ffd36b;font-size:12px;margin-top:6px}.r200-cell .r200-head{display:flex;flex-wrap:wrap;gap:4px;justify-content:space-between}.r200-cell .r200-head b{color:#e2f6fc}`;
function r200CrossCells(model,label,unit){
 return ['kd','macd'].map(kind=>{const x=model?.[kind],name=kind==='kd'?'KD':'MACD';if(!x)return `<div class="r200-cell"><b>${label} ${name}</b><small>資料待核對</small></div>`;
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('zh-TW',{maximumFractionDigits:2}):'—';
 const colour=x.state==='黃金交叉'||x.state==='多方持續'?'r164-positive':x.state==='死亡交叉'||x.state==='空方持續'?'r164-negative':'';
 const cond=x.direction==='黃金'?'收盤高於':x.direction==='死亡'?'收盤低於':'交叉等值';
 return `<div class="r200-cell"><div class="r200-head"><b>${label} ${name}</b><small class="${colour}">${x.state}</small></div><small>${kind==='kd'?'K':'DIF'} ${fmt(x.a)}／${kind==='kd'?'D':'DEA'} ${fmt(x.b)}</small>${model.fresh?`<b class="${x.warning||x.downsideScenario?'r200-warn':''}">${x.warning?x.direction+'交叉預警':x.downsideScenario?'KD下跌情境警戒':x.direction?x.direction+'交叉條件':'方向待確認'}</b>${x.trigger!==null?`<small>${cond}</small><strong>${r194Price(x.trigger)} ${unit}</strong><small>距現價 ${r164Pct((x.trigger/model.close-1)*100)}</small>`:'<small>無有效單一觸發價</small>'}${unit==='元'&&x.trigger!==null&&Math.abs(x.trigger/model.close-1)>.1?'<small>超出一般±10%參考範圍</small>':''}${x.downsideScenario?`<small>假設收盤 ${r194Price(x.scenarioPrice)} ${unit}（${r164Pct((x.scenarioPrice/model.close-1)*100)}），近期高低範圍不另擴張時可能死亡交叉</small>`:''}${kind==='kd'&&x.alternate!==null?`<small>高低擴張情境 ${r194Price(x.alternate)} ${unit}</small>`:''}`:'<small>歷史資料｜暫停隔日預警</small>'}</div>`;
 }).join('');
}
// R201: known cash distributions only. No invented event or mutation of actual OHLC/P&L.
function r201CashEvents(c){
 const d=c?.distributionDetail,rows=[...(Array.isArray(d?.history)?d.history:[]),...(d?.latest?[d.latest]:[])];
 const events=new Map();
 for(const x of rows){
  if(!x||!['SITCA open data 11109/160547','TWSE announcement 2026-10-30'].includes(x.source)||!r177EtfDate({latestDate:x.exDate})||!r177EtfDate({latestDate:x.payDate})||x.payDate<x.exDate||!r194ValidPrice(x.amount))continue;
  if(events.has(x.exDate)&&events.get(x.exDate).amount!==x.amount)return null;
  events.set(x.exDate,x);
 }
 return [...events.values()].sort((a,b)=>a.exDate.localeCompare(b.exDate));
}
function r201TechnicalInput(c){
 const bars=c?.bars,fail=reason=>({bars:null,reason,adjusted:0});
 if(c?.possiblePriceAdjustment===true)return fail('公司行動／價格斷層尚未還原');
 if(!Array.isArray(bars)||!bars.length)return fail('日K不足');
 const etf=c.assetType==='ETF',events=etf?r201CashEvents(c):[];
 if(etf&&Array.isArray(c.distributionDetail?.conflictDates)&&c.distributionDetail.conflictDates.some(d=>d>=bars[0]?.[0]&&d<=c.date))return fail('配息來源金額或日期衝突，暫停交叉判斷');
 const pendingEx=c.distributionDetail?.nextExPending;
 if(etf&&pendingEx&&pendingEx>=bars[0]?.[0]&&pendingEx<=c.date&&!events?.some(x=>x.exDate===pendingEx))return fail('已知除息日缺少確認金額');
 if(events===null)return fail('配息公告互相衝突');
 const copy=bars.map(b=>Array.isArray(b)?b.slice():b);
 if(copy.some(b=>!Array.isArray(b)||b.length<5||b.slice(1,5).some(v=>!(typeof v==='number'||typeof v==='string'&&v.trim()!=='')||!r194ValidPrice(numeric(v)))))return fail('日K格式待核對');
 let adjusted=0;
 for(const x of events){
  if(x.exDate<=bars[0][0]||x.exDate>c.date)continue;
  const i=bars.findIndex(b=>b[0]===x.exDate);
  if(i<1)return fail('除息交易日缺少日K');
  const prev=numeric(bars[i-1][4]);
  if(!r194ValidPrice(prev)||x.amount>=prev)return fail('除息參考價待核對');
  const factor=(prev-x.amount)/prev;
  for(let j=0;j<i;j++)for(let k=1;k<=4;k++)copy[j][k]=Number(copy[j][k])*factor;
  adjusted++;
 }
 // A large discontinuity is a quality warning, never proof of a split or cash dividend.
 for(let i=1;i<copy.length;i++){
  const p=numeric(copy[i-1][4]),v=numeric(copy[i][4]);
  if(!r194ValidPrice(p)||!r194ValidPrice(v)||Math.abs(v/p-1)>.105)return fail('歷史價格斷層待核對（可能公司行動或特殊交易）');
 }
 // Compare latest actual price change to the published reference when available.
 const last=bars.at(-1),prev=bars.at(-2),change=numeric(c.changeAmount);
 if(prev&&change!==null&&r194ValidPrice(numeric(last[4]))){
  const ref=Number(last[4])-change,old=Number(prev[4]);
  const event=events.find(x=>x.exDate===c.date),expected=old-(event?.amount||0);
  if(ref<=0||Math.abs(ref-expected)>Math.max(.011,old*.0015))return fail('官方漲跌參考價與日K不符，待核對公司行動');
 }
 const upcoming=etf?[c.distributionDetail?.nextExPending,...events.map(x=>x.exDate)].filter(d=>typeof d==='string'&&d>c.date).sort()[0]:null;
 const days=upcoming?(Date.parse(upcoming)-Date.parse(c.date))/86400000:Infinity;
 return {bars:copy,adjusted,reason:'',pending:days>0&&days<=4,etf};
}
// R202: conservative geometry observation, not a buy/sell classifier.
// Only pivots confirmed before the signal bar; no future candles or change to certified neckline.
function r202Pattern(bars,date,close){
 const unknown=reason=>({status:'unknown',reason});
 if(!Array.isArray(bars)||bars.length<55||!date||bars.at(-1)?.[0]!==date||!Number.isFinite(close)||close<=0)return unknown('至少55根同日完整日K');
 const b=bars.slice(-80).map(x=>Array.isArray(x)?x.slice(0,6):[]);
 let prev='';
 for(const x of b){const d=x[0],n=x.slice(1).map(v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')?Number(v):NaN);if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||d<=prev||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(Date.parse(d+'T00:00:00Z')).toISOString().slice(0,10)!==d||n.length!==5||n.some(v=>!Number.isFinite(v))||n[2]<=0||n[1]<Math.max(n[0],n[3])||n[2]>Math.min(n[0],n[3])||n[4]<0)return unknown('日K日期或價量異常');prev=d;for(let k=1;k<=5;k++)x[k]=n[k-1];}
 const t=b.length-1;if(Math.abs(b[t][4]-close)>Math.max(.000001,close*1e-8))return unknown('收盤不一致');
 for(let i=1;i<b.length;i++)if(Math.abs(b[i][4]/b[i-1][4]-1)>.105)return unknown('價格斷層待核對');
 const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
 const hi=[],lo=[];
 for(let i=Math.max(2,t-45);i<=t-3;i++){
  const w=b.slice(i-2,i+3),h=b[i][2],l=b[i][3];
  // One strict peak/trough; flat plateaus are deliberately not counted as multiple pivots.
  if(w.every((x,j)=>j===2||h>x[2]))hi.push({i,p:h});
  if(w.every((x,j)=>j===2||l<x[3]))lo.push({i,p:l});
 }
 const fit=a=>{if(a.length<2)return null;const mx=mean(a.map(x=>x.i)),my=mean(a.map(x=>x.p));const den=a.reduce((s,x)=>s+(x.i-mx)**2,0);if(!den)return null;const m=a.reduce((s,x)=>s+(x.i-mx)*(x.p-my),0)/den;return {m,at:i=>my+m*(i-mx),err:Math.max(...a.map(x=>Math.abs(x.p-(my+m*(x.i-mx)))))/my};};
 const vol=b.slice(t-20,t).map(x=>x[5]),avg=mean(vol),ratio=avg>0&&b[t][5]>0?b[t][5]/avg:null;
 const finish=(type,upper,lower,start,extra={})=>{
  const u=upper(t),l=lower(t),u0=upper(t-1),l0=lower(t-1),p=b[t][4],old=b[t-1][4];
  if(![u,l,u0,l0].every(Number.isFinite)||u<=l||l<=0)return null;
  const eps=p*1e-8,above=p>u+eps,below=p<l-eps;
  let phase=above?(old<=u0+eps?'收盤向上突破':'已在上緣上方'):below?(old>=l0-eps?'收盤向下跌破':'已在下緣下方'):b[t][2]>u+eps?'盤中突破收回':b[t][3]<l-eps?'盤中跌破收回':'形態候選';
  if(extra.bottom&&below)phase='底部支撐失守';
  const span=u-l,first=upper(start)-lower(start),late=extra.converging&&first>0&&span/first<.25;
  return {status:'ok',type,phase,upper:u,lower:l,nextUpper:upper(t+1),nextLower:lower(t+1),ratio,late:!!late,startDate:b[start][0],endDate:date, ...extra};
 };
 // Bottoms require a preceding decline, separate lows and intervening highs.
 let bottomCandidate=null;
 for(const count of [3,2]){
  const lows=lo.slice(-count);if(lows.length!==count)continue;
  const first=lows[0],last=lows.at(-1);if(first.i<12||t-last.i>12||last.i-first.i<8||last.i-first.i>36||lows.slice(1).some((x,j)=>x.i-lows[j].i<4))continue;
  const lead=b.slice(first.i-12,first.i),leadStart=mean(lead.slice(0,4).map(x=>x[4])),leadEnd=mean(lead.slice(-4).map(x=>x[4]));
  if(leadStart<first.p*1.07||leadEnd>leadStart*.98)continue;
  const peaks=lows.slice(1).map((x,j)=>hi.filter(h=>h.i>lows[j].i&&h.i<x.i).sort((a,b)=>b.p-a.p)[0]);
  if(peaks.some(x=>!x))continue;
  const base=mean(lows.map(x=>x.p)),min=Math.min(...lows.map(x=>x.p)),max=Math.max(...lows.map(x=>x.p));
  const flat=(max-min)/base<=.025&&Math.abs(last.p-first.p)/base<=.015;
  const hs=count===3&&Math.abs(lows[0].p-lows[2].p)/base<=.03&&lows[1].p<Math.min(lows[0].p,lows[2].p)*.975;
  if(!flat&&!hs)continue;
  if(peaks.some(x=>x.p<max*1.035))continue;
  if(count===3&&Math.abs(peaks[0].p-peaks[1].p)/base>.06)continue;
  const upper=count===2?()=>peaks[0].p:fit(peaks).at;
  const after=b.slice(last.i+1,t),failed=b[t][4]<min;
  if(!failed&&after.some(x=>x[3]<min*.99||x[4]>upper(b.indexOf(x))*1.005))continue;
  if(failed&&after.some((x,j)=>x[4]>upper(last.i+1+j)*1.005))continue;
  const out=finish(hs?'頭肩底':count===3?'三重底':'W底',upper,()=>min,first.i,{bottom:true,pivots:count});if(out){bottomCandidate=out;break;}
 }
 // R206: mirror the bottom structure with explicit top geometry, not mirrored prices.
 let topCandidate=null;
 for(const count of [3,2]){
  const highs=hi.slice(-count);if(highs.length!==count)continue;
  const first=highs[0],last=highs.at(-1);if(first.i<12||t-last.i>12||last.i-first.i<8||last.i-first.i>36||highs.slice(1).some((x,j)=>x.i-highs[j].i<4))continue;
  const lead=b.slice(first.i-12,first.i),leadStart=mean(lead.slice(0,4).map(x=>x[4])),leadEnd=mean(lead.slice(-4).map(x=>x[4]));
  if(leadStart>first.p/1.07||leadEnd<leadStart*1.02)continue;
  const troughs=highs.slice(1).map((x,j)=>lo.filter(h=>h.i>highs[j].i&&h.i<x.i).sort((a,b)=>a.p-b.p)[0]);
  if(troughs.some(x=>!x))continue;
  const base=mean(highs.map(x=>x.p)),min=Math.min(...highs.map(x=>x.p)),max=Math.max(...highs.map(x=>x.p));
  const flat=(max-min)/base<=.025&&Math.abs(last.p-first.p)/base<=.015;
  const hs=count===3&&Math.abs(highs[0].p-highs[2].p)/base<=.03&&highs[1].p>Math.max(highs[0].p,highs[2].p)*1.025;
  if(!flat&&!hs||troughs.some(x=>x.p>min/1.035))continue;
  if(count===3&&Math.abs(troughs[0].p-troughs[1].p)/base>.06)continue;
  const lower=count===2?()=>troughs[0].p:fit(troughs).at;
  const after=b.slice(last.i+1,t),failed=b[t][4]<lower(t);
  if(after.some(x=>x[2]>max*1.01)||(!failed&&after.some((x,j)=>x[4]<lower(last.i+1+j)*.995)))continue;
  const out=finish(hs?'頭肩頂':count===3?'三重頂':'M頭',()=>max,lower,first.i,{top:true,pivots:count});
  if(out){topCandidate=out;break;}
 }
 // A confirmed bearish break is a veto even if another geometry overlaps.
 const risk=x=>x&&/收盤向下跌破|已在下緣下方|底部支撐失守|盤中突破收回/.test(x.phase);
 const options=[topCandidate,bottomCandidate].filter(Boolean);
 // Fit multiple alternating pivots, not just two extreme values.
 for(const width of [36,24,45]){
  const start=t-width, h=hi.filter(x=>x.i>=start),l=lo.filter(x=>x.i>=start);
  if(h.length<3||l.length<3||h.at(-1).i-h[0].i<width*.45||l.at(-1).i-l[0].i<width*.45||t-Math.max(h.at(-1).i,l.at(-1).i)>8)continue;
  const ordered=[...h.map(x=>({...x,k:1})),...l.map(x=>({...x,k:-1}))].sort((a,b)=>a.i-b.i);if(ordered.slice(1).filter((x,j)=>x.k!==ordered[j].k).length<4)continue;
  const H=fit(h),L=fit(l),base=mean(b.slice(start,t).map(x=>x[4]));if(!H||!L||H.err>.012||L.err>.012)continue;
  const first=Math.min(h[0].i,l[0].i),w0=H.at(first)-L.at(first),w1=H.at(t)-L.at(t),sh=H.m*(t-first)/base,sl=L.m*(t-first)/base;
  if(w0<base*.035||w1<base*.005||w1>w0*1.25)continue;
  if(b.slice(first,t).some((x,j)=>x[4]>H.at(first+j)+base*.012||x[4]<L.at(first+j)-base*.012))continue;
  const flatH=Math.abs(sh)<=.012,flatL=Math.abs(sl)<=.012,conv=w1/w0<=.78;
  let type=null;
  if(flatH&&flatL&&w1/w0>=.78)type='箱型整理';
  else if(conv&&flatH&&sl>.018)type='上升三角形';
  else if(conv&&flatL&&sh<-.018)type='下降三角形';
  else if(conv&&sh<-.018&&sl>.018)type='對稱三角形';
  else if(conv&&sh>.018&&sl>sh+.015)type='上升楔形';
  else if(conv&&sl<-.018&&sh<sl-.015)type='下降楔形';
  else if(!conv&&w1/w0>=.8&&Math.abs(sh-sl)<=.015&&sh>.025&&sl>.025)type='上升通道';
  else if(!conv&&w1/w0>=.8&&Math.abs(sh-sl)<=.015&&sh<-.025&&sl<-.025)type='下降通道';
  if(type){const out=finish(type,H.at,L.at,first,{converging:conv,pivots:h.length+l.length});if(out)options.push(out);}
 }
 // R207: research candidates; never grant breakout certification on geometry alone.
 const extra=[...r207ExtraPatterns(b,t,hi,lo,fit,mean,finish),...r208Broadening(b,t,hi,lo,fit,mean,finish)];
 const ranked=options.find(risk)||options.find(x=>!x.top&&!x.bottom)||options[0]||extra[0];
 if(ranked){const all=[...options,...extra];return {...ranked,alternate:[...new Set(all.filter(x=>x.type!==ranked.type).map(x=>x.type))].join('／'),observations:all.map(x=>({type:x.type,phase:x.phase,research:!!x.research}))};}
 return {status:'none',reason:'未符合已定義的形態候選條件'};
}
// R207: flags, V reversals and cup/handle. Explicit past geometry, current bar excluded from fit.
function r207ExtraPatterns(b,t,hi,lo,fit,mean,finish){
 const out=[], add=x=>{if(x&&!out.some(y=>y.type===x.type))out.push(x);};
 for(const up of [true,false]){
  const dir=up?1:-1;
  for(const w of [8,10,12,14,16,18,20]){
   const start=t-w,h=hi.filter(x=>x.i>=start),l=lo.filter(x=>x.i>=start),H=fit(h),L=fit(l);
   if(!H||!L||h.length<2||l.length<2||h.at(-1).i-h[0].i<4||l.at(-1).i-l[0].i<4)continue;
   const base=b[start][4],pole=b[start-8][4],move=dir*(base-pole)/pole;
   const width0=H.at(start)-L.at(start),width1=H.at(t)-L.at(t),sH=dir*H.m*w/base,sL=dir*L.m*w/base;
   if(move<.10||move>.50||H.err>.012||L.err>.012||width0<base*.015||width1<base*.008||width1>base*.09||width1/width0<.60||width1/width0>1.4||sH>-.012||sL>-.012||Math.abs(sH-sL)>.025)continue;
   const a=b.slice(start,t);if(a.some((x,i)=>x[4]>H.at(start+i)+base*.012||x[4]<L.at(start+i)-base*.012))continue;
   if(up?Math.min(...a.map(x=>x[3]))<base-(base-pole)*.6:Math.max(...a.map(x=>x[2]))>base+(pole-base)*.6)continue;
   if(mean(a.map(x=>x[5]))>mean(b.slice(start-8,start).map(x=>x[5]))*.85)continue;
   add(finish(up?'多方旗形':'空方旗形',H.at,L.at,start,{research:true}));
  }
  // V: fast prior trend and a nearly symmetric sharp reversal, no rounded-bottom label.
  for(const pivot of (up?lo:hi).slice(-3).reverse()){
   const i=pivot.i,k=t-i;if(k<4||k>8||i-k<0)continue;
   const a=b[i-k][4],m=b[i][4],z=b[t][4],left=dir*(a-m)/m,right=dir*(z-m)/m;
   if(left<.10||right<left*.70||right>left*1.45)continue;
   const trend=(from,to,sign)=>{let good=0;for(let j=from+1;j<=to;j++)if(sign*(b[j][4]-b[j-1][4])>0)good++;return good/(to-from)>=.75;};
   if(!trend(i-k,i,-dir)||!trend(i,t-1,dir))continue;
   const u=up?a:pivot.p,l=up?pivot.p:a;add(finish(up?'V形反轉':'倒V形反轉',()=>u,()=>l,i-k,{research:true,bottom:up,top:!up}));break;
  }
  // Cup: two similar rims, rounded middle and a shallow, volume-contracting handle.
  const rims=(up?hi:lo),inner=(up?lo:hi);
  for(const right of rims.slice(-3).reverse()){
   if(t-right.i<4||t-right.i>12)continue;
   for(const left of rims.filter(x=>right.i-x.i>=20&&right.i-x.i<=40).reverse()){
    const len=right.i-left.i,base=(left.p+right.p)/2;if(Math.abs(left.p-right.p)/base>.025)continue;
    const middle=inner.filter(x=>x.i>left.i+len*.25&&x.i<right.i-len*.25).sort((a,b)=>dir*(a.p-b.p))[0];if(!middle)continue;
    const depth=dir*(base-middle.p);if(depth/base<.09||depth/base>.35)continue;
    const zone=(a,z)=>mean(b.slice(Math.ceil(left.i+len*a),Math.floor(left.i+len*z)+1).map(x=>x[4]));
    const q1=zone(0,.2),q2=zone(.2,.4),q3=zone(.4,.6),q4=zone(.6,.8),q5=zone(.8,1);
    if(!(dir*(q1-q2)>depth*.10&&dir*(q2-q3)>depth*.05&&dir*(q4-q3)>depth*.05&&dir*(q5-q4)>depth*.10))continue;
    const handle=b.slice(right.i+1,t);if(handle.length<3||mean(handle.map(x=>x[5]))>mean(b.slice(left.i,right.i+1).map(x=>x[5]))*.85)continue;
    const extreme=up?Math.min(...handle.map(x=>x[3])):Math.max(...handle.map(x=>x[2]));
    if(dir*(base-extreme)<depth*.08||dir*(base-extreme)>depth*.45||handle.some(x=>dir*(x[4]-base)>base*.01))continue;
    const u=up?Math.max(left.p,right.p):extreme,l=up?extreme:Math.min(left.p,right.p);
    add(finish(up?'杯柄形態':'倒杯柄形態',()=>u,()=>l,left.i,{research:true,bottom:up,top:!up}));break;
   }
  }
 }
 // Rounded reversal: U-shaped five segment means; balanced shallow slopes near centre.
 for(const up of [true,false]){
  const dir=up?1:-1;
  for(const w of [30,40,50]){
   const start=t-w, a=b.slice(start,t), n=w/5;
   const q=Array.from({length:5},(_,i)=>mean(a.slice(i*n,(i+1)*n).map(x=>x[4])));
   const rim=(q[0]+q[4])/2,depth=dir*(rim-q[2]);
   if(depth/rim<.07||depth/rim>.35||Math.abs(q[0]-q[4])>depth*.35)continue;
   const steps=[dir*(q[0]-q[1]),dir*(q[1]-q[2]),dir*(q[3]-q[2]),dir*(q[4]-q[3])];
   if(steps.some(x=>x<depth*.12)||steps[0]<steps[1]*1.15||steps[3]<steps[2]*1.15)continue;
   const extreme=up?Math.min(...a.map(x=>x[3])):Math.max(...a.map(x=>x[2]));
   const edge=up?Math.max(...a.slice(0,n).concat(a.slice(-n)).map(x=>x[2])):Math.min(...a.slice(0,n).concat(a.slice(-n)).map(x=>x[3]));
   const centre=a.slice(n,4*n);if(up?Math.min(...centre.map(x=>x[3]))!==extreme:Math.max(...centre.map(x=>x[2]))!==extreme)continue;
   // Require a prior trend, not an arbitrary U-shaped fragment in a flat market.
   const lead=b.slice(start-8,start),prior=mean(lead.slice(0,4).map(x=>x[4]));
   if(lead.length!==8||dir*(prior-q[0])<rim*.025)continue;
   add(finish(up?'圓弧底':'圓弧頂',()=>up?edge:extreme,()=>up?extreme:edge,start,{research:true,bottom:up,top:!up}));break;
  }
  // Island reversal needs TWO non-overlapping full price gaps; an opening gap alone is insufficient.
  for(const w of [1,2,3,4,5,6,7,8]){
   const start=t-w,a=b.slice(start,t),before=b[start-1],now=b[t],high=Math.max(...a.map(x=>x[2])),low=Math.min(...a.map(x=>x[3]));
   const gap=up?Math.min(before[3],now[3])-high:low-Math.max(before[2],now[2]);
   if(gap<before[4]*.002||!a.every(x=>x[5]>0)||now[5]<=0)continue;
   const prior=b[start-6][4];if(dir*(prior-before[4])/prior<.025)continue;
   const u=up?Math.min(before[3],now[3]):low,l=up?high:Math.max(before[2],now[2]);
   add(finish(up?'多方島狀反轉':'空方島狀反轉',()=>u,()=>l,start,{research:true,bottom:up,top:!up}));break;
  }
 }
 return out;
}
// Research-only: widening range and diamond (expansion followed by contraction).
// Fit confirmed alternating pivots; the signal bar is never part of the fit.
function r208Broadening(b,t,hi,lo,fit,mean,finish){
 const out=[], base=mean(b.slice(t-35,t).map(x=>x[4]));
 const segment=(start,end,min)=>{
  const h=hi.filter(x=>x.i>=start&&x.i<=end),l=lo.filter(x=>x.i>=start&&x.i<=end);
  if(h.length<min||l.length<min||h.at(-1).i-h[0].i<(end-start)*.35||l.at(-1).i-l[0].i<(end-start)*.35)return null;
  const ordered=[...h.map(x=>({...x,k:1})),...l.map(x=>({...x,k:-1}))].sort((a,b)=>a.i-b.i);
  if(ordered.slice(1).filter((x,j)=>x.k!==ordered[j].k).length<2*min-1)return null;
  const H=fit(h),L=fit(l);if(!H||!L||H.err>.015||L.err>.015)return null;
  const w0=H.at(start)-L.at(start),w1=H.at(end)-L.at(end),sh=H.m*(end-start)/base,sl=L.m*(end-start)/base;
  if(w0<base*.012||w1<base*.012||b.slice(start,end+1).some((x,j)=>x[4]>H.at(start+j)+base*.015||x[4]<L.at(start+j)-base*.015))return null;
  return {H,L,w0,w1,sh,sl,last:Math.max(h.at(-1).i,l.at(-1).i)};
 };
 for(const w of [24,32,40]){
  const start=t-w,g=segment(start,t-1,3);
  if(g&&t-g.last<=8&&g.sh>.025&&g.sl<-.025&&g.w1/g.w0>=1.5&&g.w1/base>=.08){
   const x=finish('擴散喇叭形',g.H.at,g.L.at,start,{research:true});if(x)out.push(x);break;
  }
 }
 for(const w of [32,40,44]){
  const start=t-w;
  for(const f of [.45,.5,.55]){
   const mid=start+Math.round(w*f),a=segment(start,mid,2),z=segment(mid,t-1,2);
   if(!a||!z||t-z.last>8||a.sh<.02||a.sl>-.02||z.sh>-.02||z.sl<.02||a.w1/a.w0<1.45||z.w1/z.w0>.72||a.w1/base<.07)continue;
   if(Math.abs(a.H.at(mid)-z.H.at(mid))>base*.025||Math.abs(a.L.at(mid)-z.L.at(mid))>base*.025)continue;
   const x=finish('菱形整理',z.H.at,z.L.at,mid,{research:true,converging:true});if(x)out.push(x);break;
  }
  if(out.some(x=>x.type==='菱形整理'))break;
 }
 return out;
}
// R206: divergence uses indicator samples at identical confirmed price pivot dates.
function r206Divergence(bars,date,close){
 const series=r200Series(bars,date,close);if(!series||series.length<55)return [];
 let gain=0,loss=0;const rsi=series.map((x,i)=>{if(!i)return null;const d=x.close-series[i-1].close,g=Math.max(d,0),l=Math.max(-d,0);if(i<=14){gain+=g/14;loss+=l/14;}else{gain=(13*gain+g)/14;loss=(13*loss+l)/14;}return i<14?null:loss===0?(gain===0?50:100):100-100/(1+gain/loss);});
 const t=bars.length-1,results=[];
 for(const top of [true,false]){
  const key=top?2:3,piv=[];
  for(let i=Math.max(26,t-40);i<=t-2;i++){const v=Number(bars[i][key]);if(bars.slice(i-2,i+3).every((x,j)=>j===2||(top?v>Number(x[key]):v<Number(x[key]))))piv.push(i);}
  const j=piv.at(-1);if(j==null||t-j>8)continue;
  const i=piv.slice(0,-1).reverse().find(i=>j-i>=5&&j-i<=30);if(i==null)continue;
  const a=Number(bars[i][key]),b=Number(bars[j][key]);if(top?b<a*1.01:b>a*.99)continue;
  const metrics=[['KD',series[i].k,series[j].k,3],['MACD',series[i].dif/a,series[j].dif/b,.001],['RSI',rsi[i],rsi[j],3]];
  // Relative volume at confirmed price pivots, normalized to each pivot's preceding 20 sessions.
  // Observation only: lower relative volume is not proof of distribution or reversal.
  const volAt=k=>{const w=bars.slice(k-20,k+1);if(w.length!==21||!w.every(r129ValidCandle))return null;const avg=w.slice(0,20).reduce((n,x)=>n+Number(x[5]),0)/20;return avg>0&&Number(w[20][5])>0?Number(w[20][5])/avg:null;};
  const va=volAt(i),vb=volAt(j);if(va!==null&&vb!==null&&vb<=va*.75)results.push({name:'量價',kind:top?'高點量能背離（觀察）':'低點量能收縮（觀察）',first:bars[i][0],second:bars[j][0]});
  for(const [name,x,y,min] of metrics)if(Number.isFinite(x)&&Number.isFinite(y)&&(top?x-y>=min:y-x>=min))results.push({name,kind:top?'頂背離':'底背離',first:bars[i][0],second:bars[j][0]});
 }
 return results;
}
function r206DivergenceHTML(bars,date,close,fresh){
 if(!fresh||!bars)return '';
 const x=r206Divergence(bars,date,close);if(!x.length)return '';
 return `<div class="r203-pattern"><div class="r203-head"><h4>◇ 動能背離觀察</h4><small>非反轉認證</small></div>${x.map(v=>`<small>${esc(v.name+' '+v.kind)}｜${esc(v.first)} → ${esc(v.second)}</small>`).join('')}</div>`;
}
function r203PatternChart(bars,x){
 const from=bars.findIndex(b=>b[0]===x.startDate),a=bars.slice(from<0?-40:from);if(a.length<2||!Number.isFinite(x.nextUpper)||!Number.isFinite(x.nextLower))return '';
 const n=a.length-1,u0=x.upper-(x.nextUpper-x.upper)*n,l0=x.lower-(x.nextLower-x.lower)*n;
 const high=Math.max(u0,l0,x.upper,x.lower,...a.map(b=>Number(b[2]))),low=Math.min(u0,l0,x.upper,x.lower,...a.map(b=>Number(b[3])));
 if(!Number.isFinite(high)||!Number.isFinite(low)||high<=low)return '';
 const y=p=>5+68*(high-p)/(high-low),px=i=>5+174*i/n,fmt=v=>v.toFixed(2),w=Math.max(.9,Math.min(5,105/a.length));
 const candles=a.map((b,i)=>{const [o,h,l,c]=b.slice(1,5).map(Number),col=c>=o?'#ff7887':'#48dba7';return `<line x1="${fmt(px(i))}" x2="${fmt(px(i))}" y1="${fmt(y(h))}" y2="${fmt(y(l))}" stroke="${col}" stroke-width="1"/><rect x="${fmt(px(i)-w/2)}" y="${fmt(Math.min(y(o),y(c)))}" width="${fmt(w)}" height="${fmt(Math.max(1,Math.abs(y(o)-y(c))))}" fill="${col}"/>`;}).join('');
 const line=(a,b,col)=>`<line x1="5" x2="179" y1="${fmt(y(a))}" y2="${fmt(y(b))}" stroke="${col}" stroke-dasharray="4 2" stroke-width="1.3"/>`;
 return `<svg role="img" aria-label="${esc(x.type)}實際日K與形態上下緣" viewBox="0 0 184 88">${candles}${line(u0,x.upper,'#f5d16b')}${line(l0,x.lower,'#48dba7')}<text x="5" y="85" font-size="9" fill="#b7d1df">黃：上緣　綠：下緣</text></svg>`;
}
// R217: close-based 24/60/120-session W/M research, independent of certified breakout risk.
function r217LongDouble(c,bars,sessions){
 const coverage={},found=new Map(),bad=reason=>({coverage,candidates:[],reason});
 const date=c?.date,close=(typeof c?.close==='number'||typeof c?.close==='string'&&c.close.trim()!=='')?Number(c.close):NaN,validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 const num=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')?Number(v):NaN;
 if(c?.assetType==='ETF'||c?.possiblePriceAdjustment||!validDay(date)||!Number.isFinite(close)||close<=0||!Array.isArray(bars)||!Array.isArray(sessions)||!sessions.includes(date))return bad('市場交易日或價格基準待核對');
 if(sessions.some((d,i)=>!validDay(d)||(i&&d<=sessions[i-1])))return bad('市場交易日順序待核對');
 if(bars.some((b,i)=>!Array.isArray(b)||!validDay(b[0])||(i&&b[0]<=bars[i-1][0])))return bad('日K日期順序待核對');
 const ds=sessions.filter(d=>d<=date),by=new Map(bars.filter(b=>b[0]<=date).map(b=>[b[0],b]));
 for(const n of [24,60,120]){
  if(ds.length<n){coverage[n]='short';continue;}
  const days=ds.slice(-n),rows=days.map(d=>by.get(d));
  const cs=rows.map(b=>num(b?.[4]));
  if(bars.filter(b=>b[0]>=days[0]&&b[0]<=date).map(b=>b[0]).join('|')!==days.join('|')||rows.some((b,i)=>{if(!b||b.length<6)return true;const [o,h,l,p,v]=b.slice(1,6).map(num);return ![o,h,l,p,v].every(Number.isFinite)||Math.min(o,h,l,p)<=0||v<0||(v===0&&(o!==p||h!==p||l!==p||(i>0&&p!==cs[i-1])))||h<Math.max(o,p)||l>Math.min(o,p)||i>0&&Math.abs(p/cs[i-1]-1)>.105;})||Math.abs(cs.at(-1)-close)>Math.max(1e-6,close*1e-8)){coverage[n]='invalid';continue;}
  coverage[n]='checked';const piv=[];let i=1;
  while(i<n-2){let j=i;while(j+1<n-1&&cs[j+1]===cs[i])j++;if(j+1>=n-1)break;let k=cs[i]<Math.min(cs[i-1],cs[j+1])?'L':cs[i]>Math.max(cs[i-1],cs[j+1])?'H':null;if(k)piv.push({i:j,k,p:cs[i]});i=j+1;}
  for(let k=0;k+2<piv.length;k++){
   const [x,y,z]=piv.slice(k,k+3),shape=x.k+y.k+z.k,bull=shape==='LHL';if(!bull&&shape!=='HLH')continue;
   const floor=Math.min(x.p,z.p),ceil=Math.max(x.p,z.p),neck=y.p;
   if((ceil-floor)/ceil>.03||(bull?neck/ceil-1:1-neck/floor)<.05)continue;
   if([x,y,z].some(v=>num(rows[v.i][5])<=0))continue;
   const path=cs.slice(z.i+1),active=(v,j)=>num(rows[z.i+1+j][5])>0,cross=v=>bull?v>neck:v<neck,lost=v=>bull?v<neck:v>neck;
   const first=path.findIndex((v,j)=>active(v,j)&&cross(v)),invalid=path.some((v,j)=>active(v,j)&&(bull?v<floor:v>ceil)),reversed=first>=0&&path.some((v,j)=>j>first&&active(v,j)&&lost(v));
   const phase=invalid?'型態失效':num(rows[n-1][5])===0?'無成交待確認':reversed?(cross(path.at(-1))?'重新穿越待認證':'穿越後轉弱'):first===path.length-1?'本日收盤穿越':first>=0?(path.at(-1)===neck?'頸線回測待確認':'曾收盤穿越'):'型態候選';
   const anchors=[x,y,z].map(t=>days[t.i]),key=shape+anchors.join('|'),old=found.get(key);
   if(old){old.windows.push(n);continue;}
   const upper=bull?neck:ceil,lower=bull?floor:neck;
   found.set(key,{type:bull?'W底':'M頭',phase,anchors,startDate:anchors[0],endDate:date,upper,lower,nextUpper:upper,nextLower:lower,neck,windows:[n],research:true});
  }
  // R218 second validation: confirmed five-pivot head/shoulders research only.
  // A two-session neighbourhood removes one-day noise; merge consecutive same-side extrema.
  // Right-hand neighbourhood ends before the signal day, so the signal never confirms its own pivot.
  const hp=[];
  for(const v of piv){
   if(v.i<2||v.i+2>=n-1)continue;
   const w=cs.slice(v.i-2,v.i+3);
   if(v.k==='L'?w.some(p=>p<v.p):w.some(p=>p>v.p))continue;
   const prev=hp.at(-1);
   if(prev?.k===v.k){if(v.k==='L'?v.p<=prev.p:v.p>=prev.p)hp[hp.length-1]=v;}
   else hp.push(v);
  }
  for(let k=0;k+4<hp.length;k++){
   const [a,b,h,d,e]=hp.slice(k,k+5),ps=[a,b,h,d,e],shape=ps.map(v=>v.k).join(''),bull=shape==='LHLHL';
   if(!bull&&shape!=='HLHLH')continue;
   if(ps.some((v,j)=>num(rows[v.i][5])<=0||(j&&v.i-ps[j-1].i<3)))continue;
   const shoulderMax=Math.max(a.p,e.p),shoulderMin=Math.min(a.p,e.p);
   if((shoulderMax-shoulderMin)/shoulderMax>.03)continue;
   if(bull?(h.p>shoulderMin*.95||Math.min(b.p,d.p)<shoulderMax*1.035):(h.p<shoulderMax*1.05||Math.max(b.p,d.p)>shoulderMin*.965))continue;
   if(Math.abs(b.p-d.p)/Math.max(b.p,d.p)>.06)continue;
   const slope=(d.p-b.p)/(d.i-b.i),line=i=>b.p+slope*(i-b.i),neck=line(n-1),next=line(n);
   const path=cs.slice(e.i+1).map((p,j)=>({p,i:e.i+1+j,vol:num(rows[e.i+1+j][5])}));
   if(path.some(v=>line(v.i)<=0||(bull?line(v.i)<=h.p:line(v.i)>=h.p))||next<=0||(bull?next<=h.p:next>=h.p))continue;
   const side=v=>{const l=line(v.i),eps=l*1e-8;return Math.abs(v.p-l)<=eps?0:(bull?v.p>l:v.p<l)?1:-1;};
   let prior=side({p:e.p,i:e.i}),first=-1;for(let j=0;j<path.length;j++){if(path[j].vol<=0)continue;const now=side(path[j]);if(first<0&&now===1&&prior<=0)first=j;prior=now;}const last=path.at(-1);
   const invalid=path.some(v=>v.vol>0&&(bull?v.p<h.p:v.p>h.p)),reversed=first>=0&&path.slice(first+1).some(v=>v.vol>0&&side(v)===-1);
   const phase=invalid?'型態失效':last.vol===0?'無成交待確認':reversed?(side(last)===1?'重新穿越待認證':'穿越後轉弱'):first===path.length-1?'本日收盤穿越':first>=0?(side(last)===0?'頸線回測待確認':'曾收盤穿越'):'型態候選';
   const anchors=ps.map(v=>days[v.i]),key=shape+anchors.join('|'),old=found.get(key);
   if(old){old.windows.push(n);continue;}
   found.set(key,{type:bull?'頭肩底':'頭肩頂',phase,anchors,startDate:anchors[0],endDate:date,upper:bull?neck:h.p,lower:bull?h.p:neck,nextUpper:bull?next:h.p,nextLower:bull?h.p:next,neck,windows:[n],research:true});
  }
  // R218 round 3: longer geometry research, not a screening signal.
  if(n>=60){
   const t=n-1, mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
   const fit=a=>{if(a.length<3)return null;const mx=mean(a.map(x=>x.i)),my=mean(a.map(x=>x.p)),den=a.reduce((z,x)=>z+(x.i-mx)**2,0);if(!den)return null;const m=a.reduce((z,x)=>z+(x.i-mx)*(x.p-my),0)/den;return {m,at:i=>my+m*(i-mx),err:Math.max(...a.map(x=>Math.abs(x.p-my-m*(x.i-mx))))/my};};
   const addLong=(type,start,upper,lower,ids,anchorEnd=t-1)=>{
    const u=upper(t),l=lower(t),nu=upper(t+1),nl=lower(t+1),pu=upper(t-1),pl=lower(t-1);
    if(![u,l,nu,nl,pu,pl].every(Number.isFinite)||l<=0||pl<=0||nl<=0||u<=l||nu<=nl||pu<=pl)return;
    const eps=cs[t]*1e-8,now=cs[t],prev=cs[t-1],volume=num(rows[t][5]);
    const phase=volume===0?'無成交待確認':Math.abs(now-u)<=eps||Math.abs(now-l)<=eps?'頸線回測待確認':now>u+eps?(prev<=pu+eps?'本日收盤穿越':'已在上緣上方'):now<l-eps?(prev>=pl-eps?'本日收盤穿越':'已在下緣下方'):'型態候選';
    const direction=phase==='本日收盤穿越'?(now>u+eps?1:-1):0;
    const expected=/底|^杯/.test(type)?1:/頂|倒杯/.test(type)?-1:0;
    const interpretation=direction===0?'':expected===0?(direction>0?'向上穿越觀察':'向下穿越觀察'):direction===expected?(direction>0?'向上突破觀察':'向下失守觀察'):(direction>0?'偏空型態失效待確認':'偏多型態失效警戒');
    const anchors=ids.map(i=>days[i]),key=type+'|'+anchors.join('|'),old=found.get(key);if(old){if(!old.windows.includes(n))old.windows.push(n);return;}
    found.set(key,{type,phase,direction,interpretation,anchors,startDate:days[start],endDate:date,upper:u,lower:l,nextUpper:nu,nextLower:nl,neck:/底|^杯/.test(type)?u:/頂|倒杯/.test(type)?l:null,windows:[n],research:true});
   };
   for(const width of [50,60,80,100]){
    if(t<width)continue;const start=t-width,h=hp.filter(v=>v.i>=start&&v.k==='H'&&num(rows[v.i][5])>0),l=hp.filter(v=>v.i>=start&&v.k==='L'&&num(rows[v.i][5])>0),H=fit(h),L=fit(l);
    if(!H||!L||H.err>.012||L.err>.012||h.at(-1).i-h[0].i<width*.45||l.at(-1).i-l[0].i<width*.45||t-Math.max(h.at(-1).i,l.at(-1).i)>12)continue;
    const first=Math.min(h[0].i,l[0].i),base=mean(cs.slice(first,t)),w0=H.at(first)-L.at(first),w1=H.at(t)-L.at(t),sh=H.m*(t-first)/base,sl=L.m*(t-first)/base;
    if(w0<base*.035||w1<base*.005||w1/w0>.78||cs.slice(first,t).some((v,j)=>v>H.at(first+j)+base*.012||v<L.at(first+j)-base*.012))continue;
    const type=Math.abs(sh)<=.012&&sl>.018?'上升三角形':Math.abs(sl)<=.012&&sh<-.018?'下降三角形':sh<-.018&&sl>.018?'對稱三角形':null;
    if(type)addLong(type,first,H.at,L.at,[...h,...l].map(v=>v.i).sort((a,b)=>a-b));
   }
   for(const up of [true,false]){
    const dir=up?1:-1,rims=hp.filter(v=>v.k===(up?'H':'L')&&num(rows[v.i][5])>0),inner=hp.filter(v=>v.k===(up?'L':'H')&&num(rows[v.i][5])>0);
    for(const right of rims.filter(v=>t-v.i>=5&&t-v.i<=20).reverse()){
     for(const left of rims.filter(v=>right.i-v.i>=41&&right.i-v.i<=90).reverse()){
      const len=right.i-left.i,base=(left.p+right.p)/2;if(Math.abs(left.p-right.p)/base>.025)continue;
      const mid=inner.filter(v=>v.i>left.i+len*.25&&v.i<right.i-len*.25).sort((a,b)=>dir*(a.p-b.p))[0];if(!mid)continue;
      const depth=dir*(base-mid.p);if(depth/base<.09||depth/base>.35)continue;
      const q=Array.from({length:5},(_,i)=>mean(cs.slice(left.i+Math.floor(len*i/5),left.i+Math.floor(len*(i+1)/5)+1)));
      if(!(dir*(q[0]-q[1])>depth*.10&&dir*(q[1]-q[2])>depth*.05&&dir*(q[3]-q[2])>depth*.05&&dir*(q[4]-q[3])>depth*.10))continue;
      const handle=cs.slice(right.i+1,t),hv=rows.slice(right.i+1,t).map(b=>num(b[5])),cv=rows.slice(left.i,right.i+1).map(b=>num(b[5]));
      if(handle.length<4||hv.some(v=>v<=0)||mean(hv)>mean(cv)*.85||handle.some(v=>dir*(v-base)>base*.01))continue;
      const extreme=up?Math.min(...handle):Math.max(...handle);if(dir*(base-extreme)<depth*.08||dir*(base-extreme)>depth*.45)continue;
      addLong(up?'杯柄形態':'倒杯柄形態',left.i,()=>up?Math.max(left.p,right.p):extreme,()=>up?extreme:Math.min(left.p,right.p),[left.i,mid.i,right.i]);
     }
    }
    for(const w of [60,80,100]){
     const start=t-w;if(start<8)continue;const a=cs.slice(start,t),seg=w/5,q=Array.from({length:5},(_,i)=>mean(a.slice(i*seg,(i+1)*seg))),rim=(q[0]+q[4])/2,depth=dir*(rim-q[2]);
     if(depth/rim<.07||depth/rim>.35||Math.abs(q[0]-q[4])>depth*.35)continue;
     const steps=[dir*(q[0]-q[1]),dir*(q[1]-q[2]),dir*(q[3]-q[2]),dir*(q[4]-q[3])];if(steps.some(v=>v<depth*.12)||steps[0]<steps[1]*1.15||steps[3]<steps[2]*1.15||dir*(mean(cs.slice(start-8,start-4))-q[0])<rim*.025)continue;
     const extreme=up?Math.min(...a):Math.max(...a),ix=a.indexOf(extreme);if(ix<seg||ix>=4*seg)continue;
     const edges=a.slice(0,seg).concat(a.slice(-seg)),edge=up?Math.max(...edges):Math.min(...edges);
     addLong(up?'圓弧底':'圓弧頂',start,()=>up?edge:extreme,()=>up?extreme:edge,[start,start+ix,t-1]);
    }
   }
  }


 }
 return {coverage,candidates:[...found.values()].sort((a,b)=>b.anchors[2].localeCompare(a.anchors[2])||b.startDate.localeCompare(a.startDate)),reason:Object.values(coverage).includes('checked')?'':'完整交易日價量待核對'};
}
function r217LongHTML(c,tech){
 if(state.mode==='demo'||c?.assetType==='ETF')return '';
 const x=r217LongDouble(c,tech?.reason?null:tech?.bars,r214Sessions?.dates);
 const cover=[24,60,120].map(n=>n+'日 '+({checked:'已查',short:'不足',invalid:'待核對'}[x.coverage[n]]||'待核對')).join('｜');
 const rows=['W底','M頭','頭肩底','頭肩頂','杯柄形態','倒杯柄形態','圓弧底','圓弧頂','上升三角形','下降三角形','對稱三角形'].map(t=>x.candidates.find(v=>v.type===t&&v.phase==='本日收盤穿越')||x.candidates.find(v=>v.type===t)).filter(Boolean);
 return `<div class="r203-pattern" aria-label="多週期型態研究"><div class="r203-head"><h4>◇ 多週期型態研究</h4><small>${esc(cover)}</small></div>${rows.length?rows.map(v=>`<div class="r203-shape"><div class="r203-meta"><b>${esc(v.type)}｜${esc(v.phase)}${v.interpretation?`（${esc(v.interpretation)}）`:""}</b><small>${esc(v.windows.join('／'))}日範圍｜${esc(v.endDate)}</small><small>${v.neck==null?`上緣 ${r194Price(v.upper)}／下緣 ${r194Price(v.lower)}`:`頸線 ${r194Price(v.neck)}`}</small></div>${r203PatternChart(tech.bars.filter(b=>b[0]<=c.date),v)}</div>`).join(''):`<div class="r203-none">${esc(x.reason||'未找到符合研究門檻的多週期型態')}</div>`}<small>收盤價轉折研究（3%容差、5%深度；頭肩間隔至少3日、兩日轉折確認；長週期杯柄、圓弧與三角形暫定研究門檻），不改變原正式篩選或防守價；公司行動完整性尚待核對。</small></div>`;
}

function r202PatternHTML(c,tech,fresh){
 const x=tech?.bars&&!tech.reason?r202Pattern(tech.bars,c.date,Number(c.close)):{status:'unknown',reason:tech?.reason||'日K待核對'};
 if(x.status!=='ok')return `<div class="r203-pattern" aria-label="形態觀察"><div class="r203-head"><h4>◇ 技術形態觀察</h4><small>${x.status==='none'?'尚無明確形態':'待核對'}</small></div><div class="r203-none">${esc(x.reason)}</div></div>`;
 const risk=/跌破|失守|突破收回/.test(x.phase),close=Number(c.close),delta=v=>r164Pct((v/close-1)*100),level=x.bottom?'形態頸線':'形態上緣';
 const cell=(label,v,colour,showGap=true)=>`<div><small>${label}</small><strong${colour?' class="'+colour+'"':''}>${r194Price(v)}</strong>${showGap?`<small class="${v>close?'r164-positive':v<close?'r164-negative':''}">${delta(v)}</small>`:''}</div>`;
 const next=fresh&&Number.isFinite(x.nextUpper)&&x.nextUpper>x.nextLower&&x.nextLower>0?`<small>隔日${level} ${r194Price(x.nextUpper)}｜下緣 ${r194Price(x.nextLower)}</small>`:'';
 return `<div class="r203-pattern" aria-label="形態觀察"><div class="r203-head"><h4>◇ 技術形態觀察</h4><span class="r203-phase ${risk?'r164-negative':''}">${esc(x.phase)}</span></div><div class="r203-shape"><div class="r203-meta"><b>${esc(x.type)}</b><small>${esc(x.startDate)} 起</small><small>${fresh?'盤後':'歷史'}觀察${tech.etf?'｜已知配息調整':''}</small><small>量比 ${x.ratio===null?'待核對':x.ratio.toFixed(2)+'倍'}</small></div>${r203PatternChart(tech.bars,x)}</div><div class="r203-price-grid">${cell('現價',close,'',false)}${cell(level,x.upper,'')}${cell(x.top?'形態頸線／失守': '下緣／失守參考',x.lower,'')}</div><div class="r203-checks">${next}<small>收盤：${esc(x.phase)}</small><small>量能：${x.ratio===null?'待核對':x.ratio>=1.5?'量比≥1.5（觀察）':'量比未達1.5'}</small>${x.top&&x.phase==='形態候選'?'<small>高檔反轉候選，尚未跌破頸線</small>':''}${x.late?'<small>接近收斂末端，突破需再確認</small>':''}${x.alternate?`<small>另有 ${esc(x.alternate)} 候選，形態重疊待確認</small>`:''}${(x.observations||[]).filter(o=>o.research&&o.type!==x.type).map(o=>`<small>研究候選：${esc(o.type)}｜${esc(o.phase)}</small>`).join('')}${x.research?'<small>新增研究型態，尚未完成歷史驗證，不單獨認證或剔除。</small>':''}</div><small>${x.research?'形態關卡不取代大量K頸線；本型態僅供研究觀察。':'形態關卡不取代大量K頸線；向下失守納入風險排除，形態候選不直接認證買點。'}</small></div>`;
}

function r200CrossCard(c,data,indexOnly=false){
 const date=c?.date,tech=indexOnly?null:r201TechnicalInput(c),stock=indexOnly?null:r200Forecast(tech?.bars,date,data?.close,!!data?.fresh&&!tech?.pending&&state.mode!=='demo',!data?.ok||!!tech?.reason||state.mode==='demo');
 const ix=indexOnly?c?.bars:r201Benchmark(c,true);
 const indexFresh=state.mode!=='demo'&&!!ix&&ix.at(-1)?.[0]===date&&date===state.payload?.asOf&&!chaopanEodFreshness(date).stale&&(!indexOnly||!!data?.fresh);
 const index=r200Forecast(ix,date,indexOnly?data?.close:Number(ix?.at(-1)?.[4]),indexFresh,state.mode==='demo');
 const levels=[];
 if(!indexOnly&&stock?.fresh&&data?.ok){for(const m of data.mas||[])if(r194ValidPrice(m.touch)&&m.touch>data.close)levels.push(['MA'+m.n+'觸線',m.touch]);const neck=c.assetType==='ETF'?null:numeric(latestNeck(c)),pressure=c.assetType==='ETF'?null:numeric(r103ConditionalLevels(c,{close:data.close,rebound:null,breakout:null})?.rebound);for(const [name,v] of [['頸線',neck],['壓力',pressure]])if(r194ValidPrice(v)&&v>data.close)levels.push([name,v]);}
 if(indexOnly&&index?.fresh){for(const n of [5,10,20]){const v=ix.slice(-(n-1)).reduce((s,b)=>s+Number(b[4]),0)/(n-1);if(v>index.close)levels.push(['MA'+n+'觸線',v]);}}
 levels.sort((a,b)=>a[1]-b[1]);const unique=levels.filter((x,i)=>i===0||Math.abs(x[1]-levels[i-1][1])>1e-8).slice(0,3);
 const alerts=[...(stock?[stock.kd,stock.macd]:[]),...(index?[index.kd,index.macd]:[])].filter(x=>x.warning),death=alerts.some(x=>x.direction==='死亡'),gold=alerts.some(x=>x.direction==='黃金');
 const scenario=[stock?.kd,index?.kd].some(x=>x?.downsideScenario);
 const summary=death&&gold?'交叉預警分歧｜留意反彈與轉弱':death?'出現死亡交叉預警｜留意防守':gold?'出現黃金交叉預警｜觀察反彈':scenario?'KD下跌情境警戒｜非已發生交叉':(stock?.fresh||index?.fresh)?'可核對項目目前無符合預警條件':'資料不足或非最新，暫不預警';
 return `<section class="r164-panel r200-panel r200-cross"><style>${R200_CSS}</style><div class="r200-title"><b>◇ KD／MACD 交叉預判</b><small>${esc(date||'日期待核對')} 盤後</small></div><div class="r200-grid">${indexOnly?'':r200CrossCells(stock,c.assetType==='ETF'?'ETF':'個股','元')}${r200CrossCells(index,c.market==='上櫃'?'櫃買':'大盤','點')}</div><div class="r200-summary">${summary}</div>${indexOnly||state.mode==='demo'?'':r202PatternHTML(c,data?.ok?tech:{reason:'行情待核對'},!!data?.fresh&&!tech?.pending)+r217LongHTML(c,data?.ok?tech:{reason:'行情待核對'})}${!indexOnly&&stock?.fresh&&!tech?.reason?r206DivergenceHTML(tech?.bars,date,Number(c.close),true):''}${tech?.reason?`<small class="r200-note">個股／ETF交叉停判：${esc(tech.reason)}</small>`:''}${tech?.pending?'<small class="r200-note">近期已知除息日，暫停隔日預警，待除息後日K核對。</small>':''}${tech?.etf?`<small class="r200-note">已知現金配息調整 ${tech.adjusted} 次（以昨收減配息估算）；完整公司行動歷史未核對，僅供觀察。</small>`:''}${!index?'<small class="r200-note">對應指數完整同日日K待核對，未提供指數交叉預判。</small>':''}<div class="r200-levels"><b>反彈觀察關卡</b>${unique.length?unique.map(([n,v],i)=>`<span>第${i+1}關 ${n} <b>${r194Price(v)}</b></span>`).join(''):'<span>暫無可確認上方關卡</span>'}</div><details class="r203-explain"><summary>交叉公式與限制（不保證交叉或反彈）</summary><small class="r200-note">KD(9,3,3)：以最近8日高低範圍及高低擴張情境估算；MACD(12,26,9)：DIF＝DEA理論價。原預警依收平情境或近線且差距收斂。KD另以0.75倍近14日平均真實波幅（最少以收盤0.5%為基準）模擬下跌，假設近期高低範圍不另擴張（必要時納入假設收盤）。歷史研究顯示可減少漏報但增加誤報；僅情境提醒，不保證交叉或反彈，不作減碼或選股否決。個股未還原；ETF僅調整已知現金配息。</small></details></section>`;
}

function r194CostCard(data,cost,qty){
 return `<section class="r164-panel r194-cost-card" aria-label="成本防守試算"><div class="r194-cost-head"><strong>◈ 均線防守試算</strong><button class="r194-cost-edit" type="button">修改成本</button></div><small class="r194-cost-note">未輸入成本：技術走勢｜輸入後：各均線損益</small><div class="r194-body">${r194CostHTML(data,cost,qty)}</div></section>`;
}
function r194BindCost(root,input){
 const box=root.querySelector('.r194-cost-card');if(!box)return ()=>{};
 const body=box.querySelector('.r194-body');
 const avg=root.querySelector('.r200-average-body');
 box.querySelector('.r194-cost-edit')?.addEventListener('click',()=>input?.focus());
 return (data,cost,qty)=>{body.innerHTML=r194CostHTML(data,cost,qty);if(avg)avg.innerHTML=r200AverageHTML(data,cost,qty);};
}

function nextSessionDefenseCard(c){
 r164EnsureStyle();
 const code=String(c?.code||''),key='chaopan-r82-cost-'+code,
 qtyKey='chaopan-r91-qty-'+code,modeKey='chaopan-r92-mode-'+code;
 let cost='',qty='',mode='medium';
 try{
  const savedMode=localStorage.getItem(modeKey);if(['short','medium','long'].includes(savedMode))mode=savedMode;
  const stored=localStorage.getItem(key),q=localStorage.getItem(qtyKey);
  if(stored!==null&&Number(stored)>0)cost=String(Number(stored));
  if(q!==null&&Number.isSafeInteger(Number(q))&&Number(q)>0&&Number(q)<=1e8)qty=String(Number(q));
 }catch(e){}
 const data=r164Data(c),close=numeric(c?.close),p=close!==null&&close>0?close:NaN;
 const advice=r176Advice(c,data);
 const insGate=c?.assetType!=='ETF'&&data.fresh?R143StrictRisk.audit(c,c.date):null;
 const insWarning=insGate?.signals?.includes('institutional_selling')||insGate?.signals?.includes('institutional_watch')?insGate.reasons.filter(r=>r.includes('外資投信')).join('；'):'';
 const eventStage=data.fresh&&c?.assetType!=='ETF'?r204Stage(c):null;
 const eventAudit=eventStage?R143StrictRisk.breakoutAudit(c,eventStage):null;
 const eventWarning=eventAudit?.signals?.includes('continuation_sell_watch')?eventAudit.reasons.join('；'):'';
 const plan=r99Action(c,cost===''?NaN:Number(cost),qty===''?NaN:Number(qty),mode);
 const priceLimits=data.fresh?r164LimitBand(c):null;
 return `<section class="r82-decision r91-decision r164-board r165-reference r176-main-card" data-code="${esc(code)}" aria-label="明日持股操作同頁圖形總覽">
 <div class="r176-main-banner"><span>明日持股操作</span><strong>自動策略｜<span class="r174-auto-mode" aria-live="polite">${esc(r174AutoMode(cost===''?NaN:Number(cost),p))}</span></strong></div>
 <div class="r176-banner-date">${esc(c?.date||'日期待核對')} 盤後 · R220 ｜ 持有週期 <select class="r92-mode" aria-label="持有週期"><option value="short" ${mode==='short'?'selected':''}>短線（5／10日）</option><option value="medium" ${mode==='medium'?'selected':''}>中期（20日）</option><option value="long" ${mode==='long'?'selected':''}>長期（60日）</option></select></div>
 ${r164MABox(c,data)}
 <div class="r176-top-position"><section class="r164-panel r164-position"><div class="r164-inputs">
  <label>成本（元）<input class="r82-cost-input" type="number" inputmode="decimal" min="0" step="any" value="${esc(cost)}" placeholder="成本" /></label>
  <label>股數（股）<input class="r91-qty-input" type="number" inputmode="numeric" min="1" step="1" value="${esc(qty)}" placeholder="股數" /></label>
 </div><div class="r164-pnlbox r91-pnl" aria-live="polite">${r164PnlHTML(cost===''?NaN:Number(cost),qty===''?NaN:Number(qty),p)}</div></section>
 <section class="r164-panel r176-strategy r174-auto-panel"><small>自動策略</small><strong class="r176-strategy-status">${esc(r174AutoMode(cost===''?NaN:Number(cost),p))}</strong></section>
 </div>
 <div class="r176-risk-layout"><section class="r164-panel r164-action-preview"><div class="r164-quick-action">${r164ActionPreview(plan,c,data)}</div></section>
 <section class="r164-panel r176-advice"><h3>▤ 建議操作</h3><strong>${esc(advice.title)}</strong><p>${esc(advice.body)}</p>${r204PatternRisk(c)?`<p style="color:#f5ce65">⚠ ${esc(r204PatternRisk(c).reasons.join('；'))}｜排除突破候選</p>`:''}${insWarning?`<p style="color:#f5ce65">⚠ ${esc(insWarning)}｜不認證突破</p>`:''}${eventWarning?`<p style="color:#f5ce65">⚠ ${esc(eventWarning)}｜暫不認證續強</p>`:''}</section></div>
 ${r174IndexCompare(c)}
 ${r200CrossCard(c,data)}
 ${r194CostCard(data,Number(cost),Number(qty))}${r200AverageCard(data,Number(cost),Number(qty))}
 <div class="r176-slim-panels">${r164DefenseBox(c,data)}${r164KeyBox(c,data)}</div>
 ${r174StockSupportAlert(c,data)}
 <div class="r164-price-limit">${priceLimits?`<span>漲幅參考 <b class="r164-positive">${r164Fmt(priceLimits.up)} (${r164Pct(100*(priceLimits.up/data.close-1))})</b></span><span>跌幅參考 <b class="r164-negative">${r164Fmt(priceLimits.down)} (${r164Pct(100*(priceLimits.down/data.close-1))})</b></span>`:'<span>特殊／非最新交易日：漲跌停價格待交易所核對</span>'}</div>
 <div class="r176-bottom-caption">價格為盤後觀察參考，非自動委託；有缺資料即顯示待核對</div>
 </section>`;
}
function r82BindCost(card,c){
 const input=card.querySelector('.r82-cost-input'),qtyInput=card.querySelector('.r91-qty-input'),pnl=card.querySelector('.r91-pnl'),modeInput=card.querySelector('.r92-mode'),auto=card.querySelector('.r174-auto-mode'),quick=card.querySelector('.r164-quick-action');
 if(!input||!qtyInput||!pnl||!quick)return;
 const refreshCostDefense=r194BindCost(card,input);
 const key='chaopan-r82-cost-'+String(c.code||''),qtyKey='chaopan-r91-qty-'+String(c.code||''),modeKey='chaopan-r92-mode-'+String(c.code||'');
 const update=()=>{
  const cost=input.value.trim()===''?NaN:Number(input.value),qty=qtyInput.value.trim()===''?NaN:Number(qtyInput.value),mode=modeInput?.value||'medium';
  const a=r99Action(c,cost,qty,mode);
  const data=r164Data(c);quick.innerHTML=r164ActionPreview(a,c,data);pnl.innerHTML=r164PnlHTML(cost,qty,numeric(c.close));refreshCostDefense(data,cost,qty);
  const strategyName=r174AutoMode(cost,numeric(c.close));
  if(auto)auto.textContent=strategyName;
  const chip=card.querySelector('.r176-strategy-status');if(chip)chip.textContent=strategyName;
  (card.querySelector('.r164-board')||card).classList.toggle('r164-protect-mode',strategyName==='獲利保護');
  try{
   if(Number.isFinite(cost)&&cost>0)localStorage.setItem(key,String(cost));else localStorage.removeItem(key);
   if(Number.isSafeInteger(qty)&&qty>0&&qty<=1e8)localStorage.setItem(qtyKey,String(qty));else localStorage.removeItem(qtyKey);
   if(modeInput)localStorage.setItem(modeKey,mode);
  }catch(e){}
 };
 input.addEventListener('input',update);qtyInput.addEventListener('input',update);
 modeInput?.addEventListener('change',update);update();
}


function r176Advice(c,data){
 if(!data?.ok)return {title:'資料待核對',body:'行情未通過日K核對；僅保留圖框'};
 const ma=data.mas?.[0]?.today, close=data.close, support=numeric(supportLines(c)[0]?.lower);
 if(support!==null&&close<support)return {title:'支撐已失守 · 確認風險',body:'比對收盤、量價與大盤，不以觸價直接賣'};
 if(close<ma)return {title:'位於MA5下方 · 防守觀察',body:'先看收盤是否站回與支撐是否守住'};
 return {title:'MA5上方 · 續看趨勢',body:support===null?'歷史支撐待核對；不以站上均線認定支撐安全':'結合量價與關鍵價位，不單憑均線決定'};
}
function r176ResearchMini(c){
 const date=String(c?.date||''), bars=Array.isArray(c?.bars)?c.bars:[];
 const hist=bars.length>=26&&bars.at(-1)?.[0]===date&&bars.slice(-26).every(b=>r129ValidCandle(b));
 const ins=r208Institution(c),goodIns=Boolean(ins);
 const insDefs=[['外資','foreignNetShares'],['投信','trustNetShares'],['自營','dealerNetShares']];
 const insMax=goodIns?Math.max(1,...insDefs.map(([,k])=>Math.abs(Number(ins[k])))):1;
 const insRows=insDefs.map(([name,k])=>{
  const v=goodIns?Number(ins[k]):null,dist=goodIns?Math.max(8,100*Math.abs(v)/insMax):0;
  return `<div class="r176-metric-row"><small>${name}</small><b class="${goodIns?r164PctColor(v):''}">${goodIns?(c?.assetType==='ETF'?r190EtfLots(v):`${v>0?'+':''}${r164Fmt(Math.round(v/1000))}張`):'待核對'}</b></div><div class="r176-mini-bar"><i style="--mini-pct:${dist}%;--mini-color:${v>0?'#fa6f7d':'#3ee2ab'}"></i></div>`;
 }).join('');
 const tech=hist?r201TechnicalInput(c):null;
 const indicator=hist&&tech?.bars?indicatorSnapshot({...c,bars:tech.bars}):null;
 const indRows=[['RSI',indicator?.rsi,100],['MACD',indicator?.macd,null],['KD(K)',indicator?.k,100]].map(([label,val,scale])=>{
  const valid=Number.isFinite(val);
  const w=valid?scale?Math.max(0,Math.min(100,val)):Math.min(100,Math.abs(val)*2):0;
  return `<div class="r176-metric-row"><small>${label}</small><b>${valid?r164Fmt(val):'待核對'}</b></div><div class="r176-mini-bar"><i style="--mini-pct:${w}%;--mini-color:${val<0?'#3ee2ab':'#eabc50'}"></i></div>`;
 }).join('');
 let svg='';
 if(hist){
  const slice=bars.slice(-34);const highs=slice.map(v=>Number(v[2]));const lows=slice.map(v=>Number(v[3]));const hi=Math.max(...highs),lo=Math.min(...lows),delta=Math.max(hi-lo,hi*.005),maxVol=Math.max(1,...slice.map(b=>Number(b[5])));
  const py=p=>4+53*(hi-p)/delta;const candleW=184/slice.length;let body='';
  slice.forEach((b,i)=>{const [_,o,h,l,cl,v]=b.map((x,j)=>j===0?x:Number(x)),x=5+i*candleW+candleW/2,col=cl>=o?'#fa6f7d':'#44e2af';
   body+=`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${py(h).toFixed(1)}" y2="${py(l).toFixed(1)}" stroke="${col}" stroke-width="1.3"/><rect x="${(x-candleW*.28).toFixed(1)}" y="${Math.min(py(o),py(cl)).toFixed(1)}" width="${Math.max(1,candleW*.56).toFixed(1)}" height="${Math.max(1,Math.abs(py(o)-py(cl))).toFixed(1)}" fill="${col}"/><rect x="${(x-candleW*.28).toFixed(1)}" y="${(66+17*(1-v/maxVol)).toFixed(1)}" width="${Math.max(1,candleW*.56).toFixed(1)}" height="${(17*v/maxVol).toFixed(1)}" fill="${col}" opacity=".7"/>`;
  });
  svg=`<svg role="img" aria-label="最近34根已核對日K，紅漲綠跌" viewBox="0 0 194 88" preserveAspectRatio="none"><line x1="0" y1="62" x2="194" y2="62" stroke="#366b77"/>${body}</svg>`;
 }
 const evidence=r209LargeKEvidence(c);
 const overhead=hist?overheadResistance(c):null,nearest=overhead?.levels?.[0];
 const largeNote=hist?`<small>近34根日K｜${evidence.neck?'結構頸線 '+r164Fmt(evidence.neck.price):'頸線待核對'}</small><small>${evidence.old?'歷史量K '+esc(evidence.old.date)+'｜高 '+r164Fmt(evidence.old.high)+'｜'+r164Fmt(evidence.old.lots)+'張':'歷史量K待核對'}</small><small>${nearest?'最近上方壓力 '+r164Fmt(nearest.low)+'｜'+r164Pct(nearest.distance):'上方壓力 '+esc(overhead?.status||'待核對')}</small>`:'<small>歷史日K待核對</small>';
 return `<div class="r176-research-grid" aria-label="同頁法人動向、技術指標與歷史大量K">
 <section class="r176-research-mini"><h3>♧ 法人動向</h3>${insRows}<small>${goodIns?'同日法人資料':'資料未取得'}</small></section>
 <section class="r176-research-mini"><h3>⌁ 技術指標</h3>${indRows}<small>${tech?.reason?esc(tech.reason):hist?(tech?.etf?'已知配息調整；歷史待核對':'依日K計算'):'日K不足'}</small></section>
 <section class="r176-research-mini r176-large-k"><h3>▥ 歷史大量K</h3>${svg||'<small>日K不足，無法顯示</small>'}${largeNote}<button type="button" class="r176-chart-reveal">完整K線圖 ⌄</button></section>
 </div>`;
}
function defenseHistory(bars, maxBars=60){
 if(!Array.isArray(bars))return [];
 const start=Math.max(25,bars.length-Math.max(1,maxBars));
 const events=[];
 for(let i=start;i<bars.length;i++){
  const result=defensiveEarlyWarning({bars:bars.slice(0,i+1),date:bars[i]?.[0]});
  if(['zero','first','second'].includes(result.stage))events.push({index:i,date:String(bars[i][0]),stage:result.stage,text:result.text});
 }
 return events;
}
function defenseHistoryText(c){
 const bars=c?.bars||[];
 if(bars.length<26)return '歷史防守：K線不足26根，無法回放';
 const events=defenseHistory(bars,60),last=events.slice(-5);
 if(!last.length)return '最近60根K棒：沒有第0根／第一根／第二根防守訊號（不代表未曾轉弱）';
 const label={zero:'第0根前兆',first:'第一根轉弱',second:'第二根轉弱'};
 return `歷史防守（最近60根）：${last.map(e=>`${e.date} ${label[e.stage]}`).join('｜')}`;
}
function guidanceCard(c){
 // r81: detail tab builds the single observation card; no duplicate initial markup.
 return '';
}
/* r41 CANDIDATE: Detail-only presentation split. Existing scanner, battle card,
 * chart renderer, sector rankings and trading calculations remain unchanged. */

function arrangeR41Detail(c){
 r164EnsureStyle();
 const root=$('#modalContent'),chart=root.querySelector(':scope > .chart-area');
 if(!chart)return;
 const original=[...root.children],advanced=[];
 for(const el of original){
  if(el===chart)continue;
  if(el.classList.contains('detail-title'))continue;
  if(el.classList.contains('priority-levels')){advanced.push(el.outerHTML);el.remove();continue;}
  if(el.id==='detailSwitcher'||el.classList.contains('r41-detail-tabs')||el.classList.contains('r41-detail-page')){el.remove();continue;}
  advanced.push(el.outerHTML);el.remove();
 }
 const head=root.querySelector(':scope > .detail-title');
 if(head){
  const marketChange=numeric(c.changePct),quoteClass=r164PctColor(marketChange);
  head.classList.add('r164-detail-heading','r176-detail-heading');
  const industryLabel=String(c.industry||c.fundamentals?.industry||'').trim();
  head.innerHTML=`<div class="r164-heading-id"><small>STOCK ANALYSIS / ${esc(c.market||'台股')} · R220</small>${esc(c.code)} ${esc(c.name)}${industryLabel?`<span class="r169-industry">${esc(industryLabel)}</span>`:''}</div><div class="r164-heading-quote"><strong>${price(c.close)}</strong><small class="${quoteClass}">${pct(c.changePct)}</small></div>`;
 }
 const page=document.createElement('div');page.className='r176-one-page';page.setAttribute('aria-label','個股完整單頁操作儀表板');
 const card=document.createElement('div');card.innerHTML=nextSessionDefenseCard(c);r82BindCost(card,c);page.append(card);
 const extra=document.createElement('div');extra.innerHTML=r176ResearchMini(c);page.append(extra);
 const details=document.createElement('details');details.className='r176-full-chart';
 details.open=Boolean(state.r176ChartOpen&&state.r176ChartCode===c.code);
 details.addEventListener('toggle',()=>{state.r176ChartOpen=details.open;state.r176ChartCode=c.code;});
 const summary=document.createElement('summary');summary.textContent='K線完整分析｜20／60／120日・價量・費波・缺口';details.append(summary);details.append(chart);page.append(details);
 const expl=document.createElement('div');expl.className='r176-bottom-caption';expl.textContent='法人、技術與大量K依已核對日K及資料來源顯示；無資料不補數字。';page.append(expl);
 root.append(page);
 page.querySelector('.r176-chart-reveal')?.addEventListener('click',()=>{details.open=true;state.r176ChartOpen=true;state.r176ChartCode=c.code;details.scrollIntoView({block:'start',behavior:'auto'});});
 page.querySelectorAll('.r167-index-open').forEach(button=>button.addEventListener('click',()=>{
  if(globalThis.ChaopanHomeIndexR168?.open){globalThis.ChaopanHomeIndexR168.open(c);return;}
  details.open=true;
  const target=chart.querySelector('#r167-index-chart')||chart.querySelector('.r162-compare');
  if(target)target.scrollIntoView({block:'start',behavior:'auto'});
  else details.scrollIntoView({block:'start',behavior:'auto'});
 }));
 state.r41Page='card';
 state.r41Advanced={code:c.code,date:c.date,html:advanced.join('')};
}

function r41AdvancedSettingsMarkup(){
 const a=state.r41Advanced;
 if(!a)return '<p>先開啟個股，即可檢視盤後研究資料。</p>';
 if(a.date!==state.payload?.asOf)return '<p>盤後交易日已變更。原研究內容不再沿用，請重新開啟個股取得同日分析。</p>';
 if(state.payload?.asOf&&a.date!==state.payload.asOf)return '<p>最新盤後快照已更新，進階功能使用的個股資料日期不一致。請重新開啟該檔個股，避免將舊價當作今日計畫。</p>';
 return `<p>最近開啟：${esc(a.code)}｜${esc(a.date)} 盤後資料。只使用該筆資料，並非即時報價。</p><div class="r41-advanced-content">${a.html}</div>`;
}
// r22: This is the single automated home-screen gate, not a manually selected ranking lens.
// Only a VERIFIED same-day index+market-breadth feed may authorize a new-entry candidate.
// Without it, the list is honestly empty, rather than mixing in fragile momentum scores.
let autoRowsRef=null,autoIntelRef=null,autoDate='',autoSig='',autoQualifiedCache=[];
function r144AutoSignature(rows){
 return JSON.stringify([r145UniverseStamp(rows),state.marketIntel?.marketTrend?.asOf,
 state.marketIntel?.marketTrend?.authority,state.marketIntel?.indices]);
}
function verifiedAutoFeed(asOf){
 const feed=state.marketIntel?.marketTrend;
 if(!feed||feed.asOf!==asOf||feed.authority!=='verified-official-eod')return null;
 for(const key of ['taiex','otc','breadthTaiex','breadthOtc'])if(feed.sources?.[key]?.status!=='ok')return null;
 return feed;
}
function autoStageEvidence(c,asOf){
 const p=deskEvidence(c),g=ChaopanGuidance.evaluate(c,p,supportLines(c));
 return ChaopanStageV318.inspect(c,asOf,{liquid:Boolean(p.liquid),strongApproved:confirmedStrengthAudit(c).confirmed,
    danger:g.level==='danger',watch:Boolean(p.qualified)});
}
function autoQualifiedEntries(){
 const asOf=state.payload?.asOf||'',rows=state.universe?.rows||[];
 const signature=r144AutoSignature(rows);
 if(rows===autoRowsRef&&state.marketIntel===autoIntelRef&&asOf===autoDate&&signature===autoSig)return autoQualifiedCache;
 autoRowsRef=rows;autoIntelRef=state.marketIntel;autoDate=asOf;autoSig=signature;autoQualifiedCache=[];
 if(!globalThis.ChaopanMainTrendV320||!globalThis.ChaopanStageV318||state.mode!=='live'||
    !state.universe||state.universe.asOf!==asOf||staleDeskSnapshot(asOf))return autoQualifiedCache;
 const feed=verifiedAutoFeed(asOf);if(!feed)return autoQualifiedCache;
 for(const c of rows){
  if(!r204Breakout(c).eligible)continue;
  if(c.date!==asOf||c.riskFirst||['high','medium'].includes(c.riskLevel)||
      c.possiblePriceAdjustment||c.overextended||c.onePriceLimit||
      /假突破|跌破|出貨|賣壓|轉弱|突破失敗|不宜追價/.test([c.followStatus,c.unifiedStage,c.trading?.status].join(' ')) ||
      !liquidityEvidence(c).launch)continue;
  const stage=autoStageEvidence(c,asOf);
  if(!['strong','watch'].includes(stage.kind))continue;
  const decision=ChaopanMainTrendV320.inspect({stock:{market:c.market,date:c.date,bars:c.bars,
    close:c.close,lots:c.lots,possiblePriceAdjustment:c.possiblePriceAdjustment,
    cycle:c.cycle,neck:c.neck,neckDate:c.neckDate},indexHistory:feed.indexHistory,breadth:feed.breadth});
  if(decision.status!=='entry-qualified'||!(Number(decision.stop)>0)||!(Number(decision.entry)>Number(decision.stop))||
      !Number.isFinite(decision.relativeStrength20)||!(decision.riskPct>=1&&decision.riskPct<=8))continue;
  autoQualifiedCache.push({row:c,decision,stage});
 }
 autoQualifiedCache.sort((a,b)=>(b.decision.relativeStrength20-a.decision.relativeStrength20)||
   ((deskEvidence(b.row).score.entry||0)-(deskEvidence(a.row).score.entry||0))||
   String(a.row.code).localeCompare(String(b.row.code),'zh-Hant',{numeric:true}));
 return autoQualifiedCache;
}
function autoTradingCard(entry,i){
 const x=entry.decision;
 const evidence=`<div class="margin-preview"><b>系統自動列入 #${i+1}｜${esc(x.action)}</b>`+
 `<span>盤後參考 ${price(x.entry)}　風險停損 ${price(x.stop)}　2R情境 ${price(x.milestone2R)}　相對強度 ${pct(x.relativeStrength20)}</span></div>`;
 return `<div class="auto-qualified-item">${evidence}${sectorBattleCard(entry.row,{source:'desk',rankText:'自動合格 #'+(i+1)})}</div>`;
}
function autoPendingReason(){
 const day=state.payload?.asOf||'';
 if(!state.universe||state.universe.asOf!==day)return '全市場資料交易日期尚未核對，暫停新買點名單。';
 if(staleDeskSnapshot(day))return '行情非最近可核對交易日，不能作為今日進場清單。';
 if(!verifiedAutoFeed(day))return '加權／櫃買連續指數及市場騰落資料尚未完整認證，目前停止自動新買點。';
 return '本交易日沒有同時通過大盤、價量、支撐、風險與進場條件的股票；不以盤整或疑似出貨股補位。';
}
// r42 EOD preparation radar. A 0–100 observation score is NOT a calibrated next-day win probability.
function r42StageKey(s){return s==='明日續攻候選'?'tomorrow':s==='量縮回測再起'?'r42pullback':'r42pre';}
let r42RowsRef=null,r42Day='',r42ScanCache=null;
function r42Scan(){
 const rows=state.universe?.rows||[],day=state.payload?.asOf||'';
 if(state.mode!=='live'||state.universe?.asOf!==day){r42ScanCache=null;return null;}
 if(rows===r42RowsRef&&day===r42Day&&r42ScanCache)return r42ScanCache;
 r42RowsRef=rows;r42Day=day;
 r42ScanCache=globalThis.ChaopanTomorrowRadar&&state.mode==='live'&&state.universe?.asOf===day?
  ChaopanTomorrowRadar.analyze(rows,day):null;
 return r42ScanCache;
}
// R150: Independent technical-stage refresh. A desk, sector or investor widget
// may fail without taking the stage section with it.
let r150StageTimer=null;
function r150ScheduleStageRefresh(asOf){
 const host=$('#sectorDirectory');if(!host)return;
 host.hidden=false;
 if(!host.textContent.trim())host.innerHTML='<div class="r23-note r150-stage-banner" role="status"><b>技術階段｜正在核對盤後資料</b></div>';
 if(r150StageTimer!==null)clearTimeout(r150StageTimer);
 r150StageTimer=setTimeout(()=>{
  r150StageTimer=null;
  // R151: An initial load without payload must paint '資料待補', not
  // leave the indicator forever on '正在核對盤後資料'.
  if((state.payload?.asOf||'—')!==asOf)return;
  try{sectorDirectory()}
  catch(error){
   console.error('技術階段更新失敗，保留可見資料狀態',error);
   host.innerHTML='<div class="r23-note r150-stage-banner" role="status"><b>技術階段｜資料待補</b><p>目前不能完成盤後階段核對；不表示全市場無訊號。請檢查資料日與更新檔。</p></div>';
  }
 },40);
}
function renderTradeDesk(onlyDesk=false){return r185Scoped(()=>renderTradeDeskR185(onlyDesk))}
function renderTradeDeskR185(onlyDesk=false){
 const current=state.payload?.asOf||'—';
 // R150: Schedule the stage independently BEFORE running any desk/relative
 // strength code that might fail. This also covers missing #deskList.
 if(!onlyDesk)r150ScheduleStageRefresh(current);
 const target=$('#deskList');
 if(!target)return;
 const result=r42Scan(),picks=staleDeskSnapshot(current)?[]:(result?.candidates||[]).filter(x=>r204Breakout(x.row).eligible);
 const showing=Math.min(picks.length,8);
 $('#deskCount').textContent=showing+' 檔';
 const pending=staleDeskSnapshot(current)||!result;
 $('#deskNote').textContent=`資料截止 ${current} 盤後｜${pending?'資料非最新可核對交易日／尚未完整載入，請勿直接依此交易':'已突破候選，不代表買進指令'}｜排名分數不是上漲機率。`;
 r33PriorityRows=picks.slice(0,8).map(x=>({row:x.row,stage:r204Breakout(x.row).stage,sector:x.row.industry||'產業待核對',
  reason:x.reason,quality:x.score,snapshot:x.snapshot,
  compactStatus:`${r204Breakout(x.row).stage==='first'?'有效突破第一根':'突破續強'} · 觀察品質 ${x.score}/100（非勝率）`}));
 const disclosure=$('#deskDisclosure');
 if(disclosure&&!disclosure.open){
  target.innerHTML='<div class="desk-loading">點開「明日攻擊候選」查看盤後預備名單；個股點入後仍是原本的作戰字卡。</div>';
 }else target.innerHTML=r33PriorityRows.length?
  `<div class="r23-note">${esc(current)} 盤後篩選 ${result.validated}/${result.inspected} 檔有效資料。${pending?'⚠ 這是歷史快照，請等最新資料：':''}僅已通過突破條件，仍須核對頸線、量能與防守；名單按技術條件排序，不是隔日漲幅預測。</div>${r26GroupMarkup('desk-priority',r33PriorityRows)}`:
  '<div class="desk-empty"><b>目前沒有通過資金流動性、產業領漲、趨勢與防守審查的明日攻擊股。</b><p>當大盤廣度偏弱或只有少數低價股拉抬時，寧可空名單；不以今日漲幅、技術低標或相對抗跌湊數。</p></div>';
 try{renderRelativeStrength()}catch(error){console.warn('相對強勢更新異常，不影響技術階段',error)}
 if(!onlyDesk)setTimeout(()=>{
  if(state.payload?.asOf!==current)return;
  try{if(state.universe?.asOf===current)renderSectorPulse(allRows())}
  catch(error){console.warn('族群觀察更新異常，不影響技術階段',error)}
  try{renderRelativeStrength()}catch(error){console.warn('相對強勢更新異常，不影響技術階段',error)}
 },40);
}
const lensMemo=new WeakMap();
function lensEvidence(c){
 const stamp=r145RowStamp(c)+'|'+String(state.payload?.asOf||'');
 const cached=lensMemo.get(c);if(cached?.stamp===stamp)return cached.value;
 const data=RadarLenses.evaluate(c,{ma:maReadout(c),phase:breakoutReadout(c),follow:continuationReadout(c),
  audit:confirmedStrengthAudit(c),liquidity:liquidityEvidence(c),baseScore:strengthScore(c),baseEligible:isStrengthCandidate(c)});
 lensMemo.set(c,{stamp,value:data});return data;
}
function lensRankedCandidates(lens=state.rankLens){return deskRankedCandidates(lens)}
function currentRankLabel(){return state.rankLens==='launch'?'起漲雷達':'飆股雷達'}
function sixtyCandidates(){return lensRankedCandidates().slice(0,60)}
function previousSixty(){try{return JSON.parse(localStorage.getItem(sixtyKey+'-'+state.rankLens)||'null')}catch(e){return null}}
function sixtyChanges(current){
 const previous=previousSixty(), codes=current.map(x=>x.code);
 const changes=previous && previous.asOf!==state.payload?.asOf?{
  add:codes.filter(c=>!previous.codes.includes(c)),
  drop:previous.codes.filter(c=>!codes.includes(c))
 }:null;
 if(state.mode==='live' && state.payload?.asOf && (!previous||previous.asOf!==state.payload?.asOf)){
   try{localStorage.setItem(sixtyKey+'-'+state.rankLens,JSON.stringify({asOf:state.payload.asOf,codes}))}catch(e){}
 }
 return changes;
}
// Every tab exports the exact complete list for the selected trading-date snapshot,
// independent of the 30-card pagination. Strength 20/60 are recalculated each day;
// previous-day lists must be kept via date-labelled exports rather than reused as picks.
// Independent from early-launch ranking: longstanding winners must not be
// discarded before checking their as-of historical MA5/MA10 evidence.
const HISTORY_510_STAGES=new Set(['ma510','ma510range','ma510recent']);
function isHistoricalMa510(c,group){
 const e=continuationReadout(c);
 if(group==='ma510recent')return e.recentCloseHold5===true&&e.recentCloseHold10===true;
 if(e.strictMA510Hold!==true||Number(e.daysSinceBreakout)<2)return false;
 return group==='ma510'?e.source==='既有大量K突破事件':
        group==='ma510range'?e.source==='歷史32日區間高點':false;
}
function historicalMa510Candidates(group){
 return allRows().filter(c=>r204Breakout(c).eligible&&isHistoricalMa510(c,group)).sort((a,b)=>
   (Number(continuationReadout(b).consecutiveCloseMA510)||0)-(Number(continuationReadout(a).consecutiveCloseMA510)||0) ||
   (Number(continuationReadout(b).daysSinceBreakout)||0)-(Number(continuationReadout(a).daysSinceBreakout)||0) ||
   String(a.code).localeCompare(String(b.code)));
}
function activeSelection(){
 const search=state.query.trim()||state.tab==='star';const records=filtered();
 return {records,label:search?'全市場查詢／非進場名單':'系統自動認證名單',total:records.length};
}
function exportCsvRecords(records,label){
 if(!records.length){toast(`目前「${label}」沒有股票可以匯出`);return}
 const columns=['資料交易日','名單分類','分類內名次','全市場強勢名次','股票代號','股票名稱','上市上櫃','產業',
 '收盤價','漲跌百分比','近期頸線','盤中跨越參考價','原突破頸線','首次突破日期','突破階段','第二根評估',
 '第一根收盤','第二根收盤','第二根量比第一根','5日均線','10日均線','20日均線',
 '連續收在原頸線上方日數','延續追蹤階段','歷史突破日期','歷史基準價','歷史守穩交易日數','歷史參考來源','20日平均成交量張','20日平均每日成交金額百萬元','可交易性分類','當日成交量張','成交量倍數','第一支撐下界','第一支撐上界',
 '強勢分數','交易風險級別','R145嚴格量價狀態','R145量價風險原因','風險提示','當日狀態','資料來源','排行視角','視角內名次','視角指數（非勝率）','近5日漲幅％','近10日漲幅％','近20日漲幅％','注意風險','發動潛力','進場品質','下日觀察價','追高警戒','原頸線失守參考','保守風險預算參考','策略階段','是否優先觀察'];
 const fullRanking=new Map(rankedUniverse().map((c,i)=>[rowId(c),i+1]));
 const lensOrder=new Map(lensRankedCandidates().map((c,i)=>[rowId(c),i+1]));
 const asOf=String(state.payload?.asOf||'日期待資料');
 const csvRows=[columns,...records.map((c,i)=>{
   const m=maReadout(c),b=breakoutReadout(c),k=techMetrics(c),sup=supportLines(c)[0];
   return [asOf,label,i+1,fullRanking.get(rowId(c))??'',c.code,c.name,c.market,c.industry||c.fundamentals?.industry,
    c.close,c.changePct,latestNeck(c),c.intradayPlan?.crossPrice,m.originalNeckline||b.level,b.initialDate||m.breakoutDate,
    b.label,b.assessment,b.firstClose,b.secondClose,b.secondVsFirstVolumeRatio,
    m.ma5,m.ma10,m.ma20,m.necklineHoldDays,continuationReadout(c).label,continuationReadout(c).breakoutDate,continuationReadout(c).originalNeckline,continuationReadout(c).holdDays,continuationReadout(c).source,k.avg20,liquidityEvidence(c).avgAmountM,liquidityEvidence(c).label,c.lots,c.volumeRatio,sup?.lower,sup?.upper,
    rankingScore(c),c.riskLevel,r133RiskGate(c).status,r133RiskGate(c).reasons.join('；'),(Array.isArray(c.riskReasons)?c.riskReasons.join('；'):(c.riskReasons||'')),c.unifiedStage,state.mode==='demo'?'示範資料':'盤後公開資料', currentRankLabel(),lensOrder.get(rowId(c))??'',lensEvidence(c).score[state.rankLens],lensEvidence(c).returns.r5,lensEvidence(c).returns.r10,lensEvidence(c).returns.r20,lensEvidence(c).flags.join('；'),deskEvidence(c).score.potential,deskEvidence(c).score.entry,deskEvidence(c).trigger,deskEvidence(c).chase,deskEvidence(c).defense,deskEvidence(c).riskBudget,deskEvidence(c).stage||deskEvidence(c).momentumStage,deskEvidence(c).priority?'盤中優先觀察':'否'];
 })];
 downloadPlain('\ufeff'+csvRows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n'),
  `超盤手_${label}_${asOf}_${records.length}檔.csv`,'text/csv;charset=utf-8;');
 toast(`已匯出「${label}」共 ${records.length} 檔，日期 ${asOf}`);
}
function downloadPlain(body,filename,mime){
 const blob=new Blob([body],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function exportCurrent(){const {records,label}=activeSelection();exportCsvRecords(records,label)}
function exportSixty(){exportCsvRecords(sixtyCandidates(),`當日${currentRankLabel()}前60名`)}
function exportCurrentCodes(){
 const {records,label}=activeSelection();if(!records.length){toast('目前沒有可匯出的股票代號');return}
 const asOf=String(state.payload?.asOf||'日期待資料');
 downloadPlain(records.map(c=>c.code).join('\r\n')+'\r\n',`超盤手_${label}_股票代號_${asOf}_${records.length}檔.txt`,'text/plain;charset=utf-8;');
 toast(`已匯出 ${records.length} 檔代號；是否能直接匯入券商須核對其格式`);
}
async function copySixty(){
 const list=sixtyCandidates();if(!list.length){toast('目前沒有候選名單');return}
 const value=list.map(x=>x.code).join(',');
 try{await navigator.clipboard.writeText(value);toast(`已複製 ${list.length} 檔代號`)}catch(e){toast('複製失敗，請使用CSV下載')}
}
function showSixty(){
 const records=sixtyCandidates(),changed=sixtyChanges(records);
 const rows=records.map((c,i)=>`<button type="button" class="rank-modal-row" data-rank-stock="${esc(rowId(c))}"><strong>#${i+1} ${esc(c.code)} ${esc(c.name)}</strong><span>${esc(currentRankLabel())}指數 ${lensEvidence(c).score[state.rankLens]}｜${esc(c.unifiedStage||'待資料')}｜觸發 ${price(c.intradayPlan?.crossPrice)}</span></button>`).join('');
 const delta=changed?`<p style="font-size:13px">相較上次資料日：新進 ${changed.add.length} 檔，移出 ${changed.drop.length} 檔</p>`:'<p style="font-size:13px">首次開啟或同資料日期，尚無可比對的昨日名單。</p>';
 $('#modalContent').innerHTML=`<div class="eyebrow">STRENGTH RANK / TOP 60</div><h2 id="modalTitle">${esc(currentRankLabel())}前60名</h2><p>盤後資料：${esc(state.payload?.asOf||'—')}｜首頁、此表與CSV使用目前選定的排行視角；飆股榜可能包含高波動，請看風險標記。不是買進名單。</p>${delta}<div class="action-row"><button id="sixtyCsv" class="primary-action">下載前60名 CSV</button><button id="sixtyCopy" class="secondary-action">複製股票代號</button></div><div class="rank-modal-list">${rows||'<p>尚無候選股票</p>'}</div>`;
 $('#sixtyCsv').onclick=exportSixty;$('#sixtyCopy').onclick=copySixty;
 $$('#modalContent [data-rank-stock]').forEach(btn=>btn.onclick=()=>showDetails(btn.dataset.rankStock));
 $('#modalOverlay').hidden=false;document.body.style.overflow='hidden';
}
function setupSixtyToolbar(){
 if($('#sixtyToolbar'))return;
 const wrap=document.createElement('div');wrap.id='sixtyToolbar';wrap.className='daily-export-toolbar';
 wrap.innerHTML='<div class="daily-export-note"><b>系統自動判斷，不用切換篩選。</b> 名單未經指數與交易條件驗證時保持空白。搜尋可以查看其他股票，不代表值得買進。</div><div class="action-row"><button type="button" id="currentExport" class="primary-action">下載自動合格名單CSV／目前搜尋</button><button type="button" id="currentCodes" class="secondary-action">下載對應股票代號</button></div>';
 const anchor=$('#infoBanner');anchor.parentNode.insertBefore(wrap,anchor);
 $('#currentExport').onclick=exportCurrent;$('#currentCodes').onclick=exportCurrentCodes;
}

function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
function loadWatch(){try{state.watch=new Set(JSON.parse(localStorage.getItem('radar-watchlist')||'[]'))}catch(e){state.watch=new Set()}}
function saveWatch(){localStorage.setItem('radar-watchlist',JSON.stringify([...state.watch]))}
function setTab(tab){state.tab=tab;state.visible=30;$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));renderList();$('#candidateList').scrollIntoView({behavior:'smooth',block:'nearest'})}
function modeName(){return state.mode==='demo'?'示範資料':state.mode==='live'?'盤後資料':state.mode==='warming'?'歷史累積中':state.mode==='partial'?'上市櫃資料不同步':'尚未建立'}
// V3.1.1-r4 NONBLOCKING EOD REFRESH
// Read a coherent previous trading-day snapshot immediately and validate it in
// the background. A 2MB+ universe download is skipped ONLY if the published
// file validator (ETag or Last-Modified+Content-Length) proves unchanged.
// Missing data and stale trading dates are never silently relabeled as live.
let loadRun=0,refreshBusy=false;
// Keep the existing r3 cache across upgrades: changing this name each
// release forces the phone to redownload the 2000-stock universe.
const EOD_CACHE='chaopan-eod-data-v311-r3';
let lastUniverseRaw=null;
const eodUrl=name=>new URL('./data/'+name,location.href).href;
const isValidRadar=obj=>obj&&/^\d{4}-\d{2}-\d{2}$/.test(String(obj.asOf||''))&&Array.isArray(obj.candidates);
const isValidUniverse=(obj,date)=>Boolean(obj&&obj.asOf===date&&Array.isArray(obj.rows)&&obj.rows.length>500);
function stampStatus(msg){const target=$('#dataStatus');if(target)target.textContent=msg;}
function pauseForPaint(){return new Promise(resolve=>setTimeout(resolve,0));}
async function cachedResponse(name){
 if(!('caches' in window))return null;
 try {const cache=await caches.open(EOD_CACHE);return await cache.match(eodUrl(name));}
 catch(e){console.info('沒有可用的離線快照',name);return null}
}
async function cachedJson(name){
 const response=await cachedResponse(name);
 if(!response)return null;
 try{return await response.json()}catch(e){return null}
}
async function fetchEod(name,timeoutMs){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
 try {
  // No ?t=Date.now() and no cache:'no-store'. Let the browser send validators
  // and reuse locally held bytes when GitHub Pages responds 304 Not Modified.
  const r=await fetch(eodUrl(name),{cache:'no-cache',signal:ctl.signal});
  if(!r.ok)throw Error(name+' HTTP '+r.status);
  // Do not persist a truncated or malformed JSON response as a valid snapshot.
  const copy=r.clone();
  const value=await r.json();
  if('caches' in window){try{const cache=await caches.open(EOD_CACHE);await cache.put(eodUrl(name),copy);}catch(e){console.info('快照保存失敗',name)}}
  return value;
 } finally{clearTimeout(timer)}
}
function validatorsMatch(a,b){
 if(!a||!b)return false;
 const oldETag=a.headers?.get?.('ETag'),newETag=b.headers?.get?.('ETag');
 if(oldETag&&newETag)return oldETag===newETag;
 const odate=a.headers?.get?.('Last-Modified'),ndate=b.headers?.get?.('Last-Modified');
 const osize=a.headers?.get?.('Content-Length'),nsize=b.headers?.get?.('Content-Length');
 return Boolean(odate&&ndate&&osize&&nsize&&odate===ndate&&osize===nsize);
}
async function samePublishedUniverse(timeoutMs=2200){
 const previous=await cachedResponse('universe.json');
 if(!previous)return false;
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
 try {
  const head=await fetch(eodUrl('universe.json'),{method:'HEAD',cache:'no-cache',signal:ctl.signal});
  return Boolean(head.ok&&validatorsMatch(previous,head));
 } catch(e){return false}finally{clearTimeout(timer)}
}
function mergeUniverse(obj,univ){
 if(!isValidUniverse(univ,obj.asOf))return null;
 const candidates=new Map((obj.candidates||[]).map(c=>[c.market+'-'+c.code,c]));
 // Always construct rows from the originally fetched JSON, not the already
 // merged in-memory rows, so stale fields cannot contaminate a newer snapshot.
 return {...univ,rows:univ.rows.map(row=>{
   const match=candidates.get(row.market+'-'+row.code);if(!match)return row;
   return {...row,...match,
    bars:row.bars,cycle:row.cycle,breakoutEvent:row.breakoutEvent,breakoutQuality:row.breakoutQuality,breakoutQualityReasons:row.breakoutQualityReasons,
    continuationEligible:row.continuationEligible,abovePrevHigh:row.abovePrevHigh,breakoutVolumeRatio20:row.breakoutVolumeRatio20,breakoutCloseLocation:row.breakoutCloseLocation,breakoutUpperWickRatio:row.breakoutUpperWickRatio,
    riskLevel:row.riskLevel,riskStatus:row.riskStatus,breakoutSequence:row.breakoutSequence,
    continuationContext:row.continuationContext,continuationV303:row.continuationV303,
    riskReasons:row.riskReasons,riskEvidence:row.riskEvidence,supportEvidence:row.supportEvidence,structureV23:row.structureV23,
    intradayPlan:row.intradayPlan,neck:row.neck,neckDate:row.neckDate,distancePct:row.distancePct,
    priceConfirmed:row.priceConfirmed,preLaunch:row.preLaunch,followStatus:row.followStatus,
    launchStage:row.launchStage,tags:row.tags,unifiedStage:row.unifiedStage,
    unifiedScore:row.unifiedScore,unifiedReasons:row.unifiedReasons,relMarket5Pct:row.relMarket5Pct,
    relSector5Pct:row.relSector5Pct,marketProxyNote:row.marketProxyNote,
    opportunityScore:row.opportunityScore,decision:row.decision,industry:row.industry};
 })};
}
function applySnapshot(radar,universe,intel,{cached=false}={}){
 if(universe)lastUniverseRaw=universe;
 state.payload=radar;state.mode=['live','warming','partial'].includes(radar.mode)?radar.mode:'empty';
 state.universe=universe?mergeUniverse(radar,universe):null;
 state.marketIntel=ChaopanIntel.safeMarket(intel,radar.asOf)?intel:null;
 state.loadingExtra=!state.universe;state.cachedSnapshot=cached;
 rankedCacheRows=null;rankedCache=null;rankedCacheStamp='';deskCacheRows=null;deskCacheStamp='';deskCache.clear();sectorRadarCacheRows=null;sectorRadarCacheStamp='';sectorRadarCache=null;
 render();
 R166IndexDaily.ensure();
}
async function loadData(){
 if(refreshBusy){toast('背景核對已進行中；現有資料仍可操作');return}
 refreshBusy=true;const run=++loadRun;
 const btn=$('#refreshBtn');if(btn){btn.disabled=true;btn.classList.add('syncing')}
 const prior=state.payload,priorIntel=state.marketIntel;
 try {
  if(window.__RADAR_PREVIEW__){state.payload=window.__RADAR_PREVIEW__;state.mode='demo';render();return}
  const alreadyVisible=Boolean(state.payload&&state.universe);
  stampStatus(alreadyVisible?'顯示已保存盤後資料 · 背景核對更新中':'讀取本機盤後快照中…');
  // Always keep the previously displayed stocks on screen while checking HTTP.
  if(!alreadyVisible){
   const [radar,univ,intel]=await Promise.all([cachedJson('radar.json'),cachedJson('universe.json'),cachedJson('market-intel.json')]);
   if(run!==loadRun)return;
   if(isValidRadar(radar)&&isValidUniverse(univ,radar.asOf)){
    applySnapshot(radar,univ,intel,{cached:true});
    stampStatus('目前顯示快照 '+radar.asOf+' · 尚未重新核對');
    await pauseForPaint();
   }
  }
  // The small market supplement is requested independently; it can paint
  // without waiting for multi-megabyte universe or repeating an all-stock sort.
  const intelTask=fetchEod('market-intel.json',7000).then(v=>({ok:true,v}),err=>({ok:false,err}));
  let obj;
  try{obj=await fetchEod('radar.json',7000);if(!isValidRadar(obj))throw Error('雷達資料格式無效')}
  catch(e){
   if(run!==loadRun)return;
   stampStatus(state.payload?'伺服器無法核對 · 保留 '+state.payload.asOf+' 快照':'雷達資料無法下載 · 請檢查 GitHub Actions');
   if(!state.payload){state.payload={candidates:[],counts:{},stockCount:0,eligibleCount:0};state.mode='empty';render()}
   console.warn('雷達來源',e);return;
  }
  if(run!==loadRun)return;
  const alreadyLoaded=isValidUniverse(state.universe,obj.asOf);
  const sameRadar=Boolean(state.payload&&JSON.stringify(state.payload)===JSON.stringify(obj));
  // Do not clear index/institutional info while another file is being checked.
  const feedPaint=intelTask.then(result=>{
   if(run!==loadRun)return result;
   if(result.ok&&ChaopanIntel.safeMarket(result.v,obj.asOf)){
    // If the radar day agrees, show the independent indicators immediately.
    if(state.payload?.asOf===obj.asOf){
     state.marketIntel=result.v;
     const el=$('#intelMarket');if(el)el.innerHTML=ChaopanIntel.marketPanel(result.v,obj.asOf);
     institutionalBoard();renderRelativeStrength();
     if(globalThis.ChaopanInvestorV100)ChaopanInvestorV100.mount({radar:state.payload,universe:state.universe,intel:state.marketIntel,mode:state.mode,tomorrow:r42ScanCache,holdings:globalThis.ChaopanPortfolioR140?.load?.()||[],review:globalThis.ChaopanPortfolioR140?.review});
    }
   }
   return result;
  });
  if(alreadyLoaded){
   stampStatus('雷達 '+obj.asOf+' 已核對 · 背景檢查全市場檔案');
  }else stampStatus('雷達 '+obj.asOf+' 已核對 · 等候同交易日全市場資料');
  let univ=null,verified=false,unchanged=false,universeFailure='';
  try{
   if(alreadyLoaded){
    unchanged=await samePublishedUniverse(2200);
    if(unchanged){
     univ=isValidUniverse(lastUniverseRaw,obj.asOf)?lastUniverseRaw:await cachedJson('universe.json');
     verified=isValidUniverse(univ,obj.asOf);
    }
   }
   if(!verified){
    // A full download is sometimes necessary, but NEVER empty existing cards.
    // Fail quickly and make the unverified status visible rather than spinning
    // for >25 seconds on every mobile swipe/refresh.
    univ=await fetchEod('universe.json',10000);
    verified=isValidUniverse(univ,obj.asOf);
    if(!verified)universeFailure='檔案日期或內容不一致';
   }
  }catch(e){universeFailure=e?.name==='AbortError'?'下載逾時':'下載失敗';console.warn('全市場資料',e)}
  if(run!==loadRun)return;
  // Wait only for an independently bounded (7 s) supplement task.
  const mi=await feedPaint;
  if(run!==loadRun)return;
  const intel=mi.ok&&ChaopanIntel.safeMarket(mi.v,obj.asOf)?mi.v:null;
  if(!verified){
   if(alreadyVisible||state.universe){
    stampStatus('全市場'+(universeFailure||'未驗證')+' · 保留 '+(state.payload?.asOf||'舊')+' 快照');
    if(intel&&state.payload?.asOf===obj.asOf){state.marketIntel=intel;render();}
   }else{
    // Render base radar only, but never label it a verified universe.
    state.payload=obj;state.mode=['live','warming','partial'].includes(obj.mode)?obj.mode:'empty';state.loadingExtra=false;render();
    stampStatus('全市場'+(universeFailure||'未驗證')+' · 暫無完整名單');
   }
   return;
  }
  const supplemental=intel||(state.payload?.asOf===obj.asOf&&ChaopanIntel.safeMarket(state.marketIntel,obj.asOf)?state.marketIntel:null);
  if(!(sameRadar&&alreadyLoaded&&unchanged))applySnapshot(obj,univ,supplemental,{cached:false});
  else if(intel){state.marketIntel=intel;render()}
  state.cachedSnapshot=false;state.loadingExtra=false;
  stampStatus('個股資料 '+obj.asOf+' 已核對'+(intel?' · 指數法人依來源顯示':' · 官方補充資料未取得'));
 }finally{if(run===loadRun){refreshBusy=false;if(btn){btn.disabled=false;btn.classList.remove('syncing')}}}
}

async function demoMode(){
  try{const res=await fetch('./data/demo.json'); if(!res.ok)throw new Error('failed');state.payload=await res.json();state.mode='demo';render();toast('已開啟示範畫面：不代表真實行情')}
  catch(ex){toast('無法開啟示範資料')}
}
function render(){return r185Scoped(()=>renderR185())}
function renderR185(){
  r150ScheduleStageRefresh(state.payload?.asOf||'—');
  r131Mount();
  const filterPanel=document.querySelector('#r131Screener'),filterDisclosure=filterPanel?.closest('details');
  if(!filterDisclosure||filterDisclosure.open)r131Render();
  const x=state.payload||{candidates:[],counts:{}};
  const intel=$('#intelMarket');if(intel)intel.innerHTML=ChaopanIntel.marketPanel(state.marketIntel,x.asOf);
  $('#marketDate').textContent=(x.asOf||'—')+(state.mode==='demo'?' · 範例':'');
  const trace=continuationDataSummary();
  $('#dataStatus').textContent=modeName()+(trace.available>0?
    ` · 趨勢資料 ${integer(trace.available)}/${integer(trace.total)} 檔已讀取`:
    ` · 趨勢分析欄位待更新（來源版本：${trace.rulesVersion}）`);
  const counts=x.counts||{};
  // Legacy independent tab counts removed in v2.4. Only unified scan is visible.
  $('#coverageText').textContent=state.mode==='demo'?'示意畫面':`${integer(x.eligibleCount||0)} 檔具足夠歷史 / ${integer(x.stockCount||0)} 檔已收錄`;
  const banner=$('#infoBanner');
  if(state.mode==='demo'){banner.hidden=false;banner.innerHTML='⚠ 你正在查看<strong>示範資料</strong>。數字只供介面操作測試，並非即時行情或全市場掃描結果。 <button class="secondary-action" id="exitDemo">返回實際資料</button>';$('#exitDemo').onclick=loadData;}
  else if(state.mode==='warming'){banner.hidden=false;banner.textContent='資料已開始收集，但歷史K棒尚不足以讓全市場通過120日壓力判讀。請執行歷史回補，並留意資料日期。';}
  else if(state.mode==='partial'){banner.hidden=false;banner.textContent=`⚠ 上市、上櫃交易日資料尚未同步：上市 ${x.marketAsOf?.['上市']||'—'} / 上櫃 ${x.marketAsOf?.['上櫃']||'—'}。目前名單不代表全市場完整掃描，請檢查資料收集日誌。`;}
  else if(state.mode==='live' && x.asOf){banner.hidden=false;const days=(Date.now()-new Date(x.asOf+'T15:00:00+08:00').getTime())/86400000;banner.textContent=days>4?`⚠ 最新資料為 ${x.asOf}，可能尚未更新，請確認 GitHub Actions 工作排程是否成功。`:`最後交易日 ${x.asOf}，資料為盤後收盤價格，不代表現在可以成交的價格。`;}
  else{banner.hidden=false;banner.textContent='尚未連接真實盤後資料。部署到 HTTPS 網站並執行 GitHub Actions「初次回補」後才會自動建立候選名單。';}
  const health=$('#marketHealth');const markets=x.marketBreadth?.markets;
  if(health && markets && state.mode==='live'){
    health.hidden=false;
    health.innerHTML='<b>台股市場廣度｜個股收盤推導，非指數報價</b><br>'+
      ['上市','上櫃'].map(m=>{const k=markets[m]||{};return esc(m)+': 上漲 '+integer(k.up)+' / 下跌 '+integer(k.down)+
      '；站上MA20的股票比例 '+(numeric(k.aboveMa20Pct)===null?'—':Number(k.aboveMa20Pct).toFixed(2)+'%')+'；20日創高 '+integer(k.breakoutHigh20Count)+' 檔'}).join('<br>')+
      '<br><small>市場廣度由當日個股價格推算；收盤指數與法人請以上方具日期資料為準。</small>';
  }else if(health)health.hidden=true;
  const coverage=$('#universeHealth');
  if(coverage){
   if(state.universe){const t=continuationDataSummary();coverage.hidden=false;coverage.textContent=
    `全市場診斷已載入：${integer(state.universe.coverage)} 檔，同一交易日 ${state.universe.asOf}。`+
    `長期趨勢資料 ${integer(t.available)}/${integer(t.total)} 檔；逐日守線可驗證 ${integer(allRows().filter(c=>typeof continuationReadout(c).strictMA510Hold==='boolean').length)} 檔；後端版本 ${t.rulesVersion}。`+
    (t.available===0?' ⚠ 尚未讀到持續強勢分類所需欄位，請上傳V3.0.3兩個scripts並重新執行盤後掃描。':' 先確認已收錄後再套用成交活躍度門檻。')+
    ' 高風險股票仍可搜尋；量價警訊不代表已查得主力真實持股。'}
   else {coverage.hidden=false;coverage.textContent=state.loadingExtra?'全市場資料背景下載中；基本雷達可先查詢。':'⚠ 全市場個股診斷資料未取得、日期不一致或未完成重算。目前只顯示舊版候選股，不能視為已完成V2.4全市場結構掃描。請確認GitHub Actions執行及data/universe.json已發布。'}
  }
  institutionalBoard();
  if($('.advanced-radar')?.open)renderList();
  else{state.rankListDirty=true;const summary=$('#rankSummary');if(summary)summary.textContent='展開進階選股後計算完整排行';}
  renderTradeDesk();
  if(globalThis.ChaopanInvestorV100){
    ChaopanInvestorV100.mount({radar:x,universe:state.universe,intel:state.marketIntel,
      mode:state.mode,tomorrow:r42ScanCache,
      holdings:globalThis.ChaopanPortfolioR140?.load?.()||[],
      review:globalThis.ChaopanPortfolioR140?.review}, {
        onPortfolio:()=>document.querySelector('.nav-item[data-page="star"]')?.click(),
        onTomorrow:()=>{const d=document.querySelector('#deskDisclosure');if(d)d.open=true;d?.scrollIntoView({behavior:'smooth',block:'start'});}
      });
  }
}
function updateSectors(){
 const select=$('#sectorFilter');if(!select)return;
 const names=[...new Set(allRows().map(x=>x.industry||x.fundamentals?.industry).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 const old=state.sector;select.innerHTML='<option value="all">所有產業</option>'+names.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
 state.sector=names.includes(old)?old:'all';select.value=state.sector;
}
// R131: unified condition-based stock screener. Screening is NOT trade certification.
const R131_CONDITIONS=[
 ['all','全部已辨識訊號'],['ready','預備突破頸線'],['ma510','突破前站上 MA5／MA10'],
 ['first','突破第一根'],['second','突破第二根'],['third','突破第三根'],['fourth','突破第四根'],
 ['hold','沿 MA5／MA10 續強'],['maPullback','均線回測防守'],['reentry','量縮回測／再轉強'],
 ['launch','量價啟動'],['trend','六線／主升延續'],['risk','假突破／轉弱警戒']
];
let r131Condition='all';
let r133Bucket='eligible';
let r132Page=0;
const R132_PAGE_SIZE=30;
function r131Signals(c){
 const out=new Set(), phase=String(c?.breakoutSequence?.phase||'');
 const m=techMetrics(c);
 const valid=Number.isFinite(m.ma5)&&Number.isFinite(m.ma10)&&Number.isFinite(Number(c?.close))&&Number(c.close)>0;
 const stage=String(c?.unifiedStage||'');
 const keys=[...(Array.isArray(c?.tags)?c.tags:[])].map(String);
 if(phase==='first'||keys.includes('first'))out.add('first');
 if(phase==='second')out.add('second');
 if(phase==='third'||(phase==='follow'&&c?.cycle?.firstHistoricalBreakout===true&&c?.cycle?.daysSinceFirst===2))out.add('third');
 if(phase==='fourth'||(phase==='follow'&&c?.cycle?.firstHistoricalBreakout===true&&c?.cycle?.daysSinceFirst===3))out.add('fourth');
 if(keys.includes('prep')||/預備突破|接近頸線|頸線前/.test(stage))out.add('ready');
 // R132: MA5/MA10 require verified numerical evidence, not free-text labels.
 if(valid&&Number(c.close)>m.ma5&&Number(c.close)>m.ma10)out.add('ma510');
 if(valid&&Number(c.close)>=m.ma5&&m.ma5>=m.ma10&&m.ma10>0&&Number(c.close)/m.ma5<=1.05)out.add('hold');
 if(valid&&Number(c.close)>=m.ma10&&Math.abs(Number(c.close)/m.ma5-1)<=0.015)out.add('maPullback');
 if(/量縮回測|回測再發動|再度轉強/.test(stage))out.add('reentry');
 if(Number.isFinite(m.avg20)&&m.avg20>0&&Number.isFinite(Number(c?.bars?.at(-1)?.[5]))&&Number(c.bars.at(-1)[5])>=m.avg20*1.5&&Number(c.close)>Number(c.bars.at(-1)[1]))out.add('launch');
 if(/六線|主升/.test(stage))out.add('trend');
 // History-derived stages are visible only inside their risk/observation bucket;
 // never infer a certified breakout merely from a historical candidate.
 const historical=r147HistoricalBreakoutGate(c,c?.date)?.evidence;
 if(historical?.status==='candidate'&&['first','second','third','fourth'].includes(historical.stage))out.add(historical.stage);
 // R160: Avoid a contradictory red risk tag while prices require adjustment.
 const candleAudit=R143StrictRisk.audit(c,c?.date);
 const gapPending=c?.possiblePriceAdjustment===true||(candleAudit.status==='unknown'&&candleAudit.reasons.some(r=>/價格斷層|價格尚未還原|公司行動.*還原|除權息.*還原/.test(String(r))));
 if(!gapPending&&(/假突破|跌破|出貨|賣壓|轉弱|突破失敗/.test([stage,c?.followStatus,c?.trading?.status].join(' '))||candleAudit.status==='risk'||r147HistoricalBreakoutGate(c,c?.date)?.status==='risk'))out.add('risk');
 // Only classify evidence that actually exists; never infer an unverified stage.
 return [...out];
}
// R133: screen eligibility is separate from technical tags; risk cannot be promoted to a bullish candidate.
function r133BaseRiskGate(c){
 const b=Array.isArray(c?.bars)?c.bars:[];
 const last=b.at(-1), prev=b.at(-2);
 const num=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
 const result={status:'unknown',reasons:[]};
 if(c?.possiblePriceAdjustment===true)return {...result,reasons:['公司行動價格尚未還原']};
 if(c?.date&&Array.isArray(last)&&String(last[0])!==String(c.date))return {...result,reasons:['日K與股票日期不一致']};
 if(!Array.isArray(last)||last.length<6)return {...result,reasons:['缺少完整日K']};
 const o=num(last[1]),h=num(last[2]),l=num(last[3]),cl=num(last[4]),v=num(last[5]);
 if([o,h,l,cl,v].some(x=>x===null)||h<l||o>h||o<l||cl>h||cl<l||v<0||l<=0)return {...result,reasons:['日K資料異常']};
 const range=h-l,upper=h-Math.max(o,cl),body=Math.abs(cl-o);
 const upperPct=range>0?upper/range:0;
 const prior=b.slice(-21,-1).map(x=>Array.isArray(x)?num(x[5]):null);
 const validBar=x=>{if(!Array.isArray(x)||x.length<6)return false;
  const z=[x[1],x[2],x[3],x[4],x[5]].map(num);
  return z.every(t=>t!==null)&&z[2]>0&&z[1]>=z[2]&&z[0]>=z[2]&&z[0]<=z[1]&&z[3]>=z[2]&&z[3]<=z[1]&&z[4]>=0;
 };
 const priorBars=b.slice(-21,-1);
 const volReady=prior.length===20&&prior.every(x=>x!==null&&x>=0)&&priorBars.every(validBar);
 const avg=volReady?prior.reduce((a,x)=>a+x,0)/20:null;
 const volRatio=avg>0?v/avg:null;
 const text=[(c?.unifiedStage==='跌破後重新站回／待確認'?'重新站回待確認':c?.unifiedStage),c?.followStatus,c?.trading?.status,c?.riskLevel].filter(Boolean).join(' ');
 const explicitRisk=/假突破|跌破|出貨|賣壓|轉弱|突破失敗|減碼|高風險|風險升高/.test(text);
 const longUpper=range>0&&upperPct>=0.4&&upper>body;
 const distribution=longUpper&&cl<=o&&volRatio!==null&&volRatio>=1.5;
 if(explicitRisk)result.reasons.push('既有策略標示轉弱／賣壓');
 if(distribution)result.reasons.push('放量長上影且收低');
 if(explicitRisk||distribution)return {status:'risk',reasons:result.reasons};
 if(!volReady||avg<=0)return {status:'unknown',reasons:['前20日有效成交量不足']};
 if(c?.unifiedStage==='跌破後重新站回／待確認')return {status:'watch',reasons:['歷史失守後重新站回，待重新認證']};
 if(longUpper)return {status:'watch',reasons:['長上影線，上攻受阻待確認']};
 if(!validBar(prev))return {status:'unknown',reasons:['前一交易日日K資料異常']};
 return {status:'eligible',reasons:['量價未觸發已定義的高風險排除條件']};
}
// R143: ONE conservative EOD risk veto for every bullish list. Risk and missing data
// remain visible in search/holdings and in the four screener buckets.
// R213: a price-only confirmed event failure must not disappear on a missing volume.
// Never reconstruct an event from uncertain prices or promote a row to a bullish list.
function r213PriceRisk(c){
 if(!c||c.possiblePriceAdjustment===true||c.assetType==='ETF')return null;
 const e=r205EventDate(c),a=c.bars;
 const num=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):NaN;
 const level=num(c.breakoutEvent?.level),close=num(c.close);
 if(e.conflict||!e.date||!Array.isArray(a)||!(level>0&&close>0)||a.at(-1)?.[0]!==c.date)return null;
 const i=a.findIndex(b=>b?.[0]===e.date);
 if(i<1||i===a.length-1||a.length-i>160)return null;
 const sample=a.slice(i-1);
 for(let j=0;j<sample.length;j++){
  const b=sample[j];if(!Array.isArray(b)||!r211HoldingDate(b[0]))return null;
  const [o,h,l,cl]=b.slice(1,5).map(num);
  if(![o,h,l,cl].every(Number.isFinite)||l<=0||h<Math.max(o,cl)||l>Math.min(o,cl))return null;
  if(j&&(b[0]<=sample[j-1][0]||Math.abs(cl/num(sample[j-1][4])-1)>.105||Math.abs(o/num(sample[j-1][4])-1)>.105))return null;
 }
 if(Math.abs(num(a.at(-1)[4])-close)>.001||num(a[i-1][4])>level||num(a[i][4])<=level)return null;
 const reasons=[],low=num(a[i][3]),floor=Math.max(level,low);
 const failures=[];
 for(const [value,label] of [[level,'事件頸線'],[low,'首次突破K棒低點']]){
  const hits=a.slice(i+1).filter(b=>num(b[4])<value&&(Number.isNaN(num(b[5]))||num(b[5])>0));
  if(hits.length)failures.push({value,label,first:hits[0],last:hits.at(-1)});
 }
 if(!failures.length)return null;
 // R215: recovery is evidence, not automatic retirement of a historical veto.
 // Require a complete exchange-session reference and positive trading volume for consecutive reclaim counts.
 const dates=typeof r214Sessions!=='undefined'?r214Sessions?.dates:null;
 const expected=Array.isArray(dates)&&dates.includes(e.date)&&dates.includes(c.date)?dates.filter(d=>d>=e.date&&d<=c.date):null;
 const actual=a.slice(i).map(b=>b[0]);
 const aligned=!!expected&&expected.join('|')===actual.join('|');
 let days=0;
 if(aligned){for(let j=a.length-1;j>i;j--){const b=a[j];if(!(num(b[4])>floor&&num(b[5])>0))break;days++;}}
 const last=a.at(-1),current=num(last[4]),traded=num(last[5])>0;
 const recoveryState=current<floor?'below':current===floor?'at_level':!aligned||!traded?'unverified':'reclaimed_pending';
 for(const {value,label,first,last:failureLast} of failures){
  const now=current<value?'；目前收盤低於關卡':current===value?'；目前收盤等於關卡':!aligned||!traded?'；目前價格已站上，交易日／量能待核對':'；目前已站回該關卡（歷史失守仍保留）';
  reasons.push(label+' '+value+' 首次於'+first[0]+'收盤失守（'+num(first[4])+'）'+(failureLast[0]!==first[0]?'；最近失守 '+failureLast[0]:'')+now+(recoveryState==='reclaimed_pending'?'；雙關卡連續站回 '+days+' 日，仍待重新認證':''));
 }
 return {status:'risk',reasons,signals:['r213_confirmed_price_failure'],evidence:{recoveryState,aligned,consecutiveReclaimDays:aligned?days:null,level,breakoutLow:low,historyRetained:true,recertified:false}};
}
function r133RiskGate(c){
 const asOf=state.payload?.asOf;
 if(asOf&&c?.date>asOf)return {status:'unknown',reasons:['個股日期晚於盤後快照，等待同步'],signals:[]};
 const base=r133BaseRiskGate(c),extra=R143StrictRisk.audit(c,c?.date||null);
 // A reconstructed historical breakout that subsequently closes below its
 // reference must be blocked in EVERY shared bullish list, not just stage tabs.
 const observed=r147HistoricalBreakoutGate(c,c?.date);
 const dateGate=asOf&&c?.date!==asOf?{status:'unknown',reasons:['個股與盤後快照日期不同，僅保留歷史警戒']}:null;
 const priceRisk=r213PriceRisk(c);
 const sessionGate=r214SessionGate(c);
 return r147CombineRisk(base,extra,observed,priceRisk,dateGate,sessionGate);
}
function r133ScreenerClass(c){
 const signals=r131Signals(c);let gate=r133RiskGate(c);if(gate.status==='eligible'){const shape=r204PatternRisk(c);if(shape)gate=shape;}
 if(gate.status==='risk')return {bucket:'risk',signals,gate};
 if(gate.status==='watch')return {bucket:'watch',signals,gate};
 if(gate.status==='unknown')return {bucket:'unknown',signals,gate};
 const q=r204Breakout(c);if(!q.eligible){const bucket=q.reason.startsWith('突破事件資料待核對：')?'unknown':'watch';return {bucket,signals,gate:{status:bucket,reasons:[q.reason]}};}
 return {bucket:'eligible',signals:[...signals,q.stage==='first'?'first':'confirmed-follow'],gate:{status:'eligible',reasons:[q.reason]}};
}
function r131Rows(){
 const asOf=state.payload?.asOf;
 if(state.mode!=='live'||!state.universe||state.universe.asOf!==asOf)return [];
 return rankedUniverse().filter(c=>{const r=r133ScreenerClass(c);return c?.date===asOf&&r.bucket===r133Bucket&&
   (r131Condition==='all'||r.signals.includes(r131Condition));});
}
function r131Mount(){
 const host=document.querySelector('.advanced-radar')||document.querySelector('#candidateList')?.parentElement;
 if(!host||document.querySelector('#r131Screener'))return;
 const panel=document.createElement('section');panel.id='r131Screener';panel.style.cssText='margin:12px 0;padding:14px;border:1px solid #35576b;border-radius:14px;background:#0c2432;color:#e7f5fa';
 panel.innerHTML='<div style="font-weight:700;margin-bottom:8px">有效突破篩選｜R220</div><label for="r131Condition" style="display:block;font-size:13px;margin-bottom:6px">突破階段（風險原因另查）</label><select id="r131Condition" style="width:100%;padding:10px;border-radius:8px;background:#173848;color:white;border:1px solid #547382">'+[['all','全部'],['first','突破第一根'],['confirmed-follow','突破續強']].map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select><label for="r133Bucket" style="display:block;font-size:13px;margin:10px 0 6px">篩選結果分區</label><select id="r133Bucket" style="width:100%;padding:10px;border-radius:8px;background:#173848;color:white;border:1px solid #547382"><option value="eligible">綠燈｜已通過突破條件（非買點）</option><option value="watch">黃燈｜未通過／待確認（非買點）</option><option value="risk">紅燈｜出貨疑慮／轉弱警戒</option><option value="unknown">灰燈｜資料不足／待驗證</option></select><p id="r131Summary" style="font-size:12px;color:#b8d1dc;margin:10px 0">等待盤後資料</p><div id="r131Results"></div><div id="r132Pagination" style="display:flex;gap:10px;align-items:center;margin-top:10px"><button type="button" data-r132-page="prev">上一頁</button><span id="r132PageLabel"></span><button type="button" data-r132-page="next">下一頁</button></div>';
 host.insertBefore(panel,host.firstChild);
 const r185Disclosure=panel.closest('details');
 if(r185Disclosure)r185Disclosure.addEventListener('toggle',()=>{if(r185Disclosure.open)r131Render()});
 panel.querySelector('#r131Condition').addEventListener('change',e=>{r131Condition=e.target.value;r132Page=0;r131Render()});
 panel.querySelector('#r133Bucket').addEventListener('change',e=>{r133Bucket=e.target.value;r132Page=0;r131Render()});
 panel.addEventListener('click',e=>{const page=e.target.closest('[data-r132-page]');if(page){const count=r131Rows().length;const max=Math.max(0,Math.ceil(count/R132_PAGE_SIZE)-1);r132Page=Math.max(0,Math.min(max,r132Page+(page.dataset.r132Page==='next'?1:-1)));r131Render();return;}const btn=e.target.closest('[data-r131-stock]');if(btn)showDetails(btn.dataset.r131Stock)});
}
function r131Render(){return r185Scoped(()=>r131RenderR185())}
function r131RenderR185(){
 const el=document.querySelector('#r131Results'),sum=document.querySelector('#r131Summary');if(!el||!sum)return;
 const rows=r131Rows();
 const maxPage=Math.max(0,Math.ceil(rows.length/R132_PAGE_SIZE)-1);r132Page=Math.min(r132Page,maxPage);
 const pageLabel=document.querySelector('#r132PageLabel');if(pageLabel)pageLabel.textContent=`第 ${r132Page+1}／${maxPage+1} 頁`;
 const pageBar=document.querySelector('#r132Pagination');if(pageBar)pageBar.hidden=rows.length<=R132_PAGE_SIZE;
 const prev=pageBar?.querySelector('[data-r132-page=prev]'),next=pageBar?.querySelector('[data-r132-page=next]');if(prev)prev.disabled=r132Page===0;if(next)next.disabled=r132Page>=maxPage;
 sum.textContent=state.mode==='live'&&state.universe?.asOf===state.payload?.asOf?
  `${state.payload.asOf} 盤後｜符合此訊號 ${rows.length} 檔（每頁 30 檔，可翻頁）。依量價與風險分區，僅供觀察；未經回測，不等於突破認證或買進建議。`:
  '全市場盤後資料尚未同步，暫不提供篩選結果。';
 el.innerHTML=rows.slice(r132Page*R132_PAGE_SIZE,(r132Page+1)*R132_PAGE_SIZE).map(c=>{
  const classification=r133ScreenerClass(c);
  const signals=classification.signals.map(k=>R131_CONDITIONS.find(x=>x[0]===k)?.[1]||k).join('、');
  const reason=classification.gate.reasons.join('、');
  return `<button type="button" data-r131-stock="${esc(rowId(c))}" style="width:100%;text-align:left;background:transparent;color:inherit;border:0;border-top:1px solid #315060;padding:12px 3px"><b>${esc(c.code)} ${esc(c.name)}</b><span style="float:right">${price(c.close)}</span><small style="display:block;color:#a9cbd5;margin-top:4px">${esc(signals)}｜${esc(reason)}｜${esc(c.riskLevel||'風險待核對')}</small></button>`;
 }).join('')||'<p style="font-size:13px">目前無符合條件的已辨識訊號，或資料不足。</p>';
}
function filtered(){
 const q=state.query.trim().toLowerCase();
 if(q||state.tab==='star')return rankedUniverse().filter(c=>
  (state.tab!=='star'||state.watch.has(rowId(c)))&&
  (!q||String(c.code).includes(q)||String(c.name).toLowerCase().includes(q)));
 return autoQualifiedEntries().map(x=>x.row);
}
function renderList(){return r185Scoped(()=>renderListR185())}
function renderListR185(){
 const list=$('#candidateList'),more=$('#showMore');if(!list)return;
 if(globalThis.ChaopanPortfolioR140)ChaopanPortfolioR140.mount({visible:state.tab==='star',container:document.querySelector('.content-area'),asOf:state.payload?.asOf||'',rows:state.universe?.rows||[],onOpen:(id)=>showDetails(id)});
 const cards=filtered(),search=state.query.trim()||state.tab==='star';
 const summary=$('#rankSummary');if(summary)summary.textContent=search?
  `這是全市場查詢，結果 ${cards.length} 檔；不等於自動合格買點。`:
  `經市場＋價量＋風險自動驗證 ${cards.length} 檔；不需要手動選擇篩選條件。`;
 if(!cards.length){list.innerHTML=`<div class="empty-state"><h3>${search?'沒有查到符合名稱的股票':'目前沒有完整認證的合格新買點'}</h3>`+
  `<p>${esc(search?'搜尋只供查看K線與風險，請輸入股票名稱或代號。':autoPendingReason())}</p></div>`;
  more.hidden=true;return;}
 const qualified=new Map(autoQualifiedEntries().map((x,i)=>[rowId(x.row),{...x,index:i}]));
 list.innerHTML=cards.slice(0,state.visible).map((c,i)=>{
   const x=qualified.get(rowId(c));return x?autoTradingCard(x,x.index):
   `<div class="ranked-stock"><div class="margin-preview">搜尋／自選檢視，不在經認證進場名單</div>${sectorBattleCard(c,{source:'rank',rankText:'非自動買進候選'})}</div>`;
 }).join('');
 more.hidden=cards.length<=state.visible;
 if(!more.hidden)more.textContent=`再顯示 ${Math.min(30,cards.length-state.visible)} 檔（共 ${cards.length} 檔）`;
}
// V2.2: Structure summary is evidence-based, not an institutional-position claim.
const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const latestNeck=c=>c.structureV23&&Object.prototype.hasOwnProperty.call(c.structureV23,'primaryNeckline')?numeric(c.structureV23.primaryNeckline):numeric(c.structureV23?.neckline)??numeric(c.neck);
// R220: a historical reference is not a currently intact support.
function r220SupportAudit(c,v,sessions=typeof r214Sessions!=='undefined'?r214Sessions?.dates:null){
 const bad=(reason,extra={})=>({status:'unknown',reason,...extra});
 const lo=numeric(v?.lower),hi=numeric(v?.upper),close=numeric(c?.close),bars=c?.bars;
 if(lo===null||hi===null||lo<=0||hi<lo||close===null||close<=0||!Array.isArray(bars)||!bars.length||bars.at(-1)?.[0]!==c.date)return bad('價位或日期待核對');
 if(v.oneDayBreak||v.confirmedBreak||v.historicBreak||close<lo)return {status:'broken',reason:'原支撐警戒／目前收盤低於下緣'};
 if(c.possiblePriceAdjustment||c.assetType==='ETF')return bad('價格調整或ETF還原待核對');
 const origin=v.originDate||v.date,anchor=v.date;
 const i=bars.findIndex(b=>b[0]===origin),j=bars.findIndex(b=>b[0]===anchor);
 if(i<0||j<i||anchor>c.date)return bad('來源日或確認日未能核對');
 if(!['volume','gap','swing','neckRetest'].includes(v.kind))return bad('支撐類型未能核對');
 if((v.kind==='volume'||v.kind==='gap')&&i!==j)return bad('形成日與來源日不一致');
 if((v.kind==='swing'||v.kind==='neckRetest')&&!(Number(v.touches)>=2))return bad('回測次數不足');
 const start=v.kind==='gap'?j-1:v.kind==='swing'?i-2:i;
 const confirmed=v.kind==='swing'?j+2:j;
 if(start<0||confirmed>=bars.length)return bad('轉折確認資料不足');
 const window=bars.slice(start);
 if(!r220ChartWindowOK(window,sessions)||window.some((b,k)=>k&&Math.abs(Number(b[4])/Number(window[k-1][4])-1)>.105))return bad('交易日、價量或價格斷層待核對');
 if(Math.abs(Number(bars.at(-1)[4])-close)>1e-8*Math.max(1,close))return bad('收盤價與K棒不符');
 const tol=0.00051+1e-8*Math.max(1,hi);
 if(v.kind==='volume'&&(Math.abs(Number(bars[j][3])-lo)>tol||Math.abs(Number(bars[j][4])-hi)>tol))return bad('大量K價區與原K棒不符');
 if(v.kind==='gap'){
  const g=detectPriceGaps(window,sessions).find(x=>x.date===anchor&&x.dir==='up');
  if(!g||Math.abs(g.lower-lo)>tol||Math.abs(g.upper-hi)>tol)return bad('缺口來源未核對');
  if(g.filledAt>=0)return {status:'broken',reason:'向上缺口已回補',confirmedDate:anchor};
  return {status:'reference',reason:'缺口剩餘區間',confirmedDate:anchor,lower:g.remainingLower,upper:g.remainingUpper};
 }
 const confirmedDate=bars[confirmed][0],priorBelow=bars.slice(i+1,confirmed+1).some(b=>Number(b[4])<lo),failures=bars.slice(confirmed+1).filter(b=>Number(b[4])<lo);
 // The latest retest date is not proof of the earliest confirmation date.
 // Before that date an observed break cannot prove when support first failed.
 if(failures.length)return {status:'reclaimed_pending',reason:'確認日後曾收盤失守，重新站回待認證',confirmedDate,firstFailure:failures[0][0],lastFailure:failures.at(-1)[0],priorBelow};
 if(priorBelow)return bad('確認日前曾低於下緣，歷史形成過程待核對',{confirmedDate,priorBelow});
 if(Number(bars[confirmed][4])<lo)return bad('確認日收盤低於下緣',{confirmedDate});
 return {status:'reference',reason:'確認日起未觀察到收盤失守（非支撐有效性回測）',confirmedDate,lower:lo,upper:hi};
}
function r220Defense(c){
 const v=c?.structureV23?.mainDefense;if(!v)return null;
 const a=r220SupportAudit(c,v);return a.status==='reference'?{...v,lower:a.lower,upper:a.upper}:null;
}
function supportLines(c){
 const now=numeric(c.close);if(now===null)return [];
 const raw=c.structureV23?.recentSupports?.length?c.structureV23.recentSupports:(c.structureV23?.supports?.length?c.structureV23.supports:(c.supportEvidence?.levels||[]));
 // Only unbroken zones below/near the current price qualify as forward support.
 // Broken zones may become resistance; never label them guaranteed support.
 const unique=[];
 for(const v of raw){
   const lo=numeric(v.lower),hi=numeric(v.upper);
   if(lo===null||hi===null||lo>hi||lo<=0||hi>now*1.005||lo<now*.70||v.oneDayBreak||v.confirmedBreak||v.historicBreak)continue;
   const audit=r220SupportAudit(c,v);if(audit.status!=='reference')continue;
   if(unique.some(x=>Math.abs(x.lower-audit.lower)/now<.014))continue;
   unique.push({...v,lower:audit.lower,upper:audit.upper});
 }
 return unique.sort((a,b)=>b.upper-a.upper).slice(0,3);
}
function structureInsight(c){
 const close=numeric(c.close),neck=latestNeck(c),bands=supportLines(c),risk=c.riskLevel;
 // Match the detail-card risk rule: an old break is not automatically a current break.
 // A confirmed break counts only while the latest close remains below its zone.
 const rawBreaks=[...(c.supportEvidence?.levels||[]),...(c.structureV23?.recentSupports||[]),...(c.structureV23?.supports||[])];
 const broken=rawBreaks.filter(v=>{
   const lo=numeric(v?.lower),hi=numeric(v?.upper);
   return close!==null&&lo!==null&&hi!==null&&lo>0&&hi>=lo&&close<lo&&(v?.oneDayBreak===true||v?.confirmedBreak===true);
 });
 const latestBroken=broken.some(v=>v?.confirmedBreak===true);
 const first=bands[0],second=bands[1],defense=r220Defense(c);
 let status=c.unifiedStage||'資料不足',tone='neutral';
 if(close!==null){
   if(latestBroken){status='支撐確認破位／轉弱';tone='danger'}
   else if(broken.length){status='支撐初破／等待確認';tone='warn'}
   else if(risk==='high'){status='疑似出貨／假突破警戒';tone='danger'}
   else if(risk==='medium'){status='弱勢整理／提高警覺';tone='warn'}
   else if(neck!==null&&close>neck){status='站上大量K頸線';tone='good'}
   else if(first&&close>=first.lower&&neck!==null&&close<neck){status='頸線與支撐之間整理';tone='watch'}
   else if(neck!==null&&close<=neck){status='頸線下觀察／支撐待確認';tone='watch'}
   else{status='結構觀察中';tone='neutral'}
 }
 const reasons=[];
 if(first)reasons.push(`下方最近有效支撐 ${price(first.lower)}～${price(first.upper)} 元`);
 if(neck!==null)reasons.push(`大量K頸線 ${price(neck)} 元`);
 if(broken.length)reasons.push('目前收盤仍低於曾標示破位的支撐區間；須核對該關卡有效性');
 const levelText=first?`收盤跌破 ${price(first.lower)} 元應重新檢查支撐；連續跌破風險加重`:'尚無可確認的鄰近有效支撐，不可憑均線假設安全';
 return {status,tone,first,second,defense,bands,neck,close,levelText,reasons,latestBroken};
}
function indicatorSnapshot(c){
 // Indicators are descriptive only: do not silently turn missing history into buy signals.
 const blank={rsi:null,macd:null,macdSignal:null,obvDelta:null,k:null,d:null,j:null,bollUpper:null,bollMid:null,bollLower:null,pdi:null,mdi:null,adx:null,volumeRatio:null,candle:null};
 // Reject a broken series as a whole. Filtering out bad bars silently shifts
 // indicator windows and can turn stale candles into a false latest signal.
 const bars=Array.isArray(c?.bars)?c.bars:[];
 if(bars.length<35)return blank;
 let previousDate='';
 for(const bar of bars){
  if(!Array.isArray(bar)||bar.length<6)return blank;
  const [date,open,high,low,close,volume]=bar;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return blank;
  const stamp=Date.parse(date+'T00:00:00Z');
  if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==date||date<=previousDate)return blank;
  previousDate=date;
  const o=numeric(open),h=numeric(high),l=numeric(low),c0=numeric(close),v=numeric(volume);
  if([o,h,l,c0,v].some(x=>x===null)||l<=0||h<l||o<l||o>h||c0<l||c0>h||v<0)return blank;
 }
 // Do not label indicators as current when the stock snapshot and last candle disagree.
 if(typeof c.date==='string' && c.date && bars[bars.length-1][0]!==c.date)return blank;
 const hi=bars.map(x=>Number(x[2])),lo=bars.map(x=>Number(x[3])),cl=bars.map(x=>Number(x[4])),vol=bars.map(x=>Number(x[5]));
 const n=cl.length,mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
 const ema=(arr,period)=>{const alpha=2/(period+1);let v=arr[0];return arr.map(x=>(v=alpha*x+(1-alpha)*v))};
 const ema26=ema(cl,26);const macdLine=ema(cl,12).map((x,i)=>x-ema26[i]);
 const signal=ema(macdLine,9);
 let gain=0,loss=0;for(let i=1;i<=14;i++){const d=cl[i]-cl[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0)}gain/=14;loss/=14;
 for(let i=15;i<n;i++){const d=cl[i]-cl[i-1];gain=(gain*13+Math.max(d,0))/14;loss=(loss*13+Math.max(-d,0))/14}
 const rsi=loss===0?(gain===0?50:100):100-100/(1+gain/loss);
 let obv=0;const obvHist=[0];for(let i=1;i<n;i++){obv+=Math.sign(cl[i]-cl[i-1])*vol[i];obvHist.push(obv)}
 let k=50,d=50;for(let i=8;i<n;i++){const h=Math.max(...hi.slice(i-8,i+1)),l=Math.min(...lo.slice(i-8,i+1));const rsv=h===l?50:100*(cl[i]-l)/(h-l);k=(2*k+rsv)/3;d=(2*d+k)/3}
 const last20=cl.slice(-20),mid=mean(last20),sd=Math.sqrt(mean(last20.map(v=>(v-mid)**2)));
 let plus=0,minus=0,tr=0,adx=null;let dxValues=[];
 // Wilder-smoothed 14-period directional movement and true range.
 const dmPlus=[],dmMinus=[],trs=[];
 for(let i=1;i<n;i++){const up=hi[i]-hi[i-1],down=lo[i-1]-lo[i];dmPlus.push(up>down&&up>0?up:0);dmMinus.push(down>up&&down>0?down:0);trs.push(Math.max(hi[i]-lo[i],Math.abs(hi[i]-cl[i-1]),Math.abs(lo[i]-cl[i-1])))}
 if(trs.length>=27){plus=dmPlus.slice(0,14).reduce((a,b)=>a+b,0);minus=dmMinus.slice(0,14).reduce((a,b)=>a+b,0);tr=trs.slice(0,14).reduce((a,b)=>a+b,0);
 {const p=tr?100*plus/tr:0,m=tr?100*minus/tr:0;dxValues.push(p+m?100*Math.abs(p-m)/(p+m):0)}
 for(let i=14;i<trs.length;i++){plus=plus-plus/14+dmPlus[i];minus=minus-minus/14+dmMinus[i];tr=tr-tr/14+trs[i];const p=tr?100*plus/tr:0,m=tr?100*minus/tr:0;dxValues.push(p+m?100*Math.abs(p-m)/(p+m):0)}
 if(dxValues.length>=14){adx=mean(dxValues.slice(0,14));for(let i=14;i<dxValues.length;i++)adx=(adx*13+dxValues[i])/14}}
 const vavg=mean(vol.slice(-21,-1));const range=hi[n-1]-lo[n-1];
 return {rsi,macd:macdLine.at(-1),macdSignal:signal.at(-1),obvDelta:obvHist.at(-1)-obvHist.at(-6),k,d,j:3*k-2*d,bollUpper:mid+2*sd,bollMid:mid,bollLower:mid-2*sd,pdi:tr?100*plus/tr:null,mdi:tr?100*minus/tr:null,adx,volumeRatio:vavg>0?vol.at(-1)/vavg:null,candle:range>0&&vol.at(-1)>0?(cl.at(-1)-lo.at(-1))/range:null};
}

function summaryPanel(c){
 const x=structureInsight(c),s=x.bands;
 const riskText=c.riskLevel==='high'?'高風險':c.riskLevel==='medium'?'需要警戒':c.riskLevel==='low'?'尚無高風險組合':'資料待補';
 const neckDist=x.neck!==null&&x.close!==null&&x.neck>0?100*(x.close/x.neck-1):null;
 const chartLabel=v=>v?`<strong>${price(v.lower)}～${price(v.upper)}</strong><small>${esc(v.label)} · ${esc(v.date)}</small>`:'<strong>資料不足</strong><small>暫無可靠歷史支撐</small>';
 return `<section class="conclusion-card tone-${x.tone}" aria-label="個股最終結論與支撐">
   <div class="panel-head"><span>◎ 單一結構判斷｜${esc(c.date||'資料待補')}</span><b>${esc(riskText)}</b></div>
   <h3>${esc(c.unifiedStage||x.status)}</h3>
   <div class="cycle-alert"><b>新進場：</b>${esc(c.entryReadiness||'等待新版盤後資料')}<br><b>持有追蹤：</b>${esc(c.holdGuidance||'等待新版盤後資料')}<br><b>獲利保護：</b>${esc(c.profitReview||'尚未建立突破事件')}</div><p class="conclusion-short">${esc((c.unifiedReasons||[]).join('；')||'等待同日完整掃描')}</p><p class="conclusion-short">${esc(c.decision||'等待完整資料')}。${esc(x.levelText)}。</p>
   <div class="price-ladder" aria-label="頸線、現價、支撐結構">
    <div class="ladder-line neck"><span>近期主要突破頸線｜${esc(c.structureV23?.necklineState||'突破參考')}</span><b>${price(x.neck)}</b></div>
    <div class="ladder-line current"><span>● 收盤價 ${neckDist===null?'':`｜相對頸線 ${pct(neckDist)}`}</span><b>${price(x.close)}</b></div>
    <div class="ladder-line support"><span>第一支撐</span><div>${chartLabel(s[0])}</div></div>
    <div class="ladder-line secondary"><span>第二支撐</span><div>${chartLabel(s[1])}</div></div>
    <div class="ladder-line defense"><span>最後結構防守｜獨立保留</span><div>${x.defense?chartLabel(x.defense):c.structureV23?.mainDefense?`<strong>待核對</strong><small>原防守 ${price(c.structureV23.mainDefense.lower)}～${price(c.structureV23.mainDefense.upper)}（歷史保留，未認證）</small>`:chartLabel(null)}</div></div>
   </div>
   <p class="conclusion-foot">已取得 ${integer(c.structureV23?.historyDays??c.bars?.length)} 個交易日K線${c.structureV23&&!c.structureV23.historyComplete24m?'，未達24個月，長期關卡僅供暫時判讀':''}。頸線更新不會讓舊防守自動上移；僅實際突破並二次回測才新增支撐。支撐不等於停損保證。</p>
 </section>`;
}
// r71: ranked overhead resistance; estimates historical supply evidence, never live orders.
function overheadResistance(c){
 const bars=c?.bars,close=(typeof c?.close==='number'||typeof c?.close==='string'&&c.close.trim()!=='')?Number(c.close):null;
 if(!Array.isArray(bars)||bars.length<25||!Number.isFinite(close)||close<=0||bars.at(-1)?.[0]!==c.date)return {status:'資料不足／日期未核對',levels:[]};
 if(c.possiblePriceAdjustment===true)return {status:'公司行動價格待核對',levels:[]};
 if(c.assetType==='ETF'){const t=r201TechnicalInput(c);if(t.reason||t.adjusted>0)return {status:'ETF歷史壓力待還原核對',levels:[]};}
 const sessions=r214Sessions?.dates;
 const hist=bars.slice(-120);
 if(!r220ChartWindowOK(hist,sessions))return {status:'歷史壓力交易日／成交量待核對',levels:[]};
 const full=bars.slice(-240),sample=r220ChartWindowOK(full,sessions)?full:hist;
 for(let i=0;i<sample.length;i++){
  const b=sample[i],d=b?.[0],time=typeof d==='string'?Date.parse(d+'T00:00:00Z'):NaN;
  if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==d||(i>0&&d<=sample[i-1][0]))return {status:'歷史K線順序或日期異常',levels:[]};
  if(!r129ValidCandle(b))return {status:'歷史價量待核對',levels:[]};
  if(i>0&&Math.abs(Number(b[4])/Number(sample[i-1][4])-1)>.105)return {status:'歷史價格斷層待核對',levels:[]};
 }
 if(Math.abs(Number(bars.at(-1)[4])-close)>1e-8*Math.max(1,close))return {status:'收盤價與歷史K線不符',levels:[]};
 const candidates=[];
 const add=(v,label,weight=1,detail='')=>{v=(typeof v==='number'||typeof v==='string'&&v.trim()!=='')?Number(v):NaN;if(Number.isFinite(v)&&v>close*(1+1e-8))candidates.push({value:v,label,weight,detail})};
 const n=hist.length,avg20=hist.slice(-21,-1).reduce((sum,b)=>sum+Number(b[5]),0)/Math.min(20,n-1);
 // Use the last confirmed high preceding a later confirmed low for rebound Fibonacci.
 let peak=-1;for(let i=0;i<n;i++)if(peak<0||Number(hist[i][2])>Number(hist[peak][2]))peak=i;
 let trough=-1;for(let i=peak+1;i<n;i++)if(trough<0||Number(hist[i][3])<Number(hist[trough][3]))trough=i;
 if(peak>=0&&trough>peak&&Number(hist[peak][2])>Number(hist[trough][3])){
  const high=Number(hist[peak][2]),low=Number(hist[trough][3]);
  for(const r of [.236,.382,.5,.618,.786,1])add(low+(high-low)*r,`反彈費波 ${(r*100).toFixed(1)}%`,.7,`${hist[peak][0]}高點／${hist[trough][0]}低點`);
 }
 const ma=[20,60,120,240];for(const days of ma)if(sample.length>=days){const v=bars.slice(-days).reduce((sum,b)=>sum+Number(b[4]),0)/days;add(v,`MA${days}`,1.1)}
 const evidence=r209LargeKEvidence(c);
 const dates=new Set(sample.map(b=>b[0]));
 if(evidence.neck&&evidence.neck.date<c.date&&dates.has(evidence.neck.date)){
  const b=sample.find(b=>b[0]===evidence.neck.date),p=evidence.neck.price,tol=1e-8*Math.max(1,p);
  if(p>=Number(b[3])-tol&&p<=Number(b[2])+tol)add(p,'結構頸線',1.8,evidence.neck.date);
 }
 if(evidence.old&&dates.has(evidence.old.date))add(evidence.old.high,'已核對歷史量K高點',1.8,evidence.old.date);
 const byDate=new Map(sample.map(b=>[b[0],b]));
 for(const v of Array.isArray(c.structureV23?.necklines)?c.structureV23.necklines:[]){
  const b=byDate.get(v?.date),p=v?.price;
  if(!b||v.date>=c.date||!((typeof p==='number'||typeof p==='string'&&p.trim()!=='')&&Number.isFinite(Number(p))))continue;
  const x=Number(p),tol=1e-8*Math.max(1,x);
  if(x<Number(b[3])-tol||x>Number(b[2])+tol)continue;
  add(x,'結構候選頸線',1.2,v.date);
 }
 // Confirmed prior local peaks; historical high-volume tests increase evidence only.
 for(let i=2;i<n-2;i++){
  const h=Number(hist[i][2]);if(h>=Math.max(...hist.slice(i-2,i).map(b=>Number(b[2])))&&h>Math.max(...hist.slice(i+1,i+3).map(b=>Number(b[2])))){
   const v=Number(hist[i][5]),j=bars.length-n+i, prior=j>=20?bars.slice(j-20,j):[],base=prior.length===20&&r220ChartWindowOK([...prior,hist[i]],sessions)?prior.reduce((sum,b)=>sum+Number(b[5]),0)/20:0,heavy=base>0&&v>base*1.5;add(h,heavy?'大量K前高':'歷史波段高點',heavy?1.7:1,`${hist[i][0]}｜${Math.round(v)}張`)
  }
 }
 // Cluster nearby evidence into a price band; not an estimate of outstanding sell orders.
 candidates.sort((a,b)=>a.value-b.value);
 const groups=[];for(const item of candidates){let group=groups.at(-1);if(!group||Math.abs(item.value-group.center)/group.center>.012){group={center:item.value,items:[]};groups.push(group)}group.items.push(item);group.center=group.items.reduce((a,b)=>a+b.value,0)/group.items.length}
 const levels=groups.map(g=>({price:g.center,low:Math.min(...g.items.map(x=>x.value)),high:Math.max(...g.items.map(x=>x.value)),score:g.items.reduce((sum,x)=>sum+x.weight,0),sources:[...new Set(g.items.map(x=>x.label))],distance:100*(Math.min(...g.items.map(x=>x.value))/close-1)})).sort((a,b)=>a.price-b.price).slice(0,3);
 return {status:levels.length?'ok':'未找到可核對的上方壓力',levels,avg20:avg20>0?avg20:null};
}
// R210 local validation: separate event-neck and original signal-low distances.
// Both are historical references, not actual stops, executable prices or expected returns.
function r210BreakoutSpace(c,pressure){
 const stage=r204Stage(c),days={first:1,second:2,third:3,fourth:4}[stage];
 const bad=reason=>({status:'unknown',reason});
 if(!days||!r209EventConsistency(c,stage).ok)return bad('突破事件待核對');
 const bar=c?.bars?.at(-days),last=c?.bars?.at(-1),date=r205EventDate(c),raw=c?.breakoutEvent?.level;
 const num=x=>(typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&Number.isFinite(Number(x))?Number(x):null;
 const close=num(c?.close),neck=num(raw);
 if(!date.date||date.conflict||bar?.[0]!==date.date||last?.[0]!==c.date||!r129ValidCandle(bar)||!r129ValidCandle(last)||close===null||close<=0||Math.abs(Number(last[4])-close)>1e-8*Math.max(1,close)||neck===null||neck<=0||Number(bar[4])<=neck)return bad('突破價量待核對');
 const low=Number(bar[3]);
 if(close<=neck||close<=low)return bad('防守參考已觸及或失守');
 const r=pressure||overheadResistance(c),p=r?.levels?.[0]?.low;
 if(r?.status!=='ok'||!Number.isFinite(p)||p<=close)return bad(r?.status==='ok'?'上方壓力待核對':r?.status||'上方壓力待核對');
 const reward=p-close,neckRisk=close-neck,lowRisk=close-low;
 return {status:'ok',pressure:p,neck,low,spacePct:100*reward/close,neckRiskPct:100*neckRisk/close,lowRiskPct:100*lowRisk/close,neckRatio:reward/neckRisk,lowRatio:reward/lowRisk};
}
function resistanceRadarCard(c){
 const r=overheadResistance(c),space=r210BreakoutSpace(c,r);
 const rows=r.levels.map((x,i)=>`<div class="ladder-line neck"><span>第${i+1}壓力｜${esc(x.sources.slice(0,3).join('、'))}<small>｜距收盤 +${x.distance.toFixed(2)}%｜歷史證據 ${x.score.toFixed(1)} 分</small></span><b>${price(x.low)}${x.high>x.low*1.003?'～'+price(x.high):''}</b></div>`).join('');
 return `<details class="research-fold r71-resistance-radar"><summary>▥ 上方壓力與歷史賣壓觀察</summary><div class="price-ladder">${rows||`<p>${esc(r.status)}</p>`}</div>${space.status==='ok'?`<small>距原頸線 ${space.neckRiskPct.toFixed(2)}%／訊號K低點 ${space.lowRiskPct.toFixed(2)}%；最近壓力空間比 ${space.neckRatio.toFixed(2)}／${space.lowRatio.toFixed(2)}（歷史距離比，非預期報酬）。</small>`:''}<small>壓力整合：近120日波段高點與費波、最多240日均線及已核對日期的結構／量K；僅列收盤價上方最近三區（距離以區間下緣計算）。證據分數是重疊程度，不是賣單張數或突破機率。${r.avg20!==null&&r.avg20!==undefined?'前20日均量約 '+Math.round(r.avg20)+' 張；1.3倍參考量約 '+Math.round(r.avg20*1.3)+' 張，非突破必要量。':''}盤後資料，隔日須重新核對。</small></details>`;
}
function cyclePanel(c){
 const v=c.setupEvidence||{},ev=c.cycle;
 const vfmt=x=>numeric(x)===null?'待資料':Number(x).toFixed(2);
 const event=ev?`<p><b>固定原突破事件：</b>${esc(ev.initialDate)}｜原頸線 ${price(ev.level)} 元｜追蹤第 ${integer(ev.daysSinceFirst+1)} 個交易日｜曾經跌回 ${ev.hadBelow?'是':'否'}｜重新站回次數 ${integer(ev.reclaimCount)}</p>`:
 '<p>近期沒有足夠證據可辨識有效的突破事件；不補造原始頸線或主力成本。</p>';
 const history=(c.stageHistory||[]).slice(-8);
 const journal=history.length?`<details class="fin-notes"><summary>最近階段變化紀錄（${history.length}筆）</summary><div class="cycle-history">${history.map(x=>`<p>${esc(x.date)}｜${esc(x.stage)}｜頸線 ${price(x.neck)}｜長期階段 ${esc(x.strengthPhase||'待新版資料')}｜風險 ${esc(x.risk)}</p>`).join('')}</div></details>`:'<small>正式更新後開始逐日保存階段變化，無歷史紀錄不補造。</small>';
 const risks=(c.riskFlags||[]).length?`<p><b>警戒：</b>${esc(c.riskFlags.join('；'))}</p>`:'<p>暫未發現本演算法定義的重大風險，不代表安全。</p>';
 return `<section class="cycle-panel" aria-label="突破事件和風險追蹤">
 <div class="panel-head"><span>V2.5｜突破事件生命周期</span><small>盤後研究 · 非交易指令</small></div>
 <p><b>今日階段：</b>${esc(c.unifiedStage||'待重算')}｜<b>突破K品質：</b>${esc(c.signalQuality||'待資料')}</p>
 ${event}
 <div class="cycle-indicators"><span>ADX14 <b>${vfmt(v.adx14)}</b></span><span>ATR14 <b>${vfmt(v.atr14Pct)}%</b></span><span>5/15日波幅比 <b>${vfmt(v.atrContraction5v15)}</b></span><span>漲跌日均量比 <b>${vfmt(v.upDownVolumeRatio12)}</b></span><span>今日收盤位置 <b>${vfmt(v.closeLocation)}</b></span><span>20日量比 <b>${vfmt(v.volumeRatio20)}</b></span></div>
 <p><b>趨勢／盤整：</b>${esc(c.regime||'資料不足')}。ADX較低只能表示趨勢強度不明，不能獨立定義假突破。</p>
 ${risks}${journal}<small>無逐筆分點、法人持倉、券商實際成本、國際指數即時價格；量價變化不得稱為主力建倉／出貨已證實。條件與閾值未經績效校準。</small>
 </section>`;
}
// Published FactSet snapshots; manually curated and explicitly dated, NOT live feeds.
// Never fabricate a consensus estimate for an unlisted stock.
const forwardConsensusSnapshots=Object.freeze({
 '2330':{date:'2026-10-15',source:'FactSet／鉅亨網',url:'https://gfe-news2.prod.cnyes.cool/news/id/6631541',eps:[109.21,145.69,185.61],target:3220},
 '2449':{date:'2026-11-06',source:'FactSet／鉅亨網',url:'https://m.cnyes.com/news/id/6649397',eps:[8.12,13.66,18.26],target:330},
 '3189':{date:'2026-11-02',source:'FactSet／豐雲學堂',url:'https://www.sinotrade.com.tw/richclub/news/6ae8662c36ff4992b1fd3fad',eps:[12.77,33.24,56.7],target:1365},
 '2368':{date:'2026-09-14',source:'FactSet／鉅亨網',url:'https://anuenews.cnyes.com/news/id/6606173',eps:[41.57,69.1,95.07],target:1620},
 '2454':{date:'2026-11-02',source:'FactSet／鉅亨網（27位分析師）',url:'https://gfe-desktop.cnyes.com/news/id/6643516/print',eps:[70.87,146.97,285.01],target:5800}
});
function forwardValuationMarkup(c){
 const code=String(c.code||'').replace(/\D/g,'');
 const snap=forwardConsensusSnapshots[code];
 const yr=[2026,2027,2028];
 const rows=yr.map((y,i)=>`<div class="forward-year-row"><b>${y}年</b><label>預估EPS（元）<input class="forward-eps" data-year="${y}" type="number" inputmode="decimal" min="0" max="1000" step="0.01" value="${snap?snap.eps[i]:''}" placeholder="未取得，請輸入" /></label><div class="forward-results" data-result="${y}">待輸入EPS</div></div>`).join('');
 const source=snap?`<div class="forward-source">資料：${esc(snap.source)}｜${esc(snap.date)}｜<a href="${snap.url}" target="_blank" rel="noopener noreferrer">檢視來源</a>${snap.target?`｜報導所列法人目標價 ${price(snap.target)} 元（與年度試算不同）`:''}</div>`:'<div class="forward-source">此股票尚未匯入可核對的法人年度EPS；可自行輸入預估值試算，不能視為法人共識。</div>';
 return `<section class="forward-panel"><div class="fin-subhead">2026／2027／2028 年度預估價格 <small>所有個股皆可試算</small></div>${source}<div class="forward-pe-row"><label>保守PE<input class="forward-pe" type="number" value="20" min="1" max="150" step="1"></label><label>基準PE<input class="forward-pe" type="number" value="25" min="1" max="150" step="1"></label><label>樂觀PE<input class="forward-pe" type="number" value="30" min="1" max="150" step="1"></label></div>${rows}<small class="forward-disclaimer">年度預估價＝當年EPS × 假設本益比。20／25／30倍是可調整的假設情境，不是每檔股票的合理本益比；請核對產業、歷史倍數與預估成長；虧損公司、金融股等須使用其他估值方法。輸入數字不會自動取得法人資料，也不是買賣訊號。法人共識與目標價可能過時。</small></section>`;
}
function wireForwardValuation(c){
 const root=document.querySelector('.forward-panel');if(!root)return;
 const pe=[...root.querySelectorAll('.forward-pe')],eps=[...root.querySelectorAll('.forward-eps')];
 const update=()=>{
  const p=pe.map(e=>e.value.trim()===''?NaN:Number(e.value));
  const valid=p.every(v=>Number.isFinite(v)&&v>=1&&v<=150)&&p[0]<=p[1]&&p[1]<=p[2];
  eps.forEach(el=>{
   const target=root.querySelector(`[data-result="${el.dataset.year}"]`);
   const v=el.value.trim()===''?NaN:Number(el.value);
   if(!valid){target.textContent='請確認PE為1～150倍且保守≤基準≤樂觀';return;}
   if(!Number.isFinite(v)||v<=0||v>1000){target.textContent='缺少有效EPS，不提供預估價';return;}
   target.innerHTML=p.map((multiple,i)=>`<span><small>${['保守','基準','樂觀'][i]} ${multiple}倍</small><strong>${price(v*multiple)}元</strong></span>`).join('');
  });
 };
 [...pe,...eps].forEach(el=>el.addEventListener('input',update));update();
}
function financialPanel(c){
 const fin=c.fundamentals||{},i=c.investment||{};
 const num=numeric;
 const fmtRevenue=v=>num(v)===null?'—':(num(v)/100000).toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2})+' 億元';
 const hasAny=[fin.revenueMonthThousand,fin.revenueYoY,fin.revenueCumYoY,fin.eps,fin.grossMargin,fin.pe].some(v=>num(v)!==null);
 const percentBar=(v,title,period)=>{
   const n=num(v);if(n===null)return `<div class="fin-trend-row"><span>${esc(title)}</span><strong>未取得</strong></div>`;
   const length=Math.min(100,Math.abs(n)/60*100).toFixed(1);
   return `<div class="fin-trend-row"><div><span>${esc(title)}</span><strong class="${n>=0?'fin-up':'fin-down'}">${pct(n)}</strong></div><div class="fin-bar-track"><i class="${n>=0?'pos':'neg'}" style="width:${length}%"></i></div>${period?`<small>${esc(period)}</small>`:''}</div>`;
 };
 const item=(v,label,formatter='num')=>`<div class="fin-stat"><small>${esc(label)}</small><b>${num(v)===null?'—':formatter==='pct'?pct(v):price(v)}</b></div>`;
 const score=(v,label)=>{const n=num(v);return `<div class="fin-score"><small>${esc(label)}</small><b>${n===null?'—':Math.max(0,Math.min(100,n)).toFixed(0)}</b><div class="score-track"><i style="width:${n===null?0:Math.max(0,Math.min(100,n))}%"></i></div></div>`};
 return `<section class="visual-fin" aria-label="公司研究：營收 EPS 與估值情境">
  <div class="panel-head"><span>公司研究｜營收 · EPS · 估值情境</span><small>${hasAny?'官方盤後財務資料':'尚無可驗證的最新財務欄位'}</small></div>
  ${hasAny?`<div class="finance-scores">${score(i.technical,'技術')}${score(i.growth,'營收成長')}${score(i.overall,'研究優先度')}</div>`:''}
  <div class="fin-subhead">營收表現 <small>${esc(fin.revenuePeriod||'月份未取得')}｜單位新台幣</small></div>
  <p class="fin-r13-money">當月營收 <strong>${fmtRevenue(fin.revenueMonthThousand)}</strong> · 累計營收 <strong>${fmtRevenue(fin.revenueCumThousand)}</strong></p>
  ${percentBar(fin.revenueYoY,'當月營收年增',fin.revenuePeriod)}${percentBar(fin.revenueCumYoY,'累計營收年增','')}
  <div class="fin-subhead">獲利與估值 <small>${esc(fin.epsPeriod||'最新可用季報待核對')}</small></div>
  <div class="fin-metrics">${item(fin.eps,'累計EPS（年初起）')}${item(fin.grossMargin,'毛利率','pct')}${item(fin.pe,'官方本益比')}${item(fin.pb,'淨值比')}</div>
  ${verifiedValuation(c)?`<div class="model-target-prices"><div class="model-target-heading">已驗證歷史本益比估值（非券商喊價）</div><div class="model-target-columns">${verifiedValuation(c).targets.map((p,i)=>`<span><small>${['便宜','合理','昂貴'][i]}</small><b>${price(p)}元</b></span>`).join('')}</div><small>估算近四季 EPS ${price(verifiedValuation(c).eps)} 元；與財報和歷史PE樣本核對通過。</small></div>`:'<p class="fin-r13-warning">缺少可核對的近四季EPS或歷史PE，暫不顯示模型目標價。單季EPS不可當全年EPS。</p>'}
  <p class="forward-source">注意：上方「便宜／合理／昂貴」為歷史EPS及歷史本益比情境；下方年度估值為法人預估EPS × 假設本益比，兩者期間不同，不可混為同一合理價。</p>${forwardValuationMarkup(c)}
  <div class="fin-r13-estimator">
   <strong>估值情境試算｜預估全年 EPS × 假設本益比</strong>
   <div class="fin-r13-fields"><label>假設未來12個月EPS（元）<input id="valuationAnnualEPS" type="number" inputmode="decimal" min="0.01" max="500" step="0.01" placeholder="自行填入，非單季EPS" /></label>
   <label>保守本益比<input id="valuationPeLow" type="number" min="1" max="150" step="0.5" value="10" /></label>
   <label>中性本益比<input id="valuationPeMid" type="number" min="1" max="150" step="0.5" value="15" /></label>
   <label>樂觀本益比<input id="valuationPeHigh" type="number" min="1" max="150" step="0.5" value="20" /></label></div>
   <div id="valuationScenarioResult" class="fin-r13-result" aria-live="polite">輸入可核對的全年EPS假設，才會計算價格情境；預設倍數是範例，應依產業與景氣調整。</div>
   <small>這只是估值敏感度試算，不是券商目標價、獲利保證或自動買點。EPS成長與營收年增不可直接等同。</small>
  </div>
  <details class="fin-notes"><summary>官方期別、資料來源與估值限制</summary><p>上市月營收：TWSE t187ap05_L；上櫃：TPEx／MOPS；季報EPS：MOPS公開財報（僅支援目前已串接的報表類型）。</p><p>營收：${esc(fin.revenuePeriod||'未取得')}；累計EPS：${esc(fin.epsPeriod||'未取得')}；官方出表日：${esc(fin.epsStatementDate||'未提供')}；估值日期：${esc(fin.valuationDate||'未取得')}。財務公告時點以來源披露為準，盤後程式採保守揭露日假設。缺資料不補零或推算單季為全年。</p></details>
 </section>`;
}
function wireValuationScenario(c){
 const find=id=>document.getElementById(id), fields=['valuationAnnualEPS','valuationPeLow','valuationPeMid','valuationPeHigh'];
 const els=fields.map(find),out=find('valuationScenarioResult');if(els.some(v=>!v)||!out)return;
 function recalc(){
  const values=els.map(x=>x.value.trim()===''?null:Number(x.value)),[eps,low,mid,high]=values;
  if(eps===null){out.textContent='請先輸入經核對的未來12個月EPS假設；系統不會用單季EPS自動年化。';return;}
  if(![eps,low,mid,high].every(Number.isFinite)||eps<=0||eps>500||low<1||low>150||mid<low||mid>150||high<mid||high>150){out.textContent='請確認EPS為正數（≤500），且本益比依保守≤中性≤樂觀排序、介於1～150倍。';return;}
  const close=numeric(c.close),prices=[low,mid,high].map(pe=>Math.round(eps*pe*100)/100);
  out.innerHTML='<div class="fin-r13-prices">'+[['保守',prices[0]],['中性',prices[1]],['樂觀',prices[2]]].map(([label,p])=>`<span><small>${label}</small><b>${price(p)} 元</b>${close!==null&&close>0?`<small>較盤後收盤 ${pct((p/close-1)*100)}</small>`:''}</span>`).join('')+'</div><small>假設EPS '+price(eps)+' 元；不同倍數僅用來觀察價格敏感度。</small>';
 }
 els.forEach(el=>el.addEventListener('input',recalc));recalc();
}

function technicalVisual(c){
 const k=techMetrics(c),i=indicatorSnapshot(c);
 const f=v=>v===null||!Number.isFinite(v)?'待資料':v.toFixed(1);
 const obv=i.obvDelta===null?'待資料':i.obvDelta>0?'量能偏累積':i.obvDelta<0?'量能偏流出':'量能持平';
 const macd=i.macd===null?'待資料':i.macd>=i.macdSignal?'MACD 高於訊號線':'MACD 低於訊號線';
 const breadth='騰落指標須以同交易日全市場上漲／下跌家數計算，不能由單一股票K線推算。';
 return `<section class="visual-tech"><div class="panel-head"><span>技術指標交叉檢查</span><small>以公開日K自行計算；非買賣指令</small></div><div class="tech-chips"><div><small>RSI(14)</small><strong>${f(i.rsi)}</strong></div><div><small>MACD(12,26,9)</small><strong>${esc(macd)}</strong></div><div><small>OBV近5日</small><strong>${esc(obv)}</strong></div><div><small>KD(9,3,3)</small><strong>K ${f(i.k)} / D ${f(i.d)}</strong></div><div><small>KDJ J值</small><strong>${f(i.j)}</strong></div><div><small>布林(20,2)</small><strong>${f(i.bollLower)} / ${f(i.bollMid)} / ${f(i.bollUpper)}</strong></div><div><small>DMI +DI / -DI / ADX</small><strong>${f(i.pdi)} / ${f(i.mdi)} / ${f(i.adx)}</strong></div><div><small>當日量 / 前20日均量</small><strong>${i.volumeRatio===null?'待資料':f(i.volumeRatio)+'倍'}</strong></div><div><small>K棒收盤位置</small><strong>${i.candle===null?'待資料':f(i.candle*100)+'%'}</strong></div></div><details class="fin-notes"><summary>計算方法、限制與騰落指標</summary><p>MA5 ${price(k.ma5)} ／ MA10 ${price(k.ma10)} ／ MA20 ${price(k.ma20)} ／ MA60 ${price(k.ma60)}。近20日 ${pct(k.ret20)} ／ 近60日 ${pct(k.ret60)}。</p><p>${breadth}</p><p>KDJ的K、D與KD共用同一組數值，不能重複加分。DMI的ADX只衡量趨勢強度、不代表方向。RSI、MACD、OBV等只作輔助，尚未接入盤後選股認證或歷史回測。</p></details></section>`;
}

function extraTechnical(c){
 const k=techMetrics(c);
 const f=n=>n==null?'資料不足':price(n);
 const fp=n=>n==null?'資料不足':pct(n);
 const fin=c.fundamentals||{},i=c.investment||{};
 const fstr=n=>n==null?'待資料':price(n);
 const ins=c.institutional;
 const lotsNet=n=>n==null?'待資料':(n>0?'+':'')+(n/1000).toLocaleString('zh-TW',{maximumFractionDigits:1})+'張';
 const institutionalHtml=ins?
   `<div class="settings-card"><strong>三大法人｜日期核對後展示（不參與操盤評分）</strong><p>法人交易日 ${esc(ins.date)}；首次取得時間 ${esc(ins.firstObservedAt)}<br>外資 ${lotsNet(ins.foreignNetShares)} ／ 投信 ${lotsNet(ins.trustNetShares)} ／ 自營商 ${lotsNet(ins.dealerNetShares)}<br>三大法人合計 ${lotsNet(ins.totalNetShares)}<br>⚠ 法人數據可能在收盤後或隔日才取得，不代表該交易日收盤前已知；現階段來源接法仍待正式線上驗證。</p></div>`:
   `<div class="settings-card"><strong>三大法人</strong><p>正式版暫未接入經實際連線驗證的每日資料；不以0張替代，也不納入分數。</p></div>`;
 const growthHtml=`<div class="settings-card"><strong>基本面與投資優先度｜公開資料</strong><p>技術分 ${i.technical??'待資料'} ／ 基本面觀察分 ${i.growth??'待資料'} ／ 投資優先度 ${i.overall??'待資料'}<br>分級 ${esc(i.grade||'待資料')} ／ 財務資料覆蓋 ${i.coverage??0}%<br>月營收年增 ${fp(fin.revenueYoY)}（${esc(fin.revenuePeriod||'未取得')}） ／ 累計營收年增 ${fp(fin.revenueCumYoY)}<br>累計EPS ${fstr(fin.eps)}（${esc(fin.epsPeriod||'未取得')}） ／ 毛利率 ${fp(fin.grossMargin)}<br>本益比 ${fstr(fin.pe)} ／ 淨值比 ${fstr(fin.pb)} ／ 殖利率 ${fp(fin.dividendYield)}<br>產業類別 ${esc(fin.industry||'待資料')} ／ 本益比資料日期 ${esc(fin.valuationDate||'待資料')}<br>評分方法 ${esc(i.methodNote||'舊版資料，待新版掃描')}<br>資料可用日期 ${esc(i.datePolicy||'待重算')}<br>法人交易資訊如有來源核對一致僅供檢視、不參與評分；產業消息及EPS年增率尚未正式串接。</p><p>⚠ 分數是規則式研究排序，不是股價上漲機率或保證買點。資料不足時不給投資優先度。</p></div>`;
 return `<details class="fin-notes institutional-note"><summary>三大法人資料與來源狀態</summary>${institutionalHtml}</details>`;
}

function launchSummary(c){
 const stage=c.launchStage||((c.tags||[]).includes('first')?'第一根發動':'舊版訊號');
 const desc=c.launchReason||'等待新版掃描資料';
 const stateText=c.priceConfirmed?'收盤價格已突破（無需創最大量）':c.preLaunch?'尚未突破，僅觀察發動準備':'尚未確認第一根發動';
 const note=c.onePriceLimit?'⚠ 一字漲停可能無法成交，隔日跳空追價有風險。':
   c.preLaunch?'⚠ 預備候選不是隔日上漲預測，需等待價格正式跨越頸線。':'⚠ 盤後訊號不等於隔日適合追價。';
 return `<div class="settings-card launch-summary"><strong>大量K｜第一根發動判讀</strong>
  <p>階段：<b>${esc(stage)}</b><br>關鍵大量K：${esc(c.neckDate||'—')}／高點 ${price(c.neck)} 元／${integer(c.neckLots)} 張<br>
  價格確認：${esc(stateText)}<br>量比：${Number(c.volumeRatio||0).toFixed(2)} 倍（不作為第一根必要條件）<br>
  技術說明：${esc(desc)}<br>${esc(note)}</p></div>`;
}
function traderPanel(c){
 const t=c.trading;
 if(!t||t.score==null)return `<div class="settings-card"><strong>操盤品質｜待資料</strong><p>請確認 GitHub 已套用新版 collector.py 並重新執行一次。未取得完整資料時不顯示假分數。</p></div>`;
 const risk=(t.risks||[]).length? t.risks.map(s=>'⚠ '+esc(s)).join('<br>'):'目前無模型風險標籤；不代表沒有投資風險';
 return `<div class="trade-card"><strong>操盤品質與趨勢延續</strong><span class="trade-pill">${esc(t.status||'待評估')}</span>
 <p>操盤品質 <b>${integer(t.score)}</b>／100（不是上漲勝率）　趨勢延續 <b>${integer(t.trend)}</b>　買點品質 <b>${integer(t.entryQuality)}</b><br>
 MA5 ${price(t.ma5)} ／ MA20 ${price(t.ma20)} ／ MA60 ${price(t.ma60)}<br>
 近5日 ${pct(t.return5Pct)} ／ 近20日 ${pct(t.return20Pct)}<br>官方產業同業強弱：${esc(t.sectorLabel||'待資料')} ／ 超額 ${pct(t.sectorRelative20Pct)}（${integer(t.sectorPeerCount)} 檔可比；20日價格相對排名 ${integer(t.sectorPriceRank)}）<br>
 前20日均成交值 ${price(t.avgTurnover20Millions)} 百萬元<br>
 歷史高點參考 ${price(t.historicalPeakHigh)} 元（距目前收盤 ${pct(t.historicalPeakGapPct)}；已取得 ${integer(t.historicalPeakSessions)} 個交易日，滿250日：${t.complete250?'是':'否'}；非實際套牢成本）<br>14日平均真實波幅 ATR ${price(t.atr14)}（${pct(t.atrPct)}）<br>
 結構失效觀察價 <b>${price(t.structureInvalidation)}</b> ／ 距今收盤 ${pct(t.structureDistancePct)}<br>
 2R純情境試算 ${price(t.illustrativeTwoR)}（<b>不是目標價或買點</b>）<br>
 突破後追蹤 ${c.followDay?esc(c.followDay+'個交易日／'+c.followStatus):'尚無5日追蹤事件'}<br>
 ${risk}<br>⚠ 盤後資料，不能視為目前買得到的股價；不含大盤、法人即時買賣、除權息還原及新聞。</p></div>`;
}
function detailNavigationIds(id){
 // Stay in the visible ranked list whenever it contains adjacent stocks.
 const ids=activeSelection().records.map(rowId);
 if(ids.length>1&&ids.includes(id))return ids;
 // An exact-code search normally shows only one result.  Keep previous/next
 // usable by falling back to the full universe in ticker-code order.
 const ordered=allRows().slice().sort((a,b)=>
   String(a.code).localeCompare(String(b.code),'zh-Hant',{numeric:true})||
   String(a.market).localeCompare(String(b.market),'zh-Hant'));
 const universeIds=[...new Set(ordered.map(rowId))];
 return universeIds.includes(id)?universeIds:[id];
}
function showDetails(id,jumpIntraday=false){
 const lookup=(rowId(state.lookupRow||{})===id?state.lookupRow:null);const c=lookup||allRows().find(x=>rowId(x)===id);if(!c){quickLookupNotice('找不到個股分析資料：'+id);return;}
 state.etfDetail=null;state.detailIds=detailNavigationIds(id);
 state.detail=c;state.chartDays=60;state.r41Page='card';
 if($('#modalOverlay').hidden){history.pushState({chaopanDetail:true},'',location.href);state.detailHistory=true;}
 renderDetail();$('#modalOverlay').hidden=false;document.body.style.overflow='hidden';
 // R124: legacy intraday navigation intentionally ignored.
}
// R124: old jump-to-intraday action removed.
function jumpToIntraday(){ /* permanently disabled */ }
function hideDetails(fromPop=false){
 $('#modalOverlay').hidden=true;document.body.style.overflow='';state.detail=null;state.etfDetail=null;
 if(state.detailHistory&&!fromPop){state.detailHistory=false;history.back();}
 if(fromPop)state.detailHistory=false;
}
function nextDetail(delta){
 const position=state.detailIds.indexOf(rowId(state.detail));const target=state.detailIds[position+delta];
 if(!target)return;const c=allRows().find(x=>rowId(x)===target);if(!c)return;
 state.detail=c;state.chartDays=60;renderDetail();const sheet=$('#modalOverlay .sheet');if(sheet)sheet.scrollTop=0;
}
function riskPanel(c){
 const level=c.riskLevel||'unknown';const cls=level==='high'?'danger':level==='medium'?'warning':'neutral';
 const reasons=(c.riskReasons||['全市場診斷待重新掃描']).map(x=>'<li>'+esc(x)+'</li>').join('');
 const evidence=c.supportEvidence||{};
 const support=c.structureV23?.supports?.length?c.structureV23.supports:(evidence.levels||[]);
 const levels=support.slice(0,6).map(v=>`<div class="support-level"><strong>${esc(v.label)}：${price(v.lower)}～${price(v.upper)}元</strong><br><small>形成日 ${esc(v.date)}　${esc(v.state)}${v.touches>1?'　回測點 '+integer(v.touches)+' 處':''}</small></div>`).join('');
 const broken=(c.structureV23?.brokenSupport||evidence.broken||[]).length;
 const title=broken?`<strong style="color:#ffc3bd">⚠ ${broken}組歷史支撐出現初破或連續收盤破位</strong>`:evidence.nearest?`最近歷史支撐：${price(evidence.nearest.lower)}～${price(evidence.nearest.upper)}元`:'未辨識到有效的鄰近歷史支撐；不代表沒有下跌風險';
 const multi=(c.structureV23?.necklines||[]).slice(0,8).map(v=>`<span class="structure-pill">${price(v.price)}｜${esc(v.date)}｜${esc(v.status)}</span>`).join('');
 const volumeKeys=(c.structureV23?.volumeKeyLevels||[]).slice(0,12).map(v=>`<span class="structure-pill">${esc(v.date.slice(5))} 收 ${price(v.close)}／低 ${price(v.low)}</span>`).join('');
 return `<section class="risk-report risk-${cls}"><h3>V2.5｜近期結構風險及歷史價量</h3>
 <p><strong>${esc(c.riskStatus||'資料待補')}</strong>｜${esc(c.decision||'待綜合評估')}｜綜合排序 ${c.opportunityScore??'待資料'}</p>
 <p>近5日相對同市場 ${pct(c.relMarket5Pct)} ／ 相對官方同業 ${pct(c.relSector5Pct)}<br>
 <small>比較基準：同市場股票等權5日報酬中位數，並非加權／櫃買指數；資料不足顯示—。</small></p>
 <ul>${reasons}</ul>
 <p>⚠ 疑似出貨是量價結構的風險標籤，不代表查到主力真實賣單或持股。評分不是獲利機率；資料截止 ${esc(c.date||'—')}。</p>
 <div class="settings-card"><strong>歷史大量K關卡｜價位日期須對應來源K棒</strong><div class="structure-chips">${multi||'目前可用歷史不足'}</div><small>歷史大量K關卡與近期主要頸線採不同選取規則；不能直接當作已確認突破買點。舊資料未提供價位錨點時，來源待核對。</small><strong>歷史大量K收盤與低點｜不因新頸線被覆蓋</strong><div class="structure-chips">${volumeKeys||'尚無可核對大量K'}</div></div>
 <div class="settings-card"><strong>價格支撐三重檢查｜前波低點、大量K、跳空缺口</strong>
 <p>${title}</p>${levels||'<p>歷史資料不足或尚無有效型態，不能推定支撐價。</p>'}
 <p><small>⚠ ${esc(evidence.note||'尚待新版行情重新掃描。')} 股價僅盤中觸及支撐不算確認跌破；此分析不是自動賣出建議。</small></p></div>
 </section>`;
}
/* V2.6 manual same-session checkpoint. NO quotes are fetched. Never label
   these inputs as a completed D1 close or historical calibrated intraday RVOL. */
// Daily close-based trend phase: use only bars available AS OF that close;
// simulate its last bar from prior completed bars, no future look-ahead.
function trendModePanel(c){
 const bars=(c.bars||[]).filter(b=>Array.isArray(b)&&b.length>=6);
 const engine=window.ChaopanRegimeV307;
 if(!engine?.assess||bars.length<24||bars.at(-1)[0]!==c.date)return '';
 const prior=bars.slice(0,-1),b=bars.at(-1);
 const t=engine.assess({bars:prior,asOf:prior.at(-1)[0],open:b[1],high:b[2],low:b[3],current:b[4],volume:b[5],trendKind:continuationReadout(c).kind});
 if(['invalid','unavailable'].includes(t.mode))return '';
 const alert=['weak','risk'].includes(t.mode)||c.riskLevel==='high'?'danger':t.mode.includes('pullback')||['caution','consolidation','extended'].includes(t.mode)?'warn':'good';
 const action=t.next||'下一交易日再以券商實際價量核對，不能把歷史結構當即時行情。';
 return `<section class="v307-stage-panel ${alert}" aria-label="盤後自動判斷上漲或回測階段">
  <div class="panel-head"><span>走勢階段｜${esc(c.date)} 收盤</span><small>依當日實際日K計算</small></div>
  <h3>${esc(t.title)}</h3><p>${esc(t.reason)}</p>
  <div class="v307-stage-levels"><span>MA5 <b>${price(t.ma5)}</b></span><span>MA10 <b>${price(t.ma10)}</b></span><span>MA20 <b>${price(t.ma20)}</b></span></div>
  <p><strong>下一步：</strong>${esc(action)}</p><small>本股最近盤後資料為 ${esc(c.date)}；不是即時盤中判斷，尚未確認下個交易日走勢。</small>
 </section>`;
}
// R124: retired intraday worksheet and its event listeners permanently.
// r20 market-aware trade research. No speculative index history, no synthetic buy points.
function mainTrendResearchPanel(c){
 const engine=globalThis.ChaopanMainTrendV320;
 if(!engine)return '<section class="ma-structure-panel"><b>主升段判斷核心尚未載入</b>｜不提供新買點。</section>';
 // Only data explicitly approved by upstream official-data integration may authorize a new signal.
 const feed=state.marketIntel?.marketTrend;
 const valid=Boolean(feed&&feed.asOf===c.date&&feed.authority==='verified-official-eod'&&
    feed.sources?.taiex?.status==='ok'&&feed.sources?.otc?.status==='ok'&&
    feed.sources?.breadthTaiex?.status==='ok'&&feed.sources?.breadthOtc?.status==='ok');
 const history=valid?feed.indexHistory:null;
 const breadth=valid?feed.breadth:null;
 const x=engine.inspect({stock:{market:c.market,date:c.date,bars:c.bars,close:c.close,lots:c.lots,
  possiblePriceAdjustment:c.possiblePriceAdjustment,cycle:c.cycle,neck:c.neck,neckDate:c.neckDate},
  indexHistory:history,breadth});
 const pattern=x.status==='entry-qualified'&&valid;
 const label=pattern?'突破／回測候選（盤後）':
   x.status==='exit-warning'?'移動停利警示':
   x.status==='reduce-warning'?'持股防守警示':
   x.status==='watch'?'觀察中':'市場歷史／交易條件未完整認證';
 const tip=!valid?'目前未建立可核對的加權、櫃買66日以上歷史及兩市20日官方騰落家數；停用自動新買點。':'';
 const txt=(x.reasons||[]).slice(0,4).map(t=>'<li>'+esc(t)+'</li>').join('');
 const checked=pattern?`<div class="ma-number-grid"><div><small>盤後條件價（非保證買價）</small><strong>${price(x.entry)}</strong></div><div><small>假設風險停損</small><strong>${price(x.stop)}</strong></div><div><small>2R情境價（非目標價）</small><strong>${price(x.milestone2R)}</strong></div></div>`:
 `<div class="ma-number-grid"><div><small>同市場20日相對強度</small><strong>${x.relativeStrength20==null?'待核對':pct(x.relativeStrength20)}</strong></div><div><small>觀察頸線（不是買點）</small><strong>${price(latestNeck(c))}</strong></div><div><small>歷史K線根數</small><strong>${integer(c.bars?.length||0)}</strong></div></div>`;
 return `<section class="ma-structure-panel r20-research-panel" aria-label="主升段與加權櫃買雙指數研究">
 <div class="panel-head"><span>雙指數 × 主升段｜盤後作戰判斷</span><small>V3.1.1-r20</small></div>
 <p class="ma-structure-stage"><b>${esc(label)}</b>｜${esc(x.benchmark==='taiex'?'上市以加權為基準':x.benchmark==='otc'?'上櫃以櫃買為基準':'市場待確認')}</p>
 ${checked}<p class="ma-structure-note">${esc(tip||x.action)}${x.market?.date?'｜指數 '+esc(x.market.date):''}</p>
 ${txt?`<ul class="r20-reasons">${txt}</ul>`:''}
 <p class="ma-structure-note">核心倉守原頸線、MA20與經核對的移動停利；操作倉分段檢核風險倍數。沒有實際持股成本及交易紀錄，不能計算真實停利與獲利。${pattern?' 次日成交價格／跳空及滑價必須重新核算。':''}</p></section>`;
}

/* R166: Independent, read-only official TAIEX daily OHLCV supplement.
 * No mutation of marketTrend or automatic trading authorization. Frontend
 * consumes data/taiex-daily.json produced by a separate TWSE EOD workflow.
 * A missing/old feed is shown as pending, never as tomorrow's live benchmark. */
const R166IndexDaily=(()=>{
 let snapshot=null, error='加權指數歷史K線檔尚未產生', promise=null, attempted=false, lastAttempt=0, running=false;
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 const n=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
 function normalize(raw){
  if(raw?.schema!=='chaopan-taiex-daily-v1'||!['TWSE/TAIEX/MI_5MINS_HIST','TWSE/indicesReport/MI_5MINS_HIST'].includes(raw?.source)||!Array.isArray(raw.bars))return null;
  if(raw.bars.length<20||raw.bars.length>5000)return null;
  const bars=[];let lastDate='';
  for(const b of raw.bars){
   if(!Array.isArray(b)||b.length<5||!validDate(b[0])||b[0]<=lastDate)return null;
   const [o,h,l,c]=b.slice(1,5).map(n),vol=b.length>5?n(b[5]):null;
   if([o,h,l,c].some(x=>x===null||x<=0)||h<Math.max(o,c)||l>Math.min(o,c)||l>h||vol!==null&&vol<0)return null;
   if(bars.length&&Math.abs(c/bars.at(-1)[4]-1)>.35)return null;
   bars.push([b[0],o,h,l,c,vol]);lastDate=b[0];
  }
  if(raw.asOf!==lastDate)return null;
  return {asOf:lastDate,bars,generatedAt:String(raw.generatedAt||''),volumeSource:String(raw.volumeSource||'')};
 }
 function get(asOf){
  // An updated index file can contain an older stock's exact trading day.
  // Never claim it is today's candle or forward-fill unmatched dates.
  if(!snapshot||typeof asOf!=='string')return null;
  const k=snapshot.bars.findIndex(b=>b[0]===asOf);
  return k>=19?snapshot.bars.slice(0,k+1):null;
 }
 function getLatest(){return snapshot?.bars||null;}
 function status(){return snapshot?{ok:true,asOf:snapshot.asOf,volumeSource:snapshot.volumeSource}:{ok:false,reason:error};}
 function install(raw){const parsed=normalize(raw);if(!parsed){error='證交所K線格式、日期或歷史根數不足';return false;}if(snapshot&&parsed.asOf<snapshot.asOf)return false;snapshot=parsed;error='';if(!Array.isArray(raw.missingMonths)||raw.missingMonths.length){if(r214Sessions){r214Sessions=null;r214SessionRevision++;}}else r214InstallSessions(raw,parsed);return true;}
 function retry(){if(running)return promise;attempted=false;lastAttempt=0;return ensure();}
 function ensure(){
  if(typeof window==='undefined'||window.__RADAR_PREVIEW__)return promise;
  const expected=String(state.payload?.asOf||state.detail?.date||'');
  if(running||(attempted&&(!validDate(expected)||get(expected)||Date.now()-lastAttempt<60000)))return promise;
  if(typeof fetch!=='function')return null;
  attempted=true;lastAttempt=Date.now();running=true;
  promise=(async()=>{
   try{
    const urls=['./data/taiex-daily.json?rev='+Date.now(),
      'https://raw.githubusercontent.com/love18960928-lgtm/chaopan-radar/main/data/taiex-daily.json?rev='+Date.now()];
    const before=snapshot,sessionBefore=r214SessionRevision;let lastError='not published';
    for(const url of urls){
     const ctrl=typeof AbortController==='function'?new AbortController():null;
     const timer=ctrl?setTimeout(()=>ctrl.abort(),8000):null;
     try{
      const response=await fetch(url,{cache:'no-store',...(ctrl?{signal:ctrl.signal}:{})});
      if(!response.ok)throw Error('HTTP '+response.status);
      if(install(await response.json())){lastError='';if(!validDate(expected)||get(expected))break;}
      else lastError=error||'older index snapshot';
     }catch(e){lastError=String(e?.message||e).slice(0,90)}
     finally{if(timer!==null)clearTimeout(timer);}
    }
    if(!snapshot)throw Error(lastError);
    if(r214SessionRevision!==sessionBefore&&state.universe&&typeof render==='function')render();
    if(snapshot!==before&&state.detail&&state.detail.market==='上市'&&typeof renderDetail==='function'){
     const sheet=document.querySelector('#modalOverlay .sheet'),scroll=sheet?.scrollTop||0;
     renderDetail();if(sheet)sheet.scrollTop=scroll;
    }
   }catch(e){error='加權指數歷史資料尚未同步（'+String(e.message||'連線失敗').slice(0,70)+'）';}
   finally{running=false;}
  })();
  return promise;
 }
 return Object.freeze({get,getLatest,status,ensure,retry,install,normalize});
})();
globalThis.ChaopanIndexDailyR166=R166IndexDaily;

/* R162: synchronized market/stock comparison. Official same-day EOD only.
   This module never fabricates an index candle or treats one-day index changes
   as a full historical series. All chart numbers are date-aligned. */
const R162Compare = (()=>{
 const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 const num=v=>v===undefined||v===null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
 function readSeries(source){
  const raw=Array.isArray(source)?source:Array.isArray(source?.bars)?source.bars:Array.isArray(source?.daily)?source.daily:Array.isArray(source?.rows)?source.rows:null;
  if(!raw?.length)return null;
  const data=[];let prev='';
  for(const row of raw){
   const arr=Array.isArray(row),date=String(arr?row[0]:row?.date||'');
   const close=num(arr?(row.length>=5?row[4]:row[1]):row?.close??row?.c);
   const open=num(arr?(row.length>=5?row[1]:null):row?.open??row?.o);
   const high=num(arr?(row.length>=5?row[2]:null):row?.high??row?.h);
   const low=num(arr?(row.length>=5?row[3]:null):row?.low??row?.l);
   const volume=num(arr?(row.length>=6?row[5]:null):row?.volume??row?.v);
   if(!validDay(date)||date<=prev||close===null||close<=0||
       (open!==null&&open<=0)||(high!==null&&high<=0)||(low!==null&&low<=0)||
       (volume!==null&&volume<0))return null;
   const candle=[open,high,low].every(v=>v!==null);
   // Reject partial candles: they cannot be silently drawn as genuine daily K.
   if([open,high,low].some(v=>v!==null)&&!candle)return null;
   if(candle&&(low>Math.min(open,close)||high<Math.max(open,close)||high<low))return null;
   data.push({date,open,high,low,close,volume,candle});prev=date;
  }
  return data;
 }
 function exceptionalGap(a){
  for(let i=1;i<a.length;i++)if(a[i-1].close>0&&Math.abs(a[i].close/a[i-1].close-1)>.35)return true;
  return false; // conservative quality flag, not proof of a corporate action
 }
 function inspect(stock,marketIntel,days=60,live=true){
  const key=stock?.market==='上櫃'?'otc':'taiex',indexName=key==='taiex'?'加權指數':'櫃買指數';
  const fail=reason=>({ok:false,key,indexName,reason});
  if(!live)return fail('示範模式不提供真實大盤比較。');
  if(!stock?.date||stock.possiblePriceAdjustment===true)return fail('個股日期或公司行動還原尚未核對。');
  const feed=marketIntel?.marketTrend;
   const verified=Boolean(feed&&feed.asOf===stock.date&&feed.authority==='verified-official-eod'&&feed.sources?.[key]?.status==='ok');
   // The separate official daily file may fill a missing marketTrend, but must
   // NOT be injected into it: the latter also gates automatic new-entry picks.
   const independent=key==='taiex'&&typeof R166IndexDaily!=='undefined'?R166IndexDaily.get(stock.date):null;
   const source=independent||(verified&&feed.indexHistory?.[key]?feed.indexHistory[key]:null);
   if(!source)return fail(key==='taiex'?'同日加權日K尚未入庫，請檢查證交所資料更新流程':'櫃買指數歷史尚未完成核對');
   const stocks=readSeries(stock.bars),indices=readSeries(source);
  if(!stocks||!indices)return fail('個股或指數歷史資料欄位缺失／異常，暫停比較。');
  if(stocks.at(-1).date!==stock.date||indices.at(-1).date!==stock.date||
     Math.abs(stocks.at(-1).close-Number(stock.close))>Math.max(.02,Number(stock.close)*.001))
   return fail('兩邊最後交易日或個股收盤價不一致，暫不繪圖。');
  if(exceptionalGap(stocks)||exceptionalGap(indices))return fail('歷史收盤價存在超過35%的未確認斷層，需先核對還原資料。');
  // Use the same trailing dates, not nearest dates or independent sampling.
  const requested=Number.isInteger(Number(days))?Math.min(120,Math.max(20,Number(days))):60;
  const length=Math.min(requested,stocks.length,indices.length);
  if(length<20)return fail('同步交易日不足20根，暫不比較短期趨勢。');
  const s=stocks.slice(-length),m=indices.slice(-length);
  if(s.some((x,i)=>x.date!==m[i].date))return fail('指數與個股的歷史交易日不完全相同，需補齊缺日後比較。');
  const firstS=s[0].close,firstM=m[0].close;
  const aligned=s.map((b,i)=>({date:b.date,stock:b.close/firstS*100,index:m[i].close/firstM*100}));
  const stockReturn=(s.at(-1).close/firstS-1)*100,marketReturn=(m.at(-1).close/firstM-1)*100;
  const threshold=(a,n)=>{
   if(a.length<n-1)return null;
   const p=a.at(-1).close,base=a.slice(-(n-1)).reduce((sum,x)=>sum+x.close,0)/(n-1);
   return {n,price:base,pct:(base/p-1)*100,close:p};
  };
  const completeIndexCandles=m.every(b=>b.candle);
  return {ok:true,key,indexName,aligned,stocks:s,indices:m,stockReturn,marketReturn,excess:stockReturn-marketReturn,
   hasIndexK:completeIndexCandles,hasIndexVolume:completeIndexCandles&&m.every(b=>b.volume!==null),
   actualDays:length,requested,stockLevels:[5,10,20].map(n=>threshold(stocks,n)),
   indexLevels:[5,10,20].map(n=>threshold(indices,n)),date:stock.date};
 }
 const f=n=>Number(n).toFixed(2);
 const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function strengthChart(rows){
  const W=650,H=210,p=40,w=W-72,h=H-56;
  const values=rows.flatMap(r=>[r.stock,r.index]),lo=Math.min(98,...values)-1,hi=Math.max(102,...values)+1;
  const x=i=>p+i*w/Math.max(rows.length-1,1),y=v=>20+(hi-v)/(hi-lo)*h;
  const path=key=>rows.map((r,i)=>(i?'L':'M')+f(x(i))+','+f(y(r[key]))).join(' ');
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="同日期起點100的個股與指數漲跌幅對照圖" style="display:block;width:100%;height:auto">`;
  for(let k=0;k<4;k++){const v=lo+(hi-lo)*k/3;svg+=`<line x1="${p}" x2="${p+w}" y1="${f(y(v))}" y2="${f(y(v))}" stroke="#465365" stroke-opacity=".45"/><text x="2" y="${f(y(v)+4)}" fill="#afbdca" font-size="11">${f(v)}</text>`;}
  svg+=`<path d="${path('index')}" stroke="#f7b955" fill="none" stroke-width="2.7"/><path d="${path('stock')}" stroke="#4cd3b2" fill="none" stroke-width="2.7"/>`;
  svg+=`<text x="${p}" y="${H-5}" fill="#a5b8c8" font-size="11">${safe(rows[0].date)}</text><text x="${p+w}" y="${H-5}" text-anchor="end" fill="#a5b8c8" font-size="11">${safe(rows.at(-1).date)}</text></svg>`;
  return svg;
 }
 function candleChart(bars,hasVolume){
  const W=650,H=225,p=40,w=W-75,top=15,h=152,vtop=175,vh=31;
  const hi=Math.max(...bars.map(x=>x.high))*1.015,lo=Math.min(...bars.map(x=>x.low))*.985;
  const y=n=>top+(hi-n)/(hi-lo)*h,step=w/bars.length;
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="指數真實OHLC日K及成交量" style="display:block;width:100%;height:auto">`;
  for(let i=0;i<4;i++){const val=hi-(hi-lo)*i/3,yy=y(val);svg+=`<line x1="${p}" x2="${p+w}" y1="${f(yy)}" y2="${f(yy)}" stroke="#445467" stroke-opacity=".38"/><text x="2" y="${f(yy+3)}" fill="#afbdca" font-size="10">${Math.round(val)}</text>`;}
  const maxVol=Math.max(1,...bars.map(b=>b.volume||0));
  bars.forEach((b,i)=>{
   const x=p+(i+.5)*step,up=b.close>=b.open,color=up?'#e4777e':'#4ccdaa';
   svg+=`<line x1="${f(x)}" x2="${f(x)}" y1="${f(y(b.high))}" y2="${f(y(b.low))}" stroke="${color}" stroke-width="1.2"/>`;
   const yy=Math.min(y(b.open),y(b.close)),hh=Math.max(1,Math.abs(y(b.close)-y(b.open)));
   svg+=`<rect x="${f(x-Math.min(step*.3,4))}" y="${f(yy)}" width="${f(Math.max(1,Math.min(step*.6,8)))}" height="${f(hh)}" fill="${color}"/>`;
   if(hasVolume)svg+=`<rect x="${f(x-Math.min(step*.3,4))}" y="${f(vtop+vh-vh*(b.volume/maxVol))}" width="${f(Math.max(1,Math.min(step*.6,8)))}" height="${f(vh*(b.volume/maxVol))}" fill="${color}" opacity=".7"/>`;
  });
  // Moving averages use only observed earlier closes; no fake MA before n bars.
  for(const [n,color] of [[5,'#ffd36e'],[10,'#8dafff'],[20,'#eaa8ec']]){
   if(bars.length<n)continue;
   const points=[];
   for(let i=n-1;i<bars.length;i++){
    const ma=bars.slice(i-n+1,i+1).reduce((sum,b)=>sum+b.close,0)/n;
    points.push(f(p+(i+.5)*step)+','+f(y(ma)));
   }
   svg+=`<polyline points="${points.join(' ')}" stroke="${color}" fill="none" stroke-width="1.6"/>`;
  }
  svg+=`<text x="${p}" y="${H-5}" fill="#afbdca" font-size="11">${safe(bars[0].date)}</text><text x="${p+w}" y="${H-5}" fill="#afbdca" font-size="11" text-anchor="end">${safe(bars.at(-1).date)}</text></svg>`;
  return svg;
 }
 function levelMarkup(label,levels){
  const entries=levels.filter(Boolean).map(x=>{
   const down=x.pct<0?'跌 '+f(-x.pct)+'%':'已接近／低於防線';
   return `<span style="white-space:normal"><b>MA${x.n}</b> 明日動態線 ${f(x.price)}（${safe(down)}）</span>`;
  }).join('<span style="opacity:.45">｜</span>');
  return `<p style="margin:7px 0;font-size:12px;line-height:1.6"><b>${safe(label)}：</b>${entries||'均線歷史不足'}</p>`;
 }
 function panel(stock,intel,days,live){
  const result=inspect(stock,intel,days,live);
  const box='border:1px solid #37536a;border-radius:12px;padding:12px;margin:12px 0;color:#dce8f3;background:#122436';
  if(!result.ok){
   const indexSource=stock?.market==='上市'&&typeof R166IndexDaily!=='undefined'?(R166IndexDaily.get(stock.date)||R166IndexDaily.getLatest()):null;
   const indexOnly=indexSource?readSeries(indexSource):null;
   const view=indexOnly?.slice(-Math.max(20,Math.min(120,Number(days)||60)));
   const date=view?.at(-1)?.date||'';
   const matched=date===stock.date;
   const ownK=view&&view.length>=20&&view.every(b=>b.candle)?`<div class="r166-index-candles"><b>加權指數日 K｜MA5／10／20</b>${candleChart(view,view.every(b=>b.volume!==null))}<small>證交所 ${safe(date)} 日K；${matched?'個股同步比對仍待核對':'與個股 '+safe(stock.date)+' 日期不同，不做相對強弱比較。'}</small></div>`:'<p style="color:#ffd189">加權指數歷史日K尚未入庫，請執行指數資料更新流程。</p>';
   return `<section class="r162-compare" aria-label="個股與加權指數對照" style="${box}"><div id="r167-index-chart" role="region" aria-label="加權指數日K線圖"><b>📊 ${safe(result.indexName)}｜日 K 圖</b>${ownK}</div><p style="margin:6px 0;color:#ffd189">${safe(result.reason)}</p><small>個股與指數日期不一致時只看各自走勢，不混用為隔日交易訊號。</small></section>`;
  }
  const tone=result.excess>=0?'#ff6976':'#42e697',metric=v=>(v>=0?'+':'')+f(v)+'%';
  const indexChart=result.hasIndexK?candleChart(result.indices,result.hasIndexVolume):'<p style="color:#ffd189">指數只有歷史收盤資訊，缺乏開高低價，不能繪製真實日K。</p>';
  const warn=result.actualDays<result.requested?`<p style="color:#ffd189">資料只有${result.actualDays}個同步交易日，未達選定的${result.requested}日。</p>`:'';
  return `<section class="r162-compare" aria-label="個股與加權指數同步K線比較" style="${box}">
   <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between"><b>📊 ${safe(stock.code)} ${safe(stock.name)} × ${safe(result.indexName)}</b><small>${safe(result.date)} 盤後｜同步${result.actualDays}根</small></div>
   ${warn}<p style="font-size:12px;margin:6px 0">相同交易日、起點都是100；綠線個股，黃線${safe(result.indexName)}。不比較股票元數與指數點數。</p>
   <div id="r167-index-chart" role="region" aria-label="加權指數日K線圖" style="border-top:1px solid #315067;margin-top:9px;padding-top:8px"><b>${safe(result.indexName)}日 K｜MA5／10／20</b><div class="r166-index-candles">${indexChart}</div><small style="color:#aec4d5">黃 MA5｜藍 MA10｜紫 MA20｜紅漲綠跌；成交量採經核對的大盤市場量。</small></div>
   <div style="border-top:1px solid #315067;margin-top:9px;padding-top:8px"><b>個股 × 大盤｜同日相對強弱</b>${strengthChart(result.aligned)}<p style="font-size:13px;margin:6px 0">個股 ${safe(metric(result.stockReturn))}｜大盤 ${safe(metric(result.marketReturn))}｜<strong style="color:${tone}">相對超額 ${safe(metric(result.excess))}</strong></p></div>
   <div style="border-top:1px solid #315067;margin-top:9px;padding-top:8px"><b>隔日跌破MA5／MA10／MA20距離（收盤假設）</b>
   ${levelMarkup('個股',result.stockLevels)}${levelMarkup(result.indexName,result.indexLevels)}<small>動態跌破交叉價＝目前最近N−1日收盤均價；是假設下一交易日收盤觸線時的價位，非盤中即時值。跌破不等於一定出貨。</small></div>
   </section>`;
 }
 return Object.freeze({inspect,panel,readSeries,candleChart});
})();
globalThis.ChaopanCompareR162=R162Compare;

/* R168: Dedicated homepage TAIEX chart, opening from the actual
 * 台股盤後儀表板 > 加權指數 card. No stock needs to be opened. It only reads
 * independently verified TWSE K data; it never mutates marketTrend. */
const R168HomeIndex=(()=>{
 let bound=null, observer=null, queued=false, currentDays=60, previousFocus=null, chartEnd=null, zoomed=false, showFib=true, showGaps=true, showRange=true;
 const fmt=x=>Number(x).toLocaleString('zh-TW',{maximumFractionDigits:2,minimumFractionDigits:2});
 function ensureCss(){
  if(document.getElementById('r168-home-css'))return;
  const style=document.createElement('style');style.id='r168-home-css';
  style.textContent=`
  .r168-home-index-card{cursor:pointer!important;outline-offset:3px;position:relative}
  .r168-home-index-card:focus-visible{outline:2px solid #60dfd5!important}
  .r168-open-label{display:inline-block;font-size:11px;line-height:1.2;color:#7ce8f4;font-weight:700;vertical-align:middle;margin-left:4px}
  #r168-index-modal[hidden]{display:none!important}
  #r168-index-modal{position:fixed;inset:0;z-index:2147483600;background:rgba(0,6,15,.82);padding:10px;display:flex;align-items:center;justify-content:center;color:#e8f4fb}
  #r168-index-panel{background:#0b2133;border:1px solid #39b9da;border-radius:18px;box-shadow:0 0 30px rgba(12,174,211,.2);width:min(790px,100%);max-height:94dvh;overflow:auto;padding:15px;box-sizing:border-box;overscroll-behavior:contain}
  .r168-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.r168-head strong{font-size:20px}
  .r168-date{color:#abc5d3;font-size:12px}.r168-close{font-size:23px;padding:6px 12px;color:#e7f8ff;background:#19394e;border:1px solid #51798f;border-radius:12px;cursor:pointer}
  .r168-range{display:flex;gap:8px;margin:14px 0}.r168-range button{flex:1;border-radius:9px;border:1px solid #448297;background:#123345;color:#d3e8ee;padding:9px;font-weight:700;cursor:pointer}.r168-range button[aria-pressed="true"]{background:#3ed6bf;color:#00242d}
  .r168-result{padding:10px;background:#102d42;border:1px solid #325b6d;border-radius:12px}.r168-ohlc{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;font-size:12px;margin:9px 0}.r168-ohlc b{font-size:14px}.r168-ma{display:flex;justify-content:space-around;gap:5px;font-size:12px;color:#c8daee;flex-wrap:wrap;margin:8px 0}.r168-chart svg{width:100%;height:auto}.r168-foot{font-size:12px;color:#9fbdd0;margin-top:9px}
  .r168-error{font-size:14px;line-height:1.7;padding:18px 7px;color:#ffd179}
  .r171-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}.r171-toolbar button{border:1px solid #477d94;border-radius:8px;background:#123445;color:#e6f3f9;padding:7px 10px;font-weight:700;cursor:pointer}.r171-toolbar button[aria-pressed="true"]{color:#00252d;background:#39d7c3}
  .r171-inspector{border:1px solid #51758b;background:#102637;padding:9px;border-radius:10px;line-height:1.5;font-size:13px;min-height:70px;position:relative}.r171-inspector b{color:#58e2c8}.r171-inspector small{display:block;color:#b9d0dc}
  .r171-viewport{overflow-x:auto;overflow-y:hidden;width:100%;max-width:100%;border:1px solid #2c556d;border-radius:9px;background:#091b2b;touch-action:pan-x pan-y;scrollbar-width:thin;display:flex;justify-content:center}.r171-viewport svg{display:block;width:100%;max-width:680px;height:auto;flex:0 0 auto;touch-action:pan-x pan-y}
  .r171-hidden-fib .chaopan-fib-layer,.r171-hidden-gaps .chaopan-gap-layer,.r171-hidden-range .chaopan-range-layer{display:none!important}
  .r171-tip{font-size:12px;color:#b6cddd;margin:7px 0}.r171-chart-legend{font-size:12px;display:flex;flex-wrap:wrap;gap:4px 14px;color:#c0d4e1;margin:6px 0}
  .r172-expanded #r168-index-panel{width:min(790px,100%);max-height:94dvh;height:auto;border-radius:18px}.r172-expanded .r171-viewport{justify-content:flex-start;max-height:390px}.r172-expanded .r171-viewport svg{width:680px;min-width:680px;max-width:680px}#r168-index-panel{width:min(690px,100%)}@media(orientation:landscape){#r168-index-panel{width:min(720px,100%);max-height:92dvh}.r171-viewport svg{max-width:680px}}
  @media(max-width:410px){.r171-toolbar button{padding:6px 8px;font-size:12px}.r171-inspector{font-size:12px}#r168-index-panel{padding:10px}}

  @media(max-width:360px){#r168-index-panel{padding:10px}.r168-ohlc{gap:3px;font-size:11px}.r168-ohlc b{font-size:12px}.r168-head strong{font-size:18px}}
  `;style.textContent+=R174_CSS;document.head.appendChild(style);
 }
 function findCard(){
  // Match exactly the homepage index label; never the stock's 大盤K tile.
  for(const e of document.querySelectorAll('main *,section *,article *')){
   if(e.children.length||e.textContent.trim()!=='加權指數'||e.closest('#modalOverlay,#r168-index-modal'))continue;
   let p=e.parentElement,choice=null;
   for(let i=0;p&&i<4;i++,p=p.parentElement){
    const t=p.textContent.trim();
    if(t.includes('櫃買指數')||t.length>140)break;
    if(t.includes('加權指數')&&/\d[\d,]*\.\d{1,2}/.test(t)){choice=p;break;}
   }
   if(choice)return {card:choice,label:e};
   // Fallback to label itself when the value has not loaded yet.
   if(e.parentElement)return {card:e.parentElement,label:e};
  }
  return null;
 }
 function bind(){
  ensureCss();
  if(bound?.isConnected)return;
  const found=findCard();if(!found)return;
  bound=found.card;bound.classList.add('r168-home-index-card');bound.setAttribute('role','button');bound.tabIndex=0;
  bound.setAttribute('aria-label','加權指數，點擊開啟獨立日K線圖');bound.title='查看加權指數日K線';
  if(!found.label.querySelector('.r168-open-label')){
   const hint=document.createElement('span');hint.className='r168-open-label';hint.textContent='▥ 日K';found.label.append(hint);
  }
  bound.addEventListener('click',open);
  bound.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
 }
 function render(){
  const result=document.querySelector('#r168-index-content');if(!result)return;
  const otc=indexContext?.market==='上櫃', raw=otc?r201Benchmark(indexContext,true):R166IndexDaily.getLatest(),status=otc?{ok:!!raw,reason:'同日官方櫃買完整日K待核對'}:R166IndexDaily.status();
  const bars=raw&&R162Compare.readSeries(raw);
  const indexTitle=otc?'櫃買指數':'加權指數';
  const header=document.querySelector('#r168-index-modal .r168-head strong');if(header)header.textContent=indexTitle+'｜日 K 圖';
  if(!status.ok||!bars||bars.length<20||bars.some(x=>!x.candle)){
   if(otc){result.innerHTML='<div class="r168-error" role="status">櫃買指數同日完整開高低收待核對；不以加權指數代替。</div>';return;}
   result.innerHTML=`<div class="r168-error" role="status"><b>加權指數歷史日K尚未入庫</b><br><small>需要 data/taiex-daily.json 的完整開高低收；不能使用推測K棒。</small><br><small>請執行 GitHub Actions 的 Official TAIEX daily K history。</small><br><small>${String(status.reason||'').replace(/[<>]/g,'')}</small><br><button type="button" class="r168-retry" style="margin-top:12px;background:#3ed6bf;border:0;border-radius:9px;padding:8px 14px;color:#063441;font-weight:800">重新讀取指數資料</button></div>`;
   result.querySelector('.r168-retry')?.addEventListener('click',()=>{result.textContent='重新讀取官方指數資料…';Promise.resolve(R166IndexDaily.retry()).then(render).catch(render)});
   return;
  }
  const end=chartEnd===null?bars.length:Math.max(20,Math.min(bars.length,chartEnd));
  chartEnd=end;
  const history=bars.slice(0,end),shown=history.slice(-currentDays);
  const asOf=history.at(-1),realLast=bars.at(-1);
  const previous=bars.at(-2),diff=previous?(realLast.close/previous.close-1)*100:0;
  const maAt=(position,n)=>position+1<n?null:bars.slice(position+1-n,position+1).reduce((v,b)=>v+b.close,0)/n;
  const tone=diff>0?'#ff888c':diff<0?'#48d2a0':'#f3f6fa';
  const verifiedVolume=history.every(x=>x.volume!==null);
  // Use exactly the stock's makeChart SVG renderer, not the old small index-only drawing.
  // IndexMode disables individual-stock risk stars and defense labels.
  const historyMatrix=history.map(b=>[b.date,b.open,b.high,b.low,b.close,b.volume??0]);
  const svg=makeChart(historyMatrix,null,currentDays,[],[],null,asOf.date,{indexMode:true,noVolume:!verifiedVolume});
  const latestSelectedMA=[5,10,20].map(n=>maAt(end-1,n));
  const dateMatch=!state?.payload?.asOf||realLast.date===state.payload.asOf;
  result.innerHTML=`<div class="r168-result r171-chart" data-r171-version="R174">
   <div class="r168-date">${realLast.date} 盤後｜${dateMatch?'大盤與個股盤後日期一致':'大盤與個股盤後日期不同，只看各自歷史'}</div>
   <div style="font-size:23px;font-weight:800;margin:4px 0">${fmt(realLast.close)} <span style="font-size:16px;color:${tone}">${diff>0?'+':''}${diff.toFixed(2)}%</span></div>
   <div class="r171-toolbar" role="group" aria-label="加權K線操控">
     <button type="button" data-r171-pan="back" ${end<=20?'disabled':''}>◀ 前段</button><button type="button" data-r171-pan="next" ${end>=bars.length?'disabled':''}>後段 ▶</button>
     <button type="button" data-r171-zoom="in" aria-label="放大K線">＋</button><button type="button" data-r171-zoom="out" aria-label="縮小K線">－</button>
     <button type="button" data-r171-full="1" aria-pressed="${zoomed}">${zoomed?'↩ 還原':'⛶ 圖框放大'}</button>
     <button type="button" data-r171-toggle="fib" aria-pressed="${showFib}">費波</button><button type="button" data-r171-toggle="range" aria-pressed="${showRange}">盤整</button><button type="button" data-r171-toggle="gaps" aria-pressed="${showGaps}">缺口</button>
   </div>
   <div class="r171-inspector" role="status" aria-live="polite" data-r171-inspector>點選K棒可查看單日開高低收</div>
   <div class="r171-viewport ${showFib?'':'r171-hidden-fib'} ${showRange?'':'r171-hidden-range'} ${showGaps?'':'r171-hidden-gaps'}" data-r171-viewport aria-label="可左右滑動的完整${indexTitle}K線">${svg}</div>
   ${r174IndexExtras(bars,indexTitle)}
   ${r200CrossCard({date:realLast.date,bars:bars.map(b=>[b.date,b.open,b.high,b.low,b.close,b.volume]),market:otc?'上櫃':'上市'},{close:realLast.close,fresh:dateMatch&&!chaopanEodFreshness(realLast.date).stale},true)}
   <div class="r171-tip">${shown.length}根日K｜左右滑動查看；前段／後段瀏覽歷史；點K棒看價量｜${verifiedVolume?'官方成交量':'成交量尚未核實'}</div>
   <div class="r168-ma"><span style="color:#ffd36e">MA5 ${latestSelectedMA[0]===null?'—':fmt(latestSelectedMA[0])}</span><span style="color:#8dafff">MA10 ${latestSelectedMA[1]===null?'—':fmt(latestSelectedMA[1])}</span><span style="color:#eaa8ec">MA20 ${latestSelectedMA[2]===null?'—':fmt(latestSelectedMA[2])}</span></div>
   <div class="r171-chart-legend"><span style="color:#ff777f">■ 上漲</span><span style="color:#3bd1b4">■ 下跌</span><span style="color:#ffd36e">━ MA5</span><span style="color:#8dafff">━ MA10</span><span style="color:#eaa8ec">━ MA20</span></div>
   <div class="r168-foot">收盤歷史資料，非即時報價；不將指數技術圖誤判為個股減碼或突破星號。</div></div>`;
  const viewport=result.querySelector('[data-r171-viewport]'),canvas=viewport?.querySelector('svg'),inspector=result.querySelector('[data-r171-inspector]');
  if(canvas&&inspector){
   const cross=document.createElementNS('http://www.w3.org/2000/svg','line');
   cross.setAttribute('stroke','#f2cf75');cross.setAttribute('stroke-width','1.5');cross.setAttribute('stroke-dasharray','4 4');cross.setAttribute('pointer-events','none');canvas.append(cross);
   const select=i=>{
    if(i<0||i>=shown.length)return;
    const b=shown[i],position=end-shown.length+i,prev=bars[position-1];
    const change=prev?.close>0?(b.close/prev.close-1)*100:null;
    const values=[['開',b.open],['高',b.high],['低',b.low],['收',b.close],['量',b.volume]];
    inspector.innerHTML=`<b>${b.date}｜歷史日K</b><div style="display:flex;gap:3px 12px;flex-wrap:wrap">${values.map(([k,v])=>`<span>${k} ${v===null?'資料待補':fmt(v)}</span>`).join('')}<span style="color:${change===null?'#ddd':change>=0?'#ff888c':'#48d2a0'}">${change===null?'':`漲跌 ${change>0?'+':''}${change.toFixed(2)}%`}</span></div><small>MA5 ${maAt(position,5)===null?'—':fmt(maAt(position,5))} ／ MA10 ${maAt(position,10)===null?'—':fmt(maAt(position,10))} ／ MA20 ${maAt(position,20)===null?'—':fmt(maAt(position,20))}</small>`;
    const x=126+489*(i+.5)/shown.length;
    cross.setAttribute('x1',String(x));cross.setAttribute('x2',String(x));cross.setAttribute('y1','20');cross.setAttribute('y2','336');
   };
   const locate=e=>{const pt=canvas.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const ctm=canvas.getScreenCTM();if(!ctm)return;const local=pt.matrixTransform(ctm.inverse());if(local.x<118||local.x>623)return;select(Math.max(0,Math.min(shown.length-1,Math.floor((local.x-126)/489*shown.length))));};
   let drag=false;canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!e.isPrimary)return;drag=true;locate(e)});
   canvas.addEventListener('pointermove',e=>{if(drag)locate(e)});['pointerup','pointercancel','pointerleave'].forEach(name=>canvas.addEventListener(name,()=>{drag=false}));canvas.addEventListener('click',locate);
   select(shown.length-1);
   if(zoomed)viewport.scrollLeft=viewport.scrollWidth;
   let pinch=null;
   viewport.addEventListener('touchstart',e=>{if(e.touches.length===2)pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)},{passive:true});
   viewport.addEventListener('touchmove',e=>{if(e.touches.length!==2||!pinch)return;const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(d>pinch*1.28||d<pinch*.78){const growing=d>pinch;pinch=null;currentDays=Math.max(12,Math.min(120,Math.round(currentDays*(growing?.76:1.32))));render();}},{passive:true});
   viewport.addEventListener('touchend',e=>{if(e.touches.length<2)pinch=null},{passive:true});
  }
  result.querySelectorAll('[data-r171-pan]').forEach(b=>b.addEventListener('click',()=>{chartEnd=Math.max(20,Math.min(bars.length,end+(b.dataset.r171Pan==='back'?-20:20)));render()}));
  result.querySelectorAll('[data-r171-zoom]').forEach(b=>b.addEventListener('click',()=>{currentDays=Math.max(12,Math.min(120,Math.round(currentDays*(b.dataset.r171Zoom==='in'?.76:1.32))));render()}));
  result.querySelectorAll('[data-r171-toggle]').forEach(b=>b.addEventListener('click',()=>{const key=b.dataset.r171Toggle;if(key==='fib')showFib=!showFib;else if(key==='range')showRange=!showRange;else showGaps=!showGaps;render()}));
  result.querySelector('[data-r171-full]')?.addEventListener('click',()=>{zoomed=!zoomed;document.querySelector('#r168-index-modal')?.classList.toggle('r172-expanded',zoomed);render()});
 }

 function overlay(){
  let node=document.getElementById('r168-index-modal');if(node)return node;
  ensureCss();node=document.createElement('div');node.id='r168-index-modal';node.hidden=true;
  node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');node.setAttribute('aria-label','加權指數日K線圖');
  node.innerHTML=`<div id="r168-index-panel"><div class="r168-head"><strong>加權指數｜日 K 圖</strong><button class="r168-close" type="button" aria-label="關閉加權指數日K">×</button></div>
   <div class="r168-range">${[20,60,120].map(n=>`<button type="button" data-r168-days="${n}" aria-pressed="${n===currentDays}">${n}日</button>`).join('')}</div>
   <div id="r168-index-content" role="status"></div></div>`;
  document.body.append(node);
  node.querySelector('.r168-close').addEventListener('click',close);
  node.addEventListener('click',e=>{if(e.target===node)close()});
  node.querySelector('.r168-range').addEventListener('click',e=>{const b=e.target.closest('[data-r168-days]');if(!b)return;currentDays=Number(b.dataset.r168Days);chartEnd=null;node.querySelectorAll('[data-r168-days]').forEach(x=>x.setAttribute('aria-pressed',String(Number(x.dataset.r168Days)===currentDays)));render();});
  return node;
 }
 let indexContext=null;
 function open(stock=null){
  indexContext=stock?.market==='上櫃'?stock:null;
  chartEnd=null;currentDays=60;previousFocus=document.activeElement;
  const node=overlay();node.hidden=false;render();node.querySelector('.r168-close').focus();
  Promise.resolve(R166IndexDaily.ensure()).then(()=>{if(!node.hidden)render()}).catch(()=>{if(!node.hidden)render()});
 }
 function close(){const node=document.getElementById('r168-index-modal');if(node){node.hidden=true;node.classList.remove('r172-expanded')}zoomed=false;previousFocus?.focus?.();}
 function init(){bind();if(!observer){observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(!bound?.isConnected)bind()})});observer.observe(document.body,{childList:true,subtree:true});}
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('r168-index-modal')&&!document.getElementById('r168-index-modal').hidden){close();e.stopPropagation();}},true);
 }
 if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();}
 return Object.freeze({bind,open,close,render});
})();
globalThis.ChaopanHomeIndexR168=R168HomeIndex;


function renderDetail(){const c=state.detail;if(!c)return;R166IndexDaily.ensure();const starred=state.watch.has(c.market+'-'+c.code),cls=c.changePct>0?'rising':c.changePct<0?'falling':'neutral';
  $('#modalContent').innerHTML=`<div class="detail-title"><div><div class="eyebrow">STOCK ANALYSIS / ${esc(c.market)} · R132</div><h2 id="modalTitle">${esc(c.code)} ${esc(c.name)}</h2><div class="breakout-star-line">${breakoutStarHTML(c)} ${breakoutQualityHTML(c)}</div>${breakoutQualityExplanation(c)}<div class="detail-sub">${esc(c.date)} 盤後資料${state.mode==='demo'?' · 示範':''}</div></div><div class="detail-price"><strong>${price(c.close)}</strong><div class="${cls}">${pct(c.changePct)}</div></div></div>${guidanceCard(c)}${globalThis.ChaopanMarketRegime?.badgeFor?.(c,state.marketIntel,state.payload?.asOf)||''}<div class="chart-area"><div class="chart-top"><strong>歷史K線／成交量／均線</strong><button type="button" class="chaopan-expand" onclick="globalThis.ChaopanExpandChart(this)" aria-label="橫向放大K線">⛶ 橫向放大</button><div class="chart-range"><button class="range-btn ${state.chartDays===20?'active':''}" data-days="20">20日</button><button class="range-btn ${state.chartDays===60?'active':''}" data-days="60">60日</button><button class="range-btn ${state.chartDays===120?'active':''}" data-days="120">120日</button><button type="button" class="zoom-btn" data-zoom="in" aria-label="K線放大">＋</button><button type="button" class="zoom-btn" data-zoom="out" aria-label="K線縮小">－</button></div></div><div class="chart-window-notice" role="status">${(c.bars||[]).length<state.chartDays?`⚠ 已選 ${state.chartDays} 日，目前只有 ${(c.bars||[]).length} 根可用K線；不得視為完整 ${state.chartDays} 日型態。`:`本圖使用最近 ${Math.min(state.chartDays,(c.bars||[]).length)} 根K線。`}</div><div class="fib-toolbar"><button type="button" class="fib-toggle" aria-pressed="${!globalThis.ChaopanFibHidden}" onclick="globalThis.ChaopanToggleFib(this)">${globalThis.ChaopanFibHidden?'費波那契：隱藏':'費波那契：顯示'}</button><small>紅黃綠三色區帶｜最近120根歷史資料為基準</small></div><button type="button" class="fib-toggle" aria-pressed="${!globalThis.ChaopanRangeHidden}" onclick="globalThis.ChaopanToggleRange(this)">${globalThis.ChaopanRangeHidden?'盤整框：隱藏':'盤整框：顯示'}</button><button type="button" class="fib-toggle gap-toggle" aria-pressed="${!globalThis.ChaopanGapHidden}" onclick="globalThis.ChaopanToggleGaps(this)">${globalThis.ChaopanGapHidden?'缺口：隱藏':'缺口：顯示'}</button><span class="r58-breakout-audit" role="status">${esc(auditConsolidationBreakout(c).text)}</span><span class="r64-direction" role="status">${esc(consolidationDirection(c).text)}</span><span class="range-status">${(()=>{const r=detectConsolidation(c.bars||[]);return r?`最近盤整：${r.age}根前，${price(r.lower)}～${price(r.upper)}（${r.state==='down'?'已跌破':r.state==='up'?'已突破':r.state==='retest'?'回測確認（價格）':r.state==='retest_pending'?'回測待確認':r.state==='continuation'?'突破延續':'區間內'}；上緣${r.upperTouches}次／下緣${r.lowerTouches}次獨立測試）`:(auditConsolidationBreakout(c).status==='data_gap'?'⚠ K線資料不足，盤整框待核對':'最近60根未找到有效盤整區間');})()}</span><div id="chartSvg" class="${[globalThis.ChaopanFibHidden?'fib-hidden':'',globalThis.ChaopanRangeHidden?'range-hidden':'',globalThis.ChaopanGapHidden?'gap-hidden':''].filter(Boolean).join(' ')}" aria-label="雙指捏合可縮放K線">${makeChart(c.bars||[],latestNeck(c),state.chartDays,supportLines(c),c.structureV23?.necklines||[],r220Defense(c),c.date,{priceAdjustment:!!c.possiblePriceAdjustment})}</div><small class="chart-zoom-hint">日K以 ${esc(c.date)} 收盤為準；選定期間K棒決定價格縱軸，範圍外歷史頸線可在「明日操作」的關鍵價位觀察。非即時。</small><div class="chart-legend"><span>━━ 橘色：最新頸線</span><span style="color:#c8a5e8">━━ 淺紫：其他頸線／最後防守</span><span style="color:#3dd9ba">━━ 第一支撐</span><span style="color:#76abfa">━━ 第二支撐</span><span style="color:#ffd36e">━━ MA5</span><span style="color:#8dafff">━━ MA10</span><span style="color:#eaa8ec">━━ MA20</span><span style="color:#48b7c6">▰ 費波那契三色背景（可關閉）</span><span>紅漲綠跌</span><span>灰0：防守前兆｜橘1：第一根轉弱｜紅2：第二根轉弱（均為收盤後訊號）</span></div></div>
 ${R162Compare.panel(c,state.marketIntel,state.chartDays,state.mode!=='demo')}${mainTrendResearchPanel(c)}<details class="research-fold"><summary>▥ 均線強弱、六條均線與趨勢結構</summary>${maPanel(c)}${sixMaPanel(c)}${trendModePanel(c)}</details>
 <details class="research-fold"><summary>▥ 突破紅綠K、量價與續強證據</summary>${breakoutTrackPanel(c)}${liquidityPanel(c)}${continuationPanel(c)}${confirmedStrengthPanel(c)}${phasePanel(c)}</details>
 <details class="research-fold"><summary>▥ 法人與籌碼風險</summary>${ChaopanIntel.chipPanel(state.marketIntel,c,deskEvidence(c))}</details>
 <details class="research-fold"><summary>▥ 歷史頸線、突破驗證與原始統計</summary><div class="tagrow">${(c.tags||[]).map(t=>`<span class="signal-tag ${t}">${esc(TAGS[t]||t)}</span>`).join('')}${c.priceConfirmed?'<span class="signal-tag confirmed">價格收盤確認</span>':c.confirmed?'<span class="signal-tag confirmed">最大量確認</span>':''}</div><div class="detail-grid"><div class="detail-metric"><div class="small">近期主要突破頸線</div><strong>${price(latestNeck(c))} 元</strong><div class="small">${esc(c.structureV23?.primaryNecklineEvidence?.priceAnchorDate||c.structureV23?.necklineDate||c.neckDate||'來源待核對')}｜${esc(c.structureV23?.primaryNecklineEvidence?.priceAnchorSource||'來源K棒待核對')}${c.priceConfirmed&&c.neck!==latestNeck(c)?'／突破當日參考 '+price(c.neck):''}</div></div><div class="detail-metric"><div class="small">距離突破所需漲幅</div><strong>${latestNeck(c)>0&&numeric(c.close)>0?(Number(c.close)<latestNeck(c)?'+'+(100*(latestNeck(c)/Number(c.close)-1)).toFixed(2)+'%':'已站上／需確認'):'待核對'}</strong><div class="small">以現價為分母；非突破保證</div></div><div class="detail-metric"><div class="small">當日成交量</div><strong>${integer(c.lots)} 張</strong><div class="small">前10日均量 ${Number(c.volumeRatio).toFixed(2)} 倍</div></div><div class="detail-metric"><div class="small">近20日漲停估算</div><strong>${integer(c.limit20)} 次</strong><div class="small">含今天，依收盤價近似判定</div></div><div class="detail-metric"><div class="small">前120日最大量</div><strong>${integer(c.oldMaxLots)} 張</strong><div class="small">${esc(c.oldMaxDate||'—')}</div></div><div class="detail-metric"><div class="small">突破確認</div><strong>${c.priceConfirmed?'價格已突破':c.confirmed?'成交量創新高（非首破）':'尚未確認首破'}</strong><div class="small">低量一字漲停也可價格確認；大量另計</div></div></div></details>
 <details class="research-fold"><summary>▥ 起漲循環與階段證據</summary>${cyclePanel(c)}</details><details class="intel-deep"><summary>進階研究：技術與風險細節</summary>${technicalVisual(c)}${riskPanel(c)}</details><details class="fin-notes secondary-details"><summary>大量K突破與其他技術細節</summary>${launchSummary(c)}${traderPanel(c)}</details><div class="detail-note">${c.tags?.includes('volume')?'✓ 今日成交量大於前120個交易日最大量，且收盤高於舊最大量K最高價。':''} ${c.tags?.includes('first')?'✓ 今日收盤首次突破仍有效的大量K高點。':''} ${c.overextended?'⚠ 收盤距頸線已逾8%，應留意追高風險。':''}<br>盤後訊號僅供觀察，不代表次日買點；除權息可能導致假突破。</div><div class="detail-actions"><button class="primary-action" id="starButton">${starred?'★ 移出自選':'☆ 加入自選'}</button><button class="secondary-action" id="shareButton">分享股票資訊</button></div>`;
  arrangeR41Detail(c);
  if(globalThis.ChaopanChartExpanded) globalThis.ChaopanApplyExpandedChart?.();
  wireValuationScenario(c);
  wireForwardValuation(c);
  // 盤中價量試算已停用，避免舊功能重新掛載。

  $$('.range-btn').forEach(b=>b.onclick=()=>{state.chartDays=b.dataset.days==='120'?120:Number(b.dataset.days);renderDetail()});
  const zoom=(dir)=>{const total=(c.bars||[]).length;state.chartDays=Math.min(Math.max(12,total),Math.max(12,Math.min(total,Math.round(state.chartDays*(dir==='in'?.76:1.32)))));renderDetail()};
  $$('.zoom-btn').forEach(b=>b.onclick=()=>zoom(b.dataset.zoom));
  const chart=$('#chartSvg');
  // r86: Historical daily-candle inspector; read-only and independent of signals.
  if(chart && chart.querySelector('svg') && Array.isArray(c.bars)){
    const svg=chart.querySelector('svg');
    const allBars=c.bars;
    const shown=allBars.slice(-state.chartDays);
    const plotLeft=126,plotRight=615;
    const validShown=shown.length>0&&shown.every(b=>Array.isArray(b)&&b.length>=6&&[1,2,3,4,5].every(k=>Number.isFinite(Number(b[k]))));
    const panel=document.createElement('div');
    panel.className='r89-candle-header';
    panel.setAttribute('role','status');
    panel.setAttribute('aria-live','polite');
    panel.style.cssText='display:block;box-sizing:border-box;position:relative;z-index:2;width:100%;margin:8px 0 5px;padding:8px 12px;border:1px solid #416278;border-radius:9px;background:#102637;color:#e4edf5;font-size:13px;line-height:1.4;pointer-events:none';
    chart.insertAdjacentElement('beforebegin',panel);
    const vertical=document.createElementNS('http://www.w3.org/2000/svg','line');
    vertical.setAttribute('stroke','#f2cf75');vertical.setAttribute('stroke-width','1.3');
    vertical.setAttribute('stroke-dasharray','4 3');vertical.setAttribute('pointer-events','none');
    svg.appendChild(vertical);
    const selectBar=(index)=>{
      if(index<0||index>=shown.length)return;
      const b=shown[index];if(!Array.isArray(b)||b.length<6)return;
      const fmt=n=>Number(n).toLocaleString('zh-TW',{maximumFractionDigits:2});
      const previous=allBars[allBars.length-shown.length+index-1];
      const change=previous&&Number(previous[4])>0?(Number(b[4])/Number(previous[4])-1)*100:null;
      panel.textContent='';
      const head=document.createElement('div');
      head.style.cssText='font-weight:700;color:#65d9c2;white-space:nowrap';
      head.textContent=String(b[0])+'｜歷史日K';
      const line=document.createElement('div');
      line.style.cssText='display:flex;flex-wrap:wrap;gap:3px 14px;align-items:center;margin-top:3px';
      [['開',b[1]],['高',b[2]],['低',b[3]],['收',b[4]],['量',b[5]]].forEach(([name,value])=>{
        const item=document.createElement('span');item.style.whiteSpace='nowrap';
        item.textContent=name+' '+fmt(value);line.appendChild(item);
      });
      if(change!==null){const item=document.createElement('span');item.style.whiteSpace='nowrap';item.style.color=change>=0?'#f18a91':'#55d0a8';item.textContent='漲跌 '+(change>=0?'+':'')+change.toFixed(2)+'%';line.appendChild(item)}
      panel.append(head,line);
      const x=plotLeft+(plotRight-plotLeft)*(index+.5)/shown.length;
      vertical.setAttribute('x1',String(x));vertical.setAttribute('x2',String(x));vertical.setAttribute('y1','20');vertical.setAttribute('y2','336');
    };
    const locate=ev=>{
      const pt=svg.createSVGPoint();pt.x=ev.clientX;pt.y=ev.clientY;
      const matrix=svg.getScreenCTM();if(!matrix)return;
      const local=pt.matrixTransform(matrix.inverse());
      if(!validShown||local.x<plotLeft-8||local.x>plotRight+8)return;
      selectBar(Math.max(0,Math.min(shown.length-1,Math.floor((local.x-plotLeft)/(plotRight-plotLeft)*shown.length))));
    };
    let dragging=false;
    svg.addEventListener('pointerdown',ev=>{if(ev.pointerType==='touch'&&!ev.isPrimary)return;dragging=true;locate(ev)});
    svg.addEventListener('pointermove',ev=>{if(dragging)locate(ev)});
    svg.addEventListener('pointerup',()=>{dragging=false});
    svg.addEventListener('pointercancel',()=>{dragging=false});
    svg.addEventListener('pointerleave',()=>{dragging=false});
    svg.addEventListener('click',locate);
    if(validShown)selectBar(shown.length-1);else panel.textContent='歷史K線欄位不完整，無法查價';
  }
  if(chart){let distance=null;const separation=ev=>Math.hypot(ev.touches[0].clientX-ev.touches[1].clientX,ev.touches[0].clientY-ev.touches[1].clientY);
    chart.addEventListener('touchstart',ev=>{if(ev.touches.length===2)distance=separation(ev)},{passive:true});
    chart.addEventListener('touchmove',ev=>{if(ev.touches.length!==2||!distance)return;ev.preventDefault();const next=separation(ev);if(next>distance*1.24){distance=null;zoom('in')}else if(next<distance*.8){distance=null;zoom('out')}},{passive:false});
    chart.addEventListener('touchend',ev=>{if(ev.touches.length<2)distance=null},{passive:true});
    chart.addEventListener('wheel',ev=>{if(!ev.ctrlKey)return;ev.preventDefault();zoom(ev.deltaY<0?'in':'out')},{passive:false});
  }
  if($('#starButton'))$('#starButton').onclick=()=>{const key=c.market+'-'+c.code;if(state.watch.has(key))state.watch.delete(key);else state.watch.add(key);saveWatch();renderDetail();toast('已更新自選清單')};
  if($('#shareButton'))$('#shareButton').onclick=async()=>{const info=`超盤手大量K雷達｜${c.code} ${c.name}\n${c.date} 收盤 ${price(c.close)}\n近期主要突破頸線 ${price(latestNeck(c))}\n量比 ${c.volumeRatio} 倍｜20日漲停估算 ${c.limit20} 次\n資料非即時，僅供研究。`;try{await navigator.clipboard.writeText(info);toast('已複製資訊')}catch(e){toast('請用手機內建分享功能')}};
}
function detectConsolidation(all){
 // r57: fixed base boundaries and chronological, conservative event states.
 if(!Array.isArray(all)||all.length<22)return null;
 const last=all.length-1,candidates=[];
 const finite=b=>Array.isArray(b)&&b.length>=5&&[b[2],b[3],b[4]].every(x=>Number.isFinite(Number(x))&&Number(x)>0)&&Number(b[2])>=Number(b[3])&&Number(b[4])<=Number(b[2])&&Number(b[4])>=Number(b[3]);
 // r60: invalid bars must not silently be treated as no consolidation.
 if(!all.every(finite))return null;
 const touches=(values,threshold,above)=>{const hits=[];for(let i=0;i<values.length;i++)if(above?values[i]>=threshold:values[i]<=threshold){if(!hits.length||i-hits[hits.length-1]>=3)hits.push(i)}return hits};
 const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
 for(let end=last-1;end>=Math.max(11,last-60);end--){
  for(const n of [30,25,20,15,12]){
   const start=end-n+1;if(start<0)continue;
   const w=all.slice(start,end+1),highs=w.map(b=>Number(b[2])),lows=w.map(b=>Number(b[3])),closes=w.map(b=>Number(b[4]));
   const upper=Math.max(...highs),lower=Math.min(...lows),mid=(upper+lower)/2,width=(upper-lower)/mid;
   if(!(mid>0)||width<.018||width>.14)continue;
   const part=Math.max(3,Math.floor(n/3)),drift=Math.abs(mean(closes.slice(-part))-mean(closes.slice(0,part)))/mid;
   if(drift>.045)continue;
   const hiHits=touches(highs,upper-(upper-lower)*.20,true),loHits=touches(lows,lower+(upper-lower)*.20,false);
   if(hiHits.length<2||loHits.length<2)continue;
   let breakoutIndex=-1,breakoutDir=null,state='inside',retestIndex=-1,failedIndex=-1,pendingRetest=-1;
   for(let i=end+1;i<=last;i++){
    const close=Number(all[i][4]),low=Number(all[i][3]);
    if(breakoutIndex<0){
     if(close>upper*1.005){breakoutIndex=i;breakoutDir='up';state='up'}
     else if(close<lower*.995){breakoutIndex=i;breakoutDir='down';state='down'}
    }else if(breakoutDir==='up'){
     if(close<upper*.995){state='failed';failedIndex=i;break}
     // A touch is only a retest attempt, not an automatic successful retest.
     // Require a subsequent close back above the breakout boundary and above the touch-day close.
     let confirmedThisBar=false;
     if(pendingRetest>=0&&i>pendingRetest){
      if(close>upper*1.005&&close>Number(all[pendingRetest][4])){state='retest';retestIndex=i;pendingRetest=-1;confirmedThisBar=true}
      else if(i-pendingRetest>=2)pendingRetest=-1;
     }
     if(i>breakoutIndex&&low<=upper*1.01&&low>=lower*.995&&close>=upper*.995&&state!=='retest'){
      pendingRetest=i;state='retest_pending';
     }else if(state==='retest'&&!confirmedThisBar&&low>upper*1.01){state='continuation'}
     else if(state==='up'&&i>breakoutIndex){state='continuation'}
    }else if(close>lower*1.005){state='failed';failedIndex=i;break}
   }
   const age=last-end,breakoutAge=breakoutIndex<0?-1:last-breakoutIndex;
   if(state==='failed'||(breakoutIndex>=0&&breakoutAge>5)||(breakoutIndex<0&&age>5))continue;
   const score=hiHits.length+loHits.length+n*.18-width*15-drift*80-age*.45;
   candidates.push({start,end,upper,lower,state,age,breakoutIndex,breakoutDate:breakoutIndex>=0?String(all[breakoutIndex][0]):null,retestIndex,retestDate:retestIndex>=0?String(all[retestIndex][0]):null,failedIndex,upperTouches:hiHits.length,lowerTouches:loHits.length,score,volumeConfirmed:null});
  }
 }
 candidates.sort((a,b)=>b.end-a.end||b.score-a.score);
 return candidates[0]||null;
}
// r58: independent evidence audit; never creates or upgrades official EOD stars.
// r60: observational directional evidence only; never promotes a breakout stage.
function consolidationDirection(c){
 // r64: upward-only, observation-only. No forward-looking bars or official star mutation.
 const bars=c?.bars||[],r=detectConsolidation(bars);
 if(!Array.isArray(bars)||bars.length<30||bars.some(b=>!Array.isArray(b)||b.length<6||[b[2],b[3],b[4]].some(v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))||Number(v)<=0)))
  return {status:'unavailable',text:'盤整觀察：歷史K線不足或價格缺漏，待核對'};
 if(!r)return {status:'none',text:'盤整觀察：尚未找到符合條件的盤整區間'};
 if(r.breakoutIndex>=0)return {status:'event',text:'盤整觀察：已離開盤整框，請依正式突破事件及量能確認'};
 const last=bars.length-1,close=Number(bars[last][4]),width=r.upper-r.lower;
 if(!(width>0)||!(close>0))return {status:'unavailable',text:'盤整觀察：價格待核對'};
 const pos=(close-r.lower)/width,dist=(r.upper/close-1)*100;
 const mean=arr=>arr.reduce((a,b)=>a+b,0)/arr.length;
 const cls=bars.map(b=>Number(b[4])), lows=bars.map(b=>Number(b[3]));
 const ma5=mean(cls.slice(-5)),ma10=mean(cls.slice(-10)),ma20=mean(cls.slice(-20));
 const old20=mean(cls.slice(-25,-5));
 const lowRecent=Math.min(...lows.slice(-5)),lowPrior=Math.min(...lows.slice(-10,-5));
 const risingLows=lowRecent>=lowPrior*.998;
 const rangeAvg=arr=>mean(arr.map(b=>(Number(b[2])-Number(b[3]))/Number(b[4])));
 const contracting=rangeAvg(bars.slice(-5))<rangeAvg(bars.slice(-10,-5))*.85;
 const volume=bars.slice(-20).map(b=>b[5]===null||b[5]===undefined||b[5]===''?NaN:Number(b[5]));
 const volumeOK=volume.every(v=>Number.isFinite(v)&&v>0);
 const upVol=volumeOK?volume.slice(-10).filter((v,i)=>cls[last-9+i]>cls[last-10+i]):[];
 const downVol=volumeOK?volume.slice(-10).filter((v,i)=>cls[last-9+i]<cls[last-10+i]):[];
 const volUp=volumeOK&&upVol.length>=2&&downVol.length>=2&&mean(upVol)>mean(downVol)*1.05;
 const nearTop=pos>=.75&&dist>=0&&dist<=2.5;
 const maOK=ma5>=ma10&&ma10>=ma20*.99&&ma20>=old20*.985;
 const count=[nearTop,risingLows,maOK,contracting,volUp].filter(Boolean).length;
 const facts=`距上緣 ${dist.toFixed(2)}%；低點${risingLows?'持平／墊高':'尚未墊高'}；均線${maOK?'偏多':'未確認'}；波動${contracting?'收斂':'未明顯收斂'}；量價${volumeOK?(volUp?'偏多':'未確認'):'待核對'}`;
 if(nearTop&&risingLows&&maOK&&count>=4&&volumeOK)
  return {status:'prebreakout',text:`預備向上突破觀察（${count}/5項）：${facts}；尚未突破，非買進訊號`};
 if(nearTop)return {status:'watch',text:`接近盤整上緣（${count}/5項）：${facts}；等待收盤突破與量能確認`};
 return {status:'forming',text:`盤整中（${count}/5項）：${facts}；未達預備向上突破條件`};
}

function auditConsolidationBreakout(c){
 const r=detectConsolidation(c?.bars||[]);
 if(!r){
  const bars=c?.bars;
  if(Array.isArray(bars)&&bars.length>=22&&bars.some(b=>!Array.isArray(b)||b.length<5||![b[2],b[3],b[4]].every(v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0)))
   return {status:'data_gap',text:'⚠ K線缺值或格式錯誤：盤整框資料待核對，不代表沒有盤整'};
  return {status:'none',text:'盤整框：無有效區間，不作突破判斷'};
 }
 if(r.breakoutIndex<0)return {status:'inside',text:'盤整框：尚未確認突破'};
 const bars=c.bars||[], event=bars[r.breakoutIndex], level=r.state==='down'?r.lower:r.upper;
 const volumeBars=bars.slice(Math.max(0,r.breakoutIndex-20),r.breakoutIndex);
 const volumes=volumeBars.map(b=>b[5]===null||b[5]===undefined?NaN:Number(b[5]));
 const eventVol=Number(event?.[5]);
 const volumeOK=volumes.length===20&&volumes.every(v=>Number.isFinite(v)&&v>0)&&Number.isFinite(eventVol)&&eventVol>0;
 const avg=volumeOK?volumes.reduce((a,b)=>a+b,0)/20:null;
 const ratio=avg?eventVol/avg:null;
 const eventLevel=Number(c?.breakoutEvent?.level);
 const phase=String(c?.starPhase||'').toLowerCase();
 const quality=String(c?.breakoutQuality||'').toLowerCase();
 const hasOfficial=Number.isFinite(eventLevel)&&eventLevel>0&&['first','second','third','fourth_plus'].includes(phase);
 const tolerance=.005;
 const sameLevel=hasOfficial&&Math.abs(eventLevel-level)/level<=tolerance;
 const volumeText=ratio===null?'突破量能待核對':`突破量比 ${ratio.toFixed(2)} 倍（20日均量）`;
 if(r.state==='down')return {status:'down',text:`盤整框已下破；${volumeText}；不視為多頭突破`};
 if(!['up','retest','continuation','retest_pending'].includes(r.state))return {status:'watch',text:'盤整框突破狀態待核對'};
 if(!hasOfficial)return {status:'pending',text:`盤整框價格突破；${volumeText}；盤後突破事件尚未確認，不產生星號`};
 if(!sameLevel)return {status:'conflict',text:`⚠ 盤整框上緣 ${level.toFixed(2)} 與官方事件頸線 ${eventLevel.toFixed(2)} 不一致；待核對，不升級訊號`};
 if(quality==='invalid'||quality==='weak')return {status:'conflict',text:`⚠ 官方突破品質為${quality}；盤整框不能覆蓋風險判斷`};
 if(ratio===null)return {status:'pending',text:'盤整框與事件頸線相符，但突破量能資料不足；待核對'};
 if(ratio<1.3)return {status:'watch',text:`盤整框與事件頸線相符；${volumeText}，未達1.30倍參考門檻`};
 if(quality!=='strong')return {status:'pending',text:`盤整框與事件頸線相符；${volumeText}，官方量價品質尚未確認`};
 return {status:'aligned',text:`盤整框與官方事件頸線一致；${volumeText}；官方量價品質為strong（非買進保證）`};
}
// R220: chart-only evidence guard; market dates are a reference, not a stock halt calendar.
function r220ChartWindowOK(all,sessions,indexMode=false){
 if(!Array.isArray(all)||all.length<2||!Array.isArray(sessions))return false;
 const num=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')?Number(v):NaN;
 let prev='';
 for(const b of all){
  if(!Array.isArray(b)||b.length<6||typeof b[0]!=='string'||b[0]<=prev)return false;
  const [o,h,l,c,v]=b.slice(1,6).map(num);
  if(![o,h,l,c].every(x=>Number.isFinite(x)&&x>0)||h<Math.max(o,l,c)||l>Math.min(o,h,c)||(!indexMode&&!(Number.isFinite(v)&&v>0)))return false;
  prev=b[0];
 }
 const first=all[0][0],last=all.at(-1)[0];
 if(!sessions.includes(first)||!sessions.includes(last))return false;
 return sessions.filter(d=>d>=first&&d<=last).join('|')===all.map(b=>b[0]).join('|');
}
function detectPriceGaps(all,sessions=typeof r214Sessions!=='undefined'?r214Sessions?.dates:null,indexMode=false){
 if(!Array.isArray(all)||all.length<2)return [];
 const gaps=[];
 for(let i=1;i<all.length;i++){
  const prev=all[i-1],cur=all[i];
  const ph=Number(prev[2]),pl=Number(prev[3]),ch=Number(cur[2]),cl=Number(cur[3]);
  let dir,lower,upper;
  if(cl>ph){dir='up';lower=ph;upper=cl;}
  else if(ch<pl){dir='down';lower=ch;upper=pl;}
  else continue;
  if(!(upper>lower&&lower>0)||!r220ChartWindowOK(all.slice(i-1),sessions,indexMode))continue;
  let filledAt=-1,remainingLower=lower,remainingUpper=upper;
  for(let j=i+1;j<all.length;j++){
   const h=Number(all[j][2]),l=Number(all[j][3]);
   if(dir==='up'){
    if(l<=lower){filledAt=j;break;}
    remainingUpper=Math.min(remainingUpper,l);
   }else{
    if(h>=upper){filledAt=j;break;}
    remainingLower=Math.max(remainingLower,h);
   }
  }
  const partial=remainingLower>lower||remainingUpper<upper;
  gaps.push({index:i,date:String(cur[0]),dir,lower,upper,filledAt,partial,remainingLower,remainingUpper});
 }
 return gaps;
}
function makeChart(bars,neck,days,supports=[],necklines=[],mainDefense=null,asOf=null,opts={}){
  const indexMode=opts?.indexMode===true,noVolume=opts?.noVolume===true;
  // The chart must not silently discard a corrupt candle or plot future dates.
  // Reject malformed, unordered, duplicated or out-of-session OHLCV instead.
  if(!Array.isArray(bars)||!bars.length)return '<div class="empty-state">沒有歷史K線可顯示</div>';
  let previous='';
  const all=[];
  for(const b of bars){
    if(!Array.isArray(b)||b.length<6)return '<div class="empty-state">日K欄位不足，走勢圖待核對</div>';
    const d=String(b[0]);
    const n=b.slice(1,6).map(x=>x===null||x===undefined||x===''?NaN:Number(x));
    const validDate=/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
    if(!validDate||d<=previous||!n.every(Number.isFinite)||n[0]<=0||n[1]<=0||n[2]<=0||n[3]<=0||n[4]<0||n[1]<Math.max(n[0],n[2],n[3])||n[2]>Math.min(n[0],n[1],n[3]))return '<div class="empty-state">日K日期或價量異常，走勢圖待核對</div>';
    previous=d;all.push(b);
  }
  if(asOf&&previous!==String(asOf))return '<div class="empty-state">個股收盤日與最後一根K線不同，走勢圖待核對</div>';
  const length=Number(days);if(!Number.isInteger(length)||length<1)return '<div class="empty-state">K線顯示期間無效</div>';
  let data=all.slice(-length);
  const W=680,H=366,P=126,plotW=W-P-65,top=20,kHeight=253,volTop=294,volHeight=42;
  const included=(supports||[]).map(s=>numeric(s.lower)).filter(v=>v!==null&&v>0);
  if(mainDefense?.lower>0)included.push(Number(mainDefense.lower));
  // Candle scale belongs to the selected time window. An old 645-dollar
  // anchor must not flatten a recent 380-dollar trading range. Keep far-away
  // levels in the textual '關卡圖解', instead of expanding the Y-axis to them.
  const hi=Math.max(...data.map(b=>Number(b[2])))*1.025;
  const lo=Math.min(...data.map(b=>Number(b[3])))*.975;
  const py=n=>top+(hi-n)/(hi-lo)*kHeight,step=plotW/data.length,barW=Math.max(1.5,Math.min(8,step*.62));const maxV=Math.max(...data.map(b=>Number(b[5])),1);
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="近${data.length}日收盤K線、成交量及大量K壓力線">`;
  for(let i=0;i<=4;i++){const y=top+kHeight*i/4,v=hi-(hi-lo)*i/4;svg+=`<line x1="${P}" x2="${P+plotW}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#284057" stroke-width="1" opacity=".65"/><text x="${P+plotW+5}" y="${y+4}" fill="#8198aa" font-size="13">${v.toFixed(1)}</text>`}
  // Fibonacci levels are display-only, derived from the selected historical
  // candles available as of the snapshot date. They are NOT verified supports.
  // Anchor from the earlier extreme to the later one; never use future bars.
  const fibData=all.slice(-120);
  const extremaHigh=fibData.reduce((best,b,i)=>Number(b[2])>best.value?{value:Number(b[2]),index:i}:best,{value:-Infinity,index:-1});
  const extremaLow=fibData.reduce((best,b,i)=>Number(b[3])<best.value?{value:Number(b[3]),index:i}:best,{value:Infinity,index:-1});
  const fibReady=!opts?.priceAdjustment&&fibData.length>=20&&r220ChartWindowOK(fibData,r214Sessions?.dates,indexMode)&&extremaHigh.value>extremaLow.value&&extremaHigh.index!==extremaLow.index;
  if(fibReady){
    const up=extremaLow.index<extremaHigh.index;
    const diff=extremaHigh.value-extremaLow.value;
    // Three restrained bands: higher prices red, middle yellow, lower green.
    // Levels are calculated from the fixed history, independent of chart zoom.
    const bandEdges=[extremaLow.value,extremaLow.value+diff*.382,extremaLow.value+diff*.618,extremaHigh.value];
    const bandColors=['#51b58b','#d9b55b','#d16c76'];
    svg+='<g class="chaopan-fib-layer" aria-label="費波那契紅黃綠彩色背景區帶">';
    for(let i=0;i<3;i++){
      const upper=Math.min(hi,bandEdges[i+1]),lower=Math.max(lo,bandEdges[i]);
      if(upper<=lower)continue;
      svg+=`<rect x="${P}" y="${py(upper).toFixed(1)}" width="${plotW}" height="${Math.max(0,py(lower)-py(upper)).toFixed(1)}" fill="${bandColors[i]}" opacity=".12"/>`;
    }
    const ratios=[.236,.382,.5,.618,.786];
    const fibLabels=ratios.map(r=>({r,val:up?extremaHigh.value-diff*r:extremaLow.value+diff*r}))
      .filter(v=>v.val>=lo&&v.val<=hi).sort((a,b)=>py(a.val)-py(b.val));
    let lastY=top-15;
    for(const v of fibLabels){
      const y=Math.min(top+kHeight-3,Math.max(top+11,py(v.val),lastY+13));lastY=y;
      const major=[.382,.5,.618].some(r=>Math.abs(r-v.r)<.00001);
      svg+=`<text x="${P-8}" text-anchor="end" y="${y.toFixed(1)}" fill="${major?'#e5edf5':'#a4b8c9'}" font-size="${major?13:11}" font-weight="${major?600:400}">${v.r.toFixed(3)} ${price(v.val)}</text>`;
    }
    svg+='</g>';
  }
  // Range detection uses only bars strictly preceding the last close; no future leak.
  // A range must be tight, repeatedly tested, and lack a directional drift.
  const range=detectConsolidation(all);
  if(range && (range.state==='inside' || Number(range.age)<=5)){
    const visibleStart=all.length-data.length;
    const from=Math.max(range.start,visibleStart),to=Math.min(range.end,all.length-1);
    if(from<=to&&range.upper>=lo&&range.lower<=hi){
      const x1=P+(from-visibleStart)*step,x2=P+(to-visibleStart+1)*step;
      const upper=Math.min(hi,range.upper),lower=Math.max(lo,range.lower);
      const tone=['up','retest','retest_pending','continuation'].includes(range.state)?'#3dd9ba':range.state==='down'?'#ff777f':'#73b8ee';
      svg+=`<g class="chaopan-range-layer" style="${globalThis.ChaopanRangeHidden?'display:none':''}" aria-label="盤整區間（研究提示）"><rect x="${x1.toFixed(1)}" y="${py(upper).toFixed(1)}" width="${Math.max(1,x2-x1).toFixed(1)}" height="${Math.max(1,py(lower)-py(upper)).toFixed(1)}" fill="${tone}" fill-opacity=".045" stroke="${tone}" stroke-width="1.8"/><text x="${(x1+3).toFixed(1)}" y="${Math.max(top+11,py(upper)-4).toFixed(1)}" fill="${tone}" font-size="10">${range.state==='up'?'盤整上破待確認':range.state==='retest'?'回測確認（價格）':range.state==='retest_pending'?'回測待確認':range.state==='continuation'?'突破延續':range.state==='down'?'盤整下破警戒':'盤整觀察'}</text></g>`;
    }
  }
  const annotations=[];
  const secondaryNecks=(necklines||[]).filter(v=>
    v&&Number.isFinite(Number(v.price))&&Number(v.price)>0&&
    Math.abs(Number(v.price)-Number(neck))>.0001&&Number(v.price)>=Number(data.at(-1)[4])*.97&&
    (!asOf||!v.date||String(v.date)<=String(asOf)))
    .sort((a,b)=>Math.abs(Number(a.price)-Number(data.at(-1)[4]))-Math.abs(Number(b.price)-Number(data.at(-1)[4])))
    .slice(0,1);
  for(const v of secondaryNecks){const val=Number(v.price);if(val<lo||val>hi)continue;const y=py(val);svg+=`<line x1="${P}" x2="${P+plotW}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#b49acf" stroke-width="1" opacity=".8"/>`;const formedToday=v.formedToday===true||(asOf&&String(v.date)===String(asOf));annotations.push({y:y-5,color:'#b49acf',label:formedToday?`當日新大量K高點（次日參考） ${price(val)}`:`歷史大量K${val>Number(data.at(-1)[4])?'壓力候選':'參考價'} ${price(val)}${v.date?' · '+String(v.date).slice(5):''}`})}
  if(mainDefense && Number.isFinite(Number(mainDefense.keyPrice??mainDefense.lower)) && (mainDefense.keyPrice??mainDefense.lower)>=lo && (mainDefense.keyPrice??mainDefense.lower)<=hi){const y=py(Number(mainDefense.keyPrice??mainDefense.lower));svg+=`<line x1="${P}" x2="${P+plotW}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#c8a5e8" stroke-width="2"/>`;annotations.push({y:y-5,color:'#c8a5e8',label:`最後防守 ${price(mainDefense.keyPrice??mainDefense.lower)}`})}
  if(Number.isFinite(Number(neck))&&Number(neck)>=lo&&Number(neck)<=hi){const y=py(Number(neck));svg+=`<line x1="${P}" x2="${P+plotW}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e7b365" stroke-width="2.3"/>`;annotations.push({y:y-5,color:'#e7b365',label:`頸線 ${price(neck)}`})}
  const lineColors=['#3dd9ba','#76abfa'];
  (supports||[]).slice(0,2).forEach((v,idx)=>{
    const l=numeric(v.lower),u=numeric(v.upper);if(l===null||u===null||l<lo||l>hi)return;
    const y1=py(Math.min(u,hi)),y2=py(l),col=lineColors[idx];
    svg+=`<rect x="${P}" y="${Math.max(top,y1).toFixed(1)}" width="${plotW}" height="${Math.max(2,y2-Math.max(top,y1)).toFixed(1)}" fill="${col}" opacity=".10"/>`;
    svg+=`<line x1="${P}" x2="${P+plotW}" y1="${y2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="1.5"/>`;
    annotations.push({y:y2-5,color:col,label:`${idx===0?'第一':'第二'}支撐 ${price(l)}`});
  });
  // Separate text labels vertically when neck and supports sit within a narrow band.
  annotations.sort((a,b)=>a.y-b.y);
  let last=-100;
  for(const a of annotations){const yy=Math.max(top+12,Math.min(top+kHeight-4,Math.max(a.y,last+13)));last=yy;
    svg+=`<text x="${P+3}" y="${yy.toFixed(1)}" fill="${a.color}" font-size="12" paint-order="stroke" stroke="#0d1a29" stroke-width="2">${esc(a.label)}</text>`;
  }
  // Moving averages are calculated only from closes on or before each bar.
  const offset=all.length-data.length, allCloses=all.map(x=>Number(x[4]));
  [[5,'#ffd36e'],[10,'#8dafff'],[20,'#eaa8ec']].forEach(([window,color])=>{
    const points=[];
    data.forEach((b,i)=>{const j=offset+i;if(j+1<window)return;
      const ma=allCloses.slice(j+1-window,j+1).reduce((a,v)=>a+v,0)/window;
      points.push(`${(P+step*(i+.5)).toFixed(1)},${py(ma).toFixed(1)}`);
    });
    if(points.length>1)svg+=`<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.7" opacity=".95" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  // Display-only, never feeds entry/exit calculations. Show the closest three
  // unfilled gaps in the visible price scale; older filled gaps stay hidden.
  const visibleStart=all.length-data.length;
  const latestClose=Number(all[all.length-1][4]);
  const visibleGaps=(opts?.priceAdjustment?[]:detectPriceGaps(all.slice(Math.max(0,visibleStart-1)),r214Sessions?.dates,indexMode).map(g=>({...g,index:g.index+Math.max(0,visibleStart-1)}))).filter(g=>g.filledAt<0&&g.index>=visibleStart&&g.remainingLower<hi&&g.remainingUpper>lo)
    .sort((a,b)=>Math.abs((a.remainingLower+a.remainingUpper)/2-latestClose)-Math.abs((b.remainingLower+b.remainingUpper)/2-latestClose)).slice(0,2)
    .sort((a,b)=>a.index-b.index);
  if(visibleGaps.length){
    svg+=`<g class="chaopan-gap-layer" aria-label="未完全回補的跳空缺口">`;
    for(const g of visibleGaps){
      const y1=py(Math.min(hi,g.remainingUpper)),y2=py(Math.max(lo,g.remainingLower));
      const x=P+(g.index-visibleStart)*step;
      // Neutral filled gap band, deliberately distinct from the outlined consolidation box.
      // Gap direction is conveyed by its arrow, not the fill color.
      const right=P+plotW;
      const bandY=Math.max(top,y1),bandH=Math.max(1,y2-bandY);
      svg+=`<rect x="${x.toFixed(1)}" y="${bandY.toFixed(1)}" width="${Math.max(1,right-x).toFixed(1)}" height="${bandH.toFixed(1)}" fill="#8c98a6" fill-opacity=".32" stroke="none"/>`;
      const label=`${g.dir==='down'?'↓':'↑'}缺口 ${price(g.remainingLower)}～${price(g.remainingUpper)}${g.partial?' 部分回補':''}`;
      const labelY=Math.max(top+12,Math.min(top+kHeight-5,y1-5));
      svg+=`<text x="${(right-4).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="end" font-size="11" fill="#dce4ec" paint-order="stroke" stroke="#0d1a29" stroke-width="2">${esc(label)}</text>`;
    }
    svg+='</g>';
  }
  // r70 markers: position each signal at the original historical candle.
  const historicalDefense=indexMode?[]:defenseHistory(all,Math.max(60,length));
  const visibleStartIndex=all.length-data.length;
  const defenseMarkers=new Map(historicalDefense.filter(e=>e.index>=visibleStartIndex).map(e=>[e.index-visibleStartIndex,e]));
  data.forEach((b,i)=>{const x=P+step*(i+.5),[date,o,h,l,c,v]=[b[0],Number(b[1]),Number(b[2]),Number(b[3]),Number(b[4]),Number(b[5])];const color=c>=o?'#ff777f':'#3bd1b4';let yo=py(o),yc=py(c),yh=py(h),yl=py(l);svg+=`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${yh.toFixed(1)}" y2="${yl.toFixed(1)}" stroke="${color}" stroke-width="1.1"/><rect x="${(x-barW/2).toFixed(1)}" y="${Math.min(yo,yc).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1.6,Math.abs(yo-yc)).toFixed(1)}" fill="${color}" rx=".5"/>${noVolume?'':`<rect x="${(x-barW/2).toFixed(1)}" y="${(volTop+volHeight*(1-v/maxV)).toFixed(1)}" width="${barW.toFixed(1)}" height="${(volHeight*v/maxV).toFixed(1)}" fill="${color}" opacity=".7"/>`}`;const warning=defenseMarkers.get(i);if(warning){const colors={zero:'#94a3b8',first:'#f59e0b',second:'#ef4444'},numbers={zero:'0',first:'1',second:'2'};const markY=Math.max(top+10,py(h)-13);svg+=`<circle cx="${x.toFixed(1)}" cy="${markY.toFixed(1)}" r="8" fill="${colors[warning.stage]}" stroke="#0d1a29" stroke-width="1"/><text x="${x.toFixed(1)}" y="${(markY+3.6).toFixed(1)}" font-size="10" font-weight="bold" fill="#fff" text-anchor="middle">${numbers[warning.stage]}</text>`;}if(i===0||i===Math.floor(data.length/2)||i===data.length-1){svg+=`<text x="${x.toFixed(1)}" y="${H-6}" text-anchor="${i===0?'start':i===data.length-1?'end':'middle'}" font-size="12" fill="#91aabd">${esc(date.slice(5))}</text>`}});
  const chartReview=opts?.priceAdjustment?'價格調整待核對，費波那契／缺口暫不認證':!fibReady?'費波那契資料待核對（缺口另按各自交易日審查）':'';
  return svg+'</svg>'+(chartReview?`<div role="status" class="range-status">${esc(chartReview)}</div>`:'');
}
// V2.2 swipe fix: listen on the whole detail sheet, not only its tiny top navigator.
// Ignore UI controls and edge gestures, and keep native vertical scrolling.
function setupDetailSwipe(){
 const sheet=$('#modalOverlay .sheet');if(!sheet)return;
 sheet.style.touchAction='pan-y';
 let start=null;
 sheet.addEventListener('touchstart',e=>{
   start=null;
   if(!state.detail||e.touches.length!==1)return;
   if(e.target.closest('button,input,select,textarea,a,summary,.chart-area,[contenteditable="true"]'))return;
   const t=e.touches[0];
   // Reserve the extreme edges for Android's system-back gesture.
   if(t.clientX<32||t.clientX>window.innerWidth-32)return;
   start={x:t.clientX,y:t.clientY,at:Date.now(),id:t.identifier};
 },{passive:true});
 sheet.addEventListener('touchend',e=>{
   if(!start||!state.detail)return;
   const begin=start;start=null;
   const t=Array.from(e.changedTouches).find(x=>x.identifier===begin.id);
   if(!t)return;
   const dx=t.clientX-begin.x,dy=t.clientY-begin.y;
   if(Date.now()-begin.at>1300)return;
   if(Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.5)return;
   nextDetail(dx<0?1:-1);
 },{passive:true});
 sheet.addEventListener('touchcancel',()=>{start=null;},{passive:true});
}
function openSettings(opts={}){const isReady=state.mode==='live';$('#modalContent').innerHTML=`<div class="eyebrow">APP STATUS / SETTINGS</div><h2 id="modalTitle">資料與安裝設定</h2><div class="settings-card"><strong>目前：${modeName()}</strong><p>最近盤後日期：${esc(state.payload?.asOf||'尚無')}<br>掃描歷史完整股票：${integer(state.payload?.eligibleCount||0)} 檔<br>已記錄股票：${integer(state.payload?.stockCount||0)} 檔</p></div><div class="settings-card"><strong>如何使用自建盤後資料版？</strong><p>把本程式上傳 GitHub 公開 Repository，啟用 Actions，先手動執行「初次回補約220天」，設定 Pages 從 main /root 發布，再以 Android Chrome 的「新增至主畫面」安裝。GitHub Actions 依排程在13:30、14:30、18:30、23:00以及隔日06:00、08:30嘗試核對盤後資料（實際排程可能延遲），若交易所阻擋雲端 IP，需改用在台灣網路執行的收集主機。</p></div><div class="settings-card"><strong>即時版升級狀態</strong><p>目前沒有盤中報價或推播。本系統只依已完成的盤後資料判斷，不提供盤中價量試算。</p></div><div class="settings-card"><strong>網站隱私與密碼：目前仍是公開網站</strong><p>GitHub Pages 的 JavaScript 密碼視窗不能真正保護行情或阻止已取得網址的人查看檔案，亦不能安全撤銷別人的存取權。若需要可取消授權的真正私密網站，應遷移到有伺服端登入控管的部署方式（例如 Cloudflare Pages + Access），並關閉舊公開 Pages、保護行情資料來源。不要在此公開程式中設定真實密碼。</p></div><div class="action-row"><button id="reloadData" class="primary-action">重新檢查盤後資料</button>${isReady?'':'<button id="demoModeBtn" class="secondary-action">開啟示範畫面</button>'}</div>`;$('#modalContent').insertAdjacentHTML('beforeend',`<details id="r41AdvancedSettings" class="r41-advanced-settings" ${opts.advanced?'open':''}><summary>進階功能｜技術研究與原始法人資料</summary>${r41AdvancedSettingsMarkup()}</details>`);const recent=allRows().find(x=>x.code===state.r41Advanced?.code&&x.date===state.r41Advanced?.date);if(recent){wireValuationScenario(recent)};$('#reloadData').onclick=()=>{hideDetails();loadData()};if($('#demoModeBtn'))$('#demoModeBtn').onclick=()=>{hideDetails();demoMode()};$('#modalOverlay').hidden=false;document.body.style.overflow='hidden'}
function navTo(page){$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));if(page==='list'){setTab('all');(document.querySelector('#quickStockSearch')||document.querySelector('.content-area')).scrollIntoView({behavior:'smooth'})}else if(page==='star'){state.tab='star';const adv=$('.advanced-radar');if(adv)adv.open=true;$$('.tab').forEach(x=>x.classList.remove('active'));renderList();$('.content-area').scrollIntoView({behavior:'smooth'})}else if(page==='guide')$('#institutionalBoard').scrollIntoView({behavior:'smooth'});else openSettings()}
/* R177: dedicated ETF card, not a disguised stock scanner output.
   Quote, K bars and all calculation units are explicitly validated. */
function r177Num(v){return (typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null}
function r177Fixed(v,d=2){return v===null||!Number.isFinite(v)?'—':Number(v).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d})}
function r177Pct(v){return v===null||!Number.isFinite(v)?'—':`${v>=0?'+':''}${v.toFixed(2)}%`}
function r177EtfDate(r){
 const d=r?.latestDate??r?.date;
 if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)return null;
 if(r.latestDate!=null&&r.date!=null&&r.latestDate!==r.date)return null;
 return d;
}
function r177EtfBars(r){
 if(!r)return [];
 const raw=Array.isArray(r.bars)?r.bars:[];let prior='';const out=[];
 for(const b of raw){
  if(!Array.isArray(b)||b.length<6)return [];
  const date=String(b[0]),nums=b.slice(1,6).map(r177Num);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<=prior||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||nums.some(x=>x===null)||Math.min(...nums.slice(0,4))<=0||nums[4]<0||nums[1]<Math.max(nums[0],nums[2],nums[3])||nums[2]>Math.min(nums[0],nums[1],nums[3]))return [];
  out.push([date,...nums]);prior=date;
 }
 // The latest candle and fund quote must describe the SAME security and session.
 const day=r177EtfDate(r),quote=r177Num(r.close);
 if(!day||quote===null||quote<=0||!out.length||out.at(-1)[0]!==day||Math.abs(out.at(-1)[4]-quote)>0.00001)return [];
 return out;
}
function r177StoredHolding(code,field){
 try{return localStorage.getItem('chaopan-etf-'+code+'-'+field)||''}catch(_){return ''}
}
/* R182: ETF and equity share visual components, not equity decision rules. */
function r189ExpectedDate(){return r177EtfDate({latestDate:state.payload?.asOf});}
// R216: EOD rows cannot be certified before the regular session ends.
function r216EtfSessionComplete(date){
 const day=r177EtfDate({latestDate:date});if(!day)return false;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 const today=`${parts.year}-${parts.month}-${parts.day}`;
 return day<today||day===today&&(Number(parts.hour)*60+Number(parts.minute)>=810);
}
function r189EtfFresh(date){const expected=r189ExpectedDate(),day=r177EtfDate({latestDate:date});return Boolean(day&&expected&&day>=expected&&r216EtfSessionComplete(day)&&!chaopanEodFreshness(day).stale);}
function r189OfficialChange(r){
 const close=r177Num(r?.close),amount=r177Num(r?.changeAmount),pct=r177Num(r?.changePct);
 if(!(close>0)||pct===null||amount===null||!(close-amount>0))return null;
 return Math.abs(100*amount/(close-amount)-pct)<=0.02?pct:null;
}
function r189FeedReady(d,previous){
 const expected=r189ExpectedDate(),rows=d?.rows,prior=previous?.rows??[];
 if(!expected||!Array.isArray(rows)||!rows.length||!Array.isArray(prior)||!r189EtfFresh(d?.asOf))return false;
 const required=new Set(['00406A',...prior.map(r=>r?.code)]),codes=new Set();
 for(const r of rows){if(!r||typeof r.code!=='string'||codes.has(r.code)||!r189EtfFresh(r.latestDate)||r.latestDate!==d.asOf||!r177EtfBars(r).length)return false;codes.add(r.code);}
 return [...required].every(code=>rows.some(r=>r.code===code&&r.bars.length>=20));
}
function r190Institutional(r,date){
 const i=r?.institutional,keys=['foreignNetShares','trustNetShares','dealerNetShares','dealerOwnNetShares','dealerHedgeNetShares','totalNetShares'];
 if(!date||i?.date!==date||i.source!=='TWSE T86'||i.unit!=='shares'||!keys.every(k=>Number.isSafeInteger(i[k])))return null;
 if(i.dealerNetShares!==i.dealerOwnNetShares+i.dealerHedgeNetShares||i.totalNetShares!==i.foreignNetShares+i.trustNetShares+i.dealerNetShares)return null;
 return i;
}
function r190EtfLots(v){return (v>0?'+':'')+(v/1000).toLocaleString('zh-TW',{maximumFractionDigits:3})+'張';}
function r190DealerDetail(i){return i?`<section class="r164-panel"><div class="r174-small-title"><strong>ETF 自營商拆解</strong><small>${esc(i.date)} · T86</small></div><div class="r174-warning-cells"><div><small>自行買賣</small><b class="${r164PctColor(i.dealerOwnNetShares)}">${r190EtfLots(i.dealerOwnNetShares)}</b></div><div><small>避險</small><b class="${r164PctColor(i.dealerHedgeNetShares)}">${r190EtfLots(i.dealerHedgeNetShares)}</b></div></div><div class="r182-note">官方股數÷1000；避險不等同個股出貨訊號。</div></section>`:'';}
function r182EtfModel(r){
 const bars=r177EtfBars(r),date=bars.at(-1)?.[0]||null,close=date?Number(r.close):null;
 const mean=a=>a.reduce((s,b)=>s+b[4],0)/a.length;
 const mas=[5,10,20].map(n=>{const today=bars.length>=n?mean(bars.slice(-n)):null,prev=bars.length>n?mean(bars.slice(-n-1,-1)):null,touch=bars.length>=n-1?mean(bars.slice(-(n-1))):null;return {n,today,prev,touch,dir:prev===null?'·':today>prev+1e-8?'↗':today<prev-1e-8?'↘':'→',pct:close&&today?(close/today-1)*100:null};});
 const prior=bars.slice(-21,-1),support=prior.length===20?Math.min(...prior.map(b=>b[3])):null,pressure=prior.length===20?Math.max(...prior.map(b=>b[2])):null;
 const tr=bars.length>=15?bars.slice(-14).map((b,i)=>{const p=bars[bars.length-15+i][4];return Math.max(b[2]-b[3],Math.abs(b[2]-p),Math.abs(b[3]-p));}):[];
 const atr=tr.length?tr.reduce((a,b)=>a+b,0)/14:null;
 const change=date?r189OfficialChange(r):null;
 return {bars,date,close,mas,support,pressure,atr,change};
}
function r182EtfMaStrip(m){
 const fmt=v=>r177Fixed(v,3);
 const cells=m.mas.map(x=>{const c=x.dir==='↗'?'#ff6676':x.dir==='↘'?'#45e499':'#ffd25e';return `<div class="r164-ma-item"><b style="color:${c}">MA${x.n} ${x.dir}</b><strong style="color:${c}">${fmt(x.today)}</strong><small>隔日觸線 ${fmt(x.touch)}</small><small class="${r164PctColor(x.pct)}">${r177Pct(x.pct)}</small><span class="r164-track"><i class="r164-fill" style="--length:${x.pct===null?0:Math.min(100,Math.abs(x.pct)*15)}%;--accent:${c}"></i></span></div>`}).join('');
 const ix=typeof R166IndexDaily!=='undefined'&&state.mode!=='demo'?R166IndexDaily.get(m.date):null;
 const day=ix?.length>=2&&ix.at(-1)[0]===m.date&&ix.at(-2)[4]>0?(ix.at(-1)[4]/ix.at(-2)[4]-1)*100:null;
 const diff=day!==null&&m.change!==null?m.change-day:null;
 return `<section class="r164-panel r164-ma-panel r163-compact-risk"><div class="r164-strip"><div class="r164-headblock">均線<br>趨勢</div><div class="r164-strip-data"><div class="r164-mas">${cells}<button type="button" class="r164-ma-item r167-index-open"><b>大盤 K</b><strong class="${r164PctColor(diff)}">${diff===null?'待核對':diff>0?'ETF較強':diff<0?'ETF較弱':'接近同步'}</strong><small>${diff===null?'—':diff.toFixed(2)+'pp'}</small><small>大盤 ${r177Pct(day)}</small><small class="r167-index-hint">點我看日K ⤴</small></button></div></div></div><div class="r164-mini-note">距離＝收盤／當日均線；隔日觸線為均線數學參考</div></section>`;
}
function r182EtfLevelStrip(title,items,m,note){
 return `<section class="r164-panel r164-key-panel"><div class="r164-strip"><div class="r164-headblock">${title}</div><div class="r164-strip-data"><div class="r164-key-items">${items.map(([k,v,c])=>r165LevelColumn(k,v,m.close,c)).join('')}</div>${r165Gradient(items.every(x=>x[1]===null))}</div></div><div class="r164-mini-note">${esc(note)}</div></section>`;
}
function r182EtfSupport(m,code){
 const d=r174Dist(m.support,m.close,'元'),below=d.valid&&m.close<m.support,near=d.valid&&Math.abs((m.support/m.close-1)*100)<=1;
 return `<section class="r164-panel r174-support-alert"><div class="r174-small-title"><strong>⚠ ${esc(code)} ETF｜支撐預警</strong><small>歷史觀察</small></div><div class="r174-warning-cells"><div><small>現價</small><b>${r164Fmt(m.close)}</b></div><div><small>前20日低</small><b>${r164Fmt(m.support)}</b></div><div><small>跌破</small><b>${!d.valid?'待核對':below?'已跌破':'未跌破'}</b></div><div><small>轉弱</small><b>待確認</b></div></div><div class="r174-distance">距低點　<b>${d.valid?d.amount+'｜'+d.pct:'待核對'}</b></div>${r174WarnBand()}<div class="r174-source">${!d.valid?'資料不足':below?'低於前20日低點':near?'接近前20日低點':'尚距前20日低點'}｜歷史低點非確認支撐，不觸發自動賣出。</div></section>`;
}
/* R196: dividend scenarios and actual attributable cash are separate. */
function r196Dividend(r){
 const d=r?.distributionDetail,x=d?.latest;
 if(d?.conflictDates!=null&&(!Array.isArray(d.conflictDates)||d.conflictDates.some(v=>!r177EtfDate({latestDate:v})||v===x?.exDate)))return null;
 if(d?.history!=null&&!Array.isArray(d.history))return null;
 if(x&&d?.history?.some(v=>v?.exDate===x.exDate&&(v.amount!==x.amount||v.payDate!==x.payDate)))return null;
 return x&&['SITCA open data 11109/160547','TWSE announcement 2026-10-30'].includes(x.source)&&r177EtfDate({latestDate:x.exDate})&&r177EtfDate({latestDate:x.payDate})&&x.payDate>=x.exDate&&typeof x.amount==='number'&&Number.isFinite(x.amount)&&x.amount>0?x:null;
}
function r196Shares(value,unit){
 if(!['shares','lots'].includes(unit))return null;
 const n=r177Num(value),q=n*(unit==='lots'?1000:1);
 return Number.isSafeInteger(n)&&n>0&&Number.isSafeInteger(q)&&q<=1e8?q:null;
}
// R198: one holding input only; announced dividend is a scenario, never received cash.
function r198Income(x,shares,cost,close){
 const held=Number.isSafeInteger(shares)&&shares>0&&shares<=1e8;
 const amt=x&&typeof x.amount==='number'&&Number.isFinite(x.amount)&&x.amount>0?x.amount:null;
 const basis=held&&typeof cost==='number'&&Number.isFinite(cost)&&cost>0&&Number.isFinite(cost*shares)?cost*shares:null;
 const estimate=held&&amt!==null?shares*amt:null;
 const mark=basis!==null&&typeof close==='number'&&Number.isFinite(close)&&close>0&&Number.isFinite(close*shares)?(close-cost)*shares:null;
 const scenario=mark!==null&&estimate!==null?mark+estimate:null;
 return {estimate,perLot:amt===null?null:amt*1000,costYield:amt!==null&&typeof cost==='number'&&Number.isFinite(cost)&&cost>0?amt/cost*100:null,scenario,scenarioReturn:scenario!==null?scenario/basis*100:null,scenarioBreak:basis!==null&&estimate!==null?Math.max(0,cost-amt):null};
}
function r196IncomeMarkup(r){
 const x=r196Dividend(r);
 return `<section class="r164-panel r196-income" style="border-color:#c5a24b"><style>.r196-income .r196-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:7px 0}.r196-income .r196-cell{min-width:0;border:1px solid #3a7384;border-radius:9px;padding:7px;text-align:center;overflow-wrap:anywhere}.r196-income .r196-cell small{display:block;color:#a9c6d0;font-size:11px}.r196-income .r196-cell b{display:block;font-size:15px;margin:4px 0}.r196-income .r196-note{font-size:11px;color:#a9c6d0;line-height:1.45}</style><div class="r174-small-title"><strong>ETF 配息試算</strong><small>自動連動上方持股</small></div><div class="r196-grid"><div class="r196-cell" style="border-color:#c5a24b"><small>最近公告配息試算</small><b style="color:#ffd25e" class="r196-est">—</b><small class="r196-holding">輸入上方股數</small></div><div class="r196-cell"><small>每張配息</small><b class="r196-lot">—</b><small>單次成本配息率 <span class="r196-yield">—</span></small></div></div><div class="r196-note">${x?'除息 '+esc(x.exDate)+'｜發放 '+esc(x.payDate):'尚無核對完成的配息公告，暫不試算。'}</div>${x?`<div class="r196-grid"><div class="r196-cell"><small>假設領取本次配息後損益</small><b class="r196-total">—</b><small class="r196-return">—</small></div><div class="r196-cell"><small>假設本次領息後回本價</small><b class="r196-break">—</b></div></div><div class="r196-note">假設目前持股全部符合該次除息資格、成本未扣配息且收盤價不變；僅試算本次公告配息，非實際入帳或累積含息損益。未計費稅，不影響防守判斷。</div>`:''}</section>`;
}
function r196BindIncome(root,r,m,ci,qi,ui){
 const el=root.querySelector('.r196-income');if(!el)return ()=>{};
 const get=k=>el.querySelector('.r196-'+k),x=r196Dividend(r);
 function paint(k,v,kind='money',colored=false){const n=get(k);if(!n)return;n.textContent=v===null||!Number.isFinite(v)?'—':kind==='pct'?r177Pct(v):kind==='price'?r177Fixed(v,3)+' 元':(colored&&v>0?'+':'')+v.toLocaleString('zh-TW',{maximumFractionDigits:2})+' 元';if(colored)n.className='r196-'+k+' '+r164PctColor(v);}
 return function refresh(){
  const shares=r196Shares(qi.value,ui.value),cost=r177Num(ci.value),a=r198Income(x,shares,cost,m.close);
  paint('est',a.estimate);paint('lot',a.perLot);paint('yield',a.costYield,'pct');paint('total',a.scenario,'money',true);paint('return',a.scenarioReturn,'pct',true);paint('break',a.scenarioBreak,'price');
  get('holding').textContent=shares===null?'輸入上方有效股數':shares.toLocaleString('zh-TW')+' 股'+(x?' × '+x.amount+' 元':'');
 };
}
function r195EtfExtra(r,m){
 const n=r.navDetail,d=r.distributionDetail, v=n?.nav;
 const valid=n?.source==='SITCA open data 11109/160547'&&n.currency==='TWD'&&n.date===m.date&&typeof v==='number'&&Number.isFinite(v)&&v>0&&Number.isFinite(m.close)&&m.close>0;
 const pct=valid?(m.close/v-1)*100:null;
 const x=r196Dividend(r),ok=!!x;
 const pending=r177EtfDate({latestDate:d?.nextExPending});
 return `<section class="r164-panel"><div class="r174-small-title"><strong>ETF 專屬資料</strong><small>${valid?esc(n.date):'淨值待同步'}</small></div><div class="r174-warning-cells"><div><small>淨值</small><b>${valid?r177Fixed(v):'待核對'}</b></div><div><small>折溢價</small><b class="${r164PctColor(pct)}">${valid?r177Pct(pct):'待核對'}</b><small>${valid?(pct<0?'折價':pct>0?'溢價':'平價'):''}</small></div><div><small>最近已公告配息</small><b>${ok?String(x.amount):'待核對'}</b><small>${ok?esc(x.payDate)+' 發放':''}</small></div></div>${ok?`<div class="r182-note">除息 ${esc(x.exDate)}｜每張 ${r177Fixed(x.amount*1000,2)} 元｜${x.source.startsWith('TWSE')?'證交所公告':'投信投顧公會開放資料'}</div>`:''}${pending?`<div class="r182-note">下次除息 ${esc(pending)}｜金額待公告（已知公告紀錄）</div>`:''}<div class="r182-note">${valid?'淨值：投信投顧公會每日基金淨值；折溢價依同日收盤計算。':'未取得同日官方淨值，不補零。'} 配息不代表已領取，未計入帳面損益。</div></section>`;
}
function renderR177EtfDetail(r){
 const content=$('#modalContent');if(!content||!r)return;r164EnsureStyle();
 const m=r182EtfModel(r),{bars,date,close}=m,code=String(r.code||'').toUpperCase();
 const c={code,name:r.name,market:'上市',assetType:'ETF',date,close,bars,changePct:r.changePct,changeAmount:r.changeAmount,institutional:r190Institutional(r,date),distributionDetail:r.distributionDetail};
 const fresh=r189EtfFresh(date),expected=r189ExpectedDate();
 const cost=r177StoredHolding(code,'cost'),qty=r177StoredHolding(code,'shares'),unit=r177StoredHolding(code,'unit')==='lots'?'lots':'shares',mode=r177StoredHolding(code,'mode')||'medium';
 const touch=m.mas[0].touch,buffer=touch&&m.atr!==null?Math.max(.004,Math.min(.018,.5*m.atr/touch)):null;
 const def=[['彈起',buffer===null?null:touch*(1+buffer),'r164-positive'],['MA5觸線',touch,'r164-neutral'],['容忍',buffer===null?null:touch*(1-buffer),'r164-negative'],['防守',buffer===null?null:touch*(1-2*buffer),'r164-negative']];
 const keys=[['前20日低',m.support,'r164-negative'],['頸線',null,'r164-neutral'],['前20日高',m.pressure,'r164-positive'],['突破',null,'r164-positive']];
 const compare=r174IndexCompare(c).replaceAll('個股','ETF');
 const max=bars.length?bars.reduce((a,b)=>b[5]>a[5]?b:a):null;
 let research=r176ResearchMini(c).replace('近34根日K｜頸線待核對',max?`近34根日K｜全歷史最大量 ${esc(max[0].slice(5))}`:'歷史日K待核對');
 const makeFullChart=()=>bars.length>=5?makeChart(bars,null,state.chartDays,[],[],null,date,{indexMode:true}):'<div class="empty-state">日K資料未足5根／尚未同步</div>';
 const chart=state.r182ChartOpen?makeFullChart():'';
 const note=date?`${date}｜${bars.length}根日K｜證交所 STOCK_DAY｜未經除息還原${state.payload?.asOf&&date<state.payload.asOf?'｜資料較個股盤後舊':''}${r177EtfError?'｜'+r177EtfError:''}`:'ETF資料待核對';
 content.innerHTML=`<div class="detail-title r164-detail-heading r176-detail-heading"><div class="r164-heading-id"><small>ETF ANALYSIS / 上市 · R220</small>${esc(code)} ${esc(r.name||'ETF')}<span class="r169-industry">ETF</span></div><div class="r164-heading-quote"><strong>${r177Fixed(close)}</strong><small class="${r164PctColor(m.change)}">${r177Pct(m.change)}</small></div></div><div class="r176-one-page r182-etf" data-etf-id="${esc(code)}">
 <style>#modalContent .r182-etf .r182-unit{font:inherit;background:#092a38;color:#dffaff;border:1px solid #4f91a1;border-radius:6px;max-width:100%;padding:3px}#modalContent .r182-etf .r176-risk-layout .r174-warning-cells{grid-template-columns:repeat(2,minmax(0,1fr))}#modalContent .r182-etf .r182-range{display:flex;gap:5px;flex-wrap:wrap;margin:8px 0}#modalContent .r182-etf .r182-range button{background:#10384b;border:1px solid #37788d;border-radius:7px;color:#dffaff;padding:6px 12px}#modalContent .r182-etf .r182-range .active{background:#36ceb8;color:#05242f}#modalContent .r182-etf .r182-chart svg{width:100%;height:auto}#modalContent .r182-etf .r182-qty{font-size:11px;min-width:0;width:100%;box-sizing:border-box}#modalContent .r182-etf .r182-note{font-size:10px;color:#a9c6d0;overflow-wrap:anywhere}</style>
 <section class="r164-board r165-reference r176-main-card"><div class="r176-main-banner"><span>${fresh?'明日持股操作':'歷史持股觀察'}</span><strong>ETF觀察｜<span class="r182-auto">待輸入</span></strong></div><div class="r176-banner-date">${esc(date||'日期待核對')} 盤後 · R220 ｜持有週期 <select class="r92-mode r182-mode"><option value="short" ${mode==='short'?'selected':''}>短線（5／10日）</option><option value="medium" ${mode==='medium'?'selected':''}>中期（20日）</option><option value="long" ${mode==='long'?'selected':''}>長期（60日）</option></select></div>
 ${!fresh?`<div role="status" style="color:#ffd25e;font-size:12px;padding:6px 0">⚠ ETF ${esc(date||'日期未知')}｜${expected?'個股盤後 '+esc(expected):'最新交易日待核對'}；僅供歷史參考，暫停明日操作判斷。</div>`:''}
 ${r182EtfMaStrip(m)}
 <div class="r176-top-position"><section class="r164-panel r164-position"><div class="r164-inputs"><label>成本（元）<input class="r182-cost" type="number" min="0" step="any" inputmode="decimal" value="${esc(cost)}" placeholder="成本"></label><label>數量 <select class="r182-unit"><option value="shares" ${unit==='shares'?'selected':''}>股</option><option value="lots" ${unit==='lots'?'selected':''}>張</option></select><input class="r182-qty" type="number" min="1" step="1" inputmode="numeric" value="${esc(qty)}" placeholder="數量"></label></div><div class="r164-pnlbox r182-pnl" aria-live="polite"></div></section><section class="r164-panel r176-strategy"><small>持股狀態</small><strong class="r182-status">待輸入</strong></section></div>
 <div class="r176-risk-layout"><section class="r164-panel r164-action-preview"><div class="r174-small-title"><strong>◎ 風險減碼參考</strong></div><div class="r174-warning-cells"><div><small>開高／反彈</small><b>${r164Fmt(m.mas[0].today)}</b></div><div><small>開低／防守</small><b>${r164Fmt(m.support)}</b></div></div><div class="r182-note">未還原均線及歷史低點觀察；除息可能影響防守價。未驗證ETF減碼模型，不產生委託股數。</div></section><section class="r164-panel r176-advice"><h3>▤ 建議觀察</h3><strong class="r182-advice">待核對</strong><p>以ETF自身均線及大盤比較，不套用個股出貨公式。</p></section></div>
 ${compare}${r200CrossCard(c,{...m,ok:!!date&&r194ValidPrice(close),fresh:fresh&&!chaopanEodFreshness(date).stale})}${r194CostCard({...m,ok:!!date&&r194ValidPrice(close),fresh},Number(cost),Number(qty)*(unit==='lots'?1000:1))}${r200AverageCard({...m,ok:!!date&&r194ValidPrice(close),fresh},Number(cost),Number(qty)*(unit==='lots'?1000:1))}<div class="r176-slim-panels">${r182EtfLevelStrip('MA5<br>防守帶',def,m,'ATR觀察帶，尚未回測；非委託價格')}${r182EtfLevelStrip('關鍵<br>價位',keys,m,'前20日高低點參考；頸線與突破尚未驗證')}</div>${r182EtfSupport(m,code)}<div class="r176-bottom-caption">盤後觀察參考｜未含配息、費用；不自動委託</div></section>
 ${research}${r190DealerDetail(c.institutional)}<details class="r176-full-chart r182-full" ${state.r182ChartOpen?'open':''}><summary>K線完整分析｜20／60／120日・價量</summary><div class="r182-range">${[20,60,120].map(x=>`<button type="button" data-r182-days="${x}" class="${state.chartDays===x?'active':''}">${x}日</button>`).join('')}</div><div class="r182-chart">${chart}</div><div class="r182-note">${esc(note)}</div></details>${r195EtfExtra(r,m)}${r196IncomeMarkup(r)}</div>`;
 const root=content.querySelector('.r182-etf'),q=s=>root.querySelector(s),ci=q('.r182-cost'),qi=q('.r182-qty'),ui=q('.r182-unit'),mi=q('.r182-mode'),full=q('.r182-full');
 const refreshIncome=r196BindIncome(root,r,m,ci,qi,ui);
 const refreshCostDefense=r194BindCost(root,ci);const costDefenseData={...m,ok:!!date&&r194ValidPrice(close),fresh};
 function refresh(){const cv=r177Num(ci.value),v=r177Num(qi.value),shares=v===null?NaN:v*(ui.value==='lots'?1000:1),valid=close!==null&&cv>0&&Number.isSafeInteger(v)&&v>0&&Number.isSafeInteger(shares)&&shares<=1e8;
 refreshCostDefense(costDefenseData,cv,Number.isSafeInteger(v)&&v>0?shares:NaN);refreshIncome();
 q('.r182-pnl').innerHTML=valid?r164PnlHTML(cv,shares,close)+`<small>${shares.toLocaleString('zh-TW')}股｜未含配息</small>`:r164PnlHTML(cv,NaN,close);
 const status=valid?close>cv?'帳面獲利':close<cv?'帳面虧損':'成本附近':'輸入成本後顯示';q('.r182-auto').textContent=status;q('.r182-status').textContent=status;
 const k=mi.value==='short'?5:mi.value==='long'?60:20,ma=bars.length>=k?bars.slice(-k).reduce((s,b)=>s+b[4],0)/k:null;q('.r182-advice').textContent=!fresh?'最新盤後待核對':ma===null?'資料待核對':close<ma?`低於MA${k}・防守觀察`:`站上MA${k}・趨勢觀察`;
 try{for(const [key,value] of [['cost',cv>0?ci.value:''],['shares',Number.isSafeInteger(v)&&v>0?qi.value:''],['unit',ui.value],['mode',mi.value]]){if(value)localStorage.setItem('chaopan-etf-'+code+'-'+key,value);else localStorage.removeItem('chaopan-etf-'+code+'-'+key)}}catch(_){}
 }
 [ci,qi].forEach(el=>el.addEventListener('input',refresh));[ui,mi].forEach(el=>el.addEventListener('change',refresh));refresh();
 q('.r176-chart-reveal')?.addEventListener('click',()=>{full.open=true;full.scrollIntoView({block:'start'});});full.addEventListener('toggle',()=>{state.r182ChartOpen=full.open;const area=q('.r182-chart');if(full.open&&area&&!area.innerHTML)area.innerHTML=makeFullChart();});
 root.querySelectorAll('[data-r182-days]').forEach(b=>b.onclick=()=>{state.r182ChartOpen=true;state.chartDays=Number(b.dataset.r182Days);renderR177EtfDetail(r);});
 q('.r167-index-open')?.addEventListener('click',()=>globalThis.ChaopanHomeIndexR168?.open?.());
 if(typeof R166IndexDaily!=='undefined'&&!R166IndexDaily.get(date)&&!state.r182IndexPending){state.r182IndexPending=true;Promise.resolve(R166IndexDaily.ensure()).then(()=>{if(state.etfDetail?.code===code&&root.isConnected&&R166IndexDaily.get(date)){q('.r176-compact-compare').outerHTML=r174IndexCompare(c).replaceAll('個股','ETF');q('.r200-cross').outerHTML=r200CrossCard(c,{...m,ok:!!date&&r194ValidPrice(close),fresh:fresh&&!chaopanEodFreshness(date).stale});q('.r164-ma-panel').outerHTML=r182EtfMaStrip(m);q('.r167-index-open')?.addEventListener('click',()=>globalThis.ChaopanHomeIndexR168?.open?.());}}).catch(()=>{}).finally(()=>{state.r182IndexPending=false});}
}

// r44.7 independent lookup: browsing stocks is NOT the same as being auto-qualified.
// Date lock and market+code keys prevent stale and cross-listing mixups.
let quickDirectory=null,quickDirectoryError='',quickDirectoryLoading=null,quickShardBusy=false;
// ETF directory is independent of the equity breakout scanner and T86 pipeline.
let r177EtfDirectory=null,r177EtfLoading=null,r177EtfError='',r181LastLoad=0;
const r177EtfCode = code => /^\d{4,6}[A-Z]?$/.test(String(code||'').toUpperCase());
const r177EtfPriority = {code:'00406A',name:'主動中信台灣收益',market:'上市',assetType:'ETF'};
function r177EtfRows(){
  const got=Array.isArray(r177EtfDirectory?.rows)?r177EtfDirectory.rows:[];
  return got.some(r=>String(r.code).toUpperCase()==='00406A')?got:[...got,r177EtfPriority];
}
// R181: normalize each fund once; the search and detail use the same row.
function r181NormalizeETF(d){
 if(d?.schema!==1||d?.kind!=='etf-official-eod'||!r216EtfSessionComplete(d.asOf)||!Array.isArray(d.rows))throw Error('ETF資料結構或盤後日期不符');
 const counts=new Map();for(const q of d.rows){const c=String(q?.code||'').toUpperCase();counts.set(c,(counts.get(c)||0)+1)}
 const rows=[],invalid=[];
 for(const q of d.rows){
  const code=String(q?.code||'').toUpperCase();
  const date=r177EtfDate(q),bars=r177EtfBars(q);
  if(!/^0[0-9]{3,5}[A-Z]?$/.test(code)||counts.get(code)!==1||q?.assetType!=='ETF'||q?.market!=='上市'||!date||date>d.asOf||!bars.length){invalid.push(code||'未知代號');continue;}
  rows.push({...q,code,date,latestDate:date,bars,barCount:bars.length,close:Number(q.close)});
 }
 if(!rows.length)throw Error('ETF有效行情為0；無法核對日期與價量');
 return {...d,rows,invalid};
}
async function r177LoadEtfs(){
 if(r177EtfLoading)return r177EtfLoading;
 r177EtfLoading=(async()=>{
  try{
   const urls=['./data/etf-daily.json','https://raw.githubusercontent.com/love18960928-lgtm/chaopan-radar/main/data/etf-daily.json'];
   let next=null,lastError='';
   for(const url of urls){
    try{
     const r=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(8000)});
     if(!r.ok)throw Error('ETF資料檔 HTTP '+r.status);
     const d=r181NormalizeETF(await r.json());
     if(!next)next=d;
     else{const rows=new Map(next.rows.map(x=>[x.code,x]));for(const x of d.rows){const a=rows.get(x.code);if(!a||x.latestDate>a.latestDate||x.latestDate===a.latestDate&&x.bars.length>=a.bars.length)rows.set(x.code,x);}next={...d,asOf:[next.asOf,d.asOf].sort().at(-1),rows:[...rows.values()],invalid:[...new Set([...next.invalid,...d.invalid])]};}
     if(r189FeedReady(next,r177EtfDirectory))break;
     lastError='ETF日期或歷史根數待核對';
    }catch(e){lastError=String(e.message||e);}
   }
   if(!next)throw Error(lastError||'ETF資料無法取得');
   // Never overwrite a newer validated row or shrink same-date history.
   const old=new Map((r177EtfDirectory?.rows||[]).map(x=>[x.code,x]));
   const retained=[];
   for(const row of next.rows){const prior=old.get(row.code);if(prior&&(prior.latestDate>row.latestDate||prior.latestDate===row.latestDate&&prior.bars.length>row.bars.length)){retained.push(row.code);continue;}old.set(row.code,row);}
   const incoming=new Set(next.rows.map(x=>x.code));
   for(const code of old.keys())if(!incoming.has(code))retained.push(code);
   r177EtfDirectory={...next,rows:[...old.values()]};
   const warnings=[];if(next.invalid.length)warnings.push('未通過驗證：'+next.invalid.join('、'));if(retained.length)warnings.push('保留上次核實資料：'+retained.join('、'));if(lastError&&!r189FeedReady(r177EtfDirectory,null))warnings.push(lastError);
   r177EtfError=warnings.join('；');r181LastLoad=Date.now();
  }catch(e){r177EtfError=String(e.message||e);console.warn('R181 ETF',e)}
  finally{r177EtfLoading=null;quickDraw()}
 })();return r177EtfLoading;
}
globalThis.ChaopanETFVerifyR181=Object.freeze({date:r177EtfDate,bars:r177EtfBars,normalize:r181NormalizeETF});
function quickMatches(q){
 const stocks=quickDirectory?.rows||allRows().map(x=>({code:String(x.code),name:x.name,market:x.market,date:x.date,close:x.close}));
 const etfs=r177EtfRows();const ids=new Set(etfs.map(x=>String(x.market)+'-'+String(x.code).toUpperCase()));
 const rows=[...stocks.filter(x=>!ids.has(String(x.market)+'-'+String(x.code).toUpperCase())),...etfs.map(r=>({...r,assetType:'ETF',date:r177EtfDate(r)||null}))];
 const text=String(q||'').normalize('NFKC').trim().toLocaleLowerCase('zh-Hant');
 return rows.filter(x=>String(x.code).toLowerCase().includes(text)||String(x.name).toLocaleLowerCase('zh-Hant').includes(text))
  .sort((a,b)=>Number(String(b.code).toLowerCase()===text)-Number(String(a.code).toLowerCase()===text)||String(a.code).localeCompare(String(b.code),'zh-Hant',{numeric:true})).slice(0,12);
}
function quickDraw(){
 const field=$('#quickStockSearch'),target=$('#quickStockResults');if(!field||!target)return;
 const q=field.value.trim();if(!q){target.innerHTML='';return}
 const matches=quickMatches(q);
 const escaped=matches.map(x=>`<button type="button" class="r447-result" data-quick-market="${esc(x.market)}" data-quick-code="${esc(x.code)}"><span><b>${esc(x.code)} ${esc(x.name)}</b><br><small>${esc(x.market)} · ${x.assetType==='ETF'?'ETF · ':''}${esc(x.date||'資料待更新')}</small></span><small>查看分析 ›</small></button>`).join('');
 target.innerHTML=escaped||`<p class="r447-msg">${quickDirectory?'找不到符合的股票或ETF':'索引尚未完整載入。'} ${quickDirectoryError?esc(quickDirectoryError):''}</p>`;
 if(!matches.every(x=>x.assetType==='ETF')&&quickDirectory?.asOf&&state.payload?.asOf&&quickDirectory.asOf!==state.payload.asOf){target.insertAdjacentHTML('afterbegin',`<p class="r447-msg">⚠ 股票索引 ${esc(quickDirectory.asOf)} 與盤後行情 ${esc(state.payload.asOf)} 日期不同；目前不可開啟舊資料作戰計畫。</p>`)}
}
async function loadQuickDirectory(){
 if(quickDirectoryLoading)return quickDirectoryLoading;
 quickDirectoryLoading=(async()=>{
  try{
   const r=await fetch('./data/stock-lookup/index.json',{cache:'no-cache',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('索引 HTTP '+r.status);
   const d=await r.json();if(!d||!Array.isArray(d.rows)||d.rows.length<500||!/^\d{4}-\d{2}-\d{2}$/.test(d.asOf))throw Error('索引格式不符');
   quickDirectory=d;quickDirectoryError='';
  }catch(e){quickDirectoryError='股票索引尚未部署';console.warn(e)}finally{quickDirectoryLoading=null;quickDraw()}
 })();return quickDirectoryLoading;
}
// r83: make lookup errors visible and prevent silent no-op when detail rendering fails.
function quickLookupNotice(message){
 const target=$('#quickStockResults');
 if(target){
  let notice=target.querySelector('.r83-lookup-notice');
  if(!notice){notice=document.createElement('p');notice.className='r447-msg r83-lookup-notice';notice.setAttribute('role','alert');notice.style.cssText='padding:12px;border:1px solid #f5bd67;border-radius:10px;color:#ffd58c;white-space:normal';target.prepend(notice)}
  notice.textContent=message;
 }
 try{toast(message)}catch(e){console.warn(message)}
}
async function quickOpen(market,code){
 market=String(market||'').trim();code=String(code||'').trim();
 if(!market||!r177EtfCode(code)){quickLookupNotice('股票／ETF代號或市場資料有誤，請重新搜尋');return}
 const id=market+'-'+code;
 if(r177EtfRows().some(r=>String(r.code).toUpperCase()===code.toUpperCase()&&r.market===market)){
   const find=()=>r177EtfRows().find(r=>String(r.code).toUpperCase()===code.toUpperCase()&&r.market===market);
   const prior=find(),hasBars=Boolean(r177EtfDirectory&&prior?.bars?.length);
   const refreshNeeded=!hasBars||!r189EtfFresh(r177EtfDate(prior))||r177EtfError||Date.now()-r181LastLoad>60000;
   state.detail=null;state.etfDetail={...prior,isR177Etf:true};
   // Open immediately; a background fetch never blocks the detail view.
   const opened=state.etfDetail;
   if(refreshNeeded)r177LoadEtfs().then(()=>{
     if(state.etfDetail!==opened||$('#modalOverlay').hidden)return;
     const next=find();if(!next||next===prior||(!next.bars?.length))return;
     if(hasBars&&JSON.stringify(next)===JSON.stringify(prior))return;
     // Avoid replacing focused input fields or changing the user's scroll position.
     const active=document.activeElement;
     if(active?.matches?.('#modalContent input,#modalContent select')){toast('ETF已核對；重新開啟以查看最新資料');return;}
     state.etfDetail={...next,isR177Etf:true};renderInstitutionalDetail();
   });
   state.chartDays=60;if($('#modalOverlay').hidden){history.pushState({chaopanDetail:true},'',location.href);state.detailHistory=true;}
   renderInstitutionalDetail();$('#modalOverlay').hidden=false;document.body.style.overflow='hidden';return;
 }
 let row=allRows().find(x=>rowId(x)===id);
 const expectedDay=state.payload?.asOf||quickDirectory?.asOf;
 if(quickDirectory&&expectedDay&&quickDirectory.asOf!==expectedDay)await loadQuickDirectory();
 if(quickDirectory&&expectedDay&&quickDirectory.asOf!==expectedDay){
  quickLookupNotice(`股票索引日期 ${quickDirectory.asOf} 與盤後行情 ${expectedDay} 不一致；將嘗試使用同日個股資料，若不存在則停止開啟。`);
 }
 if(row&&expectedDay&&row.date!==expectedDay){
  // A current lookup shard may be available even when the ranking cache is stale.
  row=null;
 }
 if(!row){
  if(quickShardBusy){quickLookupNotice('個股資料仍在下載，請稍候再試');return}
  quickShardBusy=true;
  const target=$('#quickStockResults');
  if(target)target.insertAdjacentHTML('beforeend','<p class="r447-msg r83-loading">正在下載個股歷史資料…</p>');
  try{
   const digit=code.charAt(0);if(!/^\d$/.test(digit))throw Error('代號格式不符');
   const response=await fetch('./data/stock-lookup/'+digit+'.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('個股資料 HTTP '+response.status+'；請確認 GitHub 的 data/stock-lookup/'+digit+'.json 已部署');
   const data=await response.json();
   const latest=state.payload?.asOf||quickDirectory?.asOf;
   if(!latest||data.asOf!==latest||quickDirectory&&data.asOf!==quickDirectory.asOf)throw Error('個股資料日期 '+(data.asOf||'未知')+' 與盤後日期 '+(latest||'未知')+' 不一致');
   if(!Array.isArray(data.rows)||!data.rows.length)throw Error('個股歷史資料缺漏');
   row=data.rows.find(x=>String(x.code)===code&&String(x.market)===market&&x.date===latest);
   if(!row)throw Error('找不到 '+market+' '+code+' 的同日資料；請更新股票索引及個股分組');
   state.lookupRow=row;
  }catch(e){quickLookupNotice('無法開啟 '+code+'：'+e.message);console.error('r83 quick lookup',e);return}
  finally{quickShardBusy=false;target?.querySelectorAll('.r83-loading').forEach(x=>x.remove())}
 }
 try{
  // Use the validated row, even when an old ranking row shares the same ID.
  state.lookupRow=row;
  showDetails(id);
  if($('#modalOverlay')?.hidden)quickLookupNotice('個股頁未成功開啟，請回報此畫面');
 }catch(e){
  console.error('r83 detail render',e);
  quickLookupNotice('個股頁顯示失敗：'+(e?.message||String(e)));
 }
}

function initQuickStockSearch(){
 const field=$('#quickStockSearch'),result=$('#quickStockResults');if(!field||!result)return;
 let searchTimer;
 field.addEventListener('input',()=>{
  clearTimeout(searchTimer);if(!field.value.trim()){quickDraw();return;}
  searchTimer=setTimeout(()=>{quickDraw();if(!quickDirectory||state.payload?.asOf&&quickDirectory.asOf!==state.payload.asOf)loadQuickDirectory();if(!r177EtfDirectory&&!r177EtfLoading)r177LoadEtfs();},120);
 });
 field.addEventListener('keydown',e=>{if(e.key==='Enter'){
  const x=quickMatches(field.value)[0];if(x){e.preventDefault();quickOpen(x.market,String(x.code))}
 }});
 result.addEventListener('click',e=>{const b=e.target.closest('[data-quick-code]');if(b)quickOpen(b.dataset.quickMarket,b.dataset.quickCode)});
 // Search feeds are loaded on demand, not during home initialization.
}
function wire(){loadWatch();setupSixtyToolbar();r131Mount();setupDetailSwipe();initQuickStockSearch();$('#deskDisclosure')?.addEventListener('toggle',e=>{if(e.target.open&&state.payload)renderTradeDesk(true)});document.addEventListener('click',unifiedCardEvents);
 // r87: delegated input binding supports cost inputs in dynamically rendered candidate cards.
 document.addEventListener('input',e=>{
  const input=e.target.closest?.('.unified-battle-card .r82-cost-input');
  if(!input)return;
  const card=input.closest('.unified-battle-card'),profit=card?.querySelector('.r82-profit');
  if(!profit)return;
  const code=String(input.closest('.r82-decision')?.dataset.code||'');
  const v=Number(input.closest('.r82-decision')?.dataset.reduction||NaN);
  const cost=Number(input.value);
  if(!input.value||!Number.isFinite(cost)||cost<=0||!Number.isFinite(v)||v<=0){profit.textContent='輸入成本後顯示';profit.style.color='';}
  else{const pnl=Math.round((v-cost)*1000);profit.textContent=pnl.toLocaleString('zh-TW')+' 元';profit.style.color=pnl>=0?'#79dfbd':'#ff909b';}
  if(code){try{if(input.value&&cost>0)localStorage.setItem('chaopan-r82-cost-'+code,String(cost));else localStorage.removeItem('chaopan-r82-cost-'+code)}catch(_){}}
 });document.addEventListener('toggle',e=>{if(e.target.matches?.('details.r30-stock-entry'))r30StockToggle(e.target);},true);
 $$('.lens-scope').forEach(b=>b.onclick=()=>{state.rankLens=b.dataset.lens;state.rankView='20';state.stageView='all';state.tab='all';state.query='';$('#searchBox').value='';state.visible=30;renderList()});const liquidityToggle=$('#onlyLiquid');if(liquidityToggle){liquidityToggle.checked=state.liquidityOnly;liquidityToggle.addEventListener('change',e=>{state.liquidityOnly=e.target.checked;state.visible=30;renderList()})}$$('.rank-scope').forEach(b=>b.onclick=()=>{state.rankView=b.dataset.scope;state.visible=30;state.tab='all';renderList()});$$('.stage-scope').forEach(b=>b.onclick=()=>{state.stageView=b.dataset.stage;state.visible=30;state.tab='all';state.query='';$('#searchBox').value='';renderList()});const sort=$('#sortFilter');if(sort){sort.insertAdjacentHTML('afterbegin','<option value="trade">操盤品質與追高風險（預設）</option><option value="launch">第一根發動優先</option><option value="priority">基本面投資優先度</option>');sort.value='trade';state.sort='trade';}$$('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$$('.stat-card').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$$('.nav-item').forEach(b=>b.onclick=()=>navTo(b.dataset.page));$('#searchBox').oninput=e=>{state.query=e.target.value;state.visible=30;renderList()};$('#showMore').onclick=()=>{state.visible+=30;renderList()};$('#refreshBtn').onclick=()=>{loadData();r177LoadEtfs()};$('.advanced-radar')?.addEventListener('toggle',e=>{if(e.target.open&&state.payload){state.rankListDirty=false;renderList()}});$('#closeModal').onclick=()=>hideDetails();$('#modalOverlay').onclick=e=>{if(e.target===$('#modalOverlay'))hideDetails()};window.onkeydown=e=>{if(e.key==='Escape')hideDetails()};window.addEventListener('popstate',()=>{if(state.detail||state.etfDetail)hideDetails(true)});loadData();if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(console.warn)}}
document.addEventListener('DOMContentLoaded',wire);

// The overlay is presentation-only and does not change any trade signals.
globalThis.ChaopanToggleFib=function(button){
 const root=button.closest('.chart-area');if(!root)return;
 const chart=root.querySelector('#chartSvg');if(!chart)return;
 const hidden=chart.classList.toggle('fib-hidden');
 globalThis.ChaopanFibHidden=hidden;
 button.textContent=hidden?'費波那契：隱藏':'費波那契：顯示';
 button.setAttribute('aria-pressed',String(!hidden));
};

// Range overlay is display-only and does not change trading signals.
globalThis.ChaopanToggleRange=function(button){
 const root=button.closest('.chart-area');if(!root)return;
 const chart=root.querySelector('#chartSvg');if(!chart)return;
 const hidden=!globalThis.ChaopanRangeHidden;globalThis.ChaopanRangeHidden=hidden;
 chart.classList.toggle('range-hidden',hidden);
 chart.querySelectorAll('.chaopan-range-layer').forEach(el=>{el.style.display=hidden?'none':''});
 button.textContent=hidden?'盤整框：隱藏':'盤整框：顯示';
 button.setAttribute('aria-pressed',String(!hidden));
};

globalThis.ChaopanToggleGaps=function(button){
 const root=button.closest('.chart-area');if(!root)return;
 const chart=root.querySelector('#chartSvg');if(!chart)return;
 const hidden=!globalThis.ChaopanGapHidden;globalThis.ChaopanGapHidden=hidden;
 chart.classList.toggle('gap-hidden',hidden);
 button.textContent=hidden?'缺口：隱藏':'缺口：顯示';
 button.setAttribute('aria-pressed',String(!hidden));
};

// Landscape chart presentation: preserves the existing signal calculations.
globalThis.ChaopanApplyExpandedChart=function(){
 const area=document.querySelector('#modalContent .chart-area');
 if(!area)return;
 const expanded=!!globalThis.ChaopanChartExpanded;
 area.classList.toggle('chaopan-landscape-chart',expanded);
 document.documentElement.classList.toggle('chaopan-chart-expanded',expanded);
 const top=area.querySelector('.chart-top');
 const toggles=[...area.querySelectorAll('.fib-toggle')];
 if(expanded&&top){
   toggles.forEach(t=>{if(!t.dataset.originalParent){t.dataset.originalParent=t.parentElement?.classList.contains('fib-toolbar')?'fib-toolbar':'chart-area';}top.appendChild(t);});
 }else{
   toggles.forEach(t=>{const parent=t.dataset.originalParent==='fib-toolbar'?area.querySelector('.fib-toolbar'):area;if(parent)parent.insertBefore(t,parent===area?area.querySelector('.range-status'):null);});
 }
 // r53: concise, read-only distance panel in landscape view.
 // Use the same verified support and neckline selectors as the battle card.
 let distancePanel=area.querySelector('.r53-chart-distances');
 if(!distancePanel){
   distancePanel=document.createElement('div');
   distancePanel.className='r53-chart-distances';
   distancePanel.setAttribute('aria-label','現價與關鍵價位距離');
   area.appendChild(distancePanel);
 }
 const stock=state.detail;
 if(stock){
   const close=numeric(stock.close),neck=latestNeck(stock),supports=supportLines(stock);
   const checkedDefense=r220Defense(stock);const defense=numeric(checkedDefense?.keyPrice??checkedDefense?.lower);
   const distance=v=>{
     if(close===null||close<=0||v===null||v<=0)return '待核對';
     const p=(v/close-1)*100;
     return `${p>0?'+':''}${p.toFixed(2)}%`;
   };
   const level=(name,v)=>`<span>${esc(name)} <b>${esc(distance(v))}</b></span>`;
   distancePanel.innerHTML=`<strong>${esc(stock.code)} ${esc(stock.name)}｜收盤 ${price(close)}</strong><div>${level('頸線',neck)}${level('第一支撐',numeric(supports[0]?.lower))}${level('第二支撐',numeric(supports[1]?.lower))}${checkedDefense?level('最後防守',defense):stock.structureV23?.mainDefense?`<span>原防守 <b>${price(stock.structureV23.mainDefense.keyPrice??stock.structureV23.mainDefense.lower)}（待核對）</b></span>`:level('最後防守',null)}</div>`;
 }else{distancePanel.textContent='';}
 const chartSvg=area.querySelector('#chartSvg svg');
 // r90: the host CSS uses a two-row !important GRID, so r89's inserted header
 // fell into an implicit row below the chart. Reserve a real second row for it.
 // This must use important to override the existing index.html layout rules.
 if(expanded){
   area.style.setProperty('grid-template-rows','42px minmax(42px,auto) minmax(0,1fr)','important');
   area.style.setProperty('grid-template-columns','minmax(0,1fr)','important');
 }else{
   area.style.removeProperty('grid-template-rows');
   area.style.removeProperty('grid-template-columns');
 }
 const header=area.querySelector('.r89-candle-header');
 if(header){
   if(expanded){
     header.style.setProperty('grid-row','2','important');
     header.style.setProperty('grid-column','1','important');
     header.style.setProperty('display','block','important');
     header.style.setProperty('overflow','hidden','important');
     header.style.setProperty('margin','0','important');
     header.style.setProperty('padding','3px 10px','important');
     header.style.setProperty('font-size','clamp(11px,1.15vw,15px)','important');
     header.style.setProperty('line-height','1.25','important');
   }else{
     ['grid-row','grid-column','overflow'].forEach(p=>header.style.removeProperty(p));
   }
 }
 if(chartSvg){
   if(expanded){chartSvg.parentElement.style.setProperty('grid-row','3','important');chartSvg.parentElement.style.setProperty('grid-column','1','important');}
   else{chartSvg.parentElement.style.removeProperty('grid-row');chartSvg.parentElement.style.removeProperty('grid-column');}
 }
 // The expanded grid should contain only toolbar, OHLCV and the plot.
 // Hiding the legacy status elements prevents implicit rows covering the header.
 [...area.children].forEach(el=>{
   if(el.classList.contains('chart-top')||el.classList.contains('r89-candle-header')||el.id==='chartSvg')return;
   if(expanded){el.dataset.r90Display=el.style.display||'';el.style.setProperty('display','none','important')}
   else if(Object.prototype.hasOwnProperty.call(el.dataset,'r90Display')){el.style.display=el.dataset.r90Display;delete el.dataset.r90Display}
 });
 // r89: keep selected OHLCV above the chart and remove the obstructing floating distance card in landscape.
 const inspector=area.querySelector('.r89-candle-header');
 if(inspector){
   inspector.style.position='relative';inspector.style.zIndex='5';
   inspector.style.flex='0 0 auto';inspector.style.width='100%';
   inspector.style.margin=expanded?'3px 0 2px':'8px 0 5px';
   inspector.style.padding=expanded?'4px 10px':'8px 12px';
   inspector.style.fontSize=expanded?'12px':'13px';
 }
 if(distancePanel){distancePanel.style.display=expanded?'none':'';}
 if(chartSvg){if(expanded)chartSvg.setAttribute('preserveAspectRatio','none');else chartSvg.removeAttribute('preserveAspectRatio');}
 const btn=area.querySelector('.chaopan-expand');
 if(btn){btn.textContent=expanded?'✕ 返回':'⛶ 橫向放大';btn.setAttribute('aria-label',expanded?'返回一般K線':'橫向放大K線');}
};
globalThis.ChaopanExpandChart=async function(){
 const expanded=!globalThis.ChaopanChartExpanded;
 globalThis.ChaopanChartExpanded=expanded;
 globalThis.ChaopanApplyExpandedChart();
 if(expanded){
   try{if(document.fullscreenEnabled&&!document.fullscreenElement)await document.documentElement.requestFullscreen();}catch(e){}
   try{if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch(e){}
 }else{
   try{screen.orientation?.unlock?.()}catch(e){}
   try{if(document.fullscreenElement)await document.exitFullscreen()}catch(e){}
 }
};
document.addEventListener('fullscreenchange',()=>{
 if(!document.fullscreenElement&&globalThis.ChaopanChartExpanded){
  // Do not exit the CSS fallback on browsers without fullscreen support.
 }
});

document.addEventListener('click',function(e){
 if(e.target?.id==='closeModal'&&globalThis.ChaopanChartExpanded){
  globalThis.ChaopanChartExpanded=false;
  document.documentElement.classList.remove('chaopan-chart-expanded');
 }
},true);

// R135: one runtime build identifier for the detail script and visible home badge.
// A separate index.html change is still required for an authoritative static badge.
(function(){
 const BUILD_ID='R220-20261127-chart-support-guard';
 const BUILD_LABEL='r220 · 缺口支撐與壓力防錯';
 globalThis.CHAOPAN_DETAIL_BUILD=BUILD_ID;
 if(document.documentElement)document.documentElement.dataset.chaopanDetailBuild=BUILD_ID;
 // R161: The static index.html has kept r50/r60-era labels even after
 // the detail script has advanced. The old full-body text walker did not
 // match some of those labels and re-scanned thousands of stocks on every
 // mutation. Update only the two known display elements, and preserve the
 // original text about the deployed commit/data date.
 function updateBadge(){
  if(!document.body)return;
  const badge=document.querySelector('.brandtext .brandname b');
  if(badge){
   if(badge.textContent.trim()!==BUILD_LABEL)badge.textContent=BUILD_LABEL;
   const aria='超盤手 RADAR '+BUILD_LABEL;
   if(badge.getAttribute('aria-label')!==aria)badge.setAttribute('aria-label',aria);
  }
  const status=document.getElementById('r44VersionStatus');
  if(status){
   const raw=status.textContent||'';
   const next=raw.includes('程式：'+BUILD_LABEL)?raw:raw.replace(/程式：r\d+[^｜|\n]*/i, '程式：'+BUILD_LABEL);
   if(next!==raw)status.textContent=next;
  }
 }
 function start(){
  updateBadge();
  // The page may repaint the header or asynchronously add the badge.
  // No O(all-stock-list) text walk is needed on redraw.
  new MutationObserver(updateBadge).observe(document.body,{childList:true,subtree:true,characterData:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
