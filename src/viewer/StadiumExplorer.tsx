import { useEffect, useMemo, useRef, useState } from 'react';
import { BLOCK_BY_ID, DEMO, PLACE_BY_ID, describePlace, samplePlace } from '../places/demo';
import { DEFAULT_FILTERS, demoGroup, filterDemoPlaces, matchesDiscovery, unavailableReason } from '../commerce/demo/discovery';
import type { DemoGroup, DiscoveryFilters } from '../commerce/demo/discovery';
import { STANDS, STAND_ORDER } from '../stadium/layout';
import type { Place, StandId, Tier } from '../places/schema';
import type { Command, StadiumEngine, ViewState } from './engine';
import { DEFAULT_ATMOSPHERE } from '../atmosphere/settings';
const INITIAL_VIEW:ViewState={mode:'overview',position:[170,155,195],direction:[-.5,-.5,-.6],fov:43};

function MiniMap({place,view,filteredStand}:{place:Place|null;view:ViewState;filteredStand:StandId|'all'}){
  const preview=view.mode!=='overview';const position=preview?view.position:place?.position;
  const direction=preview?view.direction:place?.direction??view.direction;
  const markedStand=place?.stand??filteredStand;
  const x=position?110+position[0]:110,z=position?130+position[2]:130;
  return <svg className="mini-map" viewBox="0 0 220 260" role="img" aria-label={`Stadium orientation. North is up.${place?` Selected ${STANDS[place.stand].name}.`:filteredStand!=='all'?` Filtered to ${STANDS[filteredStand].name}.`:''}${preview?' Arrow shows viewing direction.':''}`}>
    <rect x="16" y="17" width="188" height="226" rx="32" fill="#293435" stroke="#85918b"/>
    <rect x="26" y="65" width="30" height="130" fill={markedStand==='west'?'#ffd900':'#48554c'}/>
    <rect x="164" y="65" width="30" height="130" fill={markedStand==='east'?'#ffd900':'#48554c'}/>
    <rect x="65" y="25" width="90" height="33" fill={markedStand==='north'?'#ffd900':'#48554c'}/>
    <rect x="65" y="203" width="90" height="33" fill={markedStand==='south'?'#ffd900':'#84741c'}/>
    <rect x="76" y="77.5" width="68" height="105" fill="#34674a" stroke="#b8cab3"/>
    <path d="M76 130H144" stroke="#b8cab3"/><circle cx="110" cy="130" r="9" fill="none" stroke="#b8cab3"/>
    <text x="110" y="13" textAnchor="middle">N</text><text x="110" y="255" textAnchor="middle">S</text><text x="9" y="133" textAnchor="middle">W</text><text x="211" y="133" textAnchor="middle">E</text>
    {position&&<g><line x1={x} y1={z} x2={x+direction[0]*22} y2={z+direction[2]*22} stroke="#6df9e8" strokeWidth="3"/><circle cx={x} cy={z} r="4" fill="#6df9e8" stroke="#102c29"/></g>}
  </svg>;
}
function useMedia(query:string){
  const [matches,setMatches]=useState(()=>window.matchMedia(query).matches);
  useEffect(()=>{const media=window.matchMedia(query);const update=()=>setMatches(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[query]);
  return matches;
}
const CAMERA_BUTTONS:[Command,string,string][]=[['left','←','Turn left'],['right','→','Turn right'],['up','↑','Look up'],['down','↓','Look down'],['in','+','Zoom in'],['out','−','Zoom out'],['reset','↺','Reset stadium']];
export default function StadiumExplorer({stand,onStand,standRequest}:{stand:StandId|null;onStand:(s:StandId)=>void;standRequest:number}){
  const loadFailed=useRef(false);
  const frame=useRef<HTMLDivElement>(null);
  const host=useRef<HTMLDivElement>(null),engine=useRef<StadiumEngine|null>(null),previewButton=useRef<HTMLButtonElement>(null),previousMode=useRef('overview');
  const [ready,setReady]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const [selectedId,setSelectedId]=useState<string|null>(null),[hoverId,setHoverId]=useState<string|null>(null);
  const [view,setView]=useState<ViewState>(INITIAL_VIEW),[cutaway,setCutaway]=useState(true);
  const [atmosphere,setAtmosphere]=useState(DEFAULT_ATMOSPHERE);
  const narrow=useMedia('(max-width: 800px)');
  const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  useEffect(()=>{if(ready)engine.current?.setAtmosphere(atmosphere);},[ready,atmosphere]);
  const [filters,setFilters]=useState<DiscoveryFilters>(DEFAULT_FILTERS);
  // Only editing needs explicit navigation state; review/preview follow selection and camera.
  const [editing,setEditing]=useState<'stand'|'place'|null>('stand');
  const [advanced,setAdvanced]=useState(false);
  const heading=useRef<HTMLHeadingElement>(null),choices=useRef<HTMLDivElement>(null);
  const choiceReturn=useRef<{element:HTMLElement|null;x:number;y:number}|null>(null);
  // A draft for the exact-place form, never a second committed selection.
  const [candidateId,setCandidateId]=useState('DEMO-WEST-04-LOWER-R11-S11');
  const [page,setPage]=useState(0),[notice,setNotice]=useState('');
  const [savedViewpoint,setSavedViewpoint]=useState<{anchor:Place;group:DemoGroup}|null>(null);
  const results=useMemo(()=>filterDemoPlaces(filters),[filters]);
  const resultIds=useMemo(()=>new Set(results.map(p=>p.id)),[results]);
  const candidate=(resultIds.has(candidateId)?PLACE_BY_ID.get(candidateId):results[0])??null;
  const block=candidate?BLOCK_BY_ID.get(candidate.blockId)!:null;
  const sections=block?.sections.filter(s=>s.rows.some(r=>r.places.some(p=>resultIds.has(p.id))))??[];
  const section=candidate?sections.find(s=>s.id===candidate.sectionId)??sections[0]:null;
  const rows=section?.rows.filter(r=>r.places.some(p=>resultIds.has(p.id)))??[];
  const row=candidate?rows.find(r=>r.id===candidate.rowId)??rows[0]:null;
  const places=row?.places.filter(p=>resultIds.has(p.id))??[];
  const blocks=useMemo(()=>DEMO.blocks.filter(b=>b.sections.some(s=>s.rows.some(r=>r.places.some(p=>resultIds.has(p.id))))),[resultIds]);
  const pageSize=8,pageCount=Math.ceil(results.length/pageSize);
  const selected=selectedId?PLACE_BY_ID.get(selectedId)??null:null,hovered=hoverId?PLACE_BY_ID.get(hoverId):null;
  const activePreview=view.mode!=='overview';
  const stage=editing==='stand'?1:editing==='place'?2:selected?(activePreview?4:3):filters.stand==='all'?1:2;
  const stageLabel=['Choose stand','Choose place','Review place','Preview or save'][stage-1];
  const lastStage=useRef(stage);
  const recommendations=useMemo(()=>{
    if(filters.stand==='all')return [];
    const standBlocks=DEMO.blocks.filter(b=>b.stand===filters.stand);
    const representativeBlock=standBlocks[Math.floor(standBlocks.length/2)];
    const pool=results.filter(p=>p.availability==='available');
    const used=new Set<string>();
    return (['low','middle','high'] as const).flatMap(level=>{
      const sample=samplePlace(representativeBlock,level);
      let nearest:Place|undefined,distance=Infinity;
      for(const p of pool){
        if(used.has(p.id))continue;
        const d=Math.hypot(...p.eye.map((v,i)=>v-sample.eye[i]));
        if(d<distance){nearest=p;distance=d;}
      }
      if(!nearest)return [];
      used.add(nearest.id);
      return [{level,place:nearest,label:level==='low'?'Lower view':level==='middle'?'Middle view':'Upper view'}];
    });
  },[results,filters.stand]);
  const callbacks=useRef({select:(id:string)=>{},stand:(s:StandId)=>{},back:()=>{},view:(state:ViewState)=>{}});
  const applySelection=(id:string,focusCamera=false,active=filters)=>{
    const p=PLACE_BY_ID.get(id);if(!p||!matchesDiscovery(p,active))return;
    if(stage===2)choiceReturn.current={element:document.activeElement as HTMLElement,x:window.scrollX,y:window.scrollY};
    setSelectedId(id);setCandidateId(id);setEditing(null);setNotice('');
    if(active.stand==='all')setFilters(current=>({...current,stand:p.stand}));
    if(focusCamera)engine.current?.focusBlock(p.blockId);
    engine.current?.select(id);
  };
  const edit=(target:'stand'|'place')=>{
    setEditing(target);setNotice('');
    engine.current?.select(selectedId); // Return the camera immediately, retaining the place.
  };
  const back=()=>{
    if(stage===4){engine.current?.command('back');return;}
    if(stage===3)edit('place');
    else if(stage===2)edit('stand');
  };
  const commitFilters=(next:DiscoveryFilters)=>{
    setFilters(next);
    if(selected&&!matchesDiscovery(selected,next)){
      setSelectedId(null);setHoverId(null);setEditing('place');engine.current?.select(null);
      setNotice('The selected place no longer matches the filters. Choose another place.');
    }
  };
  const chooseStand=(nextStand:StandId)=>{
    const changed=filters.stand!==nextStand;
    const category=nextStand==='south'?'terrace':nextStand==='north'?'end':'sideline';
    const normalized=changed&&filters.category!=='all'&&filters.category!==category;
    if(changed)commitFilters({...filters,stand:nextStand,tier:'all',category:normalized?'all':filters.category});
    setEditing('place');
    if(changed){setSelectedId(null);setHoverId(null);engine.current?.select(null);}
    const b=DEMO.blocks.filter(b=>b.stand===nextStand);
    engine.current?.focusBlock(b[Math.floor(b.length/2)].id);
    setNotice(normalized?'Category reset to all categories for this stand.':changed&&filters.tier!=='all'?'Tier reset to all tiers for this stand.':'');
  };
  callbacks.current={select:applySelection,stand:chooseStand,back,view:(next)=>{
    setView(next);
  }};
  useEffect(()=>{
    if(previousMode.current!=='overview'&&view.mode==='overview'&&stage===3)previewButton.current?.focus({preventScroll:true});
    previousMode.current=view.mode;
  },[view.mode,stage]);
  useEffect(()=>{
    const previous=lastStage.current;lastStage.current=stage;
    if(previous===stage||stage===4||(previous===4&&stage===3))return;
    const saved=choiceReturn.current;
    if(stage===2&&previous>=3&&saved&&saved.element?.isConnected&&choices.current?.contains(saved.element)){
      saved.element.focus({preventScroll:true});window.scrollTo(saved.x,saved.y);
    }else{
      heading.current?.focus({preventScroll:true});
      // Below the scene, bring the review and its Preview action to the top of the screen.
      if(stage===3&&narrow)heading.current?.scrollIntoView({block:'start',behavior:'instant'});
    }
  },[stage]);
  useEffect(()=>{
    let disposed=false;setReady(false);setError('');
    import('./engine').then(({StadiumEngine})=>{
      if(disposed||!host.current)return;
      try{engine.current=new StadiumEngine(host.current,{onSelect:id=>callbacks.current.select(id),onStand:s=>onStand(s),onHover:setHoverId,onView:v=>callbacks.current.view(v),onError:setError});setReady(true);}
      catch{setError('3D graphics are unavailable. You can still explore every generated place below.');}
    }).catch(()=>{if(disposed)return;loadFailed.current=true;setError('The 3D viewer could not load. Retry reloads the page, or use the place explorer below.');});
    return()=>{disposed=true;engine.current?.dispose();engine.current=null;};
  },[attempt]);
  useEffect(()=>{if(ready){engine.current?.setVisiblePlaces(resultIds);engine.current?.select(selectedId);engine.current?.setCutaway(cutaway);}},[ready]);
  useEffect(()=>{
    engine.current?.setVisiblePlaces(resultIds);
    setPage(0);
    if(!resultIds.has(candidateId))setCandidateId(results[0]?.id??'');
    if(!results.length){setHoverId(null);engine.current?.command('reset');}
  },[resultIds]);
  useEffect(()=>{
    if(stand)callbacks.current.stand(stand);
  },[stand,standRequest]);
  useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.defaultPrevented&&!(e.target as HTMLElement)?.closest('[role="dialog"]'))callbacks.current.back();};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[]);
  useEffect(()=>{if(error){engine.current?.dispose();engine.current=null;setReady(false);setView(INITIAL_VIEW);}},[error]);
  const command=(c:Command)=>{if(c==='back'){back();return;}if(c==='reset'){setEditing('stand');setHoverId(null);}engine.current?.command(c);if(c==='reset')engine.current?.select(selectedId);};
  const focusBlock=(id:string)=>{const first=results.find(p=>p.blockId===id);if(!first)return;setCandidateId(first.id);engine.current?.focusBlock(id);};
  const cameraButtons=(commands:Command[])=>commands.map(c=>{const [,icon,label]=CAMERA_BUTTONS.find(b=>b[0]===c)!;return <button type="button" key={c} onClick={()=>command(c)} aria-label={label} title={label} disabled={!ready||(activePreview&&view.mode!=='preview'&&c!=='reset')}>{icon}</button>;});
  const updateFilters=(patch:Partial<DiscoveryFilters>)=>commitFilters({...filters,...patch});
  const selectedGroup=selected?demoGroup(selected,filters.quantity):null;
  const alternative=selected&&!selectedGroup?results.find(p=>p.id!==selected.id&&p.stand===selected.stand&&demoGroup(p,filters.quantity))??results.find(p=>demoGroup(p,filters.quantity)):null;
  const isSaved=savedViewpoint?.anchor.id===selected?.id;
  // The saved place must always be reachable, so relax only the filters that could hide it.
  const openSavedViewpoint=()=>{
    if(!savedViewpoint)return;
    const {anchor,group}=savedViewpoint,next={...filters,stand:anchor.stand,tier:'all' as const,category:'all' as const,maxPrice:null,quantity:group.people as DiscoveryFilters['quantity']};
    const relaxed=next.stand!==filters.stand||filters.tier!=='all'||filters.category!=='all'||filters.maxPrice!==null||next.quantity!==filters.quantity;
    if(relaxed)setFilters(next);
    applySelection(anchor.id,true,next);
    if(relaxed)setNotice('Filters adjusted to show your saved viewpoint.');
  };
  const removeSavedViewpoint=()=>{setSavedViewpoint(null);setNotice('Saved viewpoint removed.');};
  const toggleSavedViewpoint=()=>{
    if(!selected)return;
    if(isSaved){removeSavedViewpoint();return;}
    if(!selectedGroup){setNotice(unavailableReason(selected,filters.quantity));return;}
    setSavedViewpoint({anchor:selected,group:selectedGroup});setNotice('');
  };
  const flowNavigation=stage>1?<nav className="flow-navigation" aria-label="Place navigation">{stage===4&&<button type="button" onClick={back}>Back to review</button>}<button type="button" onClick={()=>edit('stand')}>Change stand</button></nav>:null;
  return <div className="explorer">
    <div className="atmosphere-controls" role="group" aria-label="Match-day atmosphere">
      <label><input type="checkbox" checked={atmosphere.enabled} onChange={e=>setAtmosphere(a=>({...a,enabled:e.target.checked}))}/>Match-day atmosphere</label>
      <label className="roof-toggle"><input type="checkbox" checked={!activePreview&&cutaway} disabled={activePreview} onChange={e=>{setCutaway(e.target.checked);engine.current?.setCutaway(e.target.checked);}}/>Roof cutaway</label>
      <label><input type="checkbox" checked={atmosphere.clearView} onChange={e=>setAtmosphere(a=>({...a,clearView:e.target.checked}))}/>Clear-view preview</label>
      <button className="atmosphere-pause" type="button" disabled={!atmosphere.enabled||reduced} aria-pressed={atmosphere.paused} onClick={()=>setAtmosphere(a=>({...a,paused:!a.paused}))}>{atmosphere.paused?'Resume atmosphere':'Pause atmosphere'}</button>
      <p>{reduced?'Motion paused by your reduced-motion preference. ':''}Decorative crowd and fictional match. Clear view hides crowd and players, not structures.</p>
    </div>
    <div className="viewer-grid"><div className="scene-column"><div className="scene-sticky">
      <div className="scene-frame" ref={frame} tabIndex={0} role="group" aria-label="Stadium camera. Arrow keys turn; plus and minus zoom; Escape goes back one stage." onKeyDown={e=>{
        if(e.target!==e.currentTarget)return;const keys:Record<string,Command>={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down','+':'in','=':'in','-':'out',Escape:'back'};if(keys[e.key]){e.preventDefault();command(keys[e.key]);}
      }}>
        <div className="scene-host" ref={host}/>
        {!ready&&!error&&<div className="scene-message" role="status">Building the ground…</div>}
        {error&&<div className="scene-message" role="alert"><h3>Explore by place</h3><p>{error}</p><button className="primary-button" onClick={()=>{if(loadFailed.current)window.location.reload();else setAttempt(a=>a+1);}}>Retry 3D ↗</button></div>}
        <div className="orientation"><MiniMap place={selected} view={view} filteredStand={filters.stand}/></div>
        {hovered&&view.mode==='overview'&&<div className="hover-card"><strong>{STANDS[hovered.stand].name} · {describePlace(hovered)}</strong><span>Illustrative viewpoint</span></div>}
        {activePreview&&<button className="back-to-stadium" onClick={()=>command('back')}>← Back to stadium <kbd>Esc</kbd></button>}
      </div>
      <div className="camera-controls" role="group" aria-label={activePreview?'Preview camera controls':'Overview camera controls'}>
        <span className="camera-hint">{activePreview?'Drag to look · scroll to zoom':'Drag to orbit · click a place'}</span>
        <div className="camera-buttons">{narrow?<>{cameraButtons(['in','out','reset'])}<details className="camera-look"><summary>Look around</summary><div className="camera-buttons">{cameraButtons(['left','right','up','down'])}</div></details></>:cameraButtons(['left','right','up','down','in','out','reset'])}</div>
      </div>
      <div className="stand-switcher" aria-label="Focus a stand">{STAND_ORDER.map(s=><button key={s} className={filters.stand===s?'is-active':''} onClick={()=>onStand(s)} aria-pressed={filters.stand===s}>{STANDS[s].name}<span aria-hidden="true">↗</span></button>)}</div>
      <p className="scene-footnote">{results.length.toLocaleString()} matching illustrative places · Nonmatching places are dimmed in the scene · No measured seat data</p>
    </div></div>
    <aside className="place-panel" aria-label="Place explorer" data-stage={stage}>
      <h3 ref={heading} tabIndex={-1}>{stage===1?'Choose a stand':stage===2?filters.stand==='all'?'Choose a place.':STANDS[filters.stand].name:selected?STANDS[selected.stand].name:'Explore a stadium view.'}</h3>
      {stage!==3&&<p className="place-lead">{stage===1?'Use the stand buttons or choose a stand in the scene to begin.':stage===2?'Choose a representative view, or explore an exact illustrative place.':'Explore the view. Use Back to return to your place review.'}</p>}
      {stage===2&&flowNavigation}
      <div ref={choices} hidden={stage!==2}>
      {recommendations.length>0?<div className="representative-views" role="group" aria-label="Representative viewpoints">{recommendations.map(({level,place,label})=><button key={level} type="button" aria-pressed={selectedId===place.id} onClick={()=>applySelection(place.id,true)}><strong>{label}</strong><span>{place.tier==='terrace'?'Standing terrace':`${place.tier} tier`} · {describePlace(place)}</span></button>)}</div>:<p className="place-lead">{filters.stand==='all'?'Choose a stand for representative views, or use the exact-place controls.':'No representative views match your filters. Adjust or reset them in Choose an exact place.'}</p>}
      <details className="advanced-places" open={advanced} onToggle={e=>setAdvanced(e.currentTarget.open)}>
      <summary>Choose an exact place</summary>
      <p className="panel-disclosure">Optional demo data: generated places, fictional EUR prices and availability. No live inventory or ticket purchase.</p>
      <div className="discovery-filters" aria-label="Filter illustrative places">
        <label>Stand<select aria-label="Stand" value={filters.stand} onChange={e=>{if(e.target.value==='all')updateFilters({stand:'all',tier:'all'});else onStand(e.target.value as StandId);}}><option value="all">All stands</option>{STAND_ORDER.map(s=><option key={s} value={s}>{STANDS[s].name}</option>)}</select></label>
        <label>Tier<select aria-label="Tier" value={filters.tier} onChange={e=>updateFilters({tier:e.target.value as Tier|'all'})}><option value="all">All tiers</option><option value="lower" disabled={filters.stand==='south'}>Lower</option><option value="upper" disabled={filters.stand==='south'}>Upper</option><option value="terrace" disabled={filters.stand!=='all'&&filters.stand!=='south'}>Standing terrace</option></select></label>
        <label>Category<select aria-label="Category" value={filters.category} onChange={e=>updateFilters({category:e.target.value as DiscoveryFilters['category']})}><option value="all">All categories</option><option value="terrace">Terrace</option><option value="end">End stand</option><option value="sideline">Sideline</option></select></label>
        <label>People<select aria-label="People" value={filters.quantity} onChange={e=>updateFilters({quantity:Number(e.target.value) as DiscoveryFilters['quantity']})}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} {n===1?'person':'people'}</option>)}</select></label>
        <label>Max demo price / person<select aria-label="Max demo price / person" value={filters.maxPrice??'all'} onChange={e=>updateFilters({maxPrice:e.target.value==='all'?null:Number(e.target.value)})}><option value="all">Any price</option>{[20,36,48,62].map(price=><option key={price} value={price}>€{price}</option>)}</select></label>
        <button type="button" className="filter-reset" onClick={()=>{commitFilters({...DEFAULT_FILTERS,stand:filters.stand});setNotice(selected?'Filters cleared. Current place retained.':'Filters cleared.');}}>Clear filters</button>
      </div>
      <div className="availability-legend" role="group" aria-label="Demo availability legend"><span><i className="legend-available"/>Available</span><span><i className="legend-unavailable"/>Unavailable</span><span><i className="legend-selected"/>Selected</span></div>
      <div className="result-heading"><strong>{results.length.toLocaleString()} matching {results.length===1?'place':'places'}</strong><span>Generated demo data</span></div>
      {results.length===0?<div className="results-empty"><strong>No places match these filters.</strong><p>Try another stand, category, quantity, or price.</p><button type="button" className="secondary-button" onClick={()=>commitFilters({...DEFAULT_FILTERS,stand:filters.stand})}>Reset filters <span>↗</span></button></div>:<>
        <div className="result-list" role="group" aria-label="Matching illustrative places">{results.slice(page*pageSize,(page+1)*pageSize).map(p=><button type="button" key={p.id} className={`result-item ${selectedId===p.id?'is-selected':''}`} aria-pressed={selectedId===p.id} onClick={()=>applySelection(p.id,true)}><span><strong>{STANDS[p.stand].name} · {describePlace(p)}</strong><small>{p.tier} · {p.kind==='seat'?'seated':'standing area'} · €{p.demoPrice}/person</small></span><em>{selectedId===p.id?'Selected':p.availability==='available'?'Available':'Unavailable'}</em></button>)}</div>
        {pageCount>1&&<div className="result-pages"><button type="button" disabled={page===0} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page+1} of {pageCount.toLocaleString()}</span><button type="button" disabled={page>=pageCount-1} onClick={()=>setPage(n=>n+1)}>Next</button></div>}
        {candidate&&block&&section&&row&&<><div className="browse-label">Advanced place controls</div><div className="place-fields">
          <label>Demo block<select value={block.id} onChange={e=>focusBlock(e.target.value)}>{blocks.map(b=><option value={b.id} key={b.id}>{b.label}</option>)}</select></label>
          <label>Tier in block<select value={section.id} onChange={e=>{const next=results.find(p=>p.sectionId===e.target.value);if(next)setCandidateId(next.id);}}>{sections.map(s=><option key={s.id} value={s.id}>{s.tier==='terrace'?'Standing terrace':s.tier==='upper'?'Upper tier':'Lower tier'}</option>)}</select></label>
          <div className="row-place-fields"><label>{block.stand==='south'?'Terrace band':'Row'}<select value={row.id} onChange={e=>{const next=results.find(p=>p.rowId===e.target.value);if(next)setCandidateId(next.id);}}>{rows.map(r=><option key={r.id} value={r.id}>{block.stand==='south'?`Sample band ${r.number}`:`Row ${r.number}`}</option>)}</select></label>
          <label>{block.stand==='south'?'Sample position':'Seat'}<select value={candidate.id} onChange={e=>setCandidateId(e.target.value)}>{places.map(p=><option key={p.id} value={p.id}>{p.kind==='seat'?`Seat ${p.seatNumber}`:'Area centre'}{p.availability==='unavailable'?' · unavailable':''}</option>)}</select></label></div>
        </div><button className="secondary-button" onClick={()=>applySelection(candidate.id,true)}>Select this {candidate.kind==='seat'?'place':'area'} <span>↗</span></button></>}
      </>}
      </details>
      </div>
      {selected&&stage>=3?<div className="selected-details">
        <div className="selected-title"><span className="selection-dot"/><h4>{describePlace(selected)}</h4></div>
        <p className="place-id">{selected.id}</p>
        <p className="review-summary">{BLOCK_BY_ID.get(selected.blockId)?.label} · {selected.kind==='seat'?'Illustrative seat':'Standing area · unassigned'} <span lang="de">({STANDS[selected.stand].localName})</span></p>
        <div className="review-actions">
          {stage===4
            ?isSaved
              ?<button type="button" className="secondary-button" onClick={removeSavedViewpoint}>Remove saved viewpoint</button>
              :<button type="button" className="primary-button" onClick={toggleSavedViewpoint} disabled={!selectedGroup}>Save viewpoint <span aria-hidden="true">+</span></button>
            :<button ref={previewButton} className="primary-button" disabled={!ready} onClick={()=>{engine.current?.preview();frame.current?.scrollIntoView({block:'center',behavior:'instant'});frame.current?.focus({preventScroll:true});}}>Preview this view <span aria-hidden="true">↗</span></button>}
          <button type="button" className="secondary-button" onClick={()=>edit('place')}>Change place <span aria-hidden="true">↗</span></button>
        </div>
        <p className="sightline-note">Sightline not verified. The model may omit roof supports, rails, barriers, and terrace steps that affect a real view.{selected.kind==='standing-area'?' This is a sample position in an area, with no assigned spot or adjacency promise.':''}</p>
        <details className="review-more"><summary>More about this place</summary>
          <dl><div><dt>Tier / category</dt><dd>{selected.tier} / {selected.priceCategory}</dd></div>{advanced&&<><div><dt>Demo availability</dt><dd>{selected.availability}</dd></div><div><dt>Demo price</dt><dd>€{selected.demoPrice} / person</dd></div><div><dt>People requested</dt><dd>{filters.quantity}</dd></div></>}</dl>
          <p className="benefit-note"><strong>Illustrative features:</strong> {selected.benefits.join(' · ')}</p>
        </details>
        {!selectedGroup&&<div className="unavailable-note" role="status"><p>{unavailableReason(selected,filters.quantity)}</p>{alternative&&<button type="button" className="secondary-button" onClick={()=>applySelection(alternative.id,true)}>Show available alternative <span>↗</span></button>}</div>}
      </div>:null}
      {stage>=3&&flowNavigation}
      {savedViewpoint&&<section className="saved-viewpoint-confirmation" aria-label="Saved viewpoint"><strong>{isSaved?'Viewpoint saved':'Saved viewpoint'}</strong><p>{savedViewpoint.group.people} {savedViewpoint.group.people===1?'person':'people'} · {STANDS[savedViewpoint.anchor.stand].name} · {describePlace(savedViewpoint.anchor)}</p><p>{savedViewpoint.group.kind==='standing-area'?'A standing-area sample describes a region; no personal spot is assigned.':'This shows the viewing location in the model.'}</p>{!(isSaved&&stage===4)&&<div className="saved-viewpoint-actions">{!isSaved&&<button type="button" className="secondary-button" onClick={openSavedViewpoint}>View saved viewpoint <span aria-hidden="true">↗</span></button>}<button type="button" className="secondary-button" onClick={removeSavedViewpoint}>Remove saved viewpoint</button></div>}</section>}
      {notice&&<p className="discovery-notice" role="status">{notice}</p>}
    </aside></div>
    <p className="sr-only" role="status" aria-live="polite">Step {stage} of 4. {stageLabel}. {selected?`${STANDS[selected.stand].name}, ${describePlace(selected)}. ${selected.availability} in demo.`:'No place selected.'} {savedViewpoint?'Viewpoint saved. ':''}{stage===2&&results.length===0?'No places match these filters. ':''}{view.mode==='preview'?'Preview open. Escape returns to review.':view.mode==='overview'?'Stadium overview.':'Camera moving.'}</p>
  </div>;
}
