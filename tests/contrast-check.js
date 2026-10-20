(()=>{
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 function color(css){ctx.clearRect(0,0,1,1);ctx.fillStyle=css;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((n,i)=>i===3?n/255:n)}
 function blend(top,bottom){const a=top[3];return [0,1,2].map(i=>top[i]*a+bottom[i]*(1-a)).concat(1)}
 function background(el){const chain=[];while(el){chain.push(el);el=el.parentElement}let bg=[255,255,255,1];for(const item of chain.reverse()){bg=blend(color(getComputedStyle(item).backgroundColor),bg);if(item.matches('.tabs-live a[aria-current=page]')){const pill=item.parentElement.querySelector('.page-tab-indicator');if(pill)bg=blend(color(getComputedStyle(pill).backgroundColor),bg)}}return bg}
 function lum(c){return c.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)}).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0)}
 const failures=[],visited=new Set();let tested=0;const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode,el=node.parentElement,text=node.textContent.trim();if(!text||!el||visited.has(el)||el.closest('script,style,[hidden],#appSplash,#toast,.hero-cover,.brand-heart,[aria-hidden=true]')||!el.getClientRects().length)continue;
  if(el.closest('dialog:not([open])'))continue;
  const style=getComputedStyle(el);if(style.visibility==='hidden'||Number(style.opacity)<.8||el.closest(':disabled'))continue;
  const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect();if(!rect.width||!rect.height)continue;
  visited.add(el);const bg=background(el),fg=blend(color(style.color),bg);const ratio=(Math.max(lum(bg),lum(fg))+.05)/(Math.min(lum(bg),lum(fg))+.05);
  const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&parseFloat(style.fontWeight)>=700),target=large?3:4.5;tested++;
  if(ratio<target-.05)failures.push({text:text.slice(0,70),element:el.tagName+'.'+el.className,ratio:+ratio.toFixed(2),target,foreground:style.color,background:bg.slice(0,3).map(Math.round)});
 }
 return {tested,failures};
})()
