// pretium / backtest.js
// What Spout Finance's "0% interest" costs, measured on 10 years of daily prices for all 11 launch assets.
// Run: open https://query1.finance.yahoo.com/v8/finance/chart/AAPL in a browser, open DevTools console,
// paste this whole file, press Enter. Same-origin fetches, no API key. Prints a JSON summary.
// Author: Sergiu Ochinca (@ochinimus), Sep 2026. MIT.

(async () => {
  const SYMS = ['AAPL','NVDA','GOOG','SMCI','IBIT','MSTR','BSOL','PFE','GS','XOM','GLD'];
  const SINGLE = new Set(['AAPL','NVDA','GOOG','SMCI','MSTR','PFE','GS','XOM']); // earnings-skip applies (docs: ETFs exempt)
  const T = 6 / 252;              // Friday open -> following Friday close, ~6 sessions
  const M_BASE = 1.15;            // implied vol = M * trailing 60d realised vol (sensitivity 1.0 / 1.3)
  const PREM_TARGET = 0.078;      // docs' own tranche example: $30k/wk gross on $10m pool = 15.6%/yr of pool = 7.8%/yr of collateral at 50% LTV, full utilisation
  const COST_CLAIM = 0.005;       // homepage: "Historically this cost averages around 0.5% annualized across the portfolio"

  const ncdf = x => { const t = 1/(1+0.2316419*Math.abs(x)); const d = 0.3989422804014327*Math.exp(-x*x/2);
    const p = d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429)))); return x > 0 ? 1-p : p; };
  const bsCall = (S,K,T,v) => { if (v<=0||T<=0) return Math.max(S-K,0); const s=v*Math.sqrt(T);
    const d1=(Math.log(S/K)+0.5*s*s)/s; return S*ncdf(d1)-K*ncdf(d1-s); };

  // 1. daily bars
  const DATA = {};
  for (const s of SYMS) {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + s + '?range=10y' + String.fromCharCode(38) + 'interval=1d';
    const r = (await fetch(url).then(x => x.json())).chart.result[0];
    const q = r.indicators.quote[0], rows = [];
    r.timestamp.forEach((ts, i) => {
      if (q.open[i]==null || q.close[i]==null || q.low[i]==null) return;
      const d = new Date((ts - 4*3600) * 1000), dow = d.getUTCDay();
      rows.push({ ymd: d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate(),
        wk: Math.floor(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())/86400000 - ((dow+6)%7)),
        o:q.open[i], h:q.high[i], l:q.low[i], c:q.close[i] });
    });
    DATA[s] = rows;
  }

  // 2. weekly cycles: enter at open of week w's last session, expire at close of week w+1's last session
  const CYC = {}, WEEKS = {};
  for (const s of SYMS) {
    const rows = DATA[s], weeks = []; let cur = null;
    rows.forEach((r,i) => { if (!cur || cur.wk !== r.wk) { cur = { wk:r.wk, idx:[] }; weeks.push(cur); } cur.idx.push(i); });
    WEEKS[s] = weeks;
    const cyc = [];
    for (let k = 0; k < weeks.length-1; k++) {
      const w0 = weeks[k], w1 = weeks[k+1]; if (w1.wk - w0.wk !== 7) continue;
      const ei = w0.idx[w0.idx.length-1], xi = w1.idx[w1.idx.length-1];
      let l = rows[ei].l; for (const j of w1.idx) l = Math.min(l, rows[j].l);
      let rv = NaN;
      if (ei >= 61) { const a=[]; for (let j=ei-60;j<ei;j++) a.push(Math.log(rows[j].c/rows[j-1].c));
        const m=a.reduce((x,y)=>x+y,0)/a.length; rv=Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/(a.length-1)*252); }
      cyc.push({ d: rows[ei].ymd, o: rows[ei].o, c: rows[xi].c, l, rv });
    }
    cyc.pop(); // last cycle is still open
    CYC[s] = cyc;
  }

  // 3. earnings-skip proxy: largest overnight gap in each calendar quarter (generous: also removes non-earnings shocks)
  const SKIP = {};
  for (const s of SYMS) {
    const rows = DATA[s], C = CYC[s], E = [];
    if (SINGLE.has(s)) { const byQ = {};
      for (let i=1;i<rows.length;i++) { const y=Math.floor(rows[i].ymd/10000), mo=Math.floor(rows[i].ymd/100)%100;
        const q=y*10+Math.floor((mo-1)/3), g=Math.abs(rows[i].o/rows[i-1].c-1); if (!byQ[q]||g>byQ[q].g) byQ[q]={g,d:rows[i].ymd}; }
      Object.values(byQ).forEach(z => E.push(z.d)); }
    SKIP[s] = C.map((x,j) => { const hi = j+1<C.length ? C[j+1].d : 99999999; return E.some(e => e > x.d && e <= hi); });
  }

  // 4. premium / cost grid
  const KS = []; for (let k=0.5;k<=3.5001;k+=0.05) KS.push(+k.toFixed(2));
  const grid = (s, m) => KS.map(k => { let n=0,c=0,p=0,cs=0,ps=0,a=0,as=0;
    CYC[s].forEach((x,j) => { if (isNaN(x.rv)) return; n++; const K=x.o*Math.exp(k*x.rv*Math.sqrt(T));
      const pay=Math.max(x.c-K,0)/x.o, v=bsCall(1,K/x.o,T,m*x.rv); c+=pay; p+=v; if (x.c>K) a++;
      if (!SKIP[s][j]) { cs+=pay; ps+=v; if (x.c>K) as++; } });
    return { k, c:c/n*52, p:p/n*52, cS:cs/n*52, pS:ps/n*52, a:a/n, aS:as/n }; });
  const cross = (G, key, target, out) => { for (let i=0;i<G.length-1;i++) { const a=G[i][key], b=G[i+1][key];
      if ((a-target)*(b-target) <= 0) { const t=(a-target)/(a-b); const r={ k: G[i].k+t*(G[i+1].k-G[i].k) };
        out.forEach(o => r[o] = G[i][o]+t*(G[i+1][o]-G[i][o])); return r; } } return null; };

  const R = { cycles:{}, required:{}, halfPct:{}, sensitivity:{}, liq52:{}, liq13:{}, autoroll:{}, dd:{}, worstPayoff:{}, gaps:{} };
  for (const s of SYMS) R.cycles[s] = CYC[s].filter(x=>!isNaN(x.rv)).length;

  for (const m of [1.0, 1.15, 1.3]) { let sum=0, sumN=0, n=0;
    for (const s of SYMS) { if (s==='BSOL') continue; const G=grid(s,m);
      const r=cross(G,'pS',PREM_TARGET,['cS','aS']); const rn=cross(G,'p',PREM_TARGET,['c']);
      if (m===M_BASE) { R.required[s] = { k:+r.k.toFixed(2), costPct:+(r.cS*100).toFixed(2), assignPct:+(r.aS*100).toFixed(1), costNoSkipPct:+(rn.c*100).toFixed(2) };
        const h=cross(G,'cS',COST_CLAIM,['pS']); R.halfPct[s] = h ? { k:+h.k.toFixed(2), premiumPct:+(h.pS*100).toFixed(2) } : 'not reachable up to 3.5 sigma'; }
      sum+=r.cS; sumN+=rn.c; n++; }
    R.sensitivity['m'+m] = { avgCostPctOfCollateral:+(sum/n*100).toFixed(2), perDollarBorrowedAt50LTV:+(sum/n*200).toFixed(1), noSkip:+(sumN/n*100).toFixed(2) }; }

  // 5. liquidation at max LTV (liquidation LTV = 50% + buffer; docs: buffer 4%..12.5%, NVDA 8.8%)
  const TRIG = [0.5/0.54, 0.5/0.588, 0.5/0.625];
  for (const s of SYMS) { const C=CYC[s].filter(x=>!isNaN(x.rv)), n=C.length;
    const liq = H => n<=H ? null : TRIG.map(tr => { let hit=0,tot=0; for (let w=0;w+H<=n;w++) { let mn=Infinity; for (let j=w;j<w+H;j++) mn=Math.min(mn,C[j].l); tot++; if (mn/C[w].o<=tr) hit++; } return +(hit/tot*100).toFixed(1); });
    R.liq52[s]=liq(52); R.liq13[s]=liq(13);
    const dd = H => { const a=[]; for (let w=0;w+H<=n;w++) { let mn=Infinity; for (let j=w;j<w+H;j++) mn=Math.min(mn,C[j].l); a.push(1-mn/C[w].o); } a.sort((p,q)=>p-q); return a; };
    const d52=dd(52), q=(a,p)=>a.length?+(a[Math.min(a.length-1,Math.floor(a.length*p))]*100).toFixed(1):null;
    R.dd[s] = { p50:q(d52,0.5), p75:q(d52,0.75), p90:q(d52,0.9) }; }

  // 6. Auto-Roll as written in docs/options-assignment: sold at strike, proceeds repay debt, residual rebought
  for (const s of SYMS) { if (!R.required[s]) continue; const kr=R.required[s].k;
    const full=CYC[s], idx=full.map((x,j)=>j).filter(j=>!isNaN(full[j].rv)), n=idx.length;
    const res={13:[0,0],26:[0,0],52:[0,0]}, shares=[]; let worst=0, wd=0;
    idx.forEach(j => { const x=full[j], K=x.o*Math.exp(kr*x.rv*Math.sqrt(T)), p=Math.max(x.c-K,0)/x.o; if (p>worst) { worst=p; wd=x.d; } });
    for (let w=0; w+52<=n; w++) { let sh=100, debt=0.5*100*full[idx[w]].o, closed=-1;
      for (let t=w; t<w+52; t++) { const j=idx[t], x=full[j]; if (SKIP[s][j]) continue; const K=x.o*Math.exp(kr*x.rv*Math.sqrt(T));
        if (x.c>K) { const resid=sh*K-debt; if (debt>0 && closed<0) closed=t-w; debt=0; sh=resid/x.c; } }
      for (const H of [13,26,52]) { res[H][1]++; if (closed>=0 && closed<H) res[H][0]++; } shares.push(sh); }
    shares.sort((a,b)=>a-b);
    R.autoroll[s] = { repaidWithin13w:+(res[13][0]/res[13][1]*100).toFixed(1), within26w:+(res[26][0]/res[26][1]*100).toFixed(1),
      within52w:+(res[52][0]/res[52][1]*100).toFixed(1), medianSharesLeft:+shares[Math.floor(shares.length/2)].toFixed(1) };
    R.worstPayoff[s] = { pctOfCollateral:+(worst*100).toFixed(1), cycleEntry:wd }; }

  // 7. weekend gaps: last session close -> next week's first open
  for (const s of SYMS) { const rows=DATA[s], W=WEEKS[s], g=[];
    for (let k=0;k<W.length-1;k++) { const a=rows[W[k].idx[W[k].idx.length-1]], b=rows[W[k+1].idx[0]]; g.push({ d:b.ymd, x:b.o/a.c-1 }); }
    g.sort((p,q)=>p.x-q.x); R.gaps[s] = { worse7_4:g.filter(z=>z.x<=-0.074).length, worst:g[0].d+' '+(g[0].x*100).toFixed(1)+'%' }; }

  // 8. earnings-proxy robustness: skip the largest UPWARD overnight gap per quarter, or both it and the largest absolute gap
  { const variant = {}; for (const mode of ['up','both']) { let sum=0, n=0;
      for (const s of SYMS) { if (s==='BSOL') continue; const rows=DATA[s], C=CYC[s]; let Eup=[];
        if (SINGLE.has(s)) { const qu={}; for (let i=1;i<rows.length;i++) { const y=Math.floor(rows[i].ymd/10000), mo=Math.floor(rows[i].ymd/100)%100, qq=y*10+Math.floor((mo-1)/3), g=rows[i].o/rows[i-1].c-1; if (!qu[qq]||g>qu[qq].g) qu[qq]={g,d:rows[i].ymd}; } Eup=Object.values(qu).map(z=>z.d); }
        const sk=C.map((x,j)=>{ const hi=j+1<C.length?C[j+1].d:99999999; const u=Eup.some(e=>e>x.d&&e<=hi); return mode==='up'?u:(u||SKIP[s][j]); });
        let prev=null, found=null;
        for (const k of KS) { let nn=0,p=0,c=0; C.forEach((x,j)=>{ if (isNaN(x.rv)) return; nn++; if (sk[j]) return; const K=x.o*Math.exp(k*x.rv*Math.sqrt(T)); p+=bsCall(1,K/x.o,T,M_BASE*x.rv); c+=Math.max(x.c-K,0)/x.o; });
          const cur={p:p/nn*52,c:c/nn*52}; if (prev && (prev.p-PREM_TARGET)*(cur.p-PREM_TARGET)<=0) { const t=(prev.p-PREM_TARGET)/(prev.p-cur.p); found=prev.c+t*(cur.c-prev.c); break; } prev=cur; }
        sum+=found; n++; }
      variant[mode] = +(sum/n*100).toFixed(2); }
    R.earningsProxyVariants = { largestAbsGap: R.sensitivity['m1.15'].avgCostPctOfCollateral, largestUpGap: variant.up, both: variant.both }; }

  R.cyclesTotal = Object.values(R.cycles).reduce((a,b)=>a+b,0);
  console.log(JSON.stringify(R, null, 1));
  window.PRETIUM = R;
})();
