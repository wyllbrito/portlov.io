const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html.html','utf8');
const source=html.slice(html.indexOf('function initializeHeroParallax(){'),html.indexOf('/* INICIALIZAÇÃO',html.indexOf('function initializeHeroParallax(){')));
const listeners={},frames=[],attributes={},buttonHandlers={},layer={style:{}},hero={addEventListener(){},insertAdjacentElement(_,button){this.button=button}};
const button={style:{},setAttribute(k,v){attributes[k]=v},addEventListener(k,v){buttonHandlers[k]=v}};
let permission='denied';
const context=vm.createContext({$:selector=>selector==='#heroCover'?hero:layer,matchMedia:()=>({matches:true}),requestAnimationFrame:fn=>{frames.push(fn);return frames.length},cancelAnimationFrame(){},motionEnabled:()=>true,coverVisible:true,motionPreference:{addEventListener(){}},toast(){},Number,Math,
 document:{hidden:false,createElement:()=>button,addEventListener(){}},DeviceOrientationEvent:{requestPermission:async()=>permission},window:{DeviceOrientationEvent:{},isSecureContext:true,addEventListener:(k,v)=>listeners[k]=v,removeEventListener:(k,v)=>{if(listeners[k]===v)delete listeners[k]}}});
function settle(){for(let i=0;frames.length&&i<250;i++)frames.shift()()}
(async()=>{
 vm.runInContext(source+'\ninitializeHeroParallax()',context);
 assert.equal(button.hidden,false);await buttonHandlers.click();assert.equal(attributes['aria-pressed'],'false');assert(!listeners.deviceorientation);
 permission='granted';await buttonHandlers.click();assert.equal(attributes['aria-pressed'],'true');assert(button.innerHTML.startsWith('<svg'));assert.equal(attributes['aria-label'],'Parar movimento da capa');
 listeners.deviceorientation({gamma:0,beta:0});listeners.deviceorientation({gamma:15,beta:10});settle();let coords=layer.style.transform.match(/translate3d\(([^p]+)px,([^p]+)px/).slice(1).map(Number);assert(coords[0]>23&&coords[1]>13,'Tilt response exceeds previous range');
 listeners.deviceorientation({gamma:90,beta:90});settle();coords=layer.style.transform.match(/translate3d\(([^p]+)px,([^p]+)px/).slice(1).map(Number);assert(coords[0]<=28&&coords[1]<=24,'Movement remains bounded inside image overscan');
 await buttonHandlers.click();settle();assert.equal(attributes['aria-pressed'],'false');assert(!listeners.deviceorientation);assert(button.innerHTML.includes('Ativar'));assert(Math.abs(Number(layer.style.transform.match(/translate3d\(([^p]+)px/)[1]))<.05);
 console.log('OK: permission, stronger tilt, bounded displacement, accessible pictogram, stop and recenter. Synthetic sensor events; no physical-device validation.');
})().catch(error=>{console.error(error);process.exitCode=1});
