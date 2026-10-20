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
 if(!realDate(asOf))return {label:'資料異常｜個股資料日期不合法或缺失',alert:true,expected};
 const mismatches=['上市','上櫃'].filter(k=>marketDates[k]&&marketDates[k]!==asOf);
 if(mismatches.length)return {label:`資料異常｜${mismatches.join('、')}資料日期不同步`,alert:true,expected};
 if(asOf>taipeiParts(now).date)return {label:'資料異常｜行情日期晚於今天，請停用交易判斷',alert:true,expected};
 if(asOf<expected)return {label:'資料提醒｜可能未更新（如遇休市，需核對官方行事曆）',alert:true,expected};
 if(asOf>expected)return {label:'資料提醒｜今日行情已有快照，但盤後彙整可能尚未完成',alert:false,expected};
 return {label:intel?.asOf&&intel.asOf!==asOf?'資料提醒｜個股日期正常，但指數／法人資料日不同步':'日期符合預期盤後交易日（仍需核對官方來源）',alert:!!(intel?.asOf&&intel.asOf!==asOf),expected};
}
function statusText(){
 const el=document.querySelector('#r44VersionStatus');if(!el||!store)return;
 const r=store.radar,mt={asOf:store.intelDate},asOf=r?.asOf||'待資料',d=dateStatus(r,mt);
 const sourceDates=r?.marketAsOf||{},localTime=r?.generatedAt?new Date(r.generatedAt):null;
 const time=localTime&&!Number.isNaN(localTime.getTime())?taipeiParts(localTime).date+' '+new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(localTime):'待核對';
 // A frontend version string is NOT a verifiable GitHub commit/deployment identifier.
 el.textContent=`大盤對照元件：r44.4-QA（網站部署 commit 待核對）｜個股行情：${asOf}｜上市：${sourceDates['上市']||'待核對'}／上櫃：${sourceDates['上櫃']||'待核對'}｜盤後產製：${time}（台灣時間）｜收錄 ${r?.stockCount??'—'}、全市場診斷 ${r?.universeCount??'—'}｜${d.label}`;
 el.setAttribute('role','status');el.setAttribute('data-quality',d.alert?'warning':'check');
}
let store=null, run=0;
/* r44.4: benchmark relationship, NOT a prediction of cause. */
function dailyRelationship(c,ix,asOf){
 const mk=c?.market==='上市'?'taiex':c?.market==='上櫃'?'otc':null;
 if(!mk||!realDate(asOf)||c?.date!==asOf||ix?.date!==asOf||c?.possiblePriceAdjustment===true)return null;
 const sc=N(c.close),sd=N(c.changePct),ic=N(ix.close),id=N(ix.pct),chg=N(ix.change);
 const bars=c.bars;
 if(!(sc>0&&ic>0&&sd!==null&&id!==null&&Array.isArray(bars)&&bars.length>=2))return null;
 const prev=bars.at(-2),last=bars.at(-1);
 if(!Array.isArray(prev)||!Array.isArray(last)||!realDate(prev[0])||last[0]!==asOf||N(prev[4])<=0||N(last[4])<=0||N(last[4])!==sc)return null;
 const stockCalc=100*(sc/N(prev[4])-1);
 if(Math.abs(stockCalc-sd)>.16)return null;
 if(chg!==null){const old=ic-chg;if(!(old>0)||Math.abs(100*chg/old-id)>.16)return null;}
 if(Math.abs(id)>20||Math.abs(sd)>20)return null; // questionable split/quote: stop auto-labeling
 const d=sd-id;
 let label='大盤與個股皆接近平盤';
 if(id>.1&&sd>.1)label=d>=1?'跟漲且跑贏大盤':'同向上漲';
 else if(id>.1&&sd<-.1)label='大盤上漲、個股逆勢下跌';
 else if(id<-.1&&sd>.1)label='大盤下跌、個股逆勢上漲';
 else if(id<-.1&&sd<-.1)label=d>=1?'同跌但明顯抗跌':d<=-1?'同跌且相對落後':'同向下跌、表現接近大盤';
 else if(sd>.1)label='個股上漲、大盤變動較小';
 else if(sd<-.1)label=Math.abs(id)<=.1?'個股下跌、大盤變動較小':'個股偏弱、方向接近平盤';
 return {stockPct:stockCalc,marketPct:id,excessPct:d,label,marketName:mk==='taiex'?'加權':'櫃買',marketKey:mk};
}
function evidenceForDivergence(c,relation){
 const reasons=[];if(!relation)return reasons;
 const bars=Array.isArray(c?.bars)?c.bars:[],last=bars.at(-1)||[];
 const high=N(last[2]),low=N(last[3]),open=N(last[1]),close=N(last[4]);
 const range=high!==null&&low!==null?high-low:0;
 const closeLocation=range>0&&(close!==null)?(close-low)/range:null;
 const upperWick=range>0&&open!==null&&close!==null?(high-Math.max(open,close))/range:null;
 const vr=N(c?.volumeRatio),trend20=N(c?.trading?.return20Pct);
 if(relation.stockPct<-.1){
  if(trend20!==null&&trend20>=15)reasons.push(`近20日已漲 ${trend20.toFixed(1)}%，需核對是否漲多回檔；這不是當日跌因證據`);
  if(vr!==null&&vr>=1.5&&closeLocation!==null&&closeLocation<=.3)reasons.push('相對放量且收在當日低檔，需防短線賣壓；不能直接認定主力出貨');
  if(c?.riskEvidence?.breakoutFailed===true)reasons.push('既有突破失敗風險旗標，應先核對原大量K頸線');
  if(c?.riskEvidence?.belowFallingMa20===true)reasons.push('股價低於走弱的MA20，短期結構風險較高');
  const f=c?.fundamentals;
  if(realDate((f?.revenuePeriod||'')+'-01')&&String(f.revenuePeriod).slice(0,7)<=String(c.date).slice(0,7)&&((Number(c.date.slice(0,4))*12+Number(c.date.slice(5,7)))-(Number(f.revenuePeriod.slice(0,4))*12+Number(f.revenuePeriod.slice(5,7))))<=4&&N(f?.revenueYoY)!==null&&N(f.revenueYoY)<=-10)
    reasons.push(`已載入的營收年增率 ${N(f.revenueYoY).toFixed(1)}%，屬待核對的基本面線索，不能歸因於當日下跌`);
  if(N(f?.eps)!==null&&N(f.eps)<0&&f?.epsPeriod)
    reasons.push(`${esc(f.epsPeriod)} EPS為負，需先核對財報口徑與公告日期，不能當成當日下跌原因`);
 }
 if(relation.stockPct>.1){
  if(c?.riskLevel==='high')reasons.push('個股雖上漲，但既有風險評級仍高，應回頭核對頸線與防守');
  if(vr!==null&&vr<.8)reasons.push('量比偏低，價格反彈不代表新增資金明顯介入');
  if(upperWick!==null&&upperWick>=.42&&closeLocation!==null&&closeLocation<.5)reasons.push('高檔上影、收盤偏弱，需核對是否假突破');
 }
 if(!reasons.length)reasons.push('目前沒有足夠的價量或財務異常證據，不能推論漲跌原因');
 reasons.push('尚未核對當日公司重大訊息、法說、除權息及族群資金流；需排查才可討論原因');
 return reasons;
}
function stockBadge(c){
 const key=c?.market==='上市'?'taiex':c?.market==='上櫃'?'otc':null;
 if(!store||!key||c?.date!==store.asOf)return '<small class="r44-rel">大盤比較：資料日期不一致</small>';
 const ix=store.intel?.indices?.[key],res=dailyRelationship(c,ix,store.asOf);
 if(!res)return '<small class="r44-rel">大盤比較：同日漲跌資料未核對，暫不判斷</small>';
 const d=res.excessPct,sgn=x=>x>0?'+':'',tag=d>=1?'strong':d<=-1?'weak':'neutral';
 const clues=evidenceForDivergence(c,res);
 const showReasons=(res.stockPct<-.1||Math.abs(d)>=2);
 return `<div class="r44-rel ${tag}">同日 ${esc(res.marketName)} ${sgn(res.marketPct)}${res.marketPct.toFixed(2)}%／個股 ${sgn(res.stockPct)}${res.stockPct.toFixed(2)}%｜差距 ${sgn(d)}${d.toFixed(2)} 個百分點 · ${esc(res.label)}</div>${showReasons?`<details class="r44-stock-why" style="font-size:12px;line-height:1.65;margin:4px 0 8px"><summary>漲跌差異：查看可核對線索</summary>${clues.map(x=>`<p style="margin:6px 0">${esc(x)}</p>`).join('')}</details>`:''}<small class="r44-rel">同日相對表現不代表未來漲跌，也不能證明跌因。</small>`;
}
function lightCard(key,label,icon){
 const m=store?.history?.markets?.[key];const ix=store?.intel?.indices?.[key];const breadth=store?.radar?.marketBreadth;
 const b={asOf:breadth?.asOf,markets:breadth?.markets?.[key==='taiex'?'上市':'上櫃']};
 const c=classify(m,store?.asOf,ix?.date===store?.asOf?ix?.close:null,b);
 const status=key==='taiex'?'加權':'櫃買';const dated=ix?.date===store?.asOf;
 return `<details class="r44-idx r44-${c.light}"><summary><span class="r44-dot" aria-hidden="true"></span><b>${label}</b><small>${dated?money(ix.close)+' 點 · '+esc(store.asOf):'收盤點數待核對'}</small><strong>${esc(c.label)}</strong><span>⌄</span></summary><div class="r44-inner">${c.bars.length&&m?.verified&&c.bars.at(-1)[0]===store.asOf?chart(c.bars):'<p class="r44-warn">官方完整指數日 K 未取得或尚未與同日收盤核對，暫不畫假 K 線。</p>'}<div class="r44-levels"><div>MA20：<b>${money(c.ma20)}</b></div><div>近期支撐：<b>${money(c.support)}</b></div><div>近期壓力：<b>${money(c.resistance)}</b></div><div>上漲占比：<b>${c.breadthPct==null?'待資料':c.breadthPct.toFixed(1)+'%'}</b></div></div><p class="r44-note">${esc(c.reason)}｜支撐／壓力為過去20交易日最高低參考，不是已證實的歷史大量K頸線。</p></div></details>`;
}
function paint(){statusText();const el=document.querySelector('#r44MarketRegime');if(!el)return;
 if(!store){el.innerHTML='<p class="r44-warn">核對大盤收盤資料中…</p>';return;}
 el.setAttribute('aria-label','加權櫃買收盤與個股相對表現');
 const asOf=store.asOf,idx=store.intel?.indices||{},breadth=store.radar?.marketBreadth;
 const card=(key,name,market)=>{const v=idx[key],good=v?.date===asOf&&N(v.close)>0&&N(v.pct)!==null;
  const b=breadth?.asOf===asOf?breadth?.markets?.[market]:null;
  const n=N(b?.up),m=N(b?.down),count=N(b?.count);
  const valid=n!==null&&m!==null&&n>=0&&m>=0&&n+m>=50&&count!==null&&n+m<=count&&count>=100;
  const r=valid?`${(100*n/(n+m)).toFixed(1)}%（扣除平盤股）`:'待核對';
  return `<div><b>${name}</b><div>${good?money(v.close)+' 點 · '+(N(v.pct)>0?'+':'')+N(v.pct).toFixed(2)+'%':'同日資料未核對'}</div><small>上漲家數比例：${r}</small></div>`;};
 el.innerHTML=`<header class="r44-heading"><b>大盤收盤與個股對照</b><small>${esc(asOf||'日期待核對')} · 非即時</small></header><div class="r44-levels" style="margin-top:10px">${card('taiex','加權指數','上市')}${card('otc','櫃買指數','上櫃')}</div><small class="r44-breadth">已暫停沒有完整官方日K支持的紅綠燈與支撐／壓力圖。個股請看字卡中的「同日相對大盤」，不能單憑大盤或個股漲跌推定原因。</small>`;
}
async function requestJson(path){const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),9000);try{const r=await fetch(path+'?r44='+Date.now(),{cache:'no-store',signal:ctl.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}}
async function refresh(){const id=++run;const el=document.querySelector('#r44MarketRegime');if(el)el.innerHTML='<p class="r44-warn">核對官方指數日 K 與資料日期中…</p>';
 const [ra,mi]=await Promise.allSettled(['./data/radar.json','./data/market-intel.json'].map(requestJson));
 if(id!==run)return;
 const radar=ra.status==='fulfilled'?ra.value:null,intel=mi.status==='fulfilled'?mi.value:null;
 const asOf=radar?.asOf;
 store={radar,asOf,intelDate:intel?.asOf,intel:intel?.asOf===asOf?intel:null,history:null};paint();
}
function init(){if(!document.querySelector('#r44MarketRegime'))return;refresh();document.querySelector('#refreshBtn')?.addEventListener('click',()=>refresh());}
return {init,refresh,chart,classify,relative,cleanBars,dateStatus,expectedEod,dailyRelationship,evidenceForDivergence,stockBadge,_renderTest:paint,_setTestData:x=>{store=x;}};
});
