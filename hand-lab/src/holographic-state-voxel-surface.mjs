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
function hand(id,execute,description){return Object.freeze({schema:'axm.hand/v0.1',id,version:'0.6.0',deterministic:true,callerNeutral:true,network:'forbidden',description,execute})}
function idx(x,y,z,r){return x+r*(y+r*z)}
function normalize(v){const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l]}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
function add3(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]]}

function sampleBounds(points){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<points.length;i+=7){
    for(let a=0;a<3;a++){const v=Number(points[i+a]);if(!Number.isFinite(v))throw new Error('voxel surface encountered non-finite point');min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v)}
  }
  const span=min.map((v,i)=>Math.max(1e-4,max[i]-v));
  const pad=span.map(v=>Math.max(.04,v*.12));
  return{min:min.map((v,i)=>round6(v-pad[i])),max:max.map((v,i)=>round6(v+pad[i]))};
}

function smoothField(src,r){
  const out=new Float32Array(src.length);
  for(let z=0;z<r;z++)for(let y=0;y<r;y++)for(let x=0;x<r;x++){
    let total=src[idx(x,y,z,r)]*.52,weight=.52;
    for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
      const xx=x+dx,yy=y+dy,zz=z+dz;
      if(xx>=0&&yy>=0&&zz>=0&&xx<r&&yy<r&&zz<r){total+=src[idx(xx,yy,zz,r)]*.08;weight+=.08}
    }
    out[idx(x,y,z,r)]=total/weight;
  }
  return out;
}

export const voxelDensityHand=hand('fx.hologram.voxel-density',(state,params)=>{
  const next=deepClone(state);
  if(!next.sampleField?.points?.length)throw new Error('voxel-density requires sampleField points');
  const r=Math.round(clamp(params.resolution??22,14,34)),bounds=sampleBounds(next.sampleField.points),density=new Float32Array(r*r*r);
  const span=bounds.min.map((v,i)=>bounds.max[i]-v),kernel=clamp(params.kernel??1.9,1.0,2.8),radius=Math.ceil(kernel);
  for(let i=0;i<next.sampleField.points.length;i+=7){
    const p=[next.sampleField.points[i],next.sampleField.points[i+1],next.sampleField.points[i+2]];
    const intensity=clamp(next.sampleField.points[i+6]??1,.05,2);
    const g=p.map((v,a)=>(v-bounds.min[a])/span[a]*(r-1));
    const base=g.map(Math.floor);
    for(let dz=-radius;dz<=radius;dz++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      const x=base[0]+dx,y=base[1]+dy,z=base[2]+dz;if(x<0||y<0||z<0||x>=r||y>=r||z>=r)continue;
      const d2=(x-g[0])**2+(y-g[1])**2+(z-g[2])**2;
      const w=Math.exp(-d2/(kernel*kernel))*.96*intensity;
      const k=idx(x,y,z,r);if(w>density[k])density[k]=w;
    }
  }
  const smooth=smoothField(density,r);
  const quantized=Array.from(smooth,v=>Math.round(clamp(v,0,1)*255));
  next.voxelField={
    schema:'axm.holographic-voxel-density/v0.1',
    method:'bounded-max-splat-plus-neighbor-smooth',
    derived:true,rebuildable:true,resolution:r,bounds,iso:clamp(params.iso??.16,.06,.42),
    density:quantized,sourceSampleFieldHash:hashValue(next.sampleField),
  };
  next.voxelField.digest=hashValue({resolution:r,bounds,iso:next.voxelField.iso,density:quantized});
  return{state:next,evidence:{resolution:r,cells:quantized.length,iso:next.voxelField.iso,digest:next.voxelField.digest}};
},'Convert the retained holographic sample field into a bounded rebuildable 3D voxel density field.');

const CUBE=[
  [0,0,0],[1,0,0],[1,1,0],[0,1,0],
  [0,0,1],[1,0,1],[1,1,1],[0,1,1],
];
const TETS=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];

function densityAt(field,x,y,z){
  const r=field.resolution;
  x=Math.max(0,Math.min(r-1,x));y=Math.max(0,Math.min(r-1,y));z=Math.max(0,Math.min(r-1,z));
  return field.density[idx(x,y,z,r)]/255;
}
function gradientAt(field,x,y,z){
  return normalize([
    densityAt(field,x+1,y,z)-densityAt(field,x-1,y,z),
    densityAt(field,x,y+1,z)-densityAt(field,x,y-1,z),
    densityAt(field,x,y,z+1)-densityAt(field,x,y,z-1),
  ]);
}
function worldAt(field,g){
  const r=field.resolution,span=field.bounds.min.map((v,i)=>field.bounds.max[i]-v);
  return g.map((v,a)=>field.bounds.min[a]+v/(r-1)*span[a]);
}
function edgeVertex(field,a,b,da,db,iso){
  const denom=db-da,t=Math.abs(denom)<1e-8?.5:clamp((iso-da)/denom,0,1);
  const g=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  const ga=gradientAt(field,Math.round(a[0]),Math.round(a[1]),Math.round(a[2]));
  const gb=gradientAt(field,Math.round(b[0]),Math.round(b[1]),Math.round(b[2]));
  return{p:worldAt(field,g),n:normalize([ga[0]+(gb[0]-ga[0])*t,ga[1]+(gb[1]-ga[1])*t,ga[2]+(gb[2]-ga[2])*t])};
}
function pushTri(vertices,normals,a,b,c){
  let pa=a.p,pb=b.p,pc=c.p,na=a.n,nb=b.n,nc=c.n;
  const face=cross(sub(pb,pa),sub(pc,pa)),avg=normalize(add3(add3(na,nb),nc));
  if(face[0]*avg[0]+face[1]*avg[1]+face[2]*avg[2]<0){[pb,pc]=[pc,pb];[nb,nc]=[nc,nb]}
  vertices.push(...pa,...pb,...pc);normals.push(...na,...nb,...nc);
}
function polygoniseTet(field,g,d,iso,vertices,normals,maxTriangles){
  const inside=[0,1,2,3].filter(i=>d[i]>=iso),outside=[0,1,2,3].filter(i=>d[i]<iso);
  if(inside.length===0||inside.length===4)return;
  const ev=(i,j)=>edgeVertex(field,g[i],g[j],d[i],d[j],iso);
  const triCount=vertices.length/9;
  if(triCount>=maxTriangles)throw new Error(`voxel surface exceeds ${maxTriangles} triangles`);
  if(inside.length===1){
    const i=inside[0];pushTri(vertices,normals,ev(i,outside[0]),ev(i,outside[1]),ev(i,outside[2]));return;
  }
  if(inside.length===3){
    const o=outside[0];pushTri(vertices,normals,ev(o,inside[0]),ev(o,inside[2]),ev(o,inside[1]));return;
  }
  const [i0,i1]=inside,[o0,o1]=outside;
  const a=ev(i0,o0),b=ev(i0,o1),c=ev(i1,o0),e=ev(i1,o1);
  pushTri(vertices,normals,a,b,c);
  if(vertices.length/9>=maxTriangles)throw new Error(`voxel surface exceeds ${maxTriangles} triangles`);
  pushTri(vertices,normals,b,e,c);
}

export const voxelSurfaceMeshHand=hand('fx.hologram.voxel-surface-mesh',(state,params)=>{
  const next=deepClone(state),field=next.voxelField;if(!field)throw new Error('voxel-surface-mesh requires voxelField');
  const r=field.resolution,iso=field.iso,vertices=[],normals=[],maxTriangles=Math.round(clamp(params.maxTriangles??28000,2000,60000));
  for(let z=0;z<r-1;z++)for(let y=0;y<r-1;y++)for(let x=0;x<r-1;x++){
    const gp=CUBE.map(c=>[x+c[0],y+c[1],z+c[2]]),dd=gp.map(p=>densityAt(field,p[0],p[1],p[2]));
    const lo=Math.min(...dd),hi=Math.max(...dd);if(iso<lo||iso>hi)continue;
    for(const tet of TETS){
      const tg=tet.map(i=>gp[i]),td=tet.map(i=>dd[i]);polygoniseTet(field,tg,td,iso,vertices,normals,maxTriangles);
    }
  }
  if(vertices.length===0)throw new Error('voxel surface reconstruction produced no triangles');
  const triangleCount=vertices.length/9;
  next.surfaceMesh={
    schema:'axm.holographic-triangle-surface/v0.1',method:'marching-tetrahedra-over-derived-voxel-density',
    derived:true,rebuildable:true,sourceVoxelDigest:field.digest,triangleCount,
    vertices:vertices.map(round6),normals:normals.map(round6),
  };
  next.surfaceMesh.digest=hashValue({sourceVoxelDigest:field.digest,vertices:next.surfaceMesh.vertices,normals:next.surfaceMesh.normals});
  return{state:next,evidence:{triangleCount,vertexCount:vertices.length/3,digest:next.surfaceMesh.digest}};
},'Extract a real 3D triangle shell from the derived voxel density with deterministic marching tetrahedra.');

function meshBounds(vertices){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<vertices.length;i+=3)for(let a=0;a<3;a++){min[a]=Math.min(min[a],vertices[i+a]);max[a]=Math.max(max[a],vertices[i+a])}
  const center=min.map((v,i)=>(v+max[i])/2),span=min.map((v,i)=>Math.max(1e-4,max[i]-v)),fit=1.45/Math.max(span[0],span[1],span[2]*.72);
  return{min:min.map(round6),max:max.map(round6),center:center.map(round6),span:span.map(round6),fitScale:round6(fit)};
}

export const voxelSurfaceWebglHand=hand('fx.hologram.voxel-surface-webgl',(state)=>{
  const next=deepClone(state),mesh=next.surfaceMesh;if(!mesh)throw new Error('voxel-surface-webgl requires surfaceMesh');
  const b=meshBounds(mesh.vertices),interleaved=[];
  for(let i=0;i<mesh.vertices.length;i+=3)interleaved.push(mesh.vertices[i],mesh.vertices[i+1],mesh.vertices[i+2],mesh.normals[i],mesh.normals[i+1],mesh.normals[i+2]);
  const tint=next.effect?.tint??[.12,.88,1.0],accent=next.effect?.accent??[.52,.30,1.0],sourceHash=hashValue({form:next.form,sampleField:next.sampleField,voxelField:next.voxelField,surfaceMesh:mesh});
  const vertex=`#version 300 es
precision highp float;
layout(location=0)in vec3 aPos;layout(location=1)in vec3 aNormal;
uniform vec2 M;uniform float T;uniform float A;
out vec3 N;out vec3 P;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){
  vec3 p=(aPos-vec3(${b.center.join(',')}))*${b.fitScale.toFixed(6)};
  vec3 n=aNormal;
  float yaw=sin(T*.18)*.04+(M.x-.5)*.52,pitch=(M.y-.5)*-.22;
  p.xz=rot(yaw)*p.xz;n.xz=rot(yaw)*n.xz;
  p.yz=rot(pitch)*p.yz;n.yz=rot(pitch)*n.yz;
  p.y+=sin(T*.42)*.012;
  float d=max(.9,2.8-p.z);vec2 q=vec2(p.x*2.05/d,p.y*2.05/d);q.x/=max(.72,A);
  gl_Position=vec4(q,clamp((p.z+1.4)/3.0,-1.0,1.0),1.0);N=normalize(n);P=p;
}`;
  const fragment=`#version 300 es
precision highp float;
out vec4 O;uniform float T;uniform vec3 C;uniform vec3 D;in vec3 N;in vec3 P;
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec3 V=normalize(vec3(0.,0.,1.));float fres=pow(1.-abs(dot(normalize(N),V)),1.7);
  float interference=.94+.06*sin(P.y*48.-T*1.2+P.z*9.);
  float breakup=step(.992,hash21(floor((P.xy+2.)*34.)+floor(T*3.)*.17));
  vec3 col=mix(C,D,.12+.22*clamp(P.z+.5,0.,1.));
  float body=(.11+.28*fres)*interference;body*=1.-breakup*.72;
  float inner=.035*(1.-fres);vec3 light=col*(body+inner)+vec3(.18,.7,.85)*fres*.055;
  O=vec4(light,clamp(body+inner,.045,.38));
}`;
  const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>AXM Holographic Voxel Surface</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#010309}body:before{content:"";position:fixed;left:50%;bottom:4%;width:min(48vw,420px);height:42vh;transform:translateX(-50%);background:linear-gradient(to top,rgba(50,225,255,.075),transparent);clip-path:polygon(43% 100%,57% 100%,78% 0,22% 0);filter:blur(18px);pointer-events:none}canvas{width:100%;height:100%;display:block;touch-action:none}.tag{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));font:10px ui-monospace,monospace;color:#a8fbff99;letter-spacing:.1em}.meter{position:fixed;right:12px;bottom:max(12px,env(safe-area-inset-bottom));font:9px ui-monospace,monospace;color:#7bdbe977}</style>
<canvas id="c"></canvas><div class="tag">AXM // 3D HOLOGRAPHIC SURFACE // ${next.form?.id??'external-field'}</div><div class="meter">${mesh.triangleCount} tris · voxel ${next.voxelField.resolution}³</div>
<script type="module">
const data=new Float32Array(${JSON.stringify(interleaved)}),c=document.querySelector('#c'),g=c.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});if(!g)throw Error('WebGL2 required');
const V=${JSON.stringify(vertex)},F=${JSON.stringify(fragment)};function sh(t,s){const x=g.createShader(t);g.shaderSource(x,s);g.compileShader(x);if(!g.getShaderParameter(x,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(x));return x}
const p=g.createProgram();g.attachShader(p,sh(g.VERTEX_SHADER,V));g.attachShader(p,sh(g.FRAGMENT_SHADER,F));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));g.useProgram(p);
const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,data,g.STATIC_DRAW);
g.enableVertexAttribArray(0);g.vertexAttribPointer(0,3,g.FLOAT,false,24,0);g.enableVertexAttribArray(1);g.vertexAttribPointer(1,3,g.FLOAT,false,24,12);
const U={};for(const n of['M','T','A','C','D'])U[n]=g.getUniformLocation(p,n);g.uniform3fv(U.C,new Float32Array(${JSON.stringify(tint)}));g.uniform3fv(U.D,new Float32Array(${JSON.stringify(accent)}));
g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.enable(g.DEPTH_TEST);g.depthMask(false);g.disable(g.CULL_FACE);
let m={x:.5,y:.5};addEventListener('pointermove',e=>{m.x=e.clientX/innerWidth;m.y=1-e.clientY/innerHeight},{passive:true});addEventListener('touchmove',e=>{const t=e.touches[0];if(t){m.x=t.clientX/innerWidth;m.y=1-t.clientY/innerHeight}},{passive:true});
function resize(){const d=Math.min(devicePixelRatio||1,1.3);c.width=Math.max(320,Math.floor(innerWidth*d*.9));c.height=Math.max(320,Math.floor(innerHeight*d*.9));g.viewport(0,0,c.width,c.height)}addEventListener('resize',resize);resize();
let hidden=false;document.addEventListener('visibilitychange',()=>hidden=document.hidden);
function frame(t){if(!hidden){g.clearColor(.001,.003,.009,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.useProgram(p);g.uniform2f(U.M,m.x,m.y);g.uniform1f(U.T,t*.001);g.uniform1f(U.A,c.width/c.height);g.drawArrays(g.TRIANGLES,0,${mesh.vertices.length/3})}requestAnimationFrame(frame)}requestAnimationFrame(frame);
</script>`;
  next.realizations??={};next.realizations.holographicVoxelSurface={
    mediaType:'text/html',renderer:'axm.vfx.holographic-voxel-surface/v0.6',derivedFromStateHash:sourceHash,
    canonicalFormHash:next.sampleField.canonicalFormHash,sampleFieldHash:hashValue(next.sampleField),voxelDigest:next.voxelField.digest,meshDigest:mesh.digest,
    triangleCount:mesh.triangleCount,workingSet:{canonicalFormRetained:true,sampleFieldRetained:true,voxelDensityDerived:true,triangleMeshDerived:true,gpuTriangleBufferDisposable:true,modeledBufferBytes:interleaved.length*4},
    content:html,
  };
  return{state:next,evidence:{renderer:'axm.vfx.holographic-voxel-surface/v0.6',triangleCount:mesh.triangleCount,modeledBufferBytes:interleaved.length*4}};
},'Render the derived 3D triangle shell as a cheap translucent holographic surface with real depth/parallax.');

export const HOLOGRAPHIC_VOXEL_SURFACE_HANDS=[normalizeFormHand,sampleFormHand,creativeFieldHand,voxelDensityHand,voxelSurfaceMeshHand,voxelSurfaceWebglHand];
export const HOLOGRAPHIC_VOXEL_SURFACE_GRAPH=Object.freeze({schema:'axm.hand-graph/v0.1',id:'fx.holographic-voxel-surface',version:'0.6.0',stages:[
  {id:'normalize-form',hand:'fx.hologram.form-normalize',params:{}},
  {id:'sample-form',hand:'fx.hologram.form-sample',params:{}},
  {id:'creative-field',hand:'fx.hologram.creative-field',params:{}},
  {id:'voxel-density',hand:'fx.hologram.voxel-density',params:{resolution:22,kernel:1.9,iso:.16}},
  {id:'surface-mesh',hand:'fx.hologram.voxel-surface-mesh',params:{maxTriangles:28000}},
  {id:'realize-voxel-surface',hand:'fx.hologram.voxel-surface-webgl',params:{}},
]});

export {makeHolographicFormState,makeAiForm,makeGlobeForm,makeRoverForm};
