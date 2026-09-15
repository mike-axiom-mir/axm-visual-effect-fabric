import { deepClone, hashValue } from './hand-runtime.mjs';
import { aiAnatomyHand, aiFragmentHand, aiBehaviorHand, makeHolographicAiInitialState } from './holographic-ai-hands.mjs';
import {
  emitterFieldHand,
  projectionParticlesHand,
  scanVolumeHand,
  breakupFieldHand,
  projectionMotionHand,
} from './volumetric-hologram-hands.mjs';

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

const TAU = Math.PI * 2;
const PHI = (1 + Math.sqrt(5)) / 2;

function addPoint(out, x, y, z, size, role, phase = 0, intensity = 1) {
  out.push(
    Number(x.toFixed(6)),
    Number(y.toFixed(6)),
    Number(z.toFixed(6)),
    Number(size.toFixed(6)),
    role,
    Number(phase.toFixed(6)),
    Number(intensity.toFixed(6)),
  );
}

function addEllipsoid(out, center, radii, count, size, role, phaseOffset = 0, intensity = 1) {
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const y = 1 - 2 * t;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = TAU * i / PHI;
    addPoint(
      out,
      center[0] + Math.cos(angle) * radial * radii[0],
      center[1] + y * radii[1],
      center[2] + Math.sin(angle) * radial * radii[2],
      size,
      role,
      (phaseOffset + i / count) % 1,
      intensity,
    );
  }
}

function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function addCapsule(out, a, b, radius, count, size, role, phaseOffset = 0, intensity = 1) {
  const axis = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const fallback = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(axis, fallback));
  const v = normalize(cross(axis, u));
  for (let i = 0; i < count; i += 1) {
    const along = ((i * 0.61803398875) % 1);
    const angle = TAU * ((i * 0.754877666) % 1);
    const r = radius * (0.82 + 0.18 * Math.sin((i + 1) * 1.71));
    const cx = a[0] + (b[0] - a[0]) * along;
    const cy = a[1] + (b[1] - a[1]) * along;
    const cz = a[2] + (b[2] - a[2]) * along;
    addPoint(
      out,
      cx + (u[0] * Math.cos(angle) + v[0] * Math.sin(angle)) * r,
      cy + (u[1] * Math.cos(angle) + v[1] * Math.sin(angle)) * r,
      cz + (u[2] * Math.cos(angle) + v[2] * Math.sin(angle)) * r,
      size,
      role,
      (phaseOffset + i / count) % 1,
      intensity,
    );
  }
}

function addTorus(out, center, major, minor, tilt, count, size, role) {
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let i = 0; i < count; i += 1) {
    const a = TAU * i / count;
    const b = TAU * ((i * 0.38196601125) % 1);
    const x = (major + Math.cos(b) * minor) * Math.cos(a);
    const y0 = Math.sin(b) * minor;
    const z0 = (major + Math.cos(b) * minor) * Math.sin(a);
    const y = y0 * ct - z0 * st;
    const z = y0 * st + z0 * ct;
    addPoint(out, center[0] + x, center[1] + y, center[2] + z, size, role, i / count, 1);
  }
}

function buildWorkingSet(state) {
  const ai = state.ai;
  if (!ai) throw new Error('state-native renderer requires AI anatomy');
  const points = [];

  addEllipsoid(points, ai.head.center, [
    ai.head.radius * ai.head.scale[0],
    ai.head.radius * ai.head.scale[1],
    ai.head.radius * ai.head.scale[2],
  ], 460, 2.2, 1, 0.03, 0.9);

  addCapsule(points, [0, 0.38, 0], [0, 0.31, 0], 0.063, 120, 1.9, 0, 0.1, 0.75);
  addEllipsoid(points, ai.torso.center, ai.torso.scale, 620, 2.15, 0, 0.18, 0.82);
  addEllipsoid(points, ai.pelvis.center, ai.pelvis.scale, 310, 2.0, 0, 0.25, 0.72);

  addCapsule(points, ai.arms.left[0], ai.arms.left[1], 0.058, 190, 1.95, 0, 0.31, 0.78);
  addCapsule(points, ai.arms.left[1], ai.arms.left[2], 0.047, 170, 1.85, 0, 0.39, 0.76);
  addEllipsoid(points, ai.hands.left, [0.058, 0.058, 0.058], 90, 2.0, 0, 0.46, 0.8);

  addCapsule(points, ai.arms.right[0], ai.arms.right[1], 0.058, 190, 1.95, 8, 0.52, 0.88);
  addCapsule(points, ai.arms.right[1], ai.arms.right[2], 0.046, 170, 1.85, 8, 0.61, 0.9);
  addEllipsoid(points, ai.hands.right, [0.057, 0.057, 0.057], 95, 2.05, 8, 0.68, 0.95);

  addCapsule(points, ai.legs.left[0], ai.legs.left[1], 0.072, 220, 2.0, 0, 0.72, 0.72);
  addCapsule(points, ai.legs.left[1], ai.legs.left[2], 0.055, 190, 1.85, 0, 0.77, 0.66);
  addCapsule(points, ai.legs.right[0], ai.legs.right[1], 0.072, 220, 2.0, 0, 0.81, 0.72);
  addCapsule(points, ai.legs.right[1], ai.legs.right[2], 0.055, 190, 1.85, 0, 0.86, 0.66);

  addTorus(points, ai.halo.center, ai.halo.major, ai.halo.minor, ai.halo.tilt, 240, 2.2, 2);
  addEllipsoid(points, [-ai.face.sensorSpacing, ai.face.sensorY, 0.115], [0.018, 0.012, 0.008], 56, 3.1, 3, 0.08, 1.0);
  addEllipsoid(points, [ai.face.sensorSpacing, ai.face.sensorY, 0.115], [0.018, 0.012, 0.008], 56, 3.1, 3, 0.18, 1.0);
  addEllipsoid(points, ai.core.center, [ai.core.radius, ai.core.radius, ai.core.radius], 100, 3.25, 4, 0.3, 1.0);

  const essentialCount = points.length / 7;

  const ringCount = 160;
  for (let i = 0; i < ringCount; i += 1) {
    const a = TAU * i / ringCount;
    addPoint(points, Math.cos(a) * state.emitter.floorRingRadius, -0.98, Math.sin(a) * state.emitter.floorRingRadius * 0.42, 2.0, 5, i / ringCount, 0.9);
  }

  for (const p of state.particles ?? []) {
    addPoint(points, p.x * 0.52, -0.72 + (p.y + 1) * 0.68, p.z * 0.34, 1.2 + p.size * 0.85, 6, p.phase, p.intensity);
  }

  for (const fragment of ai.fragments ?? []) {
    addPoint(points, fragment.anchor[0], fragment.anchor[1], fragment.anchor[2], 1.4 + fragment.size[1] * 18, 7, fragment.phase, fragment.intensity);
  }

  const totalCount = points.length / 7;
  const mediumCount = Math.min(totalCount, essentialCount + Math.ceil((totalCount - essentialCount) * 0.55));
  return {
    stride: 7,
    points,
    essentialCount,
    mediumCount,
    totalCount,
    modeledBufferBytes: points.length * 4,
    digest: hashValue(points),
  };
}

const PROFILE_TABLE = Object.freeze({
  dormant: { visibility: 0.02, eyes: 0.0, core: 0.08, voice: 0.0, gesture: 0.0, breakup: 0.1 },
  materialize: { visibility: 0.78, eyes: 0.9, core: 0.85, voice: 0.0, gesture: 0.4, breakup: 0.65 },
  idle: { visibility: 1.0, eyes: 0.72, core: 0.62, voice: 0.0, gesture: 0.18, breakup: 0.18 },
  listen: { visibility: 1.0, eyes: 1.0, core: 0.82, voice: 0.0, gesture: 0.42, breakup: 0.12 },
  speak: { visibility: 1.0, eyes: 0.88, core: 1.0, voice: 1.0, gesture: 0.58, breakup: 0.22 },
  think: { visibility: 1.0, eyes: 0.56, core: 0.92, voice: 0.12, gesture: 0.78, breakup: 0.28 },
  alert: { visibility: 1.0, eyes: 1.25, core: 1.2, voice: 0.2, gesture: 0.7, breakup: 0.48 },
  collapse: { visibility: 0.18, eyes: 0.12, core: 0.35, voice: 0.0, gesture: 0.0, breakup: 1.0 },
});

export const aiStateNativeWebglHand = hand('fx.hologram.ai-state-native-webgl', (state) => {
  const next = deepClone(state);
  if (!next.ai || !next.emitter || !next.motion) throw new Error('state-native AI realization requires anatomy, emitter, and motion');
  const sourceHash = hashValue({
    effect: next.effect,
    ai: next.ai,
    emitter: next.emitter,
    fields: next.fields,
    particles: next.particles,
    motion: next.motion,
  });
  const working = buildWorkingSet(next);
  const tint = next.effect.tint ?? [0.16, 0.88, 1.0];
  const accent = next.effect.accent ?? [0.55, 0.28, 1.0];
  const initialState = next.effect.activeState ?? 'idle';

  const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in float aSize;
layout(location=2) in float aRole;
layout(location=3) in float aPhase;
layout(location=4) in float aIntensity;
uniform vec2 uMouse;
uniform float uTime;
uniform float uAspect;
uniform float uVisibility;
uniform float uGesture;
uniform float uBreakup;
uniform float uPointScale;
out float vRole;
out float vPhase;
out float vIntensity;
out float vY;
out float vBreak;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float hash(float n){return fract(sin(n)*43758.5453123);}
void main(){
  vec3 p=aPos;
  bool projected=aRole<5.0||aRole>6.5;
  if(projected){
    p.y += sin(uTime*.92+aPhase*6.2831)*.013;
    float yaw=sin(uTime*.31)*.055+(uMouse.x-.5)*.24;
    p.xz=rot(yaw)*p.xz;
    p.yz=rot((uMouse.y-.5)*-.10)*p.yz;
  }
  if(aRole>7.5){p.x += sin(uTime*.75+aPhase*5.0)*.016*uGesture;}
  if(aRole>5.5&&aRole<6.5){
    p.y += mod(uTime*(.045+.07*aPhase)+aPhase*1.3,1.45)-.52;
    p.x += sin(uTime*.7+aPhase*19.)*.02;
  }
  if(aRole>6.5&&aRole<7.5){
    p.y += sin(uTime*(.45+aPhase)+aPhase*9.)*.025;
    p.x += sin(uTime*.8+aPhase*11.)*.02;
  }
  float band=floor((p.y+1.2)*22.0);
  float glitch=step(.92,hash(band+floor(uTime*9.0)*17.0+aPhase*41.0))*uBreakup;
  p.x += (hash(band+aPhase*71.0)-.5)*.075*glitch;
  float depth=max(.9,2.75-p.z);
  vec2 clip=vec2(p.x*2.05/depth,p.y*2.05/depth);
  clip.x/=max(1.0,uAspect*.72);
  gl_Position=vec4(clip,0.0,1.0);
  float roleBoost=(aRole==3.0||aRole==4.0)?1.8:(aRole==2.0?1.35:1.0);
  gl_PointSize=max(1.0,aSize*uPointScale*roleBoost*(1.35/depth));
  vRole=aRole;vPhase=aPhase;vIntensity=aIntensity;vY=p.y;vBreak=glitch;
}`;

  const fragment = `#version 300 es
precision highp float;
out vec4 O;
uniform float uTime;
uniform float uVisibility;
uniform float uEyes;
uniform float uCore;
uniform float uVoice;
uniform vec3 uTint;
uniform vec3 uAccent;
in float vRole;
in float vPhase;
in float vIntensity;
in float vY;
in float vBreak;
void main(){
  vec2 q=gl_PointCoord-.5;
  float r=length(q);
  if(r>.5)discard;
  float soft=pow(max(0.0,1.0-r*2.0),1.45);
  float scan=.68+.32*sin(vY*105.0-uTime*10.0+vPhase*6.2831);
  vec3 color=uTint;
  float gain=.55;
  if(vRole==2.0){color=mix(uTint,uAccent,.35);gain=1.05;}
  if(vRole==3.0){color=vec3(.82,1.0,1.0);gain=1.8*uEyes;}
  if(vRole==4.0){color=mix(uTint,uAccent,.5);gain=(1.6+.45*sin(uTime*6.0))*uCore;}
  if(vRole==5.0){color=mix(uTint,uAccent,.2);gain=.62;}
  if(vRole==6.0){gain=.42+.35*sin(uTime*.9+vPhase*12.0);}
  if(vRole==7.0){color=mix(uTint,uAccent,.25);gain=.6+.45*sin(uTime*1.3+vPhase*8.0);}
  if(vRole==8.0){gain=.75+.25*sin(uTime*1.5);}
  float voice=(vRole==4.0?uVoice*(.35+.35*sin(uTime*9.0)):0.0);
  float alpha=soft*vIntensity*(gain+voice)*scan*uVisibility*(1.0-vBreak*.65);
  O=vec4(color*alpha,alpha);
}`;

  const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AXM Holographic AI — State Native</title>
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#02040a}
body:before{content:"";position:fixed;left:50%;bottom:1.8%;width:min(48vw,520px);height:min(58vh,620px);transform:translateX(-50%);background:linear-gradient(to top,rgba(50,235,255,.14),rgba(50,235,255,.035) 55%,transparent);clip-path:polygon(42% 100%,58% 100%,83% 0,17% 0);filter:blur(15px);pointer-events:none}
canvas{width:100%;height:100%;display:block;cursor:pointer}
.hud{position:fixed;left:14px;bottom:12px;font:10px/1.45 ui-monospace,monospace;letter-spacing:.12em;color:#9ffcffaa;pointer-events:none}
.hud b{color:#d9ffff}.hint{position:fixed;right:14px;bottom:12px;font:10px ui-monospace,monospace;color:#9ffcff66;pointer-events:none}
</style>
<canvas id="c"></canvas><div class="hud"><b>STATE-NATIVE HOLOGRAPHIC AI</b><br><span id="s"></span><br><span id="p"></span></div><div class="hint">move = parallax · click = next state · space = collapse/materialize · q = quality</div>
<script type="module">
const canonicalHash=${JSON.stringify(sourceHash)};
const workingSetHash=${JSON.stringify(working.digest)};
const packed=new Float32Array(${JSON.stringify(working.points)});
const essential=${working.essentialCount},medium=${working.mediumCount},full=${working.totalCount},stride=${working.stride};
const profiles=${JSON.stringify(PROFILE_TABLE)};
const tint=new Float32Array(${JSON.stringify(tint)}),accent=new Float32Array(${JSON.stringify(accent)});
const c=document.querySelector('#c'),g=c.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});
if(!g)throw Error('WebGL2 required');
const V=${JSON.stringify(vertex)},F=${JSON.stringify(fragment)};
function shader(type,src){const sh=g.createShader(type);g.shaderSource(sh,src);g.compileShader(sh);if(!g.getShaderParameter(sh,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(sh));return sh}
const program=g.createProgram();g.attachShader(program,shader(g.VERTEX_SHADER,V));g.attachShader(program,shader(g.FRAGMENT_SHADER,F));g.linkProgram(program);if(!g.getProgramParameter(program,g.LINK_STATUS))throw Error(g.getProgramInfoLog(program));g.useProgram(program);
const buffer=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,buffer);g.bufferData(g.ARRAY_BUFFER,packed,g.STATIC_DRAW);
const bytes=packed.BYTES_PER_ELEMENT*packed.length;
for(const [loc,size,offset] of [[0,3,0],[1,1,3],[2,1,4],[3,1,5],[4,1,6]]){g.enableVertexAttribArray(loc);g.vertexAttribPointer(loc,size,g.FLOAT,false,stride*4,offset*4)}
const U={};for(const n of ['uMouse','uTime','uAspect','uVisibility','uGesture','uBreakup','uPointScale','uEyes','uCore','uVoice','uTint','uAccent'])U[n]=g.getUniformLocation(program,n);
g.uniform3fv(U.uTint,tint);g.uniform3fv(U.uAccent,accent);
g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE);g.disable(g.DEPTH_TEST);
const qualityLevels=[.5,.68,.82,1.0];let quality=2,renderScale=qualityLevels[quality],drawCount=full,ema=16,streak=0,last=performance.now(),raf=0,hidden=false;
const mouse={x:.5,y:.5};let state=${JSON.stringify(initialState)},profile=profiles[state]||profiles.idle;
let bodyBufferBuilds=1,deltaUpdates=0;
function applyStateDelta(name){state=name;profile=profiles[name]||profiles.idle;deltaUpdates++;document.querySelector('#s').textContent='STATE: '+state.toUpperCase()+' · BODY BUILDS: '+bodyBufferBuilds+' · DELTAS: '+deltaUpdates}
function setQuality(q){quality=Math.max(0,Math.min(3,q));renderScale=qualityLevels[quality];drawCount=quality===0?essential:(quality===1?medium:full);resize()}
function resize(){const dpr=Math.min(window.devicePixelRatio||1,1.2);c.width=Math.max(320,Math.floor(innerWidth*dpr*renderScale));c.height=Math.max(240,Math.floor(innerHeight*dpr*renderScale));g.viewport(0,0,c.width,c.height)}
addEventListener('resize',resize);
addEventListener('pointermove',e=>{mouse.x=e.clientX/innerWidth;mouse.y=1-e.clientY/innerHeight});
const states=['idle','listen','speak','think','alert'];c.addEventListener('click',()=>applyStateDelta(states[(states.indexOf(state)+1)%states.length]));
addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();applyStateDelta(state==='collapse'?'materialize':'collapse')}if(e.key.toLowerCase()==='q')setQuality((quality+1)%4)});
document.addEventListener('visibilitychange',()=>{hidden=document.hidden;if(!hidden){last=performance.now();raf=requestAnimationFrame(frame)}else if(raf)cancelAnimationFrame(raf)});
function frame(now){
  if(hidden)return;
  const dt=Math.min(100,now-last);last=now;ema=ema*.94+dt*.06;
  if((Math.floor(now/1500)!==Math.floor((now-dt)/1500))){
    if(ema>22&&quality>0){setQuality(quality-1);streak=0}
    else if(ema<13&&quality<3){streak++;if(streak>=3){setQuality(quality+1);streak=0}}
    else streak=0;
  }
  g.clearColor(.002,.004,.011,1);g.clear(g.COLOR_BUFFER_BIT);
  g.useProgram(program);
  g.uniform2f(U.uMouse,mouse.x,mouse.y);g.uniform1f(U.uTime,now*.001);g.uniform1f(U.uAspect,c.width/c.height);
  g.uniform1f(U.uVisibility,profile.visibility);g.uniform1f(U.uGesture,profile.gesture);g.uniform1f(U.uBreakup,profile.breakup);
  g.uniform1f(U.uEyes,profile.eyes);g.uniform1f(U.uCore,profile.core);g.uniform1f(U.uVoice,profile.voice);
  g.uniform1f(U.uPointScale,Math.max(.8,c.height/700));
  g.drawArrays(g.POINTS,0,drawCount);
  document.querySelector('#p').textContent='Q'+quality+' · '+ema.toFixed(1)+'ms · '+drawCount+'/'+full+' pts · '+Math.round(bytes/1024)+'KB GPU body';
  raf=requestAnimationFrame(frame);
}
resize();applyStateDelta(state);raf=requestAnimationFrame(frame);
console.info('AXM state-native realization',{canonicalHash,workingSetHash,bodyBufferBuilds,bytes,full});
</script>`;

  next.realizations ??= {};
  next.realizations.holographicAiStateNative = {
    mediaType: 'text/html',
    renderer: 'axm.vfx.state-native-points/v0.1',
    derivedFromStateHash: sourceHash,
    workingSet: {
      schema: 'axm.render-working-set/v0.1',
      policy: 'visible-state-native',
      canonicalStateRetained: true,
      derivedGpuDataRebuildable: true,
      bodyBufferBuildPolicy: 'once-per-body-hash',
      behaviorDeltaPolicy: 'uniform-only',
      adaptiveFrameBudget: true,
      visibilityPause: true,
      workingSetHash: working.digest,
      pointCount: working.totalCount,
      essentialPointCount: working.essentialCount,
      mediumPointCount: working.mediumCount,
      modeledBufferBytes: working.modeledBufferBytes,
    },
    content: html,
  };
  next.realizations.holographicAi = next.realizations.holographicAiStateNative;
  return {
    state: next,
    evidence: {
      renderer: 'axm.vfx.state-native-points/v0.1',
      pointCount: working.totalCount,
      modeledBufferBytes: working.modeledBufferBytes,
      bodyBufferBuildPolicy: 'once-per-body-hash',
      behaviorDeltaPolicy: 'uniform-only',
    },
  };
}, 'Realize the canonical holographic AI as a reusable state-native GPU point working set with uniform-only behavior deltas and adaptive frame budget.');

export const HOLOGRAPHIC_AI_STATE_NATIVE_HANDS = [
  aiAnatomyHand,
  emitterFieldHand,
  projectionParticlesHand,
  scanVolumeHand,
  breakupFieldHand,
  aiFragmentHand,
  aiBehaviorHand,
  projectionMotionHand,
  aiStateNativeWebglHand,
];

export const HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.holographic-ai-entity-state-native',
  version: '0.1.0',
  stages: [
    { id: 'anatomy', hand: 'fx.hologram.ai-anatomy', params: {} },
    { id: 'emitter', hand: 'fx.hologram.emitter-field', params: { originY: -0.98, coneHeight: 1.7, coneWidth: 0.72, floorRingRadius: 0.34, intensity: 0.9 } },
    { id: 'projection-motes', hand: 'fx.hologram.projection-particles', params: { count: 68 } },
    { id: 'scan-depth', hand: 'fx.hologram.scan-volume', params: { planes: 7, speed: 0.22, thickness: 0.032 } },
    { id: 'signal-breakup', hand: 'fx.hologram.breakup-volume', params: { bands: 10, strength: 0.32 } },
    { id: 'body-fragments', hand: 'fx.hologram.ai-fragments', params: { count: 44 } },
    { id: 'semantic-behavior', hand: 'fx.hologram.ai-behavior', params: {} },
    { id: 'projection-motion', hand: 'fx.hologram.projection-motion', params: { revealMs: 1550, collapseMs: 950, idlePeriodMs: 5100, floatAmplitude: 0.03, yawAmplitude: 0.06, shimmer: 0.22 } },
    { id: 'realize-ai-state-native', hand: 'fx.hologram.ai-state-native-webgl', params: {} },
  ],
});

export { makeHolographicAiInitialState };
