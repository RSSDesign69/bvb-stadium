import * as THREE from 'three';
import type { TextureSet } from './materials';

// Ground (Task 8). The district is still painted on a canvas (surroundings.ts), but the painter now emits three
// layers instead of one picture:
//  - tint: the colour layout (sRGB), the low-frequency look of every surface
//  - masks: which CC0 detail texture each spot takes (A: asphalt, paving, track; B: soil, ballast; grass is the rest)
//  - marks: paint lines (parking bays, lanes, road dashes) as a vector decal mesh, crisp at any distance
// One ground mesh, a 3 km disc, carries all of it: inside the 850 m board it blends the detail textures by the masks
// under the tint; toward the board's edge it fades into procedural fields and hedgerows that run to the horizon and
// into the fog. There is no board edge to see.
export type GroundKind='grass'|'lawn'|'asphalt'|'paving'|'track'|'soil'|'ballast';
export const GROUND_SETS:GroundKind[]=['grass','asphalt','paving','track','soil','ballast'];
// 'lawn' is grass that is mown and kept (pitches, verges): the grass texture with little mottling (mask B blue).
const MASK:Record<GroundKind,[string,string]>={
  grass:['#000','#000'],lawn:['#000','#00f'],asphalt:['#f00','#000'],paving:['#0f0','#000'],track:['#00f','#000'],soil:['#000','#f00'],ballast:['#000','#0f0'],
};
// Metres per tile for each detail set (the CC0 sources' real-world sizes, grass a little larger so it tiles less).
const TILE:Record<Exclude<GroundKind,'lawn'>,number>={grass:2.2,asphalt:3,paving:1.8,track:2,soil:2.5,ballast:2};
export const BOARD=850,GROUND_Y=-1.8;
type Pt=[number,number];

export class Painter {
  readonly tint:HTMLCanvasElement;readonly maskA:HTMLCanvasElement;readonly maskB:HTMLCanvasElement;
  private g:CanvasRenderingContext2D[];private scales:number[];
  // Paint-line quads (x, z pairs), built into one decal mesh.
  private marks:number[]=[];
  constructor(tintPixels=2048,maskPixels=1024){
    const make=(n:number)=>{const c=document.createElement('canvas');c.width=c.height=n;return c;};
    this.tint=make(tintPixels);this.maskA=make(maskPixels);this.maskB=make(maskPixels);
    this.g=[this.tint,this.maskA,this.maskB].map(c=>c.getContext('2d',{alpha:false})!);
    this.scales=[tintPixels/BOARD,maskPixels/BOARD,maskPixels/BOARD];
    this.g[1].fillStyle=this.g[2].fillStyle='#000';this.g[1].fillRect(0,0,maskPixels,maskPixels);this.g[2].fillRect(0,0,maskPixels,maskPixels);
  }
  // Runs draw(context, px) on every layer, with the fill/stroke style of that layer.
  private each(color:string,kind:GroundKind|null,draw:(g:CanvasRenderingContext2D,px:(n:number)=>number,s:number,style:string)=>void){
    this.g.forEach((g,i)=>{if(i&&!kind)return;const s=this.scales[i],style=i===0?color:MASK[kind!][i-1];draw(g,n=>(n+BOARD/2)*s,s,style);});
  }
  rect(color:string,kind:GroundKind|null,x:number,z:number,w:number,d:number){
    this.each(color,kind,(g,px,s,style)=>{g.fillStyle=style;g.fillRect(px(x),px(z),w*s,d*s);});
  }
  oval(color:string,kind:GroundKind|null,x:number,z:number,rx:number,rz:number){
    this.each(color,kind,(g,px,s,style)=>{g.beginPath();g.ellipse(px(x),px(z),rx*s,rz*s,0,0,Math.PI*2);g.fillStyle=style;g.fill();});
  }
  line(color:string,kind:GroundKind|null,width:number,points:Pt[]){
    this.each(color,kind,(g,px,s,style)=>{g.beginPath();points.forEach(([x,z],i)=>i?g.lineTo(px(x),px(z)):g.moveTo(px(x),px(z)));
      g.strokeStyle=style;g.lineWidth=width*s;g.lineJoin='round';g.lineCap='round';g.stroke();});
  }
  // A soft darkening on the tint only (contact shade under trees, the shadows of trees outside the sun's shadow map).
  shade(x:number,z:number,rx:number,rz:number,alpha:number){
    const g=this.g[0],s=this.scales[0],cx=(x+BOARD/2)*s,cz=(z+BOARD/2)*s,r=Math.max(rx,rz)*s;
    const grad=g.createRadialGradient(0,0,0,0,0,1);grad.addColorStop(0,`rgba(12,22,12,${alpha})`);grad.addColorStop(1,'rgba(12,22,12,0)');
    g.save();g.translate(cx,cz);g.scale(r*rx/Math.max(rx,rz),r*rz/Math.max(rx,rz));g.fillStyle=grad;g.beginPath();g.arc(0,0,1,0,Math.PI*2);g.fill();g.restore();
  }
  // The sun shadow of a box outside the shadow map (Task 9): the hull of its footprint and the footprint moved by
  // the shadow's ground offset, softened a little. The canvas blur is skipped where unsupported (hard edge).
  castShadow(x:number,z:number,w:number,d:number,offset:[number,number],alpha:number){
    const g=this.g[0],s=this.scales[0],px=(n:number)=>(n+BOARD/2)*s,pts:Pt[]=[];
    for(const [ox,oz] of [[0,0],offset])for(const [sx,sz] of [[-1,-1],[1,-1],[1,1],[-1,1]])pts.push([x+sx*w/2+ox,z+sz*d/2+oz]);
    pts.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const cross=(o:Pt,a:Pt,b:Pt)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),half=(list:Pt[])=>{const h:Pt[]=[];for(const p of list){while(h.length>1&&cross(h[h.length-2],h[h.length-1],p)<=0)h.pop();h.push(p);}h.pop();return h;};
    const hull=[...half(pts),...half([...pts].reverse())];
    g.save();g.filter=`blur(${Math.max(.5,.8*s).toFixed(2)}px)`;g.fillStyle=`rgba(10,16,24,${alpha})`;g.beginPath();
    hull.forEach(([hx,hz],i)=>i?g.lineTo(px(hx),px(hz)):g.moveTo(px(hx),px(hz)));g.closePath();g.fill();g.restore();
  }
  // Large, soft variation patches on the tint (mowing, wear, damp ground), in place of pixel speckle.
  patch(x:number,z:number,r:number,color:string){
    const g=this.g[0],s=this.scales[0],grad=g.createRadialGradient((x+BOARD/2)*s,(z+BOARD/2)*s,0,(x+BOARD/2)*s,(z+BOARD/2)*s,r*s);
    grad.addColorStop(0,color);grad.addColorStop(1,color.replace(/[\d.]+\)$/,'0)'));g.fillStyle=grad;g.fillRect((x-r+BOARD/2)*s,(z-r+BOARD/2)*s,2*r*s,2*r*s);
  }
  // Paint marks: a polyline of width w, optionally dashed (dash, gap in metres).
  mark(points:Pt[],w:number,dash?:[number,number]){
    const quad=(a:Pt,b:Pt)=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<1e-4)return;const nx=-dz/l*w/2,nz=dx/l*w/2;
      this.marks.push(a[0]+nx,a[1]+nz,b[0]+nx,b[1]+nz,b[0]-nx,b[1]-nz,a[0]-nx,a[1]-nz);};
    if(!dash){for(let i=1;i<points.length;i++)quad(points[i-1],points[i]);return;}
    let on=true,left=dash[0];
    for(let i=1;i<points.length;i++){
      let a=points[i-1];const b=points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);let t=0;
      while(t<len){const step=Math.min(left,len-t),c:Pt=[a[0]+(b[0]-a[0])*(t+step)/len,a[1]+(b[1]-a[1])*(t+step)/len];if(on)quad(a,c);a=c;t+=step;left-=step;if(left<=1e-6){on=!on;left=on?dash[0]:dash[1];}}
    }
  }
  ellipseMark(x:number,z:number,rx:number,rz:number,w:number,segments=160){
    this.mark(Array.from({length:segments+1},(_,i)=>{const a=i/segments*Math.PI*2;return [x+Math.cos(a)*rx,z+Math.sin(a)*rz] as Pt;}),w);
  }
  // The decal mesh: flat quads 3 cm over the ground, pulled forward in depth so they never fight it.
  marksMesh(material:THREE.Material){
    const n=this.marks.length/8,p=new Float32Array(n*12),idx:number[]=[];
    for(let i=0;i<n;i++){for(let k=0;k<4;k++){p[i*12+k*3]=this.marks[i*8+k*2];p[i*12+k*3+1]=GROUND_Y+.03;p[i*12+k*3+2]=this.marks[i*8+k*2+1];}idx.push(i*4,i*4+2,i*4+1,i*4,i*4+3,i*4+2);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(idx);
    g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(n*12).map((_,i)=>i%3===1?1:0),3));
    // Winding: make every quad face up.
    const pos=g.attributes.position,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let i=0;i<idx.length;i+=3){a.fromBufferAttribute(pos,idx[i]);b.fromBufferAttribute(pos,idx[i+1]);c.fromBufferAttribute(pos,idx[i+2]);
      if(b.sub(a).cross(c.sub(a)).y<0){const t=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=t;}}
    g.setIndex(idx);g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,material);mesh.name='ground-marks';mesh.receiveShadow=true;return mesh;
  }
  textures(){
    const tex=(c:HTMLCanvasElement,srgb:boolean)=>{const t=new THREE.CanvasTexture(c);t.flipY=false;t.anisotropy=8;if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t;};
    return {tint:tex(this.tint,true),maskA:tex(this.maskA,false),maskB:tex(this.maskB,false)};
  }
}

const pixel=(v:number[],srgb=false)=>{const t=new THREE.DataTexture(new Uint8Array(v),1,1);if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;};
const WHITE=pixel([255,255,255,255],true);
// The fields beyond the board: a patchwork in the district's own palette (linear), with hedgerows on the boundaries.
const FIELDS=['vec3(.07,.1,.045)','vec3(.09,.115,.05)','vec3(.12,.125,.065)','vec3(.14,.13,.08)','vec3(.11,.095,.065)','vec3(.08,.095,.05)','vec3(.1,.11,.06)'];

export function groundMaterial(layers:{tint:THREE.Texture;maskA:THREE.Texture;maskB:THREE.Texture}){
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95,metalness:0});
  const g:Record<string,THREE.IUniform>={gTint:{value:layers.tint},gMaskA:{value:layers.maskA},gMaskB:{value:layers.maskB},gOn:{value:0}};
  for(const k of GROUND_SETS)g[`g_${k}`]={value:WHITE};
  material.userData.ground=g;material.customProgramCacheKey=()=>'explorer-ground';
  // Each set is sampled twice, at its tile and 3.7× larger turned 37°, so no repeat reads as a grid.
  const sample=(k:Exclude<GroundKind,'lawn'>,w:string)=>`if(${w}>.002){vec3 c=(texture2D(g_${k},p/${TILE[k].toFixed(2)}).rgb+texture2D(g_${k},pr/${(TILE[k]*3.7).toFixed(2)}).rgb)*.5/max(textureLod(g_${k},vec2(.5),16.).rgb,vec3(1e-3));det+=c*${w};}`;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,g);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 gPos;')
      .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\ngPos=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 gPos;
uniform sampler2D gTint,gMaskA,gMaskB,${GROUND_SETS.map(k=>`g_${k}`).join(',')};
uniform float gOn;
float gHash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float gNoise(vec2 x){vec2 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(gHash(i),gHash(i+vec2(1,0)),f.x),mix(gHash(i+vec2(0,1)),gHash(i+vec2(1,1)),f.x),f.y);}
float gRough;`)
      .replace('#include <color_fragment>',`#include <color_fragment>
{
  vec2 p=gPos.xz,uv=p/${BOARD.toFixed(1)}+.5,pr=mat2(.7986,-.6018,.6018,.7986)*p;
  float edge=max(abs(p.x),abs(p.y)),w=1.-smoothstep(${(BOARD/2-55).toFixed(1)},${(BOARD/2-5).toFixed(1)},edge);
  // Fields: rows of varying depth along a wandering line, each row cut into plots of its own width and offset,
  // hedgerows on every boundary, and some plots woodland. Rotated 11° off the district grid.
  vec2 q=mat2(.9816,-.1908,.1908,.9816)*p;
  float yy=q.y+45.*gNoise(vec2(q.x/310.,7.)),row=floor(yy/160.),fy=fract(yy/160.);
  float wRow=120.+170.*gHash(vec2(row,3.1)),xx=q.x+gHash(vec2(row,9.2))*wRow+30.*gNoise(vec2(yy/230.,3.)),col=floor(xx/wRow),fx=fract(xx/wRow);
  float hsh=gHash(vec2(col,row)),hedge=(1.-smoothstep(.7,2.,min(min(fx,1.-fx)*wRow,min(fy,1.-fy)*160.)))*smoothstep(.3,.5,gNoise(p/55.));
  vec3 fieldCol=${FIELDS.map((c,i)=>`hsh<${(.12+(i+1)/FIELDS.length*.88).toFixed(3)}?${c}:`).join('')}vec3(.1,.11,.06);
  fieldCol*=.9+.2*gNoise(p/41.);
  // Woodland plots: canopy blotches at crown scale.
  if(hsh<.12)fieldCol=vec3(.032,.05,.026)*(.55+.9*gNoise(p/7.))*(.8+.4*gNoise(p/31.));
  fieldCol=mix(fieldCol,vec3(.03,.05,.025)*(.7+.6*gNoise(p/6.)),hedge*.9);
  float fieldSoil=hsh>.62&&hsh<.76?1.:0.;
  vec3 tint=mix(fieldCol,texture2D(gTint,uv).rgb,w);
  vec3 ma=texture2D(gMaskA,uv).rgb*w,mb=texture2D(gMaskB,uv).rgb*w;
  float soil=max(mb.r,fieldSoil*(1.-w)),grass=clamp(1.-ma.r-ma.g-ma.b-soil-mb.g,0.,1.);
  vec3 det=vec3(0.);
  ${sample('grass','grass')}
  ${sample('asphalt','ma.r')}
  ${sample('paving','ma.g')}
  ${sample('track','ma.b')}
  ${sample('soil','soil')}
  ${sample('ballast','mb.g')}
  det/=max(grass+ma.r+ma.g+ma.b+soil+mb.g,1e-3);
  // Luminance-led detail (the tint carries the hue), weaker with distance so far ground does not shimmer.
  float lum=dot(det,vec3(.2126,.7152,.0722));det=mix(vec3(lum),det,.35);
  float fade=1.-smoothstep(260.,900.,length(cameraPosition-gPos));
  det=mix(vec3(1.),det,gOn*mix(.35,.9,fade));
  // Mottling at three scales, strongest on grass, and drier, yellower patches.
  float n1=gNoise(p/5.3),n2=gNoise(p/19.),n3=gNoise(p/67.);
  float macro=((n1-.5)*.3+(n2-.5)*.45+(n3-.5)*.4)*(grass*(1.-.8*mb.b)+.3);
  vec3 dry=mix(vec3(1.),vec3(1.1,1.05,.82),smoothstep(.55,.85,n3)*grass);
  macro*=mix(.4,1.,w);
  diffuseColor.rgb=tint*clamp(det,0.,2.)*(1.+macro)*dry;
  gRough=grass*.97+ma.r*.86+ma.g*.8+ma.b*.84+soil*.96+mb.g*.9;
}`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(gRough,.5,1.);');
  };
  return material;
}
// Paint marks: worn paint whose opacity follows its pixel coverage, so thin lines fade with distance instead of
// breaking into dots.
export function marksMaterial(){
  const m=new THREE.MeshStandardMaterial({color:0xd4d0c0,roughness:.7,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  m.customProgramCacheKey=()=>'explorer-marks';
  m.onBeforeCompile=s=>{
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 mPos;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nmPos=(modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 mPos;\nfloat mHash(vec2 p){p=fract(p*vec2(.1031,.103));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}')
      .replace('#include <color_fragment>','#include <color_fragment>\n{float px=length(fwidth(mPos.xz));diffuseColor.a*=clamp(.13/max(px,1e-4),0.,1.)*mix(.55,.95,mHash(floor(mPos.xz*1.7)));diffuseColor.rgb*=.85+.15*mHash(floor(mPos.xz*.4));}');
  };
  return m;
}
export function applyGround(material:THREE.Material,sets:Record<string,TextureSet>){
  const g=material.userData.ground as Record<string,THREE.IUniform>|undefined;if(!g)return;
  for(const k of GROUND_SETS)if(sets[k])g[`g_${k}`].value=sets[k].color;
  g.gOn.value=1;
}
