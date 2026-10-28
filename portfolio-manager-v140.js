/* Chaopan r40 private portfolio research add-on. Preserves original watchlist and four bottom tabs. */
(function(root){'use strict';
 const KEY='chaopan-portfolio-local-v140';
 const n=x=>x===undefined||x===null||typeof x==='boolean'||typeof x==='string'&&!x.trim()||!Number.isFinite(Number(x))?null:Number(x);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const validCode=x=>/^\d{4}$/.test(String(x||''));
 const validDate=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()+1===m&&dt.getUTCDate()===d;};
 function parseBackup(text){
  let raw;try{raw=JSON.parse(text)}catch(e){throw new Error('不是有效 JSON 檔案');}
  const a=Array.isArray(raw)?raw:raw?.holdings;
  if(!Array.isArray(a)||a.length>100)throw new Error('持股備份格式錯誤或超過 100 筆');
  const seen=new Set(),today=new Date(),todayLocal=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  return a.map((h,i)=>{
   const code=String(h?.code??'').trim(),cost=n(h?.cost),lots=n(h?.lots),initial=n(h?.initial),trailing=n(h?.trailing),buyDate=h?.buyDate;
   if(!validCode(code)||seen.has(code)||!(cost>0)||!(lots>0)||!validDate(buyDate)||buyDate>todayLocal||initial!==null&&(initial<=0||initial>=cost)||trailing!==null&&trailing<=0){
    throw new Error(`第 ${i+1} 筆持股有錯誤（代號／成本／張數／日期／防守價）或代號重複`);
   }
   seen.add(code);return {code,cost,lots,buyDate,initial,trailing};
  });
 }

 const showPrice=x=>n(x)===null?'待核對':Number(x).toLocaleString('zh-TW',{maximumFractionDigits:2});
 function load(){try{const a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a.filter(x=>validCode(x.code)&&n(x.cost)>0&&n(x.lots)>0).slice(0,100):[]}catch(e){return []}}
 function persist(a){try{localStorage.setItem(KEY,JSON.stringify(a));if(typeof document!=='undefined')document.dispatchEvent(new Event('chaopan-portfolio-changed'));return true}catch(e){return false}}
 function ma(bars,len,skip=0){if(!Array.isArray(bars)||bars.length<len+skip)return null;const arr=bars.slice(bars.length-len-skip,bars.length-skip||undefined);let sum=0;for(const bar of arr){let close=n(bar?.[4]);if(close===null||close<=0)return null;sum+=close;}return sum/len;}
 // r41: independently certified add-position *watch*; never infer intraday fills.
 function addReview(row,asOf){
  const wait=(reason)=>({status:'等待加碼',reason,kind:'wait'});
  const bars=row?.bars;
  if(!Array.isArray(bars)||bars.length<25||row?.date!==asOf||bars.at(-1)?.[0]!==asOf)return wait('行情日或歷史K線不足，禁止加碼認證');
  const b=bars.slice(-25).map(x=>Array.isArray(x)?x.map((v,i)=>i===0?String(v):n(v)):null);
  if(b.some(x=>!x||x.length<6||x.slice(1,6).some(v=>v===null)||x[4]<=0||x[5]<0||x[2]<Math.max(x[1],x[3],x[4])||x[3]>Math.min(x[1],x[2],x[4])))return wait('K線價格或成交量驗證失敗');
  const last=b.at(-1),close=last[4],prev=b.at(-2),avgClose=(length,skip=0)=>b.slice(b.length-length-skip,b.length-skip||undefined).reduce((a,x)=>a+x[4],0)/length;
  const ma5=avgClose(5),ma10=avgClose(10),ma20=avgClose(20),old5=avgClose(5,3),old10=avgClose(10,3);
  const avgVol=b.slice(-21,-1).reduce((a,x)=>a+x[5],0)/20;
  // Universe bars store daily volume in lots (張), not shares.
  const avgLots=avgVol,todayLots=last[5],turnover=close*last[5]*1000;
  if(avgLots<500||todayLots<500||turnover<10000000)return wait('20日均量、當日量或成交金額未達500張／500張／1,000萬元');
  if(!(ma5>ma10&&ma10>ma20&&ma5>old5&&ma10>old10&&close>ma10))return wait('均線多頭與上升斜率未同時確認');
  const neck=n(row?.breakoutSequence?.level??row?.cycle?.level??row?.continuationContext?.originalNeckline);
  const priorHigh=Math.max(...b.slice(-21,-1).map(x=>x[2]));
  if(neck!==null&&neck>0&&prev[4]<=neck&&close>neck*1.001&&close>priorHigh&&last[5]>=avgVol*1.5)return {status:'突破加碼觀察',kind:'breakout',reason:`收盤突破已記錄頸線 ${showPrice(neck)} 元，量比至少1.5；須確認歷史頸線有效及持股風險`};
  if(neck!==null&&neck>0&&close>neck&&prev[3]<=Math.max(neck,ma10)*1.015&&close>prev[4]&&last[5]>=avgVol&&close>last[1])return {status:'回測加碼觀察',kind:'pullback',reason:'回測已記錄頸線／MA10後收盤回升；仍須核對前次突破事件'};
  if(close>priorHigh&&close>prev[4]&&last[5]>=avgVol*1.5)return {status:'趨勢加碼觀察',kind:'trend',reason:'收盤創近20日高點、均線上升且量比至少1.5；非已確認買進指令'};
  return wait('尚未達到突破、回測或趨勢加碼條件');
 }
 function review(h,row,asOf){
  const last=n(row?.close),barClose=n(row?.bars?.at(-1)?.[4]),matched=!!row&&row.date===asOf&&validDate(h.buyDate)&&h.buyDate<=asOf&&Array.isArray(row.bars)&&row.bars.at(-1)?.[0]===asOf&&last!==null&&barClose!==null&&Math.abs(last-barClose)<=0.011;
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
  if(!matched){stage='交易日／價格待核對';reason=!validDate(h.buyDate)?'買入日期缺失或無效，請補齊後才能估算損益':h.buyDate>asOf?'買入日期比目前行情資料更新，禁止用買入前收盤價計算持股獲利或出場':'行情日、最後一根 K 棒日期或收盤價未通過一致性核對；停止估算損益及交易警戒';}
  else if(defense!==null&&last<=defense){stage='歷史收盤觸及防守';reason='封存收盤低於已輸入的防守價，應依持股交易計畫核對；這不是今日即時賣出通知';}
  else if(twoBelow){stage='歷史 MA10 連兩日失守';reason='兩個交易日各自收盤低於當日 MA10；需再核對量能及支撐，不表示無條件全部出場';}
  else if(row?.riskLevel==='high'){stage='盤後結構高風險警戒';reason='偵測到較高量價／結構風險，應核對長上影、放量收低、法人與持股防守，不因單一洗盤就直接賣光';}
  else if(p2!==null&&last>=p2){stage='已達 3R 歷史里程碑';reason='達到第二階段獲利目標，請評估分批獲利或上移防守，避免獲利回吐';}
  else if(p1!==null&&last>=p1){stage='已達 2R 歷史里程碑';reason='可回顧分批獲利與提高移動停利的合理性，不代表系統已預測高點';}
  else if(m10!==null&&last>=m10){stage='歷史收盤維持 MA10 上方';reason='仍須檢查量價、法人及結構支撐；不是直接加碼訊號';}
  return {matched,defense,p1,p2,m5,m10,pnl,last,stage,reason,add:matched?addReview(row,asOf):{status:'等待加碼',kind:'wait',reason:'行情未通過同日驗證'}};
 }
 function download(h){const b=new Blob([JSON.stringify(h,null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='chaopan-portfolio-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),5000)}
 function mount({visible,container,asOf,rows,onOpen}){
  if(!container)return;let panel=document.querySelector('#chaopanPortfolioR40');
  if(!visible){if(panel)panel.hidden=true;return;}
  if(!panel){panel=document.createElement('section');panel.id='chaopanPortfolioR40';panel.className='chaopan-portfolio-r40';container.insertBefore(panel,container.querySelector('.advanced-radar'));}
  panel.hidden=false;
  const holdings=load(),map=new Map((rows||[]).map(x=>[String(x.code),x]));
  panel.innerHTML=`<div class="p-head"><b>我的持股｜盤後獲利保護</b><small>本機儲存 · 盤後非即時</small></div><p>持股資料只儲存在這台裝置的瀏覽器。沒有登入與跨手機同步，請定期備份。</p><details class="p-add"><summary>＋ 新增或修改持股</summary><form id="p-add-form"><label>股票代號<input name="code" inputmode="numeric" maxlength="4" required placeholder="例如2454"></label><label>買入均價（元）<input name="cost" type="number" step="0.01" min="0.01" required></label><label>持有張數<input name="lots" type="number" step="0.001" min="0.001" required></label><label>買入日期<input name="buyDate" type="date" required></label><label>初始停損（元，可空）<input name="initial" type="number" step="0.01" min="0"></label><label>移動停利（元，可空）<input name="trailing" type="number" step="0.01" min="0"></label><button type="submit">保存持股</button></form></details>
  <div class="p-holdings">${holdings.length?holdings.map(h=>{const row=map.get(h.code),a=review(h,row,asOf);return `<details class="p-position" data-code="${esc(h.code)}"><summary><span><b>${esc(h.code)} ${esc(row?.name||'名稱待資料')}</b><small>${esc(a.stage)}</small></span><strong>${showPrice(a.last)} 元</strong></summary><div class="p-position-body"><p><b>行情日 ${esc(row?.date||'—')}｜未經即時報價確認</b></p><div class="p-grid"><span>持股成本 <b>${showPrice(h.cost)}</b></span><span>持有 <b>${showPrice(h.lots)} 張</b></span><span>買入日期 <b>${esc(h.buyDate||'舊紀錄待補')}</b></span><span>未實現毛損益 <b>${a.pnl===null?'待核對':a.pnl.toLocaleString('zh-TW')+' 元'}</b></span><span>防守價 <b>${showPrice(a.defense)}</b></span><span>MA5 <b>${showPrice(a.m5)}</b></span><span>MA10 <b>${showPrice(a.m10)}</b></span><span>2R <b>${showPrice(a.p1)}</b></span><span>3R <b>${showPrice(a.p2)}</b></span></div><p>${esc(a.reason)}</p><p><b>加碼觀察：${esc(a.add.status)}</b>｜${esc(a.add.reason)}（盤後研究，非買進指令）</p><div class="p-actions"><button type="button" data-open="${esc(h.code)}">查看原完整作戰字卡</button><button type="button" data-remove="${esc(h.code)}">移除持股</button></div></div></details>`}).join(''):'<p>尚未加入持股。自選股票清單仍照常運作。</p>'}</div><button id="p-export" type="button">備份持股 JSON</button> <button id="p-import" type="button">匯入持股備份</button><input id="p-import-file" type="file" accept=".json,application/json" aria-label="選擇持股備份 JSON" hidden>`;
  panel.querySelector('#p-add-form').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.target),code=String(fd.get('code')||'').trim(),cost=n(fd.get('cost')),lots=n(fd.get('lots')),initial=n(fd.get('initial')),trailing=n(fd.get('trailing')),buyDate=String(fd.get('buyDate')||'');
    if(!validCode(code)||!(cost>0)||!(lots>0)||initial!==null&&initial>=cost){alert('股票代號、均價或張數不合法；初始停損須低於買入均價（移動停利可高於均價）。');return;}
    const [yy,mm,dd]=buyDate.split('-').map(Number),date=new Date(Date.UTC(yy,mm-1,dd));
    const today=new Date(),todayLocal=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(buyDate)||date.getUTCFullYear()!==yy||date.getUTCMonth()+1!==mm||date.getUTCDate()!==dd||buyDate>todayLocal){alert('請選擇有效且不在未來的買入日期');return;}
    const copy=load().filter(x=>x.code!==code);copy.push({code,cost,lots,buyDate,initial:initial>0?initial:null,trailing:trailing>0?trailing:null});if(!persist(copy)){alert('儲存失敗，請檢查瀏覽器儲存空間');return;}mount({visible:true,container,asOf,rows,onOpen});
  });
  panel.querySelector('#p-export').addEventListener('click',()=>download(load()));
  panel.querySelector('#p-import').addEventListener('click',()=>panel.querySelector('#p-import-file').click());
  panel.querySelector('#p-import-file').addEventListener('change',async e=>{
   const file=e.target.files?.[0];if(!file)return;
   try{
    if(file.size>200000)throw new Error('備份檔案過大（上限 200 KB）');
    const incoming=parseBackup(await file.text());const existing=load();
    const repeated=incoming.filter(x=>existing.some(old=>old.code===x.code)).length;
    if(!confirm(`確認匯入 ${incoming.length} 筆？${repeated?`其中 ${repeated} 筆同代號會以匯入備份覆蓋，`:''}其餘原持股會保留。`))return;
    const merged=[...existing.filter(x=>!incoming.some(y=>y.code===x.code)),...incoming];
    if(merged.length>100)throw new Error('合併後超過 100 筆，請先整理持股');
    if(!persist(merged))throw new Error('寫入失敗，原資料未更動');
    alert(`已匯入 ${incoming.length} 筆，合計 ${merged.length} 筆；持股備份只存在本機。`);
    mount({visible:true,container,asOf,rows,onOpen});
   }catch(err){alert('匯入失敗：'+err.message+'。原持股資料保留。');}
   finally{e.target.value='';}
  });
  panel.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{if(!confirm('要移除這筆持股追蹤嗎？'))return;persist(load().filter(x=>x.code!==b.dataset.remove));mount({visible:true,container,asOf,rows,onOpen});}));
  panel.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>{const row=map.get(b.dataset.open);if(row&&typeof onOpen==='function')onOpen(row.market+'-'+row.code);}));
 }
 root.ChaopanPortfolioR140={mount,load,review,addReview,ma,parseBackup};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.ChaopanPortfolioR140;
})(typeof globalThis!=='undefined'?globalThis:this);
