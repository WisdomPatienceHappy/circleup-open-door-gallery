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
  function create({project,getBounds,ids,speakerYaw,minZoom=.72,maxZoom=2.15,getHolder=()=>null,getBlockers=()=>[],getContentRects=()=>[],activeMinVisibleFraction=.6,holderMinVisibleFraction=.4,intentMinVisibleFraction=.6,activeMinVisibleAreaPx=null,holderMinVisibleAreaPx=null,intentMinVisibleAreaPx=null}) {
    if(typeof project!=='function'||typeof getBounds!=='function'||typeof speakerYaw!=='function'||typeof getHolder!=='function'||typeof getBlockers!=='function'||typeof getContentRects!=='function'||!Array.isArray(ids)||!ids.length||!finite(minZoom)||!finite(maxZoom)||minZoom<=0||maxZoom<minZoom)throw TypeError('Projection, bounds, roster, holder and positive zoom range required');
    for(const value of[activeMinVisibleFraction,holderMinVisibleFraction,intentMinVisibleFraction])if(!finite(value)||value<0||value>1)throw RangeError('Visibility fractions must be in0..1');
    for(const value of[activeMinVisibleAreaPx,holderMinVisibleAreaPx,intentMinVisibleAreaPx])if(value!==null&&(!finite(value)||value<0))throw RangeError('Visible pixel minima must be nonnegative');
    if(ids.some(id=>!(typeof id==='string'&&id.length||typeof id==='number'&&Number.isSafeInteger(id)))||new Set(ids).size!==ids.length)throw TypeError('Roster IDs must be distinct nonempty strings or safe integers');
    const roster = [...ids];
    let events = [], recent = [], active = null, lastTime = null, lastPlan = null;
    let attentionKey=null,attentionSince=0,attentionOriginYaw=0;
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
    const minPitch=rad(18),maxPitch=rad(85),visibilityCache=new WeakMap();
    function holderId(){const id=getHolder();if(id!==null&&!roster.includes(id))throw RangeError('Actual holder is outside roster');return id;}
    function attentionId(focusId,holder){if(focusId!=null&&!roster.includes(focusId))throw RangeError('Attention focus outside roster');return active??focusId??holder;}
    function contentSupport(frame,b,margin=0){
      const rects=getContentRects(frame);
      if(!Array.isArray(rects))throw TypeError('Content rectangles must be an array');
      let vertical=0,horizontal=0,fits=true,verticalFits=true;
      for(const r of rects){
        if(!r||![r.x,r.y,r.width,r.height].every(finite)||r.width<=0||r.height<=0)throw RangeError('Finite positive content rectangle required');
        const v=Math.max(0,b.top+margin-(r.y-r.height/2),r.y+r.height/2-(b.bottom-margin));
        const h=Math.max(0,b.left+margin-(r.x-r.width/2),r.x+r.width/2-(b.right-margin));
        vertical+=v;horizontal+=h;if(v>.25)verticalFits=false;if(v>.25||h>.25)fits=false;
      }
      return {rects,vertical,horizontal,fits,verticalFits};
    }
    function geometry(frame,activeId=active,holder=holderId(),verticalAll=true,intendedId=null){
      const b=getBounds();if(!b||![b.left,b.right,b.top,b.bottom].every(finite)||b.right<=b.left||b.bottom<=b.top)throw RangeError('Nonempty finite pixel bounds required');
      const portraits=roster.map((id,order)=>({id,order,...project(id,frame)}));
      let verticalOverflowPx=0,activeOverflowPx=0,holderOverflowPx=0,intentOverflowPx=0,verticalFits=true;
      for(const p of portraits){
        if(![p.x,p.y,p.diameter,p.depth].every(finite)||p.diameter<=0||p.paintPadding!=null&&!finite(p.paintPadding))throw RangeError('Finite actual portrait projection required');
        const r=fitRadius(p),v=Math.max(0,b.top-(p.y-r),p.y+r-b.bottom),h=Math.max(0,b.left-(p.x-r),p.x+r-b.right);
        if(verticalAll){verticalOverflowPx+=v;if(v>.25)verticalFits=false;}
        if(p.id===activeId)activeOverflowPx=h+v;
        if(p.id===holder)holderOverflowPx=h+v;
        if(p.id===intendedId)intentOverflowPx=h+v;
      }
      const content=contentSupport(frame,b);
      verticalOverflowPx+=content.vertical;verticalFits=verticalFits&&content.verticalFits;
      const blockers=getBlockers(frame).map((p,i)=>({order:roster.length+i,...p}));
      for(const p of blockers)if(![p.x,p.y].every(finite)||(p.shape==='rect'?![p.width,p.height].every(finite)||p.width<=0||p.height<=0:!finite(p.diameter)||p.diameter<=0)||!p.front&&!finite(p.depth))throw RangeError('Finite disc/rect blocker required');
      const activeFrameFits=activeId===null||activeOverflowPx<=.25,holderFrameFits=holder===null||holderOverflowPx<=.25,intentFrameFits=intendedId===null||intentOverflowPx<=.25;
      return {bounds:{...b},portraits,blockers,contentRects:content.rects,contentFits:content.fits,contentVerticalOverflowPx:content.vertical,contentHorizontalOverflowPx:content.horizontal,contentOverflowPx:content.vertical+content.horizontal,verticalFits,activeFrameFits,holderFrameFits,intentFrameFits,verticalOverflowPx,activeOverflowPx,holderOverflowPx,intentOverflowPx,
        overflowPx:verticalOverflowPx+activeOverflowPx+holderOverflowPx+intentOverflowPx+content.horizontal,frameFits:verticalFits&&activeFrameFits&&holderFrameFits&&intentFrameFits&&content.fits};
    }
    function visible(e,id,rows=32){
      let cache=visibilityCache.get(e);if(!cache){cache=new Map();visibilityCache.set(e,cache);}const key=typeof id+':'+String(id)+':'+rows;if(cache.has(key))return cache.get(key);
      const p=e.portraits.find(p=>p.id===id);if(!p)return{area:0,lower:0,upper:0,error:0,fullArea:0};
      const z=Math.round(p.depth*1000),nearer=o=>o.front||Math.round(o.depth*1000)>z||Math.round(o.depth*1000)===z&&o.order>p.order;
      const result=measureVisibility({target:p,occluders:[...e.portraits.filter(o=>o.id!==id&&nearer(o)),...e.blockers.filter(nearer)],bounds:e.bounds,rows});cache.set(key,result);return result;
    }
    function guard(e,id,fraction,pixelArea,kind,rows){
      const m=Math.min(e.bounds.right-e.bounds.left,e.bounds.bottom-e.bounds.top),d=kind==='holder'?clamp(m*.12,24,56):clamp(m*.14,28,64),minimum=pixelArea??PI*(d/2)**2;
      if(id===null)return{id,area:0,lower:0,upper:0,error:0,fraction:1,lowerFraction:1,minArea:minimum,minFraction:fraction,fits:true,debt:0};
      const v=visible(e,id,rows),f=v.fullArea?v.area/v.fullArea:0,lf=v.fullArea?v.lower/v.fullArea:0,debt=Math.max(fraction?1-lf/fraction:0,minimum?1-v.lower/minimum:0,0);
      return{id,area:v.area,lower:v.lower,upper:v.upper,error:v.error,fraction:f,lowerFraction:lf,minArea:minimum,minFraction:fraction,fits:debt<=1e-10,debt};
    }
    function evaluate(frame,{activeId=active,focusId=null,holder=holderId(),verticalAll=true,rows=32}={}){
      const e=geometry(frame,activeId,holder,verticalAll,focusId),att=activeId??focusId??holder;
      const a=guard(e,activeId,activeMinVisibleFraction,activeMinVisibleAreaPx,'active',rows),h=guard(e,holder,holderMinVisibleFraction,holderMinVisibleAreaPx,'holder',rows);
      const i=guard(e,focusId,intentMinVisibleFraction,intentMinVisibleAreaPx,'active',rows);
      return {e,a,h,i,attentionId:att,combinedVisibilityFits:a.fits&&h.fits&&i.fits,debt:Math.max(a.debt,h.debt,i.debt)};
    }
    function metric(v){const {e,a,h,i}=v;return{
      actualSpeakerId:a.id,activeId:a.id,holderId:h.id,intendedId:i.id,attentionId:v.attentionId,
      activeVisibleAreaPx:a.area,activeVisibleAreaLowerPx:a.lower,activeVisibleAreaUpperPx:a.upper,activeVisibleAreaErrorPx:a.error,activeVisibleFraction:a.fraction,activeVisibleFractionLower:a.lowerFraction,activeMinAreaPx:a.minArea,activeMinFraction:a.minFraction,activeVisibilityFits:a.fits,activeVisibilityDebt:a.debt,
      holderVisibleAreaPx:h.area,holderVisibleAreaLowerPx:h.lower,holderVisibleAreaUpperPx:h.upper,holderVisibleAreaErrorPx:h.error,holderVisibleFraction:h.fraction,holderVisibleFractionLower:h.lowerFraction,holderMinAreaPx:h.minArea,holderMinFraction:h.minFraction,holderVisibilityFits:h.fits,holderVisibilityDebt:h.debt,
      intentVisibleAreaPx:i.area,intentVisibleAreaLowerPx:i.lower,intentVisibleAreaUpperPx:i.upper,intentVisibleAreaErrorPx:i.error,intentVisibleFraction:i.fraction,intentVisibleFractionLower:i.lowerFraction,intentMinAreaPx:i.minArea,intentMinFraction:i.minFraction,intentVisibilityFits:i.fits,intentVisibilityDebt:i.debt,
      combinedVisibilityFits:v.combinedVisibilityFits,combinedVisibilityDebt:v.debt,contentFits:e.contentFits,contentOverflowPx:e.contentOverflowPx,contentVerticalOverflowPx:e.contentVerticalOverflowPx,contentHorizontalOverflowPx:e.contentHorizontalOverflowPx,verticalFits:e.verticalFits,activeFrameFits:e.activeFrameFits,holderFrameFits:e.holderFrameFits,intentFrameFits:e.intentFrameFits,frameFits:e.frameFits,overflowPx:e.overflowPx,verticalOverflowPx:e.verticalOverflowPx,activeOverflowPx:e.activeOverflowPx,holderOverflowPx:e.holderOverflowPx,intentOverflowPx:e.intentOverflowPx,
      fits:e.frameFits&&v.combinedVisibilityFits,overflowPenalty:e.overflowPx+v.debt*Math.min(e.bounds.right-e.bounds.left,e.bounds.bottom-e.bounds.top)};}
    function assess(frame,{activeId=active,focusId=null,verticalAll=true,rows=32}={}){
      if(activeId!==null&&!roster.includes(activeId)||focusId!==null&&!roster.includes(focusId))throw RangeError('Assessment IDs outside roster');
      const v=evaluate(frame,{activeId,focusId,verticalAll,rows});return {...v.e,...metric(v),visibleIds:v.e.portraits.filter(p=>{const r=fitRadius(p),b=v.e.bounds;return p.x-r>=b.left-.25&&p.x+r<=b.right+.25&&p.y-r>=b.top-.25&&p.y+r<=b.bottom+.25;}).map(p=>p.id)};
    }
    function plan({now,current,baselineZoom=1,restPitch=rad(55),memorySeconds=8,paceSeconds=14,mode='recency',focusId=null,motionRates={},fixedPitch=null}){
      if(![current?.yaw,current?.pitch,current?.zoom,baselineZoom,restPitch,memorySeconds,paceSeconds].every(finite)||current.zoom<=0||baselineZoom<=0||memorySeconds<=0||paceSeconds<=0)throw RangeError('Finite pose, positive baseline/time parameters required');
      if(!['recency','equal','current'].includes(mode))throw RangeError('Unknown interest comparison');
      if(fixedPitch!==null&&(!finite(fixedPitch)||fixedPitch<minPitch||fixedPitch>maxPitch))throw RangeError('Fixed automatic pitch must remain18..85degrees');
      const holder=holderId(),att=attentionId(focusId,holder);time(now);const weights=interest(now,memorySeconds,mode),baseline=clamp(baselineZoom,minZoom,maxZoom),rest=clamp(restPitch,minPitch,maxPitch);
      const key=att===null?'none':`${active===null?'focus':'voice'}:${typeof att}:${att}`;
      if(key!==attentionKey){attentionKey=key;attentionSince=now;attentionOriginYaw=current.yaw;}
      const speakingSeconds=active===null?0:Math.max(0,now-(events.at(-1)?.at??now))/1000;
      const attentionSeconds=active===null?Math.max(0,now-attentionSince)/1000:speakingSeconds;
      const sustainProgress=1-Math.exp(-attentionSeconds/paceSeconds),strength=.12+.88*sustainProgress;
      const targetYaw=att===null?current.yaw:speakerYaw(att),desiredYaw=attentionOriginYaw+wrap(targetYaw-attentionOriginYaw)*strength;
      const desiredPitch=rest+(minPitch-rest)*sustainProgress,preferredZoom=clamp(baseline*(1+1.1*sustainProgress),minZoom,maxZoom);
      const before=evaluate(current,{focusId,holder,rows:32}),beforeCoarse=evaluate(current,{focusId,holder,rows:8});
      const returningAbove=current.pitch<minPitch-1e-8||current.pitch>maxPitch+1e-8,recovering=!(before.e.frameFits&&before.combinedVisibilityFits)||returningAbove;
      const width=before.e.bounds.right-before.e.bounds.left,height=before.e.bounds.bottom-before.e.bounds.top,minDimension=Math.min(width,height);
      const faceGoalPx=minDimension*(.28+.18*sustainProgress),goalArea=PI*(faceGoalPx/2)**2;
      const rates={yaw:.55,pitch:.38,zoomIn:.08,zoomOut:.9,...motionRates};if(!Object.values(rates).every(x=>finite(x)&&x>0))throw RangeError('Positive motion rates required');
      const travel=f=>Math.max(Math.abs(wrap(f.yaw-current.yaw))/rates.yaw,Math.abs(f.pitch-current.pitch)/rates.pitch,Math.abs(Math.log(f.zoom/current.zoom))/(f.zoom>=current.zoom?rates.zoomIn:rates.zoomOut));
      const along=(f,t)=>({yaw:current.yaw+wrap(f.yaw-current.yaw)*t,pitch:current.pitch+(f.pitch-current.pitch)*t,zoom:current.zoom*Math.exp(Math.log(f.zoom/current.zoom)*t)});
      const currentFace=before.e.portraits.find(p=>p.id===att),goalZoom=currentFace?current.zoom*faceGoalPx/currentFace.diameter:preferredZoom;
      const circularX=weights.reduce((n,w)=>n+Math.sin(speakerYaw(w.id))*w.weight,0),circularY=weights.reduce((n,w)=>n+Math.cos(speakerYaw(w.id))*w.weight,0),mean=Math.hypot(circularX,circularY)>.05?Math.atan2(circularX,circularY):current.yaw;
      const direction=Math.sign(wrap(targetYaw-current.yaw))||1;
      const yaws=unique([current.yaw,current.yaw-rad(8),current.yaw+rad(8),current.yaw-rad(22),current.yaw+rad(22),current.yaw+direction*rad(50),targetYaw,desiredYaw,mean,...recent.filter(id=>id!==att).slice(0,1).map(speakerYaw)].map(wrap));
      const pitches=unique((fixedPitch===null?[clamp(current.pitch,minPitch,maxPitch),rest,minPitch,rad(30),rad(45),rad(60),maxPitch,desiredPitch]:[fixedPitch]));
      const zooms=unique([clamp(current.zoom,minZoom,maxZoom),baseline,preferredZoom,clamp(Math.max(goalZoom,preferredZoom*1.18),minZoom,maxZoom),minZoom]);
      let candidates=0,accurateEvaluations=0,envelopeProbes=0,derivedZoomCandidates=0,routeAssessments=0,preparationGeometryProbes=0;
      function row(frame,rows){
        const v=evaluate(frame,{focusId,holder,rows}),reference=rows===8?beforeCoarse:before;
        const worsens=(next,old)=>!old.fits&&(next.lower<old.lower-1||next.lowerFraction<old.lowerFraction-.002);
        const zoomWorsens=frame.zoom>current.zoom+1e-8&&(worsens(v.a,reference.a)||worsens(v.h,reference.h)||worsens(v.i,reference.i));
        const frameFits=v.e.frameFits,visibilityFits=v.combinedVisibilityFits;
        const yawTravel=Math.abs(wrap(frame.yaw-current.yaw))/PI,pitchTravel=Math.abs(frame.pitch-current.pitch)/(maxPitch-minPitch),logZoom=Math.log(frame.zoom/preferredZoom);
        const movementCost=.25*yawTravel*yawTravel+.025*yawTravel+.045*pitchTravel*pitchTravel;
        const zoomCost=(logZoom>0?.9:.12)*logZoom*logZoom;
        let attVisible=att===null?null:visible(v.e,att,rows),quality=0,frontness=att===null?1:Math.cos(wrap(frame.yaw-targetYaw)),composition=0;
        if(att!==null){const p=v.e.portraits.find(p=>p.id===att),centerX=(v.e.bounds.left+v.e.bounds.right)/2,centerY=v.e.bounds.top+height*.56;composition=((p.x-centerX)/(width/2))**2+.35*((p.y-centerY)/(height/2))**2;quality=Math.log1p(attVisible.area/goalArea);}
        let recentArea=0;for(const w of weights){const p=v.e.portraits.find(p=>p.id===w.id);const area=rows===8?PI*(p.diameter/2)**2:visible(v.e,w.id,rows).area;recentArea+=w.weight*Math.log1p(area/goalArea);}
        const attentionYawCost=2.4*(wrap(frame.yaw-desiredYaw)/PI)**2,pitchCost=.08*((frame.pitch-desiredPitch)/(maxPitch-minPitch))**2;
        const value=(.04+.66*sustainProgress)*quality+(.04+.08*sustainProgress)*recentArea+(.035+.615*sustainProgress)*frontness-(.025+.13*sustainProgress)*composition-attentionYawCost-pitchCost-movementCost-zoomCost;
        return{frame,v,frameFits,visibilityFits,zoomWorsens,value,frontness,composition,attentionAreaPx:attVisible?.area??0,attentionAreaLowerPx:attVisible?.lower??0,recentArea,quality,recoveryTime:travel(frame)};
      }
      function rank(a,b){
        if(a.zoomWorsens!==b.zoomWorsens)return a.zoomWorsens?1:-1;
        const aFeasible=a.frameFits&&a.visibilityFits,bFeasible=b.frameFits&&b.visibilityFits;if(aFeasible!==bFeasible)return aFeasible?-1:1;
        if(!aFeasible&&!bFeasible){if(a.v.a.fits!==b.v.a.fits)return a.v.a.fits?-1:1;const debt=a.v.debt-b.v.debt;if(Math.abs(debt)>1e-7)return debt;const overflow=a.v.e.overflowPx-b.v.e.overflowPx;if(Math.abs(overflow)>.25)return overflow;}
        if(a.routeSafe!==undefined&&b.routeSafe!==undefined&&a.routeSafe!==b.routeSafe)return a.routeSafe?-1:1;
        if(recovering&&aFeasible&&bFeasible){const duration=a.recoveryTime-b.recoveryTime;if(Math.abs(duration)>1e-4)return duration;}
        return b.value-a.value;
      }
      function envelopeFitsAt(f,margin=0){
        envelopeProbes++;const b=before.e.bounds;
        if(!contentSupport(f,b,margin).fits)return false;
        for(const id of roster){const p=project(id,f);
          if(!p||![p.x,p.y,p.diameter,p.depth].every(finite)||p.diameter<=0||p.paintPadding!=null&&!finite(p.paintPadding))throw RangeError('Finite actual portrait projection required');
          const r=fitRadius(p),vertical=Math.max(0,b.top+margin-(p.y-r),p.y+r-(b.bottom-margin));
          if(vertical>.25)return false;
          if(id===active||id===holder||id===focusId){const horizontal=Math.max(0,b.left+margin-(p.x-r),p.x+r-(b.right-margin));if(horizontal+vertical>.25)return false;}
        }return true;
      }
      const coarse=[];
      for(const yaw of yaws)for(const pitch of pitches){
        let levels=zooms;
        const high=Math.max(...zooms);
        // Fit the available portrait/paint envelope for THIS angular pose.
        // Replace offstage discrete zooms, rather than force global widening
        // or adjust objective weights. Full visibility is still checked below.
        if(!envelopeFitsAt({yaw,pitch,zoom:high})&&envelopeFitsAt({yaw,pitch,zoom:minZoom},1)){
          let low=minZoom,upper=high;
          for(let i=0;i<12;i++){const middle=(low+upper)/2;if(envelopeFitsAt({yaw,pitch,zoom:middle},1))low=middle;else upper=middle;}
          levels=unique([...zooms.filter(z=>z<=low+1e-10),low]);derivedZoomCandidates++;
        }
        for(const zoom of levels){candidates++;coarse.push(row({yaw,pitch,zoom},8));}
      }
      coarse.sort(rank);
      const shortlist=coarse.slice(0,10),diversity=new Set(shortlist.map(r=>r.frame.yaw.toFixed(5)+':'+r.frame.pitch.toFixed(5)));
      for(const r of coarse){if(shortlist.length>=16)break;const k=r.frame.yaw.toFixed(5)+':'+r.frame.pitch.toFixed(5);if(!diversity.has(k)){shortlist.push(r);diversity.add(k);}}
      if(!returningAbove&&current.zoom>=minZoom&&current.zoom<=maxZoom&&!shortlist.some(r=>Math.abs(wrap(r.frame.yaw-current.yaw))<1e-8&&Math.abs(r.frame.pitch-current.pitch)<1e-8&&Math.abs(r.frame.zoom-current.zoom)<1e-8))shortlist.push({frame:{...current}});
      const accurate=shortlist.map(r=>{accurateEvaluations++;return row(r.frame,32);});accurate.sort(rank);
      const checked=accurate.slice(0,6);const currentRow=accurate.find(r=>Math.abs(wrap(r.frame.yaw-current.yaw))<1e-8&&Math.abs(r.frame.pitch-current.pitch)<1e-8&&Math.abs(r.frame.zoom-current.zoom)<1e-8);if(currentRow&&!checked.includes(currentRow))checked.push(currentRow);
      function checkRoute(r){let safe=true,wasActive=before.a.fits,wasHolder=before.h.fits,wasIntent=before.i.fits,wasContent=before.e.contentFits,previous=before,previousZoom=current.zoom;
        for(let i=1;i<=4;i++){routeAssessments++;const f=along(r.frame,i/4),v=evaluate(f,{focusId,holder,rows:32});
          if(before.e.verticalFits?!v.e.verticalFits:v.e.verticalOverflowPx>previous.e.verticalOverflowPx+.25)safe=false;
          if(wasContent?!v.e.contentFits:v.e.contentOverflowPx>previous.e.contentOverflowPx+1e-8)safe=false;
          if(before.e.activeFrameFits&&!v.e.activeFrameFits||before.e.holderFrameFits&&!v.e.holderFrameFits||before.e.intentFrameFits&&!v.e.intentFrameFits)safe=false;
          if(wasActive&&!v.a.fits||wasHolder&&!v.h.fits||wasIntent&&!v.i.fits)safe=false;
          if(f.zoom>previousZoom+1e-8&&(!previous.a.fits&&(v.a.lower<previous.a.lower-1||v.a.lowerFraction<previous.a.lowerFraction-.002)||!previous.h.fits&&(v.h.lower<previous.h.lower-1||v.h.lowerFraction<previous.h.lowerFraction-.002)||!previous.i.fits&&(v.i.lower<previous.i.lower-1||v.i.lowerFraction<previous.i.lowerFraction-.002)))safe=false;
          wasActive ||= v.a.fits;wasHolder ||= v.h.fits;wasIntent ||= v.i.fits;wasContent ||= v.e.contentFits;previous=v;previousZoom=f.zoom;
        }r.routeSafe=safe;return r;
      }
      checked.forEach(checkRoute);checked.sort(rank);let best=checked[0],localFallback=false;
      const held=Math.abs(wrap(best.frame.yaw-current.yaw))<1e-8&&Math.abs(best.frame.pitch-current.pitch)<1e-8&&Math.abs(Math.log(best.frame.zoom/current.zoom))<1e-8;
      // A distant attractive endpoint can have an unsafe straight route.
      // Retain bounded useful local progress instead of choosing an exact
      // current-pose hold merely because all high-scoring endpoints conflict.
      if(att!==null&&(held||!best.routeSafe)){
        const localPitch=clamp(current.pitch,minPitch,maxPitch),localZoom=clamp(current.zoom,minZoom,maxZoom);
        const localFrames=[...[-22,-8,8,22].map(degrees=>({yaw:wrap(current.yaw+rad(degrees)),pitch:localPitch,zoom:localZoom})),
          ...[-15,15].map(degrees=>({yaw:current.yaw,pitch:clamp(current.pitch+rad(degrees),minPitch,maxPitch),zoom:localZoom})),
          {yaw:current.yaw,pitch:localPitch,zoom:clamp(current.zoom*1.03,minZoom,maxZoom)}];
        for(const f of localFrames){accurateEvaluations++;const r=checkRoute(row(f,32));checked.push(r);}
        checked.sort(rank);best=checked[0];localFallback=true;
      }
      let preparation=null;
      const stillHeld=Math.abs(wrap(best.frame.yaw-current.yaw))<1e-8&&Math.abs(best.frame.pitch-current.pitch)<1e-8&&Math.abs(Math.log(best.frame.zoom/current.zoom))<1e-8;
      if(att!==null&&!returningAbove&&before.e.frameFits&&before.combinedVisibilityFits&&(stillHeld||!best.routeSafe)){
        // A better feasible angular destination may require a small initial
        // widen at the current envelope frontier. This is an explicit route
        // waypoint, not a new objective or an unconditional wide-first rule.
        const preparationProbeStart=envelopeProbes;
        const destinations=accurate.filter(r=>r.frameFits&&r.visibilityFits&&!r.zoomWorsens&&r.value>best.value+1e-6).sort((a,b)=>b.value-a.value);
        for(const destination of destinations.slice(0,3)){
          const angular=Math.max(Math.abs(wrap(destination.frame.yaw-current.yaw)),Math.abs(destination.frame.pitch-current.pitch));
          if(angular<1e-6)continue;
          const fraction=Math.min(1,rad(15)/angular),look=along(destination.frame,fraction);
          if(envelopeFitsAt({...look,zoom:current.zoom},1)||!envelopeFitsAt({...look,zoom:minZoom},1))continue;
          let low=minZoom,high=current.zoom;
          for(let i=0;i<12;i++){const middle=(low+high)/2;if(envelopeFitsAt({...look,zoom:middle},1))low=middle;else high=middle;}
          if(low>=current.zoom-1e-5)continue;
          accurateEvaluations++;const waypoint=checkRoute(row({...current,zoom:low},32));
          if(waypoint.frameFits&&waypoint.visibilityFits&&!waypoint.zoomWorsens&&waypoint.routeSafe){
            best=waypoint;preparation={reason:'envelope-headroom',forFrame:{...destination.frame},lookAheadRadians:angular*fraction,lookAheadFrame:{yaw:look.yaw,pitch:look.pitch,zoom:low}};break;
          }
        }
        preparationGeometryProbes=envelopeProbes-preparationProbeStart;
      }
      const m=metric(best.v),constraintConflict=!m.fits;
      const result={frame:{...best.frame},weights,metrics:{...m,actualSpeakerId:active,holderId:holder,attentionId:att,speakingSeconds,attentionSeconds,sustainProgress,attentionStrength:strength,baselineZoom:baseline,preferredZoom,faceGoalPx,attentionVisibleAreaPx:best.attentionAreaPx,attentionVisibleAreaLowerPx:best.attentionAreaLowerPx,frontness:best.frontness,compositionPenalty:best.composition,score:best.value,weightedVisibleUtility:best.recentArea,candidates,accurateEvaluations,envelopeProbes,derivedZoomCandidates,routeAssessments,preparationGeometryProbes,localFallback,preparation,routeSampleSafe:best.routeSafe,recoverySecondsEstimate:best.recoveryTime,returningAbove,recovering,autoPitchMin:minPitch,autoPitchMax:maxPitch,mode,constraintConflict,constraintReason:constraintConflict?(focusId!==null?'speaker-holder-intent-conflict':active!==null&&holder!==null&&active!==holder?'active-holder-visibility-conflict':'no-feasible-above-view'):null,routeYawRadians:wrap(best.frame.yaw-current.yaw),routePitchRadians:best.frame.pitch-current.pitch}};
      lastPlan=result;return result;
    }
    return Object.freeze({observe,plan,assess,snapshot:()=>({activeId:active,actualSpeakerId:active,holderId:holderId(),intendedId:lastPlan?.metrics.intendedId??null,recent:[...recent],observedEvents:events.length,lastTime,lastPlan})});
  }
  const api=Object.freeze({create,wrap,rad,measureVisibility});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AttentionConversationCamera=api;
})(typeof globalThis!=='undefined'?globalThis:this);
