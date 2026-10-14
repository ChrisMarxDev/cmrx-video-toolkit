import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile


def probe(path):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))


def dimensions(value, count):
    try:
        values = tuple(int(x) for x in value.split(':'))
    except ValueError as exc:
        raise ValueError('Dimensions must be colon-separated integers') from exc
    if len(values) != count or min(values[:2]) <= 0 or any(x < 0 for x in values[2:]):
        raise ValueError('Use positive dimensions and nonnegative coordinates')
    if any(x % 2 for x in values):
        raise ValueError('Use even dimensions and coordinates for video encoding')
    return values


def validate_output(source, output):
    if not source.is_file():
        raise ValueError('Input video does not exist')
    if source.resolve() == output.resolve() or output.exists():
        raise ValueError('Choose a new output path; originals and previous renders are never overwritten')
    output.parent.mkdir(parents=True, exist_ok=True)


def gradient(path, width, height):
    # Portable PPM: no graphics or ML dependency for framing.
    top, bottom = (20, 29, 47), (24, 72, 77)
    with path.open('wb') as f:
        f.write(f'P6\n{width} {height}\n255\n'.encode())
        for y in range(height):
            t = y/max(1,height-1)
            row = bytearray()
            for x in range(width):
                glow = math.exp(-((x/width-.78)**2+(y/height-.24)**2)/.13)
                row.extend(round(min(255, top[c]*(1-t)+bottom[c]*t+glow*(24,14,40)[c])) for c in range(3))
            f.write(row)


def reframe(args):
    w,h = dimensions(args.canvas,2)
    bw,bh,x,y = dimensions(args.box,4)
    if x+bw>w or y+bh>h:
        raise ValueError('Presenter box exceeds canvas')
    info=probe(args.input);v=next(s for s in info['streams'] if s['codec_type']=='video')
    crop=''
    if args.crop:
        cw,ch,cx,cy=dimensions(args.crop,4)
        if cx+cw>v['width'] or cy+ch>v['height']:
            raise ValueError('Crop exceeds input dimensions')
        crop=f'crop={cw}:{ch}:{cx}:{cy},'
    with tempfile.TemporaryDirectory(prefix='video_frame_',dir=args.output.parent) as temp:
        temp=Path(temp); bg=temp/'gradient.ppm';gradient(bg,w,h)
        target=temp/'output.mp4'
        # Fit the source inside the box, keeping alpha if present; never stretch.
        border = args.border_width
        background = (f'drawbox=x={x-border}:y={y-border}:w={bw+2*border}:h={bh+2*border}:color=0x405160:t={border}' if border else 'null')
        vf=(f'[0:v]{background}[bg];'
            f'[1:v]{crop}scale={bw}:{bh}:force_original_aspect_ratio=decrease,format=rgba,setsar=1[fg];'
            f'[bg][fg]overlay=x={x}+({bw}-overlay_w)/2:y={y}+({bh}-overlay_h)/2:shortest=1:format=auto,format=yuv420p[v]')
        subprocess.run(['ffmpeg','-v','error','-nostdin','-loop','1','-framerate',str(args.fps),'-i',str(bg),'-i',str(args.input),
                        '-filter_complex',vf,'-map','[v]','-map','1:a:0?','-c:v','libx264','-preset','fast','-crf','18',
                        '-c:a','copy','-r',str(args.fps),'-movflags','+faststart',str(target)],check=True)
        target.replace(args.output)


def read_frame(stream, size):
    data=bytearray()
    while len(data)<size:
        chunk=stream.read(size-len(data))
        if not chunk: break
        data.extend(chunk)
    if data and len(data)!=size: raise ValueError('Truncated decoded frame')
    return bytes(data)


def cutout(args):
    import numpy as np
    import onnxruntime as ort
    if args.output.suffix.lower()!='.mov': raise ValueError('Cutout output must be .mov (ProRes 4444 with alpha)')
    if not args.model.is_file(): raise ValueError('Missing RVM ONNX model; see video_tools/README.md')
    info=probe(args.input);v=next(s for s in info['streams'] if s['codec_type']=='video')
    w=args.width;h=round(v['height']*w/v['width']/2)*2
    options=ort.SessionOptions();options.intra_op_num_threads=4
    session=ort.InferenceSession(str(args.model),sess_options=options,providers=['CPUExecutionProvider'])
    rec=[np.zeros((1,1,1,1),dtype=np.float32) for _ in range(4)]
    ratio=np.array([args.downsample],dtype=np.float32)
    decode=['ffmpeg','-v','error','-nostdin','-i',str(args.input)]
    if args.seconds: decode+=['-t',str(args.seconds)]
    decode+=['-vf',f'fps={args.fps},scale={w}:{h}','-f','rawvideo','-pix_fmt','rgb24','-']
    with tempfile.TemporaryDirectory(prefix='video_matte_',dir=args.output.parent) as temp:
        target=Path(temp)/'cutout.mov'
        with open(Path(temp)/'decode.log','wb') as log:
            reader=subprocess.Popen(decode,stdout=subprocess.PIPE,stderr=log)
            writer=subprocess.Popen(['ffmpeg','-v','error','-nostdin','-f','rawvideo','-pix_fmt','rgba','-s',f'{w}x{h}',
                                     '-r',str(args.fps),'-i','-','-i',str(args.input),'-map','0:v','-map','1:a:0?',
                                     '-c:v','prores_ks','-profile:v','4','-pix_fmt','yuva444p10le','-c:a','copy',
                                     *(['-t',str(args.seconds)] if args.seconds else []),str(target)],stdin=subprocess.PIPE)
            count=0
            try:
                while raw:=read_frame(reader.stdout,w*h*3):
                    rgb=np.frombuffer(raw,np.uint8).reshape(h,w,3)
                    src=rgb.astype(np.float32).transpose(2,0,1)[None]/255
                    feed={'src':src,'downsample_ratio':ratio,**{f'r{i+1}i':r for i,r in enumerate(rec)}}
                    fgr,pha,*rec=session.run(None,feed)
                    rgba=np.concatenate([fgr[0].transpose(1,2,0),pha[0].transpose(1,2,0)],axis=2)
                    writer.stdin.write((np.clip(rgba,0,1)*255).round().astype(np.uint8).tobytes())
                    count+=1
                    if count%150==0: print(f'Matted {count} frames ({count/args.fps:.1f}s)',flush=True)
                reader.stdout.close();writer.stdin.close()
                if reader.wait() or writer.wait(): raise RuntimeError('FFmpeg matting pipeline failed')
                if not count: raise ValueError('No frames decoded')
            finally:
                for process in (reader,writer):
                    if process.poll() is None: process.terminate();process.wait()
            target.replace(args.output)


def main():
    p=argparse.ArgumentParser(description='Local video tools; new outputs only, original audio preserved when compatible.')
    sub=p.add_subparsers(dest='tool',required=True)
    for name,fn in [('reframe',reframe),('cutout',cutout)]:
        cmd=sub.add_parser(name);cmd.add_argument('input',type=Path);cmd.add_argument('output',type=Path)
        cmd.add_argument('--fps',type=int,default=30);cmd.set_defaults(func=fn)
        if name=='reframe':
            cmd.add_argument('--canvas',default='540:960');cmd.add_argument('--box',default='468:468:36:204');cmd.add_argument('--crop');cmd.add_argument('--border-width',type=int,default=2)
        else:
            cmd.add_argument('--model',type=Path,default=Path('.tools/video-models/rvm_mobilenetv3_fp32.onnx'))
            cmd.add_argument('--width',type=int,default=810);cmd.add_argument('--downsample',type=float,default=.5)
            cmd.add_argument('--seconds',type=float)
    args=p.parse_args()
    if not 1<=args.fps<=120: p.error('fps must be between 1 and 120')
    if args.tool=='cutout' and (args.width<32 or args.width%2 or not 0<args.downsample<=1 or (args.seconds is not None and (not math.isfinite(args.seconds) or args.seconds<=0))):
        p.error('Use even width >=32, downsample in (0,1], and positive finite seconds')
    if args.tool=='reframe' and args.border_width<0: p.error('border-width must be nonnegative')
    validate_output(args.input,args.output)
    args.func(args)
    metadata={k:str(v) if isinstance(v,Path) else v for k,v in vars(args).items() if k!='func'}
    if args.tool=='cutout':
        metadata.update(model_sha256=hashlib.sha256(args.model.read_bytes()).hexdigest(),model_source='https://github.com/PeterL1n/RobustVideoMatting',license='GPL-3.0 (upstream)',quality='ML estimate: review hair, hands and temporal stability')
    metadata['source']=dict(path=str(args.input.resolve()),size=args.input.stat().st_size,mtime_ns=args.input.stat().st_mtime_ns)
    args.output.with_suffix(args.output.suffix+'.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(args.output)

if __name__=='__main__':
    main()
