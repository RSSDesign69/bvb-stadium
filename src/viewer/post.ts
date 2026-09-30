import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import type { Quality } from './quality';

// The `high` tier's post chain (Task 6), in its own chunk: SMAA's lookup textures and GTAO are most of its weight,
// and the first frame does not wait for them (pipeline.ts renders straight to the canvas until this loads).
// RenderPass → GTAO (half resolution; normals rebuilt from the scene pass's depth, so the scene is drawn once)
// → optional bloom → OutputPass (tone mapping, sRGB) → SMAA on display values, where its edge detection works best.
export interface Post { composer:EffectComposer; gtao:GTAOPass|null; setRadius(metres:number):void; dispose():void }
// `afterScene` runs between the scene pass and GTAO (the pipeline reads its counters there).
export function buildPost(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,q:Quality,afterScene:()=>void,debugAO=false):Post{
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthTexture:new THREE.DepthTexture(1,1)});
  const composer=new EffectComposer(renderer,target);let gtao:GTAOPass|null=null;
  composer.addPass(new RenderPass(scene,camera));
  // The read buffer alternates between the composer's two targets, so GTAO is handed this frame's depth each time.
  const probe=new Pass();probe.needsSwap=false;
  probe.render=(_r,_w,read)=>{afterScene();if(gtao)gtao.gtaoMaterial.uniforms.tDepth.value=gtao.pdMaterial.uniforms.tDepth.value=read.depthTexture;};
  composer.addPass(probe);
  if(q.gtao){
    gtao=new GTAOPass(scene,camera,1,1);gtao.setGBuffer(target.depthTexture!,undefined);
    const setSize=gtao.setSize.bind(gtao);gtao.setSize=(w,h)=>setSize(Math.max(1,Math.round(w/2)),Math.max(1,Math.round(h/2)));
    gtao.updateGtaoMaterial({radius:1.6,distanceExponent:1.4,thickness:1.2,scale:2,samples:12,distanceFallOff:1});
    gtao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:6,rings:2,samples:12});
    gtao.blendIntensity=1;if(debugAO)gtao.output=GTAOPass.OUTPUT.Denoise;composer.addPass(gtao);
  }
  // Bloom stays off by default: in daylight only the sky's reflections cross its threshold (Task 6 evaluation).
  if(q.bloom)composer.addPass(new UnrealBloomPass(new THREE.Vector2(256,256),.12,.4,1.2));
  composer.addPass(new OutputPass());composer.addPass(new SMAAPass());
  return {composer,gtao,
    setRadius(r){if(gtao){const u=gtao.gtaoMaterial.uniforms;u.radius.value=r;u.thickness.value=r*.8;}},
    dispose(){composer.passes.forEach(p=>p.dispose());composer.dispose();}};
}
