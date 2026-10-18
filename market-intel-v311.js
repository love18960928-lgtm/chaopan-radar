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
function marketPanel(intel,asOf){const ok=safeMarket(intel,asOf),indices=ok?intel.indices||{}:{},institutional=ok?intel.institutional||{}:{},listed=institutional.listed;
 const valid=listed?.date===asOf&&listed.unit==='億元';
 const cards=[['外資',listed?.foreign],['投信',listed?.trust],['自營商',listed?.dealer]];
 return `<div class="intel-market-head"><strong>台股收盤儀表板</strong><span>資料交易日 ${esc(asOf||'—')} · 非即時</span></div>
 <div class="intel-index-grid">${indexCard('加權指數',indices.taiex,asOf)}${indexCard('櫃買指數',indices.otc,asOf)}${indexCard('台指期',indices.taifex,asOf,indices.taifex?.session||'日盤')}</div>
 <div class="intel-flow-head"><strong>三大法人買賣超</strong><span>上市｜${valid?esc(listed.date):'待資料'}｜億元</span></div>
 <div class="intel-flow-grid">${cards.map(([label,value])=>`<div class="intel-flow"><span>${esc(label)}</span><b class="${valid?tone(value):'unknown'}">${valid?signed(value):'待資料'}</b></div>`).join('')}</div>
 <div class="intel-market-foot">上櫃法人成交金額另計；不同日期不合併。分點買超≠放空／做多持倉；缺資料不給燈號。</div>
 <div class="intel-vix-note">恐慌指數：${indices.usVix&&iso(indices.usVix.date)&&indices.usVix.date<=asOf&&(Date.parse(asOf+'T00:00:00Z')-Date.parse(indices.usVix.date+'T00:00:00Z'))/86400000<=5&&num(indices.usVix.close)!==null?'美國 VIX '+fm(indices.usVix.close)+'（'+esc(indices.usVix.date)+' 美股收盤）':'美國 VIX 待官方資料'}｜台灣 VIX：<a href="https://www.taifex.com.tw/cht/7/vixDaily3MNew" target="_blank" rel="noopener noreferrer">期交所官方盤後查詢</a>（未串接可核對下載格式前不自填）。<small>VIX衡量預期波動，非漲跌方向；交易日不同不得當同日指數比較。</small></div>`;
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
