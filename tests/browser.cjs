// Reproducible integration checks against an already running local preview.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base=process.env.TEST_URL||'http://127.0.0.1:5178';
const output=path.resolve('.cache/qa');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:process.env.TEST_BROWSER||'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const mode=async expected=>page.waitForFunction(mode=>document.querySelector('.scene-host')?.dataset.mode===mode,expected);
 const frame=page.locator('.scene-frame');
 const labels={low:'Lower view',middle:'Middle view',high:'Upper view'};
 const changePlace=async p=>{const b=p.getByRole('button',{name:'Change place',exact:true});if(await b.count())await b.click({timeout:5000}).catch(async e=>{if(await p.locator('.place-panel').getAttribute('data-stage')!=='2')throw e;});};
 const exactPlace=async p=>{await changePlace(p);if(!await p.locator('.advanced-places').evaluate(d=>d.open))await p.locator('.advanced-places summary').click();await p.getByRole('button',{name:'Select this place'}).click();};
 await page.goto(base);await mode('overview');await frame.scrollIntoViewIfNeeded();
 await frame.screenshot({path:path.join(output,'overview-cutaway.png')});
 const stats=await page.locator('.scene-host').evaluate(el=>({...el.dataset}));
 assert.ok(Number(stats.drawCalls)<200);assert.ok(Number(stats.triangles)<650000);
 // Project a known place into the initial camera, then exercise actual pointer picking.
 const point=await page.evaluate(async()=>{
  const {DEMO}=await import('/src/places/demo.ts');const {HOME,HOME_TARGET}=await import('/src/viewer/camera.ts');
  const T=await import('/node_modules/three/build/three.module.js');const box=document.querySelector('.scene-host').getBoundingClientRect();
  const camera=new T.PerspectiveCamera(43,box.width/box.height,.08,1200);camera.position.set(...HOME);camera.lookAt(...HOME_TARGET);camera.updateMatrixWorld();
  const p=DEMO.places.find(p=>p.id==='DEMO-WEST-04-LOWER-R13-S13');const v=new T.Vector3(p.position[0],p.position[1]+.54,p.position[2]).project(camera);
  return {x:box.x+(v.x+1)*box.width/2,y:box.y+(1-v.y)*box.height/2};
 });
 await page.mouse.move(point.x,point.y);await page.locator('.hover-card').waitFor();await page.mouse.click(point.x,point.y);
 await page.locator('.place-id').waitFor();const picked=await page.locator('.place-id').textContent();assert.match(picked,/DEMO-WEST/);
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+100,point.y+30,{steps:12});await page.mouse.up();
 assert.equal(await page.locator('.place-id').textContent(),picked,'Drag must not change selection');
 await page.getByRole('button',{name:'Reset stadium',exact:true}).click();assert.equal(await page.locator('.place-id').count(),0);
 await page.getByLabel('Roof cutaway').uncheck();await frame.screenshot({path:path.join(output,'overview-full-roof.png')});await page.getByLabel('Roof cutaway').check();
 console.log('PASS pointer hover/picking, drag suppression, reset, roof toggle',stats);
 for(const stand of ['South','West','North','East']){
  await page.locator('.stand-switcher').getByRole('button',{name:`${stand} stand`}).click();
  const sampleIds=new Set();
  for(const level of ['low','middle','high']){
   await changePlace(page);await page.getByRole('button',{name:labels[level]}).click();const id=await page.locator('.place-id').textContent();
   assert.ok(!sampleIds.has(id),`${stand} ${level} must be a distinct sample`);sampleIds.add(id);
   if(stand==='South'){assert.match(id,/AREA/);assert.match(await page.locator('.selected-details').textContent(),/unassigned/);}
   await page.getByRole('button',{name:'Preview this view'}).click();await mode('preview');
   assert.equal(await page.getByLabel('Roof cutaway').isDisabled(),true);
   await frame.screenshot({path:path.join(output,`${stand.toLowerCase()}-${level}.png`)});
   const line=page.locator('.mini-map g line');const before=await line.getAttribute('x2');await page.getByRole('button',{name:'Turn left',exact:true}).click();
   await page.waitForFunction(old=>document.querySelector('.mini-map g line').getAttribute('x2')!==old,before);
   await frame.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('+');await page.keyboard.press('Escape');await mode('overview');
   assert.equal(await page.locator('.place-id').textContent(),id);assert.equal(await page.getByRole('button',{name:'Preview this view'}).evaluate(el=>el===document.activeElement),true);
  }
 }
 console.log('PASS 12 low/middle/high previews across four stands, map direction, keyboard, Escape and focus restoration');
 // Cancel a flight while it is in progress, then change selection mid-flight.
 await page.getByRole('button',{name:'Preview this view'}).click();await page.keyboard.press('Escape');await mode('overview');
 await page.getByRole('button',{name:'Preview this view'}).click();await changePlace(page);await page.getByRole('button',{name:labels.low}).click();await mode('overview');
 console.log('PASS interrupted flights and reselection');
 await page.emulateMedia({reducedMotion:'reduce'});
 const started=Date.now();await page.getByRole('button',{name:'Preview this view'}).click();await mode('preview');assert.ok(Date.now()-started<1200,'Reduced-motion preview must skip flight');
 await page.keyboard.press('Escape');await mode('overview');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.getByRole('button',{name:'Preview this view'}).click();await page.emulateMedia({reducedMotion:'reduce'});await mode('preview');await page.keyboard.press('Escape');await mode('overview');
 console.log('PASS reduced motion, including live preference change');
 for(const width of [390,768,1024,1280]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}`);
 }
 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(e.message));await phone.goto(base);await phone.waitForFunction(()=>document.querySelector('.scene-host')?.dataset.mode==='overview');
 await phone.locator('.stand-switcher').getByRole('button',{name:'South stand'}).tap();await phone.getByRole('button',{name:labels.middle}).tap();await phone.getByRole('button',{name:'Preview this view'}).tap();
 await phone.waitForFunction(()=>document.querySelector('.scene-host')?.dataset.mode==='preview');await phone.locator('.camera-look summary').tap();await phone.getByRole('button',{name:'Turn right',exact:true}).tap();
 await phone.locator('.scene-frame').screenshot({path:path.join(output,'mobile-standing-preview.png')});await phone.getByRole('button',{name:/Back to stadium/}).tap();
 const mobileStats=await phone.locator('.scene-host').evaluate(el=>({...el.dataset}));assert.ok(Number(mobileStats.triangles)<350000);
 console.log('PASS responsive widths and emulated touch preview/return',mobileStats);
 // Context loss must leave the data explorer usable and allow a fresh renderer.
 await page.setViewportSize({width:1440,height:1050});
 await page.locator('.scene-host canvas').evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
 await page.getByRole('button',{name:'Retry 3D'}).waitFor();await exactPlace(page);
 await page.getByRole('button',{name:'Retry 3D'}).click();await mode('overview');
 const unavailable=await browser.newPage({viewport:{width:390,height:844}});
 await unavailable.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});
 await unavailable.goto(base);await unavailable.getByRole('button',{name:'Retry 3D'}).waitFor();await unavailable.locator('.stand-switcher').getByRole('button',{name:'West stand'}).click();await exactPlace(unavailable);assert.ok(await unavailable.locator('.place-id').textContent());
 assert.equal(await unavailable.getByRole('button',{name:'Preview this view'}).isDisabled(),true);
 assert.deepEqual(errors,[]);console.log('PASS WebGL failure/context loss, retry, and no uncaught browser errors');
 console.log('Screenshots:',output);await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
