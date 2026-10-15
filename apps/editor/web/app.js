import {clamp, range, moveInterval, moveRect, drawRect, conflict, retained, clock} from './model.mjs';
const $ = id => document.getElementById(id);
const token = new URLSearchParams(location.hash.slice(1)).get('token') || sessionStorage.getItem('review-token') || '';
sessionStorage.setItem('review-token', token); history.replaceState(null, '', location.pathname);
let doc=null, workspace=null, selected=null, selection=[0,0], drawing=false, pendingRect=null;
let undo=[], redo=[], busy=false, dirty=false, saving=null, saveTimer=null, editGeneration=0, dragging=false;
let lastJobError=null, lastExport=null;
const video=$('video');
const items=()=>doc ? [...doc.marks,...doc.objects] : [];
const item=()=>items().find(i=>i.id===selected);
const error=text=>{$('error').textContent=text; $('error').hidden=!text;};
function element(tag, cls, text) {const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
async function api(path, data) {
  const response=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',headers:{'X-Review-Token':token,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  if (!response.ok) {let message=`Request failed (${response.status})`;try{message=(await response.json()).error||message;}catch{}throw Error(message);}
  return response.json();
}
function snapshot(){return structuredClone({marks:doc.marks,objects:doc.objects});}
function checkpoint(){undo.push(snapshot());if(undo.length>100)undo.shift();redo=[];}
function changed(inspect=true){editGeneration++;dirty=true;error('');render(inspect);clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush().catch(e=>error(e.message)),350);}
async function flush(){
  clearTimeout(saveTimer);
  if(saving){await saving;if(dirty)return flush();return;}
  if(!dirty||!doc)return;
  if(conflict(doc.marks)){$('save-status').textContent='Conflict — not saved';throw Error('Must-keep and must-cut overlap. Adjust or delete the conflicting mark before continuing.');}
  const generation=editGeneration;
  $('save-status').textContent='Saving…';
  saving=api('save',{revision:doc.revision,source_sha256:doc.source.sha256,...snapshot()}).then(result=>{doc.revision=result.revision;if(editGeneration===generation)dirty=false;$('save-status').textContent=dirty?'Unsaved changes':'Saved';}).finally(()=>{saving=null;});
  await saving;
  if(dirty)return flush();
}
function select(id, seek=false){selected=id;const value=item();if(value&&seek)video.currentTime=value.source_start;render();}
function setSelection(a,b,live=false){
  selection=range(a,b,doc.source.duration);$('range-start').value=selection[0].toFixed(2);$('range-end').value=selection[1].toFixed(2);
  if(live){const band=document.querySelector('.source-lane .selection');if(band){band.style.left=`${selection[0]/doc.source.duration*100}%`;band.style.width=`${(selection[1]-selection[0])/doc.source.duration*100}%`;}}
  else {renderTimeline();renderTranscript();}
}
function selectionRange(){if(selection[1]-selection[0]<.01)throw Error('Select a range on the timeline or transcript first.');return {source_start:selection[0],source_end:selection[1]};}
function mark(kind){try{const value={id:crypto.randomUUID(),kind,text:'',...selectionRange()};if(conflict([...doc.marks,value]))throw Error('This overlaps an opposite keep/cut decision. Adjust or delete that mark first.');checkpoint();doc.marks.push(value);selected=value.id;changed();if(kind==='comment')$('item-text').focus();}catch(e){error(e.message);}}
function render(inspect=true){
  if(!doc)return;
  $('empty').hidden=true;$('editor').hidden=false;
  $('undo').disabled=busy||!undo.length;$('redo').disabled=busy||!redo.length;$('export-button').disabled=busy;
  $('save-status').textContent=dirty?'Unsaved changes':'Saved';
  renderTimeline();renderTranscript();renderOverlay();if(inspect)renderInspector();
}
function renderInspector(){
  const value=item();$('inspector').hidden=!value;if(!value)return;
  $('item-title').textContent=value.rect?'Visual request':{good:'Must keep',bad:'Must cut',comment:'Comment'}[value.kind];
  $('item-text').value=value.text;$('item-start').value=value.source_start.toFixed(2);$('item-end').value=value.source_end.toFixed(2);
}
function renderTranscript(){
  if(!doc)return;
  const search=$('search').value.toLocaleLowerCase();const container=$('transcript');container.replaceChildren();
  const segments=doc.transcript.segments.filter(s=>s.text.toLocaleLowerCase().includes(search));
  $('segment-count').textContent=`${segments.length} passages`;
  if(!segments.length){container.append(element('p','muted',search?'No matching passages.':'No speech detected. You can still annotate the recording.'));return;}
  for(const seg of segments){
    const button=element('button','passage');button.dataset.id=seg.id;button.dataset.start=seg.source_start;button.dataset.end=seg.source_end;
    button.append(element('time','',clock(seg.source_start)),document.createTextNode(seg.text));
    button.classList.toggle('selected',seg.source_start<selection[1]&&seg.source_end>selection[0]);
    for(const mark of doc.marks) if(mark.source_start<seg.source_end&&mark.source_end>seg.source_start)button.classList.add(mark.kind==='bad'?'cut':mark.kind==='good'?'kept':'commented');
    button.onclick=e=>{if(e.shiftKey)setSelection(Math.min(selection[0],seg.source_start),Math.max(selection[1],seg.source_end));else setSelection(seg.source_start,seg.source_end);video.currentTime=seg.source_start;};
    container.append(button);
  }
  highlightPlayback();
}
function pointerDrag(event, onMove, onEnd){
  if(busy)return;
  event.preventDefault();event.stopPropagation();dragging=true;
  const pointer=event.pointerId;
  const move=e=>{if(e.pointerId===pointer)onMove(e);};
  const end=e=>{if(e.pointerId!==pointer)return;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);dragging=false;onEnd(e);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
}
function renderTimeline(){
  if(!doc)return;const timeline=$('timeline');timeline.replaceChildren();
  const width=Math.max($('timeline-scroll').clientWidth,500)*Number($('zoom').value);timeline.style.width=`${width}px`;
  const duration=doc.source.duration;
  const ruler=element('div','ruler');
  for(let i=0;i<=10*Number($('zoom').value);i++){const fraction=i/(10*Number($('zoom').value));const tick=element('span','tick',clock(duration*fraction));tick.style.left=`${fraction*100}%`;ruler.append(tick);}timeline.append(ruler);
  const source=element('div','lane source-lane');source.append(element('div','lane-label','Recording'));
  const highlight=element('div','selection');highlight.style.left=`${selection[0]/duration*100}%`;highlight.style.width=`${(selection[1]-selection[0])/duration*100}%`;source.append(highlight);
  source.onpointerdown=e=>{if(e.target.classList.contains('lane-label'))return;const box=source.getBoundingClientRect();const at=x=>clamp((x-box.left)/box.width,0,1)*duration;const initial=at(e.clientX);video.currentTime=initial;pointerDrag(e,m=>setSelection(initial,at(m.clientX),true),()=>{renderTimeline();renderTranscript();});};timeline.append(source);
  const all=items();
  if(!all.length){const lane=element('div','lane');lane.append(element('div','lane-label','Annotations'),element('span','muted','Select a range above, or draw a request on the video.'));timeline.append(lane);}
  for(const value of all){
    const lane=element('div','lane');const title=value.rect?'Visual request':{good:'Must keep',bad:'Must cut',comment:'Comment'}[value.kind];
    const label=element('button','lane-label',title);label.onclick=()=>select(value.id,true);lane.append(label);
    const bar=element('div',`bar ${value.rect?'visual':value.kind} ${value.id===selected?'selected':''}`,value.text||title);bar.tabIndex=0;bar.setAttribute('role','button');bar.setAttribute('aria-label',`${title}: ${value.text}, ${clock(value.source_start)} to ${clock(value.source_end)}`);
    bar.style.left=`${value.source_start/duration*100}%`;bar.style.width=`${(value.source_end-value.source_start)/duration*100}%`;
    bar.append(element('span','edge start'),element('span','edge end'));
    bar.onpointerdown=e=>{
      if(busy)return;
      const original=structuredClone(value), x=e.clientX, box=lane.getBoundingClientRect();const edge=e.target.classList.contains('start')?'start':e.target.classList.contains('end')?'end':'move';
      checkpoint();selected=value.id;video.currentTime=value.source_start;renderInspector();
      pointerDrag(e,m=>{Object.assign(value,moveInterval(original,(m.clientX-x)/box.width*duration,duration,edge));bar.style.left=`${value.source_start/duration*100}%`;bar.style.width=`${(value.source_end-value.source_start)/duration*100}%`;renderOverlay();renderInspector();},()=>changed());
    };
    bar.onkeydown=e=>{if(e.key==='Enter'){select(value.id,true);return;}if(!['ArrowLeft','ArrowRight'].includes(e.key)||busy)return;e.preventDefault();checkpoint();Object.assign(value,moveInterval(value,(e.key==='ArrowLeft'?-.1:.1)*(e.shiftKey?10:1),duration));changed();};
    lane.append(bar);timeline.append(lane);
  }
  const head=element('div','playhead');head.id='playhead';timeline.append(head);highlightPlayback();
}
function renderOverlay(){
  if(!doc)return;const overlay=$('overlay');overlay.replaceChildren();overlay.classList.toggle('drawing',drawing);
  for(const value of doc.objects){
    // Media clocks can round a requested seek slightly below its source timestamp.
    if(video.currentTime+.001<value.source_start||video.currentTime>=value.source_end)continue;
    const box=element('div',`box ${value.id===selected?'selected':''}`);box.dataset.id=value.id;
    positionBox(box,value.rect);box.append(element('span','box-label',value.text));
    const handle=element('span','box-handle');box.append(handle);box.tabIndex=0;box.setAttribute('aria-label',value.text);
    box.onpointerdown=e=>{
      if(drawing||busy)return;
      const original={...value.rect}, bounds=overlay.getBoundingClientRect(), x=e.clientX,y=e.clientY, resize=e.target===handle;
      checkpoint();selected=value.id;renderInspector();
      pointerDrag(e,m=>{value.rect=moveRect(original,(m.clientX-x)/bounds.width,(m.clientY-y)/bounds.height,resize);positionBox(box,value.rect);},()=>changed());
    };
    box.onkeydown=e=>{if(e.key==='Enter'){select(value.id);$('item-text').focus();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||busy)return;e.preventDefault();checkpoint();value.rect=moveRect(value.rect,e.key==='ArrowLeft'?-.01:e.key==='ArrowRight'?.01:0,e.key==='ArrowUp'?-.01:e.key==='ArrowDown'?.01:0,e.shiftKey);changed();};
    overlay.append(box);
  }
}
function positionBox(box,r){box.style.left=`${r.x*100}%`;box.style.top=`${r.y*100}%`;box.style.width=`${r.width*100}%`;box.style.height=`${r.height*100}%`;}
$('overlay').onpointerdown=e=>{
  if(!drawing||!doc||busy)return;
  video.pause();const bounds=$('overlay').getBoundingClientRect();const coords=e=>[clamp((e.clientX-bounds.left)/bounds.width,0,1),clamp((e.clientY-bounds.top)/bounds.height,0,1)];const [x,y]=coords(e);const box=element('div','box');$('overlay').append(box);
  pointerDrag(e,m=>{const [right,bottom]=coords(m);pendingRect=drawRect(x,y,right,bottom);positionBox(box,pendingRect);},()=>{drawing=false;$('draw').textContent='Draw visual request';if(!pendingRect||pendingRect.width<.01||pendingRect.height<.01){pendingRect=null;renderOverlay();return;}$('request-text').value='';$('request-dialog').showModal();$('request-text').focus();});
};
function highlightPlayback(){
  if(!doc)return;const t=video.currentTime;$('position').textContent=`${clock(t)} / ${clock(doc.source.duration)}`;$('seek').value=t;
  const head=$('playhead');if(head)head.style.left=`${130+($('timeline').clientWidth-130)*t/doc.source.duration}px`;
  for(const node of $('transcript').children){if(node.dataset.id)node.classList.toggle('active',Number(node.dataset.start)<=t&&t<Number(node.dataset.end));}
}
video.ontimeupdate=()=>{
  if(doc&&$('cut-preview').checked&&!video.paused){const spans=retained(doc.marks,doc.source.duration),t=video.currentTime;const current=spans.find(([a,b])=>a<=t&&t<b);if(!current){const next=spans.find(([a])=>a>t);if(next)video.currentTime=next[0];else video.pause();}}
  highlightPlayback();if(!dragging)renderOverlay();
};
video.onplay=()=>{$('play').textContent='Pause';};video.onpause=()=>{$('play').textContent='Play';};
video.onerror=()=>error('The browser could not play the prepared preview. Retry preparation and check FFmpeg support.');
$('play').onclick=()=>video.paused?video.play().catch(e=>error(e.message)):video.pause();
$('seek').oninput=()=>{video.currentTime=Number($('seek').value);};
$('search').oninput=renderTranscript;$('zoom').oninput=renderTimeline;
$('range-start').onchange=()=>{const start=clamp(Number($('range-start').value),0,doc.source.duration);setSelection(start,Math.max(start,selection[1]));};
$('range-end').onchange=()=>{const end=clamp(Number($('range-end').value),0,doc.source.duration);setSelection(Math.min(selection[0],end),end);};
for(const button of document.querySelectorAll('[data-mark]'))button.onclick=()=>mark(button.dataset.mark);
$('draw').onclick=()=>{drawing=!drawing;pendingRect=null;video.pause();$('draw').textContent=drawing?'Cancel drawing':'Draw visual request';renderOverlay();};
$('request-form').onsubmit=e=>{e.preventDefault();if(!pendingRect)return;checkpoint();const start=selection[1]>selection[0]?selection[0]:clamp(video.currentTime,0,doc.source.duration-.05);const end=selection[1]>selection[0]?selection[1]:Math.min(start+3,doc.source.duration);const value={id:crypto.randomUUID(),text:$('request-text').value.trim(),source_start:start,source_end:end,rect:pendingRect};if(!value.text)return;doc.objects.push(value);selected=value.id;video.currentTime=start;pendingRect=null;$('request-dialog').close();changed();};
$('close-request').onclick=()=>{$('request-dialog').close();pendingRect=null;renderOverlay();};
$('request-dialog').oncancel=()=>{pendingRect=null;renderOverlay();};
let textCheckpoint=false;
$('item-text').onfocus=()=>{textCheckpoint=false;};
$('item-text').oninput=()=>{
  const value=item();if(!value||busy)return;
  const text=$('item-text').value;
  if(value.rect&&!text.trim()){$('save-status').textContent='Visual requests need text';return;}
  if(!textCheckpoint){checkpoint();textCheckpoint=true;}
  value.text=text;changed(false);
};
$('apply-item').onclick=()=>{const value=item();if(!value)return;const start=Number($('item-start').value),end=Number($('item-end').value),text=$('item-text').value.trim();if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>doc.source.duration||value.rect&&!text){error('Use a valid start/end within the recording and text for visual requests.');return;}checkpoint();Object.assign(value,{source_start:start,source_end:end,text});changed();};
$('delete').onclick=()=>{if(!item())return;checkpoint();doc.marks=doc.marks.filter(x=>x.id!==selected);doc.objects=doc.objects.filter(x=>x.id!==selected);selected=null;changed();};
$('undo').onclick=()=>{if(!undo.length||busy)return;redo.push(snapshot());Object.assign(doc,undo.pop());selected=null;changed();};
$('redo').onclick=()=>{if(!redo.length||busy)return;undo.push(snapshot());Object.assign(doc,redo.pop());selected=null;changed();};
for(const id of ['begin','open-button'])$(id).onclick=()=>{$('open-dialog').showModal();};
$('close-open').onclick=()=>$('open-dialog').close();
$('open-form').onsubmit=async e=>{
  e.preventDefault();$('prepare').disabled=true;
  try{await flush();let path=$('path').value.trim(),folder=$('workspace-path').value.trim();const file=$('video-file').files[0];
    if(file){$('job-text').textContent='Copying selected video into local review folder…';const response=await fetch('/api/upload',{method:'POST',headers:{'X-Review-Token':token,'X-Filename':encodeURIComponent(file.name),'Content-Type':'application/octet-stream'},body:file});const result=await response.json();if(!response.ok)throw Error(result.error);path=result.path;folder=result.workspace;$('path').value=path;$('workspace-path').value=folder;$('video-file').value='';}
    if(!path)throw Error('Choose a video or enter its local path.');
    await api('open',{path,workspace:folder||undefined,model:$('model-path').value.trim()||undefined,transcript:$('transcript-path').value.trim()||undefined,source:$('relink-path').value.trim()||undefined});$('open-dialog').close();error('');await poll();
  }catch(e){error(e.message);}finally{$('prepare').disabled=false;}
};
$('retry').onclick=()=>api('retry',{}).then(poll).catch(e=>error(e.message));
$('cancel').onclick=()=>api('cancel',{}).catch(e=>error(e.message));
$('export-button').onclick=()=>$('export-dialog').showModal();$('close-export').onclick=()=>$('export-dialog').close();
$('export-form').onsubmit=async e=>{e.preventDefault();try{await flush();await api('export',{render:$('render-cut').checked});$('export-dialog').close();error('');await poll();}catch(e){error(e.message);}};
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
window.addEventListener('keydown',e=>{if(!doc||busy||document.querySelector('dialog[open]')||['INPUT','TEXTAREA','BUTTON'].includes(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}else if(e.code==='Space'){e.preventDefault();$('play').click();}else if(e.key.toLowerCase()==='i')setSelection(video.currentTime,Math.max(video.currentTime,selection[1]));else if(e.key.toLowerCase()==='o')setSelection(Math.min(selection[0],video.currentTime),video.currentTime);});
function fitStage(){
  if(!doc)return;
  const shell=document.querySelector('.video-shell'), ratio=doc.source.width/doc.source.height;
  const width=Math.min(shell.clientWidth,shell.clientHeight*ratio);
  $('stage').style.width=width+'px';$('stage').style.height=width/ratio+'px';
}
new ResizeObserver(fitStage).observe(document.querySelector('.video-shell'));
window.addEventListener('resize',()=>{fitStage();if(!dragging)renderTimeline();});
async function poll(){
  const state=await api('state');const wasBusy=busy;busy=state.job.busy;
  $('retry').hidden=busy||!state.job.error||!state.last_open;
  $('job-text').textContent=state.job.message;$('cancel').hidden=!busy;$('open-button').disabled=busy;$('begin').disabled=busy;$('export-button').disabled=busy||!doc;
  for(const node of document.querySelectorAll('#editor button,#editor input,#editor textarea'))node.disabled=busy;
  if(state.job.error&&state.job.error!==lastJobError){error(state.job.error);lastJobError=state.job.error;}
  if(!state.job.error)lastJobError=null;
  if(state.job.export&&state.job.export!==lastExport){lastExport=state.job.export;$('export-result').textContent=`Handoff saved to ${lastExport}`;$('export-result').hidden=false;}
  if(state.document&&workspace!==state.workspace&&doc&&dirty){
    error('Another tab opened a different video. Copy your unsaved instructions before reloading this tab.');
    return;
  }
  if(state.document&&(workspace!==state.workspace||!doc)){
    $('export-result').hidden=true;lastExport=state.job.export||null;
    doc=state.document;workspace=state.workspace;$('source-name').textContent=doc.source.path.split(/[\\/]/).pop();selected=null;undo=[];redo=[];dirty=false;selection=[0,0];
    video.src='/media?token='+encodeURIComponent(token)+'&revision='+encodeURIComponent(doc.source.sha256);$('stage').style.aspectRatio=`${doc.source.width}/${doc.source.height}`;$('seek').max=doc.source.duration;
    $('range-start').value=selection[0];$('range-end').value=selection[1];$('path').value=workspace+'/review.json';$('workspace-path').value='';render();fitStage();
  }else if(wasBusy!==busy&&doc)render();
  $('undo').disabled=busy||!undo.length;$('redo').disabled=busy||!redo.length;
}
async function loop(){try{await poll();}catch(e){error(e.message+' — check that the local server is running and open its printed URL.');}setTimeout(loop,800);}
loop();
