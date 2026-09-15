import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  emitterFieldHand,
  projectionParticlesHand,
  scanVolumeHand,
  breakupFieldHand,
  projectionMotionHand,
} from './volumetric-hologram-hands.mjs';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)));
const round6=(v)=>Number(Number(v).toFixed(6));
function mulberry32(seed){let a=seed>>>0;return()=>{a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
function hand(id,execute,description){return Object.freeze({schema:'axm.hand/v0.1',id,version:'0.1.0',deterministic:true,callerNeutral:true,network:'forbidden',description,execute})}
function canonicalAiState(state){return {effect:state.effect,ai:state.ai,emitter:state.emitter,fields:state.fields,particles:state.particles,motion:state.motion}}

export const aiAnatomyHand=hand('fx.hologram.ai-anatomy',(state,params)=>{
  const next=deepClone(state);const rand=mulberry32((next.effect.seed??1)^0xA17E51D);
  next.ai={
    schema:'axm.holographic-ai-body/v0.1',
    identity:'original-guide-01',
    designOrigin:'procedural-self-made',
    silhouette:'asymmetric-raised-hand-guide',
    head:{center:[0,0.57,0],radius:round6(clamp(params.headRadius??0.155,0.11,0.22)),scale:[0.84,1.0,0.82],tilt:round6((rand()*2-1)*0.055)},
    torso:{center:[0,0.12,0],scale:[0.245,0.34,0.12],shoulderWidth:0.29,waistWidth:0.17},
    pelvis:{center:[0,-0.22,0],scale:[0.205,0.16,0.115]},
    arms:{
      left:[[-0.22,0.25,0.00],[-0.36,0.01,0.025],[-0.31,-0.29,0.04]],
      right:[[0.22,0.24,0.00],[0.38,0.39,0.03],[0.31,0.61,0.055]],
    },
    hands:{left:[-0.31,-0.31,0.04],right:[0.30,0.64,0.06]},
    legs:{left:[[-0.11,-0.31,0],[-0.14,-0.58,0.01],[-0.10,-0.78,0.02]],right:[[0.11,-0.31,0],[0.15,-0.58,-0.01],[0.10,-0.78,0.02]]},
    core:{center:[0,0.15,0.105],radius:0.052},
    halo:{center:[0,0.59,-0.03],major:0.235,minor:0.009,tilt:round6(-0.28+rand()*0.18)},
    face:{sensorY:0.595,sensorSpacing:0.055,sensorRadius:0.014},
  };
  return {state:next,evidence:{identity:next.ai.identity,silhouette:next.ai.silhouette}};
},'Build an original procedural humanoid holographic AI anatomy with a distinct raised-hand silhouette.');

export const aiFragmentHand=hand('fx.hologram.ai-fragments',(state,params)=>{
  const next=deepClone(state);if(!next.ai)throw new Error('ai-fragments requires ai anatomy');
  const rand=mulberry32((next.effect.seed??1)^0xF12A6E7);const count=Math.round(clamp(params.count??46,16,96));
  next.ai.fragments=Array.from({length:count},(_,i)=>({
    id:`fragment-${i+1}`,
    anchor:[round6((rand()*2-1)*0.34),round6(-0.12-rand()*0.72),round6((rand()*2-1)*0.16)],
    size:[round6(0.012+rand()*0.045),round6(0.018+rand()*0.075)],
    phase:round6(rand()),
    drift:round6(0.04+rand()*0.16),
    intensity:round6(0.25+rand()*0.75),
  }));
  return {state:next,evidence:{fragments:count}};
},'Create editable lower-body projection shards for hologram breakup and materialization.');

const PROFILES=Object.freeze({
  dormant:{visibility:0.02,coherence:0.05,eyes:0.0,core:0.08,voice:0.0,gesture:0.0,breakup:0.1},
  materialize:{visibility:0.78,coherence:0.62,eyes:0.9,core:0.85,voice:0.0,gesture:0.4,breakup:0.65},
  idle:{visibility:1.0,coherence:0.93,eyes:0.72,core:0.62,voice:0.0,gesture:0.18,breakup:0.18},
  listen:{visibility:1.0,coherence:0.98,eyes:1.0,core:0.82,voice:0.0,gesture:0.42,breakup:0.12},
  speak:{visibility:1.0,coherence:0.9,eyes:0.88,core:1.0,voice:1.0,gesture:0.58,breakup:0.22},
  think:{visibility:1.0,coherence:0.86,eyes:0.56,core:0.92,voice:0.12,gesture:0.78,breakup:0.28},
  alert:{visibility:1.0,coherence:0.82,eyes:1.25,core:1.2,voice:0.2,gesture:0.7,breakup:0.48},
  collapse:{visibility:0.18,coherence:0.14,eyes:0.12,core:0.35,voice:0.0,gesture:0.0,breakup:1.0},
});

export const aiBehaviorHand=hand('fx.hologram.ai-behavior',(state)=>{
  const next=deepClone(state);const requested=String(next.effect.requestedState??'idle');const profile=PROFILES[requested];
  if(!profile)throw new Error(`Unsupported AI hologram state: ${requested}`);
  next.effect.activeState=requested;next.effect.profile=deepClone(profile);
  next.ai.behavior={
    state:requested,
    headBobHz:requested==='listen'?0.22:0.16,
    breathHz:requested==='speak'?0.62:0.34,
    raisedHandPulse:profile.gesture,
    eyeIntensity:profile.eyes,
    coreIntensity:profile.core,
    voiceActivity:profile.voice,
  };
  return {state:next,evidence:{state:requested,profile}};
},'Map AI semantic state to projection coherence, sensor glow, gesture, and voice-reactive motion.');

function sf(v){return Number(v).toFixed(6)}
export const aiWebglHand=hand('fx.hologram.ai-webgl',(state)=>{
  const next=deepClone(state);if(!next.ai||!next.emitter||!next.fields?.scan||!next.fields?.breakup||!next.motion)throw new Error('ai-webgl requires anatomy and volumetric projection state');
  const sourceHash=hashValue(canonicalAiState(next));
  const tint=next.effect.tint??[0.16,0.88,1.0];const accent=next.effect.accent??[0.55,0.28,1.0];const profile=next.effect.profile??PROFILES.idle;
  const headR=next.ai.head.radius;
  const frag=`#version 300 es\nprecision highp float;out vec4 O;uniform vec2 R;uniform float T;uniform vec2 M;uniform float U;uniform float S;\n#define PI 3.14159265359\nfloat h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\nmat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}\nfloat smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}\nfloat sdSphere(vec3 p,float r){return length(p)-r;}\nfloat sdEllipsoid(vec3 p,vec3 r){float k0=length(p/r),k1=length(p/(r*r));return k0*(k0-1.)/k1;}\nfloat sdCapsule(vec3 p,vec3 a,vec3 b,float r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-r;}\nfloat sdTorus(vec3 p,vec2 t){vec2 q=vec2(length(p.xz)-t.x,p.y);return length(q)-t.y;}\nvec3 bodyP(vec3 p,float time){p.y-=sin(time*${sf(next.ai.behavior.headBobHz*6.28318)})*.018;float yaw=sin(time*.31)*.07+(M.x-.5)*.22;p.xz*=rot(yaw);p.yz*=rot((M.y-.5)*-.10);return p;}\nfloat mapBody(vec3 p,float time){p=bodyP(p,time);float gy=floor((p.y+1.2)*18.);float gl=step(.91,h21(vec2(gy,floor(time*11.))))*(h21(vec2(gy,19.))-.5)*.11*(1.-U);p.x+=gl;float d=99.;\nvec3 hp=p-vec3(0.,.57,0.);hp.xy*=rot(${sf(next.ai.head.tilt)});d=smin(d,sdEllipsoid(hp,vec3(${sf(headR*.84)},${sf(headR)},${sf(headR*.82)})),.04);\nd=smin(d,sdCapsule(p,vec3(0.,.38,0.),vec3(0.,.31,0.),.063),.035);\nd=smin(d,sdEllipsoid(p-vec3(0.,.12,0.),vec3(.245,.34,.12)),.075);\nd=smin(d,sdEllipsoid(p-vec3(0.,-.22,0.),vec3(.205,.16,.115)),.055);\nd=smin(d,sdCapsule(p,vec3(-.22,.25,0.),vec3(-.36,.01,.025),.058),.035);d=smin(d,sdCapsule(p,vec3(-.36,.01,.025),vec3(-.31,-.29,.04),.047),.03);d=smin(d,sdSphere(p-vec3(-.31,-.31,.04),.058),.025);\nvec3 er=vec3(.38,.39,.03);er.x+=sin(time*.7)*.015*${sf(profile.gesture)};d=smin(d,sdCapsule(p,vec3(.22,.24,0.),er,.058),.035);d=smin(d,sdCapsule(p,er,vec3(.31,.61,.055),.046),.03);d=smin(d,sdSphere(p-vec3(.30,.64,.06),.057),.025);\nd=smin(d,sdCapsule(p,vec3(-.11,-.31,0.),vec3(-.14,-.58,.01),.072),.035);d=smin(d,sdCapsule(p,vec3(.11,-.31,0.),vec3(.15,-.58,-.01),.072),.035);d=smin(d,sdCapsule(p,vec3(-.14,-.58,.01),vec3(-.10,-.78,.02),.055),.028);d=smin(d,sdCapsule(p,vec3(.15,-.58,-.01),vec3(.10,-.78,.02),.055),.028);\nvec3 q=p-vec3(0.,.59,-.03);q.yz*=rot(${sf(next.ai.halo.tilt)});d=min(d,sdTorus(q,vec2(.235,.009)));return d;}\nvec3 nrm(vec3 p,float t){vec2 e=vec2(.002,0);return normalize(vec3(mapBody(p+e.xyy,t)-mapBody(p-e.xyy,t),mapBody(p+e.yxy,t)-mapBody(p-e.yxy,t),mapBody(p+e.yyx,t)-mapBody(p-e.yyx,t)));}\nfloat line(float x,float w){return 1.-smoothstep(w,w*2.,abs(x));}\nvoid main(){vec2 uv=(gl_FragCoord.xy*2.-R)/R.y;float time=T;vec3 ro=vec3(0.,0.,2.85);vec3 rd=normalize(vec3(uv,-2.15));rd.xz*=rot((M.x-.5)*.08);rd.yz*=rot((M.y-.5)*-.06);float t=0.,glow=0.,hit=0.;vec3 hp=vec3(0.);for(int i=0;i<92;i++){vec3 p=ro+rd*t;float d=mapBody(p,time);glow+=exp(-abs(d)*22.)*.012*U;if(abs(d)<.0013){hit=1.;hp=p;break;}t+=clamp(abs(d)*.7,.006,.075);if(t>5.5)break;}vec3 c=vec3(.002,.005,.014);vec3 tint=vec3(${sf(tint[0])},${sf(tint[1])},${sf(tint[2])}),accent=vec3(${sf(accent[0])},${sf(accent[1])},${sf(accent[2])});float cone=max(0.,1.-abs(uv.x)/max(.001,(uv.y+1.12)*.6+.08))*smoothstep(-1.12,-.08,uv.y)*smoothstep(.78,-.08,uv.y);c+=tint*cone*.11*(.25+.75*U);float baseRing=line(length(vec2(uv.x,(uv.y+1.02)*1.7))-.34,.013);c+=mix(tint,accent,.25)*baseRing*(.18+.72*U);if(hit>0.){vec3 n=nrm(hp,time),bp=bodyP(hp,time);float fres=pow(1.-max(0.,dot(n,-rd)),2.0);float scan=pow(.5+.5*sin((bp.y+bp.z*.55)*92.-time*12.),14.);float breakup=step(.82,h21(vec2(floor((bp.y+1.1)*22.),floor(time*13.))))*(1.-U*.7);float reveal=smoothstep(-.84,.76,bp.y+.84);float clip=smoothstep(U-.15,U+.035,reveal);float core=exp(-length(bp-vec3(0.,.15,.10))*22.)*${sf(profile.core)};float eyeL=exp(-length((bp-vec3(-.055,.595,.115))*vec3(1.,1.,1.8))*90.)*${sf(profile.eyes)};float eyeR=exp(-length((bp-vec3(.055,.595,.115))*vec3(1.,1.,1.8))*90.)*${sf(profile.eyes)};float voice=${sf(profile.voice)}*(.5+.5*sin(time*9.))*exp(-abs(bp.y-.11)*20.)*.35;float lowerFade=smoothstep(-.82,-.38,bp.y);float body=(.055+fres*.48+scan*.62+core*1.3+(eyeL+eyeR)*1.8+voice)*clip*(1.-breakup*.68)*(mix(.35,1.,lowerFade));c+=tint*body*U;c+=accent*(core*.45+fres*.12)*U;}c+=tint*glow*(.22+.78*U);for(int i=0;i<14;i++){float fi=float(i);vec2 cell=floor((uv+vec2(fi*.073,time*.028*(.7+h21(vec2(fi,7.)))))*vec2(8.,6.));float h=h21(cell+fi);vec2 fp=fract((uv+vec2(fi*.041,time*.018))*vec2(8.,6.))-.5;float mote=smoothstep(.08,.0,length(fp))*step(.79,h);c+=mix(tint,accent,h)*mote*(.04+.17*U);}float orbit=line(length((uv-vec2(0.,.28))*vec2(1.,1.75))-.34,.005);c+=accent*orbit*.12*(.4+.6*sin(time*.8)*.5+.5);float wave=pow(max(0.,1.-abs(uv.y-(fract(time*.12)*2.-1.05))/.032),4.);c+=tint*wave*.16*U;float vign=smoothstep(1.55,.32,length(uv));c*=vign;c=1.-exp(-c*1.8);O=vec4(c,1.);}`;
  const vert=`#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0,1);}`;
  const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AXM Original Holographic AI</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#01030a}canvas{display:block;width:100%;height:100%;cursor:pointer}.tag,.state,.hint{position:fixed;font:11px/1.4 ui-monospace,monospace;letter-spacing:.12em;color:#a7fbff99;pointer-events:none}.tag{left:18px;bottom:14px}.state{left:18px;top:14px}.hint{right:18px;bottom:14px;color:#a7fbff66}</style><canvas id="c"></canvas><div class="tag">AXM // ORIGINAL HOLOGRAPHIC AI</div><div class="state" id="s">STATE: IDLE</div><div class="hint">move = parallax · click = next state · space = collapse/materialize</div><script type="module">const c=document.querySelector('#c'),label=document.querySelector('#s'),g=c.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});if(!g)document.body.innerHTML='<pre style="color:white">WebGL2 required</pre>';const V=${JSON.stringify(vert)},F=${JSON.stringify(frag)};function sh(t,s){const x=g.createShader(t);g.shaderSource(x,s);g.compileShader(x);if(!g.getShaderParameter(x,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(x));return x}const P=g.createProgram();g.attachShader(P,sh(g.VERTEX_SHADER,V));g.attachShader(P,sh(g.FRAGMENT_SHADER,F));g.linkProgram(P);if(!g.getProgramParameter(P,g.LINK_STATUS))throw Error(g.getProgramInfoLog(P));g.useProgram(P);const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),g.STATIC_DRAW);const a=g.getAttribLocation(P,'p');g.enableVertexAttribArray(a);g.vertexAttribPointer(a,2,g.FLOAT,false,0,0);const uR=g.getUniformLocation(P,'R'),uT=g.getUniformLocation(P,'T'),uM=g.getUniformLocation(P,'M'),uU=g.getUniformLocation(P,'U'),uS=g.getUniformLocation(P,'S');let mouse=[.5,.5],coherence=1,target=1,stateIndex=0;const states=['idle','listen','speak','think','alert'];addEventListener('pointermove',e=>{mouse=[e.clientX/innerWidth,1-e.clientY/innerHeight]});addEventListener('click',()=>{stateIndex=(stateIndex+1)%states.length;label.textContent='STATE: '+states[stateIndex].toUpperCase()});addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();target=target>.5?0:1;label.textContent=target?'STATE: MATERIALIZE':'STATE: COLLAPSE'}});function resize(){const d=Math.min(devicePixelRatio,2);c.width=Math.floor(innerWidth*d);c.height=Math.floor(innerHeight*d);g.viewport(0,0,c.width,c.height)}addEventListener('resize',resize);resize();const start=performance.now();function frame(now){const t=(now-start)/1000;coherence+=(target-coherence)*Math.min(1,.055+(target?0.018:0.04));g.uniform2f(uR,c.width,c.height);g.uniform1f(uT,t);g.uniform2f(uM,mouse[0],mouse[1]);g.uniform1f(uU,coherence);g.uniform1f(uS,stateIndex);g.drawArrays(g.TRIANGLES,0,3);requestAnimationFrame(frame)}requestAnimationFrame(frame);</script>`;
  next.realizations??={};next.realizations.holographicAi={mediaType:'text/html',derivedFromStateHash:sourceHash,content:html};
  return {state:next,evidence:{bytes:Buffer.byteLength(html),derivedFromStateHash:sourceHash,renderer:'WebGL2 ray-marched procedural humanoid'}};
},'Realize the original procedural AI body as an animated volumetric WebGL2 hologram.');

export const HOLOGRAPHIC_AI_HANDS=[
  aiAnatomyHand,
  emitterFieldHand,
  projectionParticlesHand,
  scanVolumeHand,
  breakupFieldHand,
  aiFragmentHand,
  aiBehaviorHand,
  projectionMotionHand,
  aiWebglHand,
];

export const HOLOGRAPHIC_AI_GRAPH=Object.freeze({
  schema:'axm.hand-graph/v0.1',id:'fx.holographic-ai-entity',version:'0.1.0',stages:[
    {id:'build-anatomy',hand:'fx.hologram.ai-anatomy',params:{}},
    {id:'projector-field',hand:'fx.hologram.emitter-field',params:{originY:-.94,coneHeight:1.6,coneWidth:.74,intensity:1.05}},
    {id:'projection-motes',hand:'fx.hologram.projection-particles',params:{count:84}},
    {id:'scan-depth',hand:'fx.hologram.scan-volume',params:{planes:8,speed:.28,thickness:.03}},
    {id:'signal-breakup',hand:'fx.hologram.breakup-volume',params:{bands:12,strength:.32}},
    {id:'body-fragments',hand:'fx.hologram.ai-fragments',params:{count:52}},
    {id:'semantic-behavior',hand:'fx.hologram.ai-behavior',params:{}},
    {id:'projection-motion',hand:'fx.hologram.projection-motion',params:{revealMs:1850,collapseMs:1200,idlePeriodMs:5600}},
    {id:'realize-ai',hand:'fx.hologram.ai-webgl',params:{}},
  ],
});

export function makeHolographicAiInitialState(seed=20260915,requestedState='idle'){
  return {schema:'axm.effect-work-state/v0.1',effect:{kind:'holographic-ai-entity',seed,requestedState,tint:[0.16,0.88,1.0],accent:[0.55,0.28,1.0],originalDesign:true},ai:null,fields:{},particles:[],motion:{},realizations:{}};
}
