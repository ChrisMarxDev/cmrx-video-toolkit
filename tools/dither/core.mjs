export function bayer(x, y, order) {
  let value = 0, denominator = 1;
  for (let n = order; n > 1; n /= 2) {
    const bx = x % 2, by = y % 2;
    value = value * 4 + 2 * ((bx + by) % 2) + by;
    denominator *= 4; x = Math.floor(x / 2); y = Math.floor(y / 2);
  }
  return (value + .5) / denominator;
}
export function render({width, height, cell, order, background, foreground, contrast, bias, invert, shape, phase, source}) {
  if (![width,height,cell].every(Number.isInteger) || width < 16 || height < 16 || width > 4096 || height > 4096 || width*height > 8000000 || cell < 1 || cell > 24) throw Error('Use dimensions 16–4096, at most 8 million pixels, and a cell size of 1–24.');
  if (![2,4,8].includes(order) || ![contrast,bias,phase].every(Number.isFinite)) throw Error('Invalid texture settings.');
  if (source && source.length !== width*height*4) throw Error('Image dimensions do not match.');
  const rgb = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const back=rgb(background), front=rgb(foreground), data=new Uint8ClampedArray(width*height*4);
  const scale=Math.min(width,height);
  for(let cy=0;cy<Math.ceil(height/cell);cy++) for(let cx=0;cx<Math.ceil(width/cell);cx++) {
    const sx=Math.min(width-1,Math.floor((cx+.5)*cell)), sy=Math.min(height-1,Math.floor((cy+.5)*cell));
    const u=(sx-width/2)/scale,v=(sy-height/2)/scale;
    let density;
    if(source){const i=(sy*width+sx)*4; density=(source[i]*.2126+source[i+1]*.7152+source[i+2]*.0722)/255;}
    else if(shape==='sphere'){const x=u*2.6,y=v*2.6,r=x*x+y*y;const lx=.6*Math.cos(phase),ly=-.65,lz=.8;density=r<1 ? .12+.83*Math.max(0,(x*lx+y*ly+Math.sqrt(1-r)*lz)/Math.hypot(lx,ly,lz)):0;}
    else if(shape==='ripple')density=.5+.45*Math.sin(Math.hypot(u,v)*24-phase*2);
    else if(shape==='ramp')density=.5+u*Math.cos(phase)+v*Math.sin(phase);
    else if(shape==='solid')density=.5;
    else density=.5+.28*Math.sin(u*9+Math.sin(v*6+phase)*1.6+phase);
    if(invert)density=1-density;
    density=Math.max(0,Math.min(1,(density-.5)*contrast+.5+bias));
    const color=density>=bayer(cx,cy,order)?front:back;
    for(let y=cy*cell;y<Math.min(height,(cy+1)*cell);y++)for(let x=cx*cell;x<Math.min(width,(cx+1)*cell);x++){
      const i=(y*width+x)*4;data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];data[i+3]=source?source[i+3]:255;
    }
  }
  return data;
}
