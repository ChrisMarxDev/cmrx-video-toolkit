#!/usr/bin/env python3
"""Build a branded installer from an already signed/stapled Mac app; never signs it."""
import argparse
import pathlib
import plistlib
import shutil
import subprocess
import tempfile

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--app', required=True, type=pathlib.Path)
p.add_argument('--output', required=True, type=pathlib.Path)
p.add_argument('--icon', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent.parent/'resources/app-icon.icns')
a = p.parse_args()
app, output, icon = a.app.resolve(), a.output.resolve(), a.icon.resolve()
if not app.is_dir() or app.suffix != '.app' or output.exists():
    raise SystemExit('Supply an existing app and a new output DMG path.')
info = plistlib.loads((app/'Contents/Info.plist').read_bytes())
bundle_icon = app/'Contents/Resources'/info['CFBundleIconFile']
if bundle_icon.suffix != '.icns':
    bundle_icon = bundle_icon.with_suffix('.icns')
if bundle_icon.read_bytes() != icon.read_bytes():
    raise SystemExit('App bundle icon does not match the approved installer icon.')
output.parent.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='cmrx-dmg-') as temporary:
    task = pathlib.Path(temporary)
    stage = task/'stage'
    stage.mkdir()
    subprocess.run(['/bin/cp', '-cR', str(app), str(stage/app.name)], check=True)
    (stage/'Applications').symlink_to('/Applications')
    image = task/'writable.dmg'
    subprocess.run(['hdiutil', 'create', '-fs', 'HFS+', '-volname', 'CMRX Chat Editor', '-format', 'UDRW', '-srcfolder', str(stage), str(image)], check=True)
    mount = task/'mount'
    mount.mkdir()
    subprocess.run(['hdiutil', 'attach', '-nobrowse', '-noautoopen', '-readwrite', '-mountpoint', str(mount), str(image)], check=True)
    try:
        shutil.copy2(icon, mount/'.VolumeIcon.icns')
        subprocess.run(['xcrun', 'SetFile', '-a', 'C', str(mount)], check=True)
        subprocess.run(['xcrun', 'SetFile', '-a', 'V', str(mount/'.VolumeIcon.icns')], check=True)
    finally:
        subprocess.run(['hdiutil', 'detach', str(mount)], check=True)
    subprocess.run(['hdiutil', 'convert', str(image), '-format', 'UDZO', '-o', str(output)], check=True)
print(output)
