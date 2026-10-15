"""V2.5 single as-of daily OHLCV judgement for TWSE/TPEx.

Never infer institutional positions or guarantee a trade. A breakout is an
EVENT, not proof of a sustainable trend. Event anchors are required to have
existed before the event; subsequent days are not allowed into an earlier call.
"""
from statistics import mean
from math import isfinite
from structure_v23 import _valid_bars
from structure_v24 import unified_structure


def _atr(b, end, period=14):
    if end < period: return None
    return mean(max(b[i][2]-b[i][3],abs(b[i][2]-b[i-1][4]),abs(b[i][3]-b[i-1][4]))
                for i in range(end-period+1,end+1))


def _trend_strength(b, period=14):
    """Wilder ADX, range/trend *context*, not trading probability."""
    if len(b)<period*3+1:return None
    pdm=[];mdm=[];tr=[]
    for i in range(1,len(b)):
        up=b[i][2]-b[i-1][2];down=b[i-1][3]-b[i][3]
        pdm.append(up if up>down and up>0 else 0.)
        mdm.append(down if down>up and down>0 else 0.)
        tr.append(max(b[i][2]-b[i][3],abs(b[i][2]-b[i-1][4]),abs(b[i][3]-b[i-1][4])))
    def wilder(arr):
        state=sum(arr[:period]);out=[state]
        for val in arr[period:]:
            state=state-state/period+val;out.append(state)
        return out
    tt=wilder(tr);pp=wilder(pdm);mm=wilder(mdm)
    dx=[100*abs(a-b)/(a+b) if a+b>0 else 0 for a,b in
        ((100*p/t if t else 0,100*m/t if t else 0) for p,m,t in zip(pp,mm,tt))]
    if len(dx)<period:return None
    adx=mean(dx[:period]);
    for x in dx[period:]:adx=(adx*(period-1)+x)/period
    return round(adx,1) if isfinite(adx) else None


def _volume_flow(b, span=12):
    up=[];down=[]
    for i in range(max(1,len(b)-span),len(b)):
        if b[i][4]>b[i-1][4]:up.append(b[i][5])
        elif b[i][4]<b[i-1][4]:down.append(b[i][5])
    if not up or not down or mean(down)<=0:return None
    return round(mean(up)/mean(down),2)


def _events_from_levels(b,structure,lookback=45):
    """Select last cross by original dated resistance; distinguish initial/reclaim.

    A resistance must be formed at least 2 bars before the cross, and no
    post-cross information enters its identification. `formedIndex` records
    the last member in the group: conservative to avoid hindsight.
    """
    n=len(b); out=[]
    zones=structure.get('recentResistanceLevels',[])
    for z in zones:
        level=float(z['price']);formed=z.get('formedIndex',n)
        for i in range(max(1,n-lookback),n):
            if formed>i-2 or not (b[i-1][4]<=level<b[i][4]):continue
            had_earlier=any(b[j][4]>level for j in range(max(formed+1,0),i))
            # no lookahead and no volume requirement for first PRICE cross
            out.append({'idx':i,'date':b[i][0],'level':level,
                        'oldLevelDate':z['date'],'previouslyCrossed':had_earlier,
                        'strength':z['strength']})
    if not out:return None
    # Latest crossing of a level belongs to earliest unbroken episode up to
    # 15 days. Explicitly prioritize currently active level over stale events.
    # A distant failed breakout is historical risk, not the current active neck.
    # Select recent episode whose original level is still relevant to price.
    current=b[-1][4]
    nearby=[e for e in out if .94*e['level']<=current<=1.18*e['level']]
    if not nearby:return None
    stable=[e for e in nearby if e['idx']>=n-8 and not any(b[j][4]<e['level']*.94 for j in range(e['idx']+1,n))]
    latest=(min(stable,key=lambda x:(x['idx'],-x['strength'])) if stable else
            max(nearby,key=lambda x:(x['idx'],-abs(current/x['level']-1),x['strength'])))
    # Pin the original event price as it was known on that date. Later
    # cluster extensions cannot retroactively move the entry anchor.
    anchored=unified_structure(b[:latest['idx']+1])
    if anchored.get('priceBreakout') and anchored.get('primaryNeckline'):
        original=float(anchored['primaryNeckline'])
        if abs(original/latest['level']-1)<.025:latest={**latest,'level':original}
    same=sorted((e for e in out if abs(e['level']/latest['level']-1)<.009),key=lambda x:x['idx'])
    begin=latest
    for e in reversed(same):
        if e['idx']>latest['idx']:continue
        if any(b[j][4]<latest['level']*.965 for j in range(e['idx']+1,latest['idx'])):
            break
        begin=e
    return {**latest,'initialIdx':begin['idx'],'initialDate':begin['date'],
            'initialAlreadyCrossed':begin['previouslyCrossed']}



def breakout_sequence(b, event, neck, risk_first=False):
    """Explain pre-cross / first / next trading bar using only this as-of prefix.

    A second candle means the NEXT trading day, not the second positive candle.
    Selling pressure is never proof of institutional distribution.
    """
    if len(b)<61:
        return {'phase':'insufficient','label':'資料不足','assessment':'需要至少61根有效日K','tone':'neutral','reasons':[]}
    today=b[-1];close=today[4]
    if event is None:
        if neck and 0 <= 100*(neck/close-1) <= 3 and close < neck:
            near=round(100*(neck/close-1),2)
            return {'phase':'ready','label':'接近頸線｜第一根預備','assessment':'尚未突破；下一交易日觀察是否形成第一根實體突破K',
                    'tone':'warn' if risk_first else 'watch','level':neck,'distancePct':near,
                    'reasons':[f'距目前頸線約{near}%','盤中觸價僅預警，須核對紅K、收盤位置與量能'],
                    'next':'盤中守住預設突破價；收盤站穩才算第一根確認'}
        return {'phase':'none','label':'尚未進入突破觀察區','assessment':'等待價格接近可靠近期頸線','tone':'neutral','level':neck,'reasons':[]}
    initial=event['initialIdx'];lvl=event['level'];since=len(b)-1-initial
    first=b[initial]
    first_vol=float(first[5]);now_vol=float(today[5]);ratio=round(now_vol/first_vol,2) if first_vol>0 else None
    common={'level':lvl,'initialDate':event['initialDate'],'firstClose':first[4],
            'firstVolumeLots':first_vol,'daysSinceFirst':since,'secondVsFirstVolumeRatio':ratio}
    if since==0:
        rng=first[2]-first[3];loc=(first[4]-first[3])/rng if rng>0 else 1
        upper=(first[2]-max(first[1],first[4]))/rng if rng>0 else 0
        gap_fade=first[1]>lvl*1.02 and first[4]<first[1] and loc<.65
        weak=upper>.4 or loc<.5 or gap_fade or risk_first
        red_warning=bool(first[4]<first[1] and (upper>.35 or loc<.55))
        return {**common,'phase':'first','label':('第一根收盤突破但遇賣壓｜警戒' if red_warning else '突破頸線｜第一根'),
                'assessment':('第一根雖收在頸線之上，但紅綠實體／上影顯示賣壓，需比較第二根，不能直接稱為出貨' if red_warning else '突破K品質偏弱／等待第二根驗證' if weak else '第一根已收盤跨越原頸線／第二根尚未出現'),
                'tone':'danger' if risk_first else ('warn' if weak else 'good'),
                'reasons':[f'第一根收盤 {first[4]:g} 元；固定原頸線 {lvl:g} 元',f'收盤位置 {loc:.0%}；上影比例 {upper:.0%}'],
                'next':'次交易日比較是否守住原頸線、量能是否異常及上影線是否擴大'}
    if since==1:
        rng=today[2]-today[3];loc=(close-today[3])/rng if rng>0 else 1
        wick=(today[2]-max(today[1],close))/rng if rng>0 else 0
        above=close>=lvl*.997
        down=close<first[4]
        heavy=ratio is not None and ratio>=1.25
        contracted=ratio is not None and ratio<=.80
        selling=heavy and (loc<.45 or wick>=.38) and (down or close<today[1])
        if not above:
            label='第二根跌回頸線｜假突破警戒';desc='第二天失守原頸線，先列結構轉弱，不能直接稱為洗盤';tone='danger'
        elif selling:
            label='第二根放量回落｜疑似賣壓';desc='量比第一根放大，卻收低或留下較長上影；可能換手／賣壓，無法證實出貨';tone='danger'
        elif contracted and (down or abs(close/first[4]-1)<=.016):
            label='第二根量縮整理｜守頸線';desc='量縮且仍守原頸線，較像整理，下一根需驗證是否重新轉強';tone='watch'
        elif close>first[4] and loc>=.65 and not risk_first:
            label='第二根續強｜初步確認';desc='收盤高於第一根、接近當日上緣，原頸線尚未失守';tone='good'
        else:
            label='第二根震盪｜等待第三根';desc='尚不能判為出貨或續強，觀察原頸線回測與量能';tone='warn'
        if risk_first:label='第二根風險優先｜結構警戒';desc+='；另有重大結構／量價風險';tone='danger'
        return {**common,'phase':'second','label':label,'assessment':desc,'tone':tone,
                'secondDate':today[0],'secondClose':close,'secondVolumeLots':now_vol,
                'reasons':[f'第一根收盤 {first[4]:g} → 第二根 {close:g} 元',
                           f'第二根／第一根量比 {ratio if ratio is not None else "待資料"} 倍',
                           f'第二根收盤位置 {loc:.0%}、上影比例 {wick:.0%}'],
                'next':'第三根觀察是否守住原頸線；高檔放量回落要先守風險'}
    return {**common,'phase':'follow','label':'突破後續追蹤',
            'assessment':'已超過第二交易日，繼續以原頸線追蹤續強、量縮整理或跌回',
            'tone':'watch','reasons':[f'追蹤第 {since+1} 個交易日'],
            'next':'重新站回不是新的第一根；注意原頸線、支撐與量價風險'}

def cycle_judgement(b, structure=None, market_breadth=None):
    b=_valid_bars(b);base=structure if structure is not None else unified_structure(b)
    r={**base,'rules':'recent-cycle-v2.5','cycle':None,'signalQuality':None,
       'entryReadiness':'資料不足','holdGuidance':'不適用','regime':'資料不足',
       'marketBreadthAboveMA20Pct':market_breadth,'setupEvidence':{},
       'riskFlags':[], 'riskFirst':False,'profitReview':'資料不足','breakoutSequence':None}
    if len(b)<61:
        r.update({'unifiedStage':'資料不足','unifiedScore':None,'unifiedReasons':['少於61個交易日，無法認定第一根或趨勢'],'priceBreakout':False,'volumeBreakout':False,'breakoutSequence':breakout_sequence(b,None,None)})
        return r
    n=len(b);now=b[-1];close=now[4];previous=b[-2][4]
    vol20=mean(x[5] for x in b[-21:-1]);volume_ratio=now[5]/vol20 if vol20 else 0
    atr=_atr(b,n-1);atr_pct=100*atr/close if atr and close else None
    prior_atr=_atr(b,n-2)
    compression=mean(x[2]-x[3] for x in b[-6:-1])/max(mean(x[2]-x[3] for x in b[-21:-6]),1e-9)
    avg_cl20=mean(x[4] for x in b[-20:]);avg_cl10=mean(x[4] for x in b[-10:])
    prev_ma20=mean(x[4] for x in b[-25:-5]);ma_slope=(avg_cl20/prev_ma20-1)*100 if prev_ma20 else 0
    close_position=(close-now[3])/(now[2]-now[3]) if now[2]>now[3] else 1
    upper_wick=(now[2]-max(close,now[1]))/(now[2]-now[3]) if now[2]>now[3] else 0
    rv_flow=_volume_flow(b)
    adx=_trend_strength(b)
    regime=('盤整／缺乏方向' if adx is not None and adx<20 else
            '趨勢明顯' if adx is not None and adx>=25 else '過渡／方向待確認')
    if market_breadth is not None and market_breadth<40:regime+='；市場廣度偏弱'
    event=_events_from_levels(b,base)
    reasons=[];risk=[];cycle=None;quality='尚未突破';stage=base['unifiedStage'];profit_review='尚未形成可檢查的持有獲利事件'
    score=float(base.get('unifiedScore') or 0)
    no_anchor=False
    if event:
        lvl=event['level'];i=event['idx'];initial=event['initialIdx'];since=n-1-initial
        cls=[x[4] for x in b[initial:]]
        below=[j for j in range(initial+1,n) if b[j][4]<lvl*.997]
        recaptures=[j for j in range(initial+1,n) if b[j-1][4]<=lvl and b[j][4]>lvl]
        initial_bar=b[initial];rg=initial_bar[2]-initial_bar[3]
        init_location=((initial_bar[4]-initial_bar[3])/rg if rg>0 else 1.)
        init_wick=((initial_bar[2]-max(initial_bar[1],initial_bar[4]))/rg if rg>0 else 0.)
        init_av=mean(x[5] for x in b[max(0,initial-20):initial])
        init_ratio=initial_bar[5]/init_av if init_av>0 else 0
        quality=('量價較佳' if init_location>=.70 and init_wick<=.25 and init_ratio>=1.3 else
                 '突破K有疑慮' if init_location<.5 or init_wick>.42 or init_ratio<.75 else
                 '價格突破／量能待確認')
        prev_5_closes=[x[4] for x in b[max(0,initial-6):initial]]
        fresh=not event['initialAlreadyCrossed']
        if since==0:
            stage='近期首次突破／待驗證' if fresh else '歷史頸線再次突破／待驗證'
        elif close<lvl*.985 or (len(below)>=2 and b[-1][4]<lvl):
            stage='突破失敗／跌回頸線';risk.append('跌回原突破頸線，先警戒而非立即假設洗盤')
        elif recaptures and recaptures[-1]==n-1:
            stage='跌破後重新站回／待確認';risk.append('重新站回不是新第一根，觀察下一日能否守住')
        elif recaptures and n-1-recaptures[-1]<=3:
            if close>=lvl*1.005 and b[-2][4]>=lvl:
                stage='重新站回後確認觀察'
            else:stage='重新站回／震盪待確認'
        elif close<lvl or close<lvl*1.005 and below:
            stage='頸線邊緣震盪／易洗盤';risk.append('近期反覆跌破頸線，訊號未穩')
        elif since<=3:
            stage='突破後續強／確認中' if close>=lvl*1.012 and close>=previous else '突破後測試／觀察'
        elif close>=lvl and min(cls[-min(5,len(cls)):])>=lvl*.99 and compression<.90 and avg_cl10>=lvl:
            stage='突破後量縮整理／守頸線'
        elif close>=lvl and close>=avg_cl20:
            stage='突破後趨勢續行'
        elif close>=lvl:
            stage='突破後整理／弱於均線';risk.append('突破後低於MA20，注意續弱')
        # Active cycle original reference trumps a freshly recomputed overhead for follow-up only.
        gain_pct=(close/initial_bar[4]-1)*100 if initial_bar[4]>0 else 0
        if since>0 and gain_pct>=7 and volume_ratio>=1.35 and (upper_wick>.35 or close_position<.40):
            profit_review='突破後已上漲且放量沖高回落：持有者檢查分段保護獲利，不等於主力出貨'
            risk.append('上漲一段後放量沖高回落，留意高檔換手')
            if not stage.startswith(('突破失敗','重新站回','頸線邊緣')):stage='突破後高位換手／獲利保護'
        elif since>0 and gain_pct>=5:
            profit_review='已偏離最初突破收盤價超過5%：留意移動防守和價差風險，非強制隔日賣出'
        elif since>0:
            profit_review='仍追蹤原頸線；是否續抱需看收盤是否守住、量價和個人持有成本'
        cycle={'level':lvl,'initialDate':event['initialDate'], 'eventDate':event['date'],
               'daysSinceFirst':since,'firstHistoricalBreakout':fresh,
               'hadBelow':bool(below),'reclaimCount':len(recaptures),
               'initialVolumeRatio':round(init_ratio,2),
               'initialCloseLocation':round(init_location,2),
               'initialUpperWickRatio':round(init_wick,2),
               'daysClosedAbove':sum(x>=lvl for x in cls),
               'last5MinClose':min(cls[-5:]),
               'initialQuality':quality}
        if stage.startswith('突破失敗') or stage.startswith('頸線邊緣'):score=min(score,22)
        elif '待確認' in stage:score=min(score,65)
        elif '高位換手' in stage:score=min(score,45)
        elif '量縮整理' in stage:score=min(score,73)
        else:score=min(score+3,92)
    if event is None:
        # Prevent a RECROSS through a level already crossed in older history
        # from being celebrated as a first breakout solely by v2.4 priceBreakout.
        if base.get('priceBreakout'):
            r['priceBreakout']=False
            stage='突破歷史待核對／不認定第一根'
            score=min(score,48);no_anchor=True
        elif base.get('primaryNeckline') and close<base['primaryNeckline']:
            dist=(base['primaryNeckline']/close-1)*100
            if dist<=3:
                stage='接近頸線／觀察發動'
            elif dist<=10:
                stage='準備區／等待價量改善' if close>=avg_cl10 else '壓力下盤整／暫不追'
            else:stage='區間整理／等待'
    # Risk overrides optimistic stage: crossing a resistance cannot erase a
    # simultaneously confirmed break in support or strong downside distribution.
    broken=base.get('brokenSupport') or []
    recent_broken=[x for x in broken if x.get('confirmedBreak') and x.get('lower',0)<=close*1.05 and x.get('upper',0)>=close*.92]
    if recent_broken:
        risk.append('附近結構支撐連續收盤失守')
    giant_down=(close<now[1] and close<previous*.975 and volume_ratio>=1.45 and (close_position<=.30 or upper_wick>=.20))
    downflow=bool(rv_flow is not None and rv_flow<.65 and close<avg_cl20)
    if giant_down:risk.append('放量收低，可能有較重賣壓')
    if downflow:risk.append('近期跌日量大於漲日量，僅能推估供需')
    if ma_slope<-1 and close<avg_cl20:risk.append('MA20下彎且收盤在均線下方')
    # Level can be near or crossed while market is weak; risk first.
    risk_first=bool(recent_broken or giant_down or (downflow and ma_slope<-1))
    if risk_first:
        stage='結構破壞／風險優先' if recent_broken or giant_down else '趨勢轉弱／風險優先'
        score=min(score,12 if recent_broken or giant_down else 25)
    if stage=='近期首次突破／待驗證' and quality=='突破K有疑慮':
        stage='首次突破但品質偏弱／警戒'
        score=min(score,48)
    chase=bool(event and close>event['level']*1.065)
    if chase:risk.append('距原突破價已超過6.5%，避免將強勢當低風險買點')
    if atr_pct is not None and atr_pct>7.0:risk.append('14日ATR佔股價較高，洗盤／滑價風險增加')
    if market_breadth is not None and market_breadth<40:risk.append('同市場MA20站上比例偏低（不是加權指數）')
    # Entry and holding decisions need different logic; cautious intent tags,
    # NOT action advice. OHLCV cannot know tomorrow's open or trader's costs.
    if risk_first or (cycle and stage.startswith('突破失敗')):
        entry='避免新追價／先看是否恢復結構'
        hold='監控原頸線及最近有效支撐；依持有成本、風險額度處理失守'
    elif '高位換手' in stage or chase or (cycle and quality=='突破K有疑慮'):
        entry='不宜追價／等待回測或延續確認'
        hold='已持有者追蹤突破價、移動防守與縮量整理，不能據此保證續漲'
    elif cycle and stage in ('近期首次突破／待驗證','歷史頸線再次突破／待驗證'):
        entry='第一根預警／尚待次日驗證'
        hold='尚無隔日結果，不應預判必漲或隔日一定賣'
    elif cycle and '重新站回' in stage:
        entry='收復頸線後觀察／防止再次假突破'
        hold='觀察後續一至兩日收盤及量能；失守原價區需再降級'
    elif cycle and ('續強' in stage or '量縮整理' in stage or '趨勢續行' in stage):
        entry='結構較佳／仍需評估進場價差與報酬風險'
        hold='守住原頸線可續追蹤；弱化及量價背離時檢查保護策略'
    elif base.get('primaryNeckline') and close<base['primaryNeckline']:
        entry='頸線下待命／價量改善後再研究'
        hold='尚未確認突破，避免把預備訊號當買進指令'
    else:
        entry='觀察／資料不足以判定買點'
        hold='持續追蹤價格結構，無法推知主力成本或意圖'
    # One readable first/second-bar interpretation, with the original dated
    # neckline pinned. Independently computed per as-of date, never future-aware.
    sequence=breakout_sequence(b,event,base.get('primaryNeckline'),risk_first)
    if sequence['phase']=='first' and quality=='突破K有疑慮' and sequence['tone']!='danger':
        sequence['tone']='warn'
        sequence['assessment']='第一根突破但量價品質有疑慮；不得當成隔天必漲'
    if sequence['phase']=='second' and '第二根放量回落' in sequence['label']:
        risk.append('第二根相對首日放量但收低／上影較長：可能賣壓，不能宣稱主力出貨')
    reasons=base.get('unifiedReasons',[])[:]
    reasons.extend(risk[:3]);
    if cycle:reasons.append('事件錨點：'+cycle['initialDate']+'／'+str(cycle['level'])+'元；'+quality)
    r.update({'cycle':cycle,'breakoutSequence':sequence,'signalQuality':quality,'profitReview':profit_review,'unifiedStage':stage,
              'unifiedScore':round(max(0,min(100,score)),1),'unifiedReasons':reasons[:7],
              'entryReadiness':entry,'holdGuidance':hold,'riskFlags':risk[:7],
              'riskFirst':risk_first,'regime':regime,'marketBreadthAboveMA20Pct':market_breadth,
              'setupEvidence':{'adx14':adx,'atr14Pct':round(atr_pct,2) if atr_pct is not None else None,
                               'atrContraction5v15':round(compression,2),'upDownVolumeRatio12':rv_flow,
                               'ma20Slope5Pct':round(ma_slope,2),'closeLocation':round(close_position,2),
                               'upperWickRatio':round(upper_wick,2),'volumeRatio20':round(volume_ratio,2),
                               'aboveMA20':close>=avg_cl20,'closeVsMA20Pct':round(100*(close/avg_cl20-1),2)},
              'eventAudit':'從形成日可得的歷史壓力與當期收盤辨識事件，不以已知下一天認定第一根；仍屬研究判斷。',
              'priceBreakout':bool(cycle and cycle['daysSinceFirst']==0 and cycle['firstHistoricalBreakout']) and not risk_first,
              'breakoutStatus':stage,
             })
    return r
