// Explorer quality tiers (Task 6). `high` is the desktop look; `compact` is the phone look: no contact shading,
// no bloom, a smaller shadow map, the 1K texture set and a lower DPR cap. The tier follows the existing compact
// flag (window.innerWidth < 700); ?quality=high|compact overrides it for testing.
export type QualityName='high'|'compact';
export interface Quality { name:QualityName; dpr:number; shadowSize:number; gtao:boolean; bloom:boolean; textures:'desktop'|'phone'; crowdShadows:boolean }
export const QUALITY:Record<QualityName,Quality>={
  high:{name:'high',dpr:1.75,shadowSize:4096,gtao:true,bloom:false,textures:'desktop',crowdShadows:true},
  compact:{name:'compact',dpr:1.4,shadowSize:1024,gtao:false,bloom:false,textures:'phone',crowdShadows:false},
};
export function pickQuality(compact:boolean,search=location.search):Quality{
  const asked=new URLSearchParams(search).get('quality');
  return {...QUALITY[asked==='high'||asked==='compact'?asked:compact?'compact':'high']};
}
// The adaptive guard's steps down from `high`, in order (the hero's idea at explorer scale): contact shading off,
// then a 2048² shadow map, then DPR 1. Each step is applied to a copy of the tier.
export const STEPS:((q:Quality)=>Quality)[]=[q=>({...q,gtao:false}),q=>({...q,shadowSize:Math.min(q.shadowSize,2048)}),q=>({...q,dpr:1})];
