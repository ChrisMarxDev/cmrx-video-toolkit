const cmrx = {colors: {white: '#FFFFFF', ink: '#1C2533', lavender: '#E1E7EF', lime: '#B8E4D5'}};
import {render} from './core.mjs';
const $=id=>document.getElementById(id), canvas=$('canvas'), ctx=canvas.getContext('2d');
let mode='generate', image=null, selected='lime', colors={background:cmrx.colors.ink,foreground:cmrx.colors.lavender}, timer, loadId=0, valid=false;
const names=['white','ink','lavender','lime'];
function say(message){$('status').textContent=message;}
function buttons(){ $('export').disabled=!valid; $('save-settings').disabled=!valid; }
function updateColors(){
 for(const role of ['background','foreground']){
  const el=$(role), color=colors[role];el.style.background=color;el.style.color=color===cmrx.colors.ink?'#FFFFFF':cmrx.colors.ink;el.querySelector('strong').textContent=color;
  el.setAttribute('aria-label',`${role} ${color}. Click to assign selected ${selected}. Drag to swap.`);
 }
 document.querySelectorAll('.swatch').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.name===selected)));
}
for(const name of names){
 const el=document.createElement('button');el.className='swatch';el.dataset.name=name;el.draggable=true;el.style.background=cmrx.colors[name];el.title=`${name} ${cmrx.colors[name]}`;el.setAttribute('aria-label',el.title);
 el.addEventListener('click',()=>{selected=name;updateColors();say(`${name} selected. Click either color slot to apply.`);});
 el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',cmrx.colors[name]);e.dataTransfer.effectAllowed='copy';});$('swatches').append(el);
}
for(const role of ['background','foreground']){
 const el=$(role);el.draggable=true;
 el.addEventListener('click',()=>{colors[role]=cmrx.colors[selected];updateColors();schedule();});
 el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',colors[role]);e.dataTransfer.setData('application/x-cmrx-slot',role);});
 el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('dragover');});el.addEventListener('dragleave',()=>el.classList.remove('dragover'));
 el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('dragover');const value=e.dataTransfer.getData('text/plain'),from=e.dataTransfer.getData('application/x-cmrx-slot');if(!names.some(n=>cmrx.colors[n]===value))return;if(from&&from!==role&&['background','foreground'].includes(from))colors[from]=colors[role];colors[role]=value;updateColors();schedule();});
}
$('swap').onclick=()=>{[colors.background,colors.foreground]=[colors.foreground,colors.background];updateColors();schedule();};
function setMode(next){mode=next;$('generate').setAttribute('aria-pressed',String(mode==='generate'));$('image-mode').setAttribute('aria-pressed',String(mode==='image'));$('pattern-controls').hidden=mode!=='generate';$('image-controls').hidden=mode!=='image';schedule();}
$('generate').onclick=()=>setMode('generate');$('image-mode').onclick=()=>setMode('image');
function settings(){return {width:Number($('width').value),height:Number($('height').value),cell:Number($('cell').value),order:Number($('order').value),background:colors.background,foreground:colors.foreground,contrast:Number($('contrast').value),bias:Number($('bias').value),phase:Number($('phase').value),invert:$('invert').checked,shape:$('shape').value};}
function draw(){
 valid=false;buttons();
 if(mode==='image'&&!image){canvas.hidden=true;$('empty').hidden=false;say('Choose or drop an image.');return;}
 try{
  const options=settings(),{width,height}=options;
  if(![width,height].every(Number.isInteger)||width<16||height<16||width>4096||height>4096||width*height>8000000)throw Error('Use dimensions 16–4096 and at most 8 million pixels.');
  if(mode==='image'){
   const temp=document.createElement('canvas');temp.width=width;temp.height=height;const c=temp.getContext('2d',{willReadFrequently:true});
   const ratio=($('fit').value==='cover'?Math.max:Math.min)(width/image.width,height/image.height),w=image.width*ratio,h=image.height*ratio;
   c.drawImage(image,(width-w)/2,(height-h)/2,w,h);options.source=c.getImageData(0,0,width,height).data;
  }
  const pixels=render(options);canvas.width=width;canvas.height=height;ctx.putImageData(new ImageData(pixels,width,height),0,0);canvas.hidden=false;$('empty').hidden=true;$('dimensions').textContent=`${width} × ${height} / ${options.cell} px cells`;valid=true;buttons();say(colors.background===colors.foreground?'Both slots use the same color. Assign a different color to reveal the pattern.':'Ready to export.');
 }catch(error){say(error.message);}
}
function schedule(){clearTimeout(timer);valid=false;buttons();say('Updating…');timer=setTimeout(draw,100);}
for(const id of ['width','height','cell','order','shape','phase','contrast','bias','invert','fit'])$(id).addEventListener('input',()=>{for(const name of ['phase','contrast','bias'])$(name+'-value').textContent=$(name).value;schedule();});
$('actual').onchange=()=>$('drop-area').classList.toggle('actual',$('actual').checked);
async function load(file){
 if(!file)return;const id=++loadId;
 if(!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)){say('Choose a PNG, JPEG, WebP, GIF or AVIF image.');return;}
 if(file.size>40*1024*1024){say('Choose an image smaller than 40 MB.');return;}
 say('Reading image…');
 try{
  const bitmap=await createImageBitmap(file);if(id!==loadId){bitmap.close();return;}
  if(bitmap.width*bitmap.height>64000000){bitmap.close();throw Error('Source image is too large. Resize it below 64 million pixels.');}
  image?.close();image=bitmap;
  const scale=Math.min(1,2048/Math.max(image.width,image.height));$('width').value=Math.max(16,Math.round(image.width*scale));$('height').value=Math.max(16,Math.round(image.height*scale));
  $('filename').textContent=`${file.name} · ${image.width} × ${image.height}`;setMode('image');
 }catch(error){say(`Could not read image: ${error.message}`);}
}
$('file').onchange=e=>load(e.target.files[0]);
for(const id of ['upload','drop-area']){
 const el=$(id);el.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();el.classList.add('dragover');}});el.addEventListener('dragleave',()=>el.classList.remove('dragover'));el.addEventListener('drop',e=>{if(!e.dataTransfer.files.length)return;e.preventDefault();el.classList.remove('dragover');load(e.dataTransfer.files[0]);});
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('export').onclick=()=>{if(!valid)return;const name=`cmrx-dither-${canvas.width}x${canvas.height}.png`;canvas.toBlob(blob=>{if(blob){download(blob,name);say('PNG exported.');}else say('Could not export PNG.');},'image/png');};
$('save-settings').onclick=()=>{if(!valid)return;download(new Blob([JSON.stringify({identity:'cmrx',version:cmrx.version,renderer:'cmrx-cpu-bayer',mode,fit:$('fit').value,...settings()},null,2)],{type:'application/json'}),'cmrx-dither-settings.json');say('Settings exported. The source image is not included.');};
updateColors();draw();
