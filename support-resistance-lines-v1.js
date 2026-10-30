/* Support/resistance research overlay. Confirm pivots only after 2 subsequent bars. */
(function(root){'use strict';
function analyze(bars,asOf){
 const empty={status:'insufficient',supports:[],resistances:[],events:[],reason:'有效日K不足'};
 if(!Array.isArray(bars)||bars.length<25)return empty;
 let prev='',a=[];
 for(const b of bars){if(!Array.isArray(b)||b.length<6)return {...empty,reason:'K線欄位不足'};
  const date=String(b[0]),v=b.slice(1,6).map(Number);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date<=prev||v.some(x=>!Number.isFinite(x))||Math.min(...v.slice(0,4))<=0||v[4]<0||v[1]<Math.max(v[0],v[2],v[3])||v[2]>Math.min(v[0],v[1],v[3]))return {...empty,reason:'K線日期或價量異常'};
  a.push({date,high:v[1],low:v[2],close:v[3],volume:v[4]});prev=date;
 }
 if(asOf&&prev!==asOf)return {...empty,reason:'K線日期與盤後日期不一致'};
 const lows=[],highs=[];
 // The pivot at i is only known at i+2. Exclude the current and previous bar.
 for(let i=2;i<a.length-2;i++){
  if(a.slice(i-2,i+3).every((b,j)=>j===2||a[i].low<b.low))lows.push({index:i,confirmed:i+2,date:a[i].date,price:a[i].low});
  if(a.slice(i-2,i+3).every((b,j)=>j===2||a[i].high>b.high))highs.push({index:i,confirmed:i+2,date:a[i].date,price:a[i].high});
 }
 function lines(pivots,type){const results=[];
  for(let j=pivots.length-1;j>=1;j--){const b=pivots[j];let a0=null;
   for(let k=j-1;k>=0;k--)if(b.index-pivots[k].index>=5){a0=pivots[k];break;}
   if(!a0)continue;
   const slope=(b.price-a0.price)/(b.index-a0.index);
   // Prevent extreme extrapolations and lines crossing the pivot's intermediate highs/lows.
   if(Math.abs(slope)>Math.max(a0.price,b.price)*.04)continue;
   const intermediate=a.slice(a0.index,b.index+1);
   const violates=intermediate.some((v,k)=>type==='support'?v.low < (a0.price+slope*k)*.975:v.high>(a0.price+slope*k)*1.025);
   if(violates)continue;
   const now=a0.price+slope*(a.length-1-a0.index),before=a0.price+slope*(a.length-2-a0.index);
   if(now<=0||before<=0)continue;
   results.push({type,from:a0,to:b,slope,now,before,confirmedAt:a[b.confirmed].date});
   if(results.length===2)break;
  }return results;
 }
 const supports=lines(lows,'support'),resistances=lines(highs,'resistance');
 const last=a.at(-1),prior=a.at(-2),events=[];
 for(const l of [...supports,...resistances]){
  if(l.type==='support'&&prior.close>=l.before&&last.close<l.now)events.push({kind:'support-break',date:last.date,level:l.now});
  if(l.type==='resistance'&&prior.close<=l.before&&last.close>l.now)events.push({kind:'resistance-break',date:last.date,level:l.now});
 }
 return {status:'ok',supports,resistances,events,asOf:prev,pivotCount:{low:lows.length,high:highs.length}};
}
root.ChaopanTrendLines={analyze};
})(typeof globalThis!=='undefined'?globalThis:this);
