/* 超盤手 V3.1.1-r6｜以同日OHLCV驗證的買進、減碼、移動停利參考。
   沒有券商即時報價，也不會替使用者下單或預測隔日必漲。 */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanGuidance=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const avg=(a,n)=>a.length>=n?a.slice(-n).reduce((s,v)=>s+v,0)/n:null;
const fmt=x=>x===null?'資料不足':Number(x).toLocaleString('zh-TW',{maximumFractionDigits:2});
function evaluate(row,plan,supports=[]){
 const result={level:'unknown',title:'資料不足',stage:'突破階段未驗證',buy:'等待完整交易日、日K與價量證據。',hold:'資料不足，先核對歷史支撐。',
   trim:'尚無可靠減碼訊號。',sell:'尚無可靠失守證據。',sellLevel:null,support:null,volume:null,close:null,ma5:null,ma10:null,breakoutLevel:null,pullbackZone:null,
   trailingStop:null,holdText:'未取得逐日守線證據'};
 const bars=row?.bars||[];
 if(bars.length<21||!plan||row?.date!==bars.at(-1)?.[0])return result;
 const safe=bars.every(b=>Array.isArray(b)&&b.length>=6&&num(b[1])!==null&&num(b[2])!==null&&num(b[3])!==null&&num(b[4])!==null&&num(b[5])!==null);
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
 const failedBreakout=Number(row?.close)<breakoutLevel&&Number(prev[4])>breakoutLevel;
 const stage=String(row?.breakoutSequence?.stage||row?.breakoutSequence?.phase||plan?.stage||'未核對');
 const phaseNames={first:'突破第一根',second:'突破第二根',third:'突破第三根',ready:'頸線預備',reclaim:'舊頸線重新站回',continuation:'歷史突破後續強'};
 result.stage=phaseNames[stage]||(hold.breakoutDate&&Number.isFinite(Number(hold.daysSinceBreakout))?`歷史突破 ${hold.breakoutDate} 後 ${Number(hold.daysSinceBreakout)} 個交易日（${hold.source||'來源待核對'}）`:'歷史突破狀態待逐日驗證');
 result.close=c;result.ma5=ma5;result.ma10=ma10;result.breakoutLevel=breakoutLevel;
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
 if(lostSupport||twoLost10||bearish&&lost20||trailingStop!==null&&c<trailingStop){
  result.level='danger';result.title='防守失守・出場警戒';
  result.sell='已出現歷史支撐、MA10連續失守或經核對移動停利線觸發；先評估減碼／出場，不保證次日成交價。'+(trailingStop!==null?` 移動停利參考 ${fmt(trailingStop)} 元。`:'');
 }else if(lost5||bearish||failedBreakout||lost10){
  result.level='warn';result.title='轉弱・減碼警戒';
 }else{
  result.level='good';result.title='趨勢守穩・等待買點確認';
 }
 return result;
}
return {evaluate};
});
