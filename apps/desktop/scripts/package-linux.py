#!/usr/bin/env python3
"""Build a self-contained Debian/Ubuntu candidate; SDK/cache are builder inputs only."""
import argparse, hashlib, json, os, pathlib, shutil, subprocess, tarfile, urllib.request, zipfile
REPO = pathlib.Path(__file__).resolve().parents[3]
ELECTRON = '43.0.0'
ELECTRON_SHA = '53b5562e17ed87b728e01318fa4e7f9040709eafa8f2e09b327362e6abaf961c'
FLUVIE = '10e442c1bb469118516df3335547f85ec92155e6'
FLUTTER = 'abaf9c523780a608bd46686fd5e53740a07077f8'
def run(*args, **kwargs):
    return subprocess.check_output([str(a) for a in args], **kwargs)
def copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    run('cp', '-a', '--reflink=auto', source, target)
def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', required=True, type=pathlib.Path)
    p.add_argument('--sdk', type=pathlib.Path)
    p.add_argument('--pub-cache', type=pathlib.Path)
    p.add_argument('--finalize-only', action='store_true', help='Recompress an existing staged candidate after local validation')
    a = p.parse_args()
    out = a.output.expanduser().resolve(); out.mkdir(parents=True, exist_ok=True)
    if out == REPO or REPO in out.parents: raise SystemExit('Output must be outside the source checkout')
    if a.finalize_only:
        version=json.loads((out/'payload/opt/cmrx-video-toolkit/resources/app/package.json').read_text())['version']
        finalize(out,version); return
    if not a.sdk or not a.pub_cache: p.error('--sdk and --pub-cache are required for staging')
    sdk = a.sdk.resolve(); cache = a.pub_cache.resolve()
    if run('git', '-C', sdk, 'rev-parse', 'HEAD', text=True).strip() != FLUTTER:
        raise SystemExit('Builder needs the pinned Flutter SDK revision; end users do not install it')
    if run('git', '-C', sdk, 'status', '--porcelain', text=True).strip(): raise SystemExit('SDK has modified source')
    fluvie = cache / 'git' / ('fluvie-' + FLUVIE)
    if run('git', '-C', fluvie, 'rev-parse', 'HEAD', text=True).strip() != FLUVIE: raise SystemExit('Fluvie revision mismatch')
    if run('git', '-C', fluvie, 'status', '--porcelain', text=True).strip(): raise SystemExit('Fluvie has modified source')
    # Rebuild from locked source before staging. No npm/Node is required after installation.
    subprocess.run(['npm','--prefix',str(REPO/'apps/local-editor'),'run','build'],check=True)
    staging = out / 'candidate'
    if staging.exists() or (out/'payload').exists(): raise SystemExit('Candidate directory exists; choose a fresh output folder or --finalize-only')
    staging.mkdir()
    archive = out / f'electron-v{ELECTRON}-linux-x64.zip'
    if not archive.exists(): urllib.request.urlretrieve(f'https://github.com/electron/electron/releases/download/v{ELECTRON}/electron-v{ELECTRON}-linux-x64.zip', archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != ELECTRON_SHA: raise SystemExit('Electron checksum mismatch')
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            dest = staging / info.filename
            if not dest.resolve().is_relative_to(staging): raise SystemExit('Unsafe Electron archive')
            z.extract(info, staging)
            mode = info.external_attr >> 16
            if mode: dest.chmod(mode & 0o777)
    app = staging/'resources/app'; app.mkdir(parents=True)
    paths = run('git','-C',REPO,'ls-files','-z',text=True).split('\0')
    prefixes = ('apps/desktop/src/', 'apps/desktop/resources/', 'apps/desktop/skills/', 'apps/desktop/templates/', 'components/', '.skills/', 'scripts/', 'video_tools/', 'flow/', 'docs/')
    for name in paths:
        if name and (name.startswith(prefixes) or name in ['LICENSE','THIRD_PARTY.md','apps/desktop/package.json','apps/desktop/package-lock.json','apps/local-editor/package.json','apps/local-editor/package-lock.json']):
            source = REPO/name
            if source.is_symlink(): raise SystemExit('Package inputs cannot be symlinks: '+name)
            if source.is_file(): copy(source,app/name)
    copy(REPO/'apps/local-editor/dist',app/'apps/local-editor/dist')
    for package in ['desktop','local-editor']:
        subprocess.run(['npm','ci','--omit=dev','--ignore-scripts'],cwd=app/'apps'/package,check=True)
    version = json.loads((REPO/'apps/desktop/package.json').read_text())['version']
    (app/'package.json').write_text(json.dumps({'name':'cmrx-video-toolkit','version':version,'main':'apps/desktop/src/desktop.cjs'}))
    runtime = app/'runtime'; runtime.mkdir()
    copy(sdk,runtime/'sdk')
    # Normalize SDK Git configuration; never distribute a developer's credential helper/config.
    (runtime/'sdk/.git/config').write_text('[core]\nrepositoryformatversion = 0\nbare = false\n[remote "origin"]\nurl = https://github.com/flutter/flutter.git\n')
    staged_fluvie = runtime/'cache/git'/fluvie.name
    for name in run('git','-C',fluvie,'ls-files','-z',text=True).split('\0'):
        if name and (fluvie/name).is_file(): copy(fluvie/name,staged_fluvie/name)
    # Resolve only the rendering packages, not upstream demo/editor workspaces
    # with unrelated Git dependencies. Package sources remain pinned and intact.
    (runtime/'cache/git'/fluvie.name/'pubspec.yaml').write_text(json.dumps({
        'name':'cmrx_fluvie_runtime','publish_to':'none','environment':{'sdk':'^3.12.0'},
        'workspace':['packages/fluvie','packages/fluvie_lints','packages/fluvie_lints/example','packages/fluvie_cli','packages/fluvie_media','packages/fluvie_validate']
    },indent=2)+'\n')
    for relative in ['.git/logs', '.git/hooks']:
        shutil.rmtree(runtime/'sdk'/relative,ignore_errors=True)
    # Curated public package roots only, never the entire user Pub cache or credentials.
    for directory in ['hosted/pub.dev','hosted-hashes/pub.dev']:
        if (cache/directory).exists(): copy(cache/directory,runtime/'cache'/directory)
    shutil.rmtree(runtime/'cache/hosted/pub.dev/.cache',ignore_errors=True)
    manifest={'schemaVersion':1,'platform':'linux','arch':'x64','flutter':FLUTTER,'fluvie':FLUVIE,'electron':ELECTRON,'source':run('git','-C',REPO,'rev-parse','HEAD',text=True).strip(),'dirty':bool(run('git','-C',REPO,'status','--porcelain',text=True).strip())}
    (runtime/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    # The native installer resolves these system dependencies through its graphical package manager.
    control=out/'control';control.mkdir()
    depends='libgtk-3-0, libnss3, libasound2t64 | libasound2, libgbm1, libxss1, libxtst6, libatspi2.0-0, libcups2t64 | libcups2, libxdamage1, libxfixes3, libxcomposite1, libxrandr2, libxkbcommon0, libdrm2, libgl1, libegl1, libvulkan1, libgl1-mesa-dri, ca-certificates, xdg-utils, pipewire, xdg-desktop-portal, ffmpeg, bubblewrap, clang, cmake, ninja-build, pkg-config, g++, make, git, unzip, xz-utils, python3, fontconfig, libgtk-3-dev'
    installed_kib=(sum(f.stat().st_size for f in staging.rglob('*') if f.is_file())+1023)//1024
    (control/'control').write_text(f'Installed-Size: {installed_kib}\nPackage: cmrx-video-toolkit\nVersion: {version}\nArchitecture: amd64\nMaintainer: CMRX Video Toolkit\nDepends: {depends}\nDescription: Local chat-driven video editing with a bundled Flutter video engine\n')
    (control/'postinst').write_text('#!/bin/sh\nset -e\nchown root:root /opt/cmrx-video-toolkit/chrome-sandbox\nchmod 4755 /opt/cmrx-video-toolkit/chrome-sandbox\n')
    (control/'postinst').chmod(0o755)
    payload=out/'payload'; target=payload/'opt/cmrx-video-toolkit'; target.parent.mkdir(parents=True)
    staging.rename(target)
    launch=target/'cmrx-video-toolkit'
    launch.write_text('#!/bin/sh\nunset ELECTRON_RUN_AS_NODE\nexec "$(dirname "$0")/electron" "$@"\n');launch.chmod(0o755)
    desktop=payload/'usr/share/applications/cmrx-video-toolkit.desktop';desktop.parent.mkdir(parents=True)
    desktop.write_text('[Desktop Entry]\nType=Application\nName=CMRX Video Toolkit\nExec=/opt/cmrx-video-toolkit/cmrx-video-toolkit %F\nIcon=/opt/cmrx-video-toolkit/resources/app/apps/desktop/resources/app-icon.png\nTerminal=false\nCategories=AudioVideo;Video;\n')
    finalize(out,version)
def finalize(out,version):
    control=out/'control'; payload=out/'payload'
    for source,name,mode in [(control,'control.tar.gz','w:gz'),(payload,'data.tar.xz','w:xz')]:
        print('Compressing',name,flush=True)
        with tarfile.open(out/name,mode,**({'preset':1} if mode=='w:xz' else {})) as tar: tar.add(source,arcname='.',filter=lambda i: normalize(i))
    (out/'debian-binary').write_text('2.0\n')
    deb=out/f'cmrx-video-toolkit_{version}_amd64.deb'
    run('ar','r',deb,out/'debian-binary',out/'control.tar.gz',out/'data.tar.xz')
    (out/(deb.name+'.sha256')).write_text(hashlib.file_digest(deb.open('rb'),'sha256').hexdigest()+'  '+deb.name+'\n')
    print(deb)
def normalize(info):
    info.uid=info.gid=0;info.uname=info.gname='root';return info
if __name__=='__main__': main()
