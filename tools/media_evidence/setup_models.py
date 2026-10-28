"""Explicit, checksummed model download. No downloads during inference."""
import argparse
from pathlib import Path
import tempfile
import urllib.request
from .common import entrypoint, read, sha


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--models', type=Path, required=True)
    a = p.parse_args(); a.models.mkdir(parents=True, exist_ok=True)
    for name, spec in read(Path(__file__).with_name('models.json')).items():
        target = a.models / name
        if target.exists():
            if sha(target) != spec['sha256']:
                raise ValueError(f'Existing model has wrong checksum: {target}; move it before retrying')
            continue
        with tempfile.TemporaryDirectory(dir=a.models) as temp:
            download = Path(temp) / name
            urllib.request.urlretrieve(spec['url'], download)
            if sha(download) != spec['sha256']:
                raise ValueError(f'Model checksum mismatch: {name}')
            # Avoid replacing an asset another process downloaded concurrently.
            try:
                target.hardlink_to(download)
            except FileExistsError:
                if sha(target) != spec['sha256']:
                    raise ValueError(f'Conflicting model: {target}')
        print(target)


if __name__ == '__main__':
    entrypoint(main)
