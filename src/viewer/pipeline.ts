import * as THREE from 'three';
import type { Sun } from './assets';
import type { Post } from './post';
import { STEPS } from './quality';
import type { Quality } from './quality';

// Daylight rendering for the explorer (Task 6).
// - Light: the CC0 sky (Task 1) baked into scene.environment (see skyScene) and shown as the background. One
//   DirectionalLight is the sun, along the sky image's own sun after the sky is turned (by the sky yaw) to light
//   the stadium from the south-west. Its intensity is the sky file's measured sun irradiance, so sun and sky keep
//   their measured balance (SKY_FILL lifts the sky a little); EXPOSURE sets the overall level.
// - Before the sky arrives, a procedural gradient sky of the same PMREM size stands in, so the swap recompiles
//   nothing and the first frame is already lit from above.
// - Shadows: a static 300 m sun shadow map (autoUpdate off). It re-renders only when `shadowsDirty` is set: the
//   roof opening moves, the sky or quality changes.
// - Post (`high`, post.ts): GTAO, optional bloom, OutputPass (Khronos PBR Neutral tone mapping), SMAA. It loads as
//   its own chunk; until it arrives, and always on `compact`, the scene renders straight to the canvas (compact
//   with the context's MSAA).
// - Counters: main pass (scene only), shadow pass, and the total including post, per rendered frame.
export const EXPOSURE=.9;
// Sky fill relative to the sun: a little over the file's measured balance, so shade reads as a camera would
// expose a sunny day rather than crushing it.
export const SKY_FILL=1.25;
export const TONE_MAPPING=THREE.NeutralToneMapping;
const SUN_BEARING=228;                     // degrees from north toward east: an afternoon sun from the south-west
const SHADOW_BOX=new THREE.Box3(new THREE.Vector3(-150,-2,-150),new THREE.Vector3(150,64,150));
const FOG_DENSITY=.0003;
export interface FrameStats { calls:number; triangles:number; shadowCalls:number; total:number }

// The environment is baked from a sky dome: the CC0 sky above the horizon (turned by the sky yaw, with its sun
// disc), and below it the bounce from this setting's own ground (the sky file's "ground" is a blue-grey that would
// tint every downward and sideways face), blended through a haze band. Without the sky texture it is a gradient
// measured from the file (elevation bands), so the stand-in and the real sky light the scene alike.
export const SKY_GRADIENT={zenith:new THREE.Color(.42,.48,.70),mid:new THREE.Color(.26,.34,.57),horizon:new THREE.Color(.43,.47,.57),ground:new THREE.Color(.19,.23,.16)};
function skyScene(sky:THREE.Texture|null,yaw:number){
  const scene=new THREE.Scene(),g=SKY_GRADIENT;
  const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
    uniforms:{sky:{value:sky},hasSky:{value:sky?1:0},rot:{value:new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationY(yaw)).transpose()},
      zenith:{value:g.zenith},mid:{value:g.mid},horizon:{value:g.horizon},ground:{value:g.ground}},
    vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D sky;uniform float hasSky;uniform mat3 rot;uniform vec3 zenith,mid,horizon,ground;varying vec3 vDir;
      void main(){
        vec3 d=rot*normalize(vDir);float y=d.y;
        vec3 up=y>.26?mix(mid,zenith,smoothstep(.26,.9,y)):mix(horizon,mid,smoothstep(0.,.26,y));
        if(hasSky>.5)up=texture2D(sky,vec2(atan(d.z,d.x)*.1591549+.5,asin(clamp(y,-1.,1.))*.3183099+.5)).rgb;
        vec3 below=mix(horizon,ground,smoothstep(0.,.14,-y));
        gl_FragColor=vec4(y>=0.?up:mix(up,below,smoothstep(0.,.02,-y)),1.);
      }`});
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50,64,32),material));
  return {scene,dispose(){material.dispose();(scene.children[0] as THREE.Mesh).geometry.dispose();}};
}

export class Pipeline {
  readonly sun=new THREE.DirectionalLight(0xffffff,4.4);
  shadowsDirty=true;shadowRenders=0;step=0;private debugAO=false;shadowOnly:THREE.Object3D[]=[];
  stats:FrameStats={calls:0,triangles:0,shadowCalls:0,total:0};
  private post:Post|null=null;private postModule:typeof import('./post')|null=null;
  private pmrem:THREE.PMREMGenerator|null;private env:THREE.WebGLRenderTarget;private skyYaw=0;
  private size=new THREE.Vector2(1,1);private shadowCalls=0;private shadowTriangles=0;private guard={from:0,samples:[] as number[]};
  // onChange asks the engine for a frame (the post chain arrived, or the guard stepped down).
  constructor(private renderer:THREE.WebGLRenderer,private scene:THREE.Scene,private camera:THREE.PerspectiveCamera,public quality:Quality,private cubeSize:number,private onChange:()=>void){
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=TONE_MAPPING;renderer.toneMappingExposure=EXPOSURE;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
    if(import.meta.env.DEV){
      // Dev-only, for the brand-yellow swatch comparison: ?tonemap=aces|agx|neutral and ?exposure=<n>.
      const q=new URLSearchParams(location.search),t=q.get('tonemap'),x=Number(q.get('exposure'));
      if(t)renderer.toneMapping={aces:THREE.ACESFilmicToneMapping,agx:THREE.AgXToneMapping,neutral:THREE.NeutralToneMapping}[t]??TONE_MAPPING;
      if(x>0)renderer.toneMappingExposure=x;
      // ?gtao=0 and ?shadows=0 isolate one effect for review.
      if(q.get('gtao')==='0')quality.gtao=false;this.debugAO=q.get('gtao')==='debug';if(q.get('bloom')==='1')quality.bloom=true;if(q.get('shadows')==='0')renderer.shadowMap.enabled=false;
    }

    renderer.info.autoReset=false;
    // Count the shadow pass's draws on their own (three renders it inside renderer.render).
    const shadowMap=renderer.shadowMap,render=shadowMap.render.bind(shadowMap);
    // shadowOnly objects (the seat proxies, model.ts) are visible only inside the shadow pass.
    shadowMap.render=(lights,scene,camera)=>{const i=renderer.info.render,calls=i.calls,triangles=i.triangles,due=shadowMap.needsUpdate;
      if(due)this.shadowOnly.forEach(o=>{o.visible=true;});render(lights,scene,camera);if(due)this.shadowOnly.forEach(o=>{o.visible=false;});
      if(due&&lights.length){this.shadowRenders++;this.shadowCalls+=i.calls-calls;this.shadowTriangles+=i.triangles-triangles;}};
    this.pmrem=new THREE.PMREMGenerator(renderer);
    this.env=this.bake(null);scene.environment=scene.background=this.env.texture;scene.environmentIntensity=SKY_FILL;
    scene.fog=new THREE.FogExp2(SKY_GRADIENT.horizon.clone(),FOG_DENSITY);
    const s=this.sun.shadow;this.sun.castShadow=true;s.bias=-.00025;s.normalBias=.06;s.radius=2.5;
    scene.add(this.sun,this.sun.target);
    this.setSun([.55439,.74168,.37758],[4.4227,4.4592,4.0573]);
    this.build();
    if(quality.name==='high')import('./post').then(m=>{if(this.disposed)return;this.postModule=m;this.build();this.onChange();});
  }
  private disposed=false;
  // Turns the sky so its sun sits at SUN_BEARING, and puts the light along it.
  private setSun(direction:[number,number,number],irradiance:[number,number,number]){
    const [x,,z]=direction,bearing=Math.atan2(x,-z);this.skyYaw=bearing-THREE.MathUtils.degToRad(SUN_BEARING);
    const e=new THREE.Euler(0,this.skyYaw,0);
    const d=new THREE.Vector3(...direction).applyEuler(e).normalize(),peak=Math.max(...irradiance);
    this.sun.color.setRGB(irradiance[0]/peak,irradiance[1]/peak,irradiance[2]/peak,THREE.LinearSRGBColorSpace);this.sun.intensity=peak;
    this.sun.position.copy(d).multiplyScalar(400);this.sun.target.position.set(0,0,0);this.sun.updateMatrixWorld();this.sun.target.updateMatrixWorld();
    // Fit the orthographic shadow camera to the stadium box as seen from the sun.
    const cam=this.sun.shadow.camera,view=new THREE.Matrix4().lookAt(this.sun.position,this.sun.target.position,new THREE.Vector3(0,1,0)).invert();
    const box=new THREE.Box3(),c=new THREE.Vector3(),b=SHADOW_BOX;
    for(let i=0;i<8;i++){c.set(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z).sub(this.sun.position);c.applyMatrix4(new THREE.Matrix4().extractRotation(view));box.expandByPoint(c);}
    cam.left=box.min.x;cam.right=box.max.x;cam.bottom=box.min.y;cam.top=box.max.y;cam.near=Math.max(1,-box.max.z);cam.far=-box.min.z;cam.updateProjectionMatrix();
    this.shadowsDirty=true;
  }
  sunDirection(){return this.sun.position.clone().normalize();}
  // The real sky, once loaded: pre-filtered, lit and shown; the fog takes its horizon colour.
  setSky(sky:THREE.Texture,sun:Sun,horizon?:THREE.Color){
    this.setSun(sun.direction,sun.sunIrradianceRGB);
    const env=this.bake(sky),old=this.env;this.env=env;this.scene.environment=this.scene.background=env.texture;old.dispose();
    // Task 11: the generator keeps a ping-pong target as large as the environment (25 MB on high); free it after the
    // final bake (a later bake makes a new one).
    this.pmrem?.dispose();this.pmrem=null;
    if(horizon)(this.scene.fog as THREE.FogExp2).color.copy(horizon);
  }
  // Pre-filters the sky dome into a PMREM of the tier's size (identical for the stand-in and the real sky).
  private bake(sky:THREE.Texture|null){const dome=skyScene(sky,this.skyYaw),env=(this.pmrem??=new THREE.PMREMGenerator(this.renderer)).fromScene(dome.scene,0,.1,100,{size:this.cubeSize});dome.dispose();return env;}
  private build(){
    this.post?.dispose();this.post=null;
    const q=this.quality,r=this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio,q.dpr));
    const shadowSize=q.shadowSize;if(this.sun.shadow.mapSize.x!==shadowSize){this.sun.shadow.mapSize.set(shadowSize,shadowSize);this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.shadowsDirty=true;}
    if(q.name==='high'&&this.postModule)this.post=this.postModule.buildPost(r,this.scene,this.camera,q,()=>{
      const i=r.info.render;this.stats.calls=i.calls-this.shadowCalls;this.stats.triangles=i.triangles-this.shadowTriangles;
    },this.debugAO);
    this.resize();
  }
  setSize(width:number,height:number){this.size.set(width,height);this.resize();}
  private resize(){
    const {x,y}=this.size;this.renderer.setSize(x,y,false);
    if(this.post){this.post.composer.setPixelRatio(this.renderer.getPixelRatio());this.post.composer.setSize(x,y);}
  }
  setQuality(quality:Quality){this.quality=quality;this.build();}
  render(){
    const r=this.renderer;r.info.reset();this.shadowCalls=this.shadowTriangles=0;
    if(this.shadowsDirty){r.shadowMap.needsUpdate=true;this.shadowsDirty=false;}
    // Contact shading at the scale the eye reads: about 1.5 m in a seat, up to 8 m from the orbit (150–550 m).
    this.post?.setRadius(THREE.MathUtils.clamp(this.camera.position.length()*.018,1.5,8));
    if(this.post)this.post.composer.render();
    else{r.render(this.scene,this.camera);this.stats.calls=r.info.render.calls-this.shadowCalls;this.stats.triangles=r.info.render.triangles-this.shadowTriangles;}
    this.stats.shadowCalls=this.shadowCalls;this.stats.total=r.info.render.calls;
  }
  // Adaptive guard: while the atmosphere animates, collect frame intervals over 2 s; if the p95 exceeds 34 ms on
  // `high`, take the next step down (GTAO off → 2048² shadows → DPR 1) and measure again. Never during a flight.
  observe(interval:number,now:number,measuring:boolean){
    const g=this.guard;
    if(!measuring||this.quality.name!=='high'||this.step>=STEPS.length||interval<=0){g.from=0;g.samples.length=0;return false;}
    if(!g.from)g.from=now;g.samples.push(interval);
    if(now-g.from<2000)return false;
    const sorted=[...g.samples].sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*.95)];g.from=0;g.samples.length=0;
    if(p95<=34){this.step=STEPS.length;return false;}   // passed: stop measuring
    this.setQuality(STEPS[this.step++](this.quality));this.onChange();return true;
  }
  dispose(){this.disposed=true;this.post?.dispose();this.env.dispose();this.pmrem?.dispose();this.sun.shadow.map?.dispose();this.sun.dispose();}
}
// Mean sky radiance over a band of elevations (degrees), decoded on the CPU from the E5B9G9R9 sky (rows run
// bottom-up: t = 0 at the nadir). Used for the fog colour, which must meet the sky at the horizon.
export function skyBand(sky:THREE.Texture,from:number,to:number){
  const {data,width,height}=sky.image as {data:Uint32Array;width:number;height:number},sum=[0,0,0];let n=0;
  for(let e=from;e<=to;e+=.5){const row=Math.min(height-1,Math.floor((.5+e/180)*height));
    for(let x=0;x<width;x++){const v=data[row*width+x],k=2**((v>>>27)-24);sum[0]+=(v&511)*k;sum[1]+=(v>>>9&511)*k;sum[2]+=(v>>>18&511)*k;n++;}}
  return new THREE.Color(sum[0]/n,sum[1]/n,sum[2]/n);
}
export const skyHorizon=(sky:THREE.Texture)=>skyBand(sky,1,4);
