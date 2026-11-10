#!/usr/bin/env python3
"""Install a reversible user launcher for this source checkout, without sudo."""
from pathlib import Path
import os

root = Path(__file__).resolve().parents[1]
launcher = root / 'scripts/run.sh'
escaped = str(launcher).replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$')
icon = root / 'resources/app-icon.png'
destination = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share'))) / 'applications/cmrx-chat-editor-experiment.desktop'
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(f'''[Desktop Entry]
Type=Application
Name=CMRX Chat Editor (Experiment)
Comment=Edit local videos by chatting with your subscription
Exec="{escaped}"
Icon={icon}
Terminal=false
Categories=AudioVideo;Video;
''')
print(f'Installed {destination}')
