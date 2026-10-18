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
 return `<div class="intel-index"><span>${esc(label)}</span><strong>${valid?fm(obj.close):'待資料'}</strong><small class="${valid?tone(obj.pct):'unknown'}">${valid?signed(obj.pct)+'%':'日期未核對'}</small><em>${valid?esc(obj.date):'—'}${note?' · '+esc(note):''}</em></div>`;}
function marketPanel(intel,asOf){
 const ok=safeMarket(intel,asOf),indices=ok?intel.indices||{}:{},inst=ok?intel.institutional||{}:{},listed=inst.listed||{},sources=ok?intel.sources||{}:{};
 const listedValid=listed.date===asOf&&listed.unit==='億元'&&[listed.foreign,listed.trust,listed.dealer].every(v=>num(v)!==null)&&['ok','retained'].includes(sources.twse_bfi?.status||'');
 const marketLots=market=>{
  const sourceKey=market==='上市'?'twse_t86':'tpex';
  if(!['ok','retained'].includes(sources[sourceKey]?.status))return null;
  let f=0,t=0,d=0,count=0;
  for(const [id,x] of Object.entries(intel.stocks||{})){
   if(!id.startsWith(market+'-')||x.date!==asOf)continue;
   const fs=num(x.foreignLots),ts=num(x.trustLots),ds=num(x.dealerLots);
   if([fs,ts,ds].some(v=>v===null))continue;
   f+=fs;t+=ts;d+=ds;count++;
  }
  return count?{count,f,t,d}:null;
 };
 const tw=ok?marketLots('上市'):null,ot=ok?marketLots('上櫃'):null;
 const flow=(title,record,unit,values)=>`<div class="intel-flow-head"><strong>${esc(title)}</strong><span>${record?esc(asOf)+'｜'+esc(unit):'待核對來源日期'}</span></div><div class="intel-flow-grid">${values.map(([name,v])=>`<div class="intel-flow"><span>${esc(name)}</span><b class="${record?tone(v):'unknown'}">${record?signed(v):'待資料'}</b></div>`).join('')}</div>`;
 const vix=key=>{
   const x=indices[key],date=String(x?.date||''),v=num(x?.close);
   const age=iso(date)?(Date.parse(asOf+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000:null;
   return ok&&date&&age!==null&&age>=0&&age<=5&&v!==null&&v>0&&v<200?fm(v)+'（'+esc(date)+' 收盤）':'待官方數據';
 };
 const marginRows=ok?Object.entries(intel.margin||{}).filter(([id,x])=>id.startsWith('上市-')&&x.date===asOf&&num(x.marginLots)!==null&&num(x.marginPreviousLots)!==null):[];
 const subtotal=marginRows.length?marginRows.reduce((a,[,x])=>a+Number(x.marginLots),0):null;
 const previous=marginRows.length?marginRows.reduce((a,[,x])=>a+Number(x.marginPreviousLots),0):null;
 const officialMargin=ok&&intel.marginMarket?.date===asOf&&num(intel.marginMarket?.marginAmountYi)!==null?intel.marginMarket:null;
 const foreignTx=ok&&intel.derivatives?.foreignTxOI?.date===asOf?intel.derivatives.foreignTxOI:null;
 const coverage=ok?intel.marginCoverage:null;
 const marginInfo=coverage?.date===asOf&&num(coverage.marginLotsSubtotal)!==null?coverage:null;
 const marginTotal=marginInfo?num(marginInfo.marginLotsSubtotal):subtotal;
 const marginDelta=marginInfo?num(marginInfo.marginDeltaLotsSubtotal):subtotal===null?null:subtotal-previous;
 const covered=marginInfo?.matchedStocks||marginRows.length;
 return `<div class="intel-market-head"><strong>台股盤後儀表板</strong><span>交易日 ${esc(asOf||'—')} · 非即時</span></div>
 <div class="intel-index-grid">${indexCard('加權指數',indices.taiex,asOf)}${indexCard('櫃買指數',indices.otc,asOf)}${indexCard('台指期',indices.taifex,asOf,indices.taifex?.session||'日盤')}</div>
 ${flow('上市三大法人官方買賣超金額',listedValid,'億元',[['外資',listed.foreign],['投信',listed.trust],['自營商',listed.dealer]])}
 ${flow('上市三大法人個股買賣超小計',tw,'張・'+(tw?.count||0)+'檔',[['外資',tw?.f],['投信',tw?.t],['自營商',tw?.d]])}
 ${flow('上櫃三大法人個股買賣超小計',ot,'張・'+(ot?.count||0)+'檔',[['外資',ot?.f],['投信',ot?.t],['自營商',ot?.d]])}
 <div class="intel-market-foot">上市的「億元」是證交所金額彙總；個股小計是已核對個股的淨張數相加，不等於市場整體成交金額，也不代表法人持倉。上櫃金額彙總目前未認證。</div>
 <div class="intel-flow-head"><strong>官方上市市場融資金額</strong><span>${officialMargin?esc(asOf)+'｜億元｜暫定':'官方彙總尚未核對'}</span></div>
 <div class="intel-flow-grid"><div class="intel-flow"><span>上市融資金額</span><b>${officialMargin?fm(officialMargin.marginAmountYi)+' 億元':'待官方資料'}</b></div><div class="intel-flow"><span>較前日增減</span><b class="${tone(officialMargin?.marginAmountDeltaYi)}">${officialMargin?signed(officialMargin.marginAmountDeltaYi)+' 億元':'待資料'}</b></div></div>
 <div class="intel-flow-head"><strong>外資臺股期貨 TX 未平倉</strong><span>${foreignTx?esc(asOf)+'｜口':'尚未核對'}</span></div><div class="intel-flow-grid"><div class="intel-flow"><span>多單</span><b>${foreignTx?fm(foreignTx.longLots,0):'待資料'}</b></div><div class="intel-flow"><span>空單</span><b>${foreignTx?fm(foreignTx.shortLots,0):'待資料'}</b></div><div class="intel-flow"><span>淨部位</span><b class="${tone(foreignTx?.netLots)}">${foreignTx?signed(foreignTx.netLots):'待資料'}</b></div></div>
 <div class="intel-market-foot">只核對期交所「臺股期貨 TX／外資及陸資／未平倉」，不是期貨各商品合計或個股法人籌碼。</div>
 <div class="intel-flow-head"><strong>融資水位（上市已取得個股小計）</strong><span>${marginTotal!==null?esc(asOf)+'｜'+covered+'筆':'同日資料未核對'}</span></div>
 <div class="intel-flow-grid"><div class="intel-flow"><span>融資餘額小計</span><b>${marginTotal!==null?fm(marginTotal,0)+' 張':'待資料'}</b></div><div class="intel-flow"><span>較前日增減</span><b class="${tone(marginDelta)}">${marginDelta!==null?signed(marginDelta)+' 張':'待資料'}</b></div><div class="intel-flow"><span>上櫃融資</span><b>待串接</b></div></div>
 <div class="intel-market-foot">此為來源資料內的上市個股餘額加總，非全臺市場融資總額或融資使用率；今日餘額屬暫定，5／20交易日變化須有完整歷史才顯示。</div>
 <div class="intel-vix-note">恐慌指數｜美國 VIX <b>${vix('usVix')}</b>｜台灣 VIX <b>${vix('twVix')}</b>（<a href="https://www.taifex.com.tw/cht/7/vixDaily3MNew" target="_blank" rel="noopener noreferrer">期交所查詢</a>）<small>各自標記來源交易日。沒有官方可核對數值就不補零；VIX 不預測漲跌方向。</small></div>`;
}
function marginLight(intel,row){if(!safeMarket(intel,row?.date))return null;
 const x=intel.margin?.[row.market+'-'+row.code];return x?.date===row.date?x:null;}
function marginPreview(intel,row){
 const r=marginLight(intel,row);if(!r)return '';
 const bal=num(r.marginLots),delta=num(r.marginDeltaLots),usage=num(r.marginUsedPct);
 const d5=num(r.margin5DayDeltaLots),d20=num(r.margin20DayDeltaLots);
 if(bal===null||delta===null||bal<0)return '';
 const change=num(row.changePct),risk=delta>0&&change!==null&&change<0;
 const tag=risk?'價弱融資增，留意追繳壓力':delta>0?'融資增加，觀察是否伴隨價漲量增':delta<0?'融資減少，需對照價格趨勢':'融資持平';
 return `<div class="margin-preview" aria-label="已核對個股融資水位"><span><b>融資餘額 ${fm(bal,0)}張</b><small>｜日增減 ${signed(delta)}張${usage!==null?'｜使用率 '+fm(usage,2)+'%':''}${d5!==null?'｜5日增減 '+signed(d5)+'張':''}${d20!==null?'｜20日增減 '+signed(d20)+'張':''}</small></span><small>${esc(tag)}｜${esc(r.date)}盤後</small></div>`;
}
function chipPanel(intel,row,plan){const x=stock(intel,row),chip=chipLight(intel,row),valid=Boolean(x);
 const entries=[['外資',x?.foreignLots],['投信',x?.trustLots],['自營商',x?.dealerLots]],margin=marginLight(intel,row);
 return `<section class="intel-chip-panel"><div class="intel-flow-head"><strong>籌碼與量能</strong><span>${valid?esc(x.date)+' 盤後':'法人資料日期待核對'}</span></div>
 <div class="intel-lights">${light(chip.tone,chip.text)}${light(plan.liquid?'up':'warn','流動性')}${light(plan.certifiedVolume?'up':'warn','突破量')}</div>
 <div class="intel-individual-grid">${entries.map(([label,v])=>`<div><span>${esc(label)}</span><strong class="${valid?tone(v):'unknown'}">${valid?signed(v):'—'}</strong><small>張</small></div>`).join('')}</div>
 <div class="intel-volume-check"><span>20日均量 <b>${fm(plan.avg20,0)}張</b></span><span>突破量參考 <b>${fm(plan.breakoutVolNeed,0)}張</b></span></div>
 <div class="intel-individual-grid"><div><span>融資餘額</span><strong>${margin?fm(margin.marginLots,0):'待資料'}</strong><small>${margin?'張 · 增減 '+signed(margin.marginDeltaLots):'未接入或日期不同'}</small></div><div><span>融券餘額</span><strong>${margin?fm(margin.shortLots,0):'待資料'}</strong><small>${margin?'張 · 增減 '+signed(margin.shortDeltaLots):'未接入或日期不同'}</small></div></div>
 <details class="intel-subdetail"><summary>融資／融券・借券・分點說明</summary><p>上市融資融券：若已取得同交易日資料，顯示當日暫定餘額；實際以次一營業日更正餘額為準。上櫃融資融券及借券目前尚未正式串接，缺資料不補零。分點統計不等於持倉或放空證據；有可靠授權來源才顯示分點。法人單日買超不代表隔日必漲。</p></details></section>`;
}
return {num,iso,stock,chipLight,light,miniLights,marketPanel,chipPanel,marginPreview,safeMarket,twseNeedsReview:true};
});
