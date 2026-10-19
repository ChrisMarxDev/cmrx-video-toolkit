#!/usr/bin/env python3
"""Agent-operated local desktop test setup; not a distributable installer."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--entry', type=Path, default=Path(__file__).with_name('mcp.mjs'))
    parser.add_argument('--destination', type=Path, default=Path.home() / '.local/share/video-review-local-plugin')
    args = parser.parse_args()
    root, entry = args.root.resolve(strict=True), args.entry.resolve(strict=True)
    package = Path(__file__).resolve().parent
    executables = {name: shutil.which(name) for name in ('node', 'npm', 'codex', 'ffmpeg', 'ffprobe')}
    missing = [name for name, path in executables.items() if not path]
    if missing:
        parser.error('Agent must provision missing prerequisites before installation: ' + ', '.join(missing))
    subprocess.run([executables['node'], '--input-type=module', '-e',
                    'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'], check=True)
    if not (package / 'node_modules/@modelcontextprotocol/sdk/package.json').is_file():
        subprocess.run([executables['npm'], 'ci', '--prefix', str(package)], check=True)
    destination = args.destination.expanduser().resolve()
    marker = destination / '.video-review-managed'
    if destination.exists() and not marker.exists():
        parser.error('Refusing to overwrite an unmanaged plugin directory')
    destination.mkdir(parents=True, exist_ok=True)
    marker.touch()
    plugin = destination / 'plugins/video-review'
    skill = plugin / 'skills/video-review'
    skill.mkdir(parents=True, exist_ok=True)
    def write(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2) + '\n')
    write(plugin / 'plugin.json', {
        'name': 'video-review', 'version': '0.1.0',
        'description': 'Open the local video review app, wait for human Done, and read saved annotations.',
        'extensions': {'com.openai': {'requires_local_executor': True,
            'interface': {'displayName': 'Video Review', 'shortDescription': 'Review a local recording in chat'}}}})
    write(plugin / 'mcp.json', {
        'mcpServers': {'video-review': {'type': 'stdio', 'command': executables['node'],
            'args': [str(entry), '--root', str(root)],
            'env': {'PYTHON': sys.executable, 'PATH': os.environ.get('PATH', '')}}}})
    # Codex versions predating portable manifests still need explicit discovery.
    write(plugin / '.codex-plugin/plugin.json', {
        'name': 'video-review', 'version': '0.1.0',
        'description': 'Review a local recording and return human-approved annotations.',
        'skills': './skills/', 'mcpServers': './.mcp.json',
        'interface': {'displayName': 'Video Review', 'shortDescription': 'Review a local recording in chat'}})
    shutil.copyfile(plugin / 'mcp.json', plugin / '.mcp.json')
    instructions = (package.parent.parent / '.skills/video-review/SKILL.md').read_text()
    instructions += f'''\n## This local installation\n\nThe configured review root is `{root}`. Resolve requested relative video paths\nagainst it. The toolkit source is `{package.parent.parent}`; resolve skill\nreferences there. Use this plugin's open_review and get_review tools, not the old\nopen_review_sample demo. Omit path to let the user select a recording in the editor. Keep\nnew review workspaces in an ignored project folder within the configured root.\nNo upload or tunnel is needed for this local desktop installation. If tools are\nmissing after installation, ask the user to restart the desktop app and open a\nnew session; never ask them to run a terminal command.\n'''
    (skill / 'SKILL.md').write_text(instructions)
    write(destination / '.agents/plugins/marketplace.json', {
        'name': 'video-review-local',
        'interface': {'displayName': 'Local Video Review'},
        'plugins': [{'name': 'video-review',
            'source': {'source': 'local', 'path': './plugins/video-review'},
            'policy': {'installation': 'AVAILABLE', 'authentication': 'ON_INSTALL'},
            'category': 'Productivity'}]})
    subprocess.run([executables['codex'], 'plugin', 'marketplace', 'add', str(destination)], check=True)
    subprocess.run([executables['codex'], 'plugin', 'add', 'video-review@video-review-local'], check=True)
    installed = subprocess.run([executables['codex'], 'mcp', 'get', 'video-review', '--json'],
                               check=True, capture_output=True, text=True)
    if not json.loads(installed.stdout).get('enabled'):
        raise RuntimeError('Plugin installed but its review server is not enabled')
    print('Installed local Video Review plugin. Restart ChatGPT desktop and start a new local session.')


if __name__ == '__main__':
    main()
