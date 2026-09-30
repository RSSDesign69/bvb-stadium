import * as THREE from 'three';
import { BOWL, ROOF_Y } from '../hero/framing';
import { GLASS_HALF, GLASS_ROWS, PANE } from './shell';

// Explorer materials (Task 5): physically based, textured by world position, so scaled unit boxes, swept
// profiles, instances and the morphing roof ring all tile at real-world scale with no stretching.
// Every material starts untextured in its final palette. The shader already samples its maps (1×1 placeholders),
// so when the CC0 KTX2 set arrives (viewer/assets.ts) the swap is a uniform write: no recompile, no hitch.
// Mapping modes:
//  - triplanar: three planar samples blended by the world normal, with a whiteout normal blend.
//  - ring: a coordinate that runs around the stadium's rounded outline (u = distance along the perimeter,
//    v = height on vertical faces or distance out from the outline on flat ones). The outer wall's corrugations
//    stay vertical round the corner arcs, and the roof sheet's ribs run radially, down the slope, as built.
// Texture detail is normalised by the map's own mean (its 1×1 mip), so the palette colour stays the average:
// the look is art-directed by `color`, the texture only adds variation. `mono` keeps only the luminance
// detail (sources whose hue is wrong for the role: the red roof sheet, the blue plate).
export type TextureSet={color:THREE.Texture;orm:THREE.Texture;normal?:THREE.Texture};
export interface Surface {
  set?:string;       // index.json material set; none = untextured (macro variation only)
  scale?:number;     // metres per texture tile
  ring?:number;      // ring mapping, with this radius (m) for the corner arcs; omit for triplanar
  mono?:number;      // 0 keeps the texture's hue variation, 1 luminance only
  contrast?:number;  // strength of the colour detail
  normal?:number;    // normal map strength
  rough?:number;     // strength of the roughness variation (ORM green around its mean)
  ao?:number;        // strength of the ORM occlusion on indirect light
  macro?:number;     // low-frequency colour and roughness variation (hides tiling on large surfaces)
  glass?:boolean|'facade'; // per-pane tint (fake interiors); 'facade' follows the curtain wall's pane grid and rows
  joint?:number;     // paving panels of this size (m) on up-facing faces: joint lines and a tone per panel (Task 9);
                     // with ring mapping, sheet width: a tone per sheet (sheets 9 m long), no lines
  wear?:number;      // pitch wear (turf only): goalmouths and the centre, drier and lighter (Task 9)
}
type Uniforms=Record<string,THREE.IUniform>;
// Shared by every patched material: the roof opening drives the bowl's sky visibility (see tpSky).
const BOWL_SKY={value:new THREE.Vector4(0,0,ROOF_Y,.32)};
// The opening is the ring's inner outline (corner centres plus elliptical radii of o - 3 and o - 2 m, roof.ts),
// taken as a rectangle a little inside its rounded corners.
export function setBowlOpening(o:number){BOWL_SKY.value.x=BOWL.cornerX+(o-3)*.85;BOWL_SKY.value.y=BOWL.cornerZ+(o-2)*.85;}
setBowlOpening(8);
const pixel=(r:number,g:number,b:number,srgb=false)=>{const t=new THREE.DataTexture(new Uint8Array([r,g,b,255]),1,1);if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;};
// Shared placeholders, never disposed (three frees their GL copies with the renderer).
const WHITE=pixel(255,255,255,true),FLAT=pixel(128,128,255),ORM=pixel(255,255,0);

const VERTEX_HEAD=/* glsl */`
varying vec3 vTpPos;
varying vec3 vTpNormal;`;
const VERTEX=/* glsl */`
vec4 tpWorld=vec4(transformed,1.0);
#ifdef USE_INSTANCING
tpWorld=instanceMatrix*tpWorld;
#endif
vTpPos=(modelMatrix*tpWorld).xyz;
vTpNormal=inverseTransformDirection(transformedNormal,viewMatrix);`;
const FRAGMENT_HEAD=/* glsl */`
varying vec3 vTpPos;
varying vec3 vTpNormal;
uniform sampler2D tpMap,tpNormalMap,tpOrmMap;
uniform float tpOn,tpScale,tpMono,tpContrast,tpNormal,tpRough,tpAo,tpMacro,tpGlass,tpJoint,tpWear;
uniform vec3 tpRing; // corner centre (x, z) and the arc radius used for u (0: triplanar)
uniform vec4 tpBowl; // roof opening half-size (x, z), roof soffit height, bounce floor
// Bowl sky visibility: the cosine-weighted share of the sky a point inside the stadium sees through the roof
// opening (the closed-form view factor from a point to a parallel rectangle above it, by inclusion–exclusion).
float tpCorner(float a,float b){float p=sqrt(1.+a*a),q=sqrt(1.+b*b);return a/p*atan(b/p)+b/q*atan(a/q);}
float tpSky(vec3 p,vec3 n){
  vec2 q=max(abs(p.xz)-vec2(${BOWL.cornerX.toFixed(1)},${BOWL.cornerZ.toFixed(1)}),0.);
  float h=tpBowl.z-p.y;if(h<.05||length(q)>${(BOWL.wallRadius+.2).toFixed(2)})return 1.;
  vec2 lo=(-tpBowl.xy-p.xz)/h,hi=(tpBowl.xy-p.xz)/h;
  float f=(tpCorner(hi.x,hi.y)-tpCorner(lo.x,hi.y)-tpCorner(hi.x,lo.y)+tpCorner(lo.x,lo.y))/6.2831853;
  return mix(tpBowl.w,1.,clamp(f,0.,1.)*mix(.6,1.,max(n.y,0.)));
}
float tpHash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float tpNoise(vec3 x){
  vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(tpHash(i),tpHash(i+vec3(1,0,0)),f.x),mix(tpHash(i+vec3(0,1,0)),tpHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(tpHash(i+vec3(0,0,1)),tpHash(i+vec3(1,0,1)),f.x),mix(tpHash(i+vec3(0,1,1)),tpHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
// Cotangent frame from screen derivatives (Schüler), for the ring mapping whose tangents turn round the arcs.
mat3 tpFrame(vec3 N,vec3 p,vec2 st){
  vec3 dp1=dFdx(p),dp2=dFdy(p);vec2 d1=dFdx(st),d2=dFdy(st);
  vec3 a=cross(dp2,N),b=cross(N,dp1),T=a*d1.x+b*d2.x,B=a*d1.y+b*d2.y;
  float k=inversesqrt(max(max(dot(T,T),dot(B,B)),1e-20));return mat3(T*k,B*k,N);
}`;
// Samples colour, ORM and the perturbed world normal. KTX2 rows run top-down, so v is negated: image-up is
// world-up (or outward on flat faces) and an OpenGL normal map's green points along it.
const SAMPLE=/* glsl */`
vec3 tpN=normalize(vTpNormal);
#ifdef DOUBLE_SIDED
tpN*=gl_FrontFacing?1.:-1.;
#endif
vec3 tpCol=vec3(0.),tpOrm=vec3(0.),tpWN=tpN;vec2 tpSR=vec2(0.);
{
  vec3 p=vTpPos/tpScale;
if(tpRing.z>0.){
  vec2 a=abs(vTpPos.xz),r=max(a-tpRing.xy,0.);float rl=length(r),s;
  if(a.x<=tpRing.x)s=a.x;else if(a.y<=tpRing.y)s=tpRing.x+tpRing.z*1.5707963+tpRing.y-a.y;else s=tpRing.x+tpRing.z*atan(r.x,r.y);
  tpSR=vec2(s,rl);
  float wt=smoothstep(.55,.8,abs(tpN.y)),ws=1.-wt;vec3 tn=vec3(0.);
  if(ws>0.){vec2 st=vec2(s,vTpPos.y)/tpScale;tpCol+=texture2D(tpMap,st*vec2(1,-1)).rgb*ws;tpOrm+=texture2D(tpOrmMap,st*vec2(1,-1)).rgb*ws;
    tn+=tpFrame(tpN,vTpPos,st)*(texture2D(tpNormalMap,st*vec2(1,-1)).xyz*2.-1.)*vec3(tpNormal,tpNormal,1.)*ws;}
  if(wt>0.){vec2 st=vec2(s,rl)/tpScale;tpCol+=texture2D(tpMap,st*vec2(1,-1)).rgb*wt;tpOrm+=texture2D(tpOrmMap,st*vec2(1,-1)).rgb*wt;
    tn+=tpFrame(tpN,vTpPos,st)*(texture2D(tpNormalMap,st*vec2(1,-1)).xyz*2.-1.)*vec3(tpNormal,tpNormal,1.)*wt;}
  tpWN=normalize(tn);
}else{
  vec3 w=pow(abs(tpN),vec3(6.));w/=w.x+w.y+w.z;vec3 sg=sign(tpN)+vec3(equal(tpN,vec3(0.)));
  vec2 ux=vec2(p.z*sg.x,-p.y),uy=vec2(p.x*sg.y,-p.z),uz=vec2(-p.x*sg.z,-p.y);
  vec3 nx=vec3(0.,0.,1.),ny=nx,nz=nx;
  if(w.x>.01){tpCol+=texture2D(tpMap,ux).rgb*w.x;tpOrm+=texture2D(tpOrmMap,ux).rgb*w.x;nx=texture2D(tpNormalMap,ux).xyz*2.-1.;nx.x*=sg.x;}
  if(w.y>.01){tpCol+=texture2D(tpMap,uy).rgb*w.y;tpOrm+=texture2D(tpOrmMap,uy).rgb*w.y;ny=texture2D(tpNormalMap,uy).xyz*2.-1.;ny.x*=sg.y;}
  if(w.z>.01){tpCol+=texture2D(tpMap,uz).rgb*w.z;tpOrm+=texture2D(tpOrmMap,uz).rgb*w.z;nz=texture2D(tpNormalMap,uz).xyz*2.-1.;nz.x*=-sg.z;}
  tpCol/=max(w.x*step(.01,w.x)+w.y*step(.01,w.y)+w.z*step(.01,w.z),1e-4);tpOrm/=max(w.x*step(.01,w.x)+w.y*step(.01,w.y)+w.z*step(.01,w.z),1e-4);
  // Whiteout blend (Golus): each projection's tangent normal is added to the surface normal's matching swizzle.
  nx.xy*=tpNormal;ny.xy*=tpNormal;nz.xy*=tpNormal;
  nx=vec3(nx.xy+tpN.zy,abs(nx.z)*tpN.x);ny=vec3(ny.xy+tpN.xz,abs(ny.z)*tpN.y);nz=vec3(nz.xy+tpN.xy,abs(nz.z)*tpN.z);
  tpWN=normalize(nx.zyx*w.x+ny.xzy*w.y+nz.xyz*w.z);
}
}
vec3 tpMeanC=textureLod(tpMap,vec2(.5),16.).rgb,tpMeanO=textureLod(tpOrmMap,vec2(.5),16.).rgb;
float tpMacroN=(tpNoise(vTpPos/23.)*.65+tpNoise(vTpPos/7.3)*.35-.5)*2.;
{
  const vec3 L=vec3(.2126,.7152,.0722);
  vec3 detail=mix(tpCol/max(tpMeanC,vec3(1e-3)),vec3(dot(tpCol,L)/max(dot(tpMeanC,L),1e-3)),tpMono);
  detail=mix(vec3(1.),detail,tpContrast*tpOn);
  diffuseColor.rgb*=clamp(detail,0.,2.5)*(1.+tpMacro*tpMacroN);
  // Paving panels: a tone per panel and dark joints, faded out where a joint is under a pixel wide.
  if(tpJoint>0.&&tpRing.z>0.)diffuseColor.rgb*=.965+.07*tpHash(vec3(floor(tpSR.x/tpJoint),floor(tpSR.y/9.),sign(vTpPos.x)*2.+sign(vTpPos.z)));
  else if(tpJoint>0.&&tpN.y>.7){
    vec2 c=vTpPos.xz/tpJoint,e=abs(fract(c+.5)-.5)*tpJoint;float fw=length(fwidth(vTpPos.xz));
    float line=(1.-smoothstep(.03,.03+fw,min(e.x,e.y)))*clamp(.06/max(fw,1e-4),.25,1.);
    diffuseColor.rgb*=(.93+.14*tpHash(vec3(floor(c),.5).xzy))*(1.-.45*line);
  }
  // Pitch wear: the goalmouths and the middle, drier and lighter, broken up by the macro noise.
  if(tpWear>0.){vec2 q=vTpPos.xz;float w=max(1.-length((abs(q)-vec2(0.,48.5))/vec2(9.,5.5)),0.)+.55*max(1.-length(q/vec2(10.,15.)),0.);
    diffuseColor.rgb*=mix(vec3(1.),vec3(1.18,1.06,.72),clamp(w*(.75+.8*tpMacroN)*tpWear,0.,1.));}
  // Glass: a tint and brightness per pane, since the rooms behind it are not all alike.
  if(tpGlass>1.5){
    // Façade (Task 7): panes on the secondary-mullion grid (distance round the outline, as shell.ts places them) and
    // per glazing row. Some panes have blinds drawn part-way down; the floor slab shows behind the top of each row.
    vec2 a=abs(vTpPos.xz),r=max(a-vec2(${BOWL.cornerX.toFixed(1)},${BOWL.cornerZ.toFixed(1)}),0.);float s;
    if(a.x<=${BOWL.cornerX.toFixed(1)})s=a.x;else if(a.y<=${BOWL.cornerZ.toFixed(1)})s=${(BOWL.cornerX+BOWL.wallRadius*Math.PI/2+BOWL.cornerZ).toFixed(4)}-a.y;
    else s=${BOWL.cornerX.toFixed(1)}+${BOWL.wallRadius.toFixed(2)}*atan(r.x,r.y);
    float row=floor(vTpPos.y/8.5),h=row<.5?${GLASS_ROWS[0].toFixed(1)}:row<1.5?${GLASS_ROWS[1].toFixed(1)}:row<2.5?${GLASS_ROWS[2].toFixed(1)}:${GLASS_ROWS[3].toFixed(1)},ly=vTpPos.y-h;
    vec3 id=vec3(floor(s/${PANE.toFixed(5)}),row,sign(vTpPos.x)*2.+sign(vTpPos.z));
    float k=tpHash(id+.5),b=tpHash(id+7.3);
    diffuseColor.rgb*=.8+.4*k;
    if(b>.66&&ly>${GLASS_HALF.toFixed(2)}-.4-1.9*fract(b*7.13))diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.16,.16,.15),.7);
    if(ly>${(GLASS_HALF-.3).toFixed(2)})diffuseColor.rgb*=.55;
  }else if(tpGlass>0.)diffuseColor.rgb*=.82+.36*tpHash(floor(vTpPos/vec3(1.6,2.7,1.6))+.5);
}`;
const ROUGH=/* glsl */`
roughnessFactor=clamp(roughnessFactor*mix(1.,tpOrm.g/max(tpMeanO.g,.02),tpRough*tpOn)*(1.+tpMacro*.6*tpMacroN),.04,1.);`;
// normal_fragment_begin has set the interpolated normal; replace it with the mapped one, in view space.
const NORMAL=/* glsl */`
normal=normalize((viewMatrix*vec4(mix(tpN,tpWN,tpOn),0.)).xyz);`;
// Texture occlusion, then the bowl's large-scale sky occlusion (screen-space GTAO only reaches a metre or two).
const AO=/* glsl */`
reflectedLight.indirectDiffuse*=mix(1.,tpOrm.r,tpAo*tpOn);
{float v=tpSky(vTpPos,tpN);reflectedLight.indirectDiffuse*=v;reflectedLight.indirectSpecular*=mix(1.,v,.85);}`;

export interface Patched { tp:Uniforms; surface:Surface }
// Patches a standard or physical material in place. All per-material settings are uniforms.
export function surface<M extends THREE.MeshStandardMaterial>(material:M,s:Surface={}):M{
  const tp:Uniforms={tpMap:{value:WHITE},tpNormalMap:{value:FLAT},tpOrmMap:{value:ORM},tpOn:{value:0},tpScale:{value:s.scale??2},
    tpMono:{value:s.mono??0},tpContrast:{value:s.contrast??1},tpNormal:{value:s.normal??1},tpRough:{value:s.rough??1},tpAo:{value:s.ao??.8},
    tpMacro:{value:s.macro??0},tpJoint:{value:s.joint??0},tpWear:{value:s.wear??0},tpGlass:{value:s.glass==='facade'?2:s.glass?1:0},tpRing:{value:new THREE.Vector3(BOWL.cornerX,BOWL.cornerZ,s.ring??0)},tpBowl:BOWL_SKY};
  material.userData.tp=tp;material.userData.surface=s;
  // One program for every mapping mode (the mode is a uniform), so the heavy patched shader compiles as few times
  // as three's own variants allow: first-frame compile time is a Task 11 budget.
  material.customProgramCacheKey=()=>'explorer-surface';
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,tp);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>${VERTEX_HEAD}`).replace('#include <project_vertex>',`#include <project_vertex>${VERTEX}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>${FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>',`#include <color_fragment>${SAMPLE}`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>${ROUGH}`)
      .replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>${NORMAL}`)
      .replace('#include <aomap_fragment>',`#include <aomap_fragment>${AO}`);
  };
  return material;
}
// Swaps a loaded set in: one uniform write per map, then tpOn = 1.
export function applySet(material:THREE.Material,set:TextureSet){
  const tp=material.userData.tp as Uniforms|undefined;if(!tp)return;
  tp.tpMap.value=set.color;tp.tpOrmMap.value=set.orm;tp.tpNormalMap.value=set.normal??FLAT;tp.tpOn.value=1;
}

// The stadium's library. Colours are the final palette; roughness is the mean the textures vary around.
export const BRAND_YELLOW=0xf6c900;
export function stadiumMaterials(){
  const std=(color:number,roughness:number,metalness:number,s?:Surface,extra:THREE.MeshStandardMaterialParameters={})=>surface(new THREE.MeshStandardMaterial({color,roughness,metalness,...extra}),s);
  const R=BOWL.wallRadius;
  const concrete={set:'concrete',scale:2.71,mono:.35,contrast:.9,macro:.07,normal:.8};
  const precast={set:'precast',scale:2.5,mono:.4,contrast:.8,macro:.05,normal:.6};
  const glass=(color:number,kind:Surface['glass']=true)=>surface(new THREE.MeshPhysicalMaterial({color,roughness:.06,metalness:0,ior:1.5,specularIntensity:1,envMapIntensity:1.15}),{glass:kind});
  return {
    concrete:std(0x7c807a,.9,0,concrete),tread:std(0x858882,.85,0,precast),soffit:std(0x6a6e69,.92,0,concrete),
    terrace:std(0x8e8a6a,.85,0,precast),edge:std(0x60655f,.85,0,concrete),apron:std(0x74746c,.8,0,{set:'paving',scale:1.8,mono:.5,contrast:1,macro:.16,joint:6}),
    cornerSeatA:std(0xe0b912,.55,0),cornerSeatB:std(0x252c29,.55,0),
    yellow:std(BRAND_YELLOW,.6,0,{...precast,mono:1,contrast:.5}),pylon:std(BRAND_YELLOW,.42,0,{set:'paintedSteel',scale:2.5,mono:1,contrast:.35,normal:.5,rough:.6}),
    steel:std(0x9aa3a2,.42,.75,{set:'paintedSteel',scale:2.5,mono:1,contrast:.4,normal:.4}),dark:std(0x151b1e,.95,0),
    glass:glass(0x24343a),facadeGlass:glass(0x22323a,'facade'),doorGlass:glass(0x1b2629),coreGlass:glass(0x1f2d33),
    // Task 7: floor-slab noses and landings (precast), dark metal reveals and door frames, the stair cores, the gutter.
    slabEdge:std(0x8f928b,.8,0,precast),reveal:std(0x2b3131,.55,.4,{set:'paintedSteel',scale:2.5,mono:1,contrast:.3,normal:.3}),
    core:std(0x7f837c,.88,0,{...concrete,macro:.09}),
    // Task 8: the podium's grassed embankments.
    bank:std(0x4c6238,.96,0,{set:'grass',scale:2.2,mono:.4,contrast:.8,macro:.15}),gutter:std(0x4b5351,.45,.5,{set:'paintedSteel',scale:2.5,mono:1,contrast:.3,normal:.3}),
    cladding:std(0x6a7876,.5,.12,{set:'cladding',scale:2,ring:R,mono:1,contrast:.7,macro:.06,normal:1}),
    plinth:std(0x3d4441,.9,0,{...concrete,macro:.1}),louvre:std(0x262d2d,.55,.5,{set:'cladding',scale:.8,ring:R,mono:1,contrast:.9}),
    parapet:std(0x6c736f,.8,0,precast),
    transom:std(0x9aa3a1,.42,.35,{set:'paintedSteel',scale:2.5,mono:1,contrast:.3,normal:.3}),mullion:std(0x9ea7a5,.42,.35,{set:'paintedSteel',scale:2.5,mono:1,contrast:.3,normal:.3}),
    roofTop:std(0xaab0ac,.5,.25,{set:'roofSheet',scale:2,ring:BOWL.roofRadius*.6,mono:1,contrast:.3,macro:.08,normal:.55,joint:3}),
    roofSoffit:std(0x565d5b,.75,.25,{set:'roofSheet',scale:2,ring:BOWL.roofRadius*.6,mono:1,contrast:.8,normal:.8}),
    roofEdge:std(0x5d6563,.5,.15,{set:'cladding',scale:1.6,ring:BOWL.roofRadius,mono:1,contrast:.6}),
    polycarbonate:new THREE.MeshStandardMaterial({color:0xe4ecea,roughness:.85,transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide}),
    white:new THREE.MeshBasicMaterial({color:0xe5eadd}),
  };
}
// Pitch turf: the 14 mowing stripes stay a per-instance colour modulation on top of the texture.
export const turfMaterial=(color=0xffffff,wear=0)=>surface(new THREE.MeshStandardMaterial({color,roughness:.95}),{set:'turf',scale:2.2,mono:.2,contrast:.8,macro:.05,normal:.6,wear});
// One shared seat material: per-instance colours carry the palette and the discovery dimming.
export const seatMaterial=()=>surface(new THREE.MeshStandardMaterial({roughness:.5}));
// Sets every patched material under `root` whose surface names a loaded set.
export function applyTextures(root:THREE.Object3D,sets:Record<string,TextureSet>){
  const done=new Set<THREE.Material>();
  root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
    if(done.has(m))continue;done.add(m);const name=(m.userData.surface as Surface|undefined)?.set;if(name&&sets[name])applySet(m,sets[name]);
  }});
  return done.size;
}
