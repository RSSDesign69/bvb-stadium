import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { TextureSet } from '../stadium/materials';

// The explorer's CC0 textures and sky (public/assets/explorer, Task 1), loaded after the first frame through one
// shared KTX2Loader and kept in a ref-counted cache: a StrictMode remount or "Retry 3D" reuses the loaded
// textures instead of fetching them again. The last release waits a few seconds before disposing, so an
// unmount followed at once by a mount (StrictMode) never loads twice.
export type Tier='desktop'|'phone';
export interface Sun { direction:[number,number,number]; sunIrradianceRGB:[number,number,number]; skyIrradianceUp:number }
export interface Assets { sets:Record<string,TextureSet>; atlases:Record<string,THREE.Texture>; sky:THREE.Texture; sun:Sun; bytes:number }
interface Index { materials:Record<string,{tileMeters:number|null;tiers:Record<Tier,Record<string,string>>}>; atlases:Record<string,{tiers:Record<Tier,string>}>; sky:{tiers:Record<Tier,{file:string;sun:Sun}>} }
// Every material set: the stadium's, and the surroundings' ground, bark and building sets (Task 8), plus the leaf atlases.
export const STADIUM_SETS=['concrete','precast','cladding','roofSheet','paintedSteel','paving','turf','grass','asphalt','track','soil','ballast','bark','buildingFacade','flatRoof'];
const BASE=import.meta.env.BASE_URL;
let loader:KTX2Loader|null=null;
const cache=new Map<Tier,{users:number;promise:Promise<Assets>;timer:number}>();
const RELEASE_DELAY=8000;

async function load(tier:Tier,renderer:THREE.WebGLRenderer):Promise<Assets>{
  // The Basis transcoder is the copy Vite emits for KTX2Loader's own new URL(…, import.meta.url) (Task 12: one copy ships).
  if(!loader)loader=new KTX2Loader().detectSupport(renderer);
  const ktx=loader,index:Index=await fetch(`${BASE}assets/explorer/index.json`).then(r=>{if(!r.ok)throw new Error(`index.json ${r.status}`);return r.json();});
  let bytes=0;
  const get=async(file:string)=>{
    const buffer=await fetch(`${BASE}${file}`).then(r=>{if(!r.ok)throw new Error(`${file} ${r.status}`);return r.arrayBuffer();});bytes+=buffer.byteLength;
    return new Promise<THREE.CompressedTexture>((resolve,reject)=>ktx.parse(buffer,t=>resolve(t as THREE.CompressedTexture),reject));
  };
  const tile=(t:THREE.Texture)=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());t.needsUpdate=true;return t;};
  const sets:Record<string,TextureSet>={},atlases:Record<string,THREE.Texture>={};
  const sky=index.sky.tiers[tier];
  const [skyTexture]=await Promise.all([get(sky.file),...Object.entries(index.atlases??{}).map(async([name,a])=>{atlases[name]=await get(a.tiers[tier]);}),...STADIUM_SETS.map(async name=>{
    const files=index.materials[name]?.tiers[tier];if(!files)return;
    const [color,orm,normal]=await Promise.all([get(files.color),get(files.orm),files.normal?get(files.normal):Promise.resolve(undefined)]);
    sets[name]={color:tile(color),orm:tile(orm),normal:normal&&tile(normal)};
  })]);
  skyTexture.mapping=THREE.EquirectangularReflectionMapping;skyTexture.minFilter=skyTexture.magFilter=THREE.LinearFilter;skyTexture.generateMipmaps=false;
  skyTexture.colorSpace=THREE.LinearSRGBColorSpace;
  return {sets,atlases,sky:skyTexture,sun:sky.sun,bytes};
}
function dispose(assets:Assets){Object.values(assets.sets).forEach(s=>{s.color.dispose();s.orm.dispose();s.normal?.dispose();});Object.values(assets.atlases).forEach(t=>t.dispose());assets.sky.dispose();}

// Returns the tier's assets (loading them once) and a release function; call release exactly once.
export function acquireAssets(tier:Tier,renderer:THREE.WebGLRenderer):{promise:Promise<Assets>;release:()=>void}{
  let entry=cache.get(tier);
  if(entry){clearTimeout(entry.timer);entry.users++;}
  else{entry={users:1,promise:load(tier,renderer),timer:0};cache.set(tier,entry);entry.promise.catch(()=>{if(cache.get(tier)===entry)cache.delete(tier);});}
  const own=entry;let released=false;
  return {promise:own.promise,release(){
    if(released)return;released=true;own.users--;
    if(own.users>0)return;
    own.timer=window.setTimeout(()=>{if(own.users>0||cache.get(tier)!==own)return;cache.delete(tier);own.promise.then(dispose,()=>{});
      if(!cache.size){loader?.dispose();loader=null;}},RELEASE_DELAY);
  }};
}
