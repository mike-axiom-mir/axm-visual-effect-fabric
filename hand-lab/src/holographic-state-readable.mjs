import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  normalizeFormHand,
  sampleFormHand,
  creativeFieldHand,
  makeHolographicFormState,
  makeAiForm,
  makeGlobeForm,
  makeRoverForm,
} from './holographic-state-projector.mjs';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)));
const round6=v=>Number(Number(v).toFixed(6));
function hand(id,execute,description){return Object.freeze({schema:'axm.hand/v0.1',id,version:'0.3.0',deterministic:true,callerNeutral:true,network:'forbidden',description,execute})}

function boundsOf(points){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<points.length;i+=7){for(let a=0;a<3;a++){const v=Number(points[i+a]);if(!Number.isFinite(v))throw new Error('visibility-fit encountered non-finite point');min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v)}}
  const center=min.map((v,i)=>round6((v+max[i])/2));
  const span=min.map((v,i)=>round6(Math.max(1e-6,max[i]-v)));
  return{min:min.map(round6),max:max.map(round6),center,span};
}

export const visibilityFitHand=hand('fx.hologram.visibility-fit',(state,params)=>{
  const next=deepClone(state);if(!next.sampleField?.points?.length)throw new Error('visibility-fit requires sampleField points');
  const b=boundsOf(next.sampleField.points),largest=Math.max(b.span[0],b.span[1],b.span[2]*.72,1e-4),pointCount=next.sampleField.pointCount??next.sampleField.points.length/7;
  const target=clamp(params.targetFill??1.48,.9,1.72),fitScale=round6(target/largest);
  const density=Math.max(1,pointCount)/(Math.max(.01,b.span[0]*b.span[1]+b.span[1]*b.span[2]+b.span[0]*b.span[2]));
  const pointBoost=round6(clamp(params.pointBoost??(pointCount<1100?2.45:pointCount<2600?2.0:1.65),1.2,3.5));
  const exposure=round6(clamp(params.exposure??(pointCount<1400?2.25:1.9),1,3.2));
  next.visibility={schema:'axm.holographic-visibility/v0.1',bounds:b,fitScale,pointBoost,exposure,targetFill:target,density:round6(density),mobileLegibility:true,twoPassGlow:true};
  return{state:next,evidence:{pointCount,fitScale,pointBoost,exposure,bounds:b}};
},'Measure the derived holographic working set and attach viewport-fit, exposure, and point-size intent without changing canonical form state.');

export const readableProjectionStateHand=hand('fx.hologram.readable-projection-state',(state,params)=>{
  const next=deepClone(state);next.projection={schema:'axm.holographic-projection-state/v0.2',floatAmplitude:clamp(params.floatAmplitude??.018,0,.15),yawAmplitude:clamp(params.yawAmplitude??.055,0,.35),breakup:clamp(params.breakup??.11,0,.7),pointScale:clamp(params.pointScale??1,.5,2.5),depthBrightness:clamp(params.depthBrightness??.28,0,.8)};return{state:next,evidence:{projection:next.projection}};
},'Attach restrained motion and depth-lighting intent for a legible holographic projection.');

export const readableStateProjectorHand=hand('fx.hologram.state-projector-readable-webgl',(state)=>{
  const next=deepClone(state);if(!next.sampleField||!next.visibility||!next.projection)throw new Error('readable projector requires sampleField, visibility, projection');
  const pts=next.sampleField.points,vis=next.visibility,pr=next.projection,tint=next.effect?.tint??[.16,.9,1],accent=next.effect?.accent??[.58,.3,1];
  const sourceHash=hashValue({form:next.form,sampleField:next.sampleField,visibility:vis,projection:pr});
  const vert=`#version 300 es\nprecision highp float;layout(location=0)in vec3 aPos;layout(location=1)in float aSize;layout(location=2)in float aRole;layout(location=3)in float aPhase;layout(location=4)in float aIntensity;uniform vec2 M;uniform float T;uniform float A;uniform float P;uniform float L;out float I;out float R;out float Z;out float PH;void main(){vec3 p=(aPos-vec3(${vis.bounds.center.join(',')}))*${vis.fitScale.toFixed(6)};p.y+=sin(T*.72+aPhase*6.283)*${pr.floatAmplitude.toFixed(6)};float yaw=sin(T*.28)*${pr.yawAmplitude.toFixed(6)}+(M.x-.5)*.16;float c=cos(yaw),s=sin(yaw);p.xz=mat2(c,-s,s,c)*p.xz;float band=floor((p.y+1.6)*17.);float g=step(.965,fract(sin(band*19.17+floor(T*7.))*43758.5453))*${pr.breakup.toFixed(6)};p.x+=(fract(sin(band*9.7+aPhase*29.)*24634.634)-.5)*.035*g;float persp=1.0/(1.0+p.z*.10);vec2 q=p.xy*persp;q.x/=max(.68,A);gl_Position=vec4(q,0,1);float layer=L<.5?2.35:1.0;gl_PointSize=max(L<.5?2.2:1.35,aSize*P*${vis.pointBoost.toFixed(6)}*layer*(1.0+max(0.,-p.z)*.18));I=aIntensity*(1.-g*.55);R=aRole;Z=p.z;PH=aPhase;} `;
  const frag=`#version 300 es\nprecision highp float;out vec4 O;uniform float T;uniform float L;uniform float X;uniform vec3 C;uniform vec3 D;in float I;in float R;in float Z;in float PH;void main(){vec2 q=gl_PointCoord-.5;float r=length(q);if(r>.5)discard;float core=smoothstep(.5,0.,r);float soft=pow(core,L<.5?2.0:.78);float depth=clamp(1.0-Z*${pr.depthBrightness.toFixed(6)},.72,1.42);float shimmer=.88+.12*sin(T*1.9+PH*6.283+Z*9.);vec3 col=mix(C,D,clamp(R*.085,0.,.58));float gain=L<.5?.30:1.18;float a=soft*I*shimmer*depth*X*gain;O=vec4(col*a,a);} `;
  const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>AXM Readable Holographic State Projector</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#010309}canvas{width:100%;height:100%;display:block;touch-action:none}.tag{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));font:10px ui-monospace,monospace;color:#a8fbffbb;letter-spacing:.1em;text-shadow:0 0 10px #32dfff88}.meter{position:fixed;right:12px;bottom:max(12px,env(safe-area-inset-bottom));font:9px ui-monospace,monospace;color:#7bdbe988}</style><canvas id="c"></canvas><div class="tag">AXM // READABLE HOLOGRAPHIC STATE // ${next.form?.id??'external-field'}</div><div class="meter">AUTO-FIT · ${next.sampleField.pointCount} pts</div><script type="module">const data=new Float32Array(${JSON.stringify(pts)}),c=document.querySelector('#c'),g=c.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});if(!g)throw Error('WebGL2 required');const V=${JSON.stringify(vert)},F=${JSON.stringify(frag)};function sh(t,s){const x=g.createShader(t);g.shaderSource(x,s);g.compileShader(x);if(!g.getShaderParameter(x,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(x));return x}const p=g.createProgram();g.attachShader(p,sh(g.VERTEX_SHADER,V));g.attachShader(p,sh(g.FRAGMENT_SHADER,F));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));g.useProgram(p);const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,data,g.STATIC_DRAW);for(const [l,n,o]of[[0,3,0],[1,1,3],[2,1,4],[3,1,5],[4,1,6]]){g.enableVertexAttribArray(l);g.vertexAttribPointer(l,n,g.FLOAT,false,28,o*4)}const U={};for(const n of['M','T','A','P','L','X','C','D'])U[n]=g.getUniformLocation(p,n);g.uniform3fv(U.C,new Float32Array(${JSON.stringify(tint)}));g.uniform3fv(U.D,new Float32Array(${JSON.stringify(accent)}));g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE);let m={x:.5,y:.5};addEventListener('pointermove',e=>{m.x=e.clientX/innerWidth;m.y=1-e.clientY/innerHeight},{passive:true});addEventListener('touchmove',e=>{const t=e.touches[0];if(t){m.x=t.clientX/innerWidth;m.y=1-t.clientY/innerHeight}},{passive:true});function resize(){const d=Math.min(devicePixelRatio||1,1.35);c.width=Math.max(320,Math.floor(innerWidth*d*.9));c.height=Math.max(320,Math.floor(innerHeight*d*.9));g.viewport(0,0,c.width,c.height)}addEventListener('resize',resize);resize();let hidden=false;document.addEventListener('visibilitychange',()=>hidden=document.hidden);function frame(t){if(!hidden){g.clearColor(.001,.003,.009,1);g.clear(g.COLOR_BUFFER_BIT);g.useProgram(p);g.uniform2f(U.M,m.x,m.y);g.uniform1f(U.T,t*.001);g.uniform1f(U.A,c.width/c.height);g.uniform1f(U.P,Math.max(1.0,c.height/760)*${pr.pointScale.toFixed(6)});g.uniform1f(U.X,${vis.exposure.toFixed(6)});g.uniform1f(U.L,0);g.drawArrays(g.POINTS,0,${next.sampleField.pointCount});g.uniform1f(U.L,1);g.drawArrays(g.POINTS,0,${next.sampleField.pointCount})}requestAnimationFrame(frame)}requestAnimationFrame(frame);</script>`;
  next.realizations??={};next.realizations.holographicStateReadable={mediaType:'text/html',renderer:'axm.vfx.holographic-state-readable/v0.3',derivedFromStateHash:sourceHash,canonicalFormHash:next.sampleField.canonicalFormHash,sampleFieldHash:hashValue(next.sampleField),pointCount:next.sampleField.pointCount,visibility:deepClone(vis),content:html};
  return{state:next,evidence:{renderer:'axm.vfx.holographic-state-readable/v0.3',pointCount:next.sampleField.pointCount,fitScale:vis.fitScale,exposure:vis.exposure,pointBoost:vis.pointBoost}};
},'Render a canonical or admitted sample field with automatic framing, mobile-readable exposure, depth brightness, and two-pass point glow.');

export const HOLOGRAPHIC_STATE_READABLE_HANDS=[normalizeFormHand,sampleFormHand,creativeFieldHand,visibilityFitHand,readableProjectionStateHand,readableStateProjectorHand];
export const HOLOGRAPHIC_STATE_READABLE_GRAPH=Object.freeze({schema:'axm.hand-graph/v0.1',id:'fx.holographic-state-projector-readable',version:'0.3.0',stages:[{id:'normalize-form',hand:'fx.hologram.form-normalize',params:{}},{id:'sample-form',hand:'fx.hologram.form-sample',params:{}},{id:'creative-field',hand:'fx.hologram.creative-field',params:{}},{id:'visibility-fit',hand:'fx.hologram.visibility-fit',params:{targetFill:1.48}},{id:'projection-state',hand:'fx.hologram.readable-projection-state',params:{floatAmplitude:.018,yawAmplitude:.055,breakup:.11,pointScale:1,depthBrightness:.28}},{id:'realize-readable',hand:'fx.hologram.state-projector-readable-webgl',params:{}}]});

export {makeHolographicFormState,makeAiForm,makeGlobeForm,makeRoverForm};
