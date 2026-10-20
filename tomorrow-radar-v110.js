/* Chaopan RADAR r42.1 strict liquidity-sector research module – EOD-only, deterministic, no win-rate claims.
   Every score is a heuristic observation priority, NOT a probability of rising.
   Event mapping is a disclosed research universe, NOT a list of exhibitors or winners.
*/
(function(root, factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.ChaopanTomorrowRadar=api;
})(typeof globalThis!=='undefined'?globalThis:this, function(){
 'use strict';
 const safe=n=>n!==null&&n!==undefined&&n!==''&&typeof n!=='boolean'&&Number.isFinite(Number(n))?Number(n):null;
 const median=a=>{if(!a.length||a.some(v=>!Number.isFinite(v)))return null;const b=a.slice().sort((x,y)=>x-y);return (b[Math.floor((b.length-1)/2)]+b[Math.floor(b.length/2)])/2;};
 const avg=a=>a.length&&a.every(n=>Number.isFinite(n))?a.reduce((x,y)=>x+y,0)/a.length:null;
 const bad=/假突破|出貨|破位|突破失敗|轉弱|不宜追價|結構破壞|賣壓|跌破|長上影警戒/;
 const events=[Object.freeze({id:'tpca-2026',title:'TPCA Show 2026｜PCB／載板',start:'2026-10-20',end:'2026-10-22',
  source:'https://www.tpcashow.com/',sourceLabel:'TPCA Show 官方網站',
  disclosure:'以下僅為PCB／載板相關研究觀察池，不是官方參展商名單，也不代表展覽會帶動營收或股價。',
  codes:Object.freeze(['3037','8046','3189','2313','2368','4958','3044','6213','6274','2383','5469','6153','6191','3715','2355'])})];
 const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const dayGap=(from,to)=>dateOK(from)&&dateOK(to)?Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000):null;
 function snapshot(c,asOf){
  if(!c||!dateOK(asOf)||c.date!==asOf||!/^\d{4}$/.test(String(c.code)))return null;
  const b=c.bars;
  if(!Array.isArray(b)||b.length<35)return null;
  let lastDate='',prices=[],volume=[];
  for(const r of b){
   if(!Array.isArray(r)||r.length<6||!dateOK(r[0])||r[0]<=lastDate||r[0]>asOf)return null;
   lastDate=r[0];
   const o=safe(r[1]),h=safe(r[2]),l=safe(r[3]),cl=safe(r[4]),v=safe(r[5]);
   if([o,h,l,cl,v].some(x=>x===null)||Math.min(o,h,l,cl)<=0||v<0||h<Math.max(o,cl)||l>Math.min(o,cl))return null;
   prices.push(cl);volume.push(v);
  }
  if(lastDate!==asOf)return null;
  const last=b.at(-1);
  for(const [key,i] of [['open',1],['high',2],['low',3],['close',4],['lots',5]]){
   const n=safe(c[key]);if(n===null||Math.abs(n-last[i])>Math.max(.005,Math.abs(last[i])*.00001))return null;
  }
  const close=prices.at(-1),prev=prices.at(-2),high=last[2],low=last[3],open=last[1];
  const ma=n=>prices.length>=n?avg(prices.slice(-n)):null;
  const maPast=(n,offset)=>prices.length>=n+offset?avg(prices.slice(-n-offset,-offset)):null;
  const vol20=avg(volume.slice(-21,-1));if(!(vol20>0)||!(volume.at(-1)>0))return null;
  const vol5=avg(volume.slice(-6,-1));
  const range=high-low,position=range>0?(close-low)/range:.5,upper=range>0?(high-Math.max(open,close))/range:0;
  const upvol=[],downvol=[];
  for(let i=prices.length-8;i<prices.length;i++){
   if(i<=0)continue;
   const d=prices[i]-prices[i-1];if(d>0)upvol.push(volume[i]);else if(d<0)downvol.push(volume[i]);
  }
  const up=sum(upvol),down=sum(downvol);
  const flow20=b.slice(-21,-1).map(r=>Number(r[4])*Number(r[5])/1000); // NT$ millions, lots * 1000 shares
  const amountM=close*volume.at(-1)/1000;
  const avgAmountM=avg(flow20),medianAmountM=median(flow20);
  const limitLike=(i)=>i>0&&prices[i-1]>0&&prices[i]/prices[i-1]>=1.093;
  const recentLimitCount=prices.slice(-6).reduce((n,_,j)=>n+(j>0&&limitLike(prices.length-6+j)?1:0),0);
  const intradayHighLimit=prev>0&&high/prev>=1.093;
  const failedLimit=intradayHighLimit&&(high-close)/high>=.015&&position<.65;
  const onePriceLimitLike=intradayHighLimit&&range<=.00001;
  const neck=safe(c.neck);
  return {close,prev,high,low,open,vol:volume.at(-1),vol20,vol5,volRatio:volume.at(-1)/vol20,
   ma5:ma(5),ma10:ma(10),ma20:ma(20),ma60:ma(60),oldMa20:maPast(20,5),oldMa10:maPast(10,3),
   neck,position,upper,upDown:down>0?up/down:up>0?3:0,change:100*(close/prev-1),
   ret5:prices.length>=6?100*(close/prices.at(-6)-1):null,
   low5:Math.min(...b.slice(-5).map(r=>r[3])),bars:b.length,avgLots:vol20,
   amountM,avgAmountM,medianAmountM,recentLimitCount,intradayHighLimit,failedLimit,onePriceLimitLike};
 }
 function sum(a){return a.reduce((x,y)=>x+y,0);}
 // Transparent sector gate: peers must be broadly rising, not merely falling less than the index.
 function sectorStrength(rows,asOf){
  const groups=new Map(), all=[];
  for(const c of rows){
   if(c?.date!==asOf||!Array.isArray(c.bars)||c.bars.length<6||c.bars.at(-1)?.[0]!==asOf)continue;
   const close=safe(c.bars.at(-1)[4]),old=safe(c.bars.at(-6)[4]);
   if(!(close>0&&old>0))continue;
   const pct=100*(close/old-1);all.push(pct);
   const industry=String(c.industry||c.fundamentals?.industry||'').trim();
   if(!industry||/未分類|不詳|未知|尚未分類|其他未分類/.test(industry))continue;
   const g=groups.get(industry)||[];g.push(pct);groups.set(industry,g);
  }
  const marketMedian=median(all),sector=new Map();
  for(const [name,returns] of groups){
   const sample=returns.length,mid=median(returns),advancers=returns.filter(x=>x>0).length;
   const advanceRatio=advancers/sample;
   const excess=marketMedian===null?null:mid-marketMedian;
   const qualified=sample>=6&&mid>0&&advanceRatio>=.55&&excess>=1;
   sector.set(name,{name,sample,median5:mid,advanceRatio,excess,qualified});
  }
  const leaders=[...sector.values()].filter(x=>x.qualified).sort((a,b)=>b.median5-a.median5||b.advanceRatio-a.advanceRatio).slice(0,3);
  return {marketMedian,sectors:sector,leaders};
 }
 function inspect(c,asOf,context){
  const s=snapshot(c,asOf);if(!s)return {eligible:false,reason:'行情／日期／歷史不足，無法核對'};
  const flags=[c.followStatus,c.unifiedStage,c.trading?.status,c.breakoutStatus,c.riskReasons].filter(Boolean).join(' ');
  const hardRisk=Boolean(c.riskFirst||c.possiblePriceAdjustment||c.overextended||c.onePriceLimit||
   ['medium','high'].includes(String(c.riskLevel||'').toLowerCase())||bad.test(flags));
  if(hardRisk)return {eligible:false,reason:'觸發出貨、破位、過度延伸或個股風險排除',snapshot:s};
  if(s.bars<60||s.ma60===null)return {eligible:false,reason:'MA60歷史未滿60根，只能初步觀察',snapshot:s};
  // Dynamic NT$-value gates. Price alone or lots alone can mislabel a thin stock as a leader.
  const penny=s.close<10,lowPrice=s.close<20;
  const minAvgM=penny?250:lowPrice?150:80;
  const minMedianM=penny?150:lowPrice?100:50;
  const minDailyM=penny?150:lowPrice?100:50;
  const minLots=penny?3000:lowPrice?1500:500;
  if(s.avgLots<minLots||s.vol<minLots*.45||s.avgAmountM<minAvgM||s.medianAmountM<minMedianM||s.amountM<minDailyM)
   return {eligible:false,reason:'成交張數及近20日成交金額不足；低價股採較嚴格門檻',snapshot:s};
  if(s.onePriceLimitLike)return {eligible:false,reason:'疑似一字漲停，無法以收盤價推定有足夠成交機會',snapshot:s};
  if(s.failedLimit||s.intradayHighLimit&&s.position<.75||s.recentLimitCount>=2||s.change>=7.5||s.change<=-5.5)
   return {eligible:false,reason:'疑似碰漲停後收低／短期連續急拉／價格急跌，風險高於預備布局',snapshot:s};
  if(c.signalQuality==='突破K有疑慮' || /突破K有疑慮|不宜追價|突破失敗/.test(String(c.entryReadiness||'')))
   return {eligible:false,reason:'與原有突破品質或追價警戒相互矛盾，先排除',snapshot:s};
  const adx=safe(c.setupEvidence?.adx14); // Never fabricate DMI/ADX when absent.
  if(adx===null || adx<18)return {eligible:false,reason:'ADX 趨勢尚不夠明確或資料待核對',snapshot:s};
  if(s.ret5===null||s.ret5<=0||s.upDown<1.05)return {eligible:false,reason:'近五日未轉強或近八根上漲日量能未佔優',snapshot:s};
  if(!context)return {eligible:false,reason:'尚未核對全市場族群／市場廣度，不可升為明日攻擊',snapshot:s};
  if(context){
   const ind=String(c.industry||c.fundamentals?.industry||'').trim(),sct=context.sectors.get(ind);
   if(!sct?.qualified)return {eligible:false,reason:'所屬族群五日漲幅及上漲家數比例未達真正領漲',snapshot:s};
   const breadth=safe(c.marketBreadthAboveMA20Pct);
   if(breadth===null||breadth<45)return {eligible:false,reason:'市場 MA20 廣度偏弱，暫不列明日攻擊',snapshot:s};
  }
  if(s.upper>.43&&s.position<.5||s.volRatio>2&&s.position<.4)return {eligible:false,reason:'大量收低或上影賣壓',snapshot:s};
  if(s.change>6||s.ret5>16||s.close/s.ma20>1.10||s.close/s.ma10>1.07)return {eligible:false,reason:'短線漲幅／乖離過大，不列追價',snapshot:s};
  if(s.close<s.ma20*.97||s.ma20<s.oldMa20*.985)return {eligible:false,reason:'MA20支撐或趨勢轉弱',snapshot:s};
  if(s.neck===null||s.neck<=0)return {eligible:false,reason:'沒有可核對歷史大量K頸線',snapshot:s};
  const distance=100*(s.neck/s.close-1);
  const nearNeck=distance>=0&&distance<=4.0;
  const breakHeld=distance<0&&distance>=-3.0&&s.close>=s.ma10&&s.position>=.55;
  const shallowPullback=s.close>=s.ma10*.987&&s.close<=s.ma5*1.025&&s.ma10>=s.oldMa10&&s.volRatio<=1.15&&s.ret5>-4&&s.ret5<9&&s.neck<=s.close*1.06;
  let stage=null;
  if(breakHeld&&s.change>=.3&&s.change<=4.5&&s.volRatio>=1.10&&s.upDown>=1.15&&s.position>=.65)stage='明日續攻候選';
  else if(nearNeck&&s.close>=s.ma20&&s.ma5>=s.ma10*.985&&s.ma20>=s.oldMa20*.998)stage='頸線前蓄勢';
  else if(shallowPullback&&s.close>=s.ma20&&s.ma20>=s.oldMa20*.998&&s.close>s.open&&s.position>=.63&&s.change>0)stage='量縮回測再起';
  if(!stage)return {eligible:false,reason:'尚未形成可靠的頸線／回測準備型態',snapshot:s};
  let score=20;const reasons=[];
  if(s.close>=s.ma20){score+=9;reasons.push('收在MA20上方');}
  if(s.ma5>=s.ma10){score+=7;reasons.push('MA5不弱於MA10');}
  if(s.ma20>s.oldMa20){score+=9;reasons.push('MA20上彎');}
  if(nearNeck){score+=12;reasons.push('距歷史頸線0～4%');}
  if(breakHeld){score+=12;reasons.push('頸線上方3%內守穩候選');}
  if(shallowPullback){score+=8;reasons.push('量縮回測短均線');}
  if(s.volRatio>=.75&&s.volRatio<=1.85){score+=8;reasons.push('成交量未明顯失控');}
  if(s.upDown>=1.3){score+=8;reasons.push('近8根上漲日成交量較集中');}
  if(s.ret5>0&&s.ret5<=10){score+=6;reasons.push('近5日轉強但未過熱');}
  if(s.position>=.65){score+=6;reasons.push('收盤靠近當日高檔');}
  if(s.ma60&&s.close>=s.ma60){score+=4;reasons.push('站上MA60');}
  if(s.upper>=.28)score-=8;
  if(s.change>=4.5)score-=8;
  if(s.volRatio>=2.6)score-=8;
  if(s.close/s.ma10>1.045)score-=10;
  if(s.close/s.ma20>1.075)score-=11;
  score=Math.max(0,Math.min(100,Math.round(score)));
  // Without official verified flows, a chart-only signal cannot claim elite 95+ status.
  score=Math.min(score,85);
  if(score<74)return {eligible:false,reason:'量價型態觀察品質不足',snapshot:s,score};
  return {eligible:true,stage,score,reason:reasons.concat(['近20日均成交約'+s.avgAmountM.toFixed(0)+'百萬元','族群廣度核對']).join('、'),snapshot:s,
   condition:'隔日先看是否守住MA10與主要頸線，價量同步確認；開高過大或長上影不追價。',
   reviewOnly:true,sixLineConfirmed:false};
 }
 function eventStatus(event,asOf){
  const d=dayGap(asOf,event.start),sinceEnd=dayGap(event.end,asOf);
  if(d!==null&&d>=0&&d<=30)return {state:'before',label:d===0?'今日展覽開始':`距事件 ${d} 個日曆日`,days:d};
  if(dateOK(asOf)&&asOf>=event.start&&asOf<=event.end)return {state:'during',label:'展覽期間',days:0};
  if(sinceEnd!==null&&sinceEnd>=0&&sinceEnd<=7)return {state:'after',label:'事件後觀察（避免利多出盡）',days:-sinceEnd};
  return null;
 }
 function analyze(rows,asOf){
  if(!dateOK(asOf)||!Array.isArray(rows))return {asOf,candidates:[],events:[],reason:'行情日期未核對'};
  const eligible=[],byCode=new Map(),context=sectorStrength(rows,asOf);let validated=0;
  for(const c of rows){if(c?.date!==asOf)continue;
   const v=inspect(c,asOf,context);if(v.snapshot)validated++;
   byCode.set(String(c.code),{row:c,decision:v});
   if(v.eligible)eligible.push({row:c,...v});
  }
  // First allocate room to next-session continuation AND low-chase pre-breakout.
  const classOrder={'明日續攻候選':0,'量縮回測再起':1,'頸線前蓄勢':2};
  eligible.sort((a,b)=>(classOrder[a.stage]-classOrder[b.stage])||b.score-a.score||a.row.code.localeCompare(b.row.code));
  const cap={'明日續攻候選':3,'量縮回測再起':3,'頸線前蓄勢':2},short=[];
  for(const stage of Object.keys(cap))short.push(...eligible.filter(x=>x.stage===stage).slice(0,cap[stage]));
  const selected=new Set(short.map(x=>x.row.code));
  for(const x of eligible){if(short.length>=8)break;if(!selected.has(x.row.code)){short.push(x);selected.add(x.row.code);}}
  const eventRows=[];
  for(const e of events){const status=eventStatus(e,asOf);if(!status)continue;
   const theme=e.codes.map(code=>byCode.get(code)).filter(Boolean),verified=theme.filter(v=>v.decision.eligible);
   eventRows.push({id:e.id,title:e.title,start:e.start,end:e.end,source:e.source,sourceLabel:e.sourceLabel,
    disclosure:e.disclosure,status:status.label,matchingCount:theme.length,
    selected:verified.sort((a,b)=>b.decision.score-a.decision.score).slice(0,8).map(v=>({row:v.row,...v.decision}))});
  }
  return {asOf,candidates:short,allQualifiedCount:eligible.length,events:eventRows,inspected:rows.length,validated,sectorLeaders:context.leaders,marketMedian5:context.marketMedian,
   reason:'規則式準備品質排名，不是隔日上漲機率；沒有通過標的時保留空名單，不硬湊。'};
 }
 return {snapshot,inspect,sectorStrength,analyze,eventStatus,events};
});
