import type { StandId } from '../places/schema';
import { BOWL } from '../hero/framing';
import { STANDS, tiers, type TierLayout } from './layout';
import { arc, straight, sweep, type Mesher, type P2 } from './sweep';

// Solid stands: one closed cross-section per stand (d measured from the pitch centre line, as in layout.ts),
// extruded along the straight stands and swept around the corners. Tread tops sit exactly at rowFloor.
// Two-tier profile, front to back: lower rows on a solid base, the concourse floor at the lower tier's last row,
// set-back glazing, then the upper tier with a front lip and a sloped soffit over the concourse.
export const LIP={front:-3.8,top:-.3,bottom:-.9}; // relative to the upper tier's offset and floor
export const GLAZE=6;                            // concourse glazing, metres behind the upper tier's offset
export const TUNNEL={depth:4,ceiling:.45};       // front-row vomitory tunnel into the lower mass
const STEPS=18;                                  // stair from the concourse up through an upper vomitory
const SOFFIT_BACK=1.2;                           // soffit depth under the upper tier's last row
const rows=(t:TierLayout)=>Array.from({length:t.rows},(_,r)=>({d:t.offset+r*t.depth,f:t.floor+r*t.rise}));
export const soffitAt=(upper:TierLayout,d:number)=>{
  const r=rows(upper),h=upper.depth/2,f0=upper.floor+LIP.bottom,d0=r[0].d-h,d1=r[r.length-1].d+h;
  return f0+(d-d0)*(r[r.length-1].f-SOFFIT_BACK-f0)/(d1-d0);
};
// Treads and risers from the back row down to row `stop` (inclusive), back to front, cut off at d = clip.
function steps(t:TierLayout,stop:number,out:P2[],front:string,clip=-Infinity){
  const r=rows(t),h=t.depth/2;let s=stop;while(r[s].d+h<=clip)s++;
  for(let i=r.length-1;i>=s;i--){out.push({d:r[i].d+h,y:r[i].f,m:'tread'});out.push({d:Math.max(r[i].d-h,clip),y:r[i].f,m:i>s||stop>0?'riser':front});}
}
// Front rows (0–4) with a vomitory cut through them: a flat floor at row 0 and a dark tunnel under row 5.
function tunnel(t:TierLayout,out:P2[]){
  const r=rows(t),h=t.depth/2,back=r[5].d-h,ceiling=r[5].f-TUNNEL.ceiling;
  out[out.length-1].m='concrete';
  out.push({d:back,y:ceiling,m:'dark'},{d:back+TUNNEL.depth,y:ceiling,m:'dark'},{d:back+TUNNEL.depth,y:r[0].f,m:'dark'},{d:back,y:r[0].f,m:'floor'},{d:r[0].d-h,y:r[0].f,m:'concrete'});
}
// The upper vomitory's stair, from the concourse at the back up to the lip at the front.
function stair(lower:TierLayout,upper:TierLayout):P2[]{
  const ur=rows(upper),uh=upper.depth/2,back=ur[5].d-uh,uf=ur[0].d-uh,concourse=rows(lower)[lower.rows-1].f,top=upper.floor+LIP.top;
  const run=(back-uf)/STEPS,rise=(top-concourse)/STEPS,out:P2[]=[];
  for(let k=0;k<STEPS;k++)out.push({d:back-k*run,y:concourse+k*rise,m:'riser'},{d:back-k*run,y:concourse+(k+1)*rise,m:'tread'});
  return out;
}
// base offsets every coordinate (a stand's inner line, or a corner's radius origin); wall is the back face.
// clip trims the front rows of the lower tier back to d = clip (the E/W stand ends, see buildStands).
export function profile(stand:StandId|'corner',notch:boolean,wall:number,base=0,clip=-Infinity):P2[]{
  const ts=tiers(stand==='corner'?'north':stand),lower=ts[0],upper=ts[1],out:P2[]=[];
  const lr=rows(lower),h=lower.depth/2;
  out.push({d:Math.max(lr[0].d-h,clip),y:-.2,m:''},{d:wall,y:-.2,m:''});
  if(!upper){
    out.push({d:wall,y:lr[lr.length-1].f,m:'floor'});
    if(notch){steps(lower,5,out,'riser');tunnel(lower,out);}else steps(lower,0,out,'concrete',clip);
  }else{
    const ur=rows(upper),uh=upper.depth/2,uf=ur[0].d-uh,lip=upper.offset+LIP.front,top=upper.floor+LIP.top,bottom=upper.floor+LIP.bottom;
    const glaze=upper.offset+GLAZE,concourse=lr[lr.length-1].f;
    out.push({d:wall,y:ur[ur.length-1].f,m:'floor'});
    if(!notch){
      steps(upper,0,out,'concrete');
      out.push({d:uf,y:top,m:'concrete'},{d:lip,y:top,m:'concrete'},{d:lip,y:bottom,m:'soffit'},{d:uf,y:bottom,m:'soffit'},{d:glaze,y:soffitAt(upper,glaze),m:'glass'},{d:glaze,y:concourse,m:'floor'});
    }else{
      // Upper vomitory: rows 0–4 open onto a stair that climbs from the concourse to the lip.
      steps(upper,5,out,'riser');const back=ur[5].d-uh;out[out.length-1].m='concrete';
      out.push({d:back,y:soffitAt(upper,back),m:'soffit'},{d:glaze,y:soffitAt(upper,glaze),m:'glass'},{d:glaze,y:concourse,m:'floor'});
      out.push(...stair(lower,upper));
      out.push({d:uf,y:top,m:'concrete'},{d:lip,y:top,m:'concrete'},{d:lip,y:bottom,m:'soffit'},{d:uf,y:bottom,m:'concrete'},{d:uf,y:concourse,m:'floor'});
    }
    if(notch){steps(lower,5,out,'riser');tunnel(lower,out);}else steps(lower,0,out,'concrete',clip);
  }
  return out.map(p=>({...p,d:p.d+base}));
}
// Back face of the stand solids, 5 cm inside the outer wall's inner face so no faces coincide.
export const wallDepth=(stand:StandId)=>STANDS[stand].out[0]?BOWL.cornerX+BOWL.wallRadius-STANDS[stand].inner-.5:BOWL.cornerZ+BOWL.wallRadius-STANDS[stand].inner-.5;
// End of the straight stand solids: the E/W stands meet the corner arcs at ±cornerZ; N/S stop at ±cornerX,
// where the corner sweep begins (their places end by ±43.4 m).
export const standHalf=(stand:StandId)=>STANDS[stand].out[0]?BOWL.cornerZ:BOWL.cornerX;
export const CORNER_BASE=3; // corner rows sit at radius 3 + offset + row·depth around (±cornerX, ±cornerZ)
export const CORNER_SEGMENTS=16;

export function buildStands(mesh:Mesher,code:(stand:StandId|null)=>number,material:(stand:StandId|null,m:string)=>string){
  const map=(ps:P2[],stand:StandId|null)=>ps.map(p=>({...p,m:p.m&&material(stand,p.m)}));
  for(const stand of Object.keys(STANDS) as StandId[]){
    const cfg=STANDS[stand],half=standHalf(stand),bw=cfg.length/cfg.blocks,wall=wallDepth(stand);mesh.tag=code(stand);
    const full=map(profile(stand,false,wall,cfg.inner),stand),cut=map(profile(stand,true,wall,cfg.inner),stand);
    // Alternate full and vomitory segments along the stand: the notches (odd spans) are inTunnel's 2.7 m at each block centre.
    const edges=[-half,...Array.from({length:cfg.blocks},(_,b)=>-cfg.length/2+bw*(b+.5)).flatMap(c=>[c-1.35,c+1.35]),half];
    // The E/W stands run 2 m past the N/S front rows. Beyond the N/S row 0, their front rows are trimmed back to
    // x = ±cornerX, so the N/S stand keeps its own treads (and places) in the pitch corners.
    const end=cfg.out[0]?STANDS.north.inner+tiers('north')[0].depth/2:half;
    const trimmed=end<half?map(profile(stand,false,wall,cfg.inner,BOWL.cornerX-cfg.inner),stand):full;
    if(end<half){edges[0]=-end;edges[edges.length-1]=end;for(const [u0,u1] of [[-half,-end],[end,half]])sweep(mesh,trimmed,straight(cfg.out,cfg.tangent,u0,u1));}
    // A vomitory segment lies inside its neighbours' profiles except for the stair block in the concourse, so
    // only that block is capped; the neighbours' caps form the notch and tunnel side walls.
    const ts=tiers(stand),uf=ts[1]?rows(ts[1])[0].d-ts[1].depth/2:0;
    const block=ts[1]?[...stair(ts[0],ts[1]),{d:uf,y:ts[1].floor+LIP.top,m:''},{d:uf,y:rows(ts[0])[ts[0].rows-1].f,m:''}].map(p=>({...p,d:p.d+cfg.inner})):null;
    for(let i=0;i<edges.length-1;i++){
      const path=straight(cfg.out,cfg.tangent,edges[i],edges[i+1]);
      if(i%2){sweep(mesh,cut,path,{cap:null});if(block)sweep(mesh,block,path,{sides:false});}else sweep(mesh,full,path);
    }
  }
  mesh.tag=code(null);
  // The corner's back sits 10 cm inside the wall core, so its 16-segment chords never open a slit against the wall's 24.
  const corner=map(profile('corner',false,BOWL.wallRadius-.45-CORNER_BASE,CORNER_BASE),null);
  for(const sx of [-1,1])for(const sz of [-1,1])sweep(mesh,corner,arc(sx*BOWL.cornerX,sz*BOWL.cornerZ,sx,sz,CORNER_SEGMENTS));
  // Corners carry no places, but seat rows (the hero's recipe: 5-row colour bands, three blocks with
  // 1.3 m aisles) keep the bowl continuous: a seat-and-back block at the back of each tread. Decorative only,
  // outside the place dataset.
  for(const t of tiers('north'))rows(t).forEach(({d,f},r)=>{
    const rho=CORNER_BASE+d,m=Math.floor(r/5)%2?'cornerSeatB':'cornerSeatA',gap=.65/rho;
    const ribbon:P2[]=[{d:rho-.15,y:f-.01,m:''},{d:rho+.35,y:f-.01,m:''},{d:rho+.35,y:f+.42,m},{d:rho-.15,y:f+.42,m}];
    for(const sx of [-1,1])for(const sz of [-1,1])for(let b=0;b<3;b++)
      sweep(mesh,ribbon,arc(sx*BOWL.cornerX,sz*BOWL.cornerZ,sx,sz,b===1?6:5,b*Math.PI/6+(b?gap:0),(b+1)*Math.PI/6-(b<2?gap:0)),{cap:m});
  });
}
