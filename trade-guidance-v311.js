/* 超盤手 V3.1.1-r11｜以同日OHLCV驗證的買進、減碼、移動停利參考。
   沒有券商即時報價，也不會替使用者下單或預測隔日必漲。 */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanGuidance=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const avg=(a,n)=>a.length>=n?a.slice(-n).reduce((s,v)=>s+v,0)/n:null;
const fmt=x=>x===null?'資料不足':Number(x).toLocaleString('zh-TW',{maximumFractionDigits:2});
// r11: assess as-of structure separately from one-day candle colour.
// Never relabel a prior neckline recross as a fresh first breakout.
function trendStructure(bars,sequence={},cycle={},continuation={}){
 const out={kind:'unverified',label:'走勢資料不足',reasons:[],anchor:null,anchorDate:null,
   falseBreak:false,ma5Slope:null,ma10Slope:null,ma20Slope:null,swing:'待資料'};
 if(!Array.isArray(bars)||bars.length<25)return out;
 const a=bars.map(b=>Array.isArray(b)&&b.length>=6?b.map((x,i)=>i===0?String(x):num(x)):null);
 if(a.some(b=>!b||b.slice(1).some(v=>v===null)||b[1]<=0||b[2]<Math.max(b[1],b[4],b[3])||b[3]>Math.min(b[1],b[4],b[2])||b[4]<=0||b[5]<0))return out;
 const cls=a.map(b=>b[4]),size=a.length,avgAt=(n,end)=>end>=n?cls.slice(end-n,end).reduce((x,v)=>x+v,0)/n:null;
 const m5=avgAt(5,size),m10=avgAt(10,size),m20=avgAt(20,size);
 const old5=avgAt(5,size-3),old10=avgAt(10,size-3),old20=avgAt(20,size-3);
 const slope=(v,prev)=>prev&&prev>0?100*(v/prev-1):null;
 out.ma5Slope=slope(m5,old5);out.ma10Slope=slope(m10,old10);out.ma20Slope=slope(m20,old20);
 const highNow=Math.max(...a.slice(-5).map(b=>b[2])),highBefore=Math.max(...a.slice(-10,-5).map(b=>b[2]));
 const lowNow=Math.min(...a.slice(-5).map(b=>b[3])),lowBefore=Math.min(...a.slice(-10,-5).map(b=>b[3]));
 out.swing=highNow>highBefore&&lowNow>lowBefore?'高低點墊高':highNow<highBefore&&lowNow<lowBefore?'高低點下降':'高低點交錯';
 const close=cls.at(-1),prev=cls.at(-2),today=a.at(-1),tr=avgAt(5,size),vol20=a.slice(-21,-1).reduce((x,b)=>x+b[5],0)/20;
 const loc=today[2]>today[3]?(close-today[3])/(today[2]-today[3]):.5;
 const sellPressure=vol20>0&&today[5]>=vol20*1.65&&close<today[1]&&loc<.38;
 const anchorCandidates=[
   [sequence?.level,sequence?.initialDate],
   [cycle?.level,cycle?.initialDate],
   [continuation?.originalNeckline,continuation?.breakoutDate]
 ].filter(([level,date])=>num(level)!==null&&num(level)>0&&typeof date==='string'&&a.some(b=>b[0]===date));
 if(anchorCandidates.length){const [level,date]=anchorCandidates[0];out.anchor=Number(level);out.anchorDate=date;
  const ix=a.findIndex(b=>b[0]===date);
  const after=a.slice(ix);
  const hasCrossed=after.some(b=>b[4]>out.anchor*1.001);
  // Restrict to an observed breach of the SAME dated resistance, not a rolling 20-day maximum.
  // If today has fallen back below and there was a prior verified closing break, warn.
  out.falseBreak=hasCrossed&&close<out.anchor*.998;
 }
 if(out.falseBreak){out.kind='failed';out.label='原頸線失守／假突破警戒';out.reasons.push('歷史原頸線已突破後重新跌回');return out;}
 if(close<m20&&out.ma10Slope<0&&out.ma20Slope<0){out.kind='weak';out.label='中期趨勢轉弱';out.reasons.push('收盤低於MA20且MA10／20下降');return out;}
 if(close<m10&&out.ma5Slope<0&&out.ma10Slope<0){out.kind='weak';out.label='短線均線轉弱';out.reasons.push('MA5／MA10下降且收盤低於MA10');return out;}
 if(sellPressure){out.kind='risk';out.label='高檔放量收低警戒';out.reasons.push('放量且收在日K下緣，不能直接推定出貨');return out;}
 const aligned=m5>m10&&m10>m20;
 const rising=out.ma5Slope>0&&out.ma10Slope>0&&out.ma20Slope>=0;
 if(close>m5&&aligned&&rising&&out.swing==='高低點墊高'){
  out.kind=out.anchor!==null?'trend':'bullish-unanchored';
  out.label=out.anchor!==null?'主升段續強':'短線多頭／突破來源待核對';
  out.reasons.push('均線正排列且上升，近期高低點墊高');return out;
 }
 if(close>=m10&&close>=m20&&out.ma10Slope>=0&&out.ma20Slope>=0){
  out.kind='range';out.label='頸線上方整理／等待續強';out.reasons.push('未同時確認上升排列與高低點墊高');return out;
 }
 if(close>=m20&&out.ma20Slope>=0){out.kind='pullback';out.label='回測MA10／MA20觀察';out.reasons.push('尚守中期均線，但短線續強不足');return out;}
 out.kind='range';out.label='方向未確認／區間震盪';out.reasons.push('沒有足夠的趨勢續強證據');return out;
}

function evaluate(row,plan,supports=[]){
 const result={level:'unknown',title:'資料不足',stage:'突破階段未驗證',buy:'等待完整交易日、日K與價量證據。',hold:'資料不足，先核對歷史支撐。',
   trim:'尚無可靠減碼訊號。',sell:'尚無可靠失守證據。',sellLevel:null,support:null,volume:null,close:null,ma5:null,ma10:null,breakoutLevel:null,pullbackZone:null,
   trailingStop:null,holdText:'未取得逐日守線證據',trendKind:'unverified',trendReasons:[],anchorDate:null};
 const bars=row?.bars||[];
 if(bars.length<21||!plan||row?.date!==bars.at(-1)?.[0])return result;
 const safe=bars.every(b=>Array.isArray(b)&&b.length>=6&&num(b[1])!==null&&num(b[2])!==null&&num(b[3])!==null&&num(b[4])!==null&&num(b[5])!==null&&num(b[4])>0&&num(b[5])>=0&&num(b[2])>=Math.max(num(b[1]),num(b[3]),num(b[4]))&&num(b[3])<=Math.min(num(b[1]),num(b[2]),num(b[4])));
 if(!safe)return result;
 const last=bars.at(-1),prev=bars.at(-2),c=num(last[4]),p=num(prev[4]);
 if(c===null||c<=0||p===null||p<=0)return result;
 const closeList=bars.map(b=>Number(b[4])),ma5=avg(closeList,5),ma10=avg(closeList,10),ma20=avg(closeList,20);
 const priorHigh=Math.max(...bars.slice(-21,-1).map(b=>Number(b[2])));
 const trigger=num(plan.trigger);
 const breakoutLevel=trigger!==null&&trigger>0?Math.max(trigger,priorHigh):priorHigh;
 const lowCandidates=[];
 for(const s of supports){const lo=num(s?.lower);if(lo!==null&&lo>0&&lo<=c*1.25)lowCandidates.push(lo);}
 const defense=row?.structureV23?.mainDefense;
 const defensePrice=num(defense?.lower??defense?.price);
 if(defensePrice!==null&&defensePrice>0&&defensePrice<=c*1.25)lowCandidates.push(defensePrice);
 const support=lowCandidates.filter(x=>x<=c*1.025).sort((a,b)=>b-a)[0]??null;
 const lostSupport=lowCandidates.some(x=>x>c*1.015);
 const hold=row?.continuationContext||{};
 const validTrailing=num(hold.trailingStop);
 // A previously certified running peak minus a fixed-episode ATR rule
 // is non-decreasing across historical bars. Never invent it from 21 bars.
 const trailingStop=validTrailing!==null&&validTrailing>0?validTrailing:null;
 const rangeTop=c>0&&ma5!==null?[+(ma5*.995).toFixed(2),+(ma5*1.008).toFixed(2)]:null;
 const loc=Number(last[2])>Number(last[3])?(c-Number(last[3]))/(Number(last[2])-Number(last[3])):.5;
 const vol20=avg(bars.slice(-21,-1).map(x=>Number(x[5])),20);
 const heavy=vol20!==null&&vol20>0&&Number(last[5])>=1.65*vol20;
 const bearish=heavy&&c<Number(last[1])&&loc<.38;
 const lost5=ma5!==null&&c<ma5;
 const lost10=ma10!==null&&c<ma10;
 const lost20=ma20!==null&&c<ma20;
 const twoLost10=lost10&&p<avg(closeList.slice(0,-1),10);
 const regime=trendStructure(bars,row?.breakoutSequence,row?.cycle,row?.continuationContext);
 const failedBreakout=regime.falseBreak;
 result.trendKind=regime.kind;result.trendReasons=regime.reasons;result.anchorDate=regime.anchorDate;
 // Keep current resistance as a *future* trigger, not as the historic failed-break anchor.
 const historicLevel=regime.anchor;

 const stage=String(row?.breakoutSequence?.stage||row?.breakoutSequence?.phase||plan?.stage||'未核對');
 const phaseNames={first:'突破第一根',second:'突破第二根',third:'突破第三根',ready:'頸線預備',reclaim:'舊頸線重新站回',continuation:'歷史突破後續強'};
 result.stage=phaseNames[stage]||(hold.breakoutDate&&Number.isFinite(Number(hold.daysSinceBreakout))?`歷史突破 ${hold.breakoutDate} 後 ${Number(hold.daysSinceBreakout)} 個交易日（${hold.source||'來源待核對'}）`:'歷史突破狀態待逐日驗證');
 result.close=c;result.ma5=ma5;result.ma10=ma10;result.breakoutLevel=breakoutLevel;result.historicLevel=historicLevel;
 result.pullbackZone=rangeTop;result.trailingStop=trailingStop;result.support=support;
 result.sellLevel=support??ma10??null;result.volume=num(plan.breakoutVolNeed);
 if(hold.strictMA510Hold===true)result.holdText=`自 ${hold.breakoutDate||'突破日起'} 全程收盤守住MA5／10（${hold.source||'來源待核對'}）`;
 else if(hold.recentCloseHold10===true)result.holdText='最近10個交易日收盤守住MA5／MA10，非歷史全程守線';
 else if(hold.recentCloseHold5===true)result.holdText='最近5個交易日收盤守住MA5／MA10，非歷史全程守線';
 else if(hold.strictMA510Hold===false)result.holdText='歷史突破後曾收盤跌破MA5／10';
 else result.holdText='尚無已核對歷史沿線追蹤';
 result.buy=`等待接近MA5（${fmt(ma5)}元）止跌後再確認回升量價；或價量站穩近期高點 ${fmt(breakoutLevel)} 元。盤中觸價僅預警，收盤才確認。`;
 result.trim=`若接近 ${fmt(breakoutLevel)} 元出現放量上影／突破後跌回，考慮分批停利；收盤跌破MA5（${fmt(ma5)}元）提高減碼警戒。`;
 result.sell=`若收盤有效跌破MA10（${fmt(ma10)}元）且無法恢復，重新評估續抱；${support===null?'主要結構支撐尚未核對':`下一道歷史支撐 ${fmt(support)} 元`}。`;
 if(trailingStop!==null)result.sell+=` 依歷史突破段逐日回算的2ATR移動停利參考為 ${fmt(trailingStop)} 元（不會隨波動擴大而下移）。`;
 if(failedBreakout){
  result.level='danger';result.title='跌回原頸線・假突破警戒';
  result.sell=`已重新跌回 ${fmt(historicLevel)} 元原頸線（${regime.anchorDate}錨定）；須評估失守風險，不能把重新站回當首次突破。`;
 }else if(lostSupport||twoLost10||bearish&&lost20||trailingStop!==null&&c<trailingStop){
  result.level='danger';result.title='防守失守・出場警戒';
  result.sell='已出現歷史支撐、MA10連續失守或經核對移動停利線觸發；先評估減碼／出場，不保證次日成交價。'+(trailingStop!==null?` 移動停利參考 ${fmt(trailingStop)} 元。`:'');
 }else if(lost5||bearish||lost10||['weak','risk'].includes(regime.kind)){
  result.level='warn';result.title=regime.label==='走勢資料不足'?'轉弱・減碼警戒':regime.label;
 }else if(regime.kind==='trend'){
  result.level='good';result.title='主升段續強・等待合理買點';
 }else if(regime.kind==='bullish-unanchored'){
  result.level='warn';result.title='短線偏強・頸線待核對';
 }else if(regime.kind==='pullback'){
  result.level='warn';result.title='回測整理・等待止跌';
 }else{
  result.level='warn';result.title=regime.kind==='range'?regime.label:'趨勢尚未驗證';
 }
 return result;
}
return {evaluate,trendStructure};
});
