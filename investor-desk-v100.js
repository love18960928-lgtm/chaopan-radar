/* 超盤手 RADAR r44.5 — investor-first EOD summary. No price guesses, no trading guarantees.
   The dashboard is advisory UI; all calculations are based on same-day confirmed snapshots.
*/
(function(root,factory){'use strict';const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ChaopanInvestorV100=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&Number.isFinite(Number(v))?Number(v):null;
 const isDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const money=n=>num(n)===null?'待核對':Number(n).toLocaleString('zh-TW',{maximumFractionDigits:2});
 const DANGER=/觸及防守|連兩日失守|結構高風險/;
 function inspect(args,now=new Date()){
  const {radar,universe,intel,mode,holdings,review,tomorrow}=args||{};
  const asOf=radar?.asOf||'',rows=universe?.rows;
  const verified=mode==='live'&&isDate(asOf)&&universe?.asOf===asOf&&Array.isArray(rows)&&rows.length>0&&rows.every(r=>r?.date===asOf);
  const ds=root.ChaopanMarketRegime?.dateStatus?.(radar,intel,now);
  const dateAlert=!ds||Boolean(ds.alert)||!isDate(asOf);
  const full=verified&&!dateAlert;
  const sourceMatch=Boolean(intel?.asOf===asOf);
  const indexOK=sourceMatch&&['taiex','otc'].every(k=>root.ChaopanMarketRegime?.checkedIndex?.(intel.indices?.[k],asOf));
  const samples=Array.isArray(holdings)?holdings:[];
  const byCode=new Map();
  if(verified)for(const r of rows){const key=String(r?.code||'');if(!key)continue;const candidates=byCode.get(key)||[];candidates.push(r);byCode.set(key,candidates)}
  const actions=samples.map(h=>{
   const found=byCode.get(String(h.code))||[];
   // During a listing transfer the same ticker may exist in both historical markets.
   // Do not silently choose an arbitrary venue or compute a false P&L.
   const row=found.length===1?found[0]:null;
   const last=Array.isArray(row?.bars)?row.bars.at(-1):null;
   const priceMatched=Boolean(row&&last?.[0]===asOf&&num(last?.[4])!==null&&num(row.close)!==null&&Math.abs(Number(row.close)-Number(last[4]))<.005001);
   if(!full||!row||!priceMatched||typeof review!=='function')return {code:String(h.code),status:'價格／日期待核對',danger:false,verified:false};
   const result=review(h,row,asOf);
   if(!result?.matched)return {code:String(h.code),status:'買入日或行情待核對',danger:false,verified:false};
   const status=String(result.stage||'正常持股研究');
   return {code:String(h.code),status,danger:DANGER.test(status),verified:true};
  });
  const urgent=actions.filter(x=>x.danger);
  const unknown=actions.filter(x=>!x.verified);
  const picks=full&&tomorrow?.asOf===asOf&&Array.isArray(tomorrow.candidates)?tomorrow.candidates:[];
  const universeCount=verified?rows.length:null;
  const invalidPick=Boolean(picks.some(p=>p?.row?.date!==asOf||p?.eligible!==true||!num(p?.score)));
  const freshPicks=invalidPick?[]:picks;
  let notice='資料尚未完整核對，請勿以此畫面決定今天的買賣。';
  if(verified&&dateAlert)notice=`${ds?.label||'行情日期待核對'}。保留歷史研究，不產生今日買進資格。`;
  else if(full&&unknown.length)notice=`${unknown.length} 筆持股缺少可核對的最新成本／價格條件，不能以舊價計算今日損益。`;
  else if(full&&urgent.length)notice=`${urgent.length} 筆持股出現歷史盤後防守／結構警示；先查原始關卡、成本與最新報價，避免把警示當即時賣單。`;
  else if(full)notice='資料日可核對；買點還要查市場、族群、頸線、流動性與成交價格，沒有經驗證勝率不宣稱明天一定上漲。';
  return {asOf,verified,full,dateAlert,sourceMatch,indexOK,universeCount,
   holdings:actions,urgent,unknown,qualified:freshPicks.length,prepAvailable:full&&!invalidPick&&tomorrow?.asOf===asOf&&Array.isArray(tomorrow.candidates),
   notice,dayStatus:ds?.label||'資料日期待核對',riskCount:urgent.length};
 }
 function markup(d){
  const hlabel=d.holdings.length?d.urgent.length?`${d.urgent.length} 筆風險優先`:d.unknown.length?`${d.unknown.length} 筆待核對`:`${d.holdings.length} 筆追蹤中`:'尚未建立持股';
  const tlabel=d.prepAvailable?`${d.qualified} 檔觀察`:'待完整資料';
  const date=d.verified?esc(d.asOf):'未完整驗證';
  return `<div class="r45-tiles">
   <div class="r45-tile"><small>個股收盤日</small><strong>${date}</strong><div class="r45-subtitle">${d.full?'快照交易日一致':'日期／內容待核對'}</div></div>
   <div class="r45-tile"><small>持股防守</small><strong>${esc(hlabel)}</strong><div class="r45-subtitle">只看原始持股計畫</div></div>
   <div class="r45-tile"><small>明日預備</small><strong>${esc(tlabel)}</strong><div class="r45-subtitle">非買點、非勝率</div></div>
  </div><div class="r45-message ${d.dateAlert||d.urgent.length||d.unknown.length?'r45-attention':''}">${esc(d.notice)}</div>
  <div class="r45-actions"><button type="button" data-r45-action="holdings">檢查我的持股</button><button type="button" data-r45-action="tomorrow">查看明日觀察</button></div>
  ${d.urgent.length||d.unknown.length?`<details><summary>展開持股警示與待查項目</summary><ul class="r45-warning-list">${d.holdings.filter(x=>x.danger||!x.verified).slice(0,8).map(x=>`<li>${esc(x.code)}｜${esc(x.status)}</li>`).join('')}</ul></details>`:''}
  <div class="r45-subtitle" style="margin-top:8px">加權／櫃買收盤同日資料：${d.indexOK?'可供同日比較（不代表趨勢認證）':'未完整核對，不強行顯示紅綠燈或支撐價'}。收錄總數與可運算樣本數不同，不混稱全市場認證。</div>`;
 }
 let latestArgs=null,latestActions={};
 if(typeof document!=='undefined')document.addEventListener('chaopan-portfolio-changed',()=>{if(latestArgs){mount({...latestArgs,holdings:root.ChaopanPortfolioR140?.load?.()||[]},latestActions);}});
 function mount(args,actions={}){
  latestArgs=args;latestActions=actions;
  const rootEl=typeof document==='undefined'?null:document.querySelector('#r45InvestorContent');if(!rootEl)return;
  const d=inspect(args);rootEl.innerHTML=markup(d);
  rootEl.querySelector('[data-r45-action="holdings"]')?.addEventListener('click',()=>{
   if(typeof actions.onPortfolio==='function')actions.onPortfolio();else document.querySelector('.nav-item[data-page="star"]')?.click();
  });
  rootEl.querySelector('[data-r45-action="tomorrow"]')?.addEventListener('click',()=>{
   if(typeof actions.onTomorrow==='function')actions.onTomorrow();else {const fold=document.querySelector('#deskDisclosure');if(fold)fold.open=true;fold?.scrollIntoView({behavior:'smooth',block:'start'});}
  });
  return d;
 }
 return {inspect,mount,markup};
});
