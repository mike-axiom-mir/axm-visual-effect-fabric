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
import { visibilityFitHand } from './holographic-state-readable.mjs';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)));
const round6=v=>Number(Number(v).toFixed(6));
function hand(id,execute,description){return Object.freeze({schema:'axm.hand/v0.1',id,version:'0.5.0',deterministic:true,callerNeutral:true,network:'forbidden',description,execute})}

export const surfaceFieldHand=hand('fx.hologram.surface-field',(state,params)=>{
  const next=deepClone(state);
  if(!next.sampleField?.points?.length)throw new Error('surface-field requires sampleField points');
  next.surfaceField={
    schema:'axm.holographic-surface-field/v0.1',
    method:'screen-space-density-reconstruction',
    sourceSampleFieldHash:hashValue(next.sampleField),
    sourcePointCount:next.sampleField.pointCount,
    resolutionScale:round6(clamp(params.resolutionScale??.56,.34,.82)),
    kernelScale:round6(clamp(params.kernelScale??2.9,1.4,5.5)),
    shellThreshold:round6(clamp(params.shellThreshold??.075,.02,.22)),
    fillThreshold:round6(clamp(params.fillThreshold??.19,.05,.5)),
    gradientStrength:round6(clamp(params.gradientStrength??5.8,1,14)),
    shellOpacity:round6(clamp(params.shellOpacity??.33,.08,.7)),
    volumeOpacity:round6(clamp(params.volumeOpacity??.13,.02,.35)),
    edgeOpacity:round6(clamp(params.edgeOpacity??.30,.05,.65)),
    signalNoise:round6(clamp(params.signalNoise??.055,0,.18)),
    derived:true,
    rebuildable:true,
  };
  return {state:next,evidence:{method:next.surfaceField.method,sourceSampleFieldHash:next.surfaceField.sourceSampleFieldHash,sourcePointCount:next.surfaceField.sourcePointCount}};
},'Declare a rebuildable screen-space density surface reconstructed from the holographic sample field without changing canonical form truth.');

export const surfaceProjectionStateHand=hand('fx.hologram.surface-projection-state',(state,params)=>{
  const next=deepClone(state);
  next.projection={
    schema:'axm.holographic-projection-state/v0.5',
    floatAmplitude:round6(clamp(params.floatAmplitude??.008,0,.05)),
    yawAmplitude:round6(clamp(params.yawAmplitude??.026,0,.14)),
    breakup:round6(clamp(params.breakup??.026,0,.16)),
    depthTransmission:round6(clamp(params.depthTransmission??.34,0,.8)),
  };
  return {state:next,evidence:{projection:next.projection}};
},'Attach restrained projection motion for a reconstructed holographic surface.');

export const surfaceStateProjectorHand=hand('fx.hologram.state-projector-surface-webgl',(state)=>{
  const next=deepClone(state);
  if(!next.sampleField||!next.visibility||!next.surfaceField||!next.projection)throw new Error('surface projector requires sampleField, visibility, surfaceField, projection');
  const pts=next.sampleField.points,vis=next.visibility,sf=next.surfaceField,pr=next.projection;
  const tint=next.effect?.tint??[.14,.88,1.0],accent=next.effect?.accent??[.48,.30,1.0];
  const sourceHash=hashValue({form:next.form,sampleField:next.sampleField,visibility:vis,surfaceField:sf,projection:pr});
  const center=vis.bounds.center;

  const splatVertex=`#version 300 es\nprecision highp float;layout(location=0)in vec3 aPos;layout(location=1)in float aSize;layout(location=2)in float aRole;layout(location=3)in float aPhase;layout(location=4)in float aIntensity;uniform vec2 M;uniform float T;uniform float A;uniform float P;out float I;out float D;out float K;void main(){vec3 p=(aPos-vec3(${center.join(',')}))*${vis.fitScale.toFixed(6)};p.y+=sin(T*.43+aPhase*6.283)*${pr.floatAmplitude.toFixed(6)};float yaw=sin(T*.18)*${pr.yawAmplitude.toFixed(6)}+(M.x-.5)*.10;float c=cos(yaw),s=sin(yaw);p.xz=mat2(c,-s,s,c)*p.xz;float band=floor((p.y+1.8)*14.);float g=step(.991,fract(sin(band*17.7+floor(T*4.))*43758.5453))*${pr.breakup.toFixed(6)};p.x+=(fract(sin(band*8.1+aPhase*19.)*24634.634)-.5)*.016*g;float persp=1.0/(1.0+p.z*.075);vec2 q=p.xy*persp;q.x/=max(.68,A);gl_Position=vec4(q,0,1);gl_PointSize=max(5.0,aSize*P*${sf.kernelScale.toFixed(6)}*(1.0+max(0.,-p.z)*.10));I=aIntensity*(1.-g*.4);D=clamp(.5-p.z*.22,0.,1.);K=clamp(aRole/8.,0.,1.);} `;
  const splatFragment=`#version 300 es\nprecision highp float;out vec4 O;in float I;in float D;in float K;void main(){vec2 q=gl_PointCoord-.5;float r=length(q);if(r>.5)discard;float w=exp(-r*r*15.0)*I*.115;O=vec4(w,w*D,w*K,w);} `;
  const fullVertex=`#version 300 es\nprecision highp float;out vec2 UV;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);UV=p;gl_Position=vec4(p*2.-1.,0.,1.);} `;
  const resolveFragment=`#version 300 es\nprecision highp float;out vec4 O;in vec2 UV;uniform sampler2D F;uniform vec2 R;uniform float T;uniform vec3 C;uniform vec3 E;\nfloat h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\nvoid main(){vec2 px=1./R;vec4 m=texture(F,UV),l=texture(F,UV-vec2(px.x,0)),r=texture(F,UV+vec2(px.x,0)),d=texture(F,UV-vec2(0,px.y)),u=texture(F,UV+vec2(0,px.y));float den=(m.r*4.+l.r+r.r+d.r+u.r)/8.;float gx=(r.r-l.r)*${sf.gradientStrength.toFixed(6)},gy=(u.r-d.r)*${sf.gradientStrength.toFixed(6)},grad=clamp(length(vec2(gx,gy)),0.,1.);float shell=smoothstep(${(sf.shellThreshold*.55).toFixed(6)},${(sf.shellThreshold*1.35).toFixed(6)},den);float fill=smoothstep(${sf.fillThreshold.toFixed(6)},${(sf.fillThreshold*1.75).toFixed(6)},den);float edge=grad*shell;float raw=max(m.r,.001);float depth=clamp(m.g/raw,0.,1.);float role=clamp(m.b/raw,0.,1.);float transmission=mix(.72,1.28,depth)*${pr.depthTransmission.toFixed(6)}+(1.-${pr.depthTransmission.toFixed(6)});float interference=.965+.035*sin((UV.y*R.y)*.105+T*.85);vec3 col=mix(C,E,role*.45);float alpha=(shell*${sf.shellOpacity.toFixed(6)}+fill*${sf.volumeOpacity.toFixed(6)}+edge*${sf.edgeOpacity.toFixed(6)})*transmission;float sparse=step(.986,h21(floor(UV*R*.42)+floor(T*2.)));float noise=sparse*shell*${sf.signalNoise.toFixed(6)};col*=interference*(.82+.18*edge);col+=E*noise;float beam=max(0.,1.-abs(UV.x-.5)/max(.03,(1.-UV.y)*.34))*(1.-smoothstep(.12,.72,UV.y))*.035;col+=C*beam*shell;vec3 bg=vec3(.001,.003,.009);vec3 outc=mix(bg,col,clamp(alpha,0.,.76));O=vec4(outc,1.);} `;

  const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>AXM Holographic Surface Projector</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#010309}canvas{width:100%;height:100%;display:block;touch-action:none}.tag{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));font:10px ui-monospace,monospace;color:#a8fbff99;letter-spacing:.095em;text-shadow:0 0 8px #32dfff55}.meter{position:fixed;right:12px;bottom:max(12px,env(safe-area-inset-bottom));font:9px ui-monospace,monospace;color:#7bdbe966}</style><canvas id="c"></canvas><div class="tag">AXM // RECONSTRUCTED HOLOGRAPHIC SURFACE // ${next.form?.id??'external-field'}</div><div class="meter">DENSITY → SHELL → LIGHT</div><script type="module">const data=new Float32Array(${JSON.stringify(pts)}),c=document.querySelector('#c'),g=c.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});if(!g)throw Error('WebGL2 required');const SV=${JSON.stringify(splatVertex)},SF=${JSON.stringify(splatFragment)},FV=${JSON.stringify(fullVertex)},RF=${JSON.stringify(resolveFragment)};function sh(t,s){const x=g.createShader(t);g.shaderSource(x,s);g.compileShader(x);if(!g.getShaderParameter(x,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(x));return x}function prog(v,f){const p=g.createProgram();g.attachShader(p,sh(g.VERTEX_SHADER,v));g.attachShader(p,sh(g.FRAGMENT_SHADER,f));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));return p}const sp=prog(SV,SF),rp=prog(FV,RF),pointVao=g.createVertexArray(),fullVao=g.createVertexArray(),buf=g.createBuffer();g.bindVertexArray(pointVao);g.bindBuffer(g.ARRAY_BUFFER,buf);g.bufferData(g.ARRAY_BUFFER,data,g.STATIC_DRAW);for(const [l,n,o]of[[0,3,0],[1,1,3],[2,1,4],[3,1,5],[4,1,6]]){g.enableVertexAttribArray(l);g.vertexAttribPointer(l,n,g.FLOAT,false,28,o*4)}const SU={};g.useProgram(sp);for(const n of['M','T','A','P'])SU[n]=g.getUniformLocation(sp,n);const RU={};g.useProgram(rp);for(const n of['F','R','T','C','E'])RU[n]=g.getUniformLocation(rp,n);g.uniform1i(RU.F,0);g.uniform3fv(RU.C,new Float32Array(${JSON.stringify(tint)}));g.uniform3fv(RU.E,new Float32Array(${JSON.stringify(accent)}));const tex=g.createTexture(),fb=g.createFramebuffer();g.bindTexture(g.TEXTURE_2D,tex);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);let fw=0,fh=0;function alloc(){const nw=Math.max(180,Math.floor(c.width*${sf.resolutionScale.toFixed(6)})),nh=Math.max(180,Math.floor(c.height*${sf.resolutionScale.toFixed(6)}));if(nw===fw&&nh===fh)return;fw=nw;fh=nh;g.bindTexture(g.TEXTURE_2D,tex);g.texImage2D(g.TEXTURE_2D,0,g.RGBA8,fw,fh,0,g.RGBA,g.UNSIGNED_BYTE,null);g.bindFramebuffer(g.FRAMEBUFFER,fb);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,tex,0);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('surface field framebuffer incomplete');g.bindFramebuffer(g.FRAMEBUFFER,null)}let m={x:.5,y:.5};addEventListener('pointermove',e=>{m.x=e.clientX/innerWidth;m.y=1-e.clientY/innerHeight},{passive:true});addEventListener('touchmove',e=>{const q=e.touches[0];if(q){m.x=q.clientX/innerWidth;m.y=1-q.clientY/innerHeight}},{passive:true});function resize(){const d=Math.min(devicePixelRatio||1,1.25);c.width=Math.max(320,Math.floor(innerWidth*d*.9));c.height=Math.max(320,Math.floor(innerHeight*d*.9));alloc()}addEventListener('resize',resize);resize();let hidden=false;document.addEventListener('visibilitychange',()=>hidden=document.hidden);function frame(ms){if(!hidden){const t=ms*.001;g.bindFramebuffer(g.FRAMEBUFFER,fb);g.viewport(0,0,fw,fh);g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT);g.enable(g.BLEND);g.blendFunc(g.ONE,g.ONE);g.useProgram(sp);g.bindVertexArray(pointVao);g.uniform2f(SU.M,m.x,m.y);g.uniform1f(SU.T,t);g.uniform1f(SU.A,c.width/c.height);g.uniform1f(SU.P,Math.max(.9,c.height/760));g.drawArrays(g.POINTS,0,${next.sampleField.pointCount});g.disable(g.BLEND);g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,c.width,c.height);g.clearColor(.001,.003,.009,1);g.clear(g.COLOR_BUFFER_BIT);g.useProgram(rp);g.bindVertexArray(fullVao);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,tex);g.uniform2f(RU.R,fw,fh);g.uniform1f(RU.T,t);g.drawArrays(g.TRIANGLES,0,3)}requestAnimationFrame(frame)}requestAnimationFrame(frame);</script>`;

  next.realizations??={};
  next.realizations.holographicStateSurface={
    mediaType:'text/html',
    renderer:'axm.vfx.holographic-state-surface/v0.5',
    derivedFromStateHash:sourceHash,
    canonicalFormHash:next.sampleField.canonicalFormHash,
    sampleFieldHash:hashValue(next.sampleField),
    pointCount:next.sampleField.pointCount,
    surfaceField:deepClone(next.surfaceField),
    reconstruction:{input:'point-splat-density',field:'RGBA8 screen-space density/depth/role',resolve:'continuous translucent threshold shell',geometricMesh:false,physicalHolography:false},
    workingSet:{canonicalFormRetained:true,sampleFieldRetained:true,surfaceFieldDerived:true,surfaceFieldRebuildable:true,gpuDensityTextureDisposable:true},
    content:html,
  };
  return {state:next,evidence:{renderer:'axm.vfx.holographic-state-surface/v0.5',method:sf.method,pointCount:next.sampleField.pointCount,sourceSampleFieldHash:sf.sourceSampleFieldHash,geometricMesh:false}};
},'Reconstruct a continuous holographic shell from the state sample field through a disposable screen-space density/depth field, keeping points as internal render input rather than the visible object.');

export const HOLOGRAPHIC_STATE_SURFACE_HANDS=[normalizeFormHand,sampleFormHand,creativeFieldHand,visibilityFitHand,surfaceFieldHand,surfaceProjectionStateHand,surfaceStateProjectorHand];
export const HOLOGRAPHIC_STATE_SURFACE_GRAPH=Object.freeze({schema:'axm.hand-graph/v0.1',id:'fx.holographic-state-surface',version:'0.5.0',stages:[
  {id:'normalize-form',hand:'fx.hologram.form-normalize',params:{}},
  {id:'sample-form',hand:'fx.hologram.form-sample',params:{}},
  {id:'creative-field',hand:'fx.hologram.creative-field',params:{}},
  {id:'visibility-fit',hand:'fx.hologram.visibility-fit',params:{targetFill:1.28,pointBoost:1.45,exposure:1.15}},
  {id:'surface-field',hand:'fx.hologram.surface-field',params:{resolutionScale:.56,kernelScale:2.9,shellThreshold:.075,fillThreshold:.19,gradientStrength:5.8,shellOpacity:.33,volumeOpacity:.13,edgeOpacity:.30,signalNoise:.055}},
  {id:'projection-state',hand:'fx.hologram.surface-projection-state',params:{floatAmplitude:.008,yawAmplitude:.026,breakup:.026,depthTransmission:.34}},
  {id:'realize-surface',hand:'fx.hologram.state-projector-surface-webgl',params:{}},
]});

export {makeHolographicFormState,makeAiForm,makeGlobeForm,makeRoverForm};
