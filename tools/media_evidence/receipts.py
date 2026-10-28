"""Bind an actual render to authored files; never infer freshness from its filename."""
import os
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import url2pathname
from .common import digest, identity, read, sha, write


EXCLUDED = {'.git', '.dart_tool', '.fluvie', 'build', 'renders', 'review', 'capture', 'captures', 'node_modules', '__pycache__', '.venv', '.tools'}


def tree_files(root, ancestors=()):
    root = Path(root)
    if not root.exists():
        return {}
    resolved = root.resolve()
    if resolved in ancestors:
        raise ValueError(f'Circular resource link: {root}')
    ancestors = (*ancestors, resolved)
    result = {}
    for current, directories, filenames in os.walk(root, followlinks=False):
        directories[:] = sorted(d for d in directories if d not in EXCLUDED)
        for name in list(directories):
            p = Path(current)/name
            if p.is_symlink():
                directories.remove(name)
                for key, value in tree_files(p.resolve(), ancestors).items():
                    result[str(p.relative_to(root)/key)] = value
        for name in sorted(filenames):
            p = Path(current)/name
            if p.is_file():
                result[str(p.relative_to(root))] = sha(p)
    return result


def composition_identity(project):
    root = Path(project).resolve()
    if not (root/'pubspec.yaml').is_file():
        raise ValueError('Composition must be a Flutter project')
    # Include all authored resource directories, not just lib: custom components,
    # fonts, shaders and arbitrary declared assets retain their own implementation.
    files = tree_files(root)
    packages = {}
    config = root/'.dart_tool/package_config.json'
    if config.is_file():
        files['.dart_tool/package_config.json'] = sha(config)
        for package in read(config)['packages']:
            uri = urlparse(package['rootUri'])
            if uri.scheme not in ('', 'file'):
                raise ValueError('Unsupported package URI in composition fingerprint')
            path = Path(url2pathname(uri.path) if uri.scheme == 'file' else unquote(uri.path))
            path = (config.parent/path).resolve()
            if path == root:
                continue
            # Resolved package source and resources capture path-based custom
            # components as well as locked dependencies without copying them.
            entries = tree_files(path)
            packages[package['name']] = dict(path=str(path), digest=digest(entries))
    extra = {}
    settings = read(root/'fluvie.json') if (root/'fluvie.json').exists() else {}
    inputs = settings.get('evidenceInputs', [])
    if not isinstance(inputs, list) or any(not isinstance(p, str) for p in inputs):
        raise ValueError('fluvie.json evidenceInputs must be a list of local paths')
    for item in inputs:
        path = (root/Path(item).expanduser()).resolve()
        if not path.exists():
            raise ValueError(f'Missing evidence input: {path}')
        extra[str(path)] = digest(tree_files(path)) if path.is_dir() else sha(path)
    return dict(path=str(root), sha256=digest(dict(files=files, packages=packages, extra=extra)))


def create(render, composition, timeline, before, destination, source_sha256):
    after = composition_identity(composition)
    if before != after:
        raise ValueError('Composition changed while rendering; no current-render receipt written')
    receipt = dict(format='composition-render', version=1, render=identity(render),
                   composition=after, timeline_revision=timeline['revision'], timeline_sha256=digest(timeline),
                   time_base='output', source_sha256=source_sha256)
    write(destination, receipt)
    return receipt


def verify(receipt, render, composition, timeline):
    r = read(receipt)
    if r.get('format') != 'composition-render' or r.get('version') != 1 or r.get('time_base') != 'output':
        raise ValueError('Expected a composition-render receipt from a successful pipeline render')
    if r['render']['sha256'] != sha(render) or r['timeline_sha256'] != digest(timeline):
        raise ValueError('Render/timeline receipt is stale')
    if r['composition'] != composition_identity(composition):
        raise ValueError('Composition/custom-component inputs changed; use live Fluvie preview or render again')
    return r
