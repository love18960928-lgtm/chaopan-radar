/* 超盤手 V3.0.7：盤中依「已完成日K＋使用者手動輸入」評估突破、回測與轉弱。
   無即時行情；試算均線是假設目前價=當日收盤，絕不能作為正式收盤訊號。 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ChaopanRegimeV307=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
  const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  const round=x=>x===null?null:Math.round(x*100)/100;
  function assess({bars=[],asOf=null,open=null,current=null,high=null,low=null,volume=null,volumeTarget=null,trendKind=null}={}){
    const valid=bars.filter(b=>Array.isArray(b)&&b.length>=6&&num(b[2])!==null&&num(b[3])!==null&&num(b[4])>0&&num(b[5])!==null);
    const last=valid.at(-1),now=num(current),o=num(open),hi=num(high),lo=num(low),v=num(volume);
    if(valid.length<22||!last||String(last[0])!==String(asOf||last[0])||now===null||o===null||hi===null||lo===null||v===null){
      return {mode:'unavailable',title:'缺少足夠歷史資料｜先核對行情',reason:'需要至少22根有效日K，以及與資料日相符的前一日收盤紀錄；不補造均線。'};
    }
    if(now<=0||o<=0||lo<=0||hi<lo||o>hi||o<lo||now>hi||now<lo||v<0){
      return {mode:'invalid',title:'價量輸入有矛盾｜暫停判斷',reason:'請檢查當日開高低、現價與成交張數。'};
    }
    const close=valid.map(b=>Number(b[4])), highs=valid.map(b=>Number(b[2]));
    const realSma=n=>mean(close.slice(-n));
    // 前日的最後 n-1 個完整收盤，加上人工輸入的現價，試算「若現在收盤」的日線。
    const projected=n=>mean([...close.slice(-(n-1)),now]);
    const ma5=projected(5),ma10=projected(10),ma20=projected(20),ma5Prev=realSma(5),ma10Prev=realSma(10),ma20Prev=realSma(20);
    const ma20Old=mean(close.slice(-21,-1));
    const hi15=Math.max(...highs.slice(-15));
    const climb=hi15/Math.min(...close.slice(-20))*100-100;
    const trend=ma5Prev>ma10Prev&&ma10Prev>ma20Prev&&ma20Prev>=ma20Old*.995;
    // A very large and recent advance is also an established trend even if yesterday slipped below MA5.
    const strongHistory=(trend&&climb>=12)||(['trend','pullback','consolidation'].includes(trendKind)&&climb>=10);
    const declinePct=100*(hi15-now)/hi15;
    const gap20=100*(now/ma20-1),gap5=100*(now/ma5-1);
    const timeVol=num(volumeTarget),volumeReached=timeVol!==null&&timeVol>0&&v>=timeVol;
    const strongRed=now>o && (hi===lo||(now-lo)/(hi-lo)>=.7);
    const highToLow=(hi-lo)/o*100;
    const dayVolAvg=mean(valid.slice(-20).map(b=>Number(b[5])));
    const relVol=dayVolAvg>0?v/dayVolAvg:null;
    const level={ma5:round(ma5),ma10:round(ma10),ma20:round(ma20),peak:round(hi15)};
    const context={...level,asOf:String(asOf||last[0]),projected:true,previousClose:close.at(-1),declinePct:round(declinePct),recentRisePct:round(climb),dayVolumeRatio:round(relVol),strongHistory,levelLabel:'以現價假設收盤的試算均線（盤中會變）'};
    const flags=[];
    if(now<ma5)flags.push('目前在試算5日線下方');
    if(now<ma10)flags.push('目前在試算10日線下方');
    if(now<ma20)flags.push('目前在試算20日線下方');
    if(now<o)flags.push('目前不是紅K');
    if(hi>lo&&(now-lo)/(hi-lo)<.3)flags.push('股價靠近當日低點');
    if(relVol!==null&&relVol>=1.2&&now<o)flags.push('放量下跌警戒（以日均量參考）');
    if(!strongHistory){return {...context,mode:'breakout',title:'仍以近期頸線突破為主要觀察',reason:'尚未找到足夠的既有多頭趨勢證據，不能把一般弱勢反彈誤列為健康回測。',checks:flags};}
    if(now<ma20*.99){
      return {...context,mode:'weak',title:'🔴 多頭結構轉弱｜先看20日線',reason:'已明顯低於試算20日線；前波強勢不代表現在仍是健康整理。',next:`先確認能否重新站回 ${level.ma20.toFixed(2)} 元附近；沒有重新站穩前不把反彈當起漲。`,checks:flags};
    }
    if(now<ma10*.995){
      return {...context,mode:'risk',title:'🔴 回測失守10日線｜轉弱警戒',reason:'股價跌至試算10日線下方，近期回檔可能擴大，不能直接稱為量縮整理。',next:`先核對10日線 ${level.ma10.toFixed(2)} 元能否收復；若再靠近20日線 ${level.ma20.toFixed(2)} 元，須提高警戒。`,checks:flags};
    }
    if(now<ma5){
      const fragile=now<o&&(hi===lo||((now-lo)/(hi-lo)<.35))&&(relVol===null||relVol>=.9);
      return {...context,mode:fragile?'pullback-risk':'pullback',title:fragile?'🟠 回測10日線｜還沒止跌':'🟠 強勢回測｜觀察是否形成盤整',reason:fragile?'股價已在試算5日線下方、接近10日線，且當日偏弱；目前不符合健康量縮盤整的確認條件。':'雖然在試算5日線下方，但目前仍守住試算10日與20日線；可能開始整理，仍需後續收盤確認。',next:`先看 ${level.ma10.toFixed(2)} 元附近能否守住；再觀察是否重新站上5日線約 ${level.ma5.toFixed(2)} 元。`,checks:flags};
    }
    if(now>=ma5&&now>=ma10&&now>=ma20){
      if(now>ma5*1.08){return {...context,mode:'extended',title:'🟠 沿均線上漲，但偏離5日線過遠',reason:'仍在試算5、10、20日線上方，但價格偏離5日線超過8%，不等於此刻適合追價。',next:`優先觀察回測5日線約 ${level.ma5.toFixed(2)} 元時是否守住。`,checks:flags};}
      if(!strongRed && highToLow>4){return {...context,mode:'consolidation',title:'🟠 仍在多頭均線上方｜高檔震盪待確認',reason:'均線排列尚可，但當日K棒強度不足，暫不能當成新一波起漲。',next:`觀察是否守住5日線約 ${level.ma5.toFixed(2)} 元、低點是否逐漸抬高。`,checks:flags};}
      return {...context,mode:'continuation',title:'🟢 多頭仍在｜沿5日線續強候選',reason:'現價高於試算5、10、20日線，且既有日K具多頭趨勢；仍須觀察收盤。',next:`若之後回到5日線約 ${level.ma5.toFixed(2)} 元，觀察守穩及是否放量跌破。`,checks:flags};
    }
    return {...context,mode:'caution',title:'🟠 均線交錯｜暫不視為持續強勢',reason:'股價與試算均線關係不完整，尚不足以判斷健康整理或續強。',next:'等收盤資料更新後再評估均線與頸線。',checks:flags};
  }
  return {assess};
});
