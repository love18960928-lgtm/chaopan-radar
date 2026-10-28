'use strict';
const assert=require('node:assert/strict');
const api=require('../portfolio-manager-v140.js');
const asOf='2026-10-28';
function bars({vol=1000,close=100,breakout=false}={}){
 const a=Array.from({length:25},(_,i)=>{const c=close-10+i*.4;return [`2026-09-${String(i+1).padStart(2,'0')}`,c-1,c+1,c-2,c,vol]});
 a[24]=[asOf,close-1,close+2,close-2,close,vol*2];
 return a;
}
function row(b,level=98){return {date:asOf,bars:b,breakoutSequence:{level}};}
const b=bars();b[24]=[asOf,101,104,100,102,2000];
assert.equal(api.addReview(row(b,100),asOf).kind,'breakout');
assert.equal(api.addReview(row(b,105),asOf).kind,'trend');
assert.equal(api.addReview(row(bars({vol:100})),asOf).kind,'wait');
assert.equal(api.addReview(row(b),'2026-10-27').kind,'wait');
assert.equal(api.addReview({date:asOf,bars:b.slice(-20)},asOf).kind,'wait');
const bad=bars();bad[24][2]=1;
assert.equal(api.addReview(row(bad),asOf).kind,'wait');
console.log('6 portfolio add-signal checks passed');
