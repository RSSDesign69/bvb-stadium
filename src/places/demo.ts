import type { Block, Place, PlaceDataset, Vec3 } from './schema';
import { STAND_ORDER, STANDS, tiers, world, rowDepth, rowFloor, inTunnel } from '../stadium/layout';
const pad=(n:number)=>String(n).padStart(2,'0');
export function createDemoDataset(): PlaceDataset {
  const blocks: Block[]=[]; const places: Place[]=[];
  for(const stand of STAND_ORDER){
    const config=STANDS[stand];
    for(let b=0;b<config.blocks;b++){
      const width=config.length/config.blocks;
      const block:Block={id:`DEMO-${stand.toUpperCase()}-${pad(b+1)}`,label:`${config.name} · ${pad(b+1)}`,stand,center:-config.length/2+width*(b+.5),width,sections:[]};
      for(const tier of tiers(stand)){
        const section={id:`${block.id}-${tier.tier.toUpperCase()}`,tier:tier.tier,rows:[] as Block['sections'][number]['rows']};
        for(let r=0;r<tier.rows;r++){
          const row={id:`${section.id}-R${pad(r+1)}`,number:r+1,kind:stand==='south'?'terrace-band' as const:'seated-row' as const,places:[] as Place[]};
          // One area sample per four terrace steps, never an assigned terrace seat.
          const count=stand==='south'?(r%4===2?1:0):Math.floor((width-2.8)/.62);
          for(let s=0;s<count;s++){
            const local=count===1?0:(s-(count-1)/2)*.62;
            if(inTunnel(r,local))continue;
            const position=world(stand,block.center+local,rowDepth(stand,tier,r),rowFloor(tier,r));
            const eye:Vec3=[position[0],position[1]+(stand==='south'?1.65:1.2),position[2]];
            const distance=Math.hypot(eye[0],eye[1],eye[2]);
            const direction:Vec3=[-eye[0]/distance,-eye[1]/distance,-eye[2]/distance];
            const base={blockId:block.id,sectionId:section.id,rowId:row.id,stand,tier:tier.tier,position,eye,direction,
              priceCategory:stand==='south'?'terrace' as const:stand==='north'?'end' as const:'sideline' as const,
              demoPrice:stand==='south'?20:stand==='north'?36:tier.tier==='upper'?48:62,
              benefits:[stand==='south'?'Standing-area concept':'Seated-place concept',tier.tier==='upper'?'Elevated perspective':'Close-to-pitch perspective'],
              availability:((b*19+r*7+s*3)%23===0?'unavailable':'available') as Place['availability'],
              provenance:'generated-demo-v1' as const,verified:false as const,sightline:'Unverified — illustrative geometry' as const};
            const place:Place=stand==='south'?{...base,id:`${section.id}-AREA${pad(Math.floor(r/4)+1)}`,kind:'standing-area',areaLabel:`Area ${b+1} · sample ${Math.floor(r/4)+1}`,sampleBand:r+1}
              :{...base,id:`${row.id}-S${pad(s+1)}`,kind:'seat',rowNumber:r+1,seatNumber:s+1};
            row.places.push(place);places.push(place);
          }
          if(row.places.length)section.rows.push(row);
        }
        block.sections.push(section);
      }
      blocks.push(block);
    }
  }
  return {provenance:'generated-demo-v1',blocks,places};
}
export const DEMO=createDemoDataset();
export const PLACE_BY_ID=new Map(DEMO.places.map(p=>[p.id,p]));
export const BLOCK_BY_ID=new Map(DEMO.blocks.map(b=>[b.id,b]));
export function describePlace(p:Place){return p.kind==='seat'?`Row ${p.rowNumber}, seat ${p.seatNumber}`:p.areaLabel;}

export function samplePlace(block:Block,level:'low'|'middle'|'high'):Place{
  const section=block.sections[level==='high'?block.sections.length-1:0];
  const index=level==='low'?(section.tier==='terrace'?1:6):level==='high'?section.rows.length-2:Math.floor(section.rows.length*.6);
  const row=section.rows[index];
  return row.places[Math.floor(row.places.length/2)];
}
