import { deepClone, hashValue } from './hand-runtime.mjs';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)));
const round6=(v)=>Number(Number(v).toFixed(6));
function mulberry32(seed){let a=seed>>>0;return()=>{a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
function hand(id,execute,description){return Object.freeze({schema:'axm.hand/v0.1',id,version:'0.2.0',deterministic:true,callerNeutral:true,network:'forbidden',description,execute})}
function canonicalProjectionState(state){return {effect:state.effect,volume:state.volume,emitter:state.emitter,fields:state.fields,particles:state.particles,motion:state.motion}}

export const projectionVolumeHand=hand('fx.hologram.volume',(state,params)=>{
  const next=deepClone(state);
  next.volume={
    shape:'rounded-box-projection',
    halfExtents:[round6(clamp(params.width??0.93,0.4,1.4)),round6(clamp(params.height??0.54,0.25,0.9)),round6(clamp(params.depth??0.14,0.05,0.45))],
    cornerRadius:round6(clamp(params.cornerRadius??0.055,0.01,0.18)),
    floatHeight:round6(clamp(params.floatHeight??0.08,-0.4,0.5)),
    yaw:round6(clamp(params.yaw??-0.09,-0.8,0.8)),
    pitch:round6(clamp(params.pitch??0.06,-0.6,0.6)),
  };
  return {state:next,evidence:{shape:next.volume.shape,halfExtents:next.volume.halfExtents}};
},'Define a renderer-neutral 3D hologram projection volume rather than a flat panel.');

export const emitterFieldHand=hand('fx.hologram.emitter-field',(state,params)=>{
  const next=deepClone(state);
  next.emitter={
    origin:[0,round6(clamp(params.originY??-0.92,-1.4,-0.4)),0],
    coneHeight:round6(clamp(params.coneHeight??1.45,0.5,2.4)),
    coneWidth:round6(clamp(params.coneWidth??0.68,0.15,1.4)),
    floorRingRadius:round6(clamp(params.floorRingRadius??0.34,0.08,0.75)),
    intensity:round6(clamp(params.intensity??0.9,0,2.5)),
  };
  return {state:next,evidence:{emitter:next.emitter}};
},'Define projector cone, source ring, and light-spill intent as editable state.');

export const projectionParticlesHand=hand('fx.hologram.projection-particles',(state,params)=>{
  const next=deepClone(state);const count=Math.round(clamp(params.count??72,12,180));const rand=mulberry32((next.effect.seed??1)^0x48A10F2D);
  next.particles=Array.from({length:count},(_,i)=>({id:`mote-${i+1}`,x:round6(rand()*2-1),y:round6(rand()*2-1),z:round6(rand()*2-1),size:round6(0.35+rand()*1.8),phase:round6(rand()),speed:round6(0.28+rand()*0.95),intensity:round6(0.18+rand()*0.82)}));
  return {state:next,evidence:{count}};
},'Create a deterministic 3D projection-mote cloud used by volumetric realizers.');

export const scanVolumeHand=hand('fx.hologram.scan-volume',(state,params)=>{
  const next=deepClone(state);const rand=mulberry32((next.effect.seed??1)^0x5CA77E12);const planes=Math.round(clamp(params.planes??7,2,18));
  next.fields??={};next.fields.scan={speed:round6(clamp(params.speed??0.24,0.02,1.4)),thickness:round6(clamp(params.thickness??0.035,0.005,0.14)),planes:Array.from({length:planes},(_,i)=>({id:`scan-plane-${i+1}`,offset:round6(rand()),phase:round6(rand()),strength:round6(0.24+rand()*0.76)}))};
  return {state:next,evidence:{planes}};
},'Create animated scan planes through projection depth, not screen-space scanline decoration.');

export const breakupFieldHand=hand('fx.hologram.breakup-volume',(state,params)=>{
  const next=deepClone(state);const rand=mulberry32((next.effect.seed??1)^0xB2EA4C31);const bands=Math.round(clamp(params.bands??11,3,30));
  next.fields??={};next.fields.breakup={strength:round6(clamp(params.strength??0.34,0,1)),bands:Array.from({length:bands},(_,i)=>({id:`break-${i+1}`,y:round6(rand()*2-1),thickness:round6(0.015+rand()*0.08),phase:round6(rand()),shift:round6((rand()*2-1)*0.16),rate:round6(0.3+rand()*1.5)}))};
  return {state:next,evidence:{bands,strength:next.fields.breakup.strength}};
},'Build deterministic depth-aware signal breakup bands that can displace projection slices.');

export const projectionMotionHand=hand('fx.hologram.projection-motion',(state,params)=>{
  const next=deepClone(state);
  next.motion={
    revealMs:Math.round(clamp(params.revealMs??1750,400,6000)),collapseMs:Math.round(clamp(params.collapseMs??1150,250,5000)),idlePeriodMs:Math.round(clamp(params.idlePeriodMs??5200,1000,16000)),
    reveal:[{t:0,visibility:0,coherence:0,beam:0.08},{t:0.18,visibility:0.12,coherence:0.16,beam:1},{t:0.52,visibility:0.68,coherence:0.54,beam:0.92},{t:0.82,visibility:0.94,coherence:0.88,beam:0.62},{t:1,visibility:1,coherence:1,beam:0.38}],
    collapse:[{t:0,visibility:1,coherence:1,beam:0.38},{t:0.55,visibility:0.74,coherence:0.35,beam:0.88},{t:0.85,visibility:0.16,coherence:0.08,beam:1},{t:1,visibility:0,coherence:0,beam:0.04}],
    idle:{floatAmplitude:round6(clamp(params.floatAmplitude??0.035,0,0.2)),yawAmplitude:round6(clamp(params.yawAmplitude??0.075,0,0.35)),shimmer:round6(clamp(params.shimmer??0.23,0,1))},
  };
  return {state:next,evidence:{revealMs:next.motion.revealMs,collapseMs:next.motion.collapseMs}};
},'Define materialize, stable floating, focus, and collapse motion envelopes for projection state.');

function shaderFloat(v){return Number(v).toFixed(6)}
export const webglProjectionHand=hand('fx.hologram.webgl-projection',(state)=>{
  const next=deepClone(state);if(!next.volume||!next.emitter||!next.fields?.scan||!next.fields?.breakup)throw new Error('webgl-projection requires volume, emitter, scan, and breakup state');
  const sourceHash=hashValue(canonicalProjectionState(next));
  const tint=next.effect.tint??[0.18,0.94,1.0];const accent=next.effect.accent??[0.48,0.28,1.0];const ext=next.volume.halfExtents;
  const particleSeed=(next.effect.seed??1)>>>0;
  const frag=`#version 300 es\nprecision highp float;\nout vec4 O;\nuniform vec2 R;uniform float T;uniform vec2 M;uniform float U;uniform float F;\n#define PI 3.14159265359\nfloat hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\nfloat hash31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}\nmat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}\nfloat sdRoundBox(vec3 p,vec3 b,float r){vec3 q=abs(p)-b+r;return length(max(q,0.))-r+min(max(q.x,max(q.y,q.z)),0.);}\nfloat mapS(vec3 p,float time){p.y-=sin(time*.72)*${shaderFloat(next.motion.idle.floatAmplitude)};p.xz*=rot(${shaderFloat(next.volume.yaw)}+sin(time*.43)*${shaderFloat(next.motion.idle.yawAmplitude)}+(M.x-.5)*.14);p.yz*=rot(${shaderFloat(next.volume.pitch)}+(M.y-.5)*-.10);float d=sdRoundBox(p,vec3(${shaderFloat(ext[0])},${shaderFloat(ext[1])},${shaderFloat(ext[2])}),${shaderFloat(next.volume.cornerRadius)});float gy=floor((p.y+1.2)*13.0);float glitch=step(.93,hash21(vec2(gy,floor(time*9.))))*(hash21(vec2(gy,17.))-0.5)*.10*F;p.x+=glitch;return sdRoundBox(p,vec3(${shaderFloat(ext[0])},${shaderFloat(ext[1])},${shaderFloat(ext[2])}),${shaderFloat(next.volume.cornerRadius)});}\nvec3 normalAt(vec3 p,float t){vec2 e=vec2(.002,0);return normalize(vec3(mapS(p+e.xyy,t)-mapS(p-e.xyy,t),mapS(p+e.yxy,t)-mapS(p-e.yxy,t),mapS(p+e.yyx,t)-mapS(p-e.yyx,t)));}\nfloat line(float x,float w){return 1.-smoothstep(w,w*2.,abs(x));}\nvec3 projectPattern(vec3 p,float time){vec2 q=p.xy;float grid=(line(fract(q.x*9.)-.5,.035)+line(fract(q.y*9.)-.5,.035))*.14;float r=length(q*vec2(1.,1.55));float ring=line(r-.31,.009)+line(r-.19,.006);float sweep=pow(max(0.,1.-abs(q.y-(sin(time*.6)*.35))/.045),3.);float glyph=line(abs(q.x)-.42,.012)*step(abs(q.y),.31)+line(abs(q.y)-.31,.012)*step(abs(q.x),.42);return vec3(grid+ring*.75+sweep*.85+glyph*.45);}\nvoid main(){vec2 uv=(gl_FragCoord.xy*2.-R)/R.y;float time=T;vec3 ro=vec3(0.,0.,2.9);vec3 rd=normalize(vec3(uv,-2.05));rd.xz*=rot((M.x-.5)*.08);rd.yz*=rot((M.y-.5)*-.07);float t=0.;float glow=0.;float hit=0.;vec3 hp=vec3(0.);for(int i=0;i<74;i++){vec3 p=ro+rd*t;float d=mapS(p,time);glow+=exp(-abs(d)*19.)*.018*U;if(abs(d)<.0015){hit=1.;hp=p;break;}t+=clamp(abs(d)*.72,.008,.095);if(t>6.)break;}vec3 c=vec3(0.004,0.008,0.018);vec3 tint=vec3(${shaderFloat(tint[0])},${shaderFloat(tint[1])},${shaderFloat(tint[2])});vec3 accent=vec3(${shaderFloat(accent[0])},${shaderFloat(accent[1])},${shaderFloat(accent[2])});\nfloat cone=max(0.,1.-abs(uv.x)/max(.001,(uv.y+1.18)*.62+.10))*smoothstep(-1.14,-.05,uv.y)*smoothstep(.72,-.08,uv.y);cone*=.13+.12*sin(time*2.1+uv.y*15.);c+=tint*cone*${shaderFloat(next.emitter.intensity)}*(.28+.72*U);float ring=line(length(vec2(uv.x,(uv.y+1.04)*1.8))-.37,.015);c+=mix(tint,accent,.25)*ring*(.18+.55*U);\nif(hit>0.){vec3 n=normalAt(hp,time);float fres=pow(1.-max(0.,dot(n,-rd)),2.1);float edge=pow(clamp(max(abs(hp.x)/${shaderFloat(ext[0])},abs(hp.y)/${shaderFloat(ext[1])}),0.,1.),7.);float scan=.5+.5*sin((hp.y+hp.z*.7)*86.-time*10.);scan=pow(scan,12.)*(.25+.75*U);float reveal=smoothstep(-${shaderFloat(ext[1])},${shaderFloat(ext[1])},hp.y+${shaderFloat(ext[1])});float clip=smoothstep(U-.12,U+.025,reveal);float breakup=step(.78,hash21(vec2(floor((hp.y+1.)*18.),floor(time*11.))))*F;vec3 pat=projectPattern(hp,time);float body=(.08+fres*.42+edge*1.3+scan*.95+pat.r)*clip*(1.-breakup*.72);c+=tint*body*U;c+=accent*fres*.18*U;}c+=tint*glow*(.28+.72*U);\nfor(int i=0;i<10;i++){float fi=float(i);vec2 cell=floor((uv+vec2(fi*.17,time*.065))*vec2(7.,5.));float h=hash21(cell+fi+${shaderFloat((particleSeed%997)/997)});vec2 fp=fract((uv+vec2(fi*.071,time*.025*(.5+h)))*vec2(7.,5.))-.5;float mote=smoothstep(.095,.0,length(fp))*step(.82,h);c+=mix(tint,accent,h)*mote*(.05+.16*U);}\nfloat scanWave=pow(max(0.,1.-abs(uv.y-(fract(time*.115)*2.-1.1))/.035),4.);c+=tint*scanWave*.18*U;float vign=smoothstep(1.45,.35,length(uv));c*=vign;c=1.-exp(-c*1.7);O=vec4(c,1.);}`;
  const vert=`#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0,1);}`;
  const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AXM Volumetric Hologram v0.2</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#02040a}canvas{width:100%;height:100%;display:block;cursor:pointer}.tag{position:fixed;left:18px;bottom:14px;font:11px/1.4 ui-monospace,monospace;color:#8ffbff99;letter-spacing:.14em;pointer-events:none}.hint{position:fixed;right:18px;bottom:14px;font:11px ui-monospace,monospace;color:#8ffbff66;pointer-events:none}</style><canvas id="c"></canvas><div class="tag">AXM // VOLUMETRIC PROJECTION</div><div class="hint">move = parallax · click = collapse/materialize</div><script type="module">const c=document.querySelector('#c'),g=c.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});if(!g)document.body.innerHTML='<pre style="color:white">WebGL2 required</pre>';const V=${JSON.stringify(vert)},F=${JSON.stringify(frag)};function sh(t,s){const x=g.createShader(t);g.shaderSource(x,s);g.compileShader(x);if(!g.getShaderParameter(x,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(x));return x}const P=g.createProgram();g.attachShader(P,sh(g.VERTEX_SHADER,V));g.attachShader(P,sh(g.FRAGMENT_SHADER,F));g.linkProgram(P);if(!g.getProgramParameter(P,g.LINK_STATUS))throw Error(g.getProgramInfoLog(P));g.useProgram(P);const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),g.STATIC_DRAW);const a=g.getAttribLocation(P,'p');g.enableVertexAttribArray(a);g.vertexAttribPointer(a,2,g.FLOAT,false,0,0);const uR=g.getUniformLocation(P,'R'),uT=g.getUniformLocation(P,'T'),uM=g.getUniformLocation(P,'M'),uU=g.getUniformLocation(P,'U'),uF=g.getUniformLocation(P,'F');let mouse=[.5,.5],target=1,level=0,start=performance.now(),last=start;addEventListener('pointermove',e=>{mouse=[e.clientX/innerWidth,1-e.clientY/innerHeight]});addEventListener('click',()=>target=target>.5?0:1);function rs(){const d=Math.min(devicePixelRatio||1,2);c.width=Math.floor(innerWidth*d);c.height=Math.floor(innerHeight*d);g.viewport(0,0,c.width,c.height)}addEventListener('resize',rs);rs();function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;const k=target?2.0:3.2;level+=(target-level)*(1-Math.exp(-dt*k));const focus=Math.min(1,Math.hypot(mouse[0]-.5,mouse[1]-.5)*1.5);g.uniform2f(uR,c.width,c.height);g.uniform1f(uT,(now-start)/1000);g.uniform2f(uM,mouse[0],mouse[1]);g.uniform1f(uU,level);g.uniform1f(uF,.25+.65*(1-level)+focus*.18);g.drawArrays(g.TRIANGLES,0,3);requestAnimationFrame(frame)}setTimeout(()=>{target=1},260);requestAnimationFrame(frame)</script><!-- canonical-source-hash:${sourceHash} -->`;
  next.realizations??={};next.realizations.webgl={mediaType:'text/html',renderer:'webgl2-fragment-projection',derivedFromStateHash:sourceHash,content:html};
  return {state:next,evidence:{bytes:Buffer.byteLength(html),renderer:'webgl2',sourceHash}};
},'Realize canonical projection state as an animated WebGL2 spatial hologram with volume, projection beam, parallax, scan waves, motes, breakup, and materialization/collapse.');

export const VOLUMETRIC_HOLOGRAM_HANDS=[projectionVolumeHand,emitterFieldHand,projectionParticlesHand,scanVolumeHand,breakupFieldHand,projectionMotionHand,webglProjectionHand];
export const VOLUMETRIC_HOLOGRAM_GRAPH=Object.freeze({schema:'axm.hand-graph/v0.1',id:'fx.volumetric-hologram-projection',version:'0.2.0',stages:[
  {id:'projection-volume',hand:'fx.hologram.volume',params:{}},{id:'emitter',hand:'fx.hologram.emitter-field',params:{}},{id:'mote-cloud',hand:'fx.hologram.projection-particles',params:{count:72}},{id:'scan-volume',hand:'fx.hologram.scan-volume',params:{planes:7}},{id:'breakup-volume',hand:'fx.hologram.breakup-volume',params:{bands:11,strength:.34}},{id:'motion',hand:'fx.hologram.projection-motion',params:{}},{id:'webgl',hand:'fx.hologram.webgl-projection',params:{}}
]});
export function makeVolumetricHologramInitialState(seed=20260915){return {schema:'axm.effect-work-state/v0.1',effect:{kind:'volumetric-hologram-projection',seed,tint:[0.18,0.94,1.0],accent:[0.48,0.28,1.0]},volume:null,emitter:null,fields:{},particles:[],motion:null,realizations:{}}}
