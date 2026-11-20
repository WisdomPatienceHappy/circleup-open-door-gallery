/* Experimental planner: observed voices -> desired camera. No animation, DOM or room authority. */
(function (root) {
  'use strict';
  const PI = Math.PI;
  const rad = degrees => degrees * PI / 180;
  const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
  const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
  const finite = x => Number.isFinite(x);
  const fitRadius = portrait => portrait.diameter / 2 + Math.max(0, portrait.paintPadding ?? 0);
  const unique = values => values.filter((value, index) => values.findIndex(other => Math.abs(other - value) < 1e-6) === index);
  // Horizontal stripe quadrature of target disc MINUS UNION of nearer discs.
  // Analytic min/max chords give genuine geometric lower/upper bounds at any
  // row count; midpoint chords provide a faster-converging point estimate.
  function measureVisibility({target, occluders = [], bounds, rows = 32}) {
    const radius = target.diameter / 2, fullArea = PI * radius * radius;
    const top = Math.max(bounds.top, target.y - radius), bottom = Math.min(bounds.bottom, target.y + radius);
    if (bottom <= top) return {area: 0, lower: 0, upper: 0, error: 0, fullArea};
    const count = Math.max(4, Math.min(256, Math.round(rows))), dy = (bottom - top) / count;
    // Non-overlapping projected supports cannot alter this target's area.
    occluders = occluders.filter(p => p.shape === 'rect'
      ? Math.abs(p.x-target.x) < p.width/2+radius && Math.abs(p.y-target.y) < p.height/2+radius
      : Math.hypot(p.x-target.x,p.y-target.y) < p.diameter/2+radius);
    const chord = (disc, y) => {
      if(disc.shape === 'rect') return Math.abs(y-disc.y) <= disc.height/2 ? disc.width/2 : 0;
      const r = disc.diameter / 2, distance = Math.abs(y - disc.y);
      return distance >= r ? 0 : Math.sqrt(Math.max(0, r * r - distance * distance));
    };
    const interval = (disc, half) => [Math.max(bounds.left, disc.x - half), Math.min(bounds.right, disc.x + half)];
    const remaining = (targetHalf, halves) => {
      const [left, right] = interval(target, targetHalf);
      if (right <= left) return 0;
      const spans = occluders.map((disc, i) => {
        if (halves[i] <= 0) return null;
        const [a,b] = interval(disc, halves[i]);
        return [Math.max(left,a),Math.min(right,b)];
      }).filter(span => span && span[1] > span[0]).sort((a,b)=>a[0]-b[0]);
      let covered = 0, end = left;
      for (const [a,b] of spans) {if (b <= end) continue;covered += b - Math.max(a,end);end=b;}
      return Math.max(0,right-left-covered);
    };
    let area = 0, lower = 0, upper = 0;
    for (let i=0;i<count;i++) {
      const a=top+i*dy,b=top+(i+1)*dy,middle=(a+b)/2;
      const minChord = disc => disc.shape === 'rect'
        ? a >= disc.y-disc.height/2 && b <= disc.y+disc.height/2 ? disc.width/2 : 0
        : Math.min(chord(disc,a),chord(disc,b));
      const maxChord = disc => disc.shape === 'rect'
        ? b > disc.y-disc.height/2 && a < disc.y+disc.height/2 ? disc.width/2 : 0
        : chord(disc,clamp(disc.y,a,b));
      lower += remaining(minChord(target),occluders.map(maxChord))*dy;
      upper += remaining(maxChord(target),occluders.map(minChord))*dy;
      area += remaining(chord(target,middle),occluders.map(disc=>chord(disc,middle)))*dy;
    }
    lower=clamp(lower,0,fullArea);upper=clamp(upper,lower,fullArea);area=clamp(area,lower,upper);
    return {area,lower,upper,error:Math.max(area-lower,upper-area),fullArea};
  }
  function create({project, getBounds, ids, speakerYaw, minZoom = .72, maxZoom = 3, activeMinVisibleFraction = .6, activeMinVisibleAreaPx = null, getBlockers = () => []}) {
    if (typeof project !== 'function' || typeof getBounds !== 'function' || typeof speakerYaw !== 'function' || !Array.isArray(ids) || !ids.length || !finite(minZoom) || !finite(maxZoom) || minZoom <= 0 || maxZoom < minZoom) throw TypeError('Projection, bounds, roster and positive zoom range required');
    if (!finite(activeMinVisibleFraction) || activeMinVisibleFraction < 0 || activeMinVisibleFraction > 1 || activeMinVisibleAreaPx !== null && (!finite(activeMinVisibleAreaPx) || activeMinVisibleAreaPx < 0) || typeof getBlockers !== 'function') throw TypeError('Valid visible-area thresholds and blocker callback required');
    const roster = [...new Set(ids)];
    let events = [], recent = [], active = null, lastTime = null, lastPlan = null;
    function time(now) {
      if (!finite(now) || lastTime !== null && now < lastTime) throw RangeError('Observed time must be finite and monotonic');
      lastTime = now;
    }
    function observe(id, nowMs) {
      if (id !== null && !roster.includes(id)) throw RangeError('Speaker outside roster');
      time(nowMs);
      if (active === id && events.length) return;
      active = id;
      events.push({id, at: nowMs});
      if (id !== null) recent = [id, ...recent.filter(other => other !== id)].slice(0, 3);
      // The retained tail is an observation history, never a future schedule.
      // A capped tail plus its leading boundary bounds memory on long sessions.
      if (events.length > 4096) events = events.slice(-4096);
    }
    function interest(now, memorySeconds, mode) {
      const tau = clamp(memorySeconds, .25, 120) * 1000;
      const totals = new Map(recent.map(id => [id, 0]));
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i], end = i + 1 < events.length ? events[i + 1].at : now;
        if (end < now - tau * 24) break;
        if (!totals.has(event.id)) continue;
        // Integral exp(-(now-t)/tau) dt, in seconds, for this observed span.
        totals.set(event.id, totals.get(event.id) + tau / 1000 * (Math.exp(-(now - end) / tau) - Math.exp(-(now - event.at) / tau)));
      }
      if (!recent.length) return [];
      const rows = recent.map(id => ({id, seconds: totals.get(id)}));
      if (mode === 'current') return active === null ? [] : rows.filter(row => row.id === active).map(row => ({...row, weight: 1}));
      if (mode === 'equal') return rows.map(row => ({...row, weight: 1 / rows.length}));
      // A small explicit onset prior lets a new voice matter before its first
      // full second. Actual speaking time takes over; this is not centering.
      const raw = rows.map(row => row.seconds + (row.id === active ? tau / 1000 * .06 : 0));
      const sum = raw.reduce((a, b) => a + b, 0);
      return rows.map((row, i) => ({...row, weight: sum > 1e-12 ? raw[i] / sum : 1 / rows.length}));
    }
    function geometry(frame, activeId = active, verticalAll = true) {
      const b = getBounds();
      if (![b.left,b.right,b.top,b.bottom].every(finite)||b.right<=b.left||b.bottom<=b.top) throw RangeError('Nonempty finite pixel bounds required');
      const portraits = roster.map((id,order)=>({id,order,...project(id,frame)}));
      let overflowPx=0,activeFits=activeId===null,verticalFits=true;
      for (const p of portraits) {
        if (![p.x,p.y,p.diameter,p.depth].every(finite)||p.diameter<=0||p.paintPadding!=null&&!finite(p.paintPadding)) throw RangeError('Projection must return finite positive portraits and finite optional paint padding');
        const r=fitRadius(p),vertical=Math.max(0,b.top-(p.y-r),p.y+r-b.bottom);
        if(verticalAll){overflowPx+=vertical;if(vertical>.25)verticalFits=false;}
        if(p.id===activeId){const horizontal=Math.max(0,b.left-(p.x-r),p.x+r-b.right);overflowPx+=horizontal+(verticalAll?0:vertical);activeFits=horizontal<=.25&&vertical<=.25;}
      }
      const blockers = getBlockers(frame).map((p,i)=>({order:roster.length+i,...p}));
      for(const p of blockers)if(![p.x,p.y].every(finite)||(p.shape==='rect'?![p.width,p.height].every(finite)||p.width<=0||p.height<=0:!finite(p.diameter)||p.diameter<=0)||!p.front&&!finite(p.depth))throw RangeError('Blockers need finite projected disc/rect supports and depth or front=true');
      return {bounds:b,portraits,blockers,fits:activeFits&&verticalFits,activeFits,verticalFits,overflowPx};
    }
    function visibility(evaluation,id,rows=32){
      const p=evaluation.portraits.find(p=>p.id===id);
      if(!p)return {area:0,lower:0,upper:0,error:0,fullArea:0};
      const z=Math.round(p.depth*1000);
      const nearer=other=>other.front||Math.round(other.depth*1000)>z||Math.round(other.depth*1000)===z&&other.order>p.order;
      return measureVisibility({target:p,occluders:[...evaluation.portraits.filter(other=>other.id!==id&&nearer(other)),...evaluation.blockers.filter(nearer)],bounds:evaluation.bounds,rows});
    }
    function activeMetrics(evaluation,id=active,rows=32){
      const diameter=clamp(Math.min(evaluation.bounds.right-evaluation.bounds.left,evaluation.bounds.bottom-evaluation.bounds.top)*.14,28,64);
      const minimum=activeMinVisibleAreaPx??PI*(diameter/2)**2;
      if(id===null)return {activeVisibleAreaPx:0,activeVisibleAreaLowerPx:0,activeVisibleAreaUpperPx:0,activeVisibleAreaErrorPx:0,activeVisibleFraction:1,activeVisibleFractionLower:1,activeVisibilityFits:true,activeVisibilityDebt:0,activeMinAreaPx:minimum,activeMinFraction:activeMinVisibleFraction};
      const result=visibility(evaluation,id,rows),fraction=result.fullArea?result.area/result.fullArea:0,lowerFraction=result.fullArea?result.lower/result.fullArea:0;
      const debt=Math.max(activeMinVisibleFraction?1-lowerFraction/activeMinVisibleFraction:0,minimum?1-result.lower/minimum:0,0);
      return {activeVisibleAreaPx:result.area,activeVisibleAreaLowerPx:result.lower,activeVisibleAreaUpperPx:result.upper,activeVisibleAreaErrorPx:result.error,activeVisibleFraction:fraction,activeVisibleFractionLower:lowerFraction,activeVisibilityFits:debt<=1e-10,activeVisibilityDebt:debt,activeMinAreaPx:minimum,activeMinFraction:activeMinVisibleFraction};
    }
    function assess(frame,{activeId=active,verticalAll=true,rows=32}={}){
      const result=geometry(frame,activeId,verticalAll),metrics=activeMetrics(result,activeId,rows);
      return {...result,...metrics,frameFits:result.fits,fits:result.fits&&metrics.activeVisibilityFits,
        visibleIds:result.portraits.filter(p=>{const r=fitRadius(p),b=result.bounds;return p.x-r>=b.left-.25&&p.x+r<=b.right+.25&&p.y-r>=b.top-.25&&p.y+r<=b.bottom+.25;}).map(p=>p.id),
        overflowPenalty:result.overflowPx+metrics.activeVisibilityDebt*Math.min(result.bounds.right-result.bounds.left,result.bounds.bottom-result.bounds.top)};
    }
    function plan({now, current, baselineZoom = 1, restPitch = rad(65), memorySeconds = 8, paceSeconds = 8, mode = 'recency', fixedPitch = null, motionRates = {}}) {
      time(now);
      if (![current?.yaw, current?.pitch, current?.zoom, baselineZoom, restPitch, memorySeconds, paceSeconds].every(finite) || current.zoom <= 0 || baselineZoom <= 0 || memorySeconds <= 0 || paceSeconds <= 0 || fixedPitch !== null && !finite(fixedPitch)) throw RangeError('Finite camera and positive time/zoom parameters required');
      if (!['recency', 'equal', 'current'].includes(mode)) throw RangeError('Unknown interest comparison');
      const weights = interest(now, memorySeconds, mode);
      const baseline = clamp(baselineZoom, minZoom, maxZoom);
      const turnStart = active === null ? now : events[events.length - 1]?.at ?? now;
      const sustainedSeconds = Math.max(0, now - turnStart) / 1000;
      const sustainProgress = clamp(sustainedSeconds / paceSeconds, 0, 1);
      // Smoothstep ramps the preference with observed uninterrupted speech.
      // A one-voice onset already has weight 1; duration must remain a
      // separate signal rather than accidentally granting full close focus.
      const closenessProgress = sustainProgress * sustainProgress * (3 - 2 * sustainProgress);
      const preferredZoom = clamp(baseline * (1 + .22 * closenessProgress), minZoom, maxZoom);
      const currentResult=geometry(current),currentVisibility=activeMetrics(currentResult,active,32),currentCoarseVisibility=activeMetrics(currentResult,active,8);
      const recovering=!currentVisibility.activeVisibilityFits;
      // No arithmetic angle averaging. The circular mean is omitted when
      // opposite voices cancel and have no meaningful shared direction.
      const sx = weights.reduce((sum, w) => sum + Math.sin(speakerYaw(w.id)) * w.weight, 0);
      const cx = weights.reduce((sum, w) => sum + Math.cos(speakerYaw(w.id)) * w.weight, 0);
      const meanYaw = Math.hypot(sx, cx) > .05 ? Math.atan2(sx, cx) : current.yaw;
      const yawChoices=recovering
        ? [current.yaw,current.yaw-rad(12),current.yaw+rad(12),current.yaw-rad(60),current.yaw+rad(60),current.yaw-rad(90),current.yaw+rad(90),meanYaw,
          ...(active===null?[]:[speakerYaw(active),speakerYaw(active)+PI])]
        : [current.yaw,current.yaw-rad(12),current.yaw+rad(12),current.yaw-rad(30),current.yaw+rad(30),meanYaw,
          ...recent.map(id=>speakerYaw(id)),...(active===null?[]:[speakerYaw(active)+PI])];
      const yawValues=unique(yawChoices.map(wrap));
      const pitchValues = unique((fixedPitch === null ? [current.pitch, restPitch, current.pitch - rad(15), current.pitch + rad(15), rad(15), rad(30), rad(45), rad(90), rad(135), rad(173)] : [fixedPitch])
        .map(pitch => current.pitch + wrap(pitch - current.pitch)));
      const rates={yaw:.55,pitch:.38,zoomIn:.08,zoomOut:.9,...motionRates};
      if(![rates.yaw,rates.pitch,rates.zoomIn,rates.zoomOut].every(value=>finite(value)&&value>0))throw RangeError('Motion rates must be positive radians/logzoom per second');
      const travelSeconds=frame=>Math.max(Math.abs(wrap(frame.yaw-current.yaw))/rates.yaw,Math.abs(wrap(frame.pitch-current.pitch))/rates.pitch,Math.abs(Math.log(frame.zoom/current.zoom))/(frame.zoom>=current.zoom?rates.zoomIn:rates.zoomOut));
      const marginReady=v=>v.activeVisibilityFits&&v.activeVisibleFractionLower>=Math.min(.98,activeMinVisibleFraction+.05)&&v.activeVisibleAreaLowerPx>=v.activeMinAreaPx*1.05;
      const along=(frame,t)=>({yaw:current.yaw+wrap(frame.yaw-current.yaw)*t,pitch:current.pitch+wrap(frame.pitch-current.pitch)*t,zoom:current.zoom*Math.exp(Math.log(frame.zoom/current.zoom)*t)});
      const activePortrait=currentResult.portraits.find(p=>p.id===active);
      const pixelScaleNeeded=activePortrait?Math.sqrt(currentVisibility.activeMinAreaPx/(PI*(activePortrait.diameter/2)**2)):1;
      const recoveryZoom=clamp(current.zoom*Math.max(1,pixelScaleNeeded)*1.08,minZoom,maxZoom);
      // Four ordinary zooms plus a minimum fallback keep <=500 coarse poses.
      const ordinary=unique([current.zoom,pixelScaleNeeded>1?recoveryZoom:baseline*.78,baseline,preferredZoom].map(z=>clamp(z,minZoom,maxZoom)));
      const width=currentResult.bounds.right-currentResult.bounds.left,height=currentResult.bounds.bottom-currentResult.bounds.top;
      const targetDiameter=clamp(Math.min(width,height)*.32,72,180),targetArea=PI*(targetDiameter/2)**2;
      let candidates=0,accurateEvaluations=0;
      function base(frame,rows){
        const evaluation=geometry(frame),v=activeMetrics(evaluation,active,rows);
        const turn=Math.abs(wrap(frame.yaw-current.yaw))/PI+Math.abs(wrap(frame.pitch-current.pitch))/PI;
        const zoomMove=Math.abs(Math.log(frame.zoom/current.zoom)),closenessCredit=Math.min(1,(preferredZoom/frame.zoom)**2);
        const cost=.035*(turn+.5*zoomMove)+.1*Math.log(frame.zoom/preferredZoom)**2;
        const reference=rows===8?currentCoarseVisibility:currentVisibility;
        const zoomWorsens=frame.zoom>current.zoom+1e-8&&!reference.activeVisibilityFits&&
          (v.activeVisibleAreaLowerPx<reference.activeVisibleAreaLowerPx-1e-6||v.activeVisibleFractionLower<reference.activeVisibleFractionLower-1e-8);
        return {frame,evaluation,v,turn,cost,closenessCredit,zoomWorsens,recoveryMarginFits:marginReady(v),recoverySecondsEstimate:travelSeconds(frame)};
      }
      const coarse=[];
      for(const yaw of yawValues)for(const pitch of pitchValues)for(const zoom of unique([...ordinary,minZoom])){
        candidates++;const row=base({yaw,pitch,zoom},8);
        // Speaker visibility outranks its normalized recency weight.
        row.coarseScore=row.v.activeVisibleAreaPx/targetArea-row.cost;
        coarse.push(row);
      }
      function rank(a,b){
        if(a.zoomWorsens!==b.zoomWorsens)return a.zoomWorsens?1:-1;
        if(a.v.activeVisibilityFits!==b.v.activeVisibilityFits)return a.v.activeVisibilityFits?-1:1;
        if(!a.v.activeVisibilityFits&&!b.v.activeVisibilityFits){const debt=a.v.activeVisibilityDebt-b.v.activeVisibilityDebt;if(Math.abs(debt)>1e-7)return debt;}
        if(a.evaluation.fits!==b.evaluation.fits)return a.evaluation.fits?-1:1;
        if(a.routeSampleSafe!==undefined&&b.routeSampleSafe!==undefined&&a.routeSampleSafe!==b.routeSampleSafe)return a.routeSampleSafe?-1:1;
        if(recovering&&a.v.activeVisibilityFits&&b.v.activeVisibilityFits){
          if(a.recoveryMarginFits!==b.recoveryMarginFits)return a.recoveryMarginFits?-1:1;
          const time=a.recoverySecondsEstimate-b.recoverySecondsEstimate;if(Math.abs(time)>1e-4)return time;
        }
        return (b.value??b.coarseScore)-(a.value??a.coarseScore);
      }
      coarse.sort(rank);
      // Preserve angular diversity so a coarse lower bound cannot discard all
      // routes for an orientation merely because another is marginally larger.
      const shortlist=coarse.slice(0,10),angles=new Set(shortlist.map(r=>r.frame.yaw.toFixed(5)+':'+r.frame.pitch.toFixed(5)));
      for(const row of coarse){if(shortlist.length>=16)break;const key=row.frame.yaw.toFixed(5)+':'+row.frame.pitch.toFixed(5);if(!angles.has(key)){shortlist.push(row);angles.add(key);}}
      // Include the exact current pose as an honest no-regression alternative.
      shortlist.push({frame:{...current}});
      function accurateRow(frame){
        accurateEvaluations++;const row=base(frame,32);let usefulArea=0,weightedAreaPx=0,weightedDiameter=0;
        for(const w of weights){const visible=visibility(row.evaluation,w.id,32),p=row.evaluation.portraits.find(p=>p.id===w.id);
          weightedAreaPx+=w.weight*visible.area;
          usefulArea+=w.weight*Math.min(1.8,visible.area/targetArea*row.closenessCredit);
          weightedDiameter+=w.weight*p.diameter*Math.sqrt(visible.fullArea?visible.area/visible.fullArea:0);
        }
        row.value=usefulArea-row.cost;row.usefulArea=usefulArea;row.weightedAreaPx=weightedAreaPx;row.weightedDiameter=weightedDiameter;
        return row;
      }
      const accurate=shortlist.map(entry=>accurateRow(entry.frame));
      accurate.sort(rank);
      // Check active visibility on a bounded best-target subset. Final rendered
      // steps must retain their own union-aware safety assessment.
      const currentRow=accurate.find(row=>Math.abs(wrap(row.frame.yaw-current.yaw))<1e-9&&Math.abs(wrap(row.frame.pitch-current.pitch))<1e-9&&Math.abs(row.frame.zoom-current.zoom)<1e-9);
      const checked=accurate.slice(0,6);if(currentRow&&!checked.includes(currentRow))checked.push(currentRow);
      for(const row of checked){
        if(recovering&&row.recoveryMarginFits&&row.evaluation.fits&&!row.zoomWorsens){
          const destination={...row.frame};let low=0,high=1;
          // Find the first sampled crossing, then conservatively refine its
          // bracket. Return that useful recovery point rather than a distant
          // eventual high-area pose that happens to pass through it.
          for(let step=1;step<=4;step++){
            const t=step/4,e=geometry(along(destination,t)),v=activeMetrics(e,active,32);
            if(e.fits&&marginReady(v)){high=t;low=(step-1)/4;break;}
          }
          for(let i=0;i<3;i++){const t=(low+high)/2,e=geometry(along(destination,t)),v=activeMetrics(e,active,32);if(e.fits&&marginReady(v))high=t;else low=t;}
          const replacement=accurateRow(along(destination,high));
          // Recheck all endpoint guards after trimming a nonlinear route.
          if(replacement.recoveryMarginFits&&replacement.evaluation.fits&&!replacement.zoomWorsens)Object.assign(row,replacement);
        }
        let routeSampleSafe=true,routeOverflowPx=0,previousArea=currentVisibility.activeVisibleAreaLowerPx,previousFraction=currentVisibility.activeVisibleFractionLower,previousDebt=currentResult.overflowPx,previousZoom=current.zoom,onceUsable=currentVisibility.activeVisibilityFits;
        for(let step=1;step<=4;step++){
          const t=step/4,frame=along(row.frame,t);
          const e=geometry(frame),v=activeMetrics(e,active,32);routeOverflowPx=Math.max(routeOverflowPx,e.overflowPx);
          if(onceUsable&&!v.activeVisibilityFits)routeSampleSafe=false;
          // A deficient pure turn may cross a flat or temporarily worse
          // overlap region before disocclusion. Do not freeze that route.
          // Zoom-in retains its stricter no-visibility-regression contract.
          if(!onceUsable&&frame.zoom>previousZoom+1e-8&&(v.activeVisibleAreaLowerPx<previousArea-1||v.activeVisibleFractionLower<previousFraction-.002))routeSampleSafe=false;
          if(currentResult.fits?!e.fits:e.overflowPx>previousDebt+.25)routeSampleSafe=false;
          previousArea=v.activeVisibleAreaLowerPx;previousFraction=v.activeVisibleFractionLower;previousDebt=e.overflowPx;previousZoom=frame.zoom;onceUsable ||= v.activeVisibilityFits;
        }
        row.routeSampleSafe=routeSampleSafe;row.routeOverflowPx=routeOverflowPx;
      }
      checked.sort(rank);const best=checked[0];
      const result={frame:{...best.frame},weights,metrics:{activeId:active,activeFits:best.evaluation.activeFits,verticalFits:best.evaluation.verticalFits,
        ...best.v,overflowPx:best.evaluation.overflowPx,weightedFacePx:best.weightedDiameter,weightedVisibleAreaPx:best.weightedAreaPx,usefulArea:best.usefulArea,score:best.value,
        candidates,accurateEvaluations,recovering,recoverySecondsEstimate:best.recoverySecondsEstimate,recoveryMarginFits:best.recoveryMarginFits,visibilityRows:32,routeRows:32,routeSampleSafe:best.routeSampleSafe,routeOverflowPx:best.routeOverflowPx,
        baselineZoom:baseline,preferredZoom,sustainedSeconds,sustainProgress,targetDiameterPx:targetDiameter,mode,currentFits:currentResult.fits&&currentVisibility.activeVisibilityFits,
        zoomInVisibilityGuard:best.zoomWorsens,routeYawRadians:wrap(best.frame.yaw-current.yaw),routePitchRadians:wrap(best.frame.pitch-current.pitch)}};
      lastPlan = result;
      return result;
    }
    return Object.freeze({observe, plan, assess, snapshot: () => ({activeId: active, recent: [...recent], observedEvents: events.length, lastTime, lastPlan})});
  }
  const api = Object.freeze({create, wrap, rad, measureVisibility});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecentConversationCamera = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
