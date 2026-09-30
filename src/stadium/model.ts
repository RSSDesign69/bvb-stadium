import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DEMO } from '../places/demo';
import type { Place, StandId, Vec3 } from '../places/schema';
import { BOWL, PYLON, PYLONS } from '../hero/framing';
import { STANDS, STAND_ORDER, standAt, tiers, world, rowDepth, rowFloor } from './layout';
import { Mesher } from './sweep';
import { CORNER_BASE, CORNER_SEGMENTS, GLAZE, LIP, TUNNEL, buildStands, soffitAt, standHalf } from './stands';
import { CORES, ENTRANCES, ENTRY, FACE, GLASS_HALF, GLASS_ROWS, WALL, buildWall, cores, mullions, paneMullions } from './shell';
import { ROOF_OPENING, buildRoof } from './roof';
import { seatMaterial, stadiumMaterials, turfMaterial } from './materials';

type Batch = { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; stands:(StandId|null)[]; layer:Layer };
// Detail layers (Task 7): '' is always drawn; 'close' is small close-range detail, hidden when the camera is far from
// the stadium (sub-pixel there, so the switch cannot pop); 'inside' is structure seen only from under the roof.
type Layer=''|'close'|'inside';
// Close detail shows within this distance of the stadium's bounding box. At 240 m a 0.1 m mullion is half a pixel
// wide at 1440 × 900 and fov 43°.
export const DETAIL_NEAR=240;
const EXTENT=new THREE.Box3(new THREE.Vector3(-95,-1,-114),new THREE.Vector3(95,64,114));
export const detailDistance=(p:THREE.Vector3)=>EXTENT.distanceToPoint(p);
export interface PickGroup { mesh:THREE.InstancedMesh; places:Place[] }
const CODES:(StandId|null)[]=[null,...STAND_ORDER];
// The stand a structural hit belongs to: per-instance tags on batched details, per-triangle tags on the stand
// solids, and the hit point (standAt) on the shell and roof. Corners, the pitch and the pylons return null.
export function standOfHit(hit:THREE.Intersection):StandId|null{
  const u=hit.object.userData;
  if(u.stands&&hit.instanceId!==undefined)return u.stands[hit.instanceId]??null;
  if(u.faceStands&&hit.faceIndex!=null)return CODES[u.faceStands[hit.faceIndex]]??null;
  return u.byPoint?standAt(hit.point.x,hit.point.z):null;
}
export function buildStadium(compact=false){
  const group=new THREE.Group(); group.name='Original Dortmund concept';
  const pickGroups:PickGroup[]=[];const solids:THREE.Object3D[]=[];
  // Physically based, world-mapped materials (materials.ts); textures arrive after the first frame.
  const materials={...stadiumMaterials(),runoff:turfMaterial(0x355a2e)};
  const boxGeometry=new THREE.BoxGeometry(1,1,1),beamGeometry=new THREE.CylinderGeometry(1,1,1,6),prismGeometry=new THREE.CylinderGeometry(1,1,1,8);
  // Pylon (Task 7), one merged geometry so a mast is a single draw: the mast tapers from 1.34 m at the base to 0.96 m
  // at the crown (about the hero's 1.2 m on average), a collar where the stays land, and a conical cap.
  const H=PYLON.height-WALL.base,r=PYLON.radius;
  const mastGeometry=mergeGeometries([new THREE.CylinderGeometry(.8*r,1.12*r,H,24).translate(0,H/2+WALL.base,0),
    new THREE.CylinderGeometry(1.18,1.18,1.4,24).translate(0,PYLON.height-.7,0),new THREE.CylinderGeometry(.15,.98,1.4,24).translate(0,PYLON.height+.7,0)]);
  const batches=new Map<string,Batch>();
  let currentStand:StandId|null=null,layer:Layer='';
  const dummy=new THREE.Object3D(); const Y=new THREE.Vector3(0,1,0);
  function record(key:string,geometry:THREE.BufferGeometry,material:THREE.Material){
    key=`${layer}:${key}`;let b=batches.get(key);if(!b){b={geometry,material,matrices:[],stands:[],layer};batches.set(key,b);}dummy.updateMatrix();b.matrices.push(dummy.matrix.clone());b.stands.push(currentStand);
  }
  function box(position:Vec3,size:Vec3,material:keyof typeof materials='concrete',yaw=0){
    dummy.position.set(...position);dummy.rotation.set(0,yaw,0);dummy.scale.set(...size);record(`box-${material}`,boxGeometry,materials[material]);
  }
  function beam(a:Vec3,b:Vec3,r=.18,material:keyof typeof materials='steel',geometry=beamGeometry){
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
    dummy.position.copy(start.add(end).multiplyScalar(.5));dummy.quaternion.setFromUnitVectors(Y,delta.clone().normalize());dummy.scale.set(r,delta.length(),r);
    record(`beam-${material}-${geometry.uuid}`,geometry,materials[material]);
  }
  // A box of cross-section w × h running from a to b, kept level across its width.
  function strut(a:Vec3,b:Vec3,w:number,h:number,material:keyof typeof materials){
    dummy.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);dummy.up.set(0,1,0);dummy.lookAt(...b);
    dummy.scale.set(w,h,Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]));record(`box-${material}`,boxGeometry,materials[material]);
  }
  function rail(a:Vec3,b:Vec3){beam(a,b,.065);const n=Math.max(1,Math.floor(Math.hypot(a[0]-b[0],a[2]-b[2])/4));for(let i=0;i<=n;i++){const p=a.map((v,j)=>v+(b[j]-v)*i/n) as unknown as Vec3;beam([p[0],p[1]-1.05,p[2]],p,.055);}}
  // Podium (Task 8): a paved top at -0.25 m on grassed embankments down to the district (-1.8 m), with a flight of
  // steps at each entrance. The step boxes cover the bank's slope wherever they stand.
  const PODIUM={x:105,z:126,top:-.25,ground:-1.8,run:3.9};
  {
    const {x,z,top,ground,run}=PODIUM,X=x+run,Z=z+run,p:number[]=[],n:number[]=[];
    const quad=(a:number[],b:number[],c:number[],d:number[])=>{const u=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),v=new THREE.Vector3(d[0]-a[0],d[1]-a[1],d[2]-a[2]),nn=u.cross(v).normalize();
      if(nn.y<0)nn.negate(),[b,d]=[d,b];p.push(...a,...b,...c,...a,...c,...d);for(let i=0;i<6;i++)n.push(nn.x,nn.y,nn.z);};
    const ring=[[x,z],[-x,z],[-x,-z],[x,-z]],base=[[X,Z],[-X,Z],[-X,-Z],[X,-Z]];
    const g=new THREE.BufferGeometry();
    quad([x,top,z],[x,top,-z],[-x,top,-z],[-x,top,z]);g.addGroup(0,6,0);
    for(let i=0;i<4;i++){const j=(i+1)%4;quad([ring[i][0],top,ring[i][1]],[base[i][0],ground,base[i][1]],[base[j][0],ground,base[j][1]],[ring[j][0],top,ring[j][1]]);}
    g.addGroup(6,24,1);g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.computeBoundingSphere();
    const podium=new THREE.Mesh(g,[materials.apron,materials.bank]);podium.name='podium';group.add(podium);solids.push(podium);
    const steps=9,rise=(top-ground)/steps,tread=run/steps;
    for(const e of ENTRANCES){
      currentStand=e.ox?(e.ox<0?'west':'east'):(e.oz<0?'north':'south');
      const mid=(e.u0+e.u1)/2,w=e.u1-e.u0+5,edge=e.ox?x:z;
      for(let i=0;i<steps;i++){const d=(i+1)*tread,h=top-i*rise;
        box(e.ox?[e.ox*(edge+d/2),(h+ground)/2,mid]:[mid,(h+ground)/2,e.oz*(edge+d/2)],e.ox?[d,h-ground,w]:[w,h-ground,d],'parapet');}
    }
    currentStand=null;
  }
  box([0,-.15,0],[85,.3,122],'runoff');
  // The 14 mowing stripes, one instanced draw with per-stripe colour.
  const stripes=new THREE.InstancedMesh(new THREE.BoxGeometry(68,.12,7.5),turfMaterial(0xffffff,1),14);stripes.name='pitch-stripes';
  for(let i=0;i<14;i++){dummy.position.set(0,.02,-52.5+3.75+i*7.5);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();stripes.setMatrixAt(i,dummy.matrix);stripes.setColorAt(i,new THREE.Color(i%2?0x4d8038:0x417232));}
  stripes.computeBoundingSphere();group.add(stripes);
  // Pitch markings and goal nets: segments collected per colour and drawn as one LineSegments each (Task 8 draw budget).
  const lines=new Map<number,number[]>();
  function line(points:Vec3[],color=0xf1f2d5){let l=lines.get(color);if(!l)lines.set(color,l=[]);for(let i=1;i<points.length;i++)l.push(...points[i-1],...points[i]);}
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
  for(const [color,l] of lines){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(l,3));g.computeBoundingSphere();const m=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color}));m.name='pitch-lines';group.add(m);}
  // Solid stands and corners from cross-section profiles (stands.ts), one mesh with a stand tag per triangle.
  const standMesh=new Mesher();
  // Treads and risers share a material (and the concourse floor shares concrete's) to hold the phone draw-call budget.
  buildStands(standMesh,s=>CODES.indexOf(s),(s,m)=>m==='tread'||m==='riser'?(s==='south'?'terrace':'tread'):m==='floor'?'concrete':m);
  const standBuilt=standMesh.build(materials);
  const standSolid=new THREE.Mesh(standBuilt.geometry,standBuilt.material);standSolid.name='stand-solids';standSolid.userData.faceStands=standBuilt.tags;
  group.add(standSolid);solids.push(standSolid);
  for(const stand of STAND_ORDER){
    currentStand=stand;
    const config=STANDS[stand],yaw=Math.atan2(config.out[0],config.out[2]),half=standHalf(stand);
    const local=(u:number,d:number,y:number)=>world(stand,u,d,y);
    for(const tier of tiers(stand)){
      for(let r=0;r<tier.rows;r++){
        const depth=rowDepth(stand,tier,r),floor=rowFloor(tier,r);
        // Aisle edges read as narrow yellow step marks.
        for(let b=1;b<config.blocks;b++)box(local(-config.length/2+b*config.length/config.blocks,depth,floor+.03),[1.3,.07,.17],'yellow',yaw);
      }
      const rows=(r:number)=>({d:rowDepth(stand,tier,r),f:rowFloor(tier,r)}),back=rows(5).d-tier.depth/2,ceiling=rows(5).f-TUNNEL.ceiling;
      for(const block of DEMO.blocks.filter(b=>b.stand===stand)){
        const d=config.inner+tier.offset;
        for(const side of [-1,1]){
          rail(local(block.center+side*1.6,d,tier.floor+1.1),local(block.center+side*1.6,d+4.5,tier.floor+3.3));
          // Dark linings on the tunnel sides; the upper tier's vomitories are stairwells onto the concourse.
          if(tier.tier!=='upper')box(local(block.center+side*1.325,back+TUNNEL.depth/2,(tier.floor+ceiling)/2),[.05,ceiling-tier.floor,TUNNEL.depth],'dark',yaw);
        }
      }
      if(tier.tier==='upper'){
        const lip=config.inner+tier.offset+LIP.front,top=tier.floor+LIP.top;
        rail(local(-half,lip+.3,top+1.05),local(half,lip+.3,top+1.05));
        // Raker beams under the soffit at every aisle line, visible from the lower tier and across the bowl.
        const front=rowDepth(stand,tier,0)-tier.depth/2,glaze=config.inner+tier.offset+GLAZE;
        for(let b=1;b<config.blocks;b++){
          const u=-config.length/2+b*config.length/config.blocks;
          strut(local(u,front,soffitAt(tier,front-config.inner)-.45),local(u,glaze,soffitAt(tier,glaze-config.inner)-.45),.5,.9,'edge');
        }
      }
      if(stand==='south'){
        for(let r=7;r<44;r+=8)for(const block of DEMO.blocks.filter(b=>b.stand===stand)){
          const d=rowDepth(stand,tier,r),h=rowFloor(tier,r)+1.05;
          rail(local(block.center-block.width*.32,d,h),local(block.center+block.width*.32,d,h));
        }
      }
    }
  }
  currentStand=null;
  // Corner details on the swept terraces: the upper lip's rail and a raker every four segments.
  const upper=tiers('north')[1];
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const at=(k:number,r:number,y:number):Vec3=>{const a=k/CORNER_SEGMENTS*Math.PI/2;return [sx*(BOWL.cornerX+r*Math.cos(a)),y,sz*(BOWL.cornerZ+r*Math.sin(a))];};
    const railR=CORNER_BASE+upper.offset+LIP.front+.3,railY=upper.floor+LIP.top+1.05;
    for(let k=0;k<CORNER_SEGMENTS;k++){beam(at(k,railR,railY),at(k+1,railR,railY),.065);if(k%3===0)beam(at(k,railR,railY-1.05),at(k,railR,railY),.055);}
    const front=upper.offset-upper.depth/2,glaze=upper.offset+GLAZE;
    for(let k=4;k<CORNER_SEGMENTS;k+=4)strut(at(k,CORNER_BASE+front,soffitAt(upper,front)-.45),at(k,CORNER_BASE+glaze,soffitAt(upper,glaze)-.45),.5,.9,'edge');
  }
  // Outer wall (shell.ts): one continuous mesh; hits choose a stand from the hit point.
  const wallMesh=new Mesher();buildWall(wallMesh);
  const wallBuilt=wallMesh.build(materials),wall=new THREE.Mesh(wallBuilt.geometry,wallBuilt.material);wall.name='outer-wall';wall.userData.byPoint=true;
  group.add(wall);solids.push(wall);
  // Curtain wall (Task 7): structural fins stand 0.6 m proud of the cladding; inside an entrance span they come down
  // to the ground as piers. Secondary mullions split the recessed glass into 1.7 m panes (close-range detail).
  const onRun=(x:number,z:number,e:typeof ENTRANCES[number])=>e.ox?Math.sign(x)===e.ox&&Math.abs(Math.abs(x)-BOWL.cornerX-BOWL.wallRadius)<2&&z>=e.u0&&z<=e.u1:Math.sign(z)===e.oz&&Math.abs(Math.abs(z)-BOWL.cornerZ-BOWL.wallRadius)<2&&x>=e.u0&&x<=e.u1;
  for(const {position:[x,,z],out:[ox,oz]} of mullions()){
    const y0=ENTRANCES.some(e=>onRun(x,z,e))?WALL.base:WALL.plinth;box([x,(y0+WALL.top)/2,z],[.4,WALL.top-y0,.7],'mullion',Math.atan2(ox,oz));
  }
  layer='close';
  for(const {position:[x,,z],out:[ox,oz]} of paneMullions(BOWL.wallRadius+FACE.glass+.12))for(const h of GLASS_ROWS)
    box([x,h,z],[.1,GLASS_HALF*2,.25],'mullion',Math.atan2(ox,oz));
  layer='';
  // Entrances: a glazed recess under a cantilevered canopy with a deep fascia and two slim columns.
  for(const e of ENTRANCES){
    currentStand=e.ox?(e.ox<0?'west':'east'):(e.oz<0?'north':'south');
    const yaw=Math.atan2(e.ox,e.oz),mid=(e.u0+e.u1)/2,w=e.u1-e.u0+5,R=BOWL.wallRadius;
    const at=(u:number,d:number,y:number):Vec3=>e.ox?[e.ox*(BOWL.cornerX+d),y,u]:[u,y,e.oz*(BOWL.cornerZ+d)];
    const c0=R+FACE.cladding,c1=R+ENTRY.canopy;
    box(at(mid,(c0+c1)/2,3.08),[w,.3,c1-c0],'edge',yaw);box(at(mid,c1-.2,2.9),[w+.1,.7,.4],'reveal',yaw);
    // Cantilevered: tie rods from the fascia back up to the wall above the first glazing row.
    for(const side of [-1,1])for(const k of [.5,.25])beam(at(mid+side*w*k*(k===.5?.9:1),c1-.4,3.25),at(mid+side*w*k*(k===.5?.9:1),c0,8.8),.07);
    layer='close';
    // Door frames every 1.5 m and a transom, standing just proud of the door glass.
    const n=Math.round((e.u1-e.u0)/1.5);
    for(let i=1;i<n;i++)box(at(e.u0+(e.u1-e.u0)*i/n,R+ENTRY.door+.06,(WALL.base+ENTRY.head)/2),[.09,ENTRY.head-WALL.base,.12],'reveal',yaw);
    box(at(mid,R+ENTRY.door+.06,2.35),[e.u1-e.u0,.09,.12],'reveal',yaw);
    layer='';
  }
  currentStand=null;
  // Stair cores against the corner arcs: a concrete tower with a glazed slot between two piers, landing bands
  // across the slot, and a coping.
  for(const {x,z,ox,oz} of cores()){
    const yaw=Math.atan2(ox,oz),R=BOWL.wallRadius,{width,depth,height}=CORES;
    const at=(u:number,d:number,y:number):Vec3=>[x+ox*(d-R)+oz*u,y,z+oz*(d-R)-ox*u];
    const front=R+depth+.5,back=R-.2,slot=1.8,pier=(width-slot)/2;
    box(at(0,(back+front)/2,(WALL.base+height)/2),[width,height-WALL.base,front-back],'core',yaw);
    for(const side of [-1,1])box(at(side*(slot+pier)/2,front+.2,(WALL.base+height)/2),[pier,height-WALL.base,.4],'core',yaw);
    box(at(0,front+.075,(WALL.base+height-1)/2),[slot,height-1-WALL.base,.15],'coreGlass',yaw);
    for(let y=3.6;y<height-2;y+=3.6)box(at(0,front+.17,y),[slot,.32,.34],'slabEdge',yaw);
    box(at(0,(back+front+.4)/2,height+.2),[width+.4,.4,front+.6-back],'parapet',yaw);
  }
  // Eight yellow pylon masts at the hero's positions and proportions, tapered, on concrete plinths, with a crown
  // collar (where the stays land, roof.ts) and a conical cap. Their stays follow the roof edge.
  for(const [x,z] of PYLONS){
    dummy.position.set(x,0,z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);record(`mast`,mastGeometry,materials.pylon);
    beam([x,WALL.base,z],[x,1.2,z],2.3,'plinth',prismGeometry);
  }
  // Player tunnel and technical areas, original unbranded geometry.
  box([-38.5,1.4,0],[6,2.8,5],'dark');box([-38,3,0],[7,.4,5.5],'edge');
  for(const z of [-13,13]){box([-37,1,z],[3,2,8],'glass');box([-37,2.1,z],[3.5,.2,9],'edge');}
  // Place meshes are split by block/section to reject whole groups in raycasting.
  const mat=seatMaterial();
  // Shadow-only proxies (Task 7): the 94 seat meshes would each be a shadow-pass draw; two instanced proxies (seat
  // and back merged, and the standing markers) cast instead. The pipeline shows them only while the static shadow
  // map renders (shadowOnly), so they cost nothing in the scene pass and are never picked.
  const proxy={seated:[] as THREE.Matrix4[],standing:[] as THREE.Matrix4[]};
  // Task 9: on `high` a seat is one moulded tip-up shell (pan and back as a single profile, 36 triangles), in place
  // of two boxes; seat previews look straight at the front rows. One mesh per section also halves the seat draws.
  // Local +z points out of the bowl (the back), y is up from the place's +0.45 m.
  const shell=compact?null:(()=>{
    const profile:[number,number][]=[[-.25,-.035],[-.23,-.004],[.13,-.02],[.19,.02],[.245,.43],[.275,.455],[.31,.43],[.25,-.035],[.2,-.075],[-.22,-.062]];
    const g=new THREE.ExtrudeGeometry(new THREE.Shape(profile.map(([z,y])=>new THREE.Vector2(z,y))),{depth:.46,bevelEnabled:false,curveSegments:1});
    g.rotateY(-Math.PI/2).translate(.23,0,0);return g;
  })();
  const seatGeometry=shell??new THREE.BoxGeometry(.5,.16,.52),markerGeometry=new THREE.BoxGeometry(2.4,.12,1.5);
  for(const block of DEMO.blocks)for(const section of block.sections){
    const places=section.rows.flatMap(r=>r.places);const standing=block.stand==='south';
    const seats=new THREE.InstancedMesh(standing?markerGeometry:seatGeometry,mat,places.length);seats.name=section.id;
    const out=STANDS[block.stand].out,yaw=Math.atan2(out[0],out[2]);
    for(let i=0;i<places.length;i++){
      const p=places[i];dummy.position.set(p.position[0],p.position[1]+(standing?.1:.45),p.position[2]);dummy.rotation.set(0,yaw,0);dummy.scale.set(1,1,1);dummy.updateMatrix();seats.setMatrixAt(i,dummy.matrix);
      if(!compact)proxy[standing?'standing':'seated'].push(dummy.matrix.clone());
      const band=p.kind==='seat'&&(Math.floor((p.seatNumber+Number(block.id.slice(-2))*4)/7)%3===0);
      const color=new THREE.Color(standing?0xd6b81c:band?0x252c29:0xe5bd15);
      if(p.availability==='unavailable')color.multiplyScalar(.6);
      seats.setColorAt(i,color);
    }
    seats.computeBoundingSphere();group.add(seats);pickGroups.push({mesh:seats,places});
  }
  const shadowOnly:THREE.Object3D[]=[];
  if(!compact){
    const back=new THREE.BoxGeometry(.5,.52,.1).translate(0,.28,.2),seatBox=new THREE.BoxGeometry(.5,.16,.52);
    for(const [geometry,list] of [[mergeGeometries([seatBox,back]),proxy.seated],[new THREE.BoxGeometry(2.4,.12,1.5),proxy.standing]] as const){
      const m=new THREE.InstancedMesh(geometry,mat,list.length);m.name='seat-shadow-proxy';list.forEach((x,i)=>m.setMatrixAt(i,x));m.computeBoundingSphere();
      m.visible=false;m.userData.shadowOnly=true;group.add(m);shadowOnly.push(m);
    }
    seatBox.dispose();back.dispose();
  }
  const detail:Record<'close'|'inside',THREE.Object3D[]>={close:[],inside:[]};
  for(const batch of batches.values()){
    const mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);
    mesh.userData.stands=batch.stands;
    batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.computeBoundingSphere();
    // Detail is not a pick occluder (it is thin and sometimes hidden), so picks never depend on the detail switch.
    group.add(mesh);if(batch.layer)detail[batch.layer].push(mesh);else solids.push(mesh);
  }
  // Roof ring (roof.ts): never hidden. The cutaway pulls its inner edge back from 8 m to 25 m behind the front row.
  const roof=buildRoof({...materials,light:materials.white});group.add(roof.group);solids.push(...roof.solids);
  detail.close.push(...roof.detail.close);detail.inside.push(...roof.detail.inside);
  // Sun shadows (static map, see viewer/pipeline.ts): every lit surface receives; opaque structure casts. Seats
  // cast too except on phones; the pitch, the translucent strip and unlit parts (lines, light bars) do not.
  const seats=new Set<THREE.Object3D>(pickGroups.map(g=>g.mesh));
  group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const m=Array.isArray(o.material)?o.material[0]:o.material,lit=!(m instanceof THREE.MeshBasicMaterial);
    o.receiveShadow=lit;o.castShadow=lit&&!m.transparent&&o!==stripes&&!seats.has(o);});
  // Detail never casts: the static shadow map would otherwise change when detail shows or hides.
  for(const o of [...detail.close,...detail.inside])o.castShadow=false;
  // The detail switch (engine.ts, every rendered frame): close-range detail near the stadium, soffit structure
  // from under the roof. Returns true when anything changed.
  let detailState='';
  function setDetail(close:boolean,inside:boolean){
    const key=`${close}${inside}`;if(key===detailState)return false;detailState=key;
    detail.close.forEach(o=>{o.visible=close;});detail.inside.forEach(o=>{o.visible=inside;});return true;
  }
  setDetail(false,false);
  const marker=new THREE.Mesh(new THREE.RingGeometry(.75,1.12,32),new THREE.MeshBasicMaterial({color:0x61f4e2,side:THREE.DoubleSide,depthTest:false}));
  marker.rotation.x=-Math.PI/2;marker.renderOrder=10;marker.visible=false;group.add(marker);
  const hoverMarker=marker.clone();hoverMarker.material=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,depthTest:false});hoverMarker.visible=false;group.add(hoverMarker);
  return {group,roof:roof.group,standSolid,pickGroups,solids,marker,hoverMarker,roofOpening:ROOF_OPENING,detail,setDetail,shadowOnly,
    setRoofOpening:roof.setOpening,get roofOpeningNow(){return roof.opening;},dispose(){
    const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>();
    group.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();if(o instanceof THREE.Mesh||o instanceof THREE.Line){gs.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));}});
    gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());
  }};
}
