"""Private maintainer configuration; never print credential contents."""
import json
import os
from pathlib import Path
import pty
import select
import signal
import subprocess
import termios
import time

ROOT = Path.home() / 'Library/Application Support/CMRX Deployment'
CONFIG = ROOT / 'config.json'


def read_private(path):
    path = Path(path)
    if path.is_symlink() or path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
        raise ValueError('Deployment file must be owned by you, not symlinked, and mode 600: ' + str(path))
    return json.loads(path.read_text())


def save_private(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + '.new')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, indent=2)
            stream.write('\n')
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def load():
    return read_private(CONFIG) if CONFIG.exists() else {}


def restore_profile(config):
    """Restore from the operator-authorized private backup, without password argv/logs."""
    credentials = read_private(config['credentials_file'])
    password = credentials['app_specific_password']
    child, master = pty.fork()
    if child == 0:
        os.execvp('xcrun', ['xcrun', 'notarytool', 'store-credentials', config['profile'],
                          '--apple-id', credentials['apple_id'], '--team-id', config['team_id'],
                          '--keychain', config['keychain']])
    sent = False
    result = None
    output = b''
    deadline = time.monotonic() + 180
    try:
        while time.monotonic() < deadline:
            if select.select([master], [], [], .5)[0]:
                try:
                    output = (output + os.read(master, 8192))[-16384:]
                except OSError:
                    break
                if not sent and b'app-specific password for ' in output.lower():
                    attr = termios.tcgetattr(master)
                    attr[3] &= ~termios.ECHO
                    termios.tcsetattr(master, termios.TCSANOW, attr)
                    os.write(master, (password + '\n').encode())
                    sent = True
            done, status = os.waitpid(child, os.WNOHANG)
            if done:
                result = os.waitstatus_to_exitcode(status)
                break
        if result is None:
            done, status = os.waitpid(child, os.WNOHANG)
            if not done:
                os.kill(child, signal.SIGTERM)
                _, status = os.waitpid(child, 0)
            result = os.waitstatus_to_exitcode(status)
        if result or not sent:
            raise ValueError('Saved notarization credentials could not be validated; no credential output was logged.')
    finally:
        os.close(master)
        output = b''


def ensure_profile(config, execute):
    args = ('xcrun', 'notarytool', 'history', '--keychain-profile', config['profile'],
            '--keychain', config['keychain'], '--output-format', 'json')
    try:
        execute(*args)
    except subprocess.CalledProcessError as error:
        if error.returncode != 69 or not Path(config.get('credentials_file', '/nonexistent')).is_file():
            raise
        restore_profile(config)
        execute(*args)
