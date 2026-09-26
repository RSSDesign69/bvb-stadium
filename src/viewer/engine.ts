import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildMatchday } from '../atmosphere/matchday';
import { DEFAULT_ATMOSPHERE, shouldAnimate } from '../atmosphere/settings';
import type { AtmosphereSettings } from '../atmosphere/settings';
import { buildStadium } from '../stadium/model';
import { BLOCK_BY_ID, PLACE_BY_ID } from '../places/demo';
import { STANDS, world } from '../stadium/layout';
import type { Place, Vec3 } from '../places/schema';
import { HOME, HOME_TARGET, previewRoute, returnRoute, routePoint } from './camera';
import type { Flight, Pose } from './camera';
export type ViewMode='overview'|'flying'|'preview'|'returning';
export interface ViewState { mode:ViewMode; position:Vec3; direction:Vec3; fov:number }
export type Command='left'|'right'|'up'|'down'|'in'|'out'|'reset'|'back';
export interface Events { onSelect:(id:string)=>void; onHover:(id:string|null)=>void; onView:(state:ViewState)=>void; onError:(message:string)=>void }
const tuple=(v:THREE.Vector3):Vec3=>[v.x,v.y,v.z];
const visible=(o:THREE.Object3D):boolean=>o.visible&&(!o.parent||visible(o.parent));
export class StadiumEngine {
  private scene=new THREE.Scene();private camera=new THREE.PerspectiveCamera(43,1,.08,1200);
  private renderer:THREE.WebGLRenderer;private controls:OrbitControls;private stadium=buildStadium(window.innerWidth<700);
  private mode:ViewMode='overview';private flight:Flight|null=null;private saved:Pose|null=null;
  private selected:Place|null=null;private raf=0;private previous=0;private lastEmit=0;private dirty=true;private disposed=false;
  private cutaway=true;private reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  private resize:ResizeObserver;private ray=new THREE.Raycaster();private pointer=new THREE.Vector2();
  private pendingHover:PointerEvent|null=null;private down:{x:number;y:number;id:number;time:number;moved:boolean}|null=null;
  private touches=new Set<number>();private yaw=0;private pitch=0;private yawBase=0;private hoverId:string|null=null;
  private allowedIds:Set<string>|null=null;
  private baseColors=new WeakMap<THREE.InstancedMesh,THREE.Color[]>();
  private filtered=false;
  private matchday:ReturnType<typeof buildMatchday>;
  private atmosphere={...DEFAULT_ATMOSPHERE};private matchTime=0;private onscreen=true;
  private intersection:IntersectionObserver;private lastPose='';
  private pageVisible=()=>document.visibilityState==='visible'&&this.onscreen;
  private visibilityChanged=()=>{this.previous=0;this.request();};
  constructor(private host:HTMLDivElement,private events:Events){
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.matchday=buildMatchday(window.innerWidth<700);this.scene.add(this.matchday.root);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,window.innerWidth<700?1.4:1.75));
    this.renderer.setClearColor(0x192729);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
    const canvas=this.renderer.domElement;canvas.setAttribute('aria-label','Interactive stadium. Drag to orbit; scroll to zoom. Use the labeled camera and place controls for keyboard navigation.');
    canvas.setAttribute('role','img');host.appendChild(canvas);
    this.scene.add(this.stadium.group);this.scene.add(new THREE.HemisphereLight(0xd6e8f0,0x444333,2.7));
    const sun=new THREE.DirectionalLight(0xfff2ce,3.1);sun.position.set(-70,140,80);this.scene.add(sun);
    this.camera.position.set(...HOME);this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(...HOME_TARGET);
    this.controls.enablePan=false;this.controls.enableDamping=false;this.controls.minDistance=150;this.controls.maxDistance=450;
    this.controls.minPolarAngle=.18;this.controls.maxPolarAngle=1.05;this.controls.rotateSpeed=.65;
    this.controls.addEventListener('change',this.request);this.controls.update();
    this.stadium.roof.visible=!this.cutaway;
    this.resize=new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();if(width&&height){this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.request();}});this.resize.observe(host);
    canvas.addEventListener('pointerdown',this.pointerDown);canvas.addEventListener('pointermove',this.pointerMove);
    canvas.addEventListener('pointerup',this.pointerUp);canvas.addEventListener('pointercancel',this.pointerCancel);canvas.addEventListener('pointerleave',this.pointerLeave);
    canvas.addEventListener('wheel',this.wheel,{passive:false});canvas.addEventListener('webglcontextlost',this.contextLost);
    this.reduce.addEventListener('change',this.motionChanged);
    document.addEventListener('visibilitychange',this.visibilityChanged);
    this.intersection=new IntersectionObserver(entries=>{this.onscreen=entries[0].isIntersecting;this.visibilityChanged();});this.intersection.observe(host);
    this.request();
  }
  private contextLost=(event:Event)=>{event.preventDefault();this.events.onError('3D graphics paused. Retry, or explore the places below.');};
  private motionChanged=()=>{if(this.reduce.matches&&this.flight)this.completeFlight();this.request();};
  private request=()=>{if(this.disposed)return;this.dirty=true;if(!this.raf)this.raf=requestAnimationFrame(this.frame);};
  private frame=(time:number)=>{
    this.raf=0;if(this.disposed)return;
    const dt=this.previous?Math.min((time-this.previous)/1000,.06):0;this.previous=time;
    if(this.flight){
      this.flight.elapsed+=dt;const t=Math.min(1,this.flight.elapsed/this.flight.duration);const eased=t*t*(3-2*t);
      this.camera.position.set(...routePoint(this.flight.points,eased));
      const target=new THREE.Vector3(...this.flight.destination.target);
      this.camera.lookAt(target);this.dirty=true;if(t===1)this.completeFlight();
    }
    const preview=this.mode!=='overview';
    this.matchday.root.visible=this.atmosphere.enabled;
    this.matchday.crowd.visible=this.matchday.activity.visible=!(preview&&this.atmosphere.clearView);
    const animate=shouldAnimate(this.atmosphere,this.reduce.matches,this.pageVisible(),preview);
    if(animate){this.matchTime+=dt;this.matchday.update(this.matchTime);this.dirty=true;}
    this.host.dataset.atmosphere=animate?'running':this.atmosphere.enabled?'static':'off';
    this.host.dataset.matchTime=this.matchTime.toFixed(3);
    this.host.dataset.crowd=String(this.matchday.count);
    if(this.pendingHover){const event=this.pendingHover;this.pendingHover=null;const p=this.pick(event);this.setHover(p);}
    if(this.dirty){this.renderer.render(this.scene,this.camera);this.dirty=false;
      this.host.dataset.renderMode=this.mode;this.host.dataset.crowdVisible=String(this.matchday.root.visible&&this.matchday.crowd.visible);
      this.host.dataset.drawCalls=String(this.renderer.info.render.calls);this.host.dataset.triangles=String(this.renderer.info.render.triangles);
      if(time-this.lastEmit>90||!this.flight){this.emit();this.lastEmit=time;}
    }
    if((this.flight||animate)&&this.pageVisible())this.request();
  };
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
    const place=this.stadium.pickGroups.find(g=>g.mesh===hit.object)?.places[hit.instanceId]??null;
    return place&&(!this.allowedIds||this.allowedIds.has(place.id))?place:null;
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
    if(this.down&&!this.down.moved&&this.mode==='overview'&&performance.now()-this.down.time<650){const p=this.pick(e);if(p)this.events.onSelect(p.id);}
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
    else{this.mode='overview';this.controls.enabled=true;this.controls.target.set(...pose.target);this.controls.update();this.stadium.roof.visible=!this.cutaway;}
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
    const config=STANDS[block.stand];this.camera.position.set(...world(block.stand,block.center*.6,170,135));
    this.controls.target.set(...world(block.stand,block.center*.4,config.inner*.32,8));this.camera.fov=43;this.camera.updateProjectionMatrix();this.controls.update();this.request();
  }
  setAtmosphere(settings:AtmosphereSettings){this.atmosphere={...settings};this.previous=0;this.request();}
  setCutaway(value:boolean){this.cutaway=value;this.stadium.roof.visible=this.mode==='overview'?!value:true;this.request();}
  preview(){
    if(!this.selected||this.mode!=='overview')return;
    this.saved={position:tuple(this.camera.position),target:tuple(this.controls.target),fov:this.camera.fov};
    this.controls.enabled=false;this.mode='flying';this.stadium.roof.visible=true;this.stadium.marker.visible=false;this.setHover(null);
    this.yaw=0;this.yawBase=Math.atan2(this.selected.direction[0],this.selected.direction[2]);this.pitch=Math.asin(this.selected.direction[1]);
    const eye=this.selected.eye,target:Vec3=[eye[0]+this.selected.direction[0]*40,eye[1]+this.selected.direction[1]*40,eye[2]+this.selected.direction[2]*40];
    this.flight={points:previewRoute(tuple(this.camera.position),eye),destination:{position:eye,target,fov:65},duration:2.5,elapsed:0};
    this.previous=0;if(this.reduce.matches)this.completeFlight();this.emit();this.request();
  }
  back(immediate=false){
    if(this.mode==='overview')return;
    const destination=this.saved??{position:HOME,target:HOME_TARGET,fov:43};
    this.mode='returning';this.flight={points:returnRoute(tuple(this.camera.position),destination.position),destination,duration:1.8,elapsed:0};
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
    sphere.phi=THREE.MathUtils.clamp(sphere.phi,.18,1.05);sphere.radius=THREE.MathUtils.clamp(sphere.radius,150,450);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(sphere));this.controls.update();this.request();
  }
  dispose(){
    this.disposed=true;cancelAnimationFrame(this.raf);this.resize.disconnect();this.intersection.disconnect();document.removeEventListener('visibilitychange',this.visibilityChanged);this.controls.dispose();this.reduce.removeEventListener('change',this.motionChanged);
    const c=this.renderer.domElement;c.removeEventListener('pointerdown',this.pointerDown);c.removeEventListener('pointermove',this.pointerMove);c.removeEventListener('pointerup',this.pointerUp);c.removeEventListener('pointercancel',this.pointerCancel);c.removeEventListener('pointerleave',this.pointerLeave);c.removeEventListener('wheel',this.wheel);c.removeEventListener('webglcontextlost',this.contextLost);
    this.matchday.dispose();this.stadium.dispose();this.renderer.dispose();c.remove();
  }
}
