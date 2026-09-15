import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  normalizeFormHand,
  sampleFormHand,
  creativeFieldHand,
  makeHolographicFormState,
  makeAiForm,
} from './holographic-state-projector.mjs';
import { visibilityFitHand } from './holographic-state-readable.mjs';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)));
function hand(id,execute,description){return Object.freeze({schema:'axm.hand/v0.1',id,version:'0.4.0',deterministic:true,callerNeutral:true,network:'forbidden',description,execute})}

export const shellProjectionStateHand=hand('fx.hologram.shell-projection-state',(state,params)=>{
  const next=deepClone(state);
  next.projection={
    schema:'axm.holographic-projection-state/v0.4',
    floatAmplitude:clamp(params.floatAmplitude??.012,0,.08),
    yawAmplitude:clamp(params.yawAmplitude??.038,0,.2),
    breakup:clamp(params.breakup??.055,0,.35),
    shellOpacity:clamp(params.shellOpacity??.19,.04,.45),
    glowOpacity:clamp(params.glowOpacity??.13,.02,.4),
    sparkleOpacity:clamp(params.sparkleOpacity??.24,0,.5),
    depthTransmission:clamp(params.depthTransmission??.32,0,.8),
  };
  return {state:next,evidence:{projection:next.projection}};
},'Attach restrained shell/glow/sparkle projection intent so the hologram reads as a projected translucent body rather than a light show.');

export const shellStateProjectorHand=hand('fx.hologram.state-projector-shell-webgl',(state)=>{
  const next=deepClone(state);
  if(!next.sampleField||!next.visibility||!next.projection)throw new Error('shell projector requires sampleField, visibility, projection');
  const pts=next.sampleField.points,vis=next.visibility,pr=next.projection;
  const tint=next.effect?.tint??[.14,.88,1.0],accent=next.effect?.accent??[.50,.28,1.0];
  const sourceHash=hashValue({form:next.form,sampleField:next.sampleField,visibility:vis,projection:pr});
  const center=vis.bounds.center;
  const vertex=`#version 300 es\nprecision highp float;layout(location=0)in vec3 aPos;layout(location=1)in float aSize;layout(location=2)in float aRole;layout(location=3)in float aPhase;layout(location=4)in float aIntensity;uniform vec2 M;uniform float T;uniform float A;uniform float P;uniform float L;out float I;out float R;out float Z;out float PH;out float Y;void main(){vec3 p=(aPos-vec3(${center.join(',')}))*${vis.fitScale.toFixed(6)};p.y+=sin(T*.55+aPhase*6.283)*${pr.floatAmplitude.toFixed(6)};float yaw=sin(T*.22)*${pr.yawAmplitude.toFixed(6)}+(M.x-.5)*.12;float c=cos(yaw),s=sin(yaw);p.xz=mat2(c,-s,s,c)*p.xz;float band=floor((p.y+1.7)*15.);float g=step(.982,fract(sin(band*17.17+floor(T*5.))*43758.5453))*${pr.breakup.toFixed(6)};p.x+=(fract(sin(band*8.7+aPhase*23.)*24634.634)-.5)*.024*g;float persp=1.0/(1.0+p.z*.09);vec2 q=p.xy*persp;q.x/=max(.68,A);gl_Position=vec4(q,0,1);float layer=L<.5?3.65:(L<1.5?2.05:.82);gl_PointSize=max(L<.5?5.5:(L<1.5?3.0:1.35),aSize*P*${vis.pointBoost.toFixed(6)}*layer);I=aIntensity*(1.-g*.42);R=aRole;Z=p.z;PH=aPhase;Y=p.y;} `;
  const fragment=`#version 300 es\nprecision highp float;out vec4 O;uniform float T;uniform float L;uniform float X;uniform vec3 C;uniform vec3 D;in float I;in float R;in float Z;in float PH;in float Y;void main(){vec2 q=gl_PointCoord-.5;float r=length(q);if(r>.5)discard;float soft=exp(-r*r*(L<.5?8.0:(L<1.5?13.0:24.0)));float depth=clamp(.92-Z*${pr.depthTransmission.toFixed(6)},.55,1.35);float interference=.93+.07*sin(Y*54.0+T*1.35+PH*2.0);vec3 col=mix(C,D,clamp(R*.055,0.,.4));float alpha=0.;if(L<.5){alpha=soft*I*depth*interference*${pr.shellOpacity.toFixed(6)}*X;}else if(L<1.5){alpha=soft*I*depth*${pr.glowOpacity.toFixed(6)}*X;}else{float sparse=step(.78,fract(sin((PH+R*.11)*912.73)*43758.5453));alpha=soft*I*sparse*${pr.sparkleOpacity.toFixed(6)}*X;}O=vec4(col*alpha,alpha);} `;
  const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>AXM Holographic Shell</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#010309}body:before{content:"";position:fixed;left:50%;bottom:7%;width:min(55vw,420px);height:58vh;transform:translateX(-50%);background:linear-gradient(to top,rgba(60,230,255,.08),rgba(60,230,255,.02) 48%,transparent);clip-path:polygon(42% 100%,58% 100%,78% 0,22% 0);filter:blur(16px);pointer-events:none}canvas{width:100%;height:100%;display:block;touch-action:none}.tag{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));font:10px ui-monospace,monospace;color:#a8fbffaa;letter-spacing:.1em;text-shadow:0 0 10px #32dfff66}.meter{position:fixed;right:12px;bottom:max(12px,env(safe-area-inset-bottom));font:9px ui-monospace,monospace;color:#7bdbe977}</style><canvas id="c"></canvas><div class="tag">AXM // HOLOGRAPHIC SHELL // ${next.form?.id??'external-field'}</div><div class="meter">SHELL · GLOW · SIGNAL NOISE</div><script type="module">const data=new Float32Array(${JSON.stringify(pts)}),c=document.querySelector('#c'),g=c.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});if(!g)throw Error('WebGL2 required');const V=${JSON.stringify(vertex)},F=${JSON.stringify(fragment)};function sh(t,s){const x=g.createShader(t);g.shaderSource(x,s);g.compileShader(x);if(!g.getShaderParameter(x,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(x));return x}const p=g.createProgram();g.attachShader(p,sh(g.VERTEX_SHADER,V));g.attachShader(p,sh(g.FRAGMENT_SHADER,F));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));g.useProgram(p);const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,data,g.STATIC_DRAW);for(const [l,n,o]of[[0,3,0],[1,1,3],[2,1,4],[3,1,5],[4,1,6]]){g.enableVertexAttribArray(l);g.vertexAttribPointer(l,n,g.FLOAT,false,28,o*4)}const U={};for(const n of['M','T','A','P','L','X','C','D'])U[n]=g.getUniformLocation(p,n);g.uniform3fv(U.C,new Float32Array(${JSON.stringify(tint)}));g.uniform3fv(U.D,new Float32Array(${JSON.stringify(accent)}));let m={x:.5,y:.5};addEventListener('pointermove',e=>{m.x=e.clientX/innerWidth;m.y=1-e.clientY/innerHeight},{passive:true});addEventListener('touchmove',e=>{const t=e.touches[0];if(t){m.x=t.clientX/innerWidth;m.y=1-t.clientY/innerHeight}},{passive:true});function resize(){const d=Math.min(devicePixelRatio||1,1.3);c.width=Math.max(320,Math.floor(innerWidth*d*.9));c.height=Math.max(320,Math.floor(innerHeight*d*.9));g.viewport(0,0,c.width,c.height)}addEventListener('resize',resize);resize();let hidden=false;document.addEventListener('visibilitychange',()=>hidden=document.hidden);function common(t){g.useProgram(p);g.uniform2f(U.M,m.x,m.y);g.uniform1f(U.T,t*.001);g.uniform1f(U.A,c.width/c.height);g.uniform1f(U.P,Math.max(1.0,c.height/760));g.uniform1f(U.X,${Math.min(1.65,Math.max(1.0,vis.exposure*.72)).toFixed(6)});}function frame(t){if(!hidden){g.clearColor(.001,.003,.009,1);g.clear(g.COLOR_BUFFER_BIT);common(t);g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.uniform1f(U.L,0);g.drawArrays(g.POINTS,0,${next.sampleField.pointCount});g.blendFunc(g.SRC_ALPHA,g.ONE);g.uniform1f(U.L,1);g.drawArrays(g.POINTS,0,${next.sampleField.pointCount});g.uniform1f(U.L,2);g.drawArrays(g.POINTS,0,${next.sampleField.pointCount})}requestAnimationFrame(frame)}requestAnimationFrame(frame);</script>`;
  next.realizations??={};
  next.realizations.holographicStateShell={
    mediaType:'text/html',renderer:'axm.vfx.holographic-state-shell/v0.4',derivedFromStateHash:sourceHash,
    canonicalFormHash:next.sampleField.canonicalFormHash,sampleFieldHash:hashValue(next.sampleField),pointCount:next.sampleField.pointCount,
    visualLanguage:{primary:'translucent-shell',secondary:'volumetric-glow',tertiary:'sparse-signal-noise',brightSweep:false},
    content:html,
  };
  return {state:next,evidence:{renderer:'axm.vfx.holographic-state-shell/v0.4',pointCount:next.sampleField.pointCount,primary:'translucent-shell',brightSweep:false}};
},'Render a state-native hologram as a coherent translucent shell first, volumetric glow second, and sparse signal noise last.');

export const HOLOGRAPHIC_STATE_SHELL_HANDS=[normalizeFormHand,sampleFormHand,creativeFieldHand,visibilityFitHand,shellProjectionStateHand,shellStateProjectorHand];
export const HOLOGRAPHIC_STATE_SHELL_GRAPH=Object.freeze({schema:'axm.hand-graph/v0.1',id:'fx.holographic-state-shell',version:'0.4.0',stages:[
  {id:'normalize-form',hand:'fx.hologram.form-normalize',params:{}},
  {id:'sample-form',hand:'fx.hologram.form-sample',params:{}},
  {id:'creative-field',hand:'fx.hologram.creative-field',params:{}},
  {id:'visibility-fit',hand:'fx.hologram.visibility-fit',params:{targetFill:1.32,pointBoost:1.8,exposure:1.45}},
  {id:'projection-state',hand:'fx.hologram.shell-projection-state',params:{floatAmplitude:.012,yawAmplitude:.038,breakup:.055,shellOpacity:.19,glowOpacity:.13,sparkleOpacity:.24,depthTransmission:.32}},
  {id:'realize-shell',hand:'fx.hologram.state-projector-shell-webgl',params:{}},
]});

export {makeHolographicFormState,makeAiForm};
