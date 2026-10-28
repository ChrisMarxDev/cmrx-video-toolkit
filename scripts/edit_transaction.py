"""Recoverable publication of the pipeline's five related edit artifacts.

Readers outside the pipeline must not read while a publication is in progress;
ordinary files cannot provide an atomic multi-file snapshot to arbitrary readers.
"""
import json
import os
from pathlib import Path
import shutil

DIRECTORY = '.edit-update'
ARTIFACTS = ('edit/decisions.json', 'edit/timeline.json',
             'storyboard/annotations.resolved.json', 'transcript/output-segments.json',
             'transcript/output.srt')


def snapshot(project, names):
    return {name: (project/name).read_bytes() if (project/name).exists() else None for name in names}


def check_snapshot(project, expected):
    if snapshot(project, expected) != expected:
        raise ValueError('Project changed while preparing edits; reload and retry')


def save(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('wb') as stream:
        stream.write(content); stream.flush(); os.fsync(stream.fileno())


def replace_file(source, target):
    """Preserve the staged copy so recovery can be retried after interruption."""
    temporary = target.with_name(target.name + '.edit-update-tmp')
    save(temporary, source.read_bytes())
    os.replace(temporary, target)


def set_state(folder, state):
    save(folder/'state.tmp', json.dumps(state).encode())
    os.replace(folder/'state.tmp', folder/'state.json')


def restore(project, folder, state):
    for index, name in enumerate(ARTIFACTS):
        target = project/name
        if state['existed'][index]:
            replace_file(folder/'before'/str(index), target)
        else:
            target.unlink(missing_ok=True)
        target.with_name(target.name+'.edit-update-tmp').unlink(missing_ok=True)


def publish(project, replacements, expected):
    if set(replacements) != set(ARTIFACTS):
        raise ValueError('Edit transaction must publish all five edit artifacts')
    folder = project/DIRECTORY
    try:
        folder.mkdir()
    except FileExistsError as exc:
        raise ValueError('An edit update is active or interrupted; use recover-edits after it stops') from exc
    publishing = False
    try:
        save(folder/'owner.json', json.dumps(dict(pid=os.getpid())).encode())
        check_snapshot(project, expected)
        original = snapshot(project, ARTIFACTS)
        state = dict(version=1, status='prepared', existed=[original[n] is not None for n in ARTIFACTS])
        for index, name in enumerate(ARTIFACTS):
            if original[name] is not None:
                save(folder/'before'/str(index), original[name])
            save(folder/'after'/str(index), replacements[name])
        set_state(folder, state)
        check_snapshot(project, expected)
        publishing = True
        for index, name in enumerate(ARTIFACTS):
            replace_file(folder/'after'/str(index), project/name)
        set_state(folder, {**state, 'status': 'committed'})
    except BaseException:
        if publishing:
            # Preserve journal if rollback itself fails; recover-edits retries it.
            restore(project, folder, state)
        shutil.rmtree(folder)
        raise
    try:
        shutil.rmtree(folder)
    except OSError:
        return True  # Committed successfully; only journal cleanup remains.
    return False


def recover(project):
    folder = project/DIRECTORY
    if not folder.exists():
        return 'No interrupted edit update.'
    owner = folder/'owner.json'
    if not owner.is_file():
        raise ValueError('Edit journal has no owner record; check that no writer is active before removing this empty preparation directory')
    pid = json.loads(owner.read_text())['pid']
    if type(pid) is not int or pid <= 0:
        raise ValueError('Invalid edit journal owner')
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        pass
    except PermissionError:
        raise ValueError('Edit owner may still be running; recovery refused')
    else:
        raise ValueError('Edit owner is still running; recovery refused')
    state_path = folder/'state.json'
    if not state_path.exists():
        shutil.rmtree(folder)
        return 'Removed interrupted preparation; edit files were not changed.'
    state = json.loads(state_path.read_text())
    if (state.get('version') != 1 or state.get('status') not in ('prepared', 'committed') or
            not isinstance(state.get('existed'), list) or len(state['existed']) != len(ARTIFACTS) or
            any(type(v) is not bool for v in state['existed'])):
        raise ValueError('Invalid edit recovery journal; preserved for inspection')
    if state['status'] == 'prepared':
        restore(project, folder, state)
    shutil.rmtree(folder)
    return 'Restored previous edit.' if state['status'] == 'prepared' else 'Completed edit retained; recovery journal removed.'
