/* Chaopan r40 private portfolio research add-on. Preserves original watchlist and four bottom tabs. */
(function(root){'use strict';
 const KEY='chaopan-portfolio-local-v140';
 const n=x=>x===''||x===undefined||x===null||!Number.isFinite(Number(x))?null:Number(x);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const validCode=x=>/^\d{4}$/.test(String(x||''));
 const showPrice=x=>n(x)===null?'待核對':Number(x).toLocaleString('zh-TW',{maximumFractionDigits:2});
 function load(){try{const a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a.filter(x=>validCode(x.code)&&n(x.cost)>0&&n(x.lots)>0).slice(0,100):[]}catch(e){return []}}
 function persist(a){try{localStorage.setItem(KEY,JSON.stringify(a));return true}catch(e){return false}}
 function ma(bars,len,skip=0){if(!Array.isArray(bars)||bars.length<len+skip)return null;const arr=bars.slice(bars.length-len-skip,bars.length-skip||undefined);let sum=0;for(const bar of arr){let close=n(bar?.[4]);if(close===null||close<=0)return null;sum+=close;}return sum/len;}
 function review(h,row,asOf){
  const last=n(row?.close),matched=!!row&&row.date===asOf&&(!h.buyDate||h.buyDate<=asOf)&&Array.isArray(row.bars)&&row.bars.at(-1)?.[0]===asOf;
  const cost=n(h.cost), lots=n(h.lots),initial=n(h.initial),trail=n(h.trailing);
  const stop=initial!==null&&initial>0&&initial<cost?initial:null;
  const effective=[stop,trail!==null&&trail>0?trail:null].filter(x=>x!==null);
  const defense=effective.length?Math.max(...effective):null;
  const p1=stop!==null?cost+2*(cost-stop):null;
  const p2=stop!==null?cost+3*(cost-stop):null;
  const m5=matched?ma(row.bars,5):null,m10=matched?ma(row.bars,10):null;
  const yesterday=n(row?.bars?.at(-2)?.[4]),prev10=matched?ma(row.bars,10,1):null;
  const twoDaysAgo=n(row?.bars?.at(-3)?.[4]),prevPrev10=matched?ma(row.bars,10,2):null;
  // Alert at a NEW two-day break, not on every subsequent day of the same decline.
  const twoBelow=m10!==null&&prev10!==null&&prevPrev10!==null&&yesterday!==null&&twoDaysAgo!==null&&last<m10&&yesterday<prev10&&twoDaysAgo>=prevPrev10;
  const pnl=matched&&last!==null&&lots!==null?Math.round((last-cost)*lots*1000):null;
  let stage='僅供盤後回顧',reason='資料非即時，所有條件需以當日行情重新核對';
  if(!matched){stage='交易日／價格待核對';reason=h.buyDate&&h.buyDate>asOf?'買入日期比目前行情資料更新，禁止用買入前收盤價計算持股獲利或出場':'目前個股與全市場行情日期不一致，不以舊價觸發今天的買賣決策';}
  else if(defense!==null&&last<=defense){stage='歷史收盤觸及防守';reason='封存收盤低於已輸入的防守價，應依持股交易計畫核對；這不是今日即時賣出通知';}
  else if(twoBelow){stage='歷史 MA10 連兩日失守';reason='兩個交易日各自收盤低於當日 MA10；需再核對量能及支撐，不表示無條件全部出場';}
  else if(row?.riskLevel==='high'){stage='盤後結構高風險警戒';reason='偵測到較高量價／結構風險，應核對長上影、放量收低、法人與持股防守，不因單一洗盤就直接賣光';}
  else if(p2!==null&&last>=p2){stage='已達 3R 歷史里程碑';reason='達到第二階段獲利目標，請評估分批獲利或上移防守，避免獲利回吐';}
  else if(p1!==null&&last>=p1){stage='已達 2R 歷史里程碑';reason='可回顧分批獲利與提高移動停利的合理性，不代表系統已預測高點';}
  else if(m10!==null&&last>=m10){stage='歷史收盤維持 MA10 上方';reason='仍須檢查量價、法人及結構支撐；不是直接加碼訊號';}
  return {matched,defense,p1,p2,m5,m10,pnl,last,stage,reason};
 }
 function download(h){const b=new Blob([JSON.stringify(h,null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='chaopan-portfolio-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),5000)}
 function mount({visible,container,asOf,rows,onOpen}){
  if(!container)return;let panel=document.querySelector('#chaopanPortfolioR40');
  if(!visible){if(panel)panel.hidden=true;return;}
  if(!panel){panel=document.createElement('section');panel.id='chaopanPortfolioR40';panel.className='chaopan-portfolio-r40';container.insertBefore(panel,container.querySelector('.advanced-radar'));}
  panel.hidden=false;
  const holdings=load(),map=new Map((rows||[]).map(x=>[String(x.code),x]));
  panel.innerHTML=`<div class="p-head"><b>我的持股｜盤後獲利保護</b><small>本機儲存 · 盤後非即時</small></div><p>持股資料只儲存在這台裝置的瀏覽器。沒有登入與跨手機同步，請定期備份。</p><details class="p-add"><summary>＋ 新增或修改持股</summary><form id="p-add-form"><label>股票代號<input name="code" inputmode="numeric" maxlength="4" required placeholder="例如2454"></label><label>買入均價（元）<input name="cost" type="number" step="0.01" min="0.01" required></label><label>持有張數<input name="lots" type="number" step="0.001" min="0.001" required></label><label>買入日期<input name="buyDate" type="date" required></label><label>初始停損（元，可空）<input name="initial" type="number" step="0.01" min="0"></label><label>移動停利（元，可空）<input name="trailing" type="number" step="0.01" min="0"></label><button type="submit">保存持股</button></form></details>
  <div class="p-holdings">${holdings.length?holdings.map(h=>{const row=map.get(h.code),a=review(h,row,asOf);return `<details class="p-position" data-code="${esc(h.code)}"><summary><span><b>${esc(h.code)} ${esc(row?.name||'名稱待資料')}</b><small>${esc(a.stage)}</small></span><strong>${showPrice(a.last)} 元</strong></summary><div class="p-position-body"><p><b>行情日 ${esc(row?.date||'—')}｜未經即時報價確認</b></p><div class="p-grid"><span>持股成本 <b>${showPrice(h.cost)}</b></span><span>持有 <b>${showPrice(h.lots)} 張</b></span><span>買入日期 <b>${esc(h.buyDate||'舊紀錄待補')}</b></span><span>未實現毛損益 <b>${a.pnl===null?'待核對':a.pnl.toLocaleString('zh-TW')+' 元'}</b></span><span>防守價 <b>${showPrice(a.defense)}</b></span><span>MA5 <b>${showPrice(a.m5)}</b></span><span>MA10 <b>${showPrice(a.m10)}</b></span><span>2R <b>${showPrice(a.p1)}</b></span><span>3R <b>${showPrice(a.p2)}</b></span></div><p>${esc(a.reason)}</p><div class="p-actions"><button type="button" data-open="${esc(h.code)}">查看原完整作戰字卡</button><button type="button" data-remove="${esc(h.code)}">移除持股</button></div></div></details>`}).join(''):'<p>尚未加入持股。自選股票清單仍照常運作。</p>'}</div><button id="p-export" type="button">備份持股 JSON</button>`;
  panel.querySelector('#p-add-form').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.target),code=String(fd.get('code')||'').trim(),cost=n(fd.get('cost')),lots=n(fd.get('lots')),initial=n(fd.get('initial')),trailing=n(fd.get('trailing')),buyDate=String(fd.get('buyDate')||'');
    if(!validCode(code)||!(cost>0)||!(lots>0)||initial!==null&&initial>=cost){alert('股票代號、均價或張數不合法；初始停損須低於買入均價（移動停利可高於均價）。');return;}
    const [yy,mm,dd]=buyDate.split('-').map(Number),date=new Date(Date.UTC(yy,mm-1,dd));
    const today=new Date(),todayLocal=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(buyDate)||date.getUTCFullYear()!==yy||date.getUTCMonth()+1!==mm||date.getUTCDate()!==dd||buyDate>todayLocal){alert('請選擇有效且不在未來的買入日期');return;}
    const copy=load().filter(x=>x.code!==code);copy.push({code,cost,lots,buyDate,initial:initial>0?initial:null,trailing:trailing>0?trailing:null});if(!persist(copy)){alert('儲存失敗，請檢查瀏覽器儲存空間');return;}mount({visible:true,container,asOf,rows,onOpen});
  });
  panel.querySelector('#p-export').addEventListener('click',()=>download(load()));
  panel.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{if(!confirm('要移除這筆持股追蹤嗎？'))return;persist(load().filter(x=>x.code!==b.dataset.remove));mount({visible:true,container,asOf,rows,onOpen});}));
  panel.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{const row=map.get(b.dataset.open);if(row&&typeof onOpen==='function')onOpen(row.market+'-'+row.code);}));
 }
 root.ChaopanPortfolioR140={mount,load,review,ma};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.ChaopanPortfolioR140;
})(typeof globalThis!=='undefined'?globalThis:this);
