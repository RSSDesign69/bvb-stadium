import * as THREE from 'three';
import { DEMO } from '../places/demo';
import { STANDS, tiers, world, rowDepth, rowFloor, inTunnel } from '../stadium/layout';
import type { Vec3 } from '../places/schema';
import { surface } from '../stadium/materials';
import { CLOTHES, SKIN, figureGeometries } from './figures';

// Anonymous geometric figures, not team kits or likenesses. Occupancy is decorative.
// Close figures (high tier) are people shapes within this distance of the camera; at 60 m a torso is about 7 px.
export const CROWD_NEAR=60;
export function crowdPositions(compact:boolean):{position:Vec3;stand:string}[]{
  const seated=DEMO.places.filter(p=>p.kind==='seat').filter((_,i)=>i%(compact?18:6)===0).map(p=>({position:p.position,stand:p.stand}));
  const tier=tiers('south')[0];
  for(let r=0;r<tier.rows;r+=compact?4:2)for(let u=-43;u<=43;u+=compact?2.4:1.4){
    const block=DEMO.blocks.find(b=>b.stand==='south'&&Math.abs(u-b.center)<b.width/2-1);
    if(!block||inTunnel(r,u-block.center))continue;
    seated.push({position:world('south',u,rowDepth('south',tier,r),rowFloor(tier,r)),stand:'south'});
  }
  return seated;
}
export function playerPosition(index:number,time:number):Vec3{
  const team=index<11?0:1,n=index%11;
  if(n===0)return [Math.sin(time*.25+team)*2,.02,team?48:-48];
  return [Math.sin(n*2.3+time*.15+team)*25,.02,(team?1:-1)*(8+(n%5)*7)+Math.sin(time*.25+n)*3];
}
export function ballPosition(time:number):Vec3{return [Math.sin(time*.31)*19,.22,Math.sin(time*.22+1)*29];}
export function matchClock(time:number){const seconds=46*60+Math.floor(time);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}

export function buildMatchday(compact:boolean){
  const root=new THREE.Group();root.name='Original simulated match day';
  const crowd=new THREE.Group(),activity=new THREE.Group(),displays=new THREE.Group();root.add(crowd,activity,displays);
  const dummy=new THREE.Object3D(),bodies=new THREE.BoxGeometry(.38,.62,.27),heads=new THREE.OctahedronGeometry(.16,0);
  const crowdMaterial=surface(new THREE.MeshStandardMaterial({roughness:.85}));const all=crowdPositions(compact);const cohorts:THREE.Group[]=[];
  // Task 9 (approved): on `high`, figures within CROWD_NEAR of the camera are low-poly people (figures.ts); the rest,
  // and every figure on `compact`, stay the cheap box figures. updateCrowd() re-buckets when the camera moves.
  const shapes=compact?null:figureGeometries(),personMaterial=compact?null:surface(new THREE.MeshStandardMaterial({roughness:.8,vertexColors:true}));
  type Figure={far:[THREE.Matrix4,THREE.Matrix4];near:THREE.Matrix4;at:THREE.Vector3;shirt:THREE.Color;skin:THREE.Color};
  const lots:{figures:Figure[];torso:THREE.InstancedMesh;head:THREE.InstancedMesh;body?:THREE.InstancedMesh;face?:THREE.InstancedMesh}[]=[];
  const hash=(i:number)=>{const x=Math.sin(i*12.9898+78.233)*43758.5453;return x-Math.floor(x);};
  let index=0;
  for(const stand of Object.keys(STANDS)){
    const places=all.filter(p=>p.stand===stand),cohort=new THREE.Group();cohorts.push(cohort);crowd.add(cohort);
    const torso=new THREE.InstancedMesh(bodies,crowdMaterial,places.length),head=new THREE.InstancedMesh(heads,crowdMaterial,places.length),figures:Figure[]=[];
    places.forEach(({position:p},i)=>{
      const standing=stand==='south',height=standing?1.08:.88,k=index++,yaw=Math.atan2(-p[0],-p[2]),shirt=new THREE.Color(CLOTHES[Math.floor(hash(k)*CLOTHES.length)]),skin=new THREE.Color(SKIN[Math.floor(hash(k+.5)*SKIN.length)]);
      dummy.position.set(p[0],p[1]+height,p[2]);dummy.rotation.set(0,yaw,0);dummy.scale.set(1,standing?1.3:1,1);dummy.updateMatrix();torso.setMatrixAt(i,dummy.matrix);torso.setColorAt(i,shirt);const tm=dummy.matrix.clone();
      dummy.position.y+=standing?.54:.46;dummy.scale.set(1,1,1);dummy.updateMatrix();head.setMatrixAt(i,dummy.matrix);head.setColorAt(i,skin);const hm=dummy.matrix.clone();
      const size=.93+.14*hash(k+.25);dummy.position.set(p[0],p[1],p[2]);dummy.rotation.set(0,yaw+(hash(k+.75)-.5)*.3,0);dummy.scale.setScalar(size);dummy.updateMatrix();
      figures.push({far:[tm,hm],near:dummy.matrix.clone(),at:new THREE.Vector3(p[0],p[1]+1,p[2]),shirt,skin});
    });
    torso.computeBoundingSphere();head.computeBoundingSphere();cohort.add(torso,head);
    const lot:(typeof lots)[number]={figures,torso,head};lots.push(lot);
    if(shapes&&personMaterial){
      const shape=stand==='south'?shapes.standing:shapes.seated;
      lot.body=new THREE.InstancedMesh(shape.body,personMaterial,places.length);lot.face=new THREE.InstancedMesh(shape.head,personMaterial,places.length);
      for(const m of [lot.body,lot.face]){m.count=0;m.setColorAt(0,new THREE.Color());m.boundingSphere=torso.boundingSphere!.clone();cohort.add(m);}
    }
  }
  const last=new THREE.Vector3(Infinity,0,0);
  function updateCrowd(camera:THREE.Vector3){
    if(!shapes||last.distanceToSquared(camera)<.25)return false;last.copy(camera);
    for(const lot of lots){
      let n=0,f=0;
      for(const fig of lot.figures){
        const d2=fig.at.distanceToSquared(camera);
        if(d2<1.2)continue; // a figure at the preview eye itself would be seen from inside
        if(d2<CROWD_NEAR*CROWD_NEAR){lot.body!.setMatrixAt(n,fig.near);lot.face!.setMatrixAt(n,fig.near);lot.body!.setColorAt(n,fig.shirt);lot.face!.setColorAt(n,fig.skin);n++;}
        else{lot.torso.setMatrixAt(f,fig.far[0]);lot.head.setMatrixAt(f,fig.far[1]);lot.torso.setColorAt(f,fig.shirt);lot.head.setColorAt(f,fig.skin);f++;}
      }
      lot.torso.count=lot.head.count=f;lot.body!.count=lot.face!.count=n;
      for(const m of [lot.torso,lot.head,lot.body!,lot.face!]){m.instanceMatrix.needsUpdate=true;m.instanceColor!.needsUpdate=true;}
    }
    return true;
  }
  // Players: the standing figure on `high` (legs animate on their own), boxes on `compact`.
  const playerBodies=new THREE.InstancedMesh(shapes?.player.body??new THREE.BoxGeometry(.48,.9,.28),shapes?personMaterial!:surface(new THREE.MeshStandardMaterial({roughness:.7})),22);
  const playerHeads=new THREE.InstancedMesh(shapes?.player.head??new THREE.OctahedronGeometry(.19),shapes?personMaterial!:surface(new THREE.MeshStandardMaterial({color:0xb6b3a9,roughness:.8})),22);
  const legs=new THREE.InstancedMesh(shapes?new THREE.CylinderGeometry(.075,.055,.9,5):new THREE.BoxGeometry(.16,.55,.18),surface(new THREE.MeshStandardMaterial({color:0x202a2b,roughness:.8})),44);
  if(shapes)for(let i=0;i<22;i++)playerHeads.setColorAt(i,new THREE.Color(SKIN[Math.floor(hash(i+900.5)*SKIN.length)]));
  for(let i=0;i<22;i++)playerBodies.setColorAt(i,new THREE.Color(i<11?0x43d4ce:0xf09173));
  playerBodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);playerHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);legs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Bounds cover the whole pitch throughout animation, avoiding stale frustum bounds.
  for(const mesh of [playerBodies,playerHeads,legs])mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1,0),65);
  activity.add(playerBodies,playerHeads,legs);
  const ball=new THREE.Mesh(new THREE.IcosahedronGeometry(.23,1),new THREE.MeshStandardMaterial({color:0xfff9dc}));activity.add(ball);
  const textures:THREE.CanvasTexture[]=[];
  function canvasTexture(width:number,height:number){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.push(texture);return {canvas,context,texture};}
  const score=canvasTexture(768,256);let lastSecond=-1;
  function drawScore(time:number){const second=Math.floor(time);if(second===lastSecond)return;lastSecond=second;const c=score.context;c.fillStyle='#101e20';c.fillRect(0,0,768,256);c.textAlign='center';c.fillStyle='#ffe500';c.font='700 27px "Area Inktrap"';c.fillText('FICTIONAL MATCH · BVB 3D STADIUM',384,42);c.fillStyle='#fffdf2';c.font='800 66px "Area Inktrap"';c.fillText('HOME   0 : 0   AWAY',384,128);c.font='38px "Area Inktrap"';c.fillText(`${matchClock(time)}  ·  DEMO`,384,206);score.texture.needsUpdate=true;}
  const scoreMat=new THREE.MeshBasicMaterial({map:score.texture});
  for(const sign of [-1,1]){const panel=new THREE.Mesh(new THREE.PlaneGeometry(14,4.67),scoreMat);panel.position.set(0,33.8,sign*61);panel.rotation.y=sign>0?Math.PI:0;displays.add(panel);}
  const ribbon=canvasTexture(1024,128);const c=ribbon.context;c.fillStyle='#183b39';c.fillRect(0,0,1024,128);c.fillStyle='#ffe500';c.fillRect(0,0,16,128);c.fillRect(1008,0,16,128);c.font='700 40px "Area Inktrap"';c.textAlign='center';c.fillStyle='#fffdf2';c.fillText('BVB 3D STADIUM  /  INDEPENDENT CONCEPT',512,78);ribbon.texture.needsUpdate=true;
  const ribbonMat=new THREE.MeshBasicMaterial({map:ribbon.texture});
  for(const z of [-56,56])for(const x of [-24,0,24]){const panel=new THREE.Mesh(new THREE.PlaneGeometry(22,1.2),ribbonMat);panel.position.set(x,.75,z);panel.rotation.y=z>0?Math.PI:0;displays.add(panel);}
  for(const x of [-37,37])for(const z of [-39,-13,13,39]){const panel=new THREE.Mesh(new THREE.PlaneGeometry(24,1.2),ribbonMat);panel.position.set(x,.75,z);panel.rotation.y=x>0?-Math.PI/2:Math.PI/2;displays.add(panel);}
  // Boundary screens face the pitch; their plain backs must not mirror the lettering.
  const backing=surface(new THREE.MeshStandardMaterial({color:0x1f2a29,roughness:.6,metalness:.3})); // lit (Task 9): an unlit back read as a flat slab
  for(const panel of [...displays.children])if(panel instanceof THREE.Mesh&&panel.material===ribbonMat){
    const back=new THREE.Mesh(panel.geometry,backing);back.position.copy(panel.position);back.rotation.copy(panel.rotation);back.rotation.y+=Math.PI;displays.add(back);
  }
  // Lit by the explorer's sky and sun (viewer/pipeline.ts); the figures cast no shadows, and receive them only on
  // the high tier (the engine sets that), so the crowd under the roof's shadow is in shade too.
  function update(time:number){
    cohorts.forEach((cohort,i)=>{cohort.position.y=Math.sin(time*1.4+i*1.7)*.035;});
    for(let i=0;i<22;i++){
      const p=playerPosition(i,time),yaw=Math.sin(time*.2+i);
      if(shapes){
        dummy.position.set(p[0],p[1],p[2]);dummy.rotation.set(0,yaw,0);dummy.scale.set(1,1,1);dummy.updateMatrix();playerBodies.setMatrixAt(i,dummy.matrix);playerHeads.setMatrixAt(i,dummy.matrix);
        // Legs swing from the hip (0.93 m), each a 0.9 m limb pivoting about its top.
        for(let side=0;side<2;side++){const swing=Math.sin(time*3+i+side*Math.PI)*.28,c=Math.cos(yaw),s=Math.sin(yaw),x=side?-.1:.1;
          dummy.rotation.set(swing,yaw,0,'YXZ');dummy.position.set(p[0]+c*x-s*Math.sin(swing)*.45,.93-Math.cos(swing)*.45,p[2]-s*x-c*Math.sin(swing)*.45);dummy.updateMatrix();legs.setMatrixAt(i*2+side,dummy.matrix);}
        dummy.rotation.order='XYZ';
      }else{
        dummy.position.set(p[0],p[1]+1,p[2]);dummy.rotation.set(0,yaw,0);dummy.scale.set(1,1,1);dummy.updateMatrix();playerBodies.setMatrixAt(i,dummy.matrix);
        dummy.position.y+=.68;dummy.updateMatrix();playerHeads.setMatrixAt(i,dummy.matrix);
        for(let side=0;side<2;side++){dummy.position.set(p[0]+(side?-.16:.16),.3,p[2]+Math.sin(time*3+i+side*Math.PI)*.12);dummy.updateMatrix();legs.setMatrixAt(i*2+side,dummy.matrix);}
      }
    }
    playerBodies.instanceMatrix.needsUpdate=true;playerHeads.instanceMatrix.needsUpdate=true;legs.instanceMatrix.needsUpdate=true;ball.position.set(...ballPosition(time));drawScore(time);
  }
  update(0);
  return {root,crowd,activity,displays,count:all.length,update,updateCrowd,dispose(){
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    root.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
  }};
}
