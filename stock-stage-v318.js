/* Chaopan RADAR r28: strict full-six-line strength confirmation, conservative EOD stage classifier.
 * No synthetic quotes and no assertion of actual institutional distribution.
 * Supports Node regression and browser window.ChaopanStageV318 without changing script URLs.
 */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanStageV318=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const avg=(series,n,end=series.length)=>end>=n?series.slice(end-n,end).reduce((a,b)=>a+b,0)/n:null;
const validDate=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;};
const pct=(a,b)=>b>0?(a/b-1)*100:null;
// Wilder-smoothed ATR14 and ADX14. Does not assume missing trading days have zero movement.
function volatility(bars,period=14){
 if(!Array.isArray(bars)||bars.length<period*2+1)return {atr:null,adx:null};
 const tr=[],plus=[],minus=[];
 for(let i=1;i<bars.length;i++){
  const [h,l,ph,pl,pc]=[Number(bars[i][2]),Number(bars[i][3]),Number(bars[i-1][2]),Number(bars[i-1][3]),Number(bars[i-1][4])];
  const up=h-ph,down=pl-l;
  tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));
  plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);
 }
 let st=tr.slice(0,period).reduce((a,b)=>a+b,0),sp=plus.slice(0,period).reduce((a,b)=>a+b,0),sm=minus.slice(0,period).reduce((a,b)=>a+b,0);
 const dx=[];
 for(let i=period-1;i<tr.length;i++){
  if(i>=period){st=st-st/period+tr[i];sp=sp-sp/period+plus[i];sm=sm-sm/period+minus[i];}
  const p=st>0?100*sp/st:0,n=st>0?100*sm/st:0;
  dx.push(p+n>0?100*Math.abs(p-n)/(p+n):0);
 }
 if(dx.length<period)return {atr:st/period,adx:null};
 let adx=dx.slice(0,period).reduce((a,b)=>a+b,0)/period;
 for(let i=period;i<dx.length;i++)adx=(adx*(period-1)+dx[i])/period;
 return {atr:st/period,adx};
}
function inspect(row,asOf,options={}){
 const code=String(row?.code??'');const unknown=reason=>({kind:'unknown',reason,code,evidence:[]});
 if(options.unverified)return unknown('盤後選股或風險資料處理異常，暫不判定');
 if(!/^\d{4}$/.test(code)||!validDate(asOf)||row?.date!==asOf)return unknown('個股代號或資料交易日期無法核對');
 const bars=row?.bars;if(!Array.isArray(bars)||bars.length<22)return unknown('至少22根有效日K不足');
 let prevDate='';const closes=[],highs=[],lows=[],volumes=[];
 for(let i=0;i<bars.length;i++){
  const b=bars[i];if(!Array.isArray(b)||b.length<6||!validDate(b[0])||b[0]<=prevDate||b[0]>asOf)return unknown('歷史K線日期無效、重複、未遞增或超過資料日');
  prevDate=b[0];const [o,h,l,c,v]=[num(b[1]),num(b[2]),num(b[3]),num(b[4]),num(b[5])];
  if([o,h,l,c,v].some(x=>x===null)||Math.min(o,h,l,c)<=0||v<0||h<l||h<Math.max(o,c)||l>Math.min(o,c))return unknown('OHLC價位或成交量不合法');
  closes.push(c);highs.push(h);lows.push(l);volumes.push(v);
 }
 const last=bars.at(-1),close=closes.at(-1),open=num(last[1]),high=highs.at(-1),low=lows.at(-1),volume=volumes.at(-1);
 if(last[0]!==asOf)return unknown('最後一根日K日期與資料交易日不同');
 for(const [key,actual] of [['close',close],['open',open],['high',high],['low',low],['lots',volume]]){
  const x=num(row?.[key]);if(x===null||Math.abs(x-actual)>Math.max(.001,Math.abs(actual)*.00001))return unknown('個股速覽與最後日K的'+key+'不一致');
 }
 if(volume<=0)return unknown('當日零成交量，不能認證強勢');
 if(row?.possiblePriceAdjustment)return unknown('疑似除權息或價格調整未核對');
 const ma5=avg(closes,5),ma10=avg(closes,10),ma20=avg(closes,20),ma60=avg(closes,60),
 ma5p=avg(closes,5,closes.length-1),ma5pp=avg(closes,5,closes.length-2),
 ma10p=avg(closes,10,closes.length-1),ma10pp=avg(closes,10,closes.length-2),
 ma20p=avg(closes,20,closes.length-1),ma20old=avg(closes,20,closes.length-10);
 const vol=volatility(bars);
 const atrPct=vol.atr!==null?100*vol.atr/close:null;
 const prevVol20=avg(volumes,20,volumes.length-1),volRatio=prevVol20>0?volume/prevVol20:null;
 const bias5=pct(close,ma5),bias10=pct(close,ma10),bias20=pct(close,ma20);
 const range=high-low,upper=range>0?(high-Math.max(open,close))/range:0,closePosition=range>0?(close-low)/range:1;
 const neck=num(row?.cycle?.level),breakoutDay=row?.cycle?.initialDate,
 eventIndex=breakoutDay?bars.findIndex(b=>b[0]===breakoutDay):-1,
 validEvent=neck!==null&&neck>0&&eventIndex>=0&&eventIndex<bars.length,
 lastTwoStay=validEvent&&bars.length>=eventIndex+2&&closes.at(-2)>neck&&close>neck;
 const risky=Boolean(row?.riskFirst||row?.riskLevel==='high'||options.danger===true||/假突破警戒|突破失敗|結構破壞|趨勢轉弱/.test(String(row?.followStatus||''))||/^(?:突破失敗|跌破且未收復|結構破壞|趨勢轉弱)(?:[／\s]|$)/.test(String(row?.unifiedStage||'')));
 const evidence=[];let fourLinePending=false;
 if(volRatio!==null&&volRatio>=1.5)evidence.push('量比'+volRatio.toFixed(2));
 const upperRisk=upper>=.44&&closePosition<=.45;
 const heavy=volRatio!==null&&volRatio>=2;
 const closeWeak=closePosition<=.32;
 const failedHigh=high>=Math.max(...highs.slice(-21,-1))&&close<Math.max(...highs.slice(-21,-1))*.985;
 const sellingSignals=[upperRisk,heavy,closeWeak,failedHigh].filter(Boolean).length;
 if(upperRisk)evidence.push('長上影且收近低位');
 if(failedHigh)evidence.push('盤中突破前高但收盤回落');
 if(bias20!==null&&bias20>=12)evidence.push('乖離MA20達'+bias20.toFixed(1)+'%，不追價');
 if(bias20!==null&&bias20<=-12)evidence.push('負乖離MA20達'+bias20.toFixed(1)+'%，不能當成自動反彈');
 const supplyConcern=(upperRisk&&heavy)||(sellingSignals>=3&&heavy);
 if(supplyConcern)return {kind:'supply',reason:'疑似賣壓：放量、長上影與收盤位置等多項訊號共振；不是已證實主力出貨',code,evidence};
 // One sub-MA5 dip does NOT make a sideways stock a confirmed breakdown.
 const high20=Math.max(...highs.slice(-20)),low20=Math.min(...lows.slice(-20));
 const width20=(high20-low20)/Math.max(low20,.001),maSlope=ma20old>0?Math.abs(ma20/ma20old-1):null;
 const directionalTrend=ma60!==null&&close>ma5&&ma5>ma10&&ma10>ma20&&ma20>ma60&&ma5>ma5p&&ma10>=ma10p&&ma20>ma20p&&(vol.adx!==null&&vol.adx>25);
 const consolidation=width20<=.10&&maSlope!==null&&maSlope<=.028&&atrPct!==null&&atrPct<=5.5&&(vol.adx===null||vol.adx<=27||width20<=.045)&&!directionalTrend&&close>=low20*.992&&(!validEvent||close<=neck*1.025);
 // Genuine risk flags stay visible, but flat-range noise is not automatically a danger event.
 if(risky)return {kind:'danger',reason:'有明確風險／結構警戒，取消強勢資格',code,evidence};
 if(consolidation)return {kind:'consolidation',reason:'區間寬度、MA20斜率與Wilder ATR/ADX評估偏向盤整；小跌破短均線不算確認轉弱',code,evidence:[...evidence,`ATR14 ${atrPct.toFixed(2)}%`,`ADX14 ${vol.adx===null?'不足':vol.adx.toFixed(1)}`]};
 const breakdown=close<ma5&&close<ma10&&volRatio!==null&&volRatio>=1.2&&
   ((validEvent&&close<neck*.985&&closes.at(-2)<neck)||(close<Math.min(...lows.slice(-21,-1))*.995));
 if(breakdown)return {kind:'danger',reason:'短均線走弱且放量破前支撐，需防範進一步轉弱',code,evidence};
 // A narrowing / lower-volume higher high may flag divergence, not independently prove distribution.
 const previousMaxClose=Math.max(...closes.slice(-21,-1));
 const divergent=close>previousMaxClose&&volRatio!==null&&volRatio<.65;
 if(divergent)evidence.push('創近20日收盤新高但量低於20日均量65%');
 if(bars.length>=62&&validEvent&&lastTwoStay&&ma60!==null){
  const sorted=close>ma5&&close>ma10&&close>ma20&&close>ma60&&ma5>ma10&&ma10>ma20&&ma20>ma60;
  const rising=ma5>ma5p&&ma5p>=ma5pp&&ma10>=ma10p&&ma10p>=ma10pp&&ma20>=ma20p;
  const eligible=options.liquid!==false&&options.strongApproved!==false&&prevVol20!==null&&prevVol20>=10&&volRatio!==null&&volRatio>=.7&&!divergent&&bias20!==null&&bias20<12;
  if(sorted&&rising&&eligible){
   // Six-MA confirmation must be calculated from >=240 legally dated bars,
   // not from a stale or unaudited externally supplied maAll field.
   const ma120=avg(closes,120),ma240=avg(closes,240),old60=avg(closes,60,closes.length-5);
   const sixAbove=ma240!==null&&ma120!==null&&close>ma120&&close>ma240;
   const stackedSix=sixAbove&&ma60>=ma120&&ma120>=ma240;
   const longSlopes=old60!==null&&ma60>old60&&ma20old!==null&&ma20>ma20old;
   const healthyCandle=upper<.40&&closePosition>=.45;
   if(stackedSix&&longSlopes&&healthyCandle)return {kind:'strong',reason:'已核對240根以上日K，股價站上MA5／10／20／60／120／240，六線多頭排列、均線走揚、價量及K棒通過',code,evidence};
   fourLinePending=true;
   evidence.push('短中期四線偏多，但未完成六線全數站上／排列與風險確認');
  }
 }
 // Reversal observation requires preceding weakening and current price stabilization.
 const falling20=ma20old>0&&ma20p<ma20old*.975;
 const recovered=close>ma5&&close>=ma10&&closes.at(-1)>closes.at(-3)&&lows.at(-1)>=Math.min(...lows.slice(-9,-2));
 if(falling20&&recovered&&volRatio!==null&&volRatio>=.85)return {kind:'reversal',reason:'前期均線走弱後出現止跌與短均線回復；僅為底部反轉觀察，尚未確認',code,evidence};
 if(options.watch===true||(validEvent&&close>neck)||(ma5!==null&&close>=ma5&&close>=ma20))
  return {kind:'watch',reason:fourLinePending?'僅屬短中期轉強觀察；MA120／MA240或六線趨勢條件未通過，不稱確認強勢':divergent?'價量背離觀察：創高但相對量不足，暫不列入確認強勢':bias20!==null&&bias20>=12?'乖離MA20偏大，列觀察不認證追價':validEvent?'頸線附近觀察，尚缺完整價量／均線續強確認':'起漲觀察，尚未取得充分的突破證據',code,evidence};
 return {kind:'neutral',reason:'目前未達確認強勢、盤整、反轉或明確警戒條件',code,evidence};
}
function classify(rows,asOf,optionFn){const kinds=['strong','watch','consolidation','reversal','supply','danger','neutral','unknown'];const counts=Object.fromEntries(kinds.map(x=>[x,0])),results=[];
 for(const r of Array.isArray(rows)?rows:[]){let opts={};try{opts=optionFn?optionFn(r):{}}catch(_){opts={unverified:true}};const x=inspect(r,asOf,opts);counts[x.kind]++;results.push({id:String(r.market||'')+'-'+String(r.code||''),code:String(r.code||''),name:String(r.name||''),market:String(r.market||''),industry:String(r.industry||r.fundamentals?.industry||''),date:String(r.date||''),kind:x.kind,reason:x.reason,evidence:x.evidence||[],row:r});}
 return {total:results.length,counts,rows:results};
}
return {inspect,classify,validDate,volatility};
});
