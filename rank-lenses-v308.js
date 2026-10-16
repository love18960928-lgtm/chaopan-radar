/* 超盤手 V3.0.8｜三視角排行。只用截至選股日已知的日K，不是買進訊號或機構持倉推測。 */
(function(root,factory){'use strict';const lib=factory();if(typeof module==='object'&&module.exports)module.exports=lib;root.RadarLenses=lib;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const round=n=>Math.round(n*10)/10;
 const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
 const finite=x=>x===null||x===undefined||x===''||!Number.isFinite(Number(x))?null:Number(x);
 const mean=(a,n,end=a.length)=>end>=n?a.slice(end-n,end).reduce((s,v)=>s+v,0)/n:null;
 function returns(bars,n){if(bars.length<=n)return null;const prev=finite(bars.at(-n-1)?.[4]),now=finite(bars.at(-1)?.[4]);return prev>0&&now>0?100*(now/prev-1):null}
 function quality(c,ctx){
   const risk=String(c.riskLevel||'');const flags=[];
   if(risk==='high'||c.riskFirst)flags.push('高風險警戒');
   if(risk==='medium')flags.push('風險偏高');
   if(c.overextended)flags.push('偏離過大');
   if(c.onePriceLimit)flags.push('一價量能風險');
   if(c.possiblePriceAdjustment)flags.push('除權息或價格需核對');
   if(ctx.ma?.maRisk)flags.push('遠離5日線，留意追價');
   const o=finite(c.open),hi=finite(c.high),lo=finite(c.low),close=finite(c.close);
   if(o!==null&&hi!==null&&lo!==null&&hi>lo&&close!==null){
     const amp=100*(hi-lo)/Math.max(o,.01);
     if(amp>=9)flags.push('當日振幅大');
     if(close<o&&(close-lo)/(hi-lo)<.35)flags.push('收低賣壓');
   }
   if(c.disposition||c.underDisposition||c.disposal)flags.push('交易限制請核對');
   return [...new Set(flags)];
 }
 function evaluate(c,ctx){
   const bars=(c.bars||[]).filter(b=>Array.isArray(b)&&finite(b[4])>0);
   const last=bars.at(-1);const close=finite(c.close)??finite(last?.[4]);
   const m=ctx.ma||{};const phase=ctx.phase||{};const follow=ctx.follow||{};
   const r5=returns(bars,5),r10=returns(bars,10),r20=returns(bars,20);
   const vol=finite(c.volumeRatio);
   const q=quality(c,ctx);
   if(r20!==null&&r20>=45)q.push('20日漲幅過大，注意追高');
   if(r5!==null&&r5>=16)q.push('5日快速急漲');
   const riskHigh=Boolean(c.riskFirst||c.riskLevel==='high'||c.possiblePriceAdjustment);
   const liquid=ctx.liquidity||{};
   const hasBase=close!==null&&bars.length>=21&&last&&last[0]===c.date;
   const inMA=finite(m.ma5)>0&&finite(m.ma10)>0&&finite(m.ma20)>0&&close>m.ma5&&close>m.ma10&&close>m.ma20;
   const aligned=Boolean(inMA&&m.ma5>m.ma10&&m.ma10>m.ma20);
   const ma20Up=finite(m.ma20SlopePct)!==null&&m.ma20SlopePct>0;
   const aboveNeck=finite(follow.originalNeckline)>0&&close>follow.originalNeckline;
   const held=finite(follow.holdDays);
   const phaseName=String(phase.phase||'');
   const phaseOk=['ready','first','second'].includes(phaseName)&&phase.tone!=='danger';
   const neck=finite(phase.level)??finite(c.neck);
   const distance=neck!==null&&close>0?(neck-close)/neck:null;
   const isReady=phaseName==='ready'&&distance!==null&&distance>=0&&distance<=.06;
   const isFirstSecond=['first','second'].includes(phaseName);
   const closePos=finite(c.high)!==null&&finite(c.low)!==null&&c.high>c.low?clamp((close-c.low)/(c.high-c.low)):null;
   const trend=finite(c.trading?.trend);
   const stableEvidence=Boolean((follow.kind==='trend'&&held!==null&&held>=2&&aboveNeck)||ctx.audit?.confirmed===true);
   const launchQualified=hasBase&&liquid.launch&&phaseOk&&(isReady||isFirstSecond)&&!riskHigh;
   const stableQualified=hasBase&&liquid.strength&&aligned&&ma20Up&&stableEvidence&&!riskHigh&&c.riskLevel!=='medium'&&phase.tone!=='danger'&&!q.includes('收低賣壓');
   const momentumQualified=hasBase&&liquid.launch&&!c.possiblePriceAdjustment&&r5!==null&&r10!==null&&r20!==null&&
      inMA&&(r5>=5||r20>=15)&&r20>0;
   // Fixed bounded weighted indices: no add-then-cap saturation at 100. No points for missing evidence.
   const phasePts=phaseName==='first'?1:phaseName==='second'?.82:isReady?.7:0;
   const closeness=distance===null?0:clamp(1-Math.abs(distance)/.06);
   const launch=round(100*(.25*phasePts+.26*closeness+.16*clamp((trend??0)/100)+
      .14*clamp(((vol??0)-.6)/1.8)+.12*(closePos??0)+.07*(inMA?1:0)));
   const maGap=finite(m.ma5)>0?100*(close/m.ma5-1):null;
   if(maGap!==null&&maGap>=10)q.push('距5日線過遠');
   const stable=round(100*(.21*(aligned?1:inMA?.35:0)+.19*clamp((held??0)/12)+
      .17*clamp((finite(m.ma20SlopePct)??0)/.9)+.17*clamp((trend??0)/100)+
      .16*(maGap===null?0:clamp(1-Math.abs(maGap-1.5)/8))+
      .10*(vol===null?0:clamp((vol-.4)/1.6))));
   const accel=r5===null||r10===null?0:clamp(((2*r5-r10)+5)/22);
   const momentum=round(100*(.27*clamp((r5??0)/22)+.22*clamp((r10??0)/35)+
      .21*clamp((r20??0)/70)+.12*accel+.11*clamp(((vol??0)-.5)/2.5)+
      .07*(closePos??0)));
   // Risk warnings are never hidden; especially parabolic/disposition candidates.
   const balanced=round((ctx.baseScore??0)*.5+stable*.25+launch*.12+momentum*.13);
   return {qualified:{launch:launchQualified,stable:stableQualified,momentum:momentumQualified,balanced:Boolean(ctx.baseEligible)},
      score:{launch,stable,momentum,balanced},returns:{r5,r10,r20},flags:q,
      source:phaseName==='first'?'突破第一根':phaseName==='second'?'突破第二根':phaseName==='ready'?'靠近頸線':follow.kind==='trend'?'突破後延續':'一般觀察',
      evidence:hasBase?'足夠日K':'資料不足或日期不一致'};
 }
 const labels={launch:'剛要發動',stable:'穩定強勢',momentum:'飆股動能',balanced:'強勢綜合'};
 return {evaluate,labels,returns,finite};
});
