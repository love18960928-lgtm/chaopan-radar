'use strict';
const $ = s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const state={payload:null,mode:'empty',tab:'all',query:'',market:'all',sort:'score',confirmed:false,limitMin:false,visible:30,watch:new Set(),detail:null,chartDays:60};
const TAGS={first:'首次突破',near:'接近頸線',volume:'新大量超越',limit:'20日多漲停'};
const price=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n))? Number(n).toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const integer=n=>Number.isFinite(Number(n))?Math.round(Number(n)).toLocaleString('zh-TW'):'—';
const sign=n=>Number(n)>0?'+':'';
const pct=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n))?`${sign(n)}${Number(n).toFixed(2)}%`:'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
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
    state.payload=obj;state.mode=obj.mode==='live'?'live':obj.mode==='warming'?'warming':obj.mode==='partial'?'partial':'empty';
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
  $('#dataStatus').textContent=modeName();
  const counts=x.counts||{};
  [['firstCount','first'],['nearCount','near'],['volCount','volume'],['limitCount','limit']].forEach(([el,key])=>$('#'+el).textContent=counts[key]??0);
  $('#coverageText').textContent=state.mode==='demo'?'示意畫面':`${integer(x.eligibleCount||0)} 檔具足夠歷史 / ${integer(x.stockCount||0)} 檔已收錄`;
  const banner=$('#infoBanner');
  if(state.mode==='demo'){banner.hidden=false;banner.innerHTML='⚠ 你正在查看<strong>示範資料</strong>。數字只供介面操作測試，並非即時行情或全市場掃描結果。 <button class="secondary-action" id="exitDemo">返回實際資料</button>';$('#exitDemo').onclick=loadData;}
  else if(state.mode==='warming'){banner.hidden=false;banner.textContent='資料已開始收集，但歷史K棒尚不足以讓全市場通過120日壓力判讀。請執行歷史回補，並留意資料日期。';}
  else if(state.mode==='partial'){banner.hidden=false;banner.textContent=`⚠ 上市、上櫃交易日資料尚未同步：上市 ${x.marketAsOf?.['上市']||'—'} / 上櫃 ${x.marketAsOf?.['上櫃']||'—'}。目前名單不代表全市場完整掃描，請檢查資料收集日誌。`;}
  else if(state.mode==='live' && x.asOf){banner.hidden=false;const days=(Date.now()-new Date(x.asOf+'T15:00:00+08:00').getTime())/86400000;banner.textContent=days>4?`⚠ 最新資料為 ${x.asOf}，可能尚未更新，請確認 GitHub Actions 工作排程是否成功。`:`最後交易日 ${x.asOf}，資料為盤後收盤價格，不代表現在可以成交的價格。`;}
  else{banner.hidden=false;banner.textContent='尚未連接真實盤後資料。部署到 HTTPS 網站並執行 GitHub Actions「初次回補」後才會自動建立候選名單。';}
  renderList();
}
function filtered(){
  let cards=(state.payload?.candidates||[]).filter(c=>{
    if(state.tab==='star'){if(!state.watch.has(c.market+'-'+c.code))return false}
    else if(state.tab!=='all'&&!c.tags?.includes(state.tab))return false;
    if(state.market!=='all'&&c.market!==state.market)return false;
    if(state.confirmed&&!c.confirmed)return false;
    if(state.limitMin&&Number(c.limit20)<2)return false;
    const q=state.query.trim().toLowerCase();
    if(q && !String(c.code).includes(q) && !String(c.name).toLowerCase().includes(q))return false;
    return true;
  });
  cards.sort((a,b)=>{
    if(state.sort==='limit')return (b.limit20-a.limit20)||(b.score-a.score);
    if(state.sort==='volume')return (b.volumeRatio-a.volumeRatio)||(b.score-a.score);
    if(state.sort==='neck'){
      const av=Number.isFinite(a.distancePct)?Math.abs(a.distancePct):999;
      const bv=Number.isFinite(b.distancePct)?Math.abs(b.distancePct):999;
      return av-bv;
    }
    return (b.score-a.score)||(b.lots-a.lots);
  });
  return cards;
}
function renderList(){
  const list=$('#candidateList'),more=$('#showMore'),data=state.payload?.candidates||[];
  if(!data.length){
    const ready=state.mode==='live'||state.mode==='warming'||state.mode==='partial';
    list.innerHTML=`<div class="empty-state"><div class="empty-orb">◎</div><h3>${ready?'目前沒有符合條件的股票':'雷達等待首次資料啟用'}</h3><p>${ready?'這不代表市場沒有強勢股，而是目前的歷史條件、流動性與資料數量下沒有符合的候選。':'程式已完成，但尚未接上自動盤後收集資料。可先體驗示範畫面，然後依安裝說明部署免費版。'}</p>${ready?'':`<div class="action-row"><button id="demoButton" class="primary-action">預覽示範畫面</button><button id="setupButton" class="secondary-action">查看設定說明</button></div>`}</div>`;
    if(!ready){$('#demoButton').onclick=demoMode;$('#setupButton').onclick=openSettings;}
    more.hidden=true;return;
  }
  const cards=filtered();
  if(!cards.length){list.innerHTML='<div class="empty-state"><div class="empty-orb">⌕</div><h3>這個分類沒有符合的候選股</h3><p>可以清除搜尋、切換類別或取消勾選條件。若只看自選股，請先在個股詳情加入星號。</p></div>';more.hidden=true;return}
  list.innerHTML=cards.slice(0,state.visible).map(c=>{
    const cls=c.changePct>0?'rising':c.changePct<0?'falling':'neutral';
    const tags=(c.tags||[]).map(t=>`<span class="signal-tag ${esc(t)}">${esc(TAGS[t]||t)}</span>`).join('')+
         (c.confirmed?'<span class="signal-tag confirmed">收盤確認</span>':'')+
         (c.overextended?'<span class="signal-tag risk">突破過遠</span>':'');
    return `<button class="stock-card" data-id="${esc(c.market+'-'+c.code)}" aria-label="查看 ${esc(c.name)} 詳情"><div class="stock-head"><div><span class="ticker">${esc(c.code)}</span><span class="ticker-name">${esc(c.name)}</span><span class="market-chip">${esc(c.market)}</span></div><div class="right-value"><div class="stock-price">${price(c.close)}</div><span class="stock-change ${cls}">${pct(c.changePct)}</span></div></div><div class="tagrow">${tags}</div><div class="stock-bottom"><span class="metric">頸線<strong>${price(c.neck)}</strong></span><span class="metric">量比<strong>${Number(c.volumeRatio).toFixed(1)}×</strong></span><span class="metric">20日漲停<strong>${integer(c.limit20)}次</strong></span><span class="score">強度 ${integer(c.score)}</span></div></button>`;
  }).join('');
  $$('.stock-card').forEach(c=>c.onclick=()=>showDetails(c.dataset.id));
  more.hidden=cards.length<=state.visible;more.textContent=`再顯示 ${Math.min(30,cards.length-state.visible)} 檔 ↓（共 ${cards.length} 檔）`;
}
function showDetails(id){const c=(state.payload?.candidates||[]).find(x=>x.market+'-'+x.code===id);if(!c)return;state.detail=c;state.chartDays=60;renderDetail();$('#modalOverlay').hidden=false;document.body.style.overflow='hidden'}
function hideDetails(){$('#modalOverlay').hidden=true;document.body.style.overflow='';state.detail=null}
function renderDetail(){const c=state.detail;if(!c)return;const starred=state.watch.has(c.market+'-'+c.code),cls=c.changePct>0?'rising':c.changePct<0?'falling':'neutral';
  $('#modalContent').innerHTML=`<div class="detail-title"><div><div class="eyebrow">STOCK ANALYSIS / ${esc(c.market)}</div><h2 id="modalTitle">${esc(c.code)} ${esc(c.name)}</h2><div class="detail-sub">${esc(c.date)} 盤後資料${state.mode==='demo'?' · 示範':''}</div></div><div class="detail-price"><strong>${price(c.close)}</strong><div class="${cls}">${pct(c.changePct)}</div></div></div><div class="tagrow">${(c.tags||[]).map(t=>`<span class="signal-tag ${t}">${TAGS[t]}</span>`).join('')}${c.confirmed?'<span class="signal-tag confirmed">收盤確認</span>':''}</div><div class="detail-grid"><div class="detail-metric"><div class="small">大量K壓力／頸線</div><strong>${price(c.neck)} 元</strong><div class="small">${esc(c.neckDate||'尚無壓力點')}</div></div><div class="detail-metric"><div class="small">距離頸線</div><strong>${pct(c.distancePct)}</strong><div class="small">正值代表已突破</div></div><div class="detail-metric"><div class="small">當日成交量</div><strong>${integer(c.lots)} 張</strong><div class="small">前10日均量 ${Number(c.volumeRatio).toFixed(2)} 倍</div></div><div class="detail-metric"><div class="small">近20日漲停估算</div><strong>${integer(c.limit20)} 次</strong><div class="small">含今天，依收盤價近似判定</div></div><div class="detail-metric"><div class="small">前120日最大量</div><strong>${integer(c.oldMaxLots)} 張</strong><div class="small">${esc(c.oldMaxDate||'—')}</div></div><div class="detail-metric"><div class="small">突破確認</div><strong>${c.confirmed?'量價確認':'待確認 / 不適用'}</strong><div class="small">收盤居當日區間上30%＋量比1.5倍</div></div></div><div class="chart-area"><div class="chart-top"><strong>歷史K線／成交量</strong><div class="chart-range"><button class="range-btn ${state.chartDays===20?'active':''}" data-days="20">20日</button><button class="range-btn ${state.chartDays===60?'active':''}" data-days="60">60日</button><button class="range-btn ${state.chartDays===120?'active':''}" data-days="120">全程</button></div></div><div id="chartSvg">${makeChart(c.bars||[],c.neck,state.chartDays)}</div><div class="chart-legend"><span>━━ 橘色虛線：大量K頸線</span><span>紅漲綠跌</span></div></div><div class="detail-note">${c.tags?.includes('volume')?'✓ 今日成交量大於前120個交易日最大量，且收盤高於舊最大量K收盤。':''} ${c.tags?.includes('first')?'✓ 今日收盤首次突破仍有效的大量K高點。':''} ${c.overextended?'⚠ 收盤距頸線已逾8%，應留意追高風險。':''}<br>盤後訊號僅供觀察，不代表次日買點；除權息可能導致假突破。</div><div class="detail-actions"><button class="primary-action" id="starButton">${starred?'★ 移出自選':'☆ 加入自選'}</button><button class="secondary-action" id="shareButton">分享股票資訊</button></div>`;
  $$('.range-btn').forEach(b=>b.onclick=()=>{state.chartDays=b.dataset.days==='120'?120:Number(b.dataset.days);renderDetail()});
  $('#starButton').onclick=()=>{const key=c.market+'-'+c.code;if(state.watch.has(key))state.watch.delete(key);else state.watch.add(key);saveWatch();renderDetail();toast('已更新自選清單')};
  $('#shareButton').onclick=async()=>{const info=`超盤手大量K雷達｜${c.code} ${c.name}\n${c.date} 收盤 ${price(c.close)}\n大量K頸線 ${price(c.neck)}\n量比 ${c.volumeRatio} 倍｜20日漲停估算 ${c.limit20} 次\n資料非即時，僅供研究。`;try{await navigator.clipboard.writeText(info);toast('已複製資訊')}catch(e){toast('請用手機內建分享功能')}};
}
function makeChart(bars,neck,days){let data=bars.slice(-days).filter(b=>[1,2,3,4,5].every(i=>Number.isFinite(Number(b[i]))));if(!data.length)return '<div class="empty-state">沒有歷史K線可顯示</div>';
  const W=600,H=289,P=33,plotW=W-P-36,top=20,kHeight=186,volTop=225,volHeight=42;
  const maxP=Math.max(...data.map(b=>Number(b[2])),Number(neck)||0)*1.02,minP=Math.min(...data.map(b=>Number(b[3])),Number(neck)||Infinity)*.98;
  let lo=Number.isFinite(minP)?minP:0,hi=maxP;if(hi<=lo)hi=lo+1;
  const py=n=>top+(hi-n)/(hi-lo)*kHeight,step=plotW/data.length,barW=Math.max(1.5,Math.min(8,step*.62));const maxV=Math.max(...data.map(b=>Number(b[5])),1);
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="近${data.length}日收盤K線、成交量及大量K壓力線">`;
  for(let i=0;i<=4;i++){const y=top+kHeight*i/4,v=hi-(hi-lo)*i/4;svg+=`<line x1="${P}" x2="${W-36}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#284057" stroke-width="1" opacity=".65"/><text x="${W-32}" y="${y+4}" fill="#8198aa" font-size="10">${v.toFixed(1)}</text>`}
  if(Number.isFinite(Number(neck))&&Number(neck)>=lo&&Number(neck)<=hi){const y=py(Number(neck));svg+=`<line x1="${P}" x2="${W-36}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e7b365" stroke-width="1.4" stroke-dasharray="5 5"/><text x="${P+3}" y="${Math.max(12,y-5)}" fill="#e7b365" font-size="10">頸線 ${Number(neck).toFixed(2)}</text>`}
  data.forEach((b,i)=>{const x=P+step*(i+.5),[date,o,h,l,c,v]=[b[0],Number(b[1]),Number(b[2]),Number(b[3]),Number(b[4]),Number(b[5])];const color=c>=o?'#ff777f':'#3bd1b4';let yo=py(o),yc=py(c),yh=py(h),yl=py(l);svg+=`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${yh.toFixed(1)}" y2="${yl.toFixed(1)}" stroke="${color}" stroke-width="1.1"/><rect x="${(x-barW/2).toFixed(1)}" y="${Math.min(yo,yc).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1.6,Math.abs(yo-yc)).toFixed(1)}" fill="${color}" rx=".5"/><rect x="${(x-barW/2).toFixed(1)}" y="${(volTop+volHeight*(1-v/maxV)).toFixed(1)}" width="${barW.toFixed(1)}" height="${(volHeight*v/maxV).toFixed(1)}" fill="${color}" opacity=".7"/>`;if(i===0||i===Math.floor(data.length/2)||i===data.length-1){svg+=`<text x="${x.toFixed(1)}" y="${H-6}" text-anchor="${i===0?'start':i===data.length-1?'end':'middle'}" font-size="9" fill="#91aabd">${esc(date.slice(5))}</text>`}});
  return svg+'</svg>';
}
function openSettings(){const isReady=state.mode==='live';$('#modalContent').innerHTML=`<div class="eyebrow">APP STATUS / SETTINGS</div><h2 id="modalTitle">資料與安裝設定</h2><div class="settings-card"><strong>目前：${modeName()}</strong><p>最近盤後日期：${esc(state.payload?.asOf||'尚無')}<br>掃描歷史完整股票：${integer(state.payload?.eligibleCount||0)} 檔<br>已記錄股票：${integer(state.payload?.stockCount||0)} 檔</p></div><div class="settings-card"><strong>如何使用免費版？</strong><p>把本程式上傳 GitHub 公開 Repository，啟用 Actions，先手動執行「初次回補約220天」，設定 Pages 從 main /root 發布，再以 Android Chrome 的「新增至主畫面」安裝。GitHub Actions 將於台灣交易日 18:15 嘗試自動更新，若交易所阻擋雲端 IP，需改用在台灣網路執行的收集主機。</p></div><div class="settings-card"><strong>即時版升級狀態</strong><p>目前沒有盤中報價或推播。未來串接授權即時行情、雲端首次突破判斷及 Firebase 推播後升級；不會使用盤後資料假裝盤中訊號。</p></div><div class="action-row"><button id="reloadData" class="primary-action">重新檢查盤後資料</button>${isReady?'':'<button id="demoModeBtn" class="secondary-action">開啟示範畫面</button>'}</div>`;$('#reloadData').onclick=()=>{hideDetails();loadData()};if($('#demoModeBtn'))$('#demoModeBtn').onclick=()=>{hideDetails();demoMode()};$('#modalOverlay').hidden=false;document.body.style.overflow='hidden'}
function navTo(page){$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));if(page==='list'){setTab('all');$('.content-area').scrollIntoView({behavior:'smooth'})}else if(page==='star'){state.tab='star';$$('.tab').forEach(x=>x.classList.remove('active'));renderList();$('.content-area').scrollIntoView({behavior:'smooth'})}else if(page==='guide')$('#guide').scrollIntoView({behavior:'smooth'});else openSettings()}
function wire(){loadWatch();$$('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$$('.stat-card').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$$('.nav-item').forEach(b=>b.onclick=()=>navTo(b.dataset.page));$('#searchBox').oninput=e=>{state.query=e.target.value;state.visible=30;renderList()};$('#marketFilter').onchange=e=>{state.market=e.target.value;renderList()};$('#sortFilter').onchange=e=>{state.sort=e.target.value;renderList()};$('#confirmedOnly').onchange=e=>{state.confirmed=e.target.checked;renderList()};$('#limitMin').onchange=e=>{state.limitMin=e.target.checked;renderList()};$('#showMore').onclick=()=>{state.visible+=30;renderList()};$('#refreshBtn').onclick=()=>loadData();$('#closeModal').onclick=hideDetails;$('#modalOverlay').onclick=e=>{if(e.target===$('#modalOverlay'))hideDetails()};window.onkeydown=e=>{if(e.key==='Escape')hideDetails()};loadData();if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(console.warn)}}
document.addEventListener('DOMContentLoaded',wire);
