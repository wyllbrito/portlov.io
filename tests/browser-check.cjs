const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const checks=path.join(process.cwd(),'.checks');fs.mkdirSync(checks,{recursive:true});
process.stdout.on('error',()=>{});process.stderr.on('error',()=>{});
const stage=message=>{fs.appendFileSync(path.join(checks,'progress.log'),new Date().toISOString()+' '+message+'\n');console.log(message)};
process.on('exit',code=>fs.appendFileSync(path.join(checks,'progress.log'),'EXIT '+code+'\n'));
process.on('uncaughtException',error=>{fs.appendFileSync(path.join(checks,'progress.log'),'UNCAUGHT '+error.stack+'\n');process.exitCode=1;browser?.kill();server.close();ws?.close()});
process.on('unhandledRejection',error=>{fs.appendFileSync(path.join(checks,'progress.log'),'UNHANDLED '+error?.stack+'\n');process.exitCode=1;browser?.kill();server.close();ws?.close()});
const server=http.createServer((req,res)=>{const p=path.join(process.cwd(),decodeURIComponent(req.url.split('?')[0]).replace(/^\//,''));if(!p.startsWith(process.cwd())){res.writeHead(403).end();return}try{res.setHeader('Content-Type',p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.jpg')?'image/jpeg':'application/octet-stream');res.end(fs.readFileSync(p))}catch{res.writeHead(404).end()}});
const logs=[],errors=[],results=[];let browser,ws,id=0,profilePath=null;const pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{const seq=++id;const timer=setTimeout(()=>{pending.delete(seq);reject(Error('CDP timed out: '+method))},12000);pending.set(seq,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id:seq,method,params}))});
const evaluate=async expression=>{fs.appendFileSync(path.join(checks,'trace.log'),expression.slice(0,160)+'\n');const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value};
const check=(label,value)=>{assert(value,label);results.push(label);fs.appendFileSync(path.join(checks,'progress.log'),'PASS '+label+'\n')};
const click=async selector=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing '+${JSON.stringify(selector)});if(el.disabled)throw Error('Disabled '+${JSON.stringify(selector)});el.click()})()`);await sleep(380)};
const setValue=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
const close=async()=>{await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);await sleep(70)};
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(checks,name+'.png'),Buffer.from(r.data,'base64'))}
async function touchScroll(mode){
 await evaluate('dismissToast()');await sleep(400);
 await evaluate(`editing=${mode!=='view'};organizing=false;render();openPage('inicio');${mode==='organize'?'setOrganizing(true);':''}window.scrollTo({top:window.scrollY+document.querySelector('#widgetGrid .widget').getBoundingClientRect().top-100,behavior:'instant'})`);await sleep(200);
 const info=await evaluate(`(()=>{const rect=document.querySelector('#widgetGrid .widget').getBoundingClientRect(),y=Math.min(rect.bottom-24,innerHeight-100),x=rect.left+rect.width/2,e=document.elementFromPoint(x,y);return {x,y,before:window.scrollY,tag:e.tagName,cls:e.className,touch:getComputedStyle(e).touchAction,widget:!!e.closest('.widget')}})()`);
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:info.x,y:info.y}]});
 for(let i=1;i<=8;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:info.x,y:info.y-i*18}]});await sleep(30)}
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(400);
 info.after=await evaluate('window.scrollY');fs.writeFileSync(path.join(checks,'scroll-'+mode+'.json'),JSON.stringify(info,null,2));await screenshot('scroll-'+mode);
 check('Vertical touch scroll over widget in '+mode+' mode',info.widget&&info.after>info.before+30);
}
async function run(){
 stage('Starting browser checks');
 for(const filename of ['failure.json','results.json']){const target=path.join(checks,filename);if(fs.existsSync(target))fs.unlinkSync(target)}
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 stage('HTTP ready');
 const profile=path.join(checks,'edge-profile-'+Date.now());
 profilePath=profile;
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 browser.stderr.on('data',b=>logs.push(b.toString()));browser.on('error',err=>errors.push(err.message));
 const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<160&&!fs.existsSync(active);i++){if(errors.length)throw Error(errors[0]);await sleep(100)}
 if(!fs.existsSync(active))throw Error('Edge did not expose DevTools: '+logs.join('').slice(-1500));
 stage('DevTools ready');
 const port=fs.readFileSync(active,'utf8').split('\n')[0];const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
 stage('WebSocket ready');
 ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)};
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__audioEvents=[];const NativeAudio=window.AudioContext;window.AudioContext=class extends NativeAudio{constructor(...a){super(...a);window.__lastAudio=this;const create=this.createOscillator.bind(this);this.createOscillator=()=>{const v=create();const start=v.start.bind(v);v.start=(t)=>{window.__audioEvents.push({frequency:v.frequency.value,start:t});return start(t)};return v}}};window.print=()=>{window.__printCalled=true};`});
 const url='http://127.0.0.1:'+server.address().port+'/index.html.html';await send('Page.navigate',{url});
 for(let i=0;i<80;i++){if(await evaluate(`!!document.querySelector('#onboarding[open]')`))break;await sleep(100)}
 check('Onboarding opens',await evaluate(`document.querySelector('#onboarding').open`));
 await setValue('[name=nameA]','Alex');await evaluate(`document.querySelector('#onboardingForm').requestSubmit()`);await sleep(140);
 await evaluate(`document.querySelector('#onboardingForm').requestSubmit()`);await sleep(140);
 await setValue('[name=context]','eu');await click('input[value=natureza]');await evaluate(`document.querySelector('#onboardingForm').requestSubmit()`);await sleep(650);
 check('Onboarding saves chosen theme and solo context',await evaluate(`state.setupComplete&&state.palette==='natureza'&&state.context==='eu'&&!editing`));
 check('No initialization errors',errors.length===0);
 check('Logo uses heart as dot',await evaluate(`document.querySelector('.brand').textContent==='portlovio'&&!!document.querySelector('.brand-heart svg')`));
 if(fs.existsSync(path.join(checks,'scroll-only'))){await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});await send('Page.reload');await sleep(900);for(const mode of ['view','edit','organize'])await touchScroll(mode);return}
 // Palette/mode/layout matrix: six combinations at three viewport widths.
 const matrix=[],contrast=[];const contrastSource=fs.readFileSync(path.join(__dirname,'contrast-check.js'),'utf8');
 if(fs.existsSync(path.join(checks,'quick-mode'))&&fs.existsSync(path.join(checks,'contrast.json')))contrast.push(...JSON.parse(fs.readFileSync(path.join(checks,'contrast.json'),'utf8')));
 for(const width of fs.existsSync(path.join(checks,'quick-mode'))?[]:[1280,768,360]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  for(const palette of ['paixao','natureza','lealdade'])for(const dark of [false,true]){
   await evaluate(`state.palette=${JSON.stringify(palette)};isDarkMode=${dark};applyTheme();render();`);await sleep(200);
   for(const page of ['inicio','memorias','datas']){
    await evaluate(`openPage(${JSON.stringify(page)});`);await sleep(150);
    const overflow=await evaluate(`(()=>{const selectors=['html','body','#appContent','.sheet','.widget-row','.calendar-box','.cal-grid','.page-tabs'];return [...document.querySelectorAll(selectors.join(','))].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className||e.id||e.tagName,scroll:e.scrollWidth,client:e.clientWidth}))})()`);
    assert.deepEqual(overflow,[],`${width}/${palette}/${dark}/${page} overflow: ${JSON.stringify(overflow)}`);
    if(width===1280){const report=await evaluate(contrastSource);contrast.push({palette,dark,page,...report});fs.writeFileSync(path.join(checks,'contrast.json'),JSON.stringify(contrast,null,2))}
   }
   matrix.push({width,palette,dark});
   await evaluate(`openPage('inicio')`);
   if(width===1280||width===360)await screenshot(`${width}-${palette}-${dark?'dark':'light'}`);
  }
 }
 if(matrix.length)check('18 responsive theme/mode combinations have no horizontal scrolling on all 3 pages',matrix.length===18);
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await evaluate(`state.palette='lealdade';isDarkMode=false;applyTheme();render();`);await sleep(300);
 check('Snow photo chooses dark title automatically',await evaluate(`getComputedStyle(document.querySelector('#journalTitle')).color==='rgb(21, 32, 43)'`));
 await click('#toolsExpand');await click('[data-action=header-edit]');
 check('Cover controls work in view mode',await evaluate(`!!document.querySelector('form[data-form=header] input[name=coverBrightness]')`));
 await setValue('[name=coverBrightness]','55');await setValue('[name=titleColor]','#f0edc5');
 check('Manual title color and brightness apply',await evaluate(`state.header.titleColorMode==='custom'&&state.header.titleColor==='#f0edc5'&&getComputedStyle(document.querySelector('#journalTitle')).color==='rgb(240, 237, 197)'&&document.querySelector('#heroCover').style.getPropertyValue('--cover-brightness')==='0.55'`));
 const dom=await send('DOM.getDocument');const input=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'input[data-header-cover]'});
 await evaluate(`window.__photoSteps=[];const resizeOriginal=resizePhoto;resizePhoto=async file=>{__photoSteps.push('resize start '+file.type+' '+file.size);const r=await resizeOriginal(file);__photoSteps.push('resize end');return r};const dbOriginal=dbRequest;dbRequest=async(...args)=>{__photoSteps.push('db start');const r=await dbOriginal(...args);__photoSteps.push('db end');return r};const blobOriginal=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb,...args){__photoSteps.push('blob start');return blobOriginal.call(this,(blob)=>{__photoSteps.push('blob end');cb(blob)},...args)};`);
 await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(process.cwd(),'assets/cover-leaf.jpg')]});
 for(let i=0;i<120;i++){if(await evaluate(`!!state.header.coverPhoto`))break;await sleep(100)}
 const upload=await evaluate(`({cover:state.header.coverPhoto,files:document.querySelector('input[data-header-cover]').files.length,toast:document.querySelector('#toastMessage').textContent,busy:photoUploadBusy,steps:window.__photoSteps})`);fs.writeFileSync(path.join(checks,'upload.json'),JSON.stringify(upload,null,2));
 check('Custom cover image uploaded and persisted',await evaluate(`!!state.header.coverPhoto&&!!photoURL(state.header.coverPhoto)`));
 await setValue('[name=titleColorMode]','auto');await evaluate(`document.querySelector('form[data-form=header]').requestSubmit()`);await sleep(500);
 await click('#toolsExpand');await click('[data-action=header-edit]');await click('[data-action=reset-cover]');
 check('Restore default cover works in view mode',await evaluate(`!state.header.coverPhoto`));await close();
 // Installation preview and all tabs are actual modal interactions.
 await evaluate(`showInstall()`);await click('#dialog [data-action=app-preview]');
 check('App preview closes source dialog and opens visible modal',await evaluate(`document.querySelector('#appPreview').open&&!document.querySelector('#dialog').open&&document.querySelector('#appPreviewContent').clientHeight>100`));
 for(const tab of ['album','dates','today']){await click(`[data-action=app-tab][data-tab=${tab}]`);check('App tab '+tab,await evaluate(`appPreviewTab===${JSON.stringify(tab)}&&document.querySelector('#appPreviewContent').textContent.length>5`))}
 await click('[data-action=close-app-preview]');check('App preview closes',await evaluate(`!document.querySelector('#appPreview').open`));
 // Audio starts from a user action. Check independent click nodes with piano off/on/off.
 await click('#toolsExpand');const before=await evaluate('window.__audioEvents.length');await click('[data-action=toggle-theme]');
 check('Click sound with piano off',await evaluate(`window.__audioEvents.length>${before}&&window.__lastAudio.state==='running'`));
 await click('[data-action=toggle-ambience]');const count=await evaluate('window.__audioEvents.length');
 check('Piano starts with discrete harmonics',await evaluate(`document.querySelector('[data-action=toggle-ambience]').getAttribute('aria-pressed')==='true'&&window.__audioEvents.length>=${before+16}`));
 await click('[data-action=toggle-theme]');check('Click sound with piano on',await evaluate(`window.__audioEvents.length>${count}`));
 await click('[data-action=toggle-ambience]');const after=await evaluate('window.__audioEvents.length');await click('[data-action=toggle-theme]');
 check('Click sound after piano stops',await evaluate(`window.__audioEvents.length>${after}&&document.querySelector('[data-action=toggle-ambience]').getAttribute('aria-pressed')==='false'`));
 await evaluate(`toggleMotionToolbar(false);openPage('datas')`);await sleep(350);
 const month=await evaluate(`document.querySelector('.calendar-head strong').textContent`);await click('[data-action=cal-next]');
 check('Calendar next month',await evaluate(`document.querySelector('.calendar-head strong').textContent!==${JSON.stringify(month)}`));await click('[data-action=cal-prev]');
 check('Calendar previous month',await evaluate(`document.querySelector('.calendar-head strong').textContent===${JSON.stringify(month)}`));
 await click('#modeButton');await click('[data-action=quick-add]');
 check('Catalog opens',await evaluate(`document.querySelectorAll('.catalog-card').length===9`));
 check('Examples updated',await evaluate(`document.querySelector('.catalog').textContent.includes('Ir ao mercado')&&document.querySelector('.catalog').textContent.includes('Assistir um filme')&&!document.querySelector('.catalog').textContent.includes('Nosso som')`));
 await screenshot('catalog-dark');await close();
 // Action wiring audit records which buttons have handlers; runtime workflows above test effects.
 const source=fs.readFileSync('index.html.html','utf8');const handlerSource=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
 const handlers=new Set(['drag-widget',...[...handlerSource.matchAll(/\bcase\s*['"]([^'"]+)['"]\s*:/g)].map(m=>m[1]),...[...handlerSource.matchAll(/(?:action|dataset\.action)\s*===?\s*['"]([^'"]+)['"]/g)].map(m=>m[1])]);
 const actions=await evaluate(`[...new Set([...document.querySelectorAll('[data-action]')].map(e=>e.dataset.action))]`);const wiring=actions.filter(a=>!handlers.has(a));
 check('Visible buttons have registered action handlers',wiring.length===0);
 await evaluate(`editing=false;render();openPage('memorias')`);
 await click('[data-action=open-letter]');await click('[data-action=unseal-letter]');
 check('Letter opens and reveals its actual content',await evaluate(`!document.querySelector('#letterPaper').hidden&&document.querySelector('#letterPaper').textContent.includes('Com carinho')`));await close();
 const firstSlide=await evaluate(`document.querySelector('.slide-image img').src`);await click('[data-action=slide-next]');
 check('Slideshow next photo',await evaluate(`document.querySelector('.slide-image img').src!==${JSON.stringify(firstSlide)}`));await click('[data-action=slide-prev]');
 check('Slideshow previous photo',await evaluate(`document.querySelector('.slide-image img').src===${JSON.stringify(firstSlide)}`));
 await evaluate(`openPage('inicio')`);const done=await evaluate(`state.slots.find(w=>w?.type==='dreams').items[0].done`);await click('input[data-dream]');
 check('Checklist toggles and saves a task',await evaluate(`state.slots.find(w=>w?.type==='dreams').items[0].done!==${done}`));
 await click('[data-action=photo-open]');const photo=await evaluate(`document.querySelector('.lightbox-image').src`);await click('[data-action=light-next]');
 check('Photo viewer next',await evaluate(`document.querySelector('.lightbox-image').src!==${JSON.stringify(photo)}`));await click('[data-action=light-prev]');
 check('Photo viewer previous',await evaluate(`document.querySelector('.lightbox-image').src===${JSON.stringify(photo)}`));await close();
 await click('#modeButton');await click('[data-action=organize]');check('Organize mode activates',await evaluate('organizing'));
 await click('[data-action=select-all]');check('Select all widgets on current page',await evaluate(`selectedWidgets.size===state.slots.filter(w=>w?.page===activePage).length`));await click('[data-action=organize-done]');
 check('Organize mode finishes',await evaluate('!organizing'));
 const countWidgets=await evaluate(`state.slots.filter(Boolean).length`);await click('[data-action=quick-add]');await click('[data-action=choose-widget][data-type=text]');
 check('Widget can be added from catalog',await evaluate(`state.slots.filter(Boolean).length===${countWidgets+1}`));await close();
 const added=await evaluate(`state.slots.filter(w=>w?.type==='text').at(-1).id`);await evaluate(`document.querySelector('[data-action="remove-widget"][data-id="${added}"]').click()`);await sleep(100);await click('[data-action=confirm-remove]');
 check('Widget removal confirms and removes only chosen widget',await evaluate(`state.slots.filter(Boolean).length===${countWidgets}&&!getWidget('${added}')`));
 await evaluate(`showInstall()`);check('Home screen guidance shows actual browser steps',await evaluate(`document.querySelector('#dialogBody').textContent.includes('Safari')&&!document.querySelector('[data-action=simulate-install]')`));await close();
 await evaluate(`showPrivacy()`);check('Privacy dialog opens',await evaluate(`document.querySelector('#dialog').open`));await close();
 const modalReports=[];
 for(const palette of ['paixao','natureza','lealdade'])for(const dark of [false,true]){
  await close();await evaluate(`state.palette=${JSON.stringify(palette)};isDarkMode=${dark};applyTheme();render()`);await sleep(360);
  for(const show of ["showCatalog(state.slots.findIndex(w=>!w))","editHeader()","showInstall()","showExportOptions()","showPrivacy()","personalizeWidget(state.slots.find(w=>w?.type==='text').id)"]){
   await evaluate(show);await sleep(70);const report=await evaluate(contrastSource);modalReports.push({palette,dark,dialog:show,...report});
  }
 }
 fs.writeFileSync(path.join(checks,'modal-contrast.json'),JSON.stringify(modalReports,null,2));
 await close();await evaluate(`state.palette='natureza';isDarkMode=true;applyTheme();render();showAppPreview()`);await screenshot('app-preview-dark');await close();
 await evaluate(`openPage('memorias');document.querySelector('.brand').click()`);await sleep(400);
 check('Logo returns home and top',await evaluate(`activePage==='inicio'&&window.scrollY<2`));
 check('Filled cursors distinguish default, clickable and scroll areas',await evaluate(`(()=>{const root=getComputedStyle(document.documentElement);const types=['default','click','scroll'].map(k=>root.getPropertyValue('--cursor-'+k));return new Set(types).size===3&&types.every(t=>decodeURIComponent(t).includes('fill="#'))})()`));
 // Test motion on a mobile viewport and sensor permission branches with synthetic events.
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});
 await send('Page.reload');await sleep(900);
 check('Preferences survive reload',await evaluate(`state.setupComplete&&state.palette==='natureza'&&state.header.coverBrightness==='55'`));
 await evaluate(`window.scrollTo(0,0);document.querySelector('#appContent').scrollTo(0,0);DeviceOrientationEvent.requestPermission=async()=>'denied'`);
 await click('.mobile-cover-motion');check('Sensor denial is handled',await evaluate(`document.querySelector('.mobile-cover-motion').getAttribute('aria-pressed')==='false'`));
 await evaluate(`DeviceOrientationEvent.requestPermission=async()=>'granted'`);await click('.mobile-cover-motion');
 await evaluate(`window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{gamma:0,beta:0}));window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',{gamma:15,beta:10}))`);await sleep(500);
 check('Mobile tilt moves cover only after activation',await evaluate(`document.querySelector('.mobile-cover-motion').getAttribute('aria-pressed')==='true'&&getComputedStyle(document.querySelector('.hero-parallax')).transform!=='none'`));
 await click('.mobile-cover-motion');check('Mobile motion can be disabled',await evaluate(`document.querySelector('.mobile-cover-motion').getAttribute('aria-pressed')==='false'`));
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(100);
 check('Reduced motion hides sensor activation',await evaluate(`getComputedStyle(document.querySelector('.mobile-cover-motion')).display==='none'`));
 await send('Emulation.setEmulatedMedia',{features:[]});
 for(const mode of ['view','edit','organize'])await touchScroll(mode);
 const failures=[...contrast,...modalReports].flatMap(r=>r.failures.map(f=>({palette:r.palette,dark:r.dark,page:r.page||r.dialog,...f})));
 fs.writeFileSync(path.join(checks,'contrast-failures.json'),JSON.stringify(failures,null,2));
 check('Measured text contrast in pages and dialogs',failures.length===0);
 check('No JavaScript errors during tested workflows',errors.length===0);
 fs.writeFileSync(path.join(checks,'results.json'),JSON.stringify({results,matrix,errors},null,2));
 console.log('COMPLETE '+results.length+' checks; screenshots in .checks');
}
run().catch(e=>{console.error(e.stack);fs.writeFileSync(path.join(checks,'failure.json'),JSON.stringify({error:e.stack,errors,logs:logs.join('').slice(-2000)},null,2));process.exitCode=1}).finally(async()=>{if(ws){try{await send('Browser.close')}catch{}ws.close()}if(browser&&!browser.killed)browser.kill();server.close();await sleep(400);if(profilePath&&path.resolve(profilePath).startsWith(path.resolve(checks)+path.sep+'edge-profile-')){try{fs.rmSync(profilePath,{recursive:true,force:true,maxRetries:2,retryDelay:200})}catch{}}});
