#!/usr/bin/env python3
"""Submit once, check once, and staple accepted artifacts. No credentials in state."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import deploy_config


def digest(path):
    with open(path, 'rb') as stream:
        result = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
        return result.hexdigest()


def save(path, state):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    os.replace(temporary, path)


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def advance(state, artifact, profile, persist, execute=run, submission_id=None):
    """artifact is a signed ZIP or DMG; ZIP stapling target is recorded separately."""
    current = digest(artifact)
    if state and (state['artifact'] != str(artifact) or state['sha256'] != current):
        raise ValueError('Artifact path/bytes changed; retain this receipt and use a new state file.')
    if not state:
        state.update(artifact=str(artifact), sha256=current, phase='ready')
        persist(state)
    if state['phase'] == 'complete':
        execute('xcrun', 'stapler', 'validate', state['target'])
        return state
    if submission_id:
        if state.get('id') and state['id'] != submission_id:
            raise ValueError('Submission ID differs from recorded submission.')
        # Query before adopting; Apple binds this ID to the original uploaded bytes.
        info = json.loads(execute('xcrun', 'notarytool', 'info', submission_id,
                                 '--keychain-profile', profile, '--output-format', 'json'))
        if info['id'] != submission_id:
            raise ValueError('Apple returned a different submission ID.')
        state.update(id=submission_id, phase='submitted')
        persist(state)
    if not state.get('id'):
        if state['phase'] == 'submitting':
            raise ValueError('Submission outcome unknown. Inspect notarytool history, then adopt its ID with --submission-id; do not resubmit.')
        # Fail fast for absent/invalid authentication BEFORE creating a submission.
        execute('xcrun', 'notarytool', 'history', '--keychain-profile', profile, '--output-format', 'json')
        state['phase'] = 'submitting'
        persist(state)  # Crash/timeout guard: a retry never repeats submit blindly.
        result = json.loads(execute('xcrun', 'notarytool', 'submit', str(artifact),
                                    '--keychain-profile', profile, '--output-format', 'json'))
        state.update(id=result['id'], phase='submitted')
        persist(state)
    info = json.loads(execute('xcrun', 'notarytool', 'info', state['id'],
                              '--keychain-profile', profile, '--output-format', 'json'))
    state['status'] = info['status']
    persist(state)
    if info['status'] == 'In Progress':
        return state
    if info['status'] != 'Accepted':
        raise ValueError('Apple status: ' + info['status'] + '. Fetch notarytool log for ' + state['id'] + '; do not resubmit unchanged bytes.')
    target = state['target']
    # Recovery if a previous staple succeeded immediately before interruption.
    try:
        execute('xcrun', 'stapler', 'validate', target)
    except subprocess.CalledProcessError:
        execute('xcrun', 'stapler', 'staple', target)
        execute('xcrun', 'stapler', 'validate', target)
    if str(artifact) == target:
        state['sha256'] = digest(artifact)  # Stapling changes the DMG bytes.
    state['phase'] = 'complete'
    persist(state)
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact', required=True, type=Path)
    parser.add_argument('--target', required=True, type=Path, help='App.app for a ZIP, or the same DMG')
    parser.add_argument('--state', required=True, type=Path)
    config = deploy_config.load()
    parser.add_argument('--profile', default=config.get('profile'), help='Existing Keychain profile; defaults to private deployment config')
    parser.add_argument('--keychain', default=config.get('keychain'), help='Explicit Keychain path')
    parser.add_argument('--submission-id', help='Recover an already submitted artifact; verify its identity in history first')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('Requires macOS')
    artifact, target, receipt = args.artifact.resolve(), args.target.resolve(), args.state.resolve()
    if not artifact.is_file() or not target.exists():
        parser.error('Artifact and stapling target must exist')
    if artifact.suffix not in ('.zip', '.dmg') or (artifact.suffix == '.dmg' and artifact != target) or (artifact.suffix == '.zip' and target.suffix != '.app'):
        parser.error('Use ZIP + App.app, or DMG + same DMG')
    if not args.profile or not args.profile.strip():
        parser.error('An existing Keychain profile name is required')
    run('codesign', '--verify', '--deep', '--strict', str(target))
    signature = subprocess.check_output(['codesign', '--display', '--verbose=4', str(target)], stderr=subprocess.STDOUT, text=True)
    cdhash = next((line for line in signature.splitlines() if line.startswith('CDHash=')), None)
    if not cdhash:
        parser.error('Target lacks a signed code identity')
    receipt.parent.mkdir(parents=True, exist_ok=True)
    with open(str(receipt) + '.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error('Another notarization command owns this state file')
        state = json.loads(receipt.read_text()) if receipt.exists() else {}
        if state and state.get('target') != str(target):
            parser.error('Stapling target differs from recorded target')
        if state and state.get('cdhash') != cdhash:
            parser.error('Signed target differs from the recorded target')
        if not state:
            state = dict(artifact=str(artifact), sha256=digest(artifact), phase='ready', target=str(target), cdhash=cdhash)
            save(receipt, state)
        def execute(*command):
            if command[:2] == ('xcrun', 'notarytool') and args.keychain:
                command += ('--keychain', args.keychain)
            return run(*command)
        if state.get('phase') != 'complete' and config and args.profile == config.get('profile') and args.keychain == config.get('keychain'):
            deploy_config.ensure_profile(config, run)
        result = advance(state, artifact, args.profile, lambda value: save(receipt, value), execute, submission_id=args.submission_id)
        print(json.dumps(result, indent=2))
        return 3 if result['phase'] != 'complete' else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
