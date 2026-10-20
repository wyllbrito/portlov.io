const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html.html','utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
scripts.forEach((source,i)=>new vm.Script(source,{filename:`inline-${i+1}.js`}));
function declaration(name){const start=html.indexOf(`function ${name}(`);assert(start>=0,name);const rest=html.slice(start);for(const end of rest.matchAll(/\n\s*}/g)){const candidate=rest.slice(0,end.index+end[0].length);try{new vm.Script(candidate);return candidate}catch{}}throw Error('Cannot extract '+name)}
const marks=[];const properties={};
const root={dataset:{spacePalette:'natureza'},style:{setProperty:(k,v)=>properties[k]=v}};
const context=vm.createContext({document:{documentElement:root,querySelectorAll:selector=>selector.includes('path')?[{setAttribute:(key,value)=>marks.push(value)}]:[]},state:{palette:'natureza'},ICON_PATHS:{heart:'heart-path'},SPACE_PALETTES:{natureza:{accent:'#3F7958'},lealdade:{accent:'#3D6D9A'},paixao:{accent:'#C8102E'}},encodeURIComponent});
vm.runInContext(declaration('affectionPath')+'\n'+declaration('updateAffectionTheme'),context);
for(const palette of ['natureza','lealdade','paixao']){root.dataset.spacePalette=palette;context.state.palette=palette;vm.runInContext('updateAffectionTheme()',context);assert(properties['--affection-cursor'].includes(encodeURIComponent(context.SPACE_PALETTES[palette].accent)));}
assert.equal(new Set(marks).size,3,'Three distinct decorative icons');
assert(html.includes("if(event.pointerType!=='mouse'&&!handle)return;"));
assert(html.includes('.widget-row { grid-template-columns:minmax(0,1fr); overflow:visible; }'));
assert(html.includes("onboardingDraft.context=String(data.get('context')||'qualquer')"));
assert(html.includes("state.context=draft.context||'qualquer'"));
assert(html.includes('DeviceOrientationEvent.requestPermission()'));
assert(html.includes("window.removeEventListener('deviceorientation',orientation)"));
assert(html.includes('const source=custom||THEME_COVER_ART[state.palette]||CANDY_PHOTO;'));
assert(!html.includes('voice.frequency.setTargetAtTime(root*ratios'));
const voices=[];const scheduled=[];
function oscillator(){const voice={frequency:{value:0},connect(){},disconnect(){},start(t){scheduled.push(t)},stop(){}};voices.push(voice);return voice}
const audio={createOscillator:oscillator,createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}})};
const piano=vm.createContext({audio,ambience:{master:{},voices:new Set()},Math});
vm.runInContext(declaration('pianoNote'),piano);vm.runInContext('pianoNote(69,1,2.8,.6)',piano);
assert.equal(voices.length,4);assert.equal(voices[0].frequency.value,440);assert.equal(voices[3].frequency.value,1760);assert.deepEqual(scheduled,[1,1,1,1]);
voices.forEach(v=>v.onended());assert.equal(piano.ambience.voices.size,0);
const preview=vm.createContext({photoURL:()=>'',escapeHTML:value=>String(value),icon:()=>''});vm.runInContext(declaration('catalogPreview'),preview);
const letter=vm.runInContext("catalogPreview('letters')",preview);
assert.equal((letter.match(/class="letter-glyph/g)||[]).length,'Guardo com carinho.'.length,'Each written character corresponds to example text');
assert(!letter.includes('preview-type-veil'),'No caret moving through empty letter space');
assert(html.includes('natureza:\'data:image/jpeg;base64,')&&html.includes('lealdade:\'data:image/jpeg;base64,'),'Photographic covers embedded offline');
console.log(`OK: ${scripts.length} scripts compilados; temas, cursores, onboarding, rolagem, sensor, capa personalizada e notas de piano verificados.`);
