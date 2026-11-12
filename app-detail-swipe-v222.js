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
// Star labels are derived only from confirmed backend event data.
// A prior screening appearance is shown only when stageHistory is present.
function breakoutStar(c){
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
 const kinds=['summary','levels','evidence'];
 const active=kinds.includes(sectorCardTabs.get(key))?sectorCardTabs.get(key):'summary';
 const tab=(id,label)=>`<button type="button" role="tab" data-card-tab="${id}" aria-selected="${active===id}" class="${active===id?'active':''}">${label}</button>`;
 const panel=(id,content)=>`<div role="tabpanel" data-card-panel="${id}" ${active===id?'':'hidden'}>${content}</div>`;
 return `<article class="sector-battle-card sector-r9 unified-battle-card" data-card-key="${esc(key)}">
  <div class="sector-card-eyebrow"><b>${esc(rankText)}</b><span>${esc(stage)}</span></div>
  <div class="sector-card-identity"><div><strong>${esc(code)} ${esc(name)}</strong><div class="sector-card-meta">${esc(industry)}</div></div><div class="sector-card-quote"><b>${esc(closeText)}</b><small class="${esc(changeClass||'')}">${esc(changeText||'—')}</small></div></div>
  <div class="sector-r9-tabs" role="tablist" aria-label="${esc(code)}作戰資訊分頁">${tab('summary','速覽')}${tab('levels','買賣價位')}${tab('evidence','技術證據')}</div>
  ${panel('summary',summary)}${panel('levels',levels)}${panel('evidence',evidence)}
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
 const levelOk=g.level!=='unknown'&&c.date===state.payload?.asOf;
 const light=state.marketIntel?ChaopanIntel.miniLights(state.marketIntel,c,p):'<small>法人與量能依來源資料顯示</small>';
 const marginBrief=state.marketIntel&&globalThis.ChaopanIntel?.marginPreview?ChaopanIntel.marginPreview(state.marketIntel,c):'';
 const ma510=hold.strictMA510Hold===true?'歷史突破後全程守5／10':hold.recentCloseHold10===true?'近10日守5／10':'逐日守線待核對';
 const riskClass=g.level==='danger'?'danger':g.level==='warn'?'caution':'muted';
 const overview=`<div class="sector-mini-status"><b>${esc(g.title)}</b><span class="sector-card-tag ${riskClass}">${esc(label)}</span></div>
 <div class="sector-mini-stats"><span>觀察關卡 <b>${levelOk?n(g.breakoutLevel):'待核對'}</b></span><span>MA5 <b>${levelOk?n(g.ma5):'待核對'}</b></span><span>MA10 <b>${levelOk?n(g.ma10):'待核對'}</b></span></div>
 <div class="sector-six-dots"><span>六均線</span>${six}</div>
 <div class="r28-ma-audit ${sixAudit?.confirmed?'confirmed':sixAudit?.status==='below'?'rejected':'pending'}"><b>${esc(sixAudit?.label||'六線待核對')}</b>｜${esc(sixAudit?.reason||'六線資料尚未核對')}</div>
 <div class="sector-phase-note">${esc(ma510)} · ${esc(c.date||'資料日待核對')}盤後</div>${marginBrief}${financeQuickCard(c)}${options.source==='lookup-detail'?`<details class="finance-full-details"><summary>展開年度EPS與估值詳細資料</summary>${financialPanel(c)}</details>`:''}`;
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
 <small>排名為研究排序，不是勝率；缺資料不補零。完整走勢請使用個股的「走勢圖」分頁。</small>`;
 const actions=options.source==='lookup-detail'?'':`<button type="button" class="sector-open-detail" data-card-detail="${esc(key)}">查看完整作戰字卡</button>`;
 return unifiedCardShell({key:cardKey,rankText,stage:stage+(breakoutStar(c)?" ｜ "+breakoutStar(c).mark:"")+(c.breakoutQuality==='weak'?" 🔴轉弱":c.breakoutQuality==='watch'?" 🟡觀察":c.breakoutQuality==='strong'?" 🟢續強":""),code:c.code,name:c.name,
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
// r46: only a verified backend EOD decision can enter a strict breakout continuation list.
// Missing values are NOT interpreted as a positive institutional/technical confirmation.
const STRICT_BREAKOUT_STAGES=new Set(['first','second','third','fourth']);
function strictBreakoutDecision(c,stage){
 const pass=(reason)=>({eligible:true,pending:false,reason});
 const fail=(reason)=>({eligible:false,pending:false,reason});
 const pending=(reason)=>({eligible:false,pending:true,reason});
 if(!STRICT_BREAKOUT_STAGES.has(stage))return pass('非突破續攻階段');
 if(!c)return pending('個股資料尚未載入');
 // Match the certified event to the displayed star stage BEFORE checking price/volume.
 // A day-2 candidate must never qualify as ★1 merely because its candles are strong.
 const seq=c.breakoutSequence;
 if(!seq||typeof seq!=='object')return pending('突破階段資料尚未更新');
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
 const level=Number(c.breakoutEvent?.level),close=Number(c.close);
 if(!c.breakoutEvent||!Number.isFinite(level)||level<=0)return pending('缺少有效突破事件頸線');
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
 if(rangeAudit.status==='data_gap')return pending('盤整框K線資料不完整，突破證據待核對');
 if(stage!=='first'&&c.abovePrevHigh===false)return fail('未收盤突破昨日高點');
 if(stage!=='first'&&c.abovePrevHigh!==true)return pending('昨日高點比較資料待核對');
 return pass('突破事件與量價續攻條件已確認');
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
  if((phase==='follow'||phase==='third')&&c.cycle?.firstHistoricalBreakout===true&&c.cycle?.daysSinceFirst===2)rawStageRows.third.push(c);
  if((phase==='follow'||phase==='fourth')&&c.cycle?.firstHistoricalBreakout===true&&c.cycle?.daysSinceFirst===3)rawStageRows.fourth.push(c);
 }
 for(const k of Object.keys(rawStageRows))rawAudit[k]=rawStageRows[k].length;
 const ordered=['ready','ma510','reentry','maPullback','first','second','third','fourth','launch','hold','trend'];
 // Audit from BOTH historical events and sector watch results. A historical
 // event without current EOD certification must not silently become "0 stocks".
 const candidatesForStage=stage=>{
  const all=[...(rawStageRows[stage]||[]),...radar.watch.filter(o=>o.stage===stage).map(o=>o.row)];
  // Prefer the most complete certified record when the same stock appears in both sources.
  // Do not let an older raw candidate shadow a newer EOD certification.
  const byCode=new Map();
  for(const c of all){
   if(!c?.code)continue;
   const prior=byCode.get(c.code);
   const quality=x=>(x?.continuationEligible===true||x?.continuationEligible===false?4:0)+
    (['strong','watch','weak','invalid'].includes(x?.breakoutQuality)?2:0)+
    (x?.breakoutEvent?.level>0?1:0);
   if(!prior||quality(c)>quality(prior))byCode.set(c.code,c);
  }
  return [...byCode.values()];
 };
 const qualifiedRows=stage=>STRICT_BREAKOUT_STAGES.has(stage)
  ?candidatesForStage(stage).filter(c=>strictBreakoutDecision(c,stage).eligible).map(c=>({row:c,stage,sector:c.sector||'產業待核對',compactStatus:'已認證｜'+strictBreakoutDecision(c,stage).reason}))
  :radar.watch.filter(o=>o.stage===stage&&strictBreakoutDecision(o.row,stage).eligible);
 // Keep certified nonempty groups visible. Pending is not zero: it remains
 // visible for data-quality review. Empty groups fold into the idle section.
 const stagePending=stage=>STRICT_BREAKOUT_STAGES.has(stage)&&candidatesForStage(stage).some(c=>strictBreakoutDecision(c,stage).pending);
 const activeStages=ordered.filter(stage=>qualifiedRows(stage).length>0||stagePending(stage));
 const inactiveStages=ordered.filter(stage=>!activeStages.includes(stage));
 const stageBlock=stage=>{
  const arr=qualifiedRows(stage),strict=STRICT_BREAKOUT_STAGES.has(stage);
  const candidates=strict?candidatesForStage(stage):[];
  const pendingCount=strict?candidates.filter(c=>strictBreakoutDecision(c,stage).pending).length:0;
  const failedCount=strict?candidates.filter(c=>!strictBreakoutDecision(c,stage).eligible&&!strictBreakoutDecision(c,stage).pending).length:0;
  const displayCount=stage==='trend'&&maxBars<245?'資料不足，待MA240認證':
   strict&&arr.length===0&&pendingCount>0?'待認證':`${arr.length} 檔`;
  const auditNote=strict?`<p class="r23-note">僅顯示已認證檔數；${pendingCount?'部分股票資料待認證。':''}${failedCount?'未通過者保留在觀察區。':''}不代表買進建議。</p>`:
   stage==='trend'&&maxBars<245?`<p class="r23-note">日K不足以核算MA240，資料待認證。</p>`:'';
  const rawOnly=strict?candidates.filter(c=>!arr.some(o=>o.row?.code===c.code)):[];
  const rawGroup='raw-stage-'+stage;
  const rawMarkup=rawOnly.length?`<div class="r44-raw-stage-visible"><p class="r23-note">其他觀察股｜點選股票可展開分析（非認證買點）</p>${r26GroupMarkup(rawGroup,rawOnly.map(c=>({row:c,stage,compactStatus:'觀察｜'+strictBreakoutDecision(c,stage).reason,reason:strictBreakoutDecision(c,stage).reason})))}</div>`:'';
  return `<details class="sector-group" data-r26-group="stage-${stage}"><summary><span class="sector-nom">${esc(OBS_STAGE[stage])}</span><span class="sector-sum">${displayCount}</span><span class="sector-arrow">⌄</span></summary>${auditNote}${r26GroupMarkup('stage-'+stage,arr)}${rawMarkup}</details>`;
 };
 out.innerHTML=
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
// r65: end-of-day defensive watch. All observations use completed daily bars only.
function defensiveEarlyWarning(c){
 // r69: no future bars. Each stage is computed using data available at that close.
 const bars=c?.bars;
 if(!Array.isArray(bars)||bars.length<26)return {stage:'unknown',text:'防守預警：歷史K線不足（至少26根）'};
 const a=bars.slice(-26);
 if(a.some(b=>!Array.isArray(b)||b.length<6||[b[2],b[3],b[4],b[5]].some(v=>v==null||v===''||!Number.isFinite(Number(v))||Number(v)<=0)))return {stage:'unknown',text:'防守預警：K線或成交量缺漏，待核對'};
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
 if(yesterday.weak && today.below5 && today.below10 && today.down && (yesterday.advance||today.advance))
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
 const g=ChaopanGuidance.evaluate(c,deskEvidence(c),supportLines(c));
 return `<section class="guidance-panel battle-panel" aria-label="六大作戰價位與原始關卡圖解">
  <div class="guidance-title"><strong>◎ 超盤手｜六價位與關卡圖解</strong><span class="guidance-signal">研究版</span></div>
  <div class="r65-defensive-watch" role="status">${esc(defensiveEarlyWarning(c).text)}</div><div class="r70-defense-history" role="status">${esc(defenseHistoryText(c))}</div>
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
 if(annotated)annotated.remove(); // Avoid duplicate mini K-line: the full chart remains in 走勢圖.
 const original=[...root.children];
 const afterChart=original.indexOf(chart);let advanced=[];
 for(let i=0;i<original.length;i++){
  const el=original[i];if(el.id==='detailSwitcher'||el.classList.contains('detail-title'))continue;
  if(el===chart){graph.append(el);continue;}
  if(el.classList.contains('priority-levels')){gates.append(el);continue;}
  const heading=el.querySelector?.(':scope > summary')?.textContent||'';
  if(/歷史頸線、突破驗證與原始統計/.test(heading)){
    gates.append(el);el.open=false;continue;
  }
  if(i<afterChart||el.classList.contains('detail-actions')){
    card.append(el);continue;
  }
  // Advanced research is not deleted: move it into Settings -> Advanced Features.
  advanced.push(el.outerHTML);el.remove();
 }
 // r44.15: all lookup and ranked stocks share the exact same four-tab battle card.
 // Retain the former detail research under an optional fold; chart and gates stay intact.
 card.querySelectorAll('.fin-r13-details').forEach(el=>el.remove());
 const originalDetailMarkup=card.innerHTML;
 card.innerHTML=r47SelectionAudit(c)+sectorBattleCard(c,{source:'lookup-detail',rankText:'超盤手｜個股完整分析'})
   +'<details class="lookup-extra-research"><summary>展開原始技術研究與六價位細節</summary>'
   +originalDetailMarkup+'</details>';
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
const latestNeck=c=>c.structureV23&&Object.prototype.hasOwnProperty.call(c.structureV23,'primaryNeckline')?numeric(c.structureV23.primaryNeckline):numeric(c.structureV23?.neckline)??numeric(c.neck);
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
 // Match the detail-card risk rule: an old break is not automatically a current break.
 // A confirmed break counts only while the latest close remains below its zone.
 const rawBreaks=[...(c.supportEvidence?.levels||[]),...(c.structureV23?.recentSupports||[]),...(c.structureV23?.supports||[])];
 const broken=rawBreaks.filter(v=>{
   const lo=numeric(v?.lower),hi=numeric(v?.upper);
   return close!==null&&lo!==null&&hi!==null&&lo>0&&hi>=lo&&close<lo&&(v?.oneDayBreak===true||v?.confirmedBreak===true);
 });
 const latestBroken=broken.some(v=>v?.confirmedBreak===true);
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
  $('#modalContent').innerHTML=`<div class="detail-title"><div><div class="eyebrow">STOCK ANALYSIS / ${esc(c.market)}</div><h2 id="modalTitle">${esc(c.code)} ${esc(c.name)}</h2><div class="breakout-star-line">${breakoutStarHTML(c)} ${breakoutQualityHTML(c)}</div>${breakoutQualityExplanation(c)}<div class="detail-sub">${esc(c.date)} 盤後資料${state.mode==='demo'?' · 示範':''}</div></div><div class="detail-price"><strong>${price(c.close)}</strong><div class="${cls}">${pct(c.changePct)}</div></div></div><div class="priority-levels"><span>近期頸線 <b>${price(latestNeck(c))}</b></span><span>第一支撐 <b>${price(supportLines(c)[0]?.lower)}</b></span><span>次日預警參考 <b>${price(c.intradayPlan?.crossPrice)}</b></span></div>${guidanceCard(c)}${globalThis.ChaopanMarketRegime?.badgeFor?.(c,state.marketIntel,state.payload?.asOf)||''}<div class="chart-area"><div class="chart-top"><strong>歷史K線／成交量／均線</strong><button type="button" class="chaopan-expand" onclick="globalThis.ChaopanExpandChart(this)" aria-label="橫向放大K線">⛶ 橫向放大</button><div class="chart-range"><button class="range-btn ${state.chartDays===20?'active':''}" data-days="20">20日</button><button class="range-btn ${state.chartDays===60?'active':''}" data-days="60">60日</button><button class="range-btn ${state.chartDays===120?'active':''}" data-days="120">120日</button><button type="button" class="zoom-btn" data-zoom="in" aria-label="K線放大">＋</button><button type="button" class="zoom-btn" data-zoom="out" aria-label="K線縮小">－</button></div></div><div class="chart-window-notice" role="status">${(c.bars||[]).length<state.chartDays?`⚠ 已選 ${state.chartDays} 日，目前只有 ${(c.bars||[]).length} 根可用K線；不得視為完整 ${state.chartDays} 日型態。`:`本圖使用最近 ${Math.min(state.chartDays,(c.bars||[]).length)} 根K線。`}</div><div class="fib-toolbar"><button type="button" class="fib-toggle" aria-pressed="${!globalThis.ChaopanFibHidden}" onclick="globalThis.ChaopanToggleFib(this)">${globalThis.ChaopanFibHidden?'費波那契：隱藏':'費波那契：顯示'}</button><small>紅黃綠三色區帶｜最近120根歷史資料為基準</small></div><button type="button" class="fib-toggle" aria-pressed="${!globalThis.ChaopanRangeHidden}" onclick="globalThis.ChaopanToggleRange(this)">${globalThis.ChaopanRangeHidden?'盤整框：隱藏':'盤整框：顯示'}</button><button type="button" class="fib-toggle gap-toggle" aria-pressed="${!globalThis.ChaopanGapHidden}" onclick="globalThis.ChaopanToggleGaps(this)">${globalThis.ChaopanGapHidden?'缺口：隱藏':'缺口：顯示'}</button><span class="r58-breakout-audit" role="status">${esc(auditConsolidationBreakout(c).text)}</span><span class="r64-direction" role="status">${esc(consolidationDirection(c).text)}</span><span class="r65-chart-defense" role="status">${esc(defensiveEarlyWarning(c).text)}</span><div class="r70-defense-history" role="status">${esc(defenseHistoryText(c))}</div><span class="range-status">${(()=>{const r=detectConsolidation(c.bars||[]);return r?`最近盤整：${r.age}根前，${price(r.lower)}～${price(r.upper)}（${r.state==='down'?'已跌破':r.state==='up'?'已突破':r.state==='retest'?'回測確認（價格）':r.state==='retest_pending'?'回測待確認':r.state==='continuation'?'突破延續':'區間內'}；上緣${r.upperTouches}次／下緣${r.lowerTouches}次獨立測試）`:(auditConsolidationBreakout(c).status==='data_gap'?'⚠ K線資料不足，盤整框待核對':'最近60根未找到有效盤整區間');})()}</span><div id="chartSvg" class="${[globalThis.ChaopanFibHidden?'fib-hidden':'',globalThis.ChaopanRangeHidden?'range-hidden':'',globalThis.ChaopanGapHidden?'gap-hidden':''].filter(Boolean).join(' ')}" aria-label="雙指捏合可縮放K線">${makeChart(c.bars||[],latestNeck(c),state.chartDays,supportLines(c),c.structureV23?.necklines||[],c.structureV23?.mainDefense,c.date)}</div><small class="chart-zoom-hint">日K以 ${esc(c.date)} 收盤為準；選定期間K棒決定價格縱軸，範圍外歷史頸線仍可在「關卡圖解」查看。非即時。</small><div class="chart-legend"><span>━━ 橘色：最新頸線</span><span style="color:#c8a5e8">━━ 淺紫：其他頸線／最後防守</span><span style="color:#3dd9ba">━━ 第一支撐</span><span style="color:#76abfa">━━ 第二支撐</span><span style="color:#ffd36e">━━ MA5</span><span style="color:#8dafff">━━ MA10</span><span style="color:#eaa8ec">━━ MA20</span><span style="color:#48b7c6">▰ 費波那契三色背景（可關閉）</span><span>紅漲綠跌</span><span>灰0：防守前兆｜橘1：第一根轉弱｜紅2：第二根轉弱（均為收盤後訊號）</span></div></div><details class="fin-r13-details"><summary>📊 公司研究｜營收、EPS及合理價情境</summary>${financialPanel(c)}</details>
 ${mainTrendResearchPanel(c)}<details class="research-fold"><summary>▥ 均線強弱、六條均線與趨勢結構</summary>${maPanel(c)}${sixMaPanel(c)}${trendModePanel(c)}</details>
 <details class="research-fold"><summary>▥ 突破紅綠K、量價與續強證據</summary>${breakoutTrackPanel(c)}${liquidityPanel(c)}${continuationPanel(c)}${confirmedStrengthPanel(c)}${phasePanel(c)}</details>
 <details class="research-fold"><summary>▥ 完整價位計畫與法人風險</summary>${deskPlanHTML(c)}${ChaopanIntel.chipPanel(state.marketIntel,c,deskEvidence(c))}</details>
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
  if(chart){let distance=null;const separation=ev=>Math.hypot(ev.touches[0].clientX-ev.touches[1].clientX,ev.touches[0].clientY-ev.touches[1].clientY);
    chart.addEventListener('touchstart',ev=>{if(ev.touches.length===2)distance=separation(ev)},{passive:true});
    chart.addEventListener('touchmove',ev=>{if(ev.touches.length!==2||!distance)return;ev.preventDefault();const next=separation(ev);if(next>distance*1.24){distance=null;zoom('in')}else if(next<distance*.8){distance=null;zoom('out')}},{passive:false});
    chart.addEventListener('touchend',ev=>{if(ev.touches.length<2)distance=null},{passive:true});
    chart.addEventListener('wheel',ev=>{if(!ev.ctrlKey)return;ev.preventDefault();zoom(ev.deltaY<0?'in':'out')},{passive:false});
  }
  $('#starButton').onclick=()=>{const key=c.market+'-'+c.code;if(state.watch.has(key))state.watch.delete(key);else state.watch.add(key);saveWatch();renderDetail();toast('已更新自選清單')};
  $('#shareButton').onclick=async()=>{const info=`超盤手大量K雷達｜${c.code} ${c.name}\n${c.date} 收盤 ${price(c.close)}\n近期主要突破頸線 ${price(latestNeck(c))}\n量比 ${c.volumeRatio} 倍｜20日漲停估算 ${c.limit20} 次\n資料非即時，僅供研究。`;try{await navigator.clipboard.writeText(info);toast('已複製資訊')}catch(e){toast('請用手機內建分享功能')}};
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
function detectPriceGaps(all){
  if(!Array.isArray(all)||all.length<2)return [];
  const gaps=[];
  for(let i=1;i<all.length;i++){
    const prev=all[i-1],cur=all[i];
    const ph=Number(prev[2]),pl=Number(prev[3]),ch=Number(cur[2]),cl=Number(cur[3]);
    let dir,lower,upper;
    if(cl>ph){dir='up';lower=ph;upper=cl;}
    else if(ch<pl){dir='down';lower=ch;upper=pl;}
    else continue;
    if(!(upper>lower&&lower>0))continue;
    let filledAt=-1,partial=false;
    for(let j=i+1;j<all.length;j++){
      const h=Number(all[j][2]),l=Number(all[j][3]);
      if(dir==='up'){
        if(l<=lower){filledAt=j;break;}
        if(l<upper)partial=true;
      }else{
        if(h>=upper){filledAt=j;break;}
        if(h>lower)partial=true;
      }
    }
    gaps.push({index:i,date:String(cur[0]),dir,lower,upper,filledAt,partial});
  }
  return gaps;
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
  if(fibData.length>=20&&extremaHigh.value>extremaLow.value&&extremaHigh.index!==extremaLow.index){
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
  const visibleGaps=detectPriceGaps(all).filter(g=>g.filledAt<0&&g.index>=visibleStart&&g.lower<hi&&g.upper>lo)
    .sort((a,b)=>Math.abs((a.lower+a.upper)/2-latestClose)-Math.abs((b.lower+b.upper)/2-latestClose)).slice(0,2)
    .sort((a,b)=>a.index-b.index);
  if(visibleGaps.length){
    svg+=`<g class="chaopan-gap-layer" aria-label="未完全回補的跳空缺口">`;
    for(const g of visibleGaps){
      const y1=py(Math.min(hi,g.upper)),y2=py(Math.max(lo,g.lower));
      const x=P+(g.index-visibleStart)*step;
      // Neutral filled gap band, deliberately distinct from the outlined consolidation box.
      // Gap direction is conveyed by its arrow, not the fill color.
      const right=P+plotW;
      const bandY=Math.max(top,y1),bandH=Math.max(1,y2-bandY);
      svg+=`<rect x="${x.toFixed(1)}" y="${bandY.toFixed(1)}" width="${Math.max(1,right-x).toFixed(1)}" height="${bandH.toFixed(1)}" fill="#8c98a6" fill-opacity=".32" stroke="none"/>`;
      const label=`${g.dir==='down'?'↓':'↑'}缺口 ${price(g.lower)}～${price(g.upper)}${g.partial?' 部分回補':''}`;
      const labelY=Math.max(top+12,Math.min(top+kHeight-5,y1-5));
      svg+=`<text x="${(right-4).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="end" font-size="11" fill="#dce4ec" paint-order="stroke" stroke="#0d1a29" stroke-width="2">${esc(label)}</text>`;
    }
    svg+='</g>';
  }
  // r70 markers: position each signal at the original historical candle.
  const historicalDefense=defenseHistory(all,Math.max(60,length));
  const visibleStartIndex=all.length-data.length;
  const defenseMarkers=new Map(historicalDefense.filter(e=>e.index>=visibleStartIndex).map(e=>[e.index-visibleStartIndex,e]));
  data.forEach((b,i)=>{const x=P+step*(i+.5),[date,o,h,l,c,v]=[b[0],Number(b[1]),Number(b[2]),Number(b[3]),Number(b[4]),Number(b[5])];const color=c>=o?'#ff777f':'#3bd1b4';let yo=py(o),yc=py(c),yh=py(h),yl=py(l);svg+=`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${yh.toFixed(1)}" y2="${yl.toFixed(1)}" stroke="${color}" stroke-width="1.1"/><rect x="${(x-barW/2).toFixed(1)}" y="${Math.min(yo,yc).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1.6,Math.abs(yo-yc)).toFixed(1)}" fill="${color}" rx=".5"/><rect x="${(x-barW/2).toFixed(1)}" y="${(volTop+volHeight*(1-v/maxV)).toFixed(1)}" width="${barW.toFixed(1)}" height="${(volHeight*v/maxV).toFixed(1)}" fill="${color}" opacity=".7"/>`;const warning=defenseMarkers.get(i);if(warning){const colors={zero:'#94a3b8',first:'#f59e0b',second:'#ef4444'},numbers={zero:'0',first:'1',second:'2'};const markY=Math.max(top+10,py(h)-13);svg+=`<circle cx="${x.toFixed(1)}" cy="${markY.toFixed(1)}" r="8" fill="${colors[warning.stage]}" stroke="#0d1a29" stroke-width="1"/><text x="${x.toFixed(1)}" y="${(markY+3.6).toFixed(1)}" font-size="10" font-weight="bold" fill="#fff" text-anchor="middle">${numbers[warning.stage]}</text>`;}if(i===0||i===Math.floor(data.length/2)||i===data.length-1){svg+=`<text x="${x.toFixed(1)}" y="${H-6}" text-anchor="${i===0?'start':i===data.length-1?'end':'middle'}" font-size="12" fill="#91aabd">${esc(date.slice(5))}</text>`}});
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
function openSettings(opts={}){const isReady=state.mode==='live';$('#modalContent').innerHTML=`<div class="eyebrow">APP STATUS / SETTINGS</div><h2 id="modalTitle">資料與安裝設定</h2><div class="settings-card"><strong>目前：${modeName()}</strong><p>最近盤後日期：${esc(state.payload?.asOf||'尚無')}<br>掃描歷史完整股票：${integer(state.payload?.eligibleCount||0)} 檔<br>已記錄股票：${integer(state.payload?.stockCount||0)} 檔</p></div><div class="settings-card"><strong>如何使用免費版？</strong><p>把本程式上傳 GitHub 公開 Repository，啟用 Actions，先手動執行「初次回補約220天」，設定 Pages 從 main /root 發布，再以 Android Chrome 的「新增至主畫面」安裝。GitHub Actions 依排程在13:30、14:30、18:30、23:00以及隔日06:00、08:30嘗試核對盤後資料（實際排程可能延遲），若交易所阻擋雲端 IP，需改用在台灣網路執行的收集主機。</p></div><div class="settings-card"><strong>即時版升級狀態</strong><p>目前沒有盤中報價或推播。未來串接授權即時行情、雲端首次突破判斷及 Firebase 推播後升級；不會使用盤後資料假裝盤中訊號。</p></div><div class="settings-card"><strong>網站隱私與密碼：目前仍是公開網站</strong><p>GitHub Pages 的 JavaScript 密碼視窗不能真正保護行情或阻止已取得網址的人查看檔案，亦不能安全撤銷別人的存取權。若需要可取消授權的真正私密網站，應遷移到有伺服端登入控管的部署方式（例如 Cloudflare Pages + Access），並關閉舊公開 Pages、保護行情資料來源。不要在此公開程式中設定真實密碼。</p></div><div class="action-row"><button id="reloadData" class="primary-action">重新檢查盤後資料</button>${isReady?'':'<button id="demoModeBtn" class="secondary-action">開啟示範畫面</button>'}</div>`;$('#modalContent').insertAdjacentHTML('beforeend',`<details id="r41AdvancedSettings" class="r41-advanced-settings" ${opts.advanced?'open':''}><summary>進階功能｜技術研究與原始法人資料</summary>${r41AdvancedSettingsMarkup()}</details>`);const recent=allRows().find(x=>x.code===state.r41Advanced?.code&&x.date===state.r41Advanced?.date);if(recent){wireValuationScenario(recent);wireIntradayPanel(recent)};$('#reloadData').onclick=()=>{hideDetails();loadData()};if($('#demoModeBtn'))$('#demoModeBtn').onclick=()=>{hideDetails();demoMode()};$('#modalOverlay').hidden=false;document.body.style.overflow='hidden'}
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
   const defense=numeric(stock.structureV23?.mainDefense?.keyPrice??stock.structureV23?.mainDefense?.lower);
   const distance=v=>{
     if(close===null||close<=0||v===null||v<=0)return '待核對';
     const p=(v/close-1)*100;
     return `${p>0?'+':''}${p.toFixed(2)}%`;
   };
   const level=(name,v)=>`<span>${esc(name)} <b>${esc(distance(v))}</b></span>`;
   distancePanel.innerHTML=`<strong>${esc(stock.code)} ${esc(stock.name)}｜收盤 ${price(close)}</strong><div>${level('頸線',neck)}${level('第一支撐',numeric(supports[0]?.lower))}${level('第二支撐',numeric(supports[1]?.lower))}${level('最後防守',defense)}</div>`;
 }else{distancePanel.textContent='';}
 const chartSvg=area.querySelector('#chartSvg svg');
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
