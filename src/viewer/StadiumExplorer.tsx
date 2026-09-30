import { useEffect, useMemo, useRef, useState } from 'react';
import { BLOCK_BY_ID, DEMO, PLACE_BY_ID, describePlace } from '../places/demo';
import { DEFAULT_FILTERS, demoGroup, filterDemoPlaces, matchesDiscovery, unavailableReason } from '../commerce/demo/discovery';
import type { DemoGroup, DiscoveryFilters } from '../commerce/demo/discovery';
import { STANDS, STAND_ORDER } from '../stadium/layout';
import type { Place, StandId } from '../places/schema';
import type { Command, StadiumEngine, ViewState } from './engine';
import { DEFAULT_ATMOSPHERE } from '../atmosphere/settings';
const INITIAL_VIEW:ViewState={mode:'overview',position:[170,155,195],direction:[-.5,-.5,-.6],fov:43};

const MAP_STANDS:Record<StandId,{x:number;y:number;width:number;height:number;labelX:number;labelY:number}>={
  west:{x:26,y:65,width:30,height:130,labelX:9,labelY:133},
  east:{x:164,y:65,width:30,height:130,labelX:211,labelY:133},
  north:{x:65,y:25,width:90,height:33,labelX:110,labelY:13},
  south:{x:65,y:203,width:90,height:33,labelX:110,labelY:255},
};

function StadiumPlan({markedStand,position,direction,ariaLabel,className=''}:{markedStand:StandId|'all';position?:Place['position'];direction?:Place['direction'];ariaLabel?:string;className?:string}){
  const x=position?110+position[0]:110,z=position?130+position[2]:130;
  return <svg className={`mini-map ${className}`.trim()} viewBox="0 0 220 260" role={ariaLabel?'img':undefined} aria-label={ariaLabel} aria-hidden={ariaLabel?undefined:true}>
    <rect className="stadium-plan__shell" x="16" y="17" width="188" height="226" rx="32"/>
    {STAND_ORDER.map(stand=>{const shape=MAP_STANDS[stand];return <rect key={stand} className={`stadium-plan__stand ${markedStand===stand?'is-highlighted':''}`} x={shape.x} y={shape.y} width={shape.width} height={shape.height}/>;})}
    <rect className="stadium-plan__pitch" x="76" y="77.5" width="68" height="105"/>
    <path className="stadium-plan__pitch-line" d="M76 130H144"/><circle className="stadium-plan__pitch-line" cx="110" cy="130" r="9"/>
    {STAND_ORDER.map(stand=>{const shape=MAP_STANDS[stand];return <text key={stand} className="stadium-plan__direction" x={shape.labelX} y={shape.labelY} textAnchor="middle">{STANDS[stand].name.charAt(0)}</text>;})}
    {position&&direction&&<g className="stadium-plan__viewpoint"><line x1={x} y1={z} x2={x+direction[0]*22} y2={z+direction[2]*22}/><circle cx={x} cy={z} r="4"/></g>}
  </svg>;
}

function MiniMap({place,view,filteredStand}:{place:Place|null;view:ViewState;filteredStand:StandId|'all'}){
  const preview=view.mode!=='overview';const position=preview?view.position:place?.position;
  const direction=preview?view.direction:place?.direction??view.direction;
  const markedStand=place?.stand??filteredStand;
  const ariaLabel=`Stadium orientation. North is up.${place?` Selected ${STANDS[place.stand].name}.`:filteredStand!=='all'?` Filtered to ${STANDS[filteredStand].name}.`:''}${preview?' Arrow shows viewing direction.':''}`;
  return <StadiumPlan markedStand={markedStand} position={position} direction={direction} ariaLabel={ariaLabel}/>;
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
  const heading=useRef<HTMLHeadingElement>(null),choices=useRef<HTMLDivElement>(null);
  const choiceReturn=useRef<{element:HTMLElement|null;x:number;y:number}|null>(null);
  const [notice,setNotice]=useState('');
  const [savedViewpoint,setSavedViewpoint]=useState<{anchor:Place;group:DemoGroup}|null>(null);
  useEffect(()=>{
    if(notice!=='Saved viewpoint removed.')return;
    const timeout=window.setTimeout(()=>setNotice(current=>current==='Saved viewpoint removed.'?'':current),5000);
    return()=>window.clearTimeout(timeout);
  },[notice]);
  const results=useMemo(()=>filterDemoPlaces(filters),[filters]);
  const resultIds=useMemo(()=>new Set(results.map(p=>p.id)),[results]);
  const selected=selectedId?PLACE_BY_ID.get(selectedId)??null:null,hovered=hoverId?PLACE_BY_ID.get(hoverId):null;
  const activePreview=view.mode!=='overview';
  const stage=editing==='stand'?1:editing==='place'?2:selected?(activePreview?4:3):filters.stand==='all'?1:2;
  const stageLabel=['Choose stand','Choose place','Review place','Preview or save'][stage-1];
  const lastStage=useRef(stage);
  const callbacks=useRef({select:(id:string)=>{},stand:(s:StandId)=>{},back:()=>{},view:(state:ViewState)=>{}});
  const applySelection=(id:string,focusCamera=false,active=filters)=>{
    const p=PLACE_BY_ID.get(id);if(!p||!matchesDiscovery(p,active))return;
    if(stage===2)choiceReturn.current={element:document.activeElement as HTMLElement,x:window.scrollX,y:window.scrollY};
    setSelectedId(id);setEditing(null);setNotice('');
    if(active.stand==='all')setFilters(current=>({...current,stand:p.stand}));
    if(focusCamera)engine.current?.focusBlock(p.blockId);
    engine.current?.select(id);
  };
  const previewFromScene=(id:string)=>{
    const p=PLACE_BY_ID.get(id);if(!p)return;
    const next:DiscoveryFilters={
      ...filters,
      stand:p.stand,
      tier:filters.tier==='all'||filters.tier===p.tier?filters.tier:'all',
      category:filters.category==='all'||filters.category===p.priceCategory?filters.category:'all',
      maxPrice:filters.maxPrice===null||p.demoPrice<=filters.maxPrice?filters.maxPrice:null,
      quantity:demoGroup(p,filters.quantity)?filters.quantity:1,
    };
    const filtersChanged=Object.entries(next).some(([key,value])=>filters[key as keyof DiscoveryFilters]!==value);
    if(filtersChanged)setFilters(next);
    setSelectedId(id);setEditing(null);
    setNotice('');
    engine.current?.select(id);
    engine.current?.preview();
    frame.current?.scrollIntoView({block:'center',behavior:'instant'});
    frame.current?.focus({preventScroll:true});
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
  callbacks.current={select:previewFromScene,stand:chooseStand,back,view:(next)=>{
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
  useEffect(()=>{if(ready){engine.current?.setVisiblePlaces(resultIds);engine.current?.select(selectedId);engine.current?.setCutaway(cutaway);if(import.meta.env.DEV)engine.current?.applyDevPose();}},[ready]);
  useEffect(()=>{
    engine.current?.setVisiblePlaces(resultIds);
    if(!results.length){setHoverId(null);engine.current?.command('reset');}
  },[resultIds]);
  useEffect(()=>{
    if(stand)callbacks.current.stand(stand);
  },[stand,standRequest]);
  useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.defaultPrevented&&!(e.target as HTMLElement)?.closest('[role="dialog"]'))callbacks.current.back();};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[]);
  useEffect(()=>{if(error){engine.current?.dispose();engine.current=null;setReady(false);setView(INITIAL_VIEW);}},[error]);
  const command=(c:Command)=>{if(c==='back'){back();return;}if(c==='reset'){setEditing('stand');setHoverId(null);}engine.current?.command(c);if(c==='reset')engine.current?.select(selectedId);};
  const cameraButtons=(commands:Command[])=>commands.map(c=>{const [,icon,label]=CAMERA_BUTTONS.find(b=>b[0]===c)!;return <button type="button" key={c} onClick={()=>command(c)} aria-label={label} title={label} disabled={!ready||(activePreview&&view.mode!=='preview'&&c!=='reset')}>{icon}</button>;});
  const selectedGroup=selected?demoGroup(selected,filters.quantity):null;
  const alternative=selected&&!selectedGroup?results.find(p=>p.id!==selected.id&&p.stand===selected.stand&&demoGroup(p,filters.quantity))??results.find(p=>demoGroup(p,filters.quantity)):null;
  const isSaved=savedViewpoint?.anchor.id===selected?.id;
  // The saved place must always be reachable, so relax only the filters that could hide it.
  const openSavedViewpoint=()=>{
    if(!savedViewpoint)return;
    const {anchor,group}=savedViewpoint,next={...filters,stand:anchor.stand,tier:'all' as const,category:'all' as const,maxPrice:null,quantity:group.people as DiscoveryFilters['quantity']};
    const relaxed=next.stand!==filters.stand||filters.tier!=='all'||filters.category!=='all'||filters.maxPrice!==null||next.quantity!==filters.quantity;
    if(relaxed)setFilters(next);
    setSelectedId(anchor.id);setEditing(null);setNotice('');
    engine.current?.select(anchor.id);
    engine.current?.preview();
    frame.current?.scrollIntoView({block:'center',behavior:'instant'});
    frame.current?.focus({preventScroll:true});
  };
  const removeSavedViewpoint=()=>{setSavedViewpoint(null);setNotice('Saved viewpoint removed.');};
  const toggleSavedViewpoint=()=>{
    if(!selected)return;
    if(isSaved){removeSavedViewpoint();return;}
    if(!selectedGroup){setNotice(unavailableReason(selected,filters.quantity));return;}
    setSavedViewpoint({anchor:selected,group:selectedGroup});setNotice('');
  };
  const flowNavigation=stage>1?<nav className="flow-navigation" aria-label="Place navigation">{stage===4&&<button type="button" onClick={back}>Back to stadium view</button>}<button type="button" onClick={()=>edit('stand')}>Change stand</button></nav>:null;
  return <div className="explorer">
    <div className="atmosphere-controls" role="group" aria-label="Match-day atmosphere">
      <label><input type="checkbox" checked={atmosphere.enabled} onChange={e=>setAtmosphere(a=>({...a,enabled:e.target.checked}))}/>Match-day atmosphere</label>
      <label className="roof-toggle"><input type="checkbox" checked={!activePreview&&cutaway} disabled={activePreview} onChange={e=>{setCutaway(e.target.checked);engine.current?.setCutaway(e.target.checked);}}/>Roof cutaway</label>
      <button className="atmosphere-pause" type="button" disabled={!atmosphere.enabled||reduced} aria-pressed={atmosphere.paused} onClick={()=>setAtmosphere(a=>({...a,paused:!a.paused}))}>{atmosphere.paused?'Resume atmosphere':'Pause atmosphere'}</button>
      <p>{reduced?'Motion paused by your reduced-motion preference. ':''}Decorative crowd and fictional match. Match-day atmosphere hides the crowd and players, not structures.</p>
    </div>
    <div className="viewer-grid"><div className="scene-column"><div className="scene-sticky">
      <div className="scene-frame" ref={frame} tabIndex={0} role="group" aria-label="Stadium camera. Arrow keys turn; plus and minus zoom; Escape goes back one stage." onKeyDown={e=>{
        if(e.target!==e.currentTarget)return;const keys:Record<string,Command>={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down','+':'in','=':'in','-':'out',Escape:'back'};if(keys[e.key]){e.preventDefault();command(keys[e.key]);}
      }}>
        <div className="scene-host" ref={host}/>
        {!ready&&!error&&<div className="scene-message" role="status">Building the ground…</div>}
        {error&&<div className="scene-message" role="alert"><h3>Explore by place</h3><p>{error}</p><button className="primary-button" onClick={()=>{if(loadFailed.current)window.location.reload();else setAttempt(a=>a+1);}}>Retry 3D ↗</button></div>}
        <div className="orientation"><MiniMap place={selected} view={view} filteredStand={filters.stand}/></div>
        {hovered&&view.mode==='overview'&&<div className="hover-card" aria-hidden="true"><strong>{STANDS[hovered.stand].name}</strong><span className="hover-card__place">{describePlace(hovered)}</span><span className="hover-card__action">Click to preview view <b>↗</b></span></div>}
        {activePreview&&<button className="back-to-stadium" onClick={()=>command('back')}>← Back to stadium <kbd>Esc</kbd></button>}
      </div>
      <div className="camera-controls" role="group" aria-label={activePreview?'Preview camera controls':'Overview camera controls'}>
        <span className="camera-hint">{activePreview?'Drag to look · scroll to zoom':'Drag to orbit · click a place'}</span>
        <div className="camera-buttons">{narrow?<>{cameraButtons(['in','out','reset'])}<details className="camera-look"><summary>Look around</summary><div className="camera-buttons">{cameraButtons(['left','right','up','down'])}</div></details></>:cameraButtons(['left','right','up','down','in','out','reset'])}</div>
      </div>
      <p className="scene-footnote">{results.length.toLocaleString()} matching illustrative places · Nonmatching places are dimmed in the scene · No measured seat data</p>
    </div></div>
    <aside className="place-panel" aria-label="Place explorer" data-stage={stage}>
      <h3 ref={heading} tabIndex={-1}>{stage===1?'Choose a stand':stage===2?filters.stand==='all'?'Choose a place.':STANDS[filters.stand].name:selected?STANDS[selected.stand].name:'Explore a stadium view.'}</h3>
      {stage!==3&&<p className="place-lead">{stage===1?'Use the stand buttons or choose a stand in the scene to begin.':stage===2?'Use the 3D viewer to zoom in, explore the stand, and choose an exact seat or standing area.':'Explore the view. Use Back to return to the stadium view.'}</p>}
      <div className="stand-selector" role="group" aria-label="Choose a stand" hidden={stage!==1}>{STAND_ORDER.map(s=><button type="button" key={s} onClick={()=>onStand(s)} aria-pressed={filters.stand===s}><StadiumPlan markedStand={s} className="stand-card-map"/><span>{STANDS[s].name}</span></button>)}</div>
      {stage===2&&flowNavigation}
      <div ref={choices} hidden={stage!==2}>
        <div className="scene-selection-guide"><strong>Choose in the 3D viewer</strong><span>Drag to orbit, zoom toward the highlighted stand, then click a seat or standing-area marker.</span></div>
      </div>
      {selected&&stage>=3?<div className="selected-details">
        <div className="selected-title"><h4>{describePlace(selected)}</h4></div>
        <p className="place-id">{selected.id}</p>
        <p className="review-summary">{BLOCK_BY_ID.get(selected.blockId)?.label} · {selected.kind==='seat'?'Illustrative seat':'Standing area · unassigned'} <span lang="de">({STANDS[selected.stand].localName})</span></p>
        <div className="ticket-context" aria-label="Ticket details">
          <label><span>People</span><select aria-label="People" value={filters.quantity} onChange={e=>setFilters(current=>({...current,quantity:Number(e.target.value) as DiscoveryFilters['quantity']}))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          <div><span>Price per ticket</span><strong>€{selected.demoPrice}</strong></div>
          {filters.quantity>1&&<div><span>Illustrative total</span><strong>€{selected.demoPrice*filters.quantity}</strong></div>}
        </div>
        <div className="review-actions">
          {stage===4
            ?isSaved
              ?null
              :<button type="button" className="primary-button" onClick={toggleSavedViewpoint} disabled={!selectedGroup}>Save viewpoint <span aria-hidden="true">+</span></button>
            :<button ref={previewButton} className="primary-button" disabled={!ready} onClick={()=>{engine.current?.preview();frame.current?.scrollIntoView({block:'center',behavior:'instant'});frame.current?.focus({preventScroll:true});}}>Preview this view <span aria-hidden="true">↗</span></button>}
          <button type="button" className="secondary-button" onClick={()=>edit('place')}>Change place <span aria-hidden="true">↗</span></button>
        </div>
        {!selectedGroup&&<div className="unavailable-note" role="status"><p>{unavailableReason(selected,filters.quantity)}</p>{alternative&&<button type="button" className="secondary-button" onClick={()=>applySelection(alternative.id,true)}>Show available alternative <span>↗</span></button>}</div>}
      </div>:null}
      {stage>=3&&flowNavigation}
      {savedViewpoint&&<section className="saved-viewpoint-confirmation" aria-label="Saved viewpoint"><button type="button" className="saved-viewpoint-link" onClick={openSavedViewpoint}>{savedViewpoint.group.people} {savedViewpoint.group.people===1?'person':'people'} · {STANDS[savedViewpoint.anchor.stand].name} · {BLOCK_BY_ID.get(savedViewpoint.anchor.blockId)?.label.split(' · ')[1]} · {describePlace(savedViewpoint.anchor)}</button><button type="button" className="saved-viewpoint-delete" aria-label="Remove saved viewpoint" title="Remove saved viewpoint" onClick={removeSavedViewpoint}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg></button><p>{savedViewpoint.group.kind==='standing-area'?'A standing-area sample describes a region; no personal spot is assigned.':'This shows the viewing location in the model.'}</p></section>}
      {notice&&<p className="discovery-notice" role="status">{notice}</p>}
    </aside></div>
    <p className="sr-only" role="status" aria-live="polite">Step {stage} of 4. {stageLabel}. {selected?`${STANDS[selected.stand].name}, ${describePlace(selected)}. ${selected.availability} in demo.`:'No place selected.'} {savedViewpoint?'Viewpoint saved. ':''}{stage===2&&results.length===0?'No places match these filters. ':''}{view.mode==='preview'?'Preview open. Escape returns to the stadium view.':view.mode==='overview'?'Stadium overview.':'Camera moving.'}</p>
  </div>;
}
