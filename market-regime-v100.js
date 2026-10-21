/* 超盤手 r44 QA: two-index OHLC / dated market breadth / relative strength. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanMarketRegime=api;
if(typeof document!=='undefined') document.addEventListener('DOMContentLoaded',()=>api.init());})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const N=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>N(n)===null?'—':Number(n).toLocaleString('zh-TW',{maximumFractionDigits:2,minimumFractionDigits:2});
const realDate=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()+1===m&&dt.getUTCDate()===d;};
function cleanBars(x){
 if(!Array.isArray(x))return [];
 const bars=x.filter(b=>Array.isArray(b)&&realDate(b[0])&&b.slice(1,5).length===4&&b.slice(1,5).every(q=>N(q)>0)&&N(b[2])>=Math.max(N(b[1]),N(b[3]),N(b[4]))&&N(b[3])<=Math.min(N(b[1]),N(b[2]),N(b[4]))).sort((a,b)=>a[0].localeCompare(b[0]));
 // Never allow an invalid/duplicate historical bar to silently promote a market light.
 if(bars.length!==x.length||bars.some((v,i)=>i&&v[0]===bars[i-1][0]))return [];
 return bars;
}
function classify(index,asOf,close,breadth){
 const all=cleanBars(index?.bars),v=N(close);
 if(!index?.verified||all.length<21||!all.length||all.at(-1)[0]!==asOf||v===null||Math.abs(all.at(-1)[4]-v)>Math.max(.03,v*.00002)||breadth?.asOf!==asOf)return {light:'gray',label:'資料不足',bars:all,reason:'官方OHLC／資料日期／市場廣度未完成同日認證',ma20:null,support:null,resistance:null};
 const b=breadth?.markets||{};const up=N(b.up),down=N(b.down),total=N(b.count);if(up===null||down===null||up+down<50||total!==null&&(total<100||up+down>total||((up+down)/total)<0.6))return {light:'gray',label:'資料不足',bars:all,reason:'市場漲跌家數樣本太少、覆蓋不足或統計不一致',ma20:null,support:null,resistance:null};
 const closes=all.map(v=>v[4]);const ma20=closes.slice(-20).reduce((a,b)=>a+b,0)/20;const old20=closes.slice(-21,-1).reduce((a,b)=>a+b,0)/20;
 const breadthPct=100*up/(up+down),support=Math.min(...all.slice(-20,-1).map(b=>b[3])),resistance=Math.max(...all.slice(-20,-1).map(b=>b[2]));
 const red=v<ma20&&ma20<old20&&breadthPct<45;
 const green=v>ma20&&ma20>=old20&&breadthPct>55;
 return {light:red?'red':green?'green':'yellow',label:red?'大盤偏弱':green?'大盤偏強':'震盪觀察',bars:all,ma20,support,resistance,breadthPct,reason:'指數同日OHLC、MA20與同市場廣度交叉判斷；非買賣保證'};
}
function relative(row,index,asOf){
 const price=cleanBars(row?.bars),idx=cleanBars(index?.bars);
 if(!index?.verified||row?.date!==asOf||price.length<6||idx.length<6||idx.at(-1)[0]!==asOf)return null;
 const dates=idx.slice(-6).map(x=>x[0]);const m=new Map(price.map(x=>[x[0],x[4]]));
 if(dates.some(d=>!m.has(d)))return null;
 const s0=m.get(dates[0]),s1=m.get(dates[5]),i0=idx.at(-6)[4],i1=idx.at(-1)[4];
 if(!(s0>0&&i0>0))return null;
 return {stock:100*(s1/s0-1),market:100*(i1/i0-1),excess:100*(s1/s0-i1/i0)};
}
function chart(bars){
 const all=cleanBars(bars).slice(-50);if(!all.length)return '';
 const W=550,H=215,L=9,R=45,T=12,B=27,high=Math.max(...all.map(b=>b[2]))*1.008,low=Math.min(...all.map(b=>b[3]))*.992,step=(W-L-R)/all.length,y=p=>T+(high-p)/(high-low)*(H-T-B),w=Math.max(1.5,Math.min(9,step*.6));
 let out=`<svg class="r44-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="官方日K線，紅漲綠跌，非即時">`;
 for(let k=0;k<5;k++){const yy=T+k*(H-T-B)/4;out+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="#416278" opacity=".3"/><text x="${W-R+5}" y="${yy+3}" fill="#a6becc" font-size="10">${(high-(high-low)*k/4).toFixed(1)}</text>`;}
 all.forEach((b,j)=>{const x=L+(j+.5)*step,o=y(b[1]),h=y(b[2]),l=y(b[3]),c=y(b[4]),color=b[4]>=b[1]?'#ed646a':'#36c59c';out+=`<line x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${h.toFixed(2)}" y2="${l.toFixed(2)}" stroke="${color}" stroke-width="1.2"/><rect x="${(x-w/2).toFixed(2)}" y="${Math.min(o,c).toFixed(2)}" height="${Math.max(1.5,Math.abs(o-c)).toFixed(2)}" width="${w.toFixed(2)}" fill="${color}"/>`;});
 out+=`<text x="${L}" y="${H-3}" font-size="10" fill="#a6becc">${esc(all[0][0])}</text><text x="${W-R}" text-anchor="end" y="${H-3}" font-size="10" fill="#a6becc">${esc(all.at(-1)[0])}</text></svg>`;
 return out;
}
function taipeiParts(date){const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});const o=Object.fromEntries(fmt.formatToParts(date).map(x=>[x.type,x.value]));return {date:`${o.year}-${o.month}-${o.day}`,hour:Number(o.hour),minute:Number(o.minute)};}
function expectedEod(date){
 const p=taipeiParts(date),d=new Date(p.date+'T00:00:00Z');
 if(p.hour<18||p.hour===18&&p.minute<30)d.setUTCDate(d.getUTCDate()-1);
 while(d.getUTCDay()===0||d.getUTCDay()===6)d.setUTCDate(d.getUTCDate()-1);
 return d.toISOString().slice(0,10);
}
function dateStatus(radar,intel,now=new Date()){
 const asOf=radar?.asOf,expected=expectedEod(now),marketDates=radar?.marketAsOf||{};
 if(!realDate(asOf))return {label:'資料警示｜個股資料日期不合法或缺失',alert:true,expected};
 const mismatches=['上市','上櫃'].filter(k=>marketDates[k]&&marketDates[k]!==asOf);
 if(mismatches.length)return {label:`資料警示｜${mismatches.join('、')}資料日期不同步`,alert:true,expected};
 if(asOf>taipeiParts(now).date)return {label:'資料警示｜行情日期晚於今天，請停用交易判斷',alert:true,expected};
 if(asOf<expected)return {label:'資料警示｜可能未更新（如遇休市，需核對官方行事曆）',alert:true,expected};
 if(asOf>expected)return {label:'資料提醒｜今日行情已有快照，但盤後彙整可能尚未完成',alert:false,expected};
 return {label:intel?.asOf&&intel.asOf!==asOf?'資料警示｜個股日期正常，但指數／法人資料日不同步':'日期符合預期盤後交易日（仍需核對官方來源）',alert:!!(intel?.asOf&&intel.asOf!==asOf),expected};
}
function statusText(){
 const el=document.querySelector('#r44VersionStatus');if(!el||!store)return;
 const r=store.radar,mt={asOf:store.intelDate},asOf=r?.asOf||'待資料',d=dateStatus(r,mt);
 const sourceDates=r?.marketAsOf||{},localTime=r?.generatedAt?new Date(r.generatedAt):null;
 const time=localTime&&!Number.isNaN(localTime.getTime())?taipeiParts(localTime).date+' '+new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(localTime):'待核對';
 // A frontend version string is NOT a verifiable GitHub commit/deployment identifier.
 el.textContent=`程式：r44.14-QA（部署 commit 待核對）｜個股行情：${asOf}｜上市：${sourceDates['上市']||'待核對'}／上櫃：${sourceDates['上櫃']||'待核對'}｜盤後產製：${time}（台灣時間）｜收錄 ${r?.stockCount??'—'}、全市場診斷 ${r?.universeCount??'—'}｜${d.label}`;
 el.setAttribute('role','status');el.setAttribute('data-quality',d.alert?'warning':'check');
}
let store=null, run=0;
function checkedIndex(ix,asOf){
 // Verify this is a same-date real market index close, not an unrelated value or old quote.
 const close=N(ix?.close),change=N(ix?.change),pct=N(ix?.pct),previous=close!==null&&change!==null?close-change:null;
 if(ix?.date!==asOf||!realDate(asOf)||close===null||close<=0||pct===null||change===null||!(previous>0)||Math.abs(100*change/previous-pct)>.12)return null;
 return {close,pct};
}
function compareDaily(row,intel,asOf){
 const key=row?.market==='上市'?'taiex':row?.market==='上櫃'?'otc':null;
 if(!key||row?.date!==asOf||intel?.asOf!==asOf||row?.possiblePriceAdjustment)return null;
 const ix=checkedIndex(intel?.indices?.[key],asOf);if(!ix)return null;
 const bars=cleanBars(row?.bars),today=bars.at(-1),yesterday=bars.at(-2),close=N(row?.close),recordedPct=N(row?.changePct);
 if(!today||!yesterday||today[0]!==asOf||close===null||close<=0||recordedPct===null||!(N(yesterday[4])>0)||Math.abs(today[4]-close)>Math.max(.03,close*.0002))return null;
 const pct=100*(today[4]/yesterday[4]-1);
 if(Math.abs(pct-recordedPct)>.15)return null;
 const delta=pct-ix.pct;
 const up=n=>n>.15?'up':n<-.15?'down':'flat';
 const a=up(ix.pct),b=up(pct);
 let label='同向震盪';
 if(a==='up'&&b==='down')label='大盤漲、個股跌';
 else if(a==='down'&&b==='up')label='大盤跌、個股逆勢漲';
 else if(a==='up'&&b==='up')label=delta>.7?'同漲、個股領先':delta<-.7?'同漲、個股落後':'大盤與個股同漲';
 else if(a==='down'&&b==='down')label=delta>.7?'同跌、個股抗跌':delta<-.7?'同跌、個股較弱':'大盤與個股同跌';
 else if(a==='flat')label=b==='up'?'大盤盤整、個股上漲':b==='down'?'大盤盤整、個股下跌':'大盤與個股盤整';
 else if(b==='flat')label=a==='up'?'大盤上漲、個股持平':'大盤下跌、個股持平';
 const clues=[];
 if(row.riskLevel==='high'&&Array.isArray(row.riskReasons)&&row.riskReasons.length)clues.push(pct>.15?'原資料已有高風險結構標記；即使今天收漲，也不代表已重新轉強':'原資料已有高風險結構標記，需先核對頸線及防守價');
 if(pct<-.15){
  const prior=bars.length>=7?100*(yesterday[4]/bars.at(-7)[4]-1):null;
  if(prior!==null&&prior>=8)clues.push(`前5日已漲 ${prior.toFixed(1)}%，漲多回吐可列為研究假設，不能僅此確認`);
  if(N(row.volumeRatio)>=1.5&&today[4]<today[1])clues.push(`量比 ${Number(row.volumeRatio).toFixed(2)} 倍且收黑，顯示當日賣壓需核對`);
  if(N(row.relSector5Pct)!==null&&N(row.relSector5Pct)<-2)clues.push('近5日表現弱於同業參考；不等於同業今天都下跌');
  if(!clues.length)clues.push('尚無足夠證據確認是漲多、賣壓或其他原因，先看支撐、量能及族群');
 } else if(pct>.15){
  if(ix.pct<-.15)clues.push('當日逆勢上漲，需再查量價、族群與次日是否守住關卡');
  if(N(row.volumeRatio)<.7)clues.push('當日量比偏低，不能把抗跌直接當成攻擊買點');
 } else clues.push('個股走勢接近平盤，不宜從單日漲跌推定趨勢');
 return {key,indexPct:ix.pct,stockPct:pct,delta,label,clues,asOf};
}
function badgeFor(c,intel,asOf){
 const x=compareDaily(c,intel,asOf);
 if(!x)return '';
 const market=x.key==='taiex'?'加權':'櫃買',sign=n=>n>0?'+':'',clues=x.clues.slice(0,3).map(t=>`<li>${esc(t)}</li>`).join('');
 return `<section class="r44-compare" aria-label="同交易日個股與大盤走勢比較"><strong>${esc(x.label)}</strong><div class="r44-compare-pct">個股 ${sign(x.stockPct)}${x.stockPct.toFixed(2)}%／${market} ${sign(x.indexPct)}${x.indexPct.toFixed(2)}%｜相差 ${sign(x.delta)}${x.delta.toFixed(2)} 個百分點</div><small>${esc(x.asOf)} 盤後 · 僅同日比較，非下一日買點</small><details><summary>檢查可能原因（非事實定論）</summary><ul>${clues}</ul><p>僅靠漲跌和成交量不能認定基本面出了問題；若有營收、財報或重大訊息，仍需核對來源與日期。加權指數可能由權值股主導。</p></details></section>`;
}
function stockBadge(c){
 const x=store?compareDaily(c,store.intel,store.asOf):null;
 if(!x)return ''; // No verified same-day stock/index data: omit rather than manufacture a market light.
 const market=x.key==='taiex'?'加權':'櫃買',sign=n=>n>0?'+':'',clues=x.clues.slice(0,3).map(t=>`<li>${esc(t)}</li>`).join('');
 return `<section class="r44-compare" aria-label="個股與所屬大盤同日走勢比較"><strong>${esc(x.label)}</strong><div class="r44-compare-pct">個股 ${sign(x.stockPct)}${x.stockPct.toFixed(2)}%／${market} ${sign(x.indexPct)}${x.indexPct.toFixed(2)}%｜相差 ${sign(x.delta)}${x.delta.toFixed(2)} 個百分點</div><small>${esc(x.asOf)} 收盤 · 僅同日比較，並非預測或買點</small><details><summary>檢查可能原因（非事實定論）</summary><ul>${clues}</ul><p>基本面有無利空，必須核對當期財報、營收及重大訊息；現有漲跌、均線、量能無法證明基本面出問題。加權指數受權值股影響，個股不必跟著同漲同跌。</p></details></section>`;
}
function lightCard(key,label,icon){
 const m=store?.history?.markets?.[key];const ix=store?.intel?.indices?.[key];const breadth=store?.radar?.marketBreadth;
 const b={asOf:breadth?.asOf,markets:breadth?.markets?.[key==='taiex'?'上市':'上櫃']};
 const c=classify(m,store?.asOf,ix?.date===store?.asOf?ix?.close:null,b);
 const status=key==='taiex'?'加權':'櫃買';const dated=ix?.date===store?.asOf;
 return `<details class="r44-idx r44-${c.light}"><summary><span class="r44-dot" aria-hidden="true"></span><b>${label}</b><small>${dated?money(ix.close)+' 點 · '+esc(store.asOf):'收盤點數待核對'}</small><strong>${esc(c.label)}</strong><span>⌄</span></summary><div class="r44-inner">${c.bars.length&&m?.verified&&c.bars.at(-1)[0]===store.asOf?chart(c.bars):'<p class="r44-warn">官方完整指數日 K 未取得或尚未與同日收盤核對，暫不畫假 K 線。</p>'}<div class="r44-levels"><div>MA20：<b>${money(c.ma20)}</b></div><div>近期支撐：<b>${money(c.support)}</b></div><div>近期壓力：<b>${money(c.resistance)}</b></div><div>上漲占比：<b>${c.breadthPct==null?'待資料':c.breadthPct.toFixed(1)+'%'}</b></div></div><p class="r44-note">${esc(c.reason)}｜支撐／壓力為過去20交易日最高低參考，不是已證實的歷史大量K頸線。</p></div></details>`;
}
function paint(){statusText();/* No unverified traffic lights, supports or placeholder index candles are rendered. */}
async function requestJson(path){const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),9000);try{const r=await fetch(path+'?r44='+Date.now(),{cache:'no-store',signal:ctl.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}}
async function refresh(){const id=++run;
 const [ra,mi]=await Promise.allSettled(['./data/radar.json','./data/market-intel.json'].map(requestJson));
 if(id!==run)return;
 const radar=ra.status==='fulfilled'?ra.value:null,intel=mi.status==='fulfilled'?mi.value:null,asOf=radar?.asOf;
 store={radar,asOf,intelDate:intel?.asOf,intel:intel?.asOf===asOf?intel:null,history:null};paint();
}
function init(){if(!document.querySelector('#r44VersionStatus'))return;refresh();document.querySelector('#refreshBtn')?.addEventListener('click',()=>refresh());}
return {init,refresh,chart,classify,relative,cleanBars,dateStatus,expectedEod,compareDaily,checkedIndex,stockBadge,badgeFor,_setTestData:x=>{store=x;}};
});
