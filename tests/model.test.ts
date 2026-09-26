import { DEFAULT_ATMOSPHERE, shouldAnimate } from '../src/atmosphere/settings';
import { crowdPositions, playerPosition, ballPosition, matchClock } from '../src/atmosphere/matchday';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DEMO, createDemoDataset, samplePlace } from '../src/places/demo';
import { DEFAULT_FILTERS, demoGroup, filterDemoPlaces } from '../src/commerce/demo/discovery';
import { buildStadium } from '../src/stadium/model';
import { HOME, previewRoute, returnRoute, routePoint } from '../src/viewer/camera';
import type { Vec3 } from '../src/places/schema';

test('stable hierarchy, unique IDs, finite eye positions, and honest standing semantics',()=>{
  assert.ok(DEMO.places.length>10000);assert.equal(new Set(DEMO.places.map(p=>p.id)).size,DEMO.places.length);
  assert.deepEqual(createDemoDataset(),DEMO);
  const seen=new Set<string>();
  for(const b of DEMO.blocks)for(const s of b.sections)for(const r of s.rows)for(const p of r.places){
    assert.equal(p.blockId,b.id);assert.equal(p.sectionId,s.id);assert.equal(p.rowId,r.id);assert.equal(p.stand,b.stand);
    assert.equal(p.verified,false);assert.equal(p.provenance,'generated-demo-v1');assert.ok([...p.position,...p.eye,...p.direction].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...p.direction)-1)<1e-9);assert.ok(p.eye[1]>p.position[1]);
    if(p.stand==='south'){assert.equal(p.kind,'standing-area');assert.ok(!('seatNumber' in p));assert.ok(!('rowNumber' in p));}
    else assert.equal(p.kind,'seat');seen.add(p.id);
  }
  assert.equal(seen.size,DEMO.places.length);
});

test('structural picks retain their authored stand, including end-stand edges',()=>{
  const stadium=buildStadium(true);
  try{
    stadium.group.updateMatrixWorld(true);
    const ray=new THREE.Raycaster();
    const standAt=(x:number,z:number)=>{
      ray.set(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObjects(stadium.solids,false)[0];
      assert.ok(hit&&hit.instanceId!==undefined);
      return hit.object.userData.stands[hit.instanceId];
    };
    assert.equal(standAt(0,90),'south');
    assert.equal(standAt(0,-90),'north');
    assert.equal(standAt(-70,0),'west');
    assert.equal(standAt(70,0),'east');
    assert.equal(standAt(44,-70),'north');
    assert.equal(standAt(0,0),null);
  }finally{stadium.dispose();}
});

test('demo quantity uses consecutive available seats or a single unassigned standing area',()=>{
  const seated=DEMO.places.find(p=>p.kind==='seat'&&demoGroup(p,4));
  assert.ok(seated&&seated.kind==='seat');
  const group=demoGroup(seated,4)!;
  assert.equal(group.people,4);assert.equal(group.places.length,4);
  assert.ok(group.places.every((p,i)=>p.kind==='seat'&&p.rowId===seated.rowId&&p.seatNumber===seated.seatNumber+i&&p.availability==='available'));
  assert.equal(group.total,group.places.reduce((sum,p)=>sum+p.demoPrice,0));
  const broken=DEMO.places.find(p=>p.kind==='seat'&&p.availability==='available'&&!demoGroup(p,4));
  assert.ok(broken);assert.equal(demoGroup(broken,4),null);
  const unavailable=DEMO.places.find(p=>p.availability==='unavailable')!;
  assert.equal(demoGroup(unavailable,1),null);
  const standing=DEMO.places.find(p=>p.kind==='standing-area'&&p.availability==='available')!;
  const standingGroup=demoGroup(standing,4)!;
  assert.equal(standingGroup.people,4);assert.deepEqual(standingGroup.places,[standing]);
  assert.equal(standingGroup.total,standing.demoPrice*4);
});

test('combined demo filters respect stand, tier, category, people, and price',()=>{
  const south=filterDemoPlaces({...DEFAULT_FILTERS,stand:'south',tier:'terrace',category:'terrace',quantity:3,maxPrice:20});
  assert.ok(south.length>0);
  assert.ok(south.every(p=>p.stand==='south'&&p.tier==='terrace'&&p.priceCategory==='terrace'&&p.demoPrice<=20&&demoGroup(p,3)));
  assert.equal(filterDemoPlaces({...DEFAULT_FILTERS,stand:'north',tier:'terrace'}).length,0);
  assert.equal(filterDemoPlaces({...DEFAULT_FILTERS,maxPrice:19}).length,0);
  assert.equal(filterDemoPlaces(DEFAULT_FILTERS).length,DEMO.places.length);
  assert.ok(filterDemoPlaces(DEFAULT_FILTERS).some(p=>p.availability==='unavailable'));
});

test('low, middle and high shortcuts choose distinct, ascending viewpoints in every block',()=>{
  for(const block of DEMO.blocks){
    const samples=(['low','middle','high'] as const).map(level=>samplePlace(block,level));
    assert.equal(new Set(samples.map(p=>p.id)).size,3,block.id);
    assert.ok(samples[0].eye[1]<samples[1].eye[1]&&samples[1].eye[1]<samples[2].eye[1],block.id);
    for(const p of samples)assert.equal(p.blockId,block.id);
  }
});

test('preview and return routes preserve endpoints even with duplicate waypoints',()=>{
  for(const p of DEMO.places.filter((_,i)=>i%83===0)){
    const route=previewRoute(HOME,p.eye);assert.deepEqual(routePoint(route,0),HOME);assert.deepEqual(routePoint(route,1),p.eye);
    const back=returnRoute(p.eye,HOME);assert.deepEqual(routePoint(back,0),p.eye);assert.deepEqual(routePoint(back,1),HOME);
    for(let t=0;t<=1;t+=.05)assert.ok(routePoint(route,t).every(Number.isFinite));
  }
});

test('representative flight paths avoid solid stadium geometry with the roof present',()=>{
  const stadium=buildStadium();stadium.group.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();let paths=0;
  for(const b of DEMO.blocks){
    for(const level of ['low','middle','high'] as const){
      const p=samplePlace(b,level);
      for(const route of [previewRoute(HOME,p.eye),returnRoute(p.eye,HOME)]){
        for(let i=1;i<route.length;i++){
          const a=new THREE.Vector3(...route[i-1]),delta=new THREE.Vector3(...route[i]).sub(a);if(delta.length()<.01)continue;
          ray.set(a,delta.clone().normalize());ray.near=.01;ray.far=delta.length()-.08;
          const collision=ray.intersectObjects(stadium.solids,false)[0];assert.ok(!collision,`${p.id}: route segment ${i} intersects structure at ${collision?.distance}`);
        }paths++;
      }
    }
  }
  console.log(`Validated ${paths} representative flight paths with full roof.`);stadium.dispose();
});

test('sample eye rays toward centre and both goals remain clear of structural solids',()=>{
  const stadium=buildStadium();stadium.group.updateMatrixWorld(true);const ray=new THREE.Raycaster();let rays=0;
  for(const b of DEMO.blocks){
    for(const level of ['low','middle','high'] as const){
      const p=samplePlace(b,level);
      for(const target of [[0,1,0],[0,1,-51],[0,1,51]] as Vec3[]){
        const a=new THREE.Vector3(...p.eye),delta=new THREE.Vector3(...target).sub(a);ray.set(a,delta.clone().normalize());ray.near=.15;ray.far=delta.length()-.2;
        const collision=ray.intersectObjects(stadium.solids,false)[0];assert.ok(!collision,`${p.id}: model sightline to ${target} hits structure at ${collision?.distance}`);rays++;
      }
    }
  }
  console.log(`Validated ${rays} illustrative model sightlines (not venue measurements).`);stadium.dispose();
});


test('match-day motion respects pause, visibility, reduced motion and clear-view previews',()=>{
  assert.equal(shouldAnimate(DEFAULT_ATMOSPHERE,false,true,false),true);
  for(const settings of [{...DEFAULT_ATMOSPHERE,enabled:false},{...DEFAULT_ATMOSPHERE,paused:true}])assert.equal(shouldAnimate(settings,false,true,false),false);
  assert.equal(shouldAnimate(DEFAULT_ATMOSPHERE,true,true,false),false);
  assert.equal(shouldAnimate(DEFAULT_ATMOSPHERE,false,false,false),false);
  assert.equal(shouldAnimate(DEFAULT_ATMOSPHERE,false,true,true),false);
  assert.equal(shouldAnimate({...DEFAULT_ATMOSPHERE,clearView:false},false,true,true),true);
});

test('original crowd is bounded and pitch activity stays inside the field',()=>{
  const full=crowdPositions(false),compact=crowdPositions(true);
  assert.ok(full.length<5000);assert.ok(compact.length<full.length/2);
  for(const stand of ['south','west','north','east'])assert.ok(full.some(p=>p.stand===stand));
  for(const {position:p} of full){assert.ok(p.every(Number.isFinite));assert.ok(Math.abs(p[0])>34||Math.abs(p[2])>52.5);assert.ok(p[1]>=2&&p[1]<35);}
  for(let t=0;t<3600;t+=17){
    for(let i=0;i<22;i++){const p=playerPosition(i,t);assert.ok(Math.abs(p[0])<34&&Math.abs(p[2])<52.5);}
    const ball=ballPosition(t);assert.ok(Math.abs(ball[0])<34&&Math.abs(ball[2])<52.5);
  }
  assert.equal(matchClock(0),'46:00');assert.equal(matchClock(65),'47:05');
});
