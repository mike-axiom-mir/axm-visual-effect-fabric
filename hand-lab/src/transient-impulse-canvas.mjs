import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  normalizeImpulseEventHand,
  buildImpulseFieldHand,
  impulseEnvelopeHand,
} from './transient-impulse-hands.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

function hand(id, execute, description) {
  return Object.freeze({
    schema: 'axm.hand/v0.1',
    id,
    version: '0.1.0',
    deterministic: true,
    callerNeutral: true,
    network: 'forbidden',
    description,
    execute,
  });
}

function colorTriplet(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return source.slice(0, 3).map((channel) => Math.round(clamp(channel, 0, 1) * 255));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const impulseCanvas2dHand = hand('fx.impulse.canvas2d-realize', (state) => {
  const next = deepClone(state);
  if (!next.impulseField || !next.impulseEnvelope) throw new Error('canvas2d-realize requires impulse field + envelope');

  const sourceHash = hashValue({
    event: next.event,
    field: next.impulseField,
    envelope: next.impulseEnvelope,
    effect: next.effect,
  });
  const payload = {
    event: next.event,
    field: next.impulseField.geometry,
    envelope: next.impulseEnvelope,
    tint: colorTriplet(next.effect?.tint, [0.25, 0.9, 1]),
    accent: colorTriplet(next.effect?.accent, [1, 0.55, 0.2]),
  };
  const title = escapeHtml(next.event.id);
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#03060b}canvas{width:100%;height:100%;display:block}.tag{position:fixed;left:14px;bottom:12px;font:10px ui-monospace,monospace;color:#9ffcff88;letter-spacing:.11em;pointer-events:none}</style><canvas id="c" width="1000" height="600" aria-label="${title}" role="img"></canvas><div class="tag">AXM // TRANSIENT IMPULSE // CANVAS2D // ${title}</div><script>(()=>{const D=${JSON.stringify(payload)},c=document.querySelector('#c'),g=c.getContext('2d',{alpha:false});if(!g)throw Error('Canvas2D required');const W=1000,H=600,cx=D.event.origin[0]*W,cy=D.event.origin[1]*H,R=D.event.radius*H,duration=D.event.duration*1000,started=performance.now();function rgba(rgb,a){return 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+Math.max(0,Math.min(1,a))+')'}function env(t){const s=D.envelope.samples;if(t<=s[0].t)return s[0];if(t>=s[s.length-1].t)return s[s.length-1];for(let i=1;i<s.length;i++){if(t<=s[i].t){const a=s[i-1],b=s[i],q=(t-a.t)/(b.t-a.t||1);return{intensity:a.intensity+(b.intensity-a.intensity)*q,expansion:a.expansion+(b.expansion-a.expansion)*q}}}return s[s.length-1]}function frame(now){const t=Math.min(1,(now-started)/duration),E=env(t);g.fillStyle='#03060b';g.fillRect(0,0,W,H);g.save();g.globalCompositeOperation='lighter';for(const ring of D.field.rings){const local=Math.max(0,Math.min(1,(t-ring.phase*.16)/(1-ring.phase*.16||1)));if(local<=0)continue;const ex=E.expansion*(.18+.82*local),rx=R*ring.radiusScale*ex,ry=rx*ring.axisRatio;g.save();g.translate(cx,cy);g.rotate(ring.rotation);g.strokeStyle=rgba(D.tint,E.intensity*ring.intensity*.55);g.lineWidth=Math.max(.7,4.2*ring.widthScale);g.beginPath();g.ellipse(0,0,rx,ry,0,0,Math.PI*2);g.stroke();g.restore()}for(const spoke of D.field.spokes){const local=Math.max(0,Math.min(1,(t-spoke.phase*.12)/(1-spoke.phase*.12||1)));if(local<=0)continue;const start=R*spoke.startScale*E.expansion,end=R*spoke.lengthScale*E.expansion*local;g.strokeStyle=rgba(D.accent,E.intensity*spoke.intensity*.52);g.lineWidth=Math.max(.5,3.4*spoke.widthScale);g.lineCap='round';g.beginPath();g.moveTo(cx+Math.cos(spoke.angle)*start,cy+Math.sin(spoke.angle)*start);g.lineTo(cx+Math.cos(spoke.angle+spoke.bend)*end,cy+Math.sin(spoke.angle+spoke.bend)*end);g.stroke()}for(const f of D.field.fragments){const local=Math.max(0,Math.min(1,(t-f.phase*.2)/.72));if(local<=0||local>=1)continue;const distance=R*f.radialScale*E.expansion,tangent=f.angle+Math.PI/2,x=cx+Math.cos(f.angle)*distance+Math.cos(tangent)*R*f.tangentScale,y=cy+Math.sin(f.angle)*distance+Math.sin(tangent)*R*f.tangentScale,half=R*f.lengthScale*.5;g.strokeStyle=rgba(D.tint,E.intensity*f.intensity*.48*(1-local));g.lineWidth=1.4;g.beginPath();g.moveTo(x-Math.cos(f.angle)*half,y-Math.sin(f.angle)*half);g.lineTo(x+Math.cos(f.angle)*half,y+Math.sin(f.angle)*half);g.stroke()}g.fillStyle=rgba(D.accent,E.intensity*.9);g.beginPath();g.arc(cx,cy,Math.max(4,R*.09*E.expansion),0,Math.PI*2);g.fill();g.restore();if(t<1)requestAnimationFrame(frame)}requestAnimationFrame(frame)})();</script>`;

  next.realizations ??= {};
  next.realizations.transientImpulseCanvas2d = {
    mediaType: 'text/html',
    renderer: 'axm.vfx.transient-impulse-canvas2d/v0.1',
    derivedFromStateHash: sourceHash,
    canonicalEventHash: next.eventCanonicalHash,
    fieldGeometryHash: next.impulseField.geometryHash,
    oneShotDuration: next.event.duration,
    workingSet: {
      schema: 'axm.render-working-set/v0.1',
      canonicalEventRetained: true,
      derivedFieldRebuildable: true,
      rendererStateDisposable: true,
      rings: next.impulseField.counts.rings,
      spokes: next.impulseField.counts.spokes,
      fragments: next.impulseField.counts.fragments,
      envelopeSamples: next.impulseEnvelope.samples.length,
    },
    content: html,
  };

  return {
    state: next,
    evidence: {
      renderer: 'axm.vfx.transient-impulse-canvas2d/v0.1',
      bytes: Buffer.byteLength(html),
      canonicalEventHash: next.eventCanonicalHash,
      fieldGeometryHash: next.impulseField.geometryHash,
      derivedFromStateHash: sourceHash,
    },
  };
}, 'Realize the existing derived transient impulse field through a disposable Canvas2D one-shot renderer without changing canonical event state.');

export const TRANSIENT_IMPULSE_CANVAS_HANDS = [
  normalizeImpulseEventHand,
  buildImpulseFieldHand,
  impulseEnvelopeHand,
  impulseCanvas2dHand,
];

export const TRANSIENT_IMPULSE_CANVAS_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.transient-impulse-canvas2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-event', hand: 'fx.impulse.event-normalize', params: {} },
    { id: 'build-field', hand: 'fx.impulse.field-build', params: { maxRings: 8, maxSpokes: 18, maxFragments: 42 } },
    { id: 'temporal-envelope', hand: 'fx.impulse.temporal-envelope', params: { samples: 17, attack: 0.12 } },
    { id: 'realize-canvas2d', hand: 'fx.impulse.canvas2d-realize', params: {} },
  ],
});
