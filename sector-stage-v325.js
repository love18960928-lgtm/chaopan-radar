/* Chaopan RADAR r30 - show strong sectors only with at least one individually qualified leader; keep setups separately and cards on demand.
   Self-contained, testable; this is NOT a certified entry signal or live feed.
   The curated passive component tag is a limited, explicitly disclosed sample.
*/
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.ChaopanSectorV325=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const num=x=>x===null||x===undefined||x===''||typeof x==='boolean'||!Number.isFinite(Number(x))?null:Number(x);
 const mean=(a)=>a.length?a.reduce((p,c)=>p+c,0)/a.length:null;
 const median=a=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y);return (b[(b.length-1)>>1]+b[b.length>>1])/2};
 const themeCodes=new Set(['2327','2492','2375','2472','3026']); // limited sample, not entire passive-component universe
 const memoryCodes=new Set(['2344','2408','2337','3006','3260','4967','8299','2451','8271','5289','8088']); // curated memory-sector representatives
 const banned=/假突破|跌破|突破失敗|結構破壞|出貨|賣壓|轉弱|不宜追價|破位|長上影警戒/;
 const MIN_AVG_LOTS=500, MIN_DAY_LOTS=500, MIN_TURNOVER_K=10000; // lots; close*lots = NT$ thousands
 const liquid=v=>Boolean(v&&v.avgLots>=MIN_AVG_LOTS&&v.volume>=MIN_DAY_LOTS&&v.dayTradingValue>=MIN_TURNOVER_K);
 const structuralDanger=/假突破|跌破|突破失敗|結構破壞|出貨|賣壓|轉弱|破位|長上影警戒/;
 function sectorName(c){const name=String(c?.industry||c?.fundamentals?.industry||'').trim();if(!name||/未分類|待分類|不詳|未知/.test(name))return null;
  if(themeCodes.has(String(c.code))&&name==='電子零組件業')return '被動元件（代表股5檔）';
  if(memoryCodes.has(String(c.code))&&(/半導體|電子|電腦/.test(name)))return '記憶體（代表股11檔）';
  return name;
 }
 function validate(c,asOf){
  if(!c||c.date!==asOf||!/^(19|20)\d{2}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf+'T00:00:00Z'))||new Date(asOf+'T00:00:00Z').toISOString().slice(0,10)!==asOf||!/^[0-9]{4}$/.test(String(c.code)))return null;
  const bars=c.bars;if(!Array.isArray(bars)||bars.length<22)return null;
  let previous='';let i=0;
  for(const b of bars){
   if(!Array.isArray(b)||b.length<6||typeof b[0]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b[0])||b[0]<=previous||b[0]>asOf)return null;
   previous=b[0];const [o,h,l,x,v]=b.slice(1,6).map(num);
   if([o,h,l,x,v].some(k=>k===null)||Math.min(o,h,l,x)<=0||h<Math.max(o,x)||l>Math.min(o,x)||v<0)return null;
   i++;
  }
  if(bars.at(-1)[0]!==asOf)return null;
  const last=bars.at(-1),[o,h,l,cl,v]=last.slice(1,6).map(num);
  for(const [key,value] of [['close',cl],['open',o],['high',h],['low',l],['lots',v]]){
   const actual=num(c[key]);if(actual===null||Math.abs(actual-value)>Math.max(.001,value*.00001))return null;
  }
  if(!(v>0))return null;
  const avg20=mean(bars.slice(-21,-1).map(x=>num(x[5])));
  const ma=(n,end=bars.length)=>mean(bars.slice(end-n,end).map(x=>num(x[4])));
  if(!(avg20>0))return null;
  const prev=num(bars.at(-2)[4]),prev2=num(bars.at(-3)[4]);
  const range=h-l,position=range>0?(cl-l)/range:1,upper=range>0?(h-Math.max(o,cl))/range:0;
  const neck=num(c.neck),close20=ma(20),close10=ma(10),close5=ma(5),old5=ma(5,bars.length-1),old10=ma(10,bars.length-1),old20=ma(20,bars.length-5);
  const ratio=v/avg20;
  return {close:cl,open:o,high:h,low:l,prev,prev2,neck,ma5:close5,old5,ma20:close20,ma10:close10,old10,old20,
   volume:v,ratio,position,upper,changePct:prev>0?100*(cl/prev-1):null,
   dayTradingValue:cl*v,avgLots:avg20};
 }
 // Strict six-average confirmation is separate from early-stage observation.
 // We require 240+ same-date, chronological, valid daily bars and compute all
 // averages ourselves. In particular, 65-bar snapshots and unverified cached
 // MA240 fields must never be certified as a six-MA leader.
 function sixLineAudit(c,snapshot){
  const v=snapshot||validate(c,c?.date);
  const bars=c?.bars;
  if(!v||!Array.isArray(bars))return {status:'invalid',confirmed:false,label:'六線認證：行情待核對',reason:'交易日或OHLCV不完整'};
  if(bars.length<240)return {status:'insufficient',confirmed:false,label:'六線待認證',reason:'僅有'+bars.length+'根日K，需至少240根才能核算MA240',bars:bars.length};
  const prices=bars.map(b=>num(b[4]));
  const avg=(n,end=prices.length)=>mean(prices.slice(end-n,end));
  const levels={};for(const n of [5,10,20,60,120,240])levels[n]=avg(n);
  const below=[5,10,20,60,120,240].filter(n=>!(v.close>levels[n]));
  if(below.length)return {status:'below',confirmed:false,label:'尚未站上六線',reason:'未站上 '+below.map(n=>'MA'+n).join('、'),levels};
  const slope20=levels[20]>avg(20,prices.length-5),slope60=levels[60]>avg(60,prices.length-5);
  const alignment=levels[5]>=levels[10]&&levels[10]>=levels[20]&&levels[20]>=levels[60]&&levels[60]>=levels[120]&&levels[120]>=levels[240];
  const cleanCandle=v.position>=.45&&v.upper<.40&&v.ratio>=.60&&v.ratio<=5;
  const risk=c.riskFirst||c.possiblePriceAdjustment||c.overextended||['high','medium'].includes(c.riskLevel)||
    banned.test([c.followStatus,c.unifiedStage,c.trading?.status].join(' '))||v.close/v.ma20>1.12;
  const confirmed=liquid(v)&&slope20&&slope60&&alignment&&cleanCandle&&!risk;
  return {status:confirmed?'confirmed':'six-above',confirmed,
   label:confirmed?'六線確認強勢':'六線站上／趨勢未確認',
   reason:confirmed?'站上六線、均線多頭排列、MA20與MA60上彎且未觸發賣壓門檻':
      [!alignment?'均線尚未全數多頭排列':'',!(slope20&&slope60)?'MA20／MA60斜率尚未同步轉正':'',!cleanCandle?'當日K棒／量比未通過':'',risk?'風險訊號未解除':''].filter(Boolean).join('；'),levels};
 }
 // "Short/mid-term sector leader watch" is distinct from the strictly
 // confirmed 6-MA strong stock. Do not turn unknown 120/240D MAs into passes.
 function leaderAudit(c,v,stage){
  if(!v)return {eligible:false,reason:'交易日或價量資料不足'};
  if(!liquid(v))return {eligible:false,reason:'成交量或成交金額未達門檻（20日均量500張、當日500張、當日成交金額1000萬元）'};
  if(c?.riskFirst||c?.possiblePriceAdjustment||c?.overextended||
     ['medium','high'].includes(String(c?.riskLevel||''))||
     banned.test([c?.followStatus,c?.unifiedStage,c?.trading?.status].join(' '))||
     ['supply','danger','unknown'].includes(stage?.kind))return {eligible:false,reason:'賣壓／結構／風險旗標未解除'};
  const b=c.bars;
  if(b.length<65||v.volume<50||v.avgLots<300||!(v.neck>0)||v.close<=v.neck)return {eligible:false,reason:'均線、頸線或流動性不足／尚未站上頸線'};
  const closes=b.map(bar=>num(bar[4]));
  const avg=(n,end=closes.length)=>mean(closes.slice(end-n,end));
  const averages=[5,10,20,60].map(n=>avg(n));
  if(averages.some(n=>!Number.isFinite(n))||averages.some(n=>v.close<=n))return {eligible:false,reason:'價格尚未站上MA5／10／20／60'};
  if(!(avg(20)>avg(20,closes.length-5)&&avg(60)>avg(60,closes.length-5)&&avg(5)>=avg(10)*.99))return {eligible:false,reason:'短中期均線斜率或排列不符'};
  if(!(v.ratio>=.7&&v.ratio<=4.5&&v.position>=.55&&v.upper<.38&&v.changePct>=0))return {eligible:false,reason:'成交量／K棒收盤位置未通過'};
  if(v.close/avg(20)>1.12||v.close/avg(10)>1.09)return {eligible:false,reason:'短線均線乖離過大'};
  const quality=Math.round((v.changePct*1.2+Math.min(v.ratio,3)*3+v.position*5-Math.max(0,v.close/avg(10)-1)*100)*10)/10;
  const six=sixLineAudit(c,v);
  return {eligible:true,confirmed:six.confirmed,quality,label:six.confirmed?'六線確認強勢':'短中期轉強觀察／六線待認證',
   reason:six.confirmed?'六線多頭、量價與風險關卡均通過':'站上頸線與MA5／10／20／60，MA20與MA60上彎；尚須確認突破隔日守穩與MA120／240'};
 }
 // r31: An established MA5/MA10 trend is a separate *holding/watch* state.
 // Missing one canonical large-volume neckline must NOT suppress a verifiable
 // rally; a high BIAS or quiet volume affects chase/entry risk, not the
 // existence of the historical trend itself. This is EOD-only analysis.
 function movingTrendAudit(c,v){
  const bars=c?.bars||[];
  if(!v||bars.length<35||v.ma5===null||v.ma10===null||v.ma20===null||v.old20===null)return null;
  const closes=bars.map(b=>num(b[4]));
  const avgAt=(n,end)=>end>=n?mean(closes.slice(end-n,end)):null;
  const recent=Array.from({length:8},(_,j)=>{
   const end=closes.length-j,m10=avgAt(10,end);
   return m10!==null&&closes[end-1]>=m10*.985;
  });
  const aboveCount=recent.filter(Boolean).length;
  const twentyReturn=closes.length>20?(v.close/closes[closes.length-21]-1)*100:0;
  const tenRising=v.ma10>v.old10&&v.ma20>v.old20*1.005;
  const earlierM5=avgAt(5,closes.length-1);
  const wasOn5=closes.at(-2)>=earlierM5*.995;
  const established=aboveCount>=6&&tenRising&&twentyReturn>=8&&v.ma5>=v.ma10*.975;
  if(!established)return null;
  const gap5=(v.close/v.ma5-1)*100;
  const gap10=(v.close/v.ma10-1)*100;
  const gap20=(v.close/v.ma20-1)*100;
  const warning=[];
  if(gap20>=12)warning.push('距MA20 '+gap20.toFixed(1)+'%，乖離偏大，不宜追價');
  if(gap10>=6.5)warning.push('距MA10 '+gap10.toFixed(1)+'%，短線拉開均線');
  if(v.ratio<.6)warning.push('量比'+v.ratio.toFixed(2)+'，量縮須提防動能衰退');
  if(v.upper>=.36&&v.position<.55)warning.push('上影賣壓警戒');
  // Preserve price-phase distinction: breaking MA5 is a pullback, not "holding MA5".
  const ride=gap5>=-.5&&gap10>=-.5&&v.ma5>v.old5&&v.close>=v.ma20;
  const pullback=!ride&&wasOn5&&gap5<-.5&&gap10>=-1.0&&v.close>=v.ma20;
  if(!ride&&!pullback)return null;
  return {stage:ride?'hold':'maPullback',entryApproved:false,
   reason:(ride?'近期多數收盤站在MA10附近或上方，MA5／MA10趨勢上彎；沿短均線持股觀察':'前期沿MA5／MA10走升，現跌破MA5但仍在MA10附近；列回檔防守觀察')+
    '；最近8根有'+aboveCount+'根守住MA10附近。'+(warning.join('；')||'目前無額外高乖離／量縮警戒')+'；這不是確認買點。',
   warnings:warning,bias5:gap5,bias10:gap10,bias20:gap20};
 }
 // Independent supplement: keep the original neck/first/second/third/etc.
 // stage outcomes intact; only add a trend watch when that scan had no candidate.
 function inspectTrend(c,asOf,upstream){
  const v=validate(c,asOf);
  if(!v)return null;
  if(c.possiblePriceAdjustment||c.onePriceLimit||c.riskFirst||
     ['high','medium'].includes(String(c.riskLevel||''))||
     structuralDanger.test([c.followStatus,c.unifiedStage,c.trading?.status].join(' '))||
     ['danger','supply','unknown'].includes(upstream?.kind))return null;
  if(!liquid(v)||v.high<=v.low||
     (v.upper>=.44&&v.position<=.45)||(v.ratio>=2&&v.position<.32))return null;
  return movingTrendAudit(c,v);
 }
 function inspect(c,asOf,stage){
  const v=validate(c,asOf);if(!v)return {stage:'unknown',reason:'價格／日期／成交量資料不完整',snapshot:null};
  const x={stage:'none',reason:'暫不符合本輪觀察條件',snapshot:v};
  if(c.possiblePriceAdjustment||c.overextended||c.onePriceLimit||c.riskFirst||['high','medium'].includes(String(c.riskLevel||''))||
     banned.test([c.followStatus,c.unifiedStage,c.trading?.status].join(' '))||
     ['danger','supply','unknown'].includes(stage?.kind)){
   x.stage='blocked';x.reason='結構或賣壓風險，禁止列入進場觀察';return x;
  }
  // Minimum liquidity, wick and chase gate independent of upstream scores.
  if(!liquid(v)||v.high<=v.low||v.upper>=.44&&v.position<=.45||
     v.ratio>=2&&v.position<.32||v.ma20===null||v.close<v.ma20*.99||
     v.close/v.ma20>1.12){x.stage='blocked';x.reason='量能、長上影、MA20位置或乖離未通過';return x;}
  if(!(v.neck>0&&v.neck<Infinity)){x.reason='缺可核對的歷史頸線';return x;}
  const bars=c.bars;
  // r42.2 audit: original breakout neckline and the LATEST large-volume neckline
  // are different concepts. An old event MUST NOT become a fresh "first" when
  // price re-crosses an updated resistance. The sequence is an EOD observation,
  // not a certified entry recommendation.
  const cycleDate=String(c.cycle?.initialDate||'');
  const ix=bars.findIndex(b=>b[0]===cycleDate);
  const eventBar=ix>0?bars[ix]:null,preEvent=ix>0?bars[ix-1]:null;
  const eventLevel=num(c.cycle?.level),seq=c.breakoutSequence||{};
  const offset=ix>=0?bars.length-1-ix:null;
  const reliableBreak=Boolean(c.cycle?.firstHistoricalBreakout===true&&
   eventLevel!==null&&eventLevel>0&&eventBar&&preEvent&&
   String(seq.initialDate||'')===cycleDate&&num(seq.level)!==null&&
   Math.abs(Number(seq.level)/eventLevel-1)<=.0001&&
   Number(seq.daysSinceFirst)===offset&&
   Number(eventBar[4])>eventLevel&&Number(preEvent[4])<=eventLevel&&
   Number(eventBar[5])>0);
  const trendOK=v.ma20!==null&&v.old20!==null&&v.ma20>=v.old20*.98;
  const maGrowing=v.old20!==null&&v.ma20>=v.old20*.995;
  const oldLevelNote=eventLevel!==null&&v.neck>eventLevel*1.005?
    '；原突破價'+eventLevel+'，較新的大量K頸線'+v.neck+'尚須另外確認':'';
  if(reliableBreak&&offset===0&&seq.phase==='first'&&v.close>=v.neck&&
     v.prev<=v.neck&&v.ratio>=1.2&&v.position>=.55&&v.upper<.4&&
     trendOK&&v.close>=v.ma10){
   x.stage='first';x.reason='核對原始事件日期與首次突破價，當日收盤突破；隔日需再認證';return x;
  }
  if(reliableBreak&&offset===1&&seq.phase==='second'&&seq.tone!=='danger'&&
     v.close>eventLevel&&v.close>=v.ma10*.985&&v.position>=.45&&
     v.ratio>=.65&&trendOK){
   x.stage='second';x.reason='原突破事件的第二根守住原關卡；僅是階段追蹤，非認證買點'+(c.cycle?.initialQuality==='突破K有疑慮'?'；初始突破K有疑慮，須提高警戒':'')+oldLevelNote;return x;
  }
  if(reliableBreak&&offset===2&&seq.phase==='follow'&&
     bars.slice(-2).every(b=>num(b[4])>eventLevel)&&
     v.close>=v.ma10&&v.position>=.45&&v.ratio>=.60&&trendOK){
   x.stage='third';x.reason='原事件後第三根仍站在原突破價上；量價及新壓力須另行驗證'+oldLevelNote;return x;
  }
  if(reliableBreak&&offset===3&&seq.phase==='follow'&&
     bars.slice(-3).every(b=>num(b[4])>eventLevel)&&
     v.close>=v.ma10&&v.position>=.45&&v.ratio>=.55&&trendOK&&
     v.close/v.ma10<=1.075){
   x.stage='fourth';x.reason='原事件後第四根持續守穩；不代表可追價'+oldLevelNote;return x;
  }
  // Independent continuation of an established above-neckline MA5/MA10 slope.
  // This is deliberately an observation phase: no official market history is available.
  const trailingHold=bars.length>=35&&Array.from({length:6},(_,j)=>bars.length-1-j).every(k=>{
   const close=num(bars[k][4]);const ma5=mean(bars.slice(k-4,k+1).map(b=>num(b[4]))),ma10=mean(bars.slice(k-9,k+1).map(b=>num(b[4])));
   return close!==null&&ma5!==null&&ma10!==null&&close>=ma5*.997&&close>=ma10*.997;
  });
  if(trailingHold&&v.close>v.neck*1.005&&v.prev>v.neck&&
     v.ma5>=v.ma10&&v.ma5>=v.old5&&v.ma10>=v.old10&&v.ma20>v.old20*1.002&&
     v.close/v.ma10<=1.065&&v.ratio>=.6&&v.position>=.45){
   x.stage='hold';x.reason='已在歷史頸線上方，近6根K線持續守住MA5／MA10且均線上彎；需沿線管理停利，非保證主升';return x;
  }
  // Volume + price ignition below the major neckline is distinct from the first neckline breakout.
  const prior15High=bars.length>=20?Math.max(...bars.slice(-16,-1).map(b=>num(b[4]))):null;
  if(v.close<v.neck&&prior15High!==null&&v.close>prior15High&&
     v.changePct>=2&&v.ratio>=1.5&&v.ratio<=5&&v.position>=.65&&v.upper<.3&&
     v.ma5>=v.ma10&&v.close>=v.ma20&&v.ma20>=v.old20*.985&&v.close/v.ma10<=1.08){
   x.stage='launch';x.reason='放量站上近15根K線收盤高點，但尚未突破主要大量K頸線；僅屬量價啟動觀察';return x;
  }
  if(v.close<v.neck&&v.close>=v.neck*.96&&v.close>=v.ma10*.995&&maGrowing&&v.ratio>=.60&&v.position>=.35&&
     (c.preLaunch===true||/接近|預備|頸線/.test([c.unifiedStage,c.followStatus].join(' ')))){
   x.stage='ready';x.reason='距歷史頸線不足4%，均線與量價仍在觀察區；不是已突破';return x;
  }
  // Before neckline breakout, a 5/10-day MA reclaim is an EARLY WATCH stage, not first breakout.
  // Conditions: under neckline, not an exhausted high-volume low-close, short averages rising,
  // mid-term MA20 nearly stable, reasonably close to neckline, sufficient liquidity.
  if(v.close<v.neck&&v.close>=v.neck*.92&&v.close>=v.ma5&&v.close>=v.ma10&&
     v.ma5>=v.old5&&v.ma10>=v.old10&&v.ma5>=v.ma10*.995&&
     v.ma20>=v.old20*.98&&v.ratio>=.60&&v.position>=.45&&v.close>v.prev){
   x.stage='ma510';x.reason='突破前已站上MA5／MA10且短均線回升，仍低於歷史頸線；僅列預備觀察，未確認突破';return x;
  }
  if(reliableBreak&&offset>=2&&seq.phase==='follow'&&v.close>eventLevel&&v.close>=v.ma10&&v.prev<=v.ma10*1.015&&v.close>v.prev&&v.position>=.50){
   x.stage='reentry';x.reason='已知突破事件後，回測短均線再向上；須防範假反彈'+oldLevelNote;return x;
  }
  if(stage?.kind==='strong'&&sixLineAudit(c,v).confirmed&&reliableBreak&&v.close>eventLevel&&v.close>=v.ma10&&v.ratio>=.65){
   x.stage='trend';x.reason='多頭趨勢延續觀察，若回落仍須依支撐與移動停利管理';return x;
  }
  return x;
 }
 function analyze(rows,asOf,stageFn){
  const groups=new Map(),observations=[];
  for(const c of Array.isArray(rows)?rows:[]){
   const sector=sectorName(c);if(!sector)continue;
   const snap=validate(c,asOf);if(!snap)continue;
   if(!groups.has(sector))groups.set(sector,{name:sector,total:0,ups:0,returns:[],stocks:[],memberRows:[]});
   const group=groups.get(sector);group.total++;group.memberRows.push(c);
   if(snap.changePct>0)group.ups++;
   group.returns.push(snap.changePct);
   const upstream=typeof stageFn==='function'?stageFn(c):null;
   const primary=inspect(c,asOf,upstream);
   const stage=!['unknown','blocked','none'].includes(primary.stage)?primary:
     (inspectTrend(c,asOf,upstream)||primary);
   if(!['unknown','blocked','none'].includes(stage.stage)){
    const item={row:c,sector,stage:stage.stage,reason:stage.reason,snapshot:stage.snapshot||snap,
     entryApproved:false};
    group.stocks.push(item);observations.push(item);
   }
  }
  const coverage=Array.from(groups.values()).map(g=>({name:g.name,total:g.total,advancers:g.ups,breadth:g.ups/g.total,
   median:median(g.returns),count:g.stocks.length,stocks:g.stocks}));
  // Sector strength is the actual EOD median & participation, not the count of one winner.
  // Classify MARKET BREADTH separately from actionable stock qualifications.
  // A strong sector with zero individually-qualified stocks must remain visible,
  // with an explicit no-qualified-stock notice; it is not a buy signal.
  const hasBreadth=g=>g.total>=(g.name.startsWith('被動元件')?3:6)&&g.breadth>=.55;
  const byStrength=(a,b)=>b.median-a.median||b.breadth-a.breadth||b.count-a.count;
  const strong=coverage.filter(g=>hasBreadth(g)&&g.median>=.8).sort(byStrength);
  const warming=coverage.filter(g=>hasBreadth(g)&&g.median>=.4&&g.median<.8).sort(byStrength);
  // The sector is determined independently from eligible constituent shares.
  // For the presentation, leaders are never inferred just from belonging to
  // a strong group, and six-MA confirmation remains a separate audit.
  for(const g of coverage){
   g.leaders=(groups.get(g.name)?.memberRows||[]).map(c=>{
    const snapshot=validate(c,asOf);
    const stage=typeof stageFn==='function'?stageFn(c):null;
    const audit=leaderAudit(c,snapshot,stage);
    return audit.eligible?{row:c,sector:g.name,stage:'leader',reason:audit.label+'；'+audit.reason,
      quality:audit.quality,snapshot,confirmedSix:audit.confirmed}:null;
   }).filter(Boolean).sort((a,b)=>Number(b.confirmedSix)-Number(a.confirmedSix)||b.quality-a.quality);
   g.leaderCount=g.leaders.length;
  }
  // A sector only appears in the qualified sector-stock directory if it also
  // has at least ONE individually eligible constituent. Pure breadth signals
  // are still available in coverage/warming for analysis, not promoted as picks.
  const qualifiedStrong=strong.filter(g=>g.leaderCount>0);
  qualifiedStrong.sort((a,b)=>Number(b.leaderCount)-Number(a.leaderCount)||byStrength(a,b));
  // Rank by setup class first and quality within that class. This is not a win rate.
  // A breakout with high slippage/extension should rank below a cleaner peer in the same class.
  const priority={hold:0,maPullback:1,ready:2,ma510:3,first:4,second:5,third:6,fourth:7,launch:8,reentry:9,trend:10};
  const quality=(o)=>{const v=o.snapshot;
   const gap10=(v.close/v.ma10-1)*100, gap20=(v.close/v.ma20-1)*100;
   const up20=v.old20>0?(v.ma20/v.old20-1)*100:0;
   const volGood=Math.min(Math.max(v.ratio,0),2.5);
   const candle=v.position*18 + Math.max(-5,Math.min(8,up20))*2;
   const stretch=Math.max(0,gap10-3)*5+Math.max(0,gap20-7)*4;
   const strongWick=Math.max(0,v.upper-.20)*24;
   return Math.round((candle+volGood*6-stretch-strongWick)*10)/10;
  };
  for(const o of observations)o.quality=quality(o);
  const compare=(a,b)=>priority[a.stage]-priority[b.stage]||b.quality-a.quality||String(a.row.code).localeCompare(String(b.row.code));
  observations.sort(compare);
  for(const g of coverage)g.stocks.sort(compare);
  return {asOf,strong:qualifiedStrong,otherBroadStrong:strong.filter(g=>g.leaderCount===0),warming,watch:observations,coverage,counts:observations.reduce((a,x)=>(a[x.stage]=(a[x.stage]||0)+1,a),{})};
 }
 return {sectorName,validate,sixLineAudit,leaderAudit,inspect,inspectTrend,analyze,themeCodes:[...themeCodes],memoryCodes:[...memoryCodes]};
});
