'use strict';
const $ = s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const state={r41Page:'card',r41Advanced:null,payload:null,mode:'empty',tab:'all',query:'',market:'all',sector:'all',sort:'score',confirmed:false,limitMin:false,visible:30,watch:new Set(),detail:null,chartDays:60,marketIntel:null,universe:null,detailIds:[],detailHistory:false,etfDetail:null,rankView:'20',rankLens:'launch',stageView:'all',liquidityOnly:true,loadingExtra:false,instMarket:'all',instAsset:'stock',instSort:'amount'};
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
const memoByRow=fn=>{const cache=new WeakMap();return row=>{if(!row||typeof row!=='object')return fn(row);if(cache.has(row))return cache.get(row);const value=fn(row);cache.set(row,value);return value;}};
function movingMean(values,n){return values.length>=n?values.slice(-n).reduce((a,b)=>a+b,0)/n:null}
const techMetrics=memoByRow(techMetricsCore);
function techMetricsCore(c){
 const bars=(c.bars||[]).filter(b=>Number.isFinite(+b[4])&&Number.isFinite(+b[5]));
 const cls=bars.map(b=>+b[4]), lots=bars.map(b=>+b[5]);
 const ret=n=>cls.length>n&&cls.at(-n-1)>0?100*(cls.at(-1)/cls.at(-n-1)-1):null;
 const sma=n=>movingMean(cls,n);
 const avg20=lots.length>20?movingMean(lots.slice(0,-1),20):null;
 const recent=cls.slice(-15),changes=recent.slice(1).map((v,i)=>v-recent[i]);
 const ups=changes.reduce((a,n)=>a+Math.max(0,n),0),downs=changes.reduce((a,n)=>a+Math.max(0,-n),0);
 const rsi=changes.length>=14?(downs===0?100:100-100/(1+ups/downs)):null;
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
  actions:`<button type="button" data-etf-chart-open="true" ${official?'':'disabled'}>📈 K線圖解</button><button type="button" disabled title="尚未有經核對的ETF盤中價量計畫">✎ 盤中價量試算待開放</button>`});
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
 if(liquidityMemo.has(c))return liquidityMemo.get(c);
 const bars=(c.bars||[]).filter(b=>Array.isArray(b)&&b.length>=6 && numeric(b[4])!==null && numeric(b[5])!==null);
 const last=bars.at(-1),recent=bars.slice(-20);
 const full=recent.length===20&&recent.every(b=>numeric(b[4])>0&&numeric(b[5])>=0)&&
   last?.[0]===c.date && (!state.payload?.asOf || state.payload.asOf===c.date);
 const avgLots=full?recent.reduce((n,b)=>n+Number(b[5]),0)/20:null;
 const avgAmountM=full?recent.reduce((n,b)=>n+Number(b[4])*Number(b[5]),0)/20000:null;
 const dayLots=full?Number(last[5]):null;
 const result={valid:full,avgLots,avgAmountM,dayLots,
   strength:full&&avgLots>=1000&&avgAmountM>=20&&dayLots>=100,
   launch:full&&avgLots>=300&&avgAmountM>=10&&dayLots>=50};
 result.label=!full?'當日資料或20日成交量不足':result.strength?'強勢可交易':result.launch?'突破追蹤可交易':'低流動性（只供研究）';
 liquidityMemo.set(c,result);return result;
}
function liquidityPanel(c){
 const v=liquidityEvidence(c),num=x=>x===null?'待資料':Number(x).toLocaleString('zh-TW',{maximumFractionDigits:1});
 return `<section class="ma-structure-panel"><div class="panel-head"><span>可交易性檢查｜盤後歷史量能</span><small>${esc(v.label)}</small></div><p>前20交易日均量 <b>${num(v.avgLots)} 張</b> ／ 平均每日成交金額 <b>${num(v.avgAmountM)} 百萬元</b> ／ 最新交易日 <b>${num(v.dayLots)} 張</b></p><p class="ma-structure-note">強勢榜門檻：1000張＋2000萬元＋最近日100張；突破追蹤門檻：300張＋1000萬元＋最近日50張。未達門檻仍保留搜尋與自選。這不是即時成交檢查；當日無成交、停牌與券商報價缺漏仍須另外查證。</p></section>`;
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
 return liquidityEvidence(c).strength && sc!==null&&sc>=58&&trend!==null&&trend>=55&&
   !c.riskFirst&&c.riskLevel!=='high'&&c.riskLevel!=='medium'&&
   !c.possiblePriceAdjustment&&!!strengthSource(c)&&
   !(continuationReadout(c).riskFlags||[]).some(x=>x.includes('放量收低'));
}
function rankingScore(c){return strengthScore(c)}
let rankedCacheRows=null,rankedCache=null;
function rankedUniverse(){
 const rows=state.universe?.rows||state.payload?.candidates||[];
 if(rankedCacheRows===rows&&rankedCache)return rankedCache;
 rankedCacheRows=rows;
 rankedCache=rows.slice().sort((a,b)=>
   Number(isStrengthCandidate(b))-Number(isStrengthCandidate(a)) ||
   (strengthScore(b)??-1)-(strengthScore(a)??-1) ||
   (numeric(b.unifiedScore)??-1)-(numeric(a.unifiedScore)??-1) ||
   String(a.code).localeCompare(String(b.code),'zh-Hant',{numeric:true}) ||
   String(a.market).localeCompare(String(b.market),'zh-Hant'));
 return rankedCache;
}
function strengthCandidates(){return rankedUniverse().filter(isStrengthCandidate)}
// V3.0.8: Three independent ranking lenses share the same EOD bars and event history.
// All historical stage tabs and direct stock searches continue to use rankedUniverse().
// V3.1.0: two real user intents. All scoring uses the current EOD snapshot only.
// The desk shortlist is not a recommendation or a live market scan.
const deskMemo=new WeakMap();
function deskEvidence(c){
 if(deskMemo.has(c))return deskMemo.get(c);
 const plan=ChaopanDeskV310.evaluate(c,{asOf:state.payload?.asOf,phase:breakoutReadout(c)});
 deskMemo.set(c,plan);return plan;
}
let deskCacheRows=null;const deskCache=new Map();
function deskRankedCandidates(lens=state.rankLens){
 const rows=state.universe?.rows||state.payload?.candidates||[];
 if(rows!==deskCacheRows){deskCacheRows=rows;deskCache.clear()}
 if(deskCache.has(lens))return deskCache.get(lens);
 const launch=lens==='launch';
 const sorted=rows.filter(c=>{const p=deskEvidence(c);return launch?Boolean(p.qualified&&p.stage):
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
function staleDeskSnapshot(asOf){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(asOf||'')))return true;
 const todayParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 const today=`${todayParts.year}-${todayParts.month}-${todayParts.day}`;
 const nowUTC=Date.parse(today+'T00:00:00Z'),sourceUTC=Date.parse(asOf+'T00:00:00Z');
 if(!Number.isFinite(nowUTC)||!Number.isFinite(sourceUTC)||sourceUTC>nowUTC)return true;
 let business=0;for(let day=sourceUTC+86400000;day<=nowUTC;day+=86400000){const w=new Date(day).getUTCDay();if(w>0&&w<6)business++;}
 const dow=new Date(nowUTC).getUTCDay(),hour=Number(todayParts.hour);
 return business>1||(business>0&&dow>0&&dow<6&&hour>=16);
}
function renderSectorPulse(rows){
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
 const bands=m?`<div class="finance-glance-band" aria-label="歷史本益比模型估值三區間">
   ${['便宜','合理','昂貴'].map((label,i)=>`<span class="${i===1?'fair':''}"><small>${label}情境</small><strong>${price(m.targets[i])} 元</strong></span>`).join('')}
  </div><div class="finance-glance-caveat">模型合理價 ${price(m.targets[1])} 元｜近四季EPS ${price(m.eps)} × 歷史PE中位數；不是券商目標價</div>`:'';
 return `<section class="finance-glance" aria-label="已核對公司營收與估值"><div class="finance-glance-title">公司研究 · 已取得資料 <small>${esc(c.date)} 盤後</small></div>${bits.length?`<div class="finance-glance-facts">${bits.join('')}</div>`:''}${bands}</section>`;
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
 const kinds=finance?['summary','levels','evidence','finance']:['summary','levels','evidence'];
 const active=kinds.includes(sectorCardTabs.get(key))?sectorCardTabs.get(key):'summary';
 const tab=(id,label)=>`<button type="button" role="tab" data-card-tab="${id}" aria-selected="${active===id}" class="${active===id?'active':''}">${label}</button>`;
 const panel=(id,content)=>`<div role="tabpanel" data-card-panel="${id}" ${active===id?'':'hidden'}>${content}</div>`;
 return `<article class="sector-battle-card sector-r9 unified-battle-card" data-card-key="${esc(key)}">
  <div class="sector-card-eyebrow"><b>${esc(rankText)}</b><span>${esc(stage)}</span></div>
  <div class="sector-card-identity"><div><strong>${esc(code)} ${esc(name)}</strong><div class="sector-card-meta">${esc(industry)}</div></div><div class="sector-card-quote"><b>${esc(closeText)}</b><small class="${esc(changeClass||'')}">${esc(changeText||'—')}</small></div></div>
  <div class="sector-r9-tabs" role="tablist" aria-label="${esc(code)}作戰資訊分頁">${tab('summary','速覽')}${tab('levels','買賣價位')}${tab('evidence','技術證據')}${finance?tab('finance','公司研究'):''}</div>
  ${panel('summary',summary)}${panel('levels',levels)}${panel('evidence',evidence)}${finance?panel('finance',finance):''}
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
 const intraday=e.target.closest('[data-card-intraday]');if(intraday){showDetails(intraday.dataset.cardIntraday,true);return;}
 const chart=e.target.closest('[data-etf-chart-open]');if(chart){const target=$('#etfChartSvg');if(target)target.scrollIntoView({block:'nearest',behavior:'smooth'});return;}
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
 const levelOk=g.level!=='unknown'&&c.date===state.payload?.asOf;
 const light=state.marketIntel?ChaopanIntel.miniLights(state.marketIntel,c,p):'<small>法人與量能依來源資料顯示</small>';
 const marginBrief=state.marketIntel&&globalThis.ChaopanIntel?.marginPreview?ChaopanIntel.marginPreview(state.marketIntel,c):'';
 const ma510=hold.strictMA510Hold===true?'歷史突破後全程守5／10':hold.recentCloseHold10===true?'近10日守5／10':'逐日守線待核對';
 const riskClass=g.level==='danger'?'danger':g.level==='warn'?'caution':'muted';
 const overview=`<div class="sector-mini-status"><b>${esc(g.title)}</b><span class="sector-card-tag ${riskClass}">${esc(label)}</span></div>
 <div class="sector-mini-stats"><span>觀察關卡 <b>${levelOk?n(g.breakoutLevel):'待核對'}</b></span><span>MA5 <b>${levelOk?n(g.ma5):'待核對'}</b></span><span>MA10 <b>${levelOk?n(g.ma10):'待核對'}</b></span></div>
 <div class="sector-six-dots"><span>六均線</span>${six}</div>
 <div class="r28-ma-audit ${sixAudit?.confirmed?'confirmed':sixAudit?.status==='below'?'rejected':'pending'}"><b>${esc(sixAudit?.label||'六線待核對')}</b>｜${esc(sixAudit?.reason||'六線資料尚未核對')}</div>
 <div class="sector-phase-note">${esc(ma510)} · ${esc(c.date||'資料日待核對')}盤後</div>${marginBrief}${financeQuickCard(c)}`;
 const levelVals=[
  ['突破觀察',g.breakoutLevel],['回測觀察',g.pullbackZone?.[0]],['MA5減碼警戒',g.ma5],['MA10防守',g.ma10],['歷史支撐',g.support],['移動停利',g.trailingStop]
 ];
 const finite=levelVals.map(x=>numeric(x[1])).filter(v=>v!==null&&v>0);
 const lo=finite.length?Math.min(...finite):null,hi=finite.length?Math.max(...finite):null;
 const ruler=levelVals.map(([name,val])=>{const v=levelOk?numeric(val):null;
  const w=v===null?0:hi===lo?60:12+(v-lo)/(hi-lo)*88;
  return `<div class="sector-price-line"><small>${esc(name)}</small><span class="sector-price-track"><i style="width:${w.toFixed(1)}%"></i></span><b>${v===null?'—':n(v)}</b></div>`;
 }).join('');
 const levels=r38PlanCard(c,g,true);
 const trackLine=track.length?`紅K×${track[0].red}／綠K×${track[0].green}；${esc(track[0].source)}`:'歷史突破K線事件尚未核對';
 const institutional=options.institutional;
 const institutionFacts=institutional?`<div class="sector-card-institution">三大法人淨買賣超：外資 ${Number(institutional.foreign).toLocaleString('zh-TW')} 張／投信 ${Number(institutional.trust).toLocaleString('zh-TW')} 張／自營商 ${Number(institutional.dealer).toLocaleString('zh-TW')} 張；交易日 ${esc(state.payload?.asOf||'待核對')}。</div>`:'';
 const evidence=`${institutionFacts}<div class="sector-mini-meters">${barscore('發動潛力',score(p.score?.potential))}${barscore('進場品質',score(p.score?.entry))}</div>
 <div class="sector-card-lights">${light}</div>
 <div class="sector-card-tags"><span class="sector-card-tag ok">${esc(ma510)}</span><span class="sector-card-tag muted">${trackLine}</span></div>
 <div class="sector-ma-row">${[5,10,20,60,120,240].map(d=>`<span class="sector-ma ${numeric(ma.values?.[d])===null?'missing':ma.close>=ma.values[d]?'above':'below'}">MA${d} ${n(ma.values[d])}</span>`).join('')}</div>
 <small>排名為研究排序，不是勝率；缺資料不補零。點「K線圖解」查看歷史證據。</small>`;
 const actions=`<button type="button" class="sector-open-detail" data-card-detail="${esc(key)}">📈 K線圖解</button><button type="button" class="sector-open-intraday" data-card-intraday="${esc(key)}">✎ 盤中價量試算</button>`;
 return unifiedCardShell({key:cardKey,rankText,stage,code:c.code,name:c.name,
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
let sectorRadarCacheRows=null,sectorRadarCacheDate='',sectorRadarCache=null;
function sectorRadar(){
 const rows=state.universe?.rows||[],asOf=state.payload?.asOf||'';
 if(rows===sectorRadarCacheRows&&asOf===sectorRadarCacheDate&&sectorRadarCache)return sectorRadarCache;
 sectorRadarCacheRows=rows;sectorRadarCacheDate=asOf;
 sectorRadarCache=globalThis.ChaopanSectorV325&&globalThis.ChaopanStageV318&&state.universe?.asOf===asOf&&state.mode!=='demo'?
  ChaopanSectorV325.analyze(rows,asOf,c=>ChaopanStageV318.inspect(c,asOf)):
  {asOf,strong:[],watch:[],counts:{},coverage:[]};
 return sectorRadarCache;
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
function sectorDirectory(){
 const out=$('#sectorDirectory');if(!out)return;
 if(!globalThis.ChaopanSectorV325||!globalThis.ChaopanStageV318){
  out.innerHTML='<div class="r23-empty">舊技術階段模組未載入，請核對程式版本。</div>';return;
 }
 if(!state.universe||state.universe.asOf!==state.payload?.asOf||state.mode==='demo'){
  out.innerHTML='<div class="r23-empty">全市場日期尚未核對，暫停原始階段觀察。</div>';return;
 }
 const radar=sectorRadar();
 r26ObserveGroups=new Map();
 // Distinguish a raw historical breakout event from a currently qualified
 // trading observation. This prevents a 0-eligible list looking like no events.
 const rawAudit={first:0,second:0,third:0,fourth:0};
 const rawStageRows={first:[],second:[],third:[],fourth:[]};
 let maxBars=0;
 for(const c of state.universe.rows){
  if(c?.date!==state.payload.asOf||!Array.isArray(c.bars)||c.bars.at(-1)?.[0]!==state.payload.asOf)continue;
  maxBars=Math.max(maxBars,c.bars.length);
  const phase=c.breakoutSequence?.phase;
  if(phase==='first')rawStageRows.first.push(c);
  if(phase==='second')rawStageRows.second.push(c);
  if(c.cycle?.firstHistoricalBreakout===true&&c.cycle?.daysSinceFirst===2)rawStageRows.third.push(c);
  if(c.cycle?.firstHistoricalBreakout===true&&c.cycle?.daysSinceFirst===3)rawStageRows.fourth.push(c);
 }
 for(const k of Object.keys(rawStageRows))rawAudit[k]=rawStageRows[k].length;
 const ordered=['ready','ma510','reentry','maPullback','first','second','third','fourth','launch','hold','trend'];
 const activeStages=ordered.filter(stage=>radar.watch.some(o=>o.stage===stage));
 const inactiveStages=ordered.filter(stage=>!activeStages.includes(stage));
 const stageBlock=stage=>{const arr=radar.watch.filter(o=>o.stage===stage);
  const audit=rawAudit[stage];
  const auditLabel=stage==='trend'&&maxBars<240?'資料不足，待MA240認證':
   audit===undefined?`${arr.length} 檔`:`階段觀察${arr.length}／原始${audit} 檔`;
  const auditNote=audit!==undefined?`<p class="r23-note">原始突破事件 ${audit} 檔，通過本頁基本量價與風險審查 ${arr.length} 檔；不是認證買點，兩者不是同一件事。重新站回新頸線不算首次突破。</p>`:
   stage==='trend'&&maxBars<240?`<p class="r23-note">僅 ${maxBars} 根以下日K，無法計算 MA240。這是資料不足，不代表市場沒有六線強勢股。</p>`:'';
  const rawOnly=(rawStageRows[stage]||[]).filter(c=>!arr.some(o=>o.row?.code===c.code));
  const rawGroup='raw-stage-'+stage;
  const rawMarkup=rawOnly.length?`<details class="r27-idle" open><summary>原始階段股票 ${rawOnly.length} 檔｜展開可逐檔查看（非認證買點）</summary>${r26GroupMarkup(rawGroup,rawOnly.map(c=>({row:c,stage,compactStatus:'原始階段｜未通過嚴格審查',reason:'原始技術事件，非認證買點'})))}</details>`:'';
  return `<details class="sector-group" data-r26-group="stage-${stage}"><summary><span class="sector-nom">${esc(OBS_STAGE[stage])}</span><span class="sector-sum">${auditLabel}</span><span class="sector-arrow">⌄</span></summary>${auditNote}${rawMarkup}${r26GroupMarkup('stage-'+stage,arr)}</details>`;
 };
 out.innerHTML=`<p class="r23-note">歷史突破第一～四根、均線、回測及頸線觀察邏輯保留在這裡。這是<strong>研究資料庫</strong>，不是今天漲幅排行榜，也不代表明天會漲；MA240 歷史不足仍標待認證。</p>`+
 activeStages.map(stageBlock).join('')+
 `<details class="r27-idle"><summary>其他無訊號階段（${inactiveStages.length} 類）</summary>${inactiveStages.map(stageBlock).join('')}</details>`;
}

// r44.12: same-session relative performance, never infer missing index history.
function renderRelativeStrength(){
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
  if(c.date!==asOf||c.possiblePriceAdjustment||c.riskFirst||c.riskLevel==='high'||!Array.isArray(c.bars)||c.bars.length<21)continue;
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
  const rows=event.selected.map(x=>({row:x.row,stage:r42StageKey(x.stage),sector:'事件題材研究',reason:x.reason,
   quality:x.score,snapshot:x.snapshot,compactStatus:`${x.stage} · 觀察品質 ${x.score}/100（非勝率）`}));
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
function guidanceCard(c){
 const g=ChaopanGuidance.evaluate(c,deskEvidence(c),supportLines(c));
 return `<section class="guidance-panel battle-panel" aria-label="六大作戰價位與原始關卡圖解">
  <div class="guidance-title"><strong>◎ 超盤手｜六價位與關卡圖解</strong><span class="guidance-signal">研究版</span></div>
  ${r38PlanCard(c,g,false)}
  ${annotatedBattleChart(c,g)}
  <p class="guidance-note">K線走勢圖、關卡圖解與原四分頁保持原功能；缺核對來源不給可執行買賣結論。所有情境價位僅為盤後研究。</p>
 </section>`;
}
/* r41 CANDIDATE: Detail-only presentation split. Existing scanner, battle card,
 * chart renderer, sector rankings and trading calculations remain unchanged. */
function arrangeR41Detail(c){
 const root=$('#modalContent'), chart=root.querySelector(':scope > .chart-area');
 if(!chart)return;
 const card=document.createElement('section'),graph=document.createElement('section'),gates=document.createElement('section');
 const sections={card,chart:graph,gates};
 for(const [name,element] of Object.entries(sections)){
   element.className='r41-detail-page';element.dataset.r41Page=name;
   element.setAttribute('role','tabpanel');element.id='r41-page-'+name;
 }
 const annotated=root.querySelector('.guidance-panel .battle-chart-wrap');
 if(annotated)gates.append(annotated); // Preserve original full-resolution, annotated chart.
 const original=[...root.children];
 const afterChart=original.indexOf(chart);let advanced=[];
 for(let i=0;i<original.length;i++){
  const el=original[i];if(el.id==='detailSwitcher'||el.classList.contains('detail-title'))continue;
  if(el===chart){graph.append(el);continue;}
  if(el.classList.contains('priority-levels')){gates.append(el);continue;}
  const heading=el.querySelector?.(':scope > summary')?.textContent||'';
  if(/歷史頸線、突破驗證與原始統計/.test(heading)){
    gates.append(el);el.open=true;continue;
  }
  if(i<afterChart||el.classList.contains('detail-actions')){
    card.append(el);continue;
  }
  // Advanced research is not deleted: move it into Settings -> Advanced Features.
  advanced.push(el.outerHTML);el.remove();
 }
 // r44.15: all lookup and ranked stocks share the exact same four-tab battle card.
 // Retain the former detail research under an optional fold; chart and gates stay intact.
 const originalDetailMarkup=card.innerHTML;
 card.innerHTML=sectorBattleCard(c,{source:'lookup-detail',rankText:'超盤手｜個股完整分析'})
   +'<details class="lookup-extra-research"><summary>展開原始技術研究與六價位細節</summary>'
   +originalDetailMarkup+'</details>';
 // A missing finance snapshot must not remove the Company Research tab.
 const unified=card.querySelector('.unified-battle-card');
 if(unified&&!unified.querySelector('[data-card-tab="finance"]')){
   const tabs=unified.querySelector('.sector-r9-tabs');
   if(tabs)tabs.insertAdjacentHTML('beforeend','<button type="button" role="tab" data-card-tab="finance" aria-selected="false">公司研究</button>');
   const actions=unified.querySelector('.sector-card-actions');
   if(actions)actions.insertAdjacentHTML('beforebegin','<div role="tabpanel" data-card-panel="finance" hidden><p>目前尚無足夠的同日可驗證財務資料，請以官方公告為準。</p></div>');
 }
 const sameDay=Array.isArray(c.bars)&&c.bars.length>0&&c.bars.at(-1)?.[0]===c.date&&c.date===state.payload?.asOf;
 const lastSupport=sameDay?supportLines(c):[], defens=sameDay?c.structureV23?.mainDefense:null;
 const amount=(v,dir='down')=>{
  if(!sameDay||!/^[0-9]{4}$/.test(String(c.code||''))||String(c.code).startsWith('00')||!['上市','上櫃','TWSE','OTC'].includes(String(c.market))||numeric(v)===null||numeric(v)<=0)return '待認證';
  const rounded=globalThis.ChaopanBattleSixV138?.snap?.(numeric(v),dir);
  return rounded>0&&globalThis.ChaopanBattleSixV138?.checkPrice?.(rounded)?price(rounded)+' 元':'待認證';
 };
 const gateIntro=document.createElement('div');gateIntro.className='r41-gate-overview';
 gateIntro.innerHTML=`<div class="r41-gate-heading">關卡圖解 <small>${esc(c.date||'交易日待核對')} · 非即時</small></div><div class="r41-gate-grid">
  <div><small>近期大量 K 頸線／壓力</small><strong>${amount(sameDay?latestNeck(c):null,'up')}</strong></div>
  <div><small>第一支撐</small><strong>${amount(lastSupport[0]?.lower)}</strong></div>
  <div><small>第二支撐</small><strong>${amount(lastSupport[1]?.lower)}</strong></div>
  <div><small>最後結構防守</small><strong>${amount(defens?.lower)}</strong></div>
 </div><p>上方價位以同筆盤後資料判讀；頸線向上、支撐向下取股票合法升降單位（僅保守參考），欠缺有效結構即「待認證」。關卡圖不是預測走勢或下單指令。</p>`;
 gates.prepend(gateIntro);
 if(!sameDay)gates.insertAdjacentHTML('beforeend','<p class="r41-missing-chart">行情日期或歷史 K 棒不一致：價位待認證，請先更新盤後資料。</p>');
 if(!annotated)gates.insertAdjacentHTML('beforeend','<p class="r41-missing-chart">關卡圖解待認證：尚無同日有效歷史 K 線，不能繪製虛構圖形。</p>');
 state.r41Advanced={code:c.code,date:c.date,html:advanced.join('')};
 const tabs=document.createElement('nav');tabs.className='r41-detail-tabs';tabs.setAttribute('aria-label','個股三個獨立頁面');tabs.setAttribute('role','tablist');
 tabs.innerHTML=[['card','作戰字卡'],['chart','走勢圖'],['gates','關卡圖解']].map(([id,label])=>`<button type="button" role="tab" aria-controls="r41-page-${id}" data-r41-tab="${id}">${label}</button>`).join('');
 root.append(tabs,card,graph,gates);
 function setPage(name){
  if(!sections[name])return;state.r41Page=name;
  for(const [id,el] of Object.entries(sections)){el.hidden=id!==name;el.setAttribute('aria-hidden',String(id!==name));}
  tabs.querySelectorAll('[data-r41-tab]').forEach(btn=>{
   const active=btn.dataset.r41Tab===name;btn.classList.toggle('active',active);
   btn.setAttribute('aria-selected',String(active));btn.tabIndex=active?0:-1;
  });
  const sheet=$('#modalOverlay .sheet');if(sheet)sheet.scrollTop=0;
 }
 tabs.querySelectorAll('button').forEach(b=>{
  b.onclick=()=>setPage(b.dataset.r41Tab);
  b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const ids=['card','chart','gates'];const next=ids[(ids.indexOf(state.r41Page)+(e.key==='ArrowRight'?1:2))%3];setPage(next);tabs.querySelector(`[data-r41-tab="${next}"]`).focus();});
 });
 setPage(state.r41Page||'card');
}
function r41AdvancedSettingsMarkup(){
 const a=state.r41Advanced;
 if(!a)return '<p>先從自動名單或自選追蹤開啟一檔個股，就能在此檢視該檔的原始研究及盤中手動工具。</p>';
 if(a.date!==state.payload?.asOf)return '<p>盤後交易日已變更。原研究內容不再沿用，請重新開啟個股取得同日分析。</p>';
 if(state.payload?.asOf&&a.date!==state.payload.asOf)return '<p>最新盤後快照已更新，進階功能使用的個股資料日期不一致。請重新開啟該檔個股，避免將舊價當作今日計畫。</p>';
 return `<p>最近開啟：${esc(a.code)}｜${esc(a.date)} 盤後資料。只使用該筆資料，並非即時報價。</p><div class="r41-advanced-content">${a.html}</div>`;
}
// r22: This is the single automated home-screen gate, not a manually selected ranking lens.
// Only a VERIFIED same-day index+market-breadth feed may authorize a new-entry candidate.
// Without it, the list is honestly empty, rather than mixing in fragile momentum scores.
let autoRowsRef=null,autoIntelRef=null,autoDate='',autoQualifiedCache=[];
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
 if(rows===autoRowsRef&&state.marketIntel===autoIntelRef&&asOf===autoDate)return autoQualifiedCache;
 autoRowsRef=rows;autoIntelRef=state.marketIntel;autoDate=asOf;autoQualifiedCache=[];
 if(!globalThis.ChaopanMainTrendV320||!globalThis.ChaopanStageV318||state.mode!=='live'||
    !state.universe||state.universe.asOf!==asOf||staleDeskSnapshot(asOf))return autoQualifiedCache;
 const feed=verifiedAutoFeed(asOf);if(!feed)return autoQualifiedCache;
 for(const c of rows){
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
function renderTradeDesk(onlyDesk=false){
 const target=$('#deskList');if(!target)return;
 const current=state.payload?.asOf||'—',result=r42Scan(),picks=result?.candidates||[];
 const showing=Math.min(picks.length,8);
 $('#deskCount').textContent=showing+' 檔';
 const pending=staleDeskSnapshot(current)||!result;
 $('#deskNote').textContent=`資料截止 ${current} 盤後｜${pending?'資料非最新可核對交易日／尚未完整載入，請勿直接依此交易':'明日預備觀察，不代表已認證買點'}｜排名分數不是上漲機率。`;
 r33PriorityRows=picks.slice(0,8).map(x=>({row:x.row,stage:r42StageKey(x.stage),sector:x.row.industry||'產業待核對',
  reason:x.reason,quality:x.score,snapshot:x.snapshot,
  compactStatus:`${x.stage} · 觀察品質 ${x.score}/100（非勝率）`}));
 const disclosure=$('#deskDisclosure');
 if(disclosure&&!disclosure.open){
  target.innerHTML='<div class="desk-loading">點開「明日攻擊候選」查看盤後預備名單；個股點入後仍是原本的作戰字卡。</div>';
 }else target.innerHTML=r33PriorityRows.length?
  `<div class="r23-note">${esc(current)} 盤後篩選 ${result.validated}/${result.inspected} 檔有效資料。${pending?'⚠ 這是歷史快照，請等最新資料：':''}僅預備觀察，盤中需核對頸線、量能與防守；名單按技術條件排序，不是隔日漲幅預測。</div>${r26GroupMarkup('desk-priority',r33PriorityRows)}`:
  '<div class="desk-empty"><b>目前沒有通過資金流動性、產業領漲、趨勢與防守審查的明日攻擊股。</b><p>當大盤廣度偏弱或只有少數低價股拉抬時，寧可空名單；不以今日漲幅、技術低標或相對抗跌湊數。</p></div>';
 renderRelativeStrength();
 if(!onlyDesk)setTimeout(()=>{if(state.universe?.asOf===current&&state.payload?.asOf===current){sectorDirectory();renderSectorPulse(allRows());renderRelativeStrength();}},40);
}
const lensMemo=new WeakMap();
function lensEvidence(c){
 if(lensMemo.has(c))return lensMemo.get(c);
 const data=RadarLenses.evaluate(c,{ma:maReadout(c),phase:breakoutReadout(c),follow:continuationReadout(c),
  audit:confirmedStrengthAudit(c),liquidity:liquidityEvidence(c),baseScore:strengthScore(c),baseEligible:isStrengthCandidate(c)});
 lensMemo.set(c,data);return data;
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
 return allRows().filter(c=>isHistoricalMa510(c,group)).sort((a,b)=>
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
 '強勢分數','交易風險級別','風險提示','當日狀態','資料來源','排行視角','視角內名次','視角指數（非勝率）','近5日漲幅％','近10日漲幅％','近20日漲幅％','注意風險','發動潛力','進場品質','下日觀察價','追高警戒','原頸線失守參考','保守風險預算參考','策略階段','是否優先觀察'];
 const fullRanking=new Map(rankedUniverse().map((c,i)=>[rowId(c),i+1]));
 const lensOrder=new Map(lensRankedCandidates().map((c,i)=>[rowId(c),i+1]));
 const asOf=String(state.payload?.asOf||'日期待資料');
 const csvRows=[columns,...records.map((c,i)=>{
   const m=maReadout(c),b=breakoutReadout(c),k=techMetrics(c),sup=supportLines(c)[0];
   return [asOf,label,i+1,fullRanking.get(rowId(c))??'',c.code,c.name,c.market,c.industry||c.fundamentals?.industry,
    c.close,c.changePct,latestNeck(c),c.intradayPlan?.crossPrice,m.originalNeckline||b.level,b.initialDate||m.breakoutDate,
    b.label,b.assessment,b.firstClose,b.secondClose,b.secondVsFirstVolumeRatio,
    m.ma5,m.ma10,m.ma20,m.necklineHoldDays,continuationReadout(c).label,continuationReadout(c).breakoutDate,continuationReadout(c).originalNeckline,continuationReadout(c).holdDays,continuationReadout(c).source,k.avg20,liquidityEvidence(c).avgAmountM,liquidityEvidence(c).label,c.lots,c.volumeRatio,sup?.lower,sup?.upper,
    rankingScore(c),c.riskLevel,(Array.isArray(c.riskReasons)?c.riskReasons.join('；'):(c.riskReasons||'')),c.unifiedStage,state.mode==='demo'?'示範資料':'盤後公開資料', currentRankLabel(),lensOrder.get(rowId(c))??'',lensEvidence(c).score[state.rankLens],lensEvidence(c).returns.r5,lensEvidence(c).returns.r10,lensEvidence(c).returns.r20,lensEvidence(c).flags.join('；'),deskEvidence(c).score.potential,deskEvidence(c).score.entry,deskEvidence(c).trigger,deskEvidence(c).chase,deskEvidence(c).defense,deskEvidence(c).riskBudget,deskEvidence(c).stage||deskEvidence(c).momentumStage,deskEvidence(c).priority?'盤中優先觀察':'否'];
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
 rankedCacheRows=null;rankedCache=null;deskCacheRows=null;deskCache.clear();sectorRadarCacheRows=null;sectorRadarCache=null;
 render();
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
    if(intel&&state.payload?.asOf===obj.asOf){state.marketIntel=intel;
     const el=$('#intelMarket');if(el)el.innerHTML=ChaopanIntel.marketPanel(intel,obj.asOf);institutionalBoard();renderRelativeStrength();}
   }else{
    // Render base radar only, but never label it a verified universe.
    state.payload=obj;state.mode=['live','warming','partial'].includes(obj.mode)?obj.mode:'empty';state.loadingExtra=false;render();
    stampStatus('全市場'+(universeFailure||'未驗證')+' · 暫無完整名單');
   }
   return;
  }
  const supplemental=intel||(state.payload?.asOf===obj.asOf&&ChaopanIntel.safeMarket(state.marketIntel,obj.asOf)?state.marketIntel:null);
  if(!(sameRadar&&alreadyLoaded&&unchanged))applySnapshot(obj,univ,supplemental,{cached:false});
  else if(intel){state.marketIntel=intel;const el=$('#intelMarket');if(el)el.innerHTML=ChaopanIntel.marketPanel(intel,obj.asOf);institutionalBoard()}
  state.cachedSnapshot=false;state.loadingExtra=false;
  stampStatus('個股資料 '+obj.asOf+' 已核對'+(intel?' · 指數法人依來源顯示':' · 官方補充資料未取得'));
 }finally{if(run===loadRun){refreshBusy=false;if(btn){btn.disabled=false;btn.classList.remove('syncing')}}}
}

async function demoMode(){
  try{const res=await fetch('./data/demo.json'); if(!res.ok)throw new Error('failed');state.payload=await res.json();state.mode='demo';render();toast('已開啟示範畫面：不代表真實行情')}
  catch(ex){toast('無法開啟示範資料')}
}
function render(){
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
function filtered(){
 const q=state.query.trim().toLowerCase();
 if(q||state.tab==='star')return rankedUniverse().filter(c=>
  (state.tab!=='star'||state.watch.has(rowId(c)))&&
  (!q||String(c.code).includes(q)||String(c.name).toLowerCase().includes(q)));
 return autoQualifiedEntries().map(x=>x.row);
}
function renderList(){
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
const latestNeck=c=>numeric(c.structureV23?.primaryNeckline)??numeric(c.structureV23?.neckline)??numeric(c.neck);
function supportLines(c){
 const now=numeric(c.close);if(now===null)return [];
 const raw=c.structureV23?.recentSupports?.length?c.structureV23.recentSupports:(c.structureV23?.supports?.length?c.structureV23.supports:(c.supportEvidence?.levels||[]));
 // Only unbroken zones below/near the current price qualify as forward support.
 // Broken zones may become resistance; never label them guaranteed support.
 const unique=[];
 for(const v of raw){
   const lo=numeric(v.lower),hi=numeric(v.upper);
   if(lo===null||hi===null||lo>hi||lo<=0||hi>now*1.005||lo<now*.70||v.oneDayBreak||v.confirmedBreak||v.historicBreak)continue;
   if(unique.some(x=>Math.abs(x.lower-lo)/now<.014))continue;
   unique.push({...v,lower:lo,upper:hi});
 }
 return unique.sort((a,b)=>b.upper-a.upper).slice(0,3);
}
function structureInsight(c){
 const close=numeric(c.close),neck=latestNeck(c),bands=supportLines(c),risk=c.riskLevel;
 const broken=(c.supportEvidence?.levels||[]).filter(v=>v.oneDayBreak||v.confirmedBreak);
 const latestBroken=broken.some(v=>v.confirmedBreak);
 const first=bands[0],second=bands[1],defense=c.structureV23?.mainDefense||null;
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
 if(broken.length)reasons.push('有歷史支撐出現近期收盤破位訊號');
 const levelText=first?`收盤跌破 ${price(first.lower)} 元應重新檢查支撐；連續跌破風險加重`:'尚無可確認的鄰近有效支撐，不可憑均線假設安全';
 return {status,tone,first,second,defense,bands,neck,close,levelText,reasons,latestBroken};
}
function indicatorSnapshot(c){
 const b=(c.bars||[]).filter(x=>[2,3,4,5].every(j=>numeric(x[j])!==null));
 if(b.length<35)return {rsi:null,macd:null,macdSignal:null,obvDelta:null};
 const closes=b.map(x=>Number(x[4]));const vol=b.map(x=>Number(x[5]));
 const ema=(series,n)=>{const k=2/(n+1);let a=series[0];return series.map(v=>a=k*v+(1-k)*a)};
 const m12=ema(closes,12),m26=ema(closes,26),macd=m12.map((x,i)=>x-m26[i]);const signal=ema(macd,9);
 let obv=0;const obvHist=[0];for(let i=1;i<closes.length;i++){obv+=(Math.sign(closes[i]-closes[i-1])*vol[i]);obvHist.push(obv)}
 const recent=closes.slice(-15),changes=recent.slice(1).map((x,i)=>x-recent[i]);
 const ups=changes.reduce((a,v)=>a+Math.max(0,v),0),downs=changes.reduce((a,v)=>a+Math.max(0,-v),0);
 return {rsi:downs===0?100:100-100/(1+ups/downs),macd:macd.at(-1),macdSignal:signal.at(-1),obvDelta:obvHist.at(-1)-obvHist.at(-6)};
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
    <div class="ladder-line defense"><span>最後結構防守｜獨立保留</span><div>${chartLabel(x.defense)}</div></div>
   </div>
   <p class="conclusion-foot">已取得 ${integer(c.structureV23?.historyDays??c.bars?.length)} 個交易日K線${c.structureV23&&!c.structureV23.historyComplete24m?'，未達24個月，長期關卡僅供暫時判讀':''}。頸線更新不會讓舊防守自動上移；僅實際突破並二次回測才新增支撐。支撐不等於停損保證。</p>
 </section>`;
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
 const obv=i.obvDelta===null?'待資料':i.obvDelta>0?'量能偏累積':i.obvDelta<0?'量能偏流出':'量能持平';
 const macd=i.macd===null?'待資料':i.macd>=i.macdSignal?'MACD 高於訊號線':'MACD 低於訊號線';
 const rsi=i.rsi===null?'—':i.rsi.toFixed(1);
 return `<section class="visual-tech"><div class="panel-head"><span>量價輔助判讀</span><small>以公開日K自行計算</small></div><div class="tech-chips"><div><small>RSI(14)</small><strong>${rsi}</strong></div><div><small>MACD</small><strong>${esc(macd)}</strong></div><div><small>OBV近5日</small><strong>${esc(obv)}</strong></div></div><details class="fin-notes"><summary>技術數據與限制</summary><p>MA5 ${price(k.ma5)} ／ MA10 ${price(k.ma10)} ／ MA20 ${price(k.ma20)} ／ MA60 ${price(k.ma60)}。近20日 ${pct(k.ret20)} ／ 近60日 ${pct(k.ret60)}。</p><p>MACD、OBV與RSI僅作輔助，沒有將彼此高度相關的訊號重複加分。不是三竹專屬數據，也不能由此證明主力正在出貨。</p></details></section>`;
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
 const c=allRows().find(x=>rowId(x)===id)||(rowId(state.lookupRow||{})===id?state.lookupRow:null);if(!c)return;
 state.etfDetail=null;state.detailIds=detailNavigationIds(id);
 state.detail=c;state.chartDays=60;state.r41Page='card';
 if($('#modalOverlay').hidden){history.pushState({chaopanDetail:true},'',location.href);state.detailHistory=true;}
 renderDetail();$('#modalOverlay').hidden=false;document.body.style.overflow='hidden';
 if(jumpIntraday)jumpToIntraday();
}
function jumpToIntraday(){
 if(!$('#modalContent .intraday-panel')){openSettings({advanced:true});return;}
 const sheet=$('#modalOverlay .sheet'),panel=$('#modalContent .intraday-panel');
 if(!sheet||!panel)return;
 const fold=panel.closest('details');if(fold)fold.open=true;
 requestAnimationFrame(()=>{
   const rect=panel.getBoundingClientRect(),parent=sheet.getBoundingClientRect();
   sheet.scrollTop=Math.max(0,sheet.scrollTop+rect.top-parent.top-14);
   const field=$('#v26Time')||$('#v26Open');
   if(field)field.focus({preventScroll:true});
 });
}
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
 <div class="settings-card"><strong>多層歷史頸線｜每筆保留大量K形成日期</strong><div class="structure-chips">${multi||'目前可用歷史不足'}</div><strong>歷史大量K收盤與低點｜不因新頸線被覆蓋</strong><div class="structure-chips">${volumeKeys||'尚無可核對大量K'}</div></div>
 <div class="settings-card"><strong>價格支撐三重檢查｜前波低點、大量K、跳空缺口</strong>
 <p>${title}</p>${levels||'<p>歷史資料不足或尚無有效型態，不能推定支撐價。</p>'}
 <p><small>⚠ ${esc(evidence.note||'尚待新版行情重新掃描。')} 股價僅盤中觸及支撐不算確認跌破；此分析不是自動賣出建議。</small></p></div>
 </section>`;
}
function detailNav(){
 const idx=state.detailIds.indexOf(rowId(state.detail));
 return `<nav id="detailSwitcher" class="detail-switcher" aria-label="切換個股詳情">
 <button type="button" id="detailPrev" ${idx<=0?'disabled':''}>‹ 上一檔</button>
 <span>${idx+1} / ${state.detailIds.length} 檔<br><small>左右切換已啟用 v2.5｜上下滑閱讀</small></span>
 <button type="button" id="detailNext" ${idx>=state.detailIds.length-1?'disabled':''}>下一檔 ›</button>
 </nav>`;
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
function intradayPanel(c){
 const p=c.intradayPlan;
 if(!p||p.crossPrice==null)return `<section class="intraday-panel"><h3>下一交易日盤中觀察計畫</h3><p class="intraday-small">${esc(p?.status||'等候V2.6全市場盤後資料更新')}。沒有可靠頸線時不補造進場觸發價。</p></section>`;
 const avg=p.avg20Lots?integer(p.avg20Lots):'待資料';
 const cautions=(p.riskNotes||[]).map(a=>`<div>⚠ ${esc(a)}</div>`).join('');
 return `<section class="intraday-panel" aria-label="隔日盤中手動檢查">
  <h3>盤中趨勢判斷｜突破／回測自動切換</h3>
  <div class="muted">依 ${esc(p.asOf)} 收盤已知資料預算，適用<strong>下個實際交易日</strong>；若你看的已是其他交易日，應先等最新盤後資料。網站無盤中行情，不會自行判斷現在是否突破。</div>
  <p class="v307-trend-note">先依歷史走勢判斷目前應看突破還是均線防守；股價若處於回測階段，優先顯示MA5／MA10／MA20試算價，而不是只叫你突破前高。</p>
  <div id="v307TopSummary" class="v307-top-summary">輸入當日價量後，會自動切換突破或均線防守重點。</div>
  <div id="v307LiveLevels" class="intraday-kpis" hidden></div>
  <div id="v307BreakoutLevels" class="intraday-kpis"><div><small>歷史突破頸線／壓力</small><strong>${price(p.neckline)}</strong></div><div><small>第一道突破觀察價</small><strong>${price(p.crossPrice)}</strong></div><div><small>突破後較強價位</small><strong>${price(p.strengthPrice)}</strong></div><div><small>追高警戒價</small><strong>${price(p.chaseLine)}</strong></div></div>
  <p class="intraday-small">${esc(p.status)}。前20日平均日量 <b>${avg} 張</b>。先看是否站上頸線；紅K、收在盤中區間上方70%、粗估時段量比 ≥1.3為<strong>不同證據</strong>，不是全市場剔除條件。需連續觀察約15分鐘，不能只憑瞬間成交。</p>
  <div class="intraday-fields">
   <label>盤中觀察時間<select id="v26Time">${Object.keys(p.volumeTargets||{}).map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></label>
   <label>當日開盤價<input id="v26Open" type="number" min="0" step="any" inputmode="decimal" placeholder="券商即時報價"/></label>
   <label>目前成交價<input id="v26Price" type="number" min="0" step="any" inputmode="decimal" placeholder="當下現價"/></label>
   <label>目前最高價<input id="v26High" type="number" min="0" step="any" inputmode="decimal" placeholder="當日最高"/></label>
   <label>目前最低價<input id="v26Low" type="number" min="0" step="any" inputmode="decimal" placeholder="當日最低"/></label>
   <label>累計成交量（張）<input id="v26Volume" type="number" min="0" step="1" inputmode="numeric" placeholder="不是成交股數"/></label>
  </div>
  <label class="intraday-hold"><input id="v26Hold" type="checkbox"/>我已從券商5分K觀察：價格至少15分鐘維持在初步突破價附近或以上（需自行核對）</label>
  <div id="v26Result" class="intraday-status" role="status" aria-live="polite">輸入同一交易日價量後，會優先判斷是突破、沿均線續強，還是回測5／10／20日線。</div>
  <div class="intraday-small">量門檻會隨上面時間選擇變動，根據「日均量 × 估計分時累積比例 × 1.3」粗估，<strong>不是</strong>過去20日同時刻的實測量比，不適合單獨作為交易理由。盤中紅K與收盤位置都可能在13:30前改變；跳空過大、破位或上影轉長時即使量大仍應提高警戒。${cautions}</div>
 </section>`;
}
// V3.0.6: plain-language intraday worksheet. Manual input only;
// an intraday observation is never a confirmed daily closing breakout.
function wireIntradayPanel(c){
 const p=c.intradayPlan;if(!p?.crossPrice)return;
 const ids=['v26Time','v26Open','v26Price','v26High','v26Low','v26Volume','v26Hold'];
 const getNum=id=>{const v=$('#'+id)?.value;return v!==''&&v!=null&&Number.isFinite(Number(v))?Number(v):null;};
 const out=$('#v26Result');
 const msg=(tone,title,reason,action,checks=[],warning='')=>{
   out.className='intraday-status '+tone;
   const top=$('#v307TopSummary');if(top){top.textContent=title+'｜'+action;top.className='v307-top-summary '+tone;}
   out.innerHTML=`<div class="verdict-title">${esc(title)}</div>
    <p class="verdict-reason">${esc(reason)}</p>
    <div class="verdict-next"><strong>接下來看什麼？</strong><span>${esc(action)}</span></div>
    ${checks.length?`<div class="verdict-checks">${checks.map(x=>`<div class="verdict-check ${x.ok?'is-ok':'is-bad'}"><span aria-hidden="true">${x.ok?'✓':'×'}</span><span>${esc(x.text)}</span></div>`).join('')}</div>`:''}
    ${warning?`<p class="verdict-warning">${esc(warning)}</p>`:''}`;
 };
 const calculate=()=>{
   const time=$('#v26Time')?.value,open=getNum('v26Open'),priceNow=getNum('v26Price'),high=getNum('v26High'),low=getNum('v26Low'),volume=getNum('v26Volume');
   const liveLevels=$('#v307LiveLevels'),breakoutLevels=$('#v307BreakoutLevels');
   if(liveLevels)liveLevels.hidden=true; if(breakoutLevels)breakoutLevels.hidden=false;
   if([open,priceNow,high,low,volume].some(x=>x===null)){
     msg('','尚未開始試算','請輸入同一檔股票、同一個交易日的開盤價、現價、最高、最低與成交張數。','輸入完整後，才會判斷是否碰到突破關卡。');return;
   }
   if(open<=0||priceNow<=0||low<=0||high<low||high<open||high<priceNow||low>open||low>priceNow||volume<0){
     msg('danger','資料有矛盾，暫停判斷','開盤價、現價必須介於當日最高價與最低價之間，成交量不可為負數。','先回券商確認同一個交易日的開高低及現價，成交量以「張」輸入。');return;
   }
   const neckline=Number(p.neckline),cross=Number(p.crossPrice),strong=Number(p.strengthPrice),chaseLine=Number(p.chaseLine);
   const ref=Number(p.referenceClose);
   const abnormal=!Number.isFinite(cross)||cross<=0||!Number.isFinite(neckline)||neckline<=0||cross>neckline*1.12||cross<neckline*.88||
     (Number.isFinite(ref)&&ref>0&&(cross>ref*5||cross<ref*.2))||priceNow<cross*.2||priceNow>cross*5;
   if(abnormal){
     msg('danger','⚠ 價位資料不合理，不能判斷突破',
       `你輸入的現價是 ${price(priceNow)} 元，但這檔的預設突破價是 ${price(cross)} 元，兩者或與頸線的差距異常，可能選錯股票、輸入錯欄位或行情資料尚未更新。`,
       '請檢查上方股票代號、資料日期及券商價格，再重新輸入；不要照這個觸發價下單。');return;
   }
   const rough=p.volumeTargets?.[time],target=rough!=null&&Number.isFinite(Number(rough))&&Number(rough)>0?Number(rough):null;
   const loc=high>low?(priceNow-low)/(high-low):1;
   const wick=high>low?(high-Math.max(open,priceNow))/(high-low):0;
   const red=priceNow>open,nearHigh=loc>=.70&&wick<=.30;
   const volumeOK=target!==null&&volume>=target;
   const held=!!$('#v26Hold')?.checked;
   const risk=c.riskLevel==='high'||c.riskFirst||String(p.status||'').includes('風險優先');
   const floor=p.supportFloor!=null&&Number.isFinite(Number(p.supportFloor))?Number(p.supportFloor):null;
   const broken=floor!=null&&priceNow<floor;
   const gap=ref>0?(open/ref-1)*100:0;
   const chase= (Number.isFinite(chaseLine)&&chaseLine>0&&priceNow>=chaseLine)||(Number.isFinite(Number(p.gapCautionPct))&&gap>Number(p.gapCautionPct));
   const above=priceNow>=cross;
   const bounced=high>=cross&&!above;
   const firm=Number.isFinite(strong)&&priceNow>=strong;
   const posLabel=nearHigh?'股價靠近當日高點':'股價離當日高點較遠（或上影較長）';
   const checks=[
     {ok:above,text:`突破價格：${priceNow>=cross?'已站上':'還沒站上'} ${price(cross)} 元（現價 ${price(priceNow)} 元）`},
     {ok:red,text:`紅K檢查：${red?'現價高於開盤價':'現價未高於開盤價'}（開盤 ${price(open)} 元）`},
     {ok:nearHigh,text:`K棒位置：${posLabel}（目前位於當日區間約 ${Math.round(loc*100)}% 處）`},
     {ok:volumeOK,text:target!=null?`量能粗估：${integer(volume)}／${integer(target)} 張（${volumeOK?'達到':'未達到'}參考值）`:'量能粗估：缺少此時段參考值，不能判定是否達標'},
     {ok:held,text:`15分鐘觀察：${held?'已自行確認':'尚未核對券商5分K'}`}
   ];
   const baseWarning='這是手動盤中觀察，並非收盤確認或買賣指令；量能只是用日均量粗估，不是真正同時段量比。';
   // A prior uptrend deserves pullback-defense analysis BEFORE another neck breakout.
   // Never overwrite a full daily bar with today's manually entered incomplete bar.
   const engine=window.ChaopanRegimeV307;
   const phase=engine?.assess?.({bars:c.bars,asOf:c.date,open,current:priceNow,high,low,volume,volumeTarget:target,trendKind:continuationReadout(c).kind});
   if(phase&& !['breakout','unavailable','invalid'].includes(phase.mode)){
     if(liveLevels&&breakoutLevels){
       breakoutLevels.hidden=true;liveLevels.hidden=false;
       liveLevels.innerHTML=`<div><small>目前價位</small><strong>${price(priceNow)}</strong></div><div><small>試算5日線｜轉強參考</small><strong>${price(phase.ma5)}</strong></div><div><small>試算10日線｜近期防守</small><strong>${price(phase.ma10)}</strong></div><div><small>試算20日線｜中期參考</small><strong>${price(phase.ma20)}</strong></div>`;
     }
     const flagList=(phase.checks||[]).map(x=>({ok:false,text:x}));
     flagList.unshift({ok:priceNow>=phase.ma10,text:`試算10日線 ${price(phase.ma10)} 元：${priceNow>=phase.ma10?'目前尚在上方':'目前已在下方'}`});
     const intro=`${phase.reason} 試算MA5 ${price(phase.ma5)} 元、MA10 ${price(phase.ma10)} 元、MA20 ${price(phase.ma20)} 元。`;
     const priorRisk=c.riskLevel==='high'||c.riskFirst||String(p.status||'').includes('風險優先');
     const color=['weak','risk'].includes(phase.mode)||priorRisk?'danger':phase.mode==='continuation'?'good':'warn';
     msg(color,priorRisk?'🔴 前日結構有風險｜'+phase.title:phase.title, intro+(priorRisk?' 前一完整交易日另有風險警示，單靠均線收復不能視為風險解除。':''),phase.next||'持續核對原頸線及當日均線是否守穩。',flagList,
       `${baseWarning} 這三條均線是假設目前價格就是今日收盤計算，盤中會變動，非已確認的收盤均線。歷史高點 ${price(phase.peak)} 元仍作為壓力參考，不代表現在就要突破前高。`);
     return;
   }
   if(broken){
     msg('danger','🔴 支撐已跌破｜先注意風險',`現價 ${price(priceNow)} 元，已低於系統參考支撐 ${price(floor)} 元。`,
      '先核對支撐是否有效失守，不要因為成交量增加就當成起漲。',checks,baseWarning);return;
   }
   if(!above){
     const short=cross-priceNow;
     msg(bounced?'danger':'warn',bounced?'🔴 曾經突破又跌回｜假突破警戒':'🟠 尚未突破｜先等待',
       `現價 ${price(priceNow)} 元，距離第一道突破價 ${price(cross)} 元，還差 ${price(short)} 元。${bounced?'今天最高價一度碰到突破價，但目前又跌回。':''}`,
       bounced?'先等價格重新站回突破價，並觀察能否維持至少15分鐘；不要只看瞬間成交量。':`先觀察價格是否真正站上 ${price(cross)} 元；在此之前，量再大也不能算突破。`,checks,baseWarning);return;
   }
   if(risk){
     msg('danger','🔴 已跨過價位，但原有風險仍高',`現價 ${price(priceNow)} 元已達突破觀察價，但前一交易日結構仍有風險警訊。`,
       '先核對前日是否失守均線或支撐；單憑現在站上價位，不足以當成轉強。',checks,baseWarning);return;
   }
   if(chase){
     msg('warn','🟠 突破了，但不適合只因上漲就追價',`現價 ${price(priceNow)} 元，距頸線可能已偏遠，或開盤跳空幅度過大。`,
       '先看能不能回測並守住原突破價，同時檢查量能是否持續，而不是在拉高時直接追。',checks,baseWarning);return;
   }
   if(!held){
     msg('warn','🟠 已跨過第一關｜尚待確認站穩',`現價 ${price(priceNow)} 元已達 ${price(cross)} 元，但尚未確認至少15分鐘維持在突破價附近或以上。`,
       '打開券商5分鐘K線，確認不是一瞬間衝高後跌回；確認後再勾選上方核對框。',checks,baseWarning);return;
   }
   if(firm&&red&&nearHigh&&volumeOK){
     msg('good','🟢 盤中突破條件較完整｜繼續觀察',`價格站上 ${price(cross)} 元、盤中紅K、靠近高點，粗估量能也足夠。`,
       '繼續看原頸線是否守住，以及收盤前是否出現上影轉長或放量回落；收盤才能確認日K突破。',checks,baseWarning);return;
   }
   msg('warn','🟠 已站上價位｜突破品質還不夠',`現價 ${price(priceNow)} 元已跨過 ${price(cross)} 元，但紅K、K棒位置或粗估量能至少有一項仍待改善。`,
       '保持追蹤原頸線，不要只因跨過數字就判定成功；等價格穩定、K棒與量能改善。',checks,baseWarning);
 };
 ids.forEach(id=>{const el=$('#'+id);if(el){el.addEventListener('input',calculate);el.addEventListener('change',calculate);}});
}

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
function renderDetail(){const c=state.detail;if(!c)return;const starred=state.watch.has(c.market+'-'+c.code),cls=c.changePct>0?'rising':c.changePct<0?'falling':'neutral';
  $('#modalContent').innerHTML=`${detailNav()}<div class="detail-title"><div><div class="eyebrow">STOCK ANALYSIS / ${esc(c.market)}</div><h2 id="modalTitle">${esc(c.code)} ${esc(c.name)}</h2><div class="detail-sub">${esc(c.date)} 盤後資料${state.mode==='demo'?' · 示範':''}</div></div><div class="detail-price"><strong>${price(c.close)}</strong><div class="${cls}">${pct(c.changePct)}</div></div></div><div class="priority-levels"><span>近期頸線 <b>${price(latestNeck(c))}</b></span><span>第一支撐 <b>${price(supportLines(c)[0]?.lower)}</b></span><span>次日預警參考 <b>${price(c.intradayPlan?.crossPrice)}</b></span></div>${guidanceCard(c)}${globalThis.ChaopanMarketRegime?.badgeFor?.(c,state.marketIntel,state.payload?.asOf)||''}<div class="chart-area"><div class="chart-top"><strong>歷史K線／成交量／均線</strong><div class="chart-range"><button class="range-btn ${state.chartDays===20?'active':''}" data-days="20">20日</button><button class="range-btn ${state.chartDays===60?'active':''}" data-days="60">60日</button><button class="range-btn ${state.chartDays===120?'active':''}" data-days="120">120日</button><button type="button" class="zoom-btn" data-zoom="in" aria-label="K線放大">＋</button><button type="button" class="zoom-btn" data-zoom="out" aria-label="K線縮小">－</button></div></div><div class="chart-window-notice" role="status">${(c.bars||[]).length<state.chartDays?`⚠ 已選 ${state.chartDays} 日，目前只有 ${(c.bars||[]).length} 根可用K線；不得視為完整 ${state.chartDays} 日型態。`:`本圖使用最近 ${Math.min(state.chartDays,(c.bars||[]).length)} 根K線。`}</div><div id="chartSvg" aria-label="雙指捏合可縮放K線">${makeChart(c.bars||[],latestNeck(c),state.chartDays,supportLines(c),c.structureV23?.necklines||[],c.structureV23?.mainDefense,c.date)}</div><small class="chart-zoom-hint">日K以 ${esc(c.date)} 收盤為準；選定期間K棒決定價格縱軸，範圍外歷史頸線仍可在「關卡圖解」查看。非即時。</small><div class="chart-legend"><span>━━ 橘色：最新頸線</span><span style="color:#c8a5e8">┄┄ 淺紫：其他頸線／最後防守</span><span style="color:#3dd9ba">━━ 第一支撐</span><span style="color:#76abfa">━━ 第二支撐</span><span style="color:#ffd36e">━━ MA5</span><span style="color:#8dafff">━━ MA10</span><span style="color:#eaa8ec">━━ MA20</span><span>紅漲綠跌</span></div></div><details class="fin-r13-details"><summary>📊 公司研究｜營收、EPS及合理價情境</summary>${financialPanel(c)}</details>
 ${mainTrendResearchPanel(c)}<details class="research-fold"><summary>▥ 均線強弱、六條均線與趨勢結構</summary>${maPanel(c)}${sixMaPanel(c)}${trendModePanel(c)}</details>
 <details class="research-fold"><summary>▥ 突破紅綠K、量價與續強證據</summary>${breakoutTrackPanel(c)}${liquidityPanel(c)}${continuationPanel(c)}${confirmedStrengthPanel(c)}${phasePanel(c)}</details>
 <details class="research-fold"><summary>▥ 完整價位計畫與法人風險</summary>${deskPlanHTML(c)}${ChaopanIntel.chipPanel(state.marketIntel,c,deskEvidence(c))}</details>
 <details class="research-fold"><summary>▥ 歷史頸線、突破驗證與原始統計</summary><div class="tagrow">${(c.tags||[]).map(t=>`<span class="signal-tag ${t}">${esc(TAGS[t]||t)}</span>`).join('')}${c.priceConfirmed?'<span class="signal-tag confirmed">價格收盤確認</span>':c.confirmed?'<span class="signal-tag confirmed">最大量確認</span>':''}</div><div class="detail-grid"><div class="detail-metric"><div class="small">近期主要突破頸線</div><strong>${price(latestNeck(c))} 元</strong><div class="small">${esc(c.structureV23?.necklineDate||c.neckDate||'尚無壓力點')}${c.priceConfirmed&&c.neck!==latestNeck(c)?'／突破當日參考 '+price(c.neck):''}</div></div><div class="detail-metric"><div class="small">距離近期頸線</div><strong>${pct(latestNeck(c)>0?100*(Number(c.close)/latestNeck(c)-1):null)}</strong><div class="small">正值代表已突破</div></div><div class="detail-metric"><div class="small">當日成交量</div><strong>${integer(c.lots)} 張</strong><div class="small">前10日均量 ${Number(c.volumeRatio).toFixed(2)} 倍</div></div><div class="detail-metric"><div class="small">近20日漲停估算</div><strong>${integer(c.limit20)} 次</strong><div class="small">含今天，依收盤價近似判定</div></div><div class="detail-metric"><div class="small">前120日最大量</div><strong>${integer(c.oldMaxLots)} 張</strong><div class="small">${esc(c.oldMaxDate||'—')}</div></div><div class="detail-metric"><div class="small">突破確認</div><strong>${c.priceConfirmed?'價格已突破':c.confirmed?'成交量創新高（非首破）':'尚未確認首破'}</strong><div class="small">低量一字漲停也可價格確認；大量另計</div></div></div>${summaryPanel(c)}</details><div class="intraday-shortcut"><button type="button" id="intradayJump">✎ 盤中輸入價格與成交量 →</button><small>前一天預算好條件；盤中用券商即時報價自行核對</small></div><details class="research-fold intraday-fold"><summary>✎ 盤中價量試算（手動輸入）</summary>${intradayPanel(c)}</details>
 <details class="research-fold"><summary>▥ 起漲循環與階段證據</summary>${cyclePanel(c)}</details><details class="intel-deep"><summary>進階研究：技術與風險細節</summary>${technicalVisual(c)}${riskPanel(c)}</details><details class="fin-notes secondary-details"><summary>大量K突破與其他技術細節</summary>${launchSummary(c)}${traderPanel(c)}</details><div class="detail-note">${c.tags?.includes('volume')?'✓ 今日成交量大於前120個交易日最大量，且收盤高於舊最大量K最高價。':''} ${c.tags?.includes('first')?'✓ 今日收盤首次突破仍有效的大量K高點。':''} ${c.overextended?'⚠ 收盤距頸線已逾8%，應留意追高風險。':''}<br>盤後訊號僅供觀察，不代表次日買點；除權息可能導致假突破。</div><div class="detail-actions"><button class="primary-action" id="starButton">${starred?'★ 移出自選':'☆ 加入自選'}</button><button class="secondary-action" id="shareButton">分享股票資訊</button></div>`;
  arrangeR41Detail(c);
  wireValuationScenario(c);
  wireIntradayPanel(c);
  if($('#intradayJump'))$('#intradayJump').onclick=jumpToIntraday;
  $('#detailPrev').onclick=()=>nextDetail(-1);$('#detailNext').onclick=()=>nextDetail(1);
  $$('.range-btn').forEach(b=>b.onclick=()=>{state.chartDays=b.dataset.days==='120'?120:Number(b.dataset.days);renderDetail()});
  const zoom=(dir)=>{const total=(c.bars||[]).length;state.chartDays=Math.min(Math.max(12,total),Math.max(12,Math.min(total,Math.round(state.chartDays*(dir==='in'?.76:1.32)))));renderDetail()};
  $$('.zoom-btn').forEach(b=>b.onclick=()=>zoom(b.dataset.zoom));
  const chart=$('#chartSvg');
  if(chart){let distance=null;const separation=ev=>Math.hypot(ev.touches[0].clientX-ev.touches[1].clientX,ev.touches[0].clientY-ev.touches[1].clientY);
    chart.addEventListener('touchstart',ev=>{if(ev.touches.length===2)distance=separation(ev)},{passive:true});
    chart.addEventListener('touchmove',ev=>{if(ev.touches.length!==2||!distance)return;ev.preventDefault();const next=separation(ev);if(next>distance*1.24){distance=null;zoom('in')}else if(next<distance*.8){distance=null;zoom('out')}},{passive:false});
    chart.addEventListener('touchend',ev=>{if(ev.touches.length<2)distance=null},{passive:true});
    chart.addEventListener('wheel',ev=>{if(!ev.ctrlKey)return;ev.preventDefault();zoom(ev.deltaY<0?'in':'out')},{passive:false});
  }
  $('#starButton').onclick=()=>{const key=c.market+'-'+c.code;if(state.watch.has(key))state.watch.delete(key);else state.watch.add(key);saveWatch();renderDetail();toast('已更新自選清單')};
  $('#shareButton').onclick=async()=>{const info=`超盤手大量K雷達｜${c.code} ${c.name}\n${c.date} 收盤 ${price(c.close)}\n近期主要突破頸線 ${price(latestNeck(c))}\n量比 ${c.volumeRatio} 倍｜20日漲停估算 ${c.limit20} 次\n資料非即時，僅供研究。`;try{await navigator.clipboard.writeText(info);toast('已複製資訊')}catch(e){toast('請用手機內建分享功能')}};
}
function makeChart(bars,neck,days,supports=[],necklines=[],mainDefense=null,asOf=null){
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
  const W=600,H=289,P=33,plotW=W-P-36,top=20,kHeight=186,volTop=225,volHeight=42;
  const included=(supports||[]).map(s=>numeric(s.lower)).filter(v=>v!==null&&v>0);
  if(mainDefense?.lower>0)included.push(Number(mainDefense.lower));
  // Candle scale belongs to the selected time window. An old 645-dollar
  // anchor must not flatten a recent 380-dollar trading range. Keep far-away
  // levels in the textual '關卡圖解', instead of expanding the Y-axis to them.
  const hi=Math.max(...data.map(b=>Number(b[2])))*1.025;
  const lo=Math.min(...data.map(b=>Number(b[3])))*.975;
  const py=n=>top+(hi-n)/(hi-lo)*kHeight,step=plotW/data.length,barW=Math.max(1.5,Math.min(8,step*.62));const maxV=Math.max(...data.map(b=>Number(b[5])),1);
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="近${data.length}日收盤K線、成交量及大量K壓力線">`;
  for(let i=0;i<=4;i++){const y=top+kHeight*i/4,v=hi-(hi-lo)*i/4;svg+=`<line x1="${P}" x2="${W-36}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#284057" stroke-width="1" opacity=".65"/><text x="${W-32}" y="${y+4}" fill="#8198aa" font-size="10">${v.toFixed(1)}</text>`}
  const annotations=[];
  const secondaryNecks=(necklines||[]).filter(v=>
    v&&Number.isFinite(Number(v.price))&&Number(v.price)>0&&
    Math.abs(Number(v.price)-Number(neck))>.0001&&Number(v.price)>=Number(data.at(-1)[4])*.97&&
    (!asOf||!v.date||String(v.date)<=String(asOf)))
    .sort((a,b)=>Math.abs(Number(a.price)-Number(data.at(-1)[4]))-Math.abs(Number(b.price)-Number(data.at(-1)[4])))
    .slice(0,3);
  for(const v of secondaryNecks){const val=Number(v.price);if(val<lo||val>hi)continue;const y=py(val);svg+=`<line x1="${P}" x2="${W-36}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#b49acf" stroke-width="1" stroke-dasharray="2 5" opacity=".8"/>`;const formedToday=v.formedToday===true||(asOf&&String(v.date)===String(asOf));annotations.push({y:y-5,color:'#b49acf',label:formedToday?`當日新大量K高點（次日參考） ${price(val)}`:`歷史頸線 ${price(val)}`})}
  if(mainDefense && Number.isFinite(Number(mainDefense.keyPrice??mainDefense.lower)) && (mainDefense.keyPrice??mainDefense.lower)>=lo && (mainDefense.keyPrice??mainDefense.lower)<=hi){const y=py(Number(mainDefense.keyPrice??mainDefense.lower));svg+=`<line x1="${P}" x2="${W-36}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#c8a5e8" stroke-width="2" stroke-dasharray="9 4"/>`;annotations.push({y:y-5,color:'#c8a5e8',label:`最後防守 ${price(mainDefense.keyPrice??mainDefense.lower)}`})}
  if(Number.isFinite(Number(neck))&&Number(neck)>=lo&&Number(neck)<=hi){const y=py(Number(neck));svg+=`<line x1="${P}" x2="${W-36}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e7b365" stroke-width="1.4" stroke-dasharray="5 5"/>`;annotations.push({y:y-5,color:'#e7b365',label:`頸線 ${price(neck)}`})}
  const lineColors=['#3dd9ba','#76abfa'];
  (supports||[]).slice(0,2).forEach((v,idx)=>{
    const l=numeric(v.lower),u=numeric(v.upper);if(l===null||u===null||l<lo||l>hi)return;
    const y1=py(Math.min(u,hi)),y2=py(l),col=lineColors[idx];
    svg+=`<rect x="${P}" y="${Math.max(top,y1).toFixed(1)}" width="${plotW}" height="${Math.max(2,y2-Math.max(top,y1)).toFixed(1)}" fill="${col}" opacity=".10"/>`;
    svg+=`<line x1="${P}" x2="${W-36}" y1="${y2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="1.5" stroke-dasharray="7 4"/>`;
    annotations.push({y:y2-5,color:col,label:`${idx===0?'第一':'第二'}支撐 ${price(l)}`});
  });
  // Separate text labels vertically when neck and supports sit within a narrow band.
  annotations.sort((a,b)=>a.y-b.y);
  let last=-100;
  for(const a of annotations){const yy=Math.max(top+12,Math.min(top+kHeight-4,Math.max(a.y,last+13)));last=yy;
    svg+=`<text x="${P+3}" y="${yy.toFixed(1)}" fill="${a.color}" font-size="10" paint-order="stroke" stroke="#0d1a29" stroke-width="2">${esc(a.label)}</text>`;
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
  data.forEach((b,i)=>{const x=P+step*(i+.5),[date,o,h,l,c,v]=[b[0],Number(b[1]),Number(b[2]),Number(b[3]),Number(b[4]),Number(b[5])];const color=c>=o?'#ff777f':'#3bd1b4';let yo=py(o),yc=py(c),yh=py(h),yl=py(l);svg+=`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${yh.toFixed(1)}" y2="${yl.toFixed(1)}" stroke="${color}" stroke-width="1.1"/><rect x="${(x-barW/2).toFixed(1)}" y="${Math.min(yo,yc).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1.6,Math.abs(yo-yc)).toFixed(1)}" fill="${color}" rx=".5"/><rect x="${(x-barW/2).toFixed(1)}" y="${(volTop+volHeight*(1-v/maxV)).toFixed(1)}" width="${barW.toFixed(1)}" height="${(volHeight*v/maxV).toFixed(1)}" fill="${color}" opacity=".7"/>`;if(i===0||i===Math.floor(data.length/2)||i===data.length-1){svg+=`<text x="${x.toFixed(1)}" y="${H-6}" text-anchor="${i===0?'start':i===data.length-1?'end':'middle'}" font-size="9" fill="#91aabd">${esc(date.slice(5))}</text>`}});
  return svg+'</svg>';
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
function openSettings(opts={}){const isReady=state.mode==='live';$('#modalContent').innerHTML=`<div class="eyebrow">APP STATUS / SETTINGS</div><h2 id="modalTitle">資料與安裝設定</h2><div class="settings-card"><strong>目前：${modeName()}</strong><p>最近盤後日期：${esc(state.payload?.asOf||'尚無')}<br>掃描歷史完整股票：${integer(state.payload?.eligibleCount||0)} 檔<br>已記錄股票：${integer(state.payload?.stockCount||0)} 檔</p></div><div class="settings-card"><strong>如何使用免費版？</strong><p>把本程式上傳 GitHub 公開 Repository，啟用 Actions，先手動執行「初次回補約220天」，設定 Pages 從 main /root 發布，再以 Android Chrome 的「新增至主畫面」安裝。GitHub Actions 依排程在13:30、14:30、18:30、23:00以及隔日06:00、08:30嘗試核對盤後資料（實際排程可能延遲），若交易所阻擋雲端 IP，需改用在台灣網路執行的收集主機。</p></div><div class="settings-card"><strong>即時版升級狀態</strong><p>目前沒有盤中報價或推播。未來串接授權即時行情、雲端首次突破判斷及 Firebase 推播後升級；不會使用盤後資料假裝盤中訊號。</p></div><div class="settings-card"><strong>網站隱私與密碼：目前仍是公開網站</strong><p>GitHub Pages 的 JavaScript 密碼視窗不能真正保護行情或阻止已取得網址的人查看檔案，亦不能安全撤銷別人的存取權。若需要可取消授權的真正私密網站，應遷移到有伺服端登入控管的部署方式（例如 Cloudflare Pages + Access），並關閉舊公開 Pages、保護行情資料來源。不要在此公開程式中設定真實密碼。</p></div><div class="action-row"><button id="reloadData" class="primary-action">重新檢查盤後資料</button>${isReady?'':'<button id="demoModeBtn" class="secondary-action">開啟示範畫面</button>'}</div>`;$('#modalContent').insertAdjacentHTML('beforeend',`<details id="r41AdvancedSettings" class="r41-advanced-settings" ${opts.advanced?'open':''}><summary>進階功能｜技術研究、原始法人資料與盤中價量試算</summary>${r41AdvancedSettingsMarkup()}</details>`);const recent=allRows().find(x=>x.code===state.r41Advanced?.code&&x.date===state.r41Advanced?.date);if(recent){wireValuationScenario(recent);wireIntradayPanel(recent)};if($('#r41AdvancedSettings #intradayJump'))$('#r41AdvancedSettings #intradayJump').onclick=jumpToIntraday;$('#reloadData').onclick=()=>{hideDetails();loadData()};if($('#demoModeBtn'))$('#demoModeBtn').onclick=()=>{hideDetails();demoMode()};$('#modalOverlay').hidden=false;document.body.style.overflow='hidden'}
function navTo(page){$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));if(page==='list'){setTab('all');(document.querySelector('#quickStockSearch')||document.querySelector('.content-area')).scrollIntoView({behavior:'smooth'})}else if(page==='star'){state.tab='star';const adv=$('.advanced-radar');if(adv)adv.open=true;$$('.tab').forEach(x=>x.classList.remove('active'));renderList();$('.content-area').scrollIntoView({behavior:'smooth'})}else if(page==='guide')$('#institutionalBoard').scrollIntoView({behavior:'smooth'});else openSettings()}
// r44.7 independent lookup: browsing stocks is NOT the same as being auto-qualified.
// Date lock and market+code keys prevent stale and cross-listing mixups.
let quickDirectory=null,quickDirectoryError='',quickDirectoryLoading=null,quickShardBusy=false;
function quickMatches(q){
 const rows=quickDirectory?.rows||allRows().map(x=>({code:String(x.code),name:x.name,market:x.market,date:x.date,close:x.close}));
 const text=String(q||'').normalize('NFKC').trim().toLocaleLowerCase('zh-Hant');
 return rows.filter(x=>String(x.code).toLowerCase().includes(text)||String(x.name).toLocaleLowerCase('zh-Hant').includes(text))
  .sort((a,b)=>Number(String(b.code)===text)-Number(String(a.code)===text)||String(a.code).localeCompare(String(b.code),'zh-Hant',{numeric:true})).slice(0,12);
}
function quickDraw(){
 const field=$('#quickStockSearch'),target=$('#quickStockResults');if(!field||!target)return;
 const q=field.value.trim();if(!q){target.innerHTML='';return}
 if(!quickDirectory&&!quickDirectoryLoading&&!quickDirectoryError){target.innerHTML='<p class="r447-msg">股票索引準備中…</p>';return}
 const matches=quickMatches(q);
 const escaped=matches.map(x=>`<button type="button" class="r447-result" data-quick-market="${esc(x.market)}" data-quick-code="${esc(x.code)}"><span><b>${esc(x.code)} ${esc(x.name)}</b><br><small>${esc(x.market)} · ${esc(x.date||'日期待核對')}</small></span><small>查看分析 ›</small></button>`).join('');
 target.innerHTML=escaped||`<p class="r447-msg">${quickDirectory?'找不到符合的股票':'完整索引無法讀取，目前僅能查已載入股票。'} ${quickDirectoryError?esc(quickDirectoryError):''}</p>`;
 if(quickDirectory?.asOf&&state.payload?.asOf&&quickDirectory.asOf!==state.payload.asOf){target.insertAdjacentHTML('afterbegin',`<p class="r447-msg">⚠ 股票索引 ${esc(quickDirectory.asOf)} 與盤後行情 ${esc(state.payload.asOf)} 日期不同；目前不可開啟舊資料作戰計畫。</p>`)}
}
async function loadQuickDirectory(){
 if(quickDirectoryLoading)return quickDirectoryLoading;
 quickDirectoryLoading=(async()=>{
  try{
   const r=await fetch('./data/stock-lookup/index.json',{cache:'no-cache'});if(!r.ok)throw Error('索引 HTTP '+r.status);
   const d=await r.json();if(!d||!Array.isArray(d.rows)||d.rows.length<500||!/^\d{4}-\d{2}-\d{2}$/.test(d.asOf))throw Error('索引格式不符');
   quickDirectory=d;quickDirectoryError='';
  }catch(e){quickDirectoryError='股票索引尚未部署';console.warn(e)}finally{quickDirectoryLoading=null;quickDraw()}
 })();return quickDirectoryLoading;
}
async function quickOpen(market,code){
 const id=market+'-'+code;let row=allRows().find(x=>rowId(x)===id);
 const expectedDay=state.payload?.asOf||quickDirectory?.asOf;
 if(quickDirectory&&expectedDay&&quickDirectory.asOf!==expectedDay){
   toast(`完整股票索引是 ${quickDirectory.asOf}，但最新行情是 ${expectedDay}；日期不同，請等待盤後同步後再查詢。`);return;
 }
 if(row&&(!expectedDay||row.date!==expectedDay)){
   toast('股票歷史資料與最新盤後日不同，拒絕使用舊走勢與買點');return;
 }
 if(!row){
   if(quickShardBusy)return;
   quickShardBusy=true;
   const target=$('#quickStockResults');if(target)target.insertAdjacentHTML('beforeend','<p class="r447-msg">正在下載個股歷史資料…</p>');
   try{
    const digit=String(code).charAt(0);if(!/^\d$/.test(digit))throw Error('代號格式不符');
    const response=await fetch('./data/stock-lookup/'+digit+'.json',{cache:'no-cache'});
    if(!response.ok)throw Error('個股分組未部署');
    const data=await response.json();const latest=state.payload?.asOf||quickDirectory?.asOf;
    if(!latest||data.asOf!==latest||data.asOf!==quickDirectory?.asOf)throw Error('股票資料與盤後資料日期不同，拒絕顯示舊行情');
    if(!Array.isArray(data.rows)||data.rows.length<1)throw Error('歷史資料缺漏');
    row=data.rows.find(x=>String(x.code)===String(code)&&x.market===market&&x.date===latest);
    if(!row)throw Error('找不到同市場同日期完整股票資料');
    state.lookupRow=row;
   }catch(e){toast('無法開啟完整分析：'+e.message);console.warn(e);return}
   finally{quickShardBusy=false;quickDraw()}
 }
 showDetails(id);
}
function initQuickStockSearch(){
 const field=$('#quickStockSearch'),result=$('#quickStockResults');if(!field||!result)return;
 field.addEventListener('input',()=>{quickDraw();if(!quickDirectory&&!quickDirectoryLoading)loadQuickDirectory()});
 field.addEventListener('keydown',e=>{if(e.key==='Enter'){
  const x=quickMatches(field.value)[0];if(x){e.preventDefault();quickOpen(x.market,String(x.code))}
 }});
 result.addEventListener('click',e=>{const b=e.target.closest('[data-quick-code]');if(b)quickOpen(b.dataset.quickMarket,b.dataset.quickCode)});
 loadQuickDirectory();
}
function wire(){loadWatch();setupSixtyToolbar();setupDetailSwipe();initQuickStockSearch();$('#deskDisclosure')?.addEventListener('toggle',e=>{if(e.target.open&&state.payload)renderTradeDesk(true)});document.addEventListener('click',unifiedCardEvents);document.addEventListener('toggle',e=>{if(e.target.matches?.('details.r30-stock-entry'))r30StockToggle(e.target);},true);
 $$('.lens-scope').forEach(b=>b.onclick=()=>{state.rankLens=b.dataset.lens;state.rankView='20';state.stageView='all';state.tab='all';state.query='';$('#searchBox').value='';state.visible=30;renderList()});const liquidityToggle=$('#onlyLiquid');if(liquidityToggle){liquidityToggle.checked=state.liquidityOnly;liquidityToggle.addEventListener('change',e=>{state.liquidityOnly=e.target.checked;state.visible=30;renderList()})}$$('.rank-scope').forEach(b=>b.onclick=()=>{state.rankView=b.dataset.scope;state.visible=30;state.tab='all';renderList()});$$('.stage-scope').forEach(b=>b.onclick=()=>{state.stageView=b.dataset.stage;state.visible=30;state.tab='all';state.query='';$('#searchBox').value='';renderList()});const sort=$('#sortFilter');if(sort){sort.insertAdjacentHTML('afterbegin','<option value="trade">操盤品質與追高風險（預設）</option><option value="launch">第一根發動優先</option><option value="priority">基本面投資優先度</option>');sort.value='trade';state.sort='trade';}$$('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$$('.stat-card').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$$('.nav-item').forEach(b=>b.onclick=()=>navTo(b.dataset.page));$('#searchBox').oninput=e=>{state.query=e.target.value;state.visible=30;renderList()};$('#showMore').onclick=()=>{state.visible+=30;renderList()};$('#refreshBtn').onclick=()=>loadData();$('.advanced-radar')?.addEventListener('toggle',e=>{if(e.target.open&&state.payload){state.rankListDirty=false;renderList()}});$('#closeModal').onclick=()=>hideDetails();$('#modalOverlay').onclick=e=>{if(e.target===$('#modalOverlay'))hideDetails()};window.onkeydown=e=>{if(e.key==='Escape')hideDetails()};window.addEventListener('popstate',()=>{if(state.detail||state.etfDetail)hideDetails(true)});loadData();if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(console.warn)}}
document.addEventListener('DOMContentLoaded',wire);
