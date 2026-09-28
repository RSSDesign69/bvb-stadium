import * as THREE from 'three';
import { DEMO } from '../places/demo';
import type { Place, StandId, Vec3 } from '../places/schema';
import { STANDS, STAND_ORDER, tiers, world, rowDepth, rowFloor } from './layout';

type Batch = { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; stands:(StandId|null)[]; roof:boolean };
export interface PickGroup { mesh:THREE.InstancedMesh; places:Place[] }
export function buildStadium(compact=false){
  const group=new THREE.Group(); group.name='Original Dortmund concept';
  const roof=new THREE.Group();roof.name='Roof and trusses';group.add(roof);
  const pickGroups:PickGroup[]=[];const solids:THREE.Object3D[]=[];
  const materials={
    concrete:new THREE.MeshStandardMaterial({color:0x727873,roughness:1}),
    edge:new THREE.MeshStandardMaterial({color:0x505955,roughness:.8}),
    yellow:new THREE.MeshStandardMaterial({color:0xf6c900,roughness:.68}),
    steel:new THREE.MeshStandardMaterial({color:0x939d9b,metalness:.4,roughness:.6}),
    roof:new THREE.MeshStandardMaterial({color:0xb4bab5,metalness:.35,roughness:.7,side:THREE.DoubleSide}),
    dark:new THREE.MeshStandardMaterial({color:0x151d21,roughness:1}),
    glass:new THREE.MeshStandardMaterial({color:0x526b6a,roughness:.3,metalness:.5}),
    terrace:new THREE.MeshStandardMaterial({color:0x96862c,roughness:1}),
    white:new THREE.MeshBasicMaterial({color:0xe5eadd}),
  };
  const boxGeometry=new THREE.BoxGeometry(1,1,1),beamGeometry=new THREE.CylinderGeometry(1,1,1,6);
  const batches=new Map<string,Batch>();
  let currentStand:StandId|null=null;
  const dummy=new THREE.Object3D(); const Y=new THREE.Vector3(0,1,0);
  function record(key:string,geometry:THREE.BufferGeometry,material:THREE.Material,isRoof:boolean){
    let b=batches.get(key);if(!b){b={geometry,material,matrices:[],stands:[],roof:isRoof};batches.set(key,b);}dummy.updateMatrix();b.matrices.push(dummy.matrix.clone());b.stands.push(currentStand);
  }
  function box(position:Vec3,size:Vec3,material:keyof typeof materials='concrete',yaw=0,isRoof=false){
    dummy.position.set(...position);dummy.rotation.set(0,yaw,0);dummy.scale.set(...size);record(`box-${material}-${isRoof}`,boxGeometry,materials[material],isRoof);
  }
  function beam(a:Vec3,b:Vec3,r=.18,material:keyof typeof materials='steel',isRoof=false){
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
    dummy.position.copy(start.add(end).multiplyScalar(.5));dummy.quaternion.setFromUnitVectors(Y,delta.clone().normalize());dummy.scale.set(r,delta.length(),r);
    record(`beam-${material}-${isRoof}`,beamGeometry,materials[material],isRoof);
  }
  function rail(a:Vec3,b:Vec3){beam(a,b,.065);const n=Math.max(1,Math.floor(Math.hypot(a[0]-b[0],a[2]-b[2])/4));for(let i=0;i<=n;i++){const p=a.map((v,j)=>v+(b[j]-v)*i/n) as unknown as Vec3;beam([p[0],p[1]-1.05,p[2]],p,.055);}}
  box([0,-1,0],[210,1.5,252],'edge');box([0,-.15,0],[85,.3,122],'dark');
  for(let i=0;i<14;i++){
    const mat=new THREE.MeshStandardMaterial({color:i%2?0x387d47:0x317040,roughness:1});
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(68,.12,7.5),mat);stripe.position.set(0,.02,-52.5+3.75+i*7.5);group.add(stripe);
  }
  function line(points:Vec3[],color=0xf1f2d5){const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const l=new THREE.Line(g,new THREE.LineBasicMaterial({color}));group.add(l);}
  line([[-34,.12,-52.5],[34,.12,-52.5],[34,.12,52.5],[-34,.12,52.5],[-34,.12,-52.5]]);
  line([[-34,.12,0],[34,.12,0]]);
  line(Array.from({length:65},(_,i)=>[Math.cos(i/64*Math.PI*2)*9.15,.12,Math.sin(i/64*Math.PI*2)*9.15] as Vec3));
  for(const sign of [-1,1]){
    for(const [halfWidth,depth] of [[20.16,16.5],[9.16,5.5]])line([[-halfWidth,.12,sign*52.5],[-halfWidth,.12,sign*(52.5-depth)],[halfWidth,.12,sign*(52.5-depth)],[halfWidth,.12,sign*52.5]]);
    const z=sign*52.7;
    beam([-3.66,0,z],[-3.66,2.44,z],.065,'white');beam([3.66,0,z],[3.66,2.44,z],.065,'white');beam([-3.66,2.44,z],[3.66,2.44,z],.065,'white');
    for(let i=0;i<=12;i++){const x=-3.66+i*.61;line([[x,2.44,z],[x,2,z+sign*1.8],[x,.12,z+sign*1.8]],0x879f92);}
    for(let i=0;i<5;i++)line([[-3.66,i*.48,z+sign*1.8],[3.66,i*.48,z+sign*1.8]],0x879f92);
  }
  for(const stand of STAND_ORDER){
    currentStand=stand;
    const config=STANDS[stand],yaw=Math.atan2(config.out[0],config.out[2]);
    const local=(u:number,d:number,y:number)=>world(stand,u,d,y);
    for(const tier of tiers(stand)){
      for(let r=0;r<tier.rows;r++){
        const depth=rowDepth(stand,tier,r),floor=rowFloor(tier,r);
        for(const block of DEMO.blocks.filter(b=>b.stand===stand)){
          // Actual split floor geometry around each front entry portal.
          if(r<5){for(const side of [-1,1])box(local(block.center+side*(block.width/4+.675),depth,floor-.3),[block.width/2-1.35,.6,tier.depth], 'concrete',yaw);}
          else box(local(block.center,depth,floor-.3),[block.width,.6,tier.depth],stand==='south'?'terrace':'concrete',yaw);
        }
        // Aisle edges read as narrow yellow step marks.
        for(let b=1;b<config.blocks;b++)box(local(-config.length/2+b*config.length/config.blocks,depth,floor+.03),[1.3,.07,.17],'yellow',yaw);
      }
      for(const block of DEMO.blocks.filter(b=>b.stand===stand)){
        const d=config.inner+tier.offset;
        box(local(block.center,d+1.7,tier.floor-1),[2.65,2,3.5],'dark',yaw);
        box(local(block.center,d+2,tier.floor+.2),[3.1,.35,4.1],'edge',yaw);
        for(const side of [-1,1])rail(local(block.center+side*1.6,d,tier.floor+1.1),local(block.center+side*1.6,d+4.5,tier.floor+3.3));
      }
      if(tier.tier==='upper'){
        const depth=config.inner+tier.offset-2;
        box(local(0,depth,tier.floor-.6),[config.length,.6,3.6],'edge',yaw);
        rail(local(-config.length/2,depth-1,tier.floor+1.05),local(config.length/2,depth-1,tier.floor+1.05));
        box(local(0,depth,tier.floor-4),[config.length,4.5,1.2],'glass',yaw);
      }
      if(stand==='south'){
        for(let r=7;r<44;r+=8)for(const block of DEMO.blocks.filter(b=>b.stand===stand)){
          const d=rowDepth(stand,tier,r),h=rowFloor(tier,r)+1.05;
          rail(local(block.center-block.width*.32,d,h),local(block.center+block.width*.32,d,h));
        }
      }
    }
    const outer=config.inner+47;
    box(local(0,outer,17),[config.length+3,34,1.1],'edge',yaw);
    for(let u=-config.length/2;u<=config.length/2;u+=8){
      box(local(u,outer+.8,16),[.4,33,1],'steel',yaw);
      for(const h of [5,12,23,30])box(local(u+3.5,outer+.7,h),[6.5,2.7,.3],'glass',yaw);
    }
    box(local(0,config.inner+29,39.2),[config.length+6,.7,42],'roof',yaw,true);
    // Tall triangular truss along each roof opening, with repeated bracing.
    const inner=config.inner-1,half=config.length/2+3;
    beam(local(-half,inner,39.5),local(half,inner,39.5),.28,'steel',true);
    beam(local(-half,inner,45),local(half,inner,45),.24,'steel',true);
    for(let u=-half;u<half;u+=9){
      beam(local(u,inner,39.5),local(Math.min(u+4.5,half),inner,45),.18,'steel',true);
      beam(local(Math.min(u+4.5,half),inner,45),local(Math.min(u+9,half),inner,39.5),.18,'steel',true);
      beam(local(u,inner,39.5),local(u,config.inner+49,40),.19,'steel',true);
      box(local(u,inner,38.8),[3,.2,1],'white',yaw,true);
    }
  }
  currentStand=null;
  // Four connected terraced corners, authored as radial segments, not an oval bowl.
  for(const sx of [-1,1])for(const sz of [-1,1]){
    for(const tier of tiers('north'))for(let r=0;r<tier.rows;r++){
      const radius=3+tier.offset+r*tier.depth,h=rowFloor(tier,r);
      const segments=8;
      for(let j=0;j<segments;j++){
        const angle=(j+.5)/segments*Math.PI/2;
        const x=sx*(44+radius*Math.cos(angle)),z=sz*(63+radius*Math.sin(angle));
        box([x,h-.3,z],[Math.max(.4,radius*Math.PI/2/segments),.6,tier.depth+.2],'concrete',Math.atan2(-sz*Math.cos(angle),-sx*Math.sin(angle)));
      }
    }
    box([sx*66,39.2,sz*86],[44,.7,44],'roof',0,true);
    // Two signature yellow pylons per corner (eight total).
    for(const [x,z] of [[sx*88,sz*74],[sx*57,sz*112]]){
      beam([x,0,z],[x,62,z],.85,'yellow');
      beam([x,62,z],[sx*44,40,sz*62],.32,'yellow');
      beam([x,62,z],[sx*86,40,sz*109],.32,'yellow');
    }
  }
  // Player tunnel and technical areas, original unbranded geometry.
  box([-38.5,1.4,0],[6,2.8,5],'dark');box([-38,3,0],[7,.4,5.5],'edge');
  for(const z of [-13,13]){box([-37,1,z],[3,2,8],'glass');box([-37,2.1,z],[3.5,.2,9],'edge');}
  // Place meshes are split by block/section to reject whole groups in raycasting.
  for(const block of DEMO.blocks)for(const section of block.sections){
    const places=section.rows.flatMap(r=>r.places);const standing=block.stand==='south';
    const mat=new THREE.MeshStandardMaterial({roughness:.8});
    const geometry=new THREE.BoxGeometry(standing?2.4:.5,standing?.12:.16,standing?1.5:.52);
    const seats=new THREE.InstancedMesh(geometry,mat,places.length);seats.name=section.id;
    const back=standing||compact?null:new THREE.InstancedMesh(new THREE.BoxGeometry(.5,.52,.1),mat,places.length);
    const out=STANDS[block.stand].out,yaw=Math.atan2(out[0],out[2]);
    for(let i=0;i<places.length;i++){
      const p=places[i];dummy.position.set(p.position[0],p.position[1]+(standing?.1:.45),p.position[2]);dummy.rotation.set(0,yaw,0);dummy.scale.set(1,1,1);dummy.updateMatrix();seats.setMatrixAt(i,dummy.matrix);
      const band=p.kind==='seat'&&(Math.floor((p.seatNumber+Number(block.id.slice(-2))*4)/7)%3===0);
      const color=new THREE.Color(standing?0xd6b81c:band?0x252c29:0xe5bd15);
      if(p.availability==='unavailable')color.multiplyScalar(.6);
      seats.setColorAt(i,color);
      if(back){dummy.position.x+=out[0]*.2;dummy.position.z+=out[2]*.2;dummy.position.y+=.28;dummy.updateMatrix();back.setMatrixAt(i,dummy.matrix);back.setColorAt(i,color);}
    }
    seats.computeBoundingSphere();group.add(seats);pickGroups.push({mesh:seats,places});
    if(back){back.computeBoundingSphere();group.add(back);pickGroups.push({mesh:back,places});}
  }
  for(const batch of batches.values()){
    const mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);
    mesh.userData.stands=batch.stands;
    batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.computeBoundingSphere();
    (batch.roof?roof:group).add(mesh);solids.push(mesh);
  }
  const marker=new THREE.Mesh(new THREE.RingGeometry(.75,1.12,32),new THREE.MeshBasicMaterial({color:0x61f4e2,side:THREE.DoubleSide,depthTest:false}));
  marker.rotation.x=-Math.PI/2;marker.renderOrder=10;marker.visible=false;group.add(marker);
  const hoverMarker=marker.clone();hoverMarker.material=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,depthTest:false});hoverMarker.visible=false;group.add(hoverMarker);
  return {group,roof,pickGroups,solids,marker,hoverMarker,dispose(){
    const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>();
    group.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();if(o instanceof THREE.Mesh||o instanceof THREE.Line){gs.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));}});
    gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());
  }};
}
