'use strict';
const $ = s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const state={payload:null,mode:'empty',tab:'all',query:'',market:'all',sector:'all',sort:'score',confirmed:false,limitMin:false,visible:30,watch:new Set(),detail:null,chartDays:60,universe:null,detailIds:[],detailHistory:false,rankView:'20'};
const TAGS={first:'第一根發動',prep:'發動前預備',near:'接近頸線',volume:'新大量超越',limit:'20日多漲停',follow:'突破後追蹤'};
const price=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n))? Number(n).toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const integer=n=>Number.isFinite(Number(n))?Math.round(Number(n)).toLocaleString('zh-TW'):'—';
const sign=n=>Number(n)>0?'+':'';
const pct=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n))?`${sign(n)}${Number(n).toFixed(2)}%`:'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));


// V1.1 Top 60 candidate workflow. Generic CSV is NOT the proprietary 三竹匯入格式.
const sixtyKey='chaopan-sixty-snapshot-v1';
const hasData=c=>c?.investment?.overall!==null&&Number.isFinite(Number(c?.investment?.overall));
const investing=c=>hasData(c)? Number(c.investment.overall): null;
const showField=v=>v===null||v===undefined||v===''?'待資料':String(v);
const tradeScore=c=>c?.trading?.score!=null&&Number.isFinite(Number(c.trading.score))?Number(c.trading.score):-1;
const candidateRank=c=>tradeScore(c)+(c.priceConfirmed?12:c.followStatus==='突破續強'?8:c.preLaunch?4:0)+(c.investment?.growth==null?0:Math.min(10,Number(c.investment.growth)*.1))-(c.trading?.status==='不宜追價'?35:c.followStatus==='假突破警戒'?20:0);

function movingMean(values,n){return values.length>=n?values.slice(-n).reduce((a,b)=>a+b,0)/n:null}
function techMetrics(c){
 const bars=(c.bars||[]).filter(b=>Number.isFinite(+b[4])&&Number.isFinite(+b[5]));
 const cls=bars.map(b=>+b[4]), lots=bars.map(b=>+b[5]);
 const ret=n=>cls.length>n&&cls.at(-n-1)>0?100*(cls.at(-1)/cls.at(-n-1)-1):null;
 const sma=n=>movingMean(cls,n);
 const avg20=lots.length>20?movingMean(lots.slice(0,-1),20):null;
 const recent=cls.slice(-15),changes=recent.slice(1).map((v,i)=>v-recent[i]);
 const ups=changes.reduce((a,n)=>a+Math.max(0,n),0),downs=changes.reduce((a,n)=>a+Math.max(0,-n),0);
 const rsi=changes.length>=14?(downs===0?100:100-100/(1+ups/downs)):null;
 return {ret20:ret(20),ret60:ret(60),ma5:sma(5),ma20:sma(20),ma60:sma(60),avg20, rsi14:rsi};
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
// V2.7: ONE ordering for the homepage, Top60, CSV and detail navigation.
// This is a research queue, not a probability of profit or a buy recommendation.
function rankingScore(c){
 const base=numeric(c.unifiedScore);
 if(base===null||c.unifiedStage==='資料不足')return null;
 const penalty=(c.riskFirst||c.riskLevel==='high'?40:c.riskLevel==='medium'?12:0)+
     (c.overextended?8:0)+(c.possiblePriceAdjustment?12:0);
 return Math.max(0,Math.min(100,Math.round((base-penalty)*10)/10));
}
function rankedUniverse(){
 return allRows().slice().sort((a,b)=>
   (rankingScore(b)??-1)-(rankingScore(a)??-1) ||
   (numeric(b.unifiedScore)??-1)-(numeric(a.unifiedScore)??-1) ||
   (numeric(b.opportunityScore)??-1)-(numeric(a.opportunityScore)??-1) ||
   String(a.code).localeCompare(String(b.code),'zh-Hant',{numeric:true}) ||
   String(a.market).localeCompare(String(b.market),'zh-Hant'));
}
function sixtyCandidates(){return rankedUniverse().filter(c=>rankingScore(c)!==null).slice(0,60);}
function previousSixty(){try{return JSON.parse(localStorage.getItem(sixtyKey)||'null')}catch(e){return null}}
function sixtyChanges(current){
 const previous=previousSixty(), codes=current.map(x=>x.code);
 const changes=previous && previous.asOf!==state.payload?.asOf?{
  add:codes.filter(c=>!previous.codes.includes(c)),
  drop:previous.codes.filter(c=>!codes.includes(c))
 }:null;
 if(state.mode==='live' && state.payload?.asOf && (!previous||previous.asOf!==state.payload?.asOf)){
   try{localStorage.setItem(sixtyKey,JSON.stringify({asOf:state.payload.asOf,codes}))}catch(e){}
 }
 return changes;
}
function exportSixty(){
 const records=sixtyCandidates();if(!records.length){toast('目前尚無可匯出的股票');return}
 const cols=['全市場研究排名','統一觀察分數','發動階段','首次發動','突破類型','參考大量K日期','預備條件','日期','股票代號','股票名稱','市場','收盤價','技術訊號強度','操盤品質分數','趨勢延續分數','買點品質分數','風險狀態','成長品質分數','投資優先度','資料完整度','營收年增百分比','累計營收年增百分比','EPS','毛利率','本益比','股價淨值比','股息殖利率','財報期別','營收期別','官方產業','產業20日相對強度','成交量張','量比','大量K頸線','距離頸線百分比','20日漲停次數','20日報酬百分比','60日報酬百分比','MA20','RSI14','標籤'];
 const rows=[cols,...records.map((c,index)=>{
  const k=techMetrics(c);
  const f=c.fundamentals||{}, i=c.investment||{};return [index+1,rankingScore(c),c.launchStage||'未分類',c.priceConfirmed?'是':'否',c.onePriceLimit?'一字漲停':'一般',c.neckDate,c.preLaunch?'是':'否',c.date,c.code,c.name,c.market,c.close,c.score,c.trading?.score,c.trading?.trend,c.trading?.entryQuality,c.trading?.status,i.growth,i.overall,i.coverage,f.revenueYoY,f.revenueCumYoY,f.eps,f.grossMargin,f.pe,f.pb,f.dividendYield,f.epsPeriod,f.revenuePeriod,f.industry,c.trading?.sectorRelative20Pct,c.lots,c.volumeRatio,c.neck,c.distancePct,c.limit20,k.ret20?.toFixed(2),k.ret60?.toFixed(2),k.ma20?.toFixed(2),k.rsi14?.toFixed(1),(c.tags||[]).map(t=>TAGS[t]).join('|')];
 })];
 const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
 const a=document.createElement('a');a.href=url;a.download=`超盤手_前60名_${state.payload?.asOf||'未標示日期'}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 toast('已匯出通用CSV，不能直接視為三竹可匯入格式');
}
async function copySixty(){
 const list=sixtyCandidates();if(!list.length){toast('目前沒有候選名單');return}
 const value=list.map(x=>x.code).join(',');
 try{await navigator.clipboard.writeText(value);toast(`已複製 ${list.length} 檔代號`)}catch(e){toast('複製失敗，請使用CSV下載')}
}
function showSixty(){
 const records=sixtyCandidates(),changed=sixtyChanges(records);
 const rows=records.map((c,i)=>`<button type="button" class="rank-modal-row" data-rank-stock="${esc(rowId(c))}"><strong>#${i+1} ${esc(c.code)} ${esc(c.name)}</strong><span>觀察分 ${rankingScore(c)??'—'}｜${esc(c.unifiedStage||'待資料')}｜觸發 ${price(c.intradayPlan?.crossPrice)}</span></button>`).join('');
 const delta=changed?`<p style="font-size:13px">相較上次資料日：新進 ${changed.add.length} 檔，移出 ${changed.drop.length} 檔</p>`:'<p style="font-size:13px">首次開啟或同資料日期，尚無可比對的昨日名單。</p>';
 $('#modalContent').innerHTML=`<div class="eyebrow">ONE CONSISTENT RANK / TOP 60</div><h2 id="modalTitle">全市場前60名觀察</h2><p>盤後資料：${esc(state.payload?.asOf||'—')}｜首頁、此表與CSV採相同排序；高風險降權、資料不足置後。不代表未來績效或實際可買入。</p>${delta}<div class="action-row"><button id="sixtyCsv" class="primary-action">下載前60名 CSV</button><button id="sixtyCopy" class="secondary-action">複製股票代號</button></div><div class="rank-modal-list">${rows||'<p>尚無候選股票</p>'}</div>`;
 $('#sixtyCsv').onclick=exportSixty;$('#sixtyCopy').onclick=copySixty;
 $$('#modalContent [data-rank-stock]').forEach(btn=>btn.onclick=()=>showDetails(btn.dataset.rankStock));
 $('#modalOverlay').hidden=false;document.body.style.overflow='hidden';
}
function setupSixtyToolbar(){
 if($('#sixtyToolbar'))return;
 const wrap=document.createElement('div');wrap.id='sixtyToolbar';wrap.className='action-row';wrap.style.margin='10px 0 15px';
 wrap.innerHTML='<button id="sixtyOpen" class="secondary-action">前60名一覽・可點股票</button><button id="sixtyExport" class="secondary-action">下載排行 CSV</button>';
 const anchor=$('#infoBanner');anchor.parentNode.insertBefore(wrap,anchor);
 $('#sixtyOpen').onclick=showSixty;$('#sixtyExport').onclick=exportSixty;
}

function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove('show'),2600)}
function loadWatch(){try{state.watch=new Set(JSON.parse(localStorage.getItem('radar-watchlist')||'[]'))}catch(e){state.watch=new Set()}}
function saveWatch(){localStorage.setItem('radar-watchlist',JSON.stringify([...state.watch]))}
function setTab(tab){state.tab=tab;state.visible=30;$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));renderList();$('#candidateList').scrollIntoView({behavior:'smooth',block:'nearest'})}
function modeName(){return state.mode==='demo'?'示範資料':state.mode==='live'?'盤後資料':state.mode==='warming'?'歷史累積中':state.mode==='partial'?'上市櫃資料不同步':'尚未建立'}
async function loadData(){
  if(window.__RADAR_PREVIEW__){state.payload=window.__RADAR_PREVIEW__;state.mode='demo';render();return}
  $('#dataStatus').textContent='讀取中';
  try{
    const response=await fetch(`./data/radar.json?t=${Date.now()}`,{cache:'no-store'});
    if(!response.ok) throw new Error('HTTP '+response.status);
    const obj=await response.json();
    if(!obj || !Array.isArray(obj.candidates))throw new Error('資料格式無效');
    state.universe=null;state.payload=obj;state.mode=obj.mode==='live'?'live':obj.mode==='warming'?'warming':obj.mode==='partial'?'partial':'empty';
    state.universe=null;
    try{
      const full=await fetch(`./data/universe.json?t=${Date.now()}`,{cache:'no-store'});
      if(full.ok){const u=await full.json();if(u?.asOf===obj.asOf && Array.isArray(u.rows)&&u.rows.length>500){
        const candidates=new Map((obj.candidates||[]).map(c=>[c.market+'-'+c.code,c]));
        u.rows=u.rows.map(row=>{
          const match=candidates.get(row.market+'-'+row.code);
          return match?{...row,...match,riskLevel:row.riskLevel,riskStatus:row.riskStatus,
             riskReasons:row.riskReasons,riskEvidence:row.riskEvidence,supportEvidence:row.supportEvidence,structureV23:row.structureV23,intradayPlan:row.intradayPlan,
             neck:row.neck,neckDate:row.neckDate,distancePct:row.distancePct,
             priceConfirmed:row.priceConfirmed,preLaunch:row.preLaunch,followStatus:row.followStatus,
             launchStage:row.launchStage,tags:row.tags,unifiedStage:row.unifiedStage,
             unifiedScore:row.unifiedScore,unifiedReasons:row.unifiedReasons,relMarket5Pct:row.relMarket5Pct,
             relSector5Pct:row.relSector5Pct,marketProxyNote:row.marketProxyNote,
             opportunityScore:row.opportunityScore,decision:row.decision,industry:row.industry}:row;
        });
        state.universe=u;
      }}
    }catch(err){console.info('全市場個股診斷資料待更新',err)}
  }catch(ex){state.payload={candidates:[],counts:{},stockCount:0,eligibleCount:0};state.mode='empty';console.warn(ex)}
  render();
}
async function demoMode(){
  try{const res=await fetch('./data/demo.json'); if(!res.ok)throw new Error('failed');state.payload=await res.json();state.mode='demo';render();toast('已開啟示範畫面：不代表真實行情')}
  catch(ex){toast('無法開啟示範資料')}
}
function render(){
  const x=state.payload||{candidates:[],counts:{}};
  $('#marketDate').textContent=(x.asOf||'—')+(state.mode==='demo'?' · 範例':'');
  $('#dataStatus').textContent=modeName()+(x.rulesVersion==='eod-v2.6-next-session'?' · V2.7排行／V2.6盤中策略資料':x.rulesVersion==='eod-v2.5-cycle'?' · V2.5事件追蹤':' · 需重新執行新版盤後掃描');
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
      '；站上MA20 '+pct(k.aboveMa20Pct)+'；20日創高 '+integer(k.breakoutHigh20Count)+' 檔'}).join('<br>')+
      '<br><small>法人與國際指數：尚未接入，不參與評分；市場廣度由當日個股價格推算。</small>';
  }else if(health)health.hidden=true;
  const coverage=$('#universeHealth');
  if(coverage){
   if(state.universe){coverage.hidden=false;coverage.textContent=`全市場診斷已載入：${integer(state.universe.coverage)} 檔，同一交易日 ${state.universe.asOf}。包含未入選大量K股票；高風險股票會降級但仍可搜尋。疑似出貨只表示量價警訊，不代表已查得主力真實持股。`}
   else {coverage.hidden=false;coverage.textContent='⚠ 全市場個股診斷資料未取得、日期不一致或未完成重算。目前只顯示舊版候選股，不能視為已完成V2.4全市場結構掃描。請確認GitHub Actions執行及data/universe.json已發布。'}
  }
  renderList();
}
function updateSectors(){
 const select=$('#sectorFilter');if(!select)return;
 const names=[...new Set(allRows().map(x=>x.industry||x.fundamentals?.industry).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 const old=state.sector;select.innerHTML='<option value="all">所有產業</option>'+names.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
 state.sector=names.includes(old)?old:'all';select.value=state.sector;
}
function filtered(){
 const q=state.query.trim().toLowerCase();
 return rankedUniverse().filter(c=>{
   if(state.tab==='star'&&!state.watch.has(rowId(c)))return false;
   if(q && !String(c.code).includes(q) && !String(c.name).toLowerCase().includes(q))return false;
   return true;
 });
}
function renderList(){
 const list=$('#candidateList'),more=$('#showMore'),data=allRows();
 if(!data.length){
   const ready=state.mode==='live'||state.mode==='warming'||state.mode==='partial';
   list.innerHTML=`<div class="empty-state"><h3>${ready?'暫無候選資料':'雷達等待首次資料啟用'}</h3><p>${ready?'請檢查雷達資料日期與全市場資料是否同步。':'部署並完成盤後資料回補才有真實全市場排行。'}</p></div>`;
   more.hidden=true;$('#rankSummary').textContent='等待盤後資料';return;
 }
 const cards=filtered();
 const rawRank=rankedUniverse();
 const rankById=new Map(rawRank.map((c,i)=>[rowId(c),i+1]));
 const showAll=state.query.trim()||state.tab==='star'||state.rankView==='all';
 const cap=showAll?state.visible:Number(state.rankView);
 const shown=cards.slice(0,cap);
 $('#rankSummary').textContent=state.query.trim()?`搜尋 ${cards.length} 檔｜保留全市場名次`:
  state.tab==='star'?`自選追蹤 ${cards.length} 檔`:
  `依同一排序顯示前 ${Math.min(cap,cards.length)} 名｜${state.universe?'全市場':'目前可讀'} ${rawRank.length} 檔（含風險與資料不足）`;
 $$('.rank-scope').forEach(b=>{b.classList.toggle('active',b.dataset.scope===state.rankView);b.setAttribute('aria-pressed',b.dataset.scope===state.rankView?'true':'false')});
 if(!cards.length){list.innerHTML='<div class="empty-state"><h3>沒有符合的股票</h3><p>可更換股票名稱／代號或返回全部排行。</p></div>';more.hidden=true;return;}
 list.innerHTML=shown.map(c=>{
   const id=esc(rowId(c)),cls=c.changePct>0?'rising':c.changePct<0?'falling':'neutral';
   const riskTag=c.riskLevel==='high'||c.riskFirst?'<span class="signal-tag risk-high">高風險・已降權</span>':c.riskLevel==='medium'?'<span class="signal-tag risk">轉弱風險・已降權</span>':'<span class="signal-tag risk-low">無高風險組合</span>';
   const tags=riskTag+(c.priceConfirmed?'<span class="signal-tag confirmed">首破待驗證</span>':'')+(c.followStatus==='假突破警戒'?'<span class="signal-tag risk">假突破警戒</span>':'')+(c.possiblePriceAdjustment?'<span class="signal-tag risk">股價需核對</span>':'')+(c.unifiedStage==='資料不足'?'<span class="signal-tag risk">資料不足</span>':'');
   const trigger=c.intradayPlan?.crossPrice;
   const quick=trigger!=null?`<button type="button" class="quick-intraday" data-intraday-id="${id}">✎ 盤中輸入價量・立即試算 <span>→</span></button>`:
     `<button type="button" class="quick-intraday unavailable" data-intraday-id="${id}">查看個股・盤中關卡待資料 →</button>`;
   return `<div class="ranked-stock"><button type="button" class="stock-card" data-id="${id}" aria-label="查看第${rankById.get(rowId(c))}名 ${esc(c.name)} 詳情">
     <div class="rank-head"><span class="rank-number">#${rankById.get(rowId(c))} 全市場觀察排名</span><span class="rank-score">觀察分 ${rankingScore(c)??'待資料'}/100（非勝率）</span></div>
     <div class="stock-head"><div><span class="ticker">${esc(c.code)}</span><span class="ticker-name">${esc(c.name)}</span><span class="market-chip">${esc(c.market)}</span><span class="market-chip">${esc(c.industry||c.fundamentals?.industry||'產業待資料')}</span></div><div class="right-value"><div class="stock-price">${price(c.close)}</div><span class="stock-change ${cls}">${pct(c.changePct)}</span></div></div>
     <div class="tagrow">${tags}</div><div class="rank-stage">${esc(c.unifiedStage||'待新版資料')} · ${esc(c.entryReadiness||'等待判斷')}</div>
     <div class="stock-bottom"><span class="metric">近期頸線 <strong>${price(latestNeck(c))}</strong></span><span class="metric">盤中觸發 <strong>${price(trigger)}</strong></span><span class="metric">日量比 <strong>${Number.isFinite(Number(c.volumeRatio))?Number(c.volumeRatio).toFixed(1)+'×':'—'}</strong></span></div>
   </button>${quick}</div>`;
 }).join('');
 $$('.stock-card').forEach(btn=>btn.onclick=()=>showDetails(btn.dataset.id));
 $$('.quick-intraday').forEach(btn=>btn.onclick=()=>showDetails(btn.dataset.intradayId,true));
 more.hidden=!showAll||cards.length<=state.visible;
 if(!more.hidden)more.textContent=`再顯示 ${Math.min(30,cards.length-state.visible)} 檔 ↓（共 ${cards.length} 檔）`;
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
 const journal=history.length?`<details class="fin-notes"><summary>最近階段變化紀錄（${history.length}筆）</summary><div class="cycle-history">${history.map(x=>`<p>${esc(x.date)}｜${esc(x.stage)}｜頸線 ${price(x.neck)}｜風險 ${esc(x.risk)}</p>`).join('')}</div></details>`:'<small>正式更新後開始逐日保存階段變化，無歷史紀錄不補造。</small>';
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
 const percentBar=(v,title,period)=>{
   const num=numeric(v);if(num===null)return `<div class="fin-trend-row"><span>${esc(title)}</span><strong>待資料</strong></div>`;
   const length=Math.min(100,Math.abs(num)/60*100).toFixed(1);
   return `<div class="fin-trend-row"><div><span>${esc(title)}</span><strong class="${num>=0?'fin-up':'fin-down'}">${pct(num)}</strong></div><div class="fin-bar-track"><i class="${num>=0?'pos':'neg'}" style="width:${length}%"></i></div>${period?`<small>${esc(period)}</small>`:''}</div>`;
 };
 const score=(v,label)=>{const n=numeric(v);return `<div class="fin-score"><small>${esc(label)}</small><b>${n===null?'—':Math.max(0,Math.min(100,n)).toFixed(0)}</b><div class="score-track"><i style="width:${n===null?0:Math.max(0,Math.min(100,n))}%"></i></div></div>`};
 const item=(v,label,formatter='num')=>`<div class="fin-stat"><small>${esc(label)}</small><b>${numeric(v)===null?'—':formatter==='pct'?pct(v):price(v)}</b></div>`;
 return `<section class="visual-fin" aria-label="基本面視覺化資料">
  <div class="panel-head"><span>基本面｜圖像化總覽</span><small>公開資料，不是上漲機率</small></div>
  <div class="finance-scores">${score(i.technical,'技術')}${score(i.growth,'成長')}${score(i.overall,'優先研究')}</div>
  <div class="fin-subhead">營收動能 <small>相同尺度最大顯示 ±60%；超過截頂</small></div>
  ${percentBar(fin.revenueYoY,'單月年增',fin.revenuePeriod)}${percentBar(fin.revenueCumYoY,'累計年增','')}
  <div class="fin-subhead">獲利與評價 <small>${esc(fin.epsPeriod||'財報期別待資料')}</small></div>
  <div class="fin-metrics">${item(fin.eps,'EPS')}${item(fin.grossMargin,'毛利率','pct')}${item(fin.pe,'本益比')}${item(fin.pb,'淨值比')}${item(fin.dividendYield,'殖利率','pct')}${item(i.coverage,'資料覆蓋','pct')}</div>
  <details class="fin-notes"><summary>查看資料期別、計算說明與限制</summary><p>官方產業：${esc(fin.industry||c.industry||'待資料')}。營收期別：${esc(fin.revenuePeriod||'待資料')}；EPS期別：${esc(fin.epsPeriod||'待資料')}；本益比資料日：${esc(fin.valuationDate||'待資料')}。</p><p>${esc(i.methodNote||'缺少完整公開財務欄位，無法計算基本面分數。')}</p><p>${esc(i.datePolicy||'公布時點尚待核對')}。資料不足時不補零、不推估；法人交易資料及產業消息沒有納入評分。指標分數是規則式研究排序，不是買點保證。</p></details>
 </section>`;
}
function technicalVisual(c){
 const k=techMetrics(c),i=indicatorSnapshot(c);
 const obv=i.obvDelta===null?'待資料':i.obvDelta>0?'量能偏累積':i.obvDelta<0?'量能偏流出':'量能持平';
 const macd=i.macd===null?'待資料':i.macd>=i.macdSignal?'MACD 高於訊號線':'MACD 低於訊號線';
 const rsi=i.rsi===null?'—':i.rsi.toFixed(1);
 return `<section class="visual-tech"><div class="panel-head"><span>量價輔助判讀</span><small>以公開日K自行計算</small></div><div class="tech-chips"><div><small>RSI(14)</small><strong>${rsi}</strong></div><div><small>MACD</small><strong>${esc(macd)}</strong></div><div><small>OBV近5日</small><strong>${esc(obv)}</strong></div></div><details class="fin-notes"><summary>技術數據與限制</summary><p>MA5 ${price(k.ma5)} ／ MA20 ${price(k.ma20)} ／ MA60 ${price(k.ma60)}。近20日 ${pct(k.ret20)} ／ 近60日 ${pct(k.ret60)}。</p><p>MACD、OBV與RSI僅作輔助，沒有將彼此高度相關的訊號重複加分。不是三竹專屬數據，也不能由此證明主力正在出貨。</p></details></section>`;
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
 const growthHtml=`<div class="settings-card"><strong>基本面與投資優先度｜公開資料</strong><p>技術分 ${i.technical??'待資料'} ／ 基本面觀察分 ${i.growth??'待資料'} ／ 投資優先度 ${i.overall??'待資料'}<br>分級 ${esc(i.grade||'待資料')} ／ 財務資料覆蓋 ${i.coverage??0}%<br>月營收年增 ${fp(fin.revenueYoY)}（${esc(fin.revenuePeriod||'未取得')}） ／ 累計營收年增 ${fp(fin.revenueCumYoY)}<br>EPS ${fstr(fin.eps)}（${esc(fin.epsPeriod||'未取得')}） ／ 毛利率 ${fp(fin.grossMargin)}<br>本益比 ${fstr(fin.pe)} ／ 淨值比 ${fstr(fin.pb)} ／ 殖利率 ${fp(fin.dividendYield)}<br>產業類別 ${esc(fin.industry||'待資料')} ／ 本益比資料日期 ${esc(fin.valuationDate||'待資料')}<br>評分方法 ${esc(i.methodNote||'舊版資料，待新版掃描')}<br>資料可用日期 ${esc(i.datePolicy||'待重算')}<br>法人交易資訊如有來源核對一致僅供檢視、不參與評分；產業消息及EPS年增率尚未正式串接。</p><p>⚠ 分數是規則式研究排序，不是股價上漲機率或保證買點。資料不足時不給投資優先度。</p></div>`;
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
 const ids=filtered().map(rowId);
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
 const c=allRows().find(x=>rowId(x)===id);if(!c)return;
 state.detailIds=detailNavigationIds(id);
 state.detail=c;state.chartDays=60;
 if($('#modalOverlay').hidden){history.pushState({chaopanDetail:true},'',location.href);state.detailHistory=true;}
 renderDetail();$('#modalOverlay').hidden=false;document.body.style.overflow='hidden';
 if(jumpIntraday)jumpToIntraday();
}
function jumpToIntraday(){
 const sheet=$('#modalOverlay .sheet'),panel=$('#modalContent .intraday-panel');
 if(!sheet||!panel)return;
 requestAnimationFrame(()=>{
   const rect=panel.getBoundingClientRect(),parent=sheet.getBoundingClientRect();
   sheet.scrollTop=Math.max(0,sheet.scrollTop+rect.top-parent.top-14);
   const field=$('#v26Time')||$('#v26Open');
   if(field)field.focus({preventScroll:true});
 });
}
function hideDetails(fromPop=false){
 $('#modalOverlay').hidden=true;document.body.style.overflow='';state.detail=null;
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
function intradayPanel(c){
 const p=c.intradayPlan;
 if(!p||p.crossPrice==null)return `<section class="intraday-panel"><h3>下一交易日盤中觀察計畫</h3><p class="intraday-small">${esc(p?.status||'等候V2.6全市場盤後資料更新')}。沒有可靠頸線時不補造進場觸發價。</p></section>`;
 const avg=p.avg20Lots?integer(p.avg20Lots):'待資料';
 const cautions=(p.riskNotes||[]).map(a=>`<div>⚠ ${esc(a)}</div>`).join('');
 return `<section class="intraday-panel" aria-label="隔日盤中手動檢查">
  <h3>隔日盤中突破預判｜券商資料手動核對</h3>
  <div class="muted">依 ${esc(p.asOf)} 收盤已知資料預算，適用<strong>下個實際交易日</strong>；若你看的已是其他交易日，應先等最新盤後資料。網站無盤中行情，不會自行判斷現在是否突破。</div>
  <div class="intraday-kpis"><div><small>近期頸線</small><strong>${price(p.neckline)}</strong></div><div><small>初步跨越</small><strong>${price(p.crossPrice)}</strong></div><div><small>較強突破價格參考</small><strong>${price(p.strengthPrice)}</strong></div><div><small>超過需防追價</small><strong>${price(p.chaseLine)}</strong></div></div>
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
  <div id="v26Result" class="intraday-status">輸入同一交易日的價量資料，開始手動核對盤中條件。</div>
  <div class="intraday-small">量門檻會隨上面時間選擇變動，根據「日均量 × 估計分時累積比例 × 1.3」粗估，<strong>不是</strong>過去20日同時刻的實測量比，不適合單獨作為交易理由。盤中紅K與收盤位置都可能在13:30前改變；跳空過大、破位或上影轉長時即使量大仍應提高警戒。${cautions}</div>
 </section>`;
}
function wireIntradayPanel(c){
 const p=c.intradayPlan;if(!p?.crossPrice)return;
 const ids=['v26Time','v26Open','v26Price','v26High','v26Low','v26Volume','v26Hold'];
 const getNum=id=>{const v=$('#'+id)?.value;return v!==''&&v!=null&&Number.isFinite(Number(v))?Number(v):null;};
 const out=$('#v26Result');
 const calculate=()=>{
   const time=$('#v26Time')?.value,open=getNum('v26Open'),priceNow=getNum('v26Price'),high=getNum('v26High'),low=getNum('v26Low'),volume=getNum('v26Volume');
   const required=[open,priceNow,high,low,volume];
   if(required.some(x=>x===null)) {out.className='intraday-status';out.textContent='請填入同一交易日的開、高、低、現價與累計張數；本站不會自動抓盤中報價。';return;}
   if(open<=0||priceNow<=0||low<=0||high<low||high<open||high<priceNow||low>open||low>priceNow||volume<0){out.className='intraday-status danger';out.textContent='輸入價量前後矛盾；請核對K線的開高低及最新成交價，成交量使用「張」。';return;}
   const target=p.volumeTargets?.[time];
   const loc=high>low?(priceNow-low)/(high-low):1;
   const wick=high>low?(high-Math.max(open,priceNow))/(high-low):0;
   const body=priceNow>open;
   const closeHigh=loc>=.70&&wick<=.30;
   const enough=target!=null&&volume>=target;
   const pass=Number(body)+Number(closeHigh)+Number(enough);
   const stood=$('#v26Hold')?.checked;
   const gap=(open/Number(p.referenceClose)-1)*100;
   const chase=priceNow>=p.chaseLine||gap>p.gapCautionPct;
   const dangerous=c.riskLevel==='high'||c.riskFirst||p.status.includes('風險優先');
   const broken=p.supportFloor!=null&&priceNow<Number(p.supportFloor);
   const above=priceNow>=p.crossPrice;
   const firm=priceNow>=p.strengthPrice;
   const near=p.neckline>0&&priceNow>=p.neckline*.995;
   const notes=[];
   let headline='',tone='warn';
   if(broken){headline='支撐失守警戒／不將反彈誤認起漲';tone='danger';}
   else if(!above){headline=near?'接近頸線，但尚未跨越觸發價':'尚未觸及突破價／觀察中';if(high>=p.crossPrice){headline='盤中一度突破但目前跌回／假突破警戒';tone='danger';}}
   else if(dangerous){headline='雖已跨越頸線，既有結構風險仍應優先處理';tone='danger';}
   else if(chase){headline='已站上但追價風險偏高／先觀察回測';tone='warn';}
   else if(!stood){headline='價格已突破／尚待確認至少15分鐘站穩';}
   else if(firm&&pass>=2){headline='盤中條件較佳／仍非日K收盤確認';tone='good';}
   else {headline='盤中突破但量價證據不足／持續觀察';}
   if(!body)notes.push('目前不是實體紅K');
   if(!closeHigh)notes.push('現價位置或上影線品質不足');
   if(!enough)notes.push(`粗估累計量門檻 ${integer(target)} 張，目前 ${integer(volume)} 張`);
   if(gap>p.gapCautionPct)notes.push(`開盤跳空 ${gap.toFixed(1)}%，留意開盤高點和回測`);
   if(priceNow>=p.chaseLine)notes.push('距原頸線已偏遠，追價價差增加');
   if(low<p.neckline && above)notes.push('盤中曾跌破頸線，需核對是否真有穩定收復');
   out.className='intraday-status '+tone;
   out.textContent=headline+'。價位 '+price(priceNow)+' / 觸發 '+price(p.crossPrice)+'；'+
       `紅K ${body?'是':'否'}、位置 ${(loc*100).toFixed(0)}%、量 ${integer(volume)}/${integer(target)} 張（粗估）、條件 ${pass}/3。`+
       (notes.length?' 注意：'+notes.join('；')+'。':'')+' 請以券商即時報價核對，非自動買賣訊號。';
 };
 ids.forEach(id=>{const el=$('#'+id);if(el){el.addEventListener('input',calculate);el.addEventListener('change',calculate);}});
}

function renderDetail(){const c=state.detail;if(!c)return;const starred=state.watch.has(c.market+'-'+c.code),cls=c.changePct>0?'rising':c.changePct<0?'falling':'neutral';
  $('#modalContent').innerHTML=`${detailNav()}<div class="detail-title"><div><div class="eyebrow">STOCK ANALYSIS / ${esc(c.market)}</div><h2 id="modalTitle">${esc(c.code)} ${esc(c.name)}</h2><div class="detail-sub">${esc(c.date)} 盤後資料${state.mode==='demo'?' · 示範':''}</div></div><div class="detail-price"><strong>${price(c.close)}</strong><div class="${cls}">${pct(c.changePct)}</div></div></div><div class="tagrow">${(c.tags||[]).map(t=>`<span class="signal-tag ${t}">${esc(TAGS[t]||t)}</span>`).join('')}${c.priceConfirmed?'<span class="signal-tag confirmed">價格收盤確認</span>':c.confirmed?'<span class="signal-tag confirmed">最大量確認</span>':''}</div><div class="detail-grid"><div class="detail-metric"><div class="small">近期主要突破頸線</div><strong>${price(latestNeck(c))} 元</strong><div class="small">${esc(c.structureV23?.necklineDate||c.neckDate||'尚無壓力點')}${c.priceConfirmed&&c.neck!==latestNeck(c)?'／突破當日參考 '+price(c.neck):''}</div></div><div class="detail-metric"><div class="small">距離近期頸線</div><strong>${pct(latestNeck(c)>0?100*(Number(c.close)/latestNeck(c)-1):null)}</strong><div class="small">正值代表已突破</div></div><div class="detail-metric"><div class="small">當日成交量</div><strong>${integer(c.lots)} 張</strong><div class="small">前10日均量 ${Number(c.volumeRatio).toFixed(2)} 倍</div></div><div class="detail-metric"><div class="small">近20日漲停估算</div><strong>${integer(c.limit20)} 次</strong><div class="small">含今天，依收盤價近似判定</div></div><div class="detail-metric"><div class="small">前120日最大量</div><strong>${integer(c.oldMaxLots)} 張</strong><div class="small">${esc(c.oldMaxDate||'—')}</div></div><div class="detail-metric"><div class="small">突破確認</div><strong>${c.priceConfirmed?'價格已突破':c.confirmed?'成交量創新高（非首破）':'尚未確認首破'}</strong><div class="small">低量一字漲停也可價格確認；大量另計</div></div></div>${summaryPanel(c)}<div class="intraday-shortcut"><button type="button" id="intradayJump">✎ 盤中輸入價格與成交量 →</button><small>前一天預算好條件；盤中用券商即時報價自行核對</small></div>${intradayPanel(c)}${cyclePanel(c)}<div class="chart-area"><div class="chart-top"><strong>歷史K線／成交量</strong><div class="chart-range"><button class="range-btn ${state.chartDays===20?'active':''}" data-days="20">20日</button><button class="range-btn ${state.chartDays===60?'active':''}" data-days="60">60日</button><button class="range-btn ${state.chartDays===120?'active':''}" data-days="120">可用日K</button></div></div><div id="chartSvg">${makeChart(c.bars||[],latestNeck(c),state.chartDays,supportLines(c),c.structureV23?.necklines||[],c.structureV23?.mainDefense)}</div><div class="chart-legend"><span>━━ 橘色：最新頸線</span><span style="color:#c8a5e8">┄┄ 淺紫：其他頸線／最後防守</span><span style="color:#3dd9ba">━━ 第一支撐</span><span style="color:#76abfa">━━ 第二支撐</span><span>紅漲綠跌</span></div></div>${financialPanel(c)}${technicalVisual(c)}${riskPanel(c)}<details class="fin-notes secondary-details"><summary>展開大量K突破、操盤品質與法人詳情</summary>${launchSummary(c)}${traderPanel(c)}${extraTechnical(c)}</details><div class="detail-note">${c.tags?.includes('volume')?'✓ 今日成交量大於前120個交易日最大量，且收盤高於舊最大量K最高價。':''} ${c.tags?.includes('first')?'✓ 今日收盤首次突破仍有效的大量K高點。':''} ${c.overextended?'⚠ 收盤距頸線已逾8%，應留意追高風險。':''}<br>盤後訊號僅供觀察，不代表次日買點；除權息可能導致假突破。</div><div class="detail-actions"><button class="primary-action" id="starButton">${starred?'★ 移出自選':'☆ 加入自選'}</button><button class="secondary-action" id="shareButton">分享股票資訊</button></div>`;
  wireIntradayPanel(c);
  if($('#intradayJump'))$('#intradayJump').onclick=jumpToIntraday;
  $('#detailPrev').onclick=()=>nextDetail(-1);$('#detailNext').onclick=()=>nextDetail(1);
  $$('.range-btn').forEach(b=>b.onclick=()=>{state.chartDays=b.dataset.days==='120'?120:Number(b.dataset.days);renderDetail()});
  $('#starButton').onclick=()=>{const key=c.market+'-'+c.code;if(state.watch.has(key))state.watch.delete(key);else state.watch.add(key);saveWatch();renderDetail();toast('已更新自選清單')};
  $('#shareButton').onclick=async()=>{const info=`超盤手大量K雷達｜${c.code} ${c.name}\n${c.date} 收盤 ${price(c.close)}\n近期主要突破頸線 ${price(latestNeck(c))}\n量比 ${c.volumeRatio} 倍｜20日漲停估算 ${c.limit20} 次\n資料非即時，僅供研究。`;try{await navigator.clipboard.writeText(info);toast('已複製資訊')}catch(e){toast('請用手機內建分享功能')}};
}
function makeChart(bars,neck,days,supports=[],necklines=[],mainDefense=null){let data=bars.slice(-days).filter(b=>[1,2,3,4,5].every(i=>Number.isFinite(Number(b[i]))));if(!data.length)return '<div class="empty-state">沒有歷史K線可顯示</div>';
  const W=600,H=289,P=33,plotW=W-P-36,top=20,kHeight=186,volTop=225,volHeight=42;
  const included=(supports||[]).map(s=>numeric(s.lower)).filter(v=>v!==null&&v>0);
  if(mainDefense?.lower>0)included.push(Number(mainDefense.lower));
  const maxP=Math.max(...data.map(b=>Number(b[2])),Number(neck)||0)*1.02,minP=Math.min(...data.map(b=>Number(b[3])),Number(neck)||Infinity,...included)*.98;
  let lo=Number.isFinite(minP)?minP:0,hi=maxP;if(hi<=lo)hi=lo+1;
  const py=n=>top+(hi-n)/(hi-lo)*kHeight,step=plotW/data.length,barW=Math.max(1.5,Math.min(8,step*.62));const maxV=Math.max(...data.map(b=>Number(b[5])),1);
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="近${data.length}日收盤K線、成交量及大量K壓力線">`;
  for(let i=0;i<=4;i++){const y=top+kHeight*i/4,v=hi-(hi-lo)*i/4;svg+=`<line x1="${P}" x2="${W-36}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#284057" stroke-width="1" opacity=".65"/><text x="${W-32}" y="${y+4}" fill="#8198aa" font-size="10">${v.toFixed(1)}</text>`}
  const annotations=[];
  const secondaryNecks=necklines.filter(v=>Number.isFinite(Number(v.price)) && Math.abs(Number(v.price)-Number(neck))>.0001 && v.price>=Number(data[data.length-1][4])*.97).slice(0,3);
  for(const v of secondaryNecks){const val=Number(v.price);if(val<lo||val>hi)continue;const y=py(val);svg+=`<line x1="${P}" x2="${W-36}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#b49acf" stroke-width="1" stroke-dasharray="2 5" opacity=".8"/>`;annotations.push({y:y-5,color:'#b49acf',label:`歷史頸線 ${price(val)}`})}
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
   if(e.target.closest('button,input,select,textarea,a,summary,[contenteditable="true"]'))return;
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
function openSettings(){const isReady=state.mode==='live';$('#modalContent').innerHTML=`<div class="eyebrow">APP STATUS / SETTINGS</div><h2 id="modalTitle">資料與安裝設定</h2><div class="settings-card"><strong>目前：${modeName()}</strong><p>最近盤後日期：${esc(state.payload?.asOf||'尚無')}<br>掃描歷史完整股票：${integer(state.payload?.eligibleCount||0)} 檔<br>已記錄股票：${integer(state.payload?.stockCount||0)} 檔</p></div><div class="settings-card"><strong>如何使用免費版？</strong><p>把本程式上傳 GitHub 公開 Repository，啟用 Actions，先手動執行「初次回補約220天」，設定 Pages 從 main /root 發布，再以 Android Chrome 的「新增至主畫面」安裝。GitHub Actions 依排程在13:30、14:30、18:30、23:00以及隔日06:00、08:30嘗試核對盤後資料（實際排程可能延遲），若交易所阻擋雲端 IP，需改用在台灣網路執行的收集主機。</p></div><div class="settings-card"><strong>即時版升級狀態</strong><p>目前沒有盤中報價或推播。未來串接授權即時行情、雲端首次突破判斷及 Firebase 推播後升級；不會使用盤後資料假裝盤中訊號。</p></div><div class="action-row"><button id="reloadData" class="primary-action">重新檢查盤後資料</button>${isReady?'':'<button id="demoModeBtn" class="secondary-action">開啟示範畫面</button>'}</div>`;$('#reloadData').onclick=()=>{hideDetails();loadData()};if($('#demoModeBtn'))$('#demoModeBtn').onclick=()=>{hideDetails();demoMode()};$('#modalOverlay').hidden=false;document.body.style.overflow='hidden'}
function navTo(page){$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));if(page==='list'){setTab('all');$('.content-area').scrollIntoView({behavior:'smooth'})}else if(page==='star'){state.tab='star';$$('.tab').forEach(x=>x.classList.remove('active'));renderList();$('.content-area').scrollIntoView({behavior:'smooth'})}else if(page==='guide')$('#guide').scrollIntoView({behavior:'smooth'});else openSettings()}
function wire(){loadWatch();setupSixtyToolbar();setupDetailSwipe();$$('.rank-scope').forEach(b=>b.onclick=()=>{state.rankView=b.dataset.scope;state.visible=30;state.tab='all';renderList()});const sort=$('#sortFilter');if(sort){sort.insertAdjacentHTML('afterbegin','<option value="trade">操盤品質與追高風險（預設）</option><option value="launch">第一根發動優先</option><option value="priority">基本面投資優先度</option>');sort.value='trade';state.sort='trade';}$$('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$$('.stat-card').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$$('.nav-item').forEach(b=>b.onclick=()=>navTo(b.dataset.page));$('#searchBox').oninput=e=>{state.query=e.target.value;state.visible=30;renderList()};$('#showMore').onclick=()=>{state.visible+=30;renderList()};$('#refreshBtn').onclick=()=>loadData();$('#closeModal').onclick=()=>hideDetails();$('#modalOverlay').onclick=e=>{if(e.target===$('#modalOverlay'))hideDetails()};window.onkeydown=e=>{if(e.key==='Escape')hideDetails()};window.addEventListener('popstate',()=>{if(state.detail)hideDetails(true)});loadData();if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(console.warn)}}
document.addEventListener('DOMContentLoaded',wire);
