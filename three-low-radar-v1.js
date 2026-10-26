(()=>{'use strict';const id='three-low-integrated';if(document.getElementById(id))return;
const directory=document.querySelector('#sectorDirectory');if(!directory)return;
const section=document.createElement('div');section.id=id;section.className='three-low-integrated';section.innerHTML=`<div class="tl-heading">扣3低｜日／週／月均線提前轉強 <span class="tl-date" id="tl-date">資料讀取中</span></div><p class="tl-note">研究版：日MA20、週MA5扣抵；月MA3尚未通過驗證（暫停產生訊號，不代表0檔符合）。精選須同時符合價量資料條件，並非經回測認證的買點。非江國中完整專有公式；扣抵符合不等於立即買進。依資料日期計算，非即時。</p><div id="tl-groups"></div><details class="tl-search-panel"><summary>查詢全部股票的扣3低資料</summary><input id="tl-search" placeholder="輸入股票代號或名稱" aria-label="搜尋扣3低股票"><div id="tl-search-results"></div></details>`;
directory.insertAdjacentElement('afterend',section);
const styles=document.createElement('style');styles.textContent=`.three-low-integrated{max-width:100%;box-sizing:border-box;margin:16px 0 22px;color:#e5f2f4}.tl-heading{font-weight:800;font-size:clamp(17px,4.8vw,22px);margin:14px 0;overflow-wrap:anywhere}.tl-date{font-size:12px;font-weight:400;color:#a5c4cb}.tl-note{font-size:12px;line-height:1.8;color:#b8cdd3;background:#12313b;border:1px solid #345963;border-radius:13px;padding:12px}.tl-group{background:#102b37;border:1px solid #315361;border-radius:17px;margin:12px 0;overflow:hidden}.tl-group>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:9px;padding:20px 16px;min-height:54px}.tl-group>summary::-webkit-details-marker{display:none}.tl-group-name{font-size:clamp(17px,4.7vw,21px);font-weight:800;flex:1;min-width:0;overflow-wrap:anywhere}.tl-count{font-size:13px;color:#a9c3cb;white-space:nowrap}.tl-chevron{font-size:18px;color:#70c4bd}.tl-group[open] .tl-chevron{transform:rotate(180deg)}.tl-stock{border-top:1px solid #365362;margin:0 12px}.tl-stock>summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:17px 5px}.tl-stock>summary::-webkit-details-marker{display:none}.tl-stock-name{font-weight:750;font-size:17px;overflow-wrap:anywhere}.tl-stock-meta{font-size:12px;color:#aac8cf;margin-top:5px}.tl-stock-price{font-weight:750;font-size:17px;text-align:right;white-space:nowrap}.tl-details{padding:0 5px 15px;font-size:12px;color:#c2d8dc;line-height:1.8;overflow-wrap:anywhere}.tl-search-panel{margin:15px 0;padding:12px;border:1px solid #365361;border-radius:14px}.tl-search-panel>summary{cursor:pointer}.tl-search-panel input{box-sizing:border-box;max-width:100%;width:100%;margin:12px 0;padding:12px;background:#0a2532;border:1px solid #3b6a73;color:#fff;border-radius:10px}`;styles.textContent+=`.tl-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:10px 0}.tl-tabs button{background:#123541;color:#c7e4e6;border:1px solid #365c68;border-radius:8px;padding:9px 2px;font-size:12px;cursor:pointer}.tl-tabs button.active{background:#50cdb9;color:#092832;font-weight:800}.tl-panel{background:#0d2532;border:1px solid #315362;border-radius:12px;padding:12px;line-height:1.8;overflow-wrap:anywhere}.tl-level{padding:9px 0;border-bottom:1px solid #315362}.tl-level strong{font-size:14px;color:#d9f5ed}.tl-level div{font-size:12px;color:#afc8d0}`;styles.textContent+=`.tl-more{display:block;width:calc(100% - 24px);margin:12px;padding:13px;border:1px solid #4d908c;background:#173f46;color:#e7f7f5;border-radius:10px;font-size:14px;cursor:pointer}`;document.head.append(styles);
const groups=[['扣3低提前轉強｜最多20檔',r=>r._candidate],['扣3低價量確認',r=>r._confirmed],['扣3低＋MA240多頭觀察｜非買進訊號',r=>r._candidate&&r._ma240Qualified],['日線扣3低｜原始觀察',r=>r.day?.state==='符合'],['週線扣3低｜原始觀察',r=>r.week?.state==='符合'],['月線扣3低｜尚未驗證（不列入篩選）',r=>false]];
function pickContext(rows){
 const byCode=new Map();for(const v of rows){if(!v?.code)continue;const old=byCode.get(String(v.code));if(!old||(!old.volumeRatio&&v.volumeRatio))byCode.set(String(v.code),v)}return byCode;
}
function mark(r,c){
 r._candidate=false;r._confirmed=false;r._rank=-999;
 if(!c||!['day','week'].some(k=>r[k]?.state==='符合'))return;
 const pct=c.changePct==null?NaN:Number(c.changePct),vr=c.volumeRatio==null?NaN:Number(c.volumeRatio),dist=c.distancePct==null?NaN:Number(c.distancePct);
 if(!Number.isFinite(vr)||!Number.isFinite(dist)||!Number.isFinite(pct))return;
 if(c.riskLevel==='high'||vr<0.8||dist< -3||dist>5||pct>7)return;
 // This is a conservative observational filter, NOT a backtested buy signal.
 const both=r.day?.state==='符合'&&r.week?.state==='符合';
 const breakout=c.priceConfirmed===true;
 const strong=Number(c.relMarket5Pct);
 r._rank=(both?3:0)+(breakout?3:0)+Math.min(vr,3)+(Number.isFinite(strong)?Math.max(-2,Math.min(strong,3)):0)-Math.abs(dist)/5;
 r._candidate=both&&(breakout||c.preLaunch===true)&&vr>=1;
 r._confirmed=r._candidate&&breakout&&vr>=1.5&&c.riskLevel==='low';
 r._context=c;
 if(r._candidate || r._confirmed){
   const v=r._volume;const price=Number(c.close ?? r.close);
   const ok=!!(v&&v.asOf===dataDate&&Number.isFinite(v.avg20Lots)&&Number.isFinite(v.todayLots)&&Number.isFinite(price)&&v.avg20Lots>=500&&v.todayLots>=500&&v.todayLots*price*1000>=10000000);
   if(!ok){r._candidate=false;r._confirmed=false;r._volumeRejected=true;}
 }
}
function stock(r){
 const d=document.createElement('details');d.className='tl-stock';const s=document.createElement('summary');
 const left=document.createElement('div');const name=document.createElement('div');name.className='tl-stock-name';name.textContent=r.code+' '+r.name;
 const meta=document.createElement('div');meta.className='tl-stock-meta';meta.textContent=`日 ${r.day?.state||'不足'}／週 ${r.week?.state||'不足'}／月 ${r.month?.state||'不足'}`;
 if(r._candidate){const tag=document.createElement('div');tag.className='tl-stock-meta';tag.textContent=r._confirmed?'價量條件符合｜仍須風險確認':'提前轉強觀察｜非買進訊號';left.append(tag)}left.append(name,meta);if(r._ma240){const m=document.createElement('div');m.className='tl-stock-meta';m.textContent=r._ma240.valid?`MA240 ${r._ma240.ma240.toFixed(2)}｜${r._ma240.above?'股價站上':'股價跌破'}｜年線${r._ma240.up?'向上':'未向上'}`:'MA240歷史價格需校正';left.append(m)}const price=document.createElement('div');price.className='tl-stock-price';price.textContent=Number(r.close).toFixed(2)+' ▾';s.append(left,price);d.append(s);
 const detail=document.createElement('div');detail.className='tl-details';d.append(detail);
 d.addEventListener('toggle',()=>{if(!d.open||detail.dataset.loaded)return;detail.dataset.loaded='1';document.dispatchEvent(new CustomEvent('chaopan:three-low-open',{detail:{code:r.code,target:detail}}));});
 return d;
}

let dataDate='';

fetch('three-low-data.json?v=20261026-unified-v4',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(async data=>{const rows=data.rows||[];const context=await fetch('three-low-price-context.json?v=20261026-v5',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('價量資料缺失');return r.json()}).catch(()=>({rows:[]}));const contextMap=pickContext(context.rows||[]);const matchingDate=context.asOf===data.asOf; if(!matchingDate){const warning=document.createElement('p');warning.className='tl-note';warning.textContent='價量資料日期與扣抵資料不一致，精選訊號已停用，避免使用錯誤資料。';section.querySelector('#tl-groups').before(warning)}// Fail closed when the volume snapshot is absent or from another session date.
let volumePayload=null;try{const res=await fetch('three-low-volume-context.json?v=20261027-v1',{cache:'no-store'});if(res.ok)volumePayload=await res.json()}catch(_e){}
const volumeMatching=volumePayload?.asOf===data.asOf;
if(!volumeMatching){const note=document.createElement('p');note.className='tl-note';note.textContent='成交量資料缺失或日期不同，扣3低精選與價量確認暫停判定；原始日週觀察仍顯示。';section.querySelector('#tl-groups').before(note)}
dataDate=data.asOf||'';
for(const r of rows){r._volume=volumeMatching?volumePayload.byCode?.[String(r.code)]:null;mark(r,matchingDate?contextMap.get(String(r.code)):null)}
// Independent long-term trend annotation. Fail closed on missing, stale, or unadjusted data.
let maPayload=null;try{const resp=await fetch('ma240-three-low-context.json?v=20261027-v1',{cache:'no-store'});if(resp.ok)maPayload=await resp.json()}catch(_e){}
const maMatching=maPayload?.asOf===data.asOf;
for(const r of rows){const m=maMatching?maPayload.byCode?.[String(r.code)]:null;r._ma240=m||null;r._ma240Qualified=!!(m?.valid&&m?.asOf===data.asOf&&m?.above&&m?.up)}
if(!maMatching){const note=document.createElement('p');note.className='tl-note';note.textContent='MA240資料缺失或日期不一致，年線精選暫停判定，原版扣3低維持不變。';section.querySelector('#tl-groups').before(note)}
dataDate=data.asOf||'未知';globalThis.ChaopanThreeLow={asOf:dataDate,byCode:new Map(rows.map(r=>[String(r.code),r]))};section.querySelector('#tl-date').textContent=`資料 ${data.asOf}｜${rows.length} 檔`;const root=section.querySelector('#tl-groups');for(const [label,pred] of groups){const matches=rows.filter(pred).sort((a,b)=>(b._rank||0)-(a._rank||0));const group=document.createElement('details');group.className='tl-group';const sum=document.createElement('summary');sum.innerHTML='<span class="tl-group-name"></span><span class="tl-count"></span><span class="tl-chevron">⌄</span>';sum.querySelector('.tl-group-name').textContent=label;sum.querySelector('.tl-count').textContent=matches.length+' 檔';group.append(sum);const content=document.createElement('div');group.append(content);const pageSize=label.includes('最多20')?20:60;let shown=0;
 const showMore=()=>{const next=Math.min(shown+pageSize,matches.length);for(let i=shown;i<next;i++)content.append(stock(matches[i]));shown=next;if(shown<matches.length){const more=document.createElement('button');more.type='button';more.className='tl-more';more.textContent=`載入更多（已顯示 ${shown}／${matches.length} 檔）`;more.addEventListener('click',()=>{more.remove();showMore()});content.append(more)}};
 group.addEventListener('toggle',()=>{if(!group.open||content.dataset.loaded)return;content.dataset.loaded='1';if(!matches.length){content.textContent=label.includes('月線')?'月線MA3尚未完成驗證，暫不產生訊號；0檔不代表市場沒有符合股票。':'目前0檔符合；不強制湊數。';return}showMore()});root.append(group)}const input=section.querySelector('#tl-search'),results=section.querySelector('#tl-search-results');input.addEventListener('input',()=>{const q=input.value.trim();results.replaceChildren();if(!q)return;const found=rows.filter(r=>(r.code.includes(q)||r.name.includes(q))&&['day','week','month'].some(k=>r[k]?.state==='符合')).slice(0,30);for(const r of found)results.append(stock(r));if(!found.length)results.textContent='沒有符合的股票。'})}).catch(e=>{section.querySelector('#tl-date').textContent='資料載入失敗：'+e.message})})();