import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildMatchday } from '../atmosphere/matchday';
import { DEFAULT_ATMOSPHERE, shouldAnimate } from '../atmosphere/settings';
import type { AtmosphereSettings } from '../atmosphere/settings';
import { DETAIL_NEAR, buildStadium, detailDistance, standOfHit } from '../stadium/model';
import { ROOF_Y } from '../hero/framing';
import { buildSurroundings } from '../stadium/surroundings';
import { BLOCK_BY_ID, DEMO, PLACE_BY_ID, samplePlace } from '../places/demo';
import type { Place, StandId, Vec3 } from '../places/schema';
import { HOME, HOME_TARGET, focusPose, previewRoute, returnRoute, routePoint } from './camera';
import type { Flight, Pose } from './camera';
import { FIT_POINTS, POSE_CLOCK, POSES } from './poses';
import { Pipeline, skyHorizon } from './pipeline';
import { pickQuality } from './quality';
import type { acquireAssets } from './assets';
import { applyTextures, setBowlOpening } from '../stadium/materials';
export type ViewMode='overview'|'flying'|'preview'|'returning';
export interface ViewState { mode:ViewMode; position:Vec3; direction:Vec3; fov:number }
export type Command='left'|'right'|'up'|'down'|'in'|'out'|'reset'|'back';
export interface Events { onSelect:(id:string)=>void; onStand?:(stand:StandId)=>void; onHover:(id:string|null)=>void; onView:(state:ViewState)=>void; onError:(message:string)=>void }
const tuple=(v:THREE.Vector3):Vec3=>[v.x,v.y,v.z];
const visible=(o:THREE.Object3D):boolean=>o.visible&&(!o.parent||visible(o.parent));
export class StadiumEngine {
  private scene=new THREE.Scene();private camera=new THREE.PerspectiveCamera(43,1,3,4000);
  private renderer:THREE.WebGLRenderer;private controls:OrbitControls;private stadium=buildStadium(window.innerWidth<700);private surroundings:ReturnType<typeof buildSurroundings>;private treesBaked=0;private frames=0;private pendingAtlases:Record<string,THREE.Texture>|null=null;
  private mode:ViewMode='overview';private flight:Flight|null=null;private saved:Pose|null=null;
  private selected:Place|null=null;private raf=0;private previous=0;private lastEmit=0;private dirty=true;private disposed=false;
  private cutaway=true;private roofEase:{from:number;to:number;t:number}|null=null;private reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  private resize:ResizeObserver;private ray=new THREE.Raycaster();private pointer=new THREE.Vector2();
  private pendingHover:PointerEvent|null=null;private down:{x:number;y:number;id:number;time:number;moved:boolean}|null=null;
  private touches=new Set<number>();private yaw=0;private pitch=0;private yawBase=0;private hoverId:string|null=null;
  private allowedIds:Set<string>|null=null;
  private baseColors=new WeakMap<THREE.InstancedMesh,THREE.Color[]>();
  private filtered=false;
  private matchday:ReturnType<typeof buildMatchday>;
  private atmosphere={...DEFAULT_ATMOSPHERE};private matchTime=0;private onscreen=true;
  private intersection:IntersectionObserver;private nearby:IntersectionObserver;private near=false;private nearTimer=0;private lastPose='';private pose='';
  private quality=pickQuality(window.innerWidth<700);private detailMode=import.meta.env.DEV?new URLSearchParams(location.search).get('detail'):null;private pipeline:Pipeline;private assets:ReturnType<typeof acquireAssets>|null=null;private texturesApplied=false;private fixedClip=false;
  private pageVisible=()=>document.visibilityState==='visible'&&this.onscreen;
  private visibilityChanged=()=>{this.previous=0;this.request();};
  constructor(private host:HTMLDivElement,private events:Events){
    // The compact tier draws straight to the canvas with the context's MSAA; high uses the composer and SMAA.
    this.renderer=new THREE.WebGLRenderer({antialias:this.quality.name==='compact',alpha:false,powerPreference:'high-performance'});
    const trees=import.meta.env.DEV?new URLSearchParams(location.search).get('trees'):null;
    this.surroundings=buildSurroundings(this.quality.name==='compact',trees==='near'||trees==='far'?trees:null);
    this.matchday=buildMatchday(window.innerWidth<700);this.scene.add(this.matchday.root);
    this.matchday.crowd.traverse(o=>{o.receiveShadow=this.quality.crowdShadows;});this.matchday.activity.traverse(o=>{o.receiveShadow=true;});
    this.pipeline=new Pipeline(this.renderer,this.scene,this.camera,this.quality,this.quality.textures==='desktop'?512:256,()=>this.request());
    this.pipeline.shadowOnly=[...this.stadium.shadowOnly,...this.surroundings.shadowOnly];host.dataset.quality=this.quality.name;host.dataset.qualityStep='0';host.dataset.textures='pending';
    const canvas=this.renderer.domElement;canvas.setAttribute('aria-label','Interactive stadium. Drag to orbit; scroll to zoom. Use the labeled camera and place controls for keyboard navigation.');
    canvas.setAttribute('role','img');host.appendChild(canvas);
    this.scene.add(this.surroundings.root);this.scene.add(this.stadium.group);
    this.camera.position.set(...HOME);this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(...HOME_TARGET);
    this.controls.enablePan=false;this.controls.enableDamping=false;this.controls.minDistance=150;this.controls.maxDistance=550;
    this.controls.minPolarAngle=.18;this.controls.maxPolarAngle=1.05;this.controls.rotateSpeed=.65;
    this.controls.addEventListener('change',this.request);this.controls.update();
    this.syncRoof(true);
    this.resize=new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();if(width&&height){this.pipeline.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.request();}});this.resize.observe(host);
    canvas.addEventListener('pointerdown',this.pointerDown);canvas.addEventListener('pointermove',this.pointerMove);
    canvas.addEventListener('pointerup',this.pointerUp);canvas.addEventListener('pointercancel',this.pointerCancel);canvas.addEventListener('pointerleave',this.pointerLeave);
    canvas.addEventListener('wheel',this.wheel,{passive:false});canvas.addEventListener('webglcontextlost',this.contextLost);
    this.reduce.addEventListener('change',this.motionChanged);
    document.addEventListener('visibilitychange',this.visibilityChanged);
    this.intersection=new IntersectionObserver(entries=>{this.onscreen=entries[0].isIntersecting;this.visibilityChanged();});this.intersection.observe(host);
    // The CC0 textures and sky (about 10 MB, plus decoding, uploads and a new environment bake) wait until the scene
    // is in view, or until the hero has built (about 7.3 s), so they never compete with the hero animation above.
    const soon=()=>{if(this.near)return;this.near=true;this.nearby.disconnect();clearTimeout(this.nearTimer);this.request();};
    this.nearby=new IntersectionObserver(entries=>{if(entries[0].intersectionRatio>=.2)soon();},{threshold:[.2]});this.nearby.observe(host);
    this.nearTimer=window.setTimeout(soon,8000);
    // Dev-only handle for the capture and inspection scripts.
    if(import.meta.env.DEV)(window as unknown as {__explorer?:unknown}).__explorer={scene:this.scene,camera:this.camera,renderer:this.renderer,pipeline:this.pipeline,stadium:this.stadium,surroundings:this.surroundings,matchday:this.matchday};
    // Task 11: start every scene program compiling at once (KHR_parallel_shader_compile where available), so the first
    // frame waits on parallel driver compiles rather than about 30 serial ones. It renders as usual; nothing waits.
    this.renderer.compileAsync(this.scene,this.camera).catch(()=>{});
    this.request();
  }
  private contextLost=(event:Event)=>{event.preventDefault();this.events.onError('3D graphics paused. Retry, or explore the places below.');};
  private motionChanged=()=>{if(this.reduce.matches&&this.flight)this.completeFlight();if(this.reduce.matches&&this.roofEase)this.syncRoof(true);this.request();};
  private request=()=>{if(this.disposed)return;this.dirty=true;if(!this.raf)this.raf=requestAnimationFrame(this.frame);};
  private frame=(time:number)=>{
    this.raf=0;if(this.disposed)return;
    const interval=this.previous?time-this.previous:0,dt=Math.min(interval/1000,.06);this.previous=time;
    if(this.flight){
      this.flight.elapsed+=dt;const t=Math.min(1,this.flight.elapsed/this.flight.duration);const eased=t*t*(3-2*t);
      this.camera.position.set(...routePoint(this.flight.points,eased));
      const target=new THREE.Vector3(...this.flight.destination.target);
      this.camera.lookAt(target);this.dirty=true;if(t===1)this.completeFlight();
    }
    if(this.roofEase){
      const e=this.roofEase;e.t=Math.min(1,e.t+dt/.6);const k=e.t*e.t*(3-2*e.t);this.setRoof(e.from+(e.to-e.from)*k);if(e.t===1)this.roofEase=null;
    }
    this.matchday.root.visible=this.atmosphere.enabled;
    this.matchday.crowd.visible=this.matchday.activity.visible=true;
    const animate=!this.pose&&shouldAnimate(this.atmosphere,this.reduce.matches,this.pageVisible());
    if(animate){this.matchTime+=dt;this.matchday.update(this.matchTime);this.dirty=true;}
    this.surroundings.trees.time.value=this.matchTime;
    // Tree clumps and impostors bake on the frame after the first (never on the first frame, which is a Task 11 budget).
    if(this.treesBaked===1){this.surroundings.trees.bake(this.renderer,this.pendingAtlases??undefined);this.pendingAtlases=null;this.treesBaked=2;this.pipeline.shadowsDirty=true;this.dirty=true;}
    if(this.pipeline.observe(interval,time,animate&&!this.flight&&!this.roofEase))this.host.dataset.qualityStep=String(this.pipeline.step);
    // Overview never comes within 3 m of geometry: a far near plane keeps depth (and GTAO) precise out to the horizon.
    if(!this.fixedClip){const near=this.mode==='overview'?3:.08;if(this.camera.near!==near){this.camera.near=near;this.camera.updateProjectionMatrix();}}
    this.host.dataset.atmosphere=animate?'running':this.atmosphere.enabled?'static':'off';
    this.host.dataset.matchTime=this.matchTime.toFixed(3);
    this.host.dataset.crowd=String(this.matchday.count);
    if(this.pendingHover){const event=this.pendingHover;this.pendingHover=null;const p=this.pick(event);this.setHover(p);}
    if(this.dirty){this.syncDetail();this.surroundings.trees.update(this.camera.position);this.matchday.updateCrowd(this.camera.position);this.pipeline.render();this.dirty=false;
      if(!this.treesBaked){this.treesBaked=1;this.request();}
      this.host.dataset.renderMode=this.mode;this.host.dataset.crowdVisible=String(this.matchday.root.visible&&this.matchday.crowd.visible);
      // Main scene pass, and the total with the shadow pass (only on frames that re-render it) and post.
      const stats=this.pipeline.stats,d=this.host.dataset;d.drawCalls=String(stats.calls);d.triangles=String(stats.triangles);
      d.drawCallsTotal=String(stats.total);d.shadowRenders=String(this.pipeline.shadowRenders);d.frames=String(++this.frames); // Task 11: idle frames cost nothing
      if(this.texturesApplied)d.textures='ready';
      // The CC0 textures and sky load after the first frame, from the shared cache (assets.ts).
      if(!this.assets&&this.near)this.loadAssets();
      if(time-this.lastEmit>90||!this.flight){this.emit();this.lastEmit=time;}
      if(this.pose)this.host.dataset.poseReady=this.pose;
    }
    if((this.flight||animate||this.roofEase)&&this.pageVisible())this.request();
  };
  // Task 7 detail: close-range detail within DETAIL_NEAR of the stadium (on compact, only away from the overview, i.e.
  // in flights and seat previews), and the roof's soffit structure whenever the camera is under the roof.
  // Dev-only ?detail=on|off forces both, for the pop check.
  private syncDetail(){
    const p=this.camera.position,forced=this.detailMode==='on'?true:this.detailMode==='off'?false:null;
    const close=forced??(this.mode!=='overview'||(this.quality.name==='high'&&detailDistance(p)<DETAIL_NEAR));
    this.stadium.setDetail(close,forced??p.y<ROOF_Y);
    this.host.dataset.detail=`${close?'close':''}${p.y<ROOF_Y||forced?' inside':''}`.trim()||'none';
  }
  private loadAssets(){
    // The loader (KTX2, Basis, zstd) is its own chunk, fetched with the textures after the first frame.
    const pending=import('./assets').then(m=>m.acquireAssets(this.quality.textures,this.renderer));
    let handle:ReturnType<typeof acquireAssets>|null=null;
    this.assets={promise:pending.then(h=>{handle=h;if(this.disposed)h.release();return h.promise;}),release:()=>handle?.release()};
    this.assets.promise.then(a=>{
      if(this.disposed)return;applyTextures(this.stadium.group,a.sets);this.surroundings.applyTextures(a.sets);this.pipeline.setSky(a.sky,a.sun,skyHorizon(a.sky));
      if(this.treesBaked===2)this.surroundings.trees.bake(this.renderer,a.atlases);else this.pendingAtlases=a.atlases;
      this.pipeline.shadowsDirty=true;this.texturesApplied=true;this.request();
    },()=>{if(!this.disposed)this.host.dataset.textures='failed';});
  }
  private emit(){const d=new THREE.Vector3();this.camera.getWorldDirection(d);this.host.dataset.mode=this.mode;const key=[this.mode,...this.camera.position.toArray(),...d.toArray(),this.camera.fov].join(',');if(key===this.lastPose)return;this.lastPose=key;this.events.onView({mode:this.mode,position:tuple(this.camera.position),direction:tuple(d),fov:this.camera.fov});}
  private setHover(p:Place|null){
    if(this.hoverId===p?.id)return;this.hoverId=p?.id??null;this.events.onHover(this.hoverId);
    this.stadium.hoverMarker.visible=!!p&&this.mode==='overview';if(p)this.stadium.hoverMarker.position.set(p.position[0],p.position[1]+.8,p.position[2]);
    this.renderer.domElement.style.cursor=p?'pointer':this.mode==='preview'?'move':'grab';this.dirty=true;
  }
  private pick(event:PointerEvent):Place|null {
    if(this.mode!=='overview')return null;
    const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
    this.ray.setFromCamera(this.pointer,this.camera);
    const hits=this.ray.intersectObjects(this.stadium.pickGroups.map(g=>g.mesh),false);
    const hit=hits[0];if(!hit||hit.instanceId===undefined)return null;
    const wall=this.ray.intersectObjects(this.stadium.solids.filter(visible),false)[0];
    if(wall&&wall.distance<hit.distance-.2)return null;
    // Discovery filters change visual emphasis, not what can be explored.
    // Keep every rendered place hoverable and clickable across stand changes.
    return this.stadium.pickGroups.find(g=>g.mesh===hit.object)?.places[hit.instanceId]??null;
  }
  private pointerDown=(e:PointerEvent)=>{
    this.touches.add(e.pointerId);
    this.down={x:e.clientX,y:e.clientY,id:e.pointerId,time:performance.now(),moved:this.touches.size>1};
    if(this.mode==='preview')this.renderer.domElement.setPointerCapture(e.pointerId);
  };
  private pointerMove=(e:PointerEvent)=>{
    if(this.down){const dx=e.clientX-this.down.x,dy=e.clientY-this.down.y;
      if(Math.hypot(dx,dy)>5)this.down.moved=true;
      if(this.mode==='preview'&&this.down.id===e.pointerId){this.yaw-=dx*.004;this.pitch+=dy*.003;this.look();this.down.x=e.clientX;this.down.y=e.clientY;}
    }else if(e.pointerType==='mouse'&&this.mode==='overview'){this.pendingHover=e;this.request();}
  };
  private pointerUp=(e:PointerEvent)=>{
    this.touches.delete(e.pointerId);
    if(this.down&&!this.down.moved&&this.mode==='overview'&&performance.now()-this.down.time<650){
      const p=this.pick(e);
      if(p)this.events.onSelect(p.id);
      else {
        // pick() has positioned the ray. Read the authored stand for the hit instance;
        // pitch, shared corners and other unassigned structures do not choose a stand.
        const hit=this.ray.intersectObjects(this.stadium.solids.filter(visible),false)[0];
        const stand=hit?standOfHit(hit):null;
        if(stand)this.events.onStand?.(stand);
      }
    }
    this.down=null;
  };
  private pointerCancel=()=>{this.down=null;this.touches.clear();};
  private pointerLeave=()=>{this.setHover(null);this.request();};
  private wheel=(e:WheelEvent)=>{if(this.mode==='preview'){e.preventDefault();this.camera.fov=THREE.MathUtils.clamp(this.camera.fov+Math.sign(e.deltaY)*2,35,75);this.camera.updateProjectionMatrix();this.request();}};
  private look(){
    this.yaw=THREE.MathUtils.clamp(this.yaw,-1.15,1.15);this.pitch=THREE.MathUtils.clamp(this.pitch,-.65,.38);
    const yaw=this.yawBase+this.yaw;const direction=new THREE.Vector3(Math.sin(yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(yaw)*Math.cos(this.pitch));
    this.camera.lookAt(this.camera.position.clone().add(direction));this.request();
  }
  private completeFlight(){
    if(!this.flight)return;const pose=this.flight.destination;this.camera.position.set(...pose.position);this.camera.fov=pose.fov;this.camera.updateProjectionMatrix();this.camera.lookAt(new THREE.Vector3(...pose.target));
    this.flight=null;
    if(this.mode==='flying'){this.mode='preview';this.controls.enabled=false;this.look();}
    else{this.mode='overview';this.controls.enabled=true;this.controls.target.set(...pose.target);this.controls.update();}
    this.stadium.marker.visible=!!this.selected&&this.mode==='overview';this.emit();this.request();
  }
  select(id:string|null){
    if(this.mode!=='overview')this.back(true);
    this.selected=id?PLACE_BY_ID.get(id)??null:null;
    this.stadium.marker.visible=!!this.selected;if(this.selected)this.stadium.marker.position.set(this.selected.position[0],this.selected.position[1]+.85,this.selected.position[2]);
    this.request();
  }
  setVisiblePlaces(ids:Set<string>){
    const all=ids.size===PLACE_BY_ID.size;
    this.allowedIds=all?null:ids;
    if(all&&!this.filtered)return;
    this.filtered=!all;
    const color=new THREE.Color();
    for(const group of this.stadium.pickGroups){
      let originals=this.baseColors.get(group.mesh);
      if(!originals){
        originals=group.places.map((_,i)=>{group.mesh.getColorAt(i,color);return color.clone();});
        this.baseColors.set(group.mesh,originals);
      }
      for(let i=0;i<group.places.length;i++){
        color.copy(originals[i]);
        if(!all&&!ids.has(group.places[i].id))color.multiplyScalar(.16);
        group.mesh.setColorAt(i,color);
      }
      if(group.mesh.instanceColor)group.mesh.instanceColor.needsUpdate=true;
    }
    if(this.hoverId&&!ids.has(this.hoverId))this.setHover(null);
    this.request();
  }
  focusBlock(id:string){
    this.back(true);const block=BLOCK_BY_ID.get(id);if(!block)return;
    const pose=focusPose(block.stand,block.center);this.camera.position.set(...pose.position);
    this.controls.target.set(...pose.target);this.camera.fov=pose.fov;this.camera.updateProjectionMatrix();this.controls.update();this.request();
  }
  // Dev-only capture hook (scripts/explorer-captures.cjs): ?explorer-pose=<name> from poses.ts sets the camera,
  // cutaway and atmosphere, freezes the match clock and locks the controls; data-pose-ready follows the first draw.
  applyDevPose(){
    if(!import.meta.env.DEV)return;
    const name=new URLSearchParams(location.search).get('explorer-pose')??'',pose=POSES[name];if(!pose)return;
    this.pose=name;this.atmosphere={enabled:true,paused:true};this.matchTime=POSE_CLOCK;this.matchday.update(POSE_CLOCK);
    if(pose.kind==='place'){
      const blocks=DEMO.blocks.filter(b=>b.stand===pose.stand),place=samplePlace(blocks[Math.floor(blocks.length/2)],pose.level);
      this.select(place.id);this.preview();this.completeFlight();
    }else{
      const target=new THREE.Vector3(...pose.target);
      this.cutaway=pose.cutaway;this.camera.fov=pose.fov;
      if(pose.position)this.camera.position.set(...pose.position);
      // ?pose-radius=<m> overrides an orbit pose's distance (the zoom sweep in scripts/explorer-captures.cjs).
      else this.camera.position.copy(target).add(new THREE.Vector3().setFromSphericalCoords(Number(new URLSearchParams(location.search).get('pose-radius'))||(pose.radius??1),pose.phi??0,pose.theta??0));
      this.camera.lookAt(target);this.controls.target.copy(target);
      if(pose.fit){
        // Frame the hero's extent as if orthographic, then pull the clip planes around it for depth precision.
        this.camera.updateMatrixWorld();const right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1);
        const half=FIT_POINTS.reduce((m,p)=>{const v=new THREE.Vector3(...p).sub(target);return [Math.max(m[0],Math.abs(v.dot(right))),Math.max(m[1],Math.abs(v.dot(up)))];},[0,0]);
        const distance=Math.max(half[1],half[0]/this.camera.aspect)*1.3/Math.tan(THREE.MathUtils.degToRad(pose.fov/2));
        this.camera.position.sub(target).setLength(distance).add(target);this.camera.near=distance-400;this.camera.far=distance+1400;this.fixedClip=true;
      }
      this.camera.updateProjectionMatrix();
    }
    this.syncRoof(true);this.controls.enabled=false;this.host.dataset.pose=name;this.emit();this.request();
  }
  setAtmosphere(settings:AtmosphereSettings){if(this.pose)return;this.atmosphere={...settings};this.previous=0;this.request();}
  setCutaway(value:boolean){this.cutaway=value;this.syncRoof();}
  // The cutaway pulls the roof's inner edge back to a ring in overview; flights and seat previews use the real edge.
  private syncRoof(snap=false){
    const {closed,cutaway}=this.stadium.roofOpening,to=this.cutaway&&(this.mode==='overview'||this.mode==='returning')?cutaway:closed;
    const now=this.stadium.roofOpeningNow;
    if(snap||this.reduce.matches){this.roofEase=null;this.setRoof(to);}
    else if(to!==(this.roofEase?.to??now)){this.roofEase={from:now,to,t:0};this.previous=0;}
    this.request();
  }
  private setRoof(opening:number){
    this.stadium.setRoofOpening(opening);setBowlOpening(opening);this.host.dataset.roofOpening=opening.toFixed(2);
    // The static sun shadow map re-renders when the roof edge moves.
    this.pipeline.shadowsDirty=true;this.dirty=true;
  }
  preview(){
    if(!this.selected||this.mode!=='overview')return;
    this.saved={position:tuple(this.camera.position),target:tuple(this.controls.target),fov:this.camera.fov};
    this.controls.enabled=false;this.mode='flying';this.syncRoof();this.stadium.marker.visible=false;this.setHover(null);
    this.yaw=0;this.yawBase=Math.atan2(this.selected.direction[0],this.selected.direction[2]);this.pitch=Math.asin(this.selected.direction[1]);
    const eye=this.selected.eye,target:Vec3=[eye[0]+this.selected.direction[0]*40,eye[1]+this.selected.direction[1]*40,eye[2]+this.selected.direction[2]*40];
    this.flight={points:previewRoute(tuple(this.camera.position),eye),destination:{position:eye,target,fov:65},duration:2.5,elapsed:0};
    this.previous=0;if(this.reduce.matches)this.completeFlight();this.emit();this.request();
  }
  back(immediate=false){
    if(this.mode==='overview')return;
    const destination=this.saved??{position:HOME,target:HOME_TARGET,fov:43};
    this.mode='returning';this.syncRoof(immediate);this.flight={points:returnRoute(tuple(this.camera.position),destination.position),destination,duration:1.8,elapsed:0};
    this.previous=0;if(immediate||this.reduce.matches)this.completeFlight();this.request();
  }
  command(command:Command){
    if(command==='back'){this.back(this.mode==='flying');return;}
    if(command==='reset'){this.back(true);this.selected=null;this.stadium.marker.visible=false;this.camera.position.set(...HOME);this.controls.target.set(...HOME_TARGET);this.camera.fov=43;this.camera.updateProjectionMatrix();this.controls.update();this.request();return;}
    if(this.mode==='flying'||this.mode==='returning')return;
    if(this.mode==='preview'){
      if(command==='left')this.yaw+=.14;if(command==='right')this.yaw-=.14;if(command==='up')this.pitch+=.1;if(command==='down')this.pitch-=.1;
      if(command==='in'||command==='out'){this.camera.fov=THREE.MathUtils.clamp(this.camera.fov+(command==='in'?-5:5),35,75);this.camera.updateProjectionMatrix();}
      this.look();return;
    }
    const offset=this.camera.position.clone().sub(this.controls.target),sphere=new THREE.Spherical().setFromVector3(offset);
    if(command==='left')sphere.theta+=.16;if(command==='right')sphere.theta-=.16;
    if(command==='up')sphere.phi-=.1;if(command==='down')sphere.phi+=.1;
    if(command==='in')sphere.radius*=.85;if(command==='out')sphere.radius*=1.15;
    sphere.phi=THREE.MathUtils.clamp(sphere.phi,.18,1.05);sphere.radius=THREE.MathUtils.clamp(sphere.radius,150,550);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(sphere));this.controls.update();this.request();
  }
  dispose(){
    this.disposed=true;cancelAnimationFrame(this.raf);this.resize.disconnect();this.intersection.disconnect();this.nearby.disconnect();clearTimeout(this.nearTimer);document.removeEventListener('visibilitychange',this.visibilityChanged);this.controls.dispose();this.reduce.removeEventListener('change',this.motionChanged);
    const c=this.renderer.domElement;c.removeEventListener('pointerdown',this.pointerDown);c.removeEventListener('pointermove',this.pointerMove);c.removeEventListener('pointerup',this.pointerUp);c.removeEventListener('pointercancel',this.pointerCancel);c.removeEventListener('pointerleave',this.pointerLeave);c.removeEventListener('wheel',this.wheel);c.removeEventListener('webglcontextlost',this.contextLost);
    this.assets?.release();this.pipeline.dispose();this.matchday.dispose();this.stadium.dispose();this.surroundings.dispose();this.renderer.dispose();c.remove();
  }
}
