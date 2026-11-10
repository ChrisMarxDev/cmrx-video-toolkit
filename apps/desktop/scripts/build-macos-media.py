#!/usr/bin/env python3
"""Build static macOS FFmpeg tools and a corresponding-source archive (maintainer only)."""
import argparse, hashlib, json, os, pathlib, shutil, subprocess, tarfile, urllib.request
SOURCES = {
 'x264': ('https://code.videolan.org/videolan/x264/-/archive/b35605ace3ddf7c1a5d67a2eb553f034aef41d55/x264-b35605ace3ddf7c1a5d67a2eb553f034aef41d55.tar.gz','cd71a7515b0e9a012e1ac9b1f8415bebcaf6fc97d4db32286642ac4c0fbe24f9','tar.gz'),
 'libvpx': ('https://github.com/webmproject/libvpx/archive/refs/tags/v1.16.0.tar.gz','7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c','tar.gz'),
 'opus': ('https://ftp.osuosl.org/pub/xiph/releases/opus/opus-1.6.1.tar.gz','6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1','tar.gz'),
 'ffmpeg': ('https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz','464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c','tar.xz'),
}
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',required=True,type=pathlib.Path);p.add_argument('--jobs',default=8,type=int);a=p.parse_args()
 if os.uname().sysname!='Darwin' or os.uname().machine!='arm64':raise SystemExit('Build on Apple Silicon macOS')
 out=a.output.resolve();out.mkdir(parents=True,exist_ok=True);prefix=out/'prefix';prefix.mkdir(exist_ok=True);sources=out/'sources';sources.mkdir(exist_ok=True)
 env={**os.environ,'MACOSX_DEPLOYMENT_TARGET':'15.0','CFLAGS':'-mmacosx-version-min=15.0','CXXFLAGS':'-mmacosx-version-min=15.0','LDFLAGS':'-mmacosx-version-min=15.0','PKG_CONFIG_PATH':str(prefix/'lib/pkgconfig')}
 manifest={'minimumOS':'15.0','arch':'arm64','sources':{},'commands':{}}
 configs={
  'x264':['--enable-static','--disable-cli','--disable-opencl'],
  'libvpx':['--target=arm64-darwin24-gcc','--disable-shared','--disable-examples','--disable-tools','--disable-docs','--disable-unit-tests','--enable-vp9-highbitdepth'],
  'opus':['--disable-shared','--enable-static','--disable-doc','--disable-extra-programs'],
  'ffmpeg':['--disable-shared','--enable-static','--disable-autodetect','--disable-doc','--disable-debug','--disable-ffplay','--enable-gpl','--enable-libx264','--enable-libvpx','--enable-libopus','--enable-videotoolbox','--enable-audiotoolbox','--enable-zlib','--pkg-config-flags=--static','--extra-cflags=-mmacosx-version-min=15.0','--extra-ldflags=-mmacosx-version-min=15.0'],
 }
 for name,(url,digest,ext) in SOURCES.items():
  archive=sources/(name+'.'+ext)
  if not archive.exists():urllib.request.urlretrieve(url,archive)
  if hashlib.sha256(archive.read_bytes()).hexdigest()!=digest:raise SystemExit('Checksum mismatch: '+name)
  work=out/name
  if work.exists():raise SystemExit('Build directory exists; choose a fresh output directory: '+str(work))
  work.mkdir()
  subprocess.run(['/usr/bin/tar','-xf',str(archive),'--strip-components=1','-C',str(work)],check=True)
  commands=[['./configure','--prefix='+str(prefix),*configs[name]],['make','-j'+str(a.jobs)],['make','install']]
  manifest['sources'][name]={'url':url,'sha256':digest};manifest['commands'][name]=commands
  for command in commands:
   print(name,command[0],flush=True)
   with (out/(name+'-build.log')).open('a') as log:subprocess.run(command,cwd=work,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
  notices=out/'licenses'/name;notices.mkdir(parents=True)
  for pattern in ['COPYING*','LICENSE*','AUTHORS*','PATENTS*']:
   for f in work.glob(pattern):
    if f.is_file():shutil.copy2(f,notices/f.name)
 for name in ['ffmpeg','ffprobe']:
  f=prefix/'bin'/name
  linked=subprocess.check_output(['otool','-L',str(f)],text=True).splitlines()[1:]
  if any(not l.strip().startswith(('/usr/lib/','/System/')) for l in linked):raise SystemExit('External dynamic library in '+name)
  manifest[name]={'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 # Distribute the complete exact sources and build instructions alongside GPL binaries.
 shutil.copy2(__file__,sources/'build-macos-media.py');shutil.copy2(out/'manifest.json',sources/'manifest.json')
 with tarfile.open(out/'cmrx-media-corresponding-source.tar.gz','w:gz') as tar:tar.add(sources,arcname='cmrx-media-source')
 print(prefix/'bin')
if __name__=='__main__':main()
