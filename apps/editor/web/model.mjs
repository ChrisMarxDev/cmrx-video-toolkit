export const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
export function range(a, b, duration) {
  a = clamp(a, 0, duration); b = clamp(b, 0, duration);
  return a < b ? [a, b] : [b, a];
}
export function moveInterval(item, delta, duration, edge = 'move') {
  const min = Math.min(.05, item.source_end - item.source_start);
  if (edge === 'start') return {...item, source_start: clamp(item.source_start + delta, 0, item.source_end-min)};
  if (edge === 'end') return {...item, source_end: clamp(item.source_end + delta, item.source_start+min, duration)};
  delta = clamp(delta, -item.source_start, duration-item.source_end);
  return {...item, source_start: item.source_start+delta, source_end: item.source_end+delta};
}
export function moveRect(rect, dx, dy, resize=false) {
  return resize ? {...rect, width: clamp(rect.width+dx, .01, 1-rect.x), height: clamp(rect.height+dy, .01, 1-rect.y)} :
    {...rect, x: clamp(rect.x+dx, 0, 1-rect.width), y: clamp(rect.y+dy, 0, 1-rect.height)};
}
export function drawRect(x1,y1,x2,y2) {
  const [x,right]=range(x1,x2,1), [y,bottom]=range(y1,y2,1);
  return {x,y,width:right-x,height:bottom-y};
}
export function conflict(marks) {
  return marks.some(a => a.kind==='good' && marks.some(b => b.kind==='bad' && Math.max(a.source_start,b.source_start)<Math.min(a.source_end,b.source_end)));
}
export function retained(marks, duration) {
  const result=[]; let cursor=0;
  for (const item of marks.filter(m=>m.kind==='bad').sort((a,b)=>a.source_start-b.source_start)) {
    if (item.source_start>cursor) result.push([cursor,item.source_start]);
    cursor=Math.max(cursor,item.source_end);
  }
  if (cursor<duration) result.push([cursor,duration]);
  return result;
}
export function clock(s) {
  return `${Math.floor(s/60)}:${(s%60).toFixed(2).padStart(5,'0')}`;
}
