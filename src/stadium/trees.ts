import * as THREE from 'three';
import { surface } from './materials';
import { GROUND_Y } from './ground';

// Trees (Task 8): three broadleaf species (oak, hornbeam, maple), built in-repo from the approved CC0 bark and leaf
// sets. Each tree is a tapered trunk, six branches and 150 foliage cards (about 370 triangles). The cards carry a
// foliage-clump texture baked on the GPU from single leaves of the species' CC0 leaf atlas (until the atlas loads,
// from leaves drawn on a canvas). Levels of detail:
//  - near (desktop, within LOD.far of the camera): the full tree, instanced per species
//  - far (and every tree on compact): a camera-facing impostor, baked at runtime from the near tree into albedo and
//    world-normal atlases (8 azimuths × 3 elevations per species), so it is lit by the same sun, sky and shadows
//  - between LOD.near and LOD.far both draw with complementary screen-door dithers, so the switch never pops
// Trees near the stadium cast into the static shadow map through shadow-only proxies (the near LOD would make the
// map depend on where the camera was). An optional sway follows the match clock, so it stops with the atmosphere.
export const LOD={near:230,far:262};
const CROWN={radius:4,centre:7.4},BOUND={centre:6.2,radius:7.2}; // the base tree (crown radius 4 m); instances scale it
const VIEWS={az:8,el:3,px:128},ELEVATIONS=[15,42,70];
interface Species { name:string; atlas:string; grid:[number,number]; crown:[number,number,number]; tint:number; cards:number; seed:number; leaf:[number,number] }
export const SPECIES:Species[]=[
  {name:'oak',atlas:'leaves-oak',grid:[3,2],crown:[1.05,.82,1.05],tint:0x6b8144,cards:220,seed:11,leaf:[.07,.1]},
  {name:'hornbeam',atlas:'leaves-hornbeam',grid:[3,2],crown:[.86,1.08,.86],tint:0x77904c,cards:220,seed:23,leaf:[.055,.08]},
  {name:'maple',atlas:'leaves-maple',grid:[2,2],crown:[1,.92,1],tint:0x6e8a47,cards:220,seed:37,leaf:[.075,.105]},
];
const rng=(seed:number)=>()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);

// The near tree of one species: bark (trunk and branches) and foliage cards, in tree space (base at the origin).
function treeGeometry(sp:Species){
  const r=rng(sp.seed),bark:THREE.BufferGeometry[]=[],up=new THREE.Vector3(0,1,0);
  const trunk=new THREE.CylinderGeometry(.2,.38,CROWN.centre,7,1,true).translate(0,CROWN.centre/2,0);bark.push(trunk);
  for(let k=0;k<6;k++){
    const a=k/6*Math.PI*2+r()*.6,y0=CROWN.centre*(.5+r()*.25),len=2.4+r()*1.4,rise=.7+r()*.5;
    const dir=new THREE.Vector3(Math.cos(a),rise,Math.sin(a)).normalize(),g=new THREE.CylinderGeometry(.06,.13,len,5,1,true).translate(0,len/2,0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up,dir));g.translate(0,y0,0);bark.push(g);
  }
  const p:number[]=[],n:number[]=[],uv:number[]=[],col:number[]=[],idx:number[]=[],[cx,cy,cz]=sp.crown,R=CROWN.radius;
  const centre=new THREE.Vector3(0,CROWN.centre,0);
  for(let i=0;i<sp.cards;i++){
    // A point in the crown ellipsoid, biased to the shell; the card faces roughly outward.
    const u=r()*2-1,t=r()*Math.PI*2,s=Math.sqrt(1-u*u),k=.45+.55*Math.sqrt(r());
    const radial=new THREE.Vector3(s*Math.cos(t),u,s*Math.sin(t)),c=new THREE.Vector3(radial.x*cx*R*k,radial.y*cy*R*k,radial.z*cz*R*k).add(centre);
    const normal=radial.clone().add(new THREE.Vector3(r()-.5,r()-.5,r()-.5).multiplyScalar(1.2)).normalize();
    const side=new THREE.Vector3().crossVectors(normal,Math.abs(normal.y)>.9?new THREE.Vector3(1,0,0):up).normalize(),top=new THREE.Vector3().crossVectors(side,normal);
    const spin=r()*Math.PI*2,size=1.45+r()*.8;side.applyAxisAngle(normal,spin);top.applyAxisAngle(normal,spin);
    // Inner and lower cards are darker: the crown shades itself.
    const shade=.6+.4*k*(.75+.25*(radial.y*.5+.5));
    const base=p.length/3;
    for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
      const v=c.clone().addScaledVector(side,a*size/2).addScaledVector(top,b*size/2);p.push(v.x,v.y,v.z);
      // Spherical normals from the crown centre: foliage shades as one volume, not as flat cards.
      const sn=v.clone().sub(centre);sn.set(sn.x/cx,sn.y/cy,sn.z/cz).normalize().lerp(normal,.25).normalize();n.push(sn.x,sn.y,sn.z);
      uv.push((a+1)/2,(b+1)/2);col.push(shade,shade,shade);
    }
    idx.push(base,base+1,base+2,base,base+2,base+3);
  }
  const leaves=new THREE.BufferGeometry();leaves.setAttribute('position',new THREE.Float32BufferAttribute(p,3));leaves.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));
  leaves.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));leaves.setAttribute('color',new THREE.Float32BufferAttribute(col,3));leaves.setIndex(idx);
  const merged=mergeSimple(bark);bark.forEach(g=>g.dispose());
  return {bark:merged,leaves};
}
// Merges non-indexed/indexed cylinder pieces (position, normal, uv) into one indexed geometry.
function mergeSimple(list:THREE.BufferGeometry[]){
  const p:number[]=[],n:number[]=[],uv:number[]=[],idx:number[]=[];
  for(const g of list){const base=p.length/3;p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);uv.push(...g.attributes.uv.array);(g.index?Array.from(g.index.array):[...Array(g.attributes.position.count).keys()]).forEach(i=>idx.push(base+i));}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);return g;
}

// A foliage clump drawn on a canvas: the first-frame stand-in for the baked CC0 clump (and the fallback).
function canvasClump(sp:Species){
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d')!,r=rng(sp.seed*7);
  g.fillStyle='rgba(96,122,62,0)';g.fillRect(0,0,256,256);
  for(let i=0;i<260;i++){
    const a=r()*Math.PI*2,d=Math.sqrt(r())*104,x=128+Math.cos(a)*d,y=128+Math.sin(a)*d,l=.55+.45*r();
    g.save();g.translate(x,y);g.rotate(r()*Math.PI*2);g.fillStyle=`rgb(${Math.round(120*l)},${Math.round(150*l)},${Math.round(72*l)})`;
    g.beginPath();g.ellipse(0,0,4+r()*2.5,9+r()*4,0,0,Math.PI*2);g.fill();g.restore();
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
// Screen-door dither (interleaved gradient noise) shared by both LODs: near keeps fragments where it is above the
// fade, far where it is below, so in the band each pixel shows exactly one of the two.
const DITHER='float lodDither(){return fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));}';
const FADE=`smoothstep(${LOD.near.toFixed(1)},${LOD.far.toFixed(1)},lodDist)`;
// Alpha test that keeps foliage from thinning out in coarse mips (alpha scaled up with the mip level).
const MIP_ALPHA=(uv:string,map:string)=>`{vec2 sz=vec2(textureSize(${map},0));vec2 dx=dFdx(${uv}*sz),dy=dFdy(${uv}*sz);float lod=max(0.,.5*log2(max(dot(dx,dx),dot(dy,dy))));diffuseColor.a*=1.+lod*.28;}`;

function leafMaterial(sp:Species,clump:THREE.Texture,time:{value:number},dither=true){
  const m=new THREE.MeshStandardMaterial({color:sp.tint,map:clump,alphaTest:.5,side:THREE.DoubleSide,vertexColors:true,roughness:.78});
  m.customProgramCacheKey=()=>'explorer-leaves';
  m.onBeforeCompile=s=>{
    s.uniforms.uTime=time;
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime;varying float lodDist;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
vec3 lodBase=(modelMatrix*instanceMatrix*vec4(0,0,0,1)).xyz;lodDist=distance(cameraPosition,lodBase+vec3(0,${BOUND.centre.toFixed(1)}*length(instanceMatrix[0].xyz),0));
{float ph=dot(lodBase.xz,vec2(.13,.07)),k=max(position.y-4.,0.)*.012;transformed.x+=sin(uTime*1.6+ph)*k;transformed.z+=cos(uTime*1.3+ph*1.7)*k;}`);
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\nvarying float lodDist;\n${DITHER}`)
      .replace('#include <alphatest_fragment>',`${MIP_ALPHA('vMapUv','map')}\n#include <alphatest_fragment>\n${dither?`if(lodDither()<${FADE})discard;`:''}`)
      // Spherical normals stay outward on both faces of a card.
      .replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(vNormal);');
  };
  return m;
}
function barkMaterial(dither=true){
  const m=surface(new THREE.MeshStandardMaterial({color:0x5d5243,roughness:.9}),{set:'bark',scale:1,mono:.3,contrast:1,normal:1});
  const inner=m.onBeforeCompile.bind(m);m.customProgramCacheKey=()=>'explorer-surface-bark';
  m.onBeforeCompile=(s,r)=>{inner(s,r);
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying float lodDist;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>\nlodDist=distance(cameraPosition,(modelMatrix*instanceMatrix*vec4(0,${BOUND.centre.toFixed(1)},0,1)).xyz);`);
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\nvarying float lodDist;\n${DITHER}`)
      .replace('#include <alphatest_fragment>',`#include <alphatest_fragment>\n${dither?`if(lodDither()<${FADE})discard;`:''}`);
  };
  return m;
}
// Impostor: one camera-facing quad per tree. It picks the baked view nearest the camera's direction (world-aligned,
// so the sunlit side is where the sun is), samples albedo and world normal, and is lit like everything else.
function impostorMaterial(albedo:THREE.Texture,normals:THREE.Texture,always:boolean){
  // 0.9: the flat quad takes less contact shading than the near tree's inner cards; this matches their brightness.
  const m=new THREE.MeshStandardMaterial({map:albedo,alphaTest:.5,roughness:.85});m.color.setScalar(.9);m.customProgramCacheKey=()=>'explorer-impostor';
  m.onBeforeCompile=s=>{
    s.uniforms.uNormals={value:normals};
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute float aSpecies;varying vec2 imUv;varying float lodDist;vec3 imPos,imF;')
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
float imScale=length(instanceMatrix[0].xyz);vec3 imCtr=(modelMatrix*instanceMatrix*vec4(0,0,0,1)).xyz+vec3(0,${BOUND.centre.toFixed(2)}*imScale,0);
vec3 imTo=cameraPosition-imCtr;lodDist=length(imTo);imF=imTo/lodDist;
float imAz=atan(imF.x,imF.z),imEl=asin(clamp(imF.y,-1.,1.));
float imA=mod(floor(imAz/6.2831853*${VIEWS.az}.+.5),${VIEWS.az}.),imE=imEl<${((ELEVATIONS[0]+ELEVATIONS[1])/2*Math.PI/180).toFixed(4)}?0.:imEl<${((ELEVATIONS[1]+ELEVATIONS[2])/2*Math.PI/180).toFixed(4)}?1.:2.;
vec3 imR=normalize(cross(vec3(0,1,0),imF)),imU=cross(imF,imR);
imPos=imCtr+(imR*position.x+imU*position.y)*${(BOUND.radius*2).toFixed(2)}*imScale;
imUv=(vec2(imA,imE+aSpecies*${VIEWS.el}.)+uv)/vec2(${VIEWS.az}.,${VIEWS.el*SPECIES.length}.);`)
      .replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\ntransformedNormal=normalize((viewMatrix*vec4(imF,0.)).xyz);')
      .replace('#include <project_vertex>','vec4 mvPosition=viewMatrix*vec4(imPos,1.);gl_Position=projectionMatrix*mvPosition;')
      .replace('#include <worldpos_vertex>','vec4 worldPosition=vec4(imPos,1.);');
    s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\nuniform sampler2D uNormals;varying vec2 imUv;varying float lodDist;\n${DITHER}`)
      .replace('#include <map_fragment>','diffuseColor*=texture2D(map,imUv);')
      .replace('#include <alphatest_fragment>',`${MIP_ALPHA('imUv','map')}\n#include <alphatest_fragment>\n${always?'':`if(lodDither()>=${FADE})discard;`}`)
      .replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize((viewMatrix*vec4(texture2D(uNormals,imUv).xyz*2.-1.,0.)).xyz);');
  };
  return m;
}
// Bake passes: albedo (foliage texture × card shade × species tint; bark a flat bark colour) or world normal.
function bakeMaterial(mode:0|1,map:THREE.Texture|null,tint:THREE.Color){
  return new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{map:{value:map},hasMap:{value:map?1:0},mode:{value:mode},tint:{value:tint}},
    vertexShader:`attribute vec3 color;varying vec2 vUv;varying vec3 vN;varying vec3 vC;void main(){vUv=uv;vN=normal;
      #ifdef USE_COLOR_ATTR
      vC=color;
      #else
      vC=vec3(1.);
      #endif
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D map;uniform float hasMap,mode;uniform vec3 tint;varying vec2 vUv;varying vec3 vN;varying vec3 vC;
      void main(){vec4 c=hasMap>.5?texture2D(map,vUv):vec4(1.);if(c.a<.5)discard;
        gl_FragColor=mode<.5?linearToOutputTexel(vec4(c.rgb*vC*tint,1.)):vec4(normalize(vN)*.5+.5,1.);}`,
    defines:map?{USE_COLOR_ATTR:''}:{}});
}

export interface TreeSite { x:number; z:number; r:number; shade:number }
// force (dev only, ?trees=near|far): every tree at one level of detail, for the impostor fidelity check.
export function buildTrees(sites:TreeSite[],compact:boolean,force:'near'|'far'|null=null){
  const root=new THREE.Group();root.name='Trees';
  const time={value:0},r=rng(1909),bark=barkMaterial(!force),geoms=SPECIES.map(treeGeometry);
  const clumps:THREE.Texture[]=SPECIES.map(canvasClump);
  const leafMats=SPECIES.map((sp,i)=>leafMaterial(sp,clumps[i],time,!force));
  // Per tree: species, matrix (random yaw, scale from the site radius) and a tint.
  const trees=sites.map(s=>{
    const species=Math.floor(r()*SPECIES.length),scale=s.r/CROWN.radius,m=new THREE.Matrix4().compose(new THREE.Vector3(s.x,GROUND_Y,s.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),r()*Math.PI*2),new THREE.Vector3(scale,scale*(.9+r()*.25),scale));
    const c=new THREE.Color().setHSL(.15+r()*.13,.2+r()*.24,.42+r()*.24+s.shade*.02); // Task 9: wider spread, crowns read less alike
    return {species,m,c,centre:new THREE.Vector3(s.x,GROUND_Y+BOUND.centre*scale,s.z)};
  });
  const count=SPECIES.map((_,i)=>trees.filter(t=>t.species===i).length);
  const near=SPECIES.map((_,i)=>{
    const leaves=new THREE.InstancedMesh(geoms[i].leaves,leafMats[i],Math.max(1,count[i])),trunks=new THREE.InstancedMesh(geoms[i].bark,bark,Math.max(1,count[i]));
    for(const mesh of [leaves,trunks]){mesh.count=0;mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);}
    leaves.name=`tree-leaves-${SPECIES[i].name}`;trunks.name=`tree-trunks-${SPECIES[i].name}`;
    leaves.setColorAt(0,new THREE.Color());leaves.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    return {leaves,trunks};
  });
  // Impostor atlases (albedo sRGB, normals linear): 8 azimuths across, 3 elevations × 3 species down.
  const W=VIEWS.az*VIEWS.px,H=VIEWS.el*SPECIES.length*VIEWS.px;
  const albedo=new THREE.WebGLRenderTarget(W,H,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter}),normals=new THREE.WebGLRenderTarget(W,H,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
  albedo.texture.colorSpace=THREE.SRGBColorSpace;
  const quad=new THREE.PlaneGeometry(1,1),species=new THREE.InstancedBufferAttribute(new Float32Array(trees.length),1);species.setUsage(THREE.DynamicDrawUsage);
  quad.setAttribute('aSpecies',species);
  const far=new THREE.InstancedMesh(quad,impostorMaterial(albedo.texture,normals.texture,compact||!!force),Math.max(1,trees.length));far.name='tree-impostors';
  far.count=0;far.frustumCulled=false;far.receiveShadow=true;far.castShadow=false;far.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  far.setColorAt(0,new THREE.Color());far.instanceColor!.setUsage(THREE.DynamicDrawUsage);root.add(far);
  // Shadow-only proxies: every tree inside the sun's shadow box, at full detail (pipeline shows them in the shadow pass only).
  const shadowOnly:THREE.Object3D[]=[];
  SPECIES.forEach((_,i)=>{
    const list=trees.filter(t=>t.species===i&&Math.abs(t.m.elements[12])<170&&Math.abs(t.m.elements[14])<170);if(!list.length)return;
    for(const [g,mat] of [[geoms[i].leaves,leafMats[i]],[geoms[i].bark,bark]] as const){
      const mesh=new THREE.InstancedMesh(g,mat,list.length);list.forEach((t,k)=>mesh.setMatrixAt(k,t.m));mesh.computeBoundingSphere();
      mesh.castShadow=true;mesh.visible=false;mesh.name='tree-shadow-proxy';root.add(mesh);shadowOnly.push(mesh);
    }
  });

  // A clump is a canvas texture or a baked render target's texture: free whichever it is.
  const freeClump=(t:THREE.Texture)=>{const rt=(t as THREE.Texture&{__rt?:THREE.WebGLRenderTarget}).__rt;if(rt)rt.dispose();else t.dispose();};
  // Bakes the foliage clumps from the CC0 leaf atlases (when given) and the impostor atlases from the near trees.
  let baked=false;
  function bake(renderer:THREE.WebGLRenderer,atlases?:Record<string,THREE.Texture>){
    const prevTarget=renderer.getRenderTarget(),prevClear=renderer.getClearColor(new THREE.Color()),prevAlpha=renderer.getClearAlpha(),prevTone=renderer.toneMapping;
    renderer.toneMapping=THREE.NoToneMapping;
    const scene=new THREE.Scene(),cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,200);
    if(atlases)SPECIES.forEach((sp,i)=>{
      const atlas=atlases[sp.atlas];if(!atlas)return;
      // Leaves stamped into a 512² clump: denser at the centre, random cell, turn and size, darker toward the back.
      const rr=rng(sp.seed*13),p:number[]=[],uv:number[]=[],col:number[]=[],idx:number[]=[],[gx,gy]=sp.grid;
      for(let k=0;k<420;k++){
        const a=rr()*Math.PI*2,d=Math.pow(rr(),.6)*.86,x=Math.cos(a)*d,y=Math.sin(a)*d,rot=rr()*Math.PI*2,sz=(sp.leaf[0]+rr()*(sp.leaf[1]-sp.leaf[0]))*2,cell=Math.floor(rr()*gx*gy);
        const u0=(cell%gx)/gx,v0=Math.floor(cell/gx)/gy,l=.5+.5*rr(),base=p.length/3,c=Math.cos(rot),s=Math.sin(rot);
        for(const [cx,cy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){p.push(x+(cx*c-cy*s)*sz/2,y+(cx*s+cy*c)*sz/2,-k*.001);uv.push(u0+(cx+1)/2/gx,1-(v0+(1-(cy+1)/2)/gy));col.push(l,l*1.02,l*.95);}
        idx.push(base,base+1,base+2,base,base+2,base+3);
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);
      const mat=new THREE.MeshBasicMaterial({map:atlas,vertexColors:true,alphaTest:.5,side:THREE.DoubleSide}),mesh=new THREE.Mesh(g,mat);
      const rt=new THREE.WebGLRenderTarget(512,512,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});rt.texture.colorSpace=THREE.SRGBColorSpace;
      scene.add(mesh);cam.position.set(0,0,10);cam.lookAt(0,0,0);cam.updateProjectionMatrix();
      renderer.setRenderTarget(rt);renderer.setClearColor(0x4f6a2c,0);renderer.clear();renderer.render(scene,cam);scene.remove(mesh);g.dispose();mat.dispose();
      freeClump(clumps[i]);clumps[i]=rt.texture;leafMats[i].map=rt.texture;leafMats[i].needsUpdate=false;
      (rt.texture as THREE.Texture&{__rt?:THREE.WebGLRenderTarget}).__rt=rt;
    });
    // Impostor views: orthographic, framing the tree's bounding sphere, from 8 azimuths at 3 elevations.
    cam.left=cam.bottom=-BOUND.radius;cam.right=cam.top=BOUND.radius;cam.near=.1;cam.far=100;cam.updateProjectionMatrix();
    for(const [target,mode] of [[albedo,0],[normals,1]] as const){
      renderer.setRenderTarget(target);renderer.setClearColor(mode?0x8080ff:0x506a36,0);renderer.clear();
      SPECIES.forEach((sp,i)=>{
        const tint=new THREE.Color(sp.tint),leaves=new THREE.Mesh(geoms[i].leaves,bakeMaterial(mode,clumps[i],tint)),trunk=new THREE.Mesh(geoms[i].bark,bakeMaterial(mode,null,new THREE.Color(0x5d5243)));
        scene.add(leaves,trunk);
        for(let e=0;e<VIEWS.el;e++)for(let a=0;a<VIEWS.az;a++){
          const az=a/VIEWS.az*Math.PI*2,el=ELEVATIONS[e]*Math.PI/180;
          cam.position.set(Math.sin(az)*Math.cos(el)*50,BOUND.centre+Math.sin(el)*50,Math.cos(az)*Math.cos(el)*50);cam.lookAt(0,BOUND.centre,0);
          target.viewport.set(a*VIEWS.px,(i*VIEWS.el+e)*VIEWS.px,VIEWS.px,VIEWS.px);target.scissor.copy(target.viewport);target.scissorTest=true;
          renderer.setRenderTarget(target);renderer.render(scene,cam);
        }
        scene.remove(leaves,trunk);(leaves.material as THREE.Material).dispose();(trunk.material as THREE.Material).dispose();
      });
      target.scissorTest=false;target.viewport.set(0,0,W,H);
    }
    renderer.setRenderTarget(prevTarget);renderer.setClearColor(prevClear,prevAlpha);renderer.toneMapping=prevTone;baked=true;dirty=true;
  }

  // Level-of-detail buckets, refreshed when the camera has moved: near meshes per species, impostors for the rest.
  const last=new THREE.Vector3(Infinity,0,0);let dirty=true;
  function update(camera:THREE.Vector3){
    if(!baked)return false;
    if(!dirty&&last.distanceToSquared(camera)<1)return false;last.copy(camera);dirty=false;
    const n=SPECIES.map(()=>0);let f=0;
    for(const t of trees){
      const d=t.centre.distanceTo(camera);
      const nearOnly=force==='near',farOnly=force==='far';
      if(!farOnly&&(nearOnly||!compact&&d<LOD.far)){const {leaves,trunks}=near[t.species],k=n[t.species]++;leaves.setMatrixAt(k,t.m);trunks.setMatrixAt(k,t.m);leaves.setColorAt(k,t.c);}
      if(!nearOnly&&(farOnly||compact||d>LOD.near)){far.setMatrixAt(f,t.m);far.setColorAt(f,t.c);species.array[f]=t.species;f++;}
    }
    near.forEach(({leaves,trunks},i)=>{leaves.count=trunks.count=n[i];leaves.instanceMatrix.needsUpdate=trunks.instanceMatrix.needsUpdate=leaves.instanceColor!.needsUpdate=true;});
    far.count=f;far.instanceMatrix.needsUpdate=far.instanceColor!.needsUpdate=species.needsUpdate=true;
    return true;
  }
  return {root,shadowOnly,bark,time,bake,update,trees:trees.length,
    get nearCount(){return near.reduce((a,{leaves})=>a+leaves.count,0);},get farCount(){return far.count;},
    dispose(){
      const gs=new Set<THREE.BufferGeometry>([quad,...geoms.flatMap(g=>[g.bark,g.leaves])]);gs.forEach(g=>g.dispose());
      leafMats.forEach(m=>m.dispose());bark.dispose();far.material.dispose();albedo.dispose();normals.dispose();
      clumps.forEach(freeClump);
      root.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});
    }};
}
