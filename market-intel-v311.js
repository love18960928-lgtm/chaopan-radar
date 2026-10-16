/* 超盤手 V3.1.1 | 證交所/櫃買/期交所獨立日期的盤後輔助資訊。 */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanIntel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
const fm=(v,d=2)=>num(v)===null?'—':num(v).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
const signed=v=>num(v)===null?'—':(num(v)>0?'+':'')+fm(v);
const tone=v=>num(v)===null?'unknown':num(v)>0?'up':num(v)<0?'down':'flat';
const safeMarket=(intel,asOf)=>Boolean(intel&&intel.schema==='chaopan.market.v311'&&iso(intel.asOf)&&intel.asOf===asOf);
function stock(intel,row){if(!safeMarket(intel,row?.date))return null;const x=intel.stocks?.[row.market+'-'+row.code];return x?.date===row.date?x:null;}
function chipLight(intel,row){const x=stock(intel,row);if(!x)return {tone:'unknown',text:'法人待資料',desc:'缺同交易日資料'};
 const f=num(x.foreignLots),t=num(x.trustLots),d=num(x.dealerLots);
 if(f===null||t===null||d===null)return {tone:'unknown',text:'法人待資料',desc:'缺完整欄位'};
 const sum=f+t+d;
 const ratio=num(row.lots)>0?sum/num(row.lots):null;
 // A single day's net buying is corroboration, not proof of accumulation.
 return {tone:sum>0?'up':sum<0?'down':'flat',text:sum>0?'法人淨買':sum<0?'法人淨賣':'法人中性',desc:ratio!==null?'約占當日量 '+signed(ratio*100)+'%':'未能核對成交量',netLots:sum};
}
function light(t,label){return `<span class="intel-light ${esc(t)}"><i aria-hidden="true"></i>${esc(label)}</span>`;}
function miniLights(intel,row,plan){const last=row.bars?.at(-1),ma=num(plan.ma5);
 const trend=num(row.close)!==null&&ma!==null?(num(row.close)>=ma?'up':'down'):'unknown';
 const volume=plan?.liquid?(plan?.certifiedVolume?'up':'warn'):'warn';
 const chip=chipLight(intel,row);
 return `<div class="intel-lights">${light(trend,'均線')}${light(volume,'量能')}${light(chip.tone,'法人')}${light(plan?.priority?'up':plan?.qualified?'warn':'down','進場風險')}</div>`;
}
function indexCard(label,obj,asOf,note=''){const valid=obj&&obj.date===asOf&&num(obj.close)!==null&&num(obj.pct)!==null;
 return `<div class="intel-index"><span>${esc(label)}</span><strong>${valid?fm(obj.close):'待資料'}</strong><small class="${valid?tone(obj.pct):'unknown'}">${valid?signed(obj.pct)+'%':obj?'日期或欄位未核對':'官方來源未取得'}</small><em>${valid?esc(obj.date):'—'}${note?' · '+esc(note):''}</em></div>`;}
function marketPanel(intel,asOf){const ok=safeMarket(intel,asOf),indices=ok?intel.indices||{}:{},institutional=ok?intel.institutional||{}:{},listed=institutional.listed;
 const valid=listed?.date===asOf&&listed.unit==='億元';
 const cards=[['外資',listed?.foreign],['投信',listed?.trust],['自營商',listed?.dealer]];
 const codes={taiex:'證交所加權',otc:'櫃買指數',tx:'台指期',twse_bfi:'上市法人總額',twse_t86:'上市個股法人',tpex:'上櫃個股法人'};
 const statuses=Object.entries(codes).map(([key,name])=>{
  const entry=intel?.sources?.[key];
  const fallback=intel?.coverage?.[key];
  const status=entry?.status||(fallback?'ok':'missing');
  return `${name}：${status==='ok'?'完成':status==='error'?'抓取失敗':status==='invalid'?'格式或日期不符':'未取得'}`;
 });
 const mismatch=intel&&intel.asOf!==asOf?`補充資料日 ${intel.asOf} 與個股 ${asOf} 不同，不可合併。`:
   !intel?'補充資料檔尚未成功取得；不是全部指數都沒有行情。':'';
 const summary=ok?statuses.join('｜'):(mismatch||'來源日期尚未核對');
 return `<div class="intel-market-head"><strong>台股收盤儀表板</strong><span>資料交易日 ${esc(asOf||'—')} · 非即時</span></div>
 <div class="intel-index-grid">${indexCard('加權指數',indices.taiex,asOf)}${indexCard('櫃買指數',indices.otc,asOf)}${indexCard('台指期',indices.taifex,asOf,indices.taifex?.session||'日盤')}</div>
 <div class="intel-flow-head"><strong>三大法人買賣超</strong><span>上市｜${valid?esc(listed.date):'待資料'}｜億元</span></div>
 <div class="intel-flow-grid">${cards.map(([label,value])=>`<div class="intel-flow"><span>${esc(label)}</span><b class="${valid?tone(value):'unknown'}">${valid?signed(value):'待資料'}</b></div>`).join('')}</div>
 <div class="intel-market-foot">上櫃法人成交金額另計；不同日期不合併。分點買超≠放空／做多持倉；缺資料不給燈號。<details class="intel-source-details"><summary>查看官方資料來源核對狀況</summary><p>${esc(summary)}</p><p>資料僅於盤後 GitHub Actions 自動擷取。來源失敗、日期不符或未發布時保留空缺，不用舊數字假裝當日行情。</p></details></div>`;
}
function marginLight(intel,row){if(!safeMarket(intel,row?.date))return null;
 const x=intel.margin?.[row.market+'-'+row.code];return x?.date===row.date?x:null;}
function chipPanel(intel,row,plan){const x=stock(intel,row),chip=chipLight(intel,row),valid=Boolean(x);
 const entries=[['外資',x?.foreignLots],['投信',x?.trustLots],['自營商',x?.dealerLots]],margin=marginLight(intel,row);
 return `<section class="intel-chip-panel"><div class="intel-flow-head"><strong>籌碼與量能</strong><span>${valid?esc(x.date)+' 盤後':'法人資料日期待核對'}</span></div>
 <div class="intel-lights">${light(chip.tone,chip.text)}${light(plan.liquid?'up':'warn','流動性')}${light(plan.certifiedVolume?'up':'warn','突破量')}</div>
 <div class="intel-individual-grid">${entries.map(([label,v])=>`<div><span>${esc(label)}</span><strong class="${valid?tone(v):'unknown'}">${valid?signed(v):'—'}</strong><small>張</small></div>`).join('')}</div>
 <div class="intel-volume-check"><span>20日均量 <b>${fm(plan.avg20,0)}張</b></span><span>突破量參考 <b>${fm(plan.breakoutVolNeed,0)}張</b></span></div>
 <div class="intel-individual-grid"><div><span>融資餘額</span><strong>${margin?fm(margin.marginLots,0):'待資料'}</strong><small>${margin?'張 · 增減 '+signed(margin.marginDeltaLots):'未接入或日期不同'}</small></div><div><span>融券餘額</span><strong>${margin?fm(margin.shortLots,0):'待資料'}</strong><small>${margin?'張 · 增減 '+signed(margin.shortDeltaLots):'未接入或日期不同'}</small></div></div>
 <details class="intel-subdetail"><summary>融資／融券・借券・分點說明</summary><p>上市融資融券：若已取得同交易日資料，顯示當日暫定餘額；實際以次一營業日更正餘額為準。上櫃融資融券及借券目前尚未正式串接，缺資料不補零。分點統計不等於持倉或放空證據；有可靠授權來源才顯示分點。法人單日買超不代表隔日必漲。</p></details></section>`;
}
return {num,iso,stock,chipLight,light,miniLights,marketPanel,chipPanel,safeMarket,twseNeedsReview:true};
});
