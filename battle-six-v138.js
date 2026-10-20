/* Chaopan r38: source-locked, six-level research card. NO live quote, NO auto order. */
(function(root){
 'use strict';
 const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
 const positive=v=>num(v)!==null&&num(v)>0;
 const fmt=v=>num(v)===null?'待核對':num(v).toLocaleString('zh-TW',{maximumFractionDigits:2});
 const ticks=p=>p<10?.01:p<50?.05:p<100?.1:p<500?.5:p<1000?1:5;
 // Determine legal tick at the destination, not by the originating price band.
 function snap(p,dir){if(!positive(p))return null;let v=p;for(let i=0;i<7;i++){
   const t=ticks(v),next=(dir==='up'?Math.ceil(p/t-1e-10):Math.floor(p/t+1e-10))*t;
   if(ticks(Math.max(next,.0001))===t)return Math.round(next*100)/100;
   v=next+(dir==='up'?0.0000001:-0.0000001);
 }return null;}
 function checkPrice(p){if(!positive(p))return false;return Math.abs((p/ticks(p))-Math.round(p/ticks(p)))<1e-7;}
 function barsOk(bars,date){if(!Array.isArray(bars)||bars.length<21)return false;let old='';for(const b of bars){
  if(!Array.isArray(b)||b.length<6)return false;
  const [d,o,h,l,c,v]=b,nn=[o,h,l,c,v].map(num);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d))||!Number.isFinite(Date.parse(String(d)+'T00:00:00Z'))||new Date(String(d)+'T00:00:00Z').toISOString().slice(0,10)!==String(d)||d<=old||nn.some(x=>x===null)||nn.some((x,i)=>i<4?x<=0:x<0)||nn[1]<Math.max(nn[0],nn[3])||nn[2]>Math.min(nn[0],nn[3]))return false;
  old=d;
 }return String(bars.at(-1)[0])===String(date);}
 function model(x){
  const r={status:'無法建立完整計畫',reason:[],date:String(x?.date||''),executionWindow:'基準日收盤後計算；下一開市交易日依即時價量觀察，非自動委託',quoteStatus:'盤後研究（非即時）',levels:{buy:null,add:null,profit1:null,profit2:null,trim:null,exit:null,trailing:null},volume:{dailyThreshold:null,base:null,condition:'待核對'},paths:[],verified:false,ruleVersion:'r38-research-v1'};
  if(!x||!barsOk(x.bars,x.date)){r.reason.push('歷史日K不足21根、OHLCV錯誤或日期不一致');return r;}
  const bars=x.bars,bar=bars.at(-1),close=num(bar[4]),vol=num(bar[5]);
  if(!positive(x.close)||Math.abs(close-Number(x.close))>1e-8||!positive(close)){r.reason.push('個股收盤與日K不一致');return r;}
  // Strict as-of rule: evaluate today's closed candle against the PRIOR 20
  // sessions, but formulate tomorrow's volume gate using the latest 20
  // sessions INCLUDING the closed as-of date. Mixing them shifts the next-day
  // threshold and was previously misleading to traders.
  const prev20=bars.slice(-21,-1),signalBase=prev20.reduce((a,b)=>a+Number(b[5]),0)/20;
  const next20=bars.slice(-20),nextBase=next20.reduce((a,b)=>a+Number(b[5]),0)/20;
  r.volume.signalBase=Math.round(signalBase);
  r.volume.signalThreshold=signalBase>0?Math.ceil(signalBase*1.3):null;
  r.volume.base=Math.round(nextBase);
  r.volume.dailyThreshold=nextBase>0?Math.ceil(nextBase*1.3):null;
  r.volume.condition='下一交易日量能觀察：完整交易日成交量≥基準日以前最近20日平均量×1.3；盤中僅預警，收盤才確認';
  const verifiedStocks=['上市','上櫃','TWSE','OTC'].includes(String(x.market))&&x.instrument==='stock';
  const stale=!!x.stale||x.date!==x.snapshotDate;
  r.quoteStatus=stale?'資料日期已過期／未核對，所有價位僅供歷史研究':'當日收盤資料已作基準；下一交易日才核對觸發';
  if(!verifiedStocks)r.reason.push('非一般上市／上櫃股票，交易升降單位不使用本模型');
  if(x.adjusted!==true)r.reason.push('未證明已正確處理除權息／分割，不能認證下單價');
  const neck=num(x.neck),breakout=num(x.breakout),sup=num(x.support),ma5=num(x.ma5),ma10=num(x.ma10),atr=num(x.atr),recentHigh=num(x.recentHigh);
  const buyRaw=positive(breakout)?breakout:positive(neck)?neck*1.002:null;
  const buy=verifiedStocks&&positive(buyRaw)?snap(buyRaw,'up'):null;
  const exit=verifiedStocks&&positive(sup)?snap(sup,'down'):null;
  if(!positive(neck)||!positive(buy)||buy<neck){r.reason.push('缺少原頸線和有效突破價，無法判定首次買點');}
  else r.levels.buy=buy;
  if(!positive(exit)||!positive(buy)||exit>=buy){r.reason.push('缺少有效且低於買點的結構防守價');}
  else {
   const risk=buy-exit,ratio=risk/buy;
   if(ratio<.008||ratio>.08||(positive(atr)&&risk<.4*atr)){r.reason.push('風險距離不合理（研究門檻0.8%～8%或過窄ATR），不得硬給2R／3R');}
   else {
    r.levels.exit=exit;
    r.levels.profit1=snap(buy+2*risk,'up');r.levels.profit2=snap(buy+3*risk,'up');
    const trims=[ma5,ma10].filter(v=>positive(v)&&v>exit&&v<buy).sort((a,b)=>b-a);
    if(trims.length){const t=snap(trims[0],'down');if(t>exit&&t<buy)r.levels.trim=t;}
    if(r.levels.trim===null)r.reason.push('沒有位於結構出場價與買點間、可核對的減碼線');
   }
  }
  // Unheld / missing cost must NEVER present add as a confirmed price.
  if(x.held===true){
   const cost=num(x.cost),initial=num(x.initialStop),trail=num(x.trailing);
   if(!positive(cost)){r.reason.push('已持股缺均價，加碼與獲利保護待確認');}
   else {
    if(positive(trail)&&verifiedStocks){r.levels.trailing=snap(trail,'down');}
    if(positive(initial)&&initial<cost&&positive(trail)&&trail>=cost){r.reason.push('移動停利已高於成本，屬保護既有獲利，不得誤認無效');}
    if(close>cost&&x.baseFormed===true&&x.marketVerified===true&&x.riskBudgetOk===true&&x.candleVerified===true&&positive(recentHigh)&&positive(buy)){
     const add=snap(Math.max(recentHigh*1.003,buy*1.005),'up');
     if(add>buy&&(!positive(r.levels.profit1)||add<r.levels.profit1))r.levels.add=add;
    }
    if(r.levels.add===null)r.reason.push('尚未同時符合已有浮盈、重新整理突破、大盤及加碼風險條件');
   }
  }else r.reason.push('未持股，不提供加碼價；須先確認有實際持股與成本');
  if(positive(buy)&&positive(r.levels.exit)&&positive(r.levels.trim)&&positive(r.levels.profit1)&&positive(r.levels.profit2)&&r.levels.exit<r.levels.trim&&r.levels.trim<buy&&buy<r.levels.profit1&&r.levels.profit1<r.levels.profit2){r.status='完整五價位研究（加碼另行驗證）';}
  else r.status='部分價位待核對';
  if(x.date!==x.snapshotDate||x.stale)r.reason.push('資料交易日不一致或已過期；不能當成下一交易日新委託依據');
  if(x.marketVerified!==true)r.reason.push('加權／櫃買與市場廣度未認證，不給新買入結論');
  if(x.ma240Verified!==true)r.reason.push('MA240 未認證，不能宣稱六線強勢');
  const open=num(bar[1]),high=num(bar[2]),low=num(bar[3]);
  const strongCandle=open!==null&&high!==null&&low!==null&&high>low&&close>open&&(close-low)/(high-low)>=0.65&&(high-close)/(high-low)<=0.35;
  const fullVolume=signalBase>0&&vol!==null&&vol>=Math.ceil(signalBase*1.3);
  const triggered=positive(r.levels.buy)&&close>=r.levels.buy;
  r.verified=Boolean(!stale&&verifiedStocks&&x.adjusted===true&&x.marketVerified===true&&x.volumeVerified===true&&x.candleVerified===true&&x.ma240Verified===true&&fullVolume&&strongCandle&&triggered&&r.status==='完整五價位研究（加碼另行驗證）');
  if(!fullVolume)r.reason.push('當日全日量未達第一根研究門檻，不能認證突破');
  if(!strongCandle)r.reason.push('收盤K棒不是有效放量紅K，不能認證首破');
  if(!triggered)r.reason.push('尚未收盤站上有效突破參考價');
  const vtxt=r.volume.dailyThreshold===null?'最新20日量能待核對':`下一交易日完整日量約 ${fmt(r.volume.dailyThreshold)} 張以上（研究門檻）`;
  r.paths=[
    {label:'續強路徑',tone:'up',condition:`有效收盤突破 ${fmt(r.levels.buy)} 元，${vtxt}，收在K棒上緣；加權／櫃買趨勢與上漲廣度配合`,invalid:'收盤跌回原頸線或突破量價品質失效'},
    {label:'盤整路徑',tone:'flat',condition:`回測 MA5 ${fmt(ma5)}／MA10 ${fmt(ma10)} 附近，量縮且守穩有效支撐`,invalid:'回測放量收低、低點持續下移'},
    {label:'轉弱路徑',tone:'down',condition:`跌破結構參考 ${fmt(r.levels.exit)} 元且無法收復，或高檔放量長上影後再次轉弱`,invalid:'重新站回關鍵壓力並確認量價改善'}
  ];
  // If levels are absent, do not pretend to have exact future triggers.
  if(r.levels.buy===null)r.paths[0].condition='有效頸線與突破價未確認：僅追蹤價格結構，不設虛構突破觸發價';
  if(r.levels.exit===null)r.paths[2].condition='有效結構出場價待核對：暫不給固定停損價；持股風險須另設可核對的防守線';
  return r;
 }
 function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function render(r,opts={}){
  if(!r)return '<p>資料尚未載入</p>';
  const fields=[['首次買點','buy','下一交易日條件價，非成交價'],['再突破加碼','add','下一交易日須持股有浮盈'],['第一階段獲利（2R）','profit1','非預測目標'],['第二階段獲利（3R）','profit2','非預測目標'],['減碼價','trim','均線／量價確認'],['結構出場價','exit','先定風險線']];
  const cell=([lab,k,note])=>`<div class="six-cell"><small>${lab}</small><b>${r.levels[k]===null?'待核對':fmt(r.levels[k])+' 元'}</b><em>${note}</em></div>`;
  const reasons=r.reason.slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('');
  const section=`<section class="six-battle" aria-label="六價位作戰計畫"><div class="six-heading"><b>六大操作價位</b><small>基準日 ${esc(r.date)} 收盤｜下個交易日執行條件</small></div><div class="six-status">${esc(r.quoteStatus)} · ${esc(r.status)} · ${r.verified?'基準日技術訊號已驗證，下一交易日仍須再查價量':'資料及交易條件未全部認證；所有數字只能作隔日觀察，不能直接委託'}</div><div class="six-grid">${fields.map(cell).join('')}</div><p class="six-vol">${esc(r.volume.condition)}：${r.volume.dailyThreshold===null?'待核對':fmt(r.volume.dailyThreshold)+' 張'}（${esc(r.date)} 收盤時計算）</p>${reasons?`<details><summary>價位尚待驗證的原因</summary><ul>${reasons}</ul></details>`:''}</section>`;
  if(opts.compact)return section;
  const roads=`<section class="six-paths" aria-label="未來三情境走勢"><b>未來三種可能路徑（條件情境，非必然預測）</b><svg viewBox="0 0 320 88" role="img" aria-label="續強向上、盤整橫向、轉弱向下的條件路徑示意"><path d="M6 42 H112" stroke="#a9c0cb" stroke-width="2" fill="none"/><path d="M112 42 C168 40 192 13 312 7" stroke="#60d9ba" stroke-width="2.8" stroke-dasharray="6 5" fill="none"/><path d="M112 42 C166 44 240 40 312 44" stroke="#e8be68" stroke-width="2.8" stroke-dasharray="6 5" fill="none"/><path d="M112 42 C176 48 225 78 312 81" stroke="#ea8491" stroke-width="2.8" stroke-dasharray="6 5" fill="none"/></svg>${r.paths.map(p=>`<details class="six-path-${p.tone}"><summary>${esc(p.label)}｜點開看觸發與失效</summary><p>${esc(p.condition)}</p><small>失效條件：${esc(p.invalid)}</small></details>`).join('')}</section>`;
  return section+roads;
 }
 root.ChaopanBattleSixV138={model,render,snap,checkPrice,barsOk};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.ChaopanBattleSixV138;
})(typeof globalThis!=='undefined'?globalThis:this);
