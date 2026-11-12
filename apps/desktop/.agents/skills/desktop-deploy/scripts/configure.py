#!/usr/bin/env python3
"""Save an existing Apple app-specific password privately; never create a new one."""
import argparse
import getpass
from pathlib import Path
import subprocess
import deploy_config as local


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dialog', action='store_true', help='Operator uses native local dialogs instead of Terminal')
    args = parser.parse_args()
    config = local.load()
    required = ['profile', 'keychain', 'team_id', 'credentials_file']
    if any(not config.get(key) for key in required):
        parser.error('Initialize the nonsecret private config.json with profile, keychain, team_id and credentials_file first')
    if args.dialog:
        saved = local.read_private(config['credentials_file']) if Path(config['credentials_file']).exists() else {}
        def ask(message, hidden=False, default=''):
            script = 'on run argv\nactivate\ntext returned of (display dialog (item 1 of argv) default answer (item 2 of argv) ' + ('with hidden answer ' if hidden else '') + 'with title "CMRX deployment credentials" buttons {"Cancel", "Save locally"} default button "Save locally")\nend run'
            result = subprocess.run(['osascript', '-e', script, message, default], capture_output=True, text=True)
            if result.returncode:
                raise ValueError('Cancelled; existing saved configuration is unchanged.')
            return result.stdout.strip()
        email = ask('Confirm the Apple Developer account for this password. This stays local.', default=saved.get('apple_id', ''))
        password = ask('Paste your EXISTING app-specific password. Do not create another password. This is saved locally with owner-only permissions so releases can restore the Keychain profile.', True)
    else:
        email = input('Apple Developer account email: ').strip()
        password = getpass.getpass('EXISTING app-specific password (saved privately): ').strip()
    if not email or not password:
        raise ValueError('Empty input; nothing saved.')
    local.save_private(config['credentials_file'], dict(apple_id=email, app_specific_password=password))
    local.restore_profile(config)
    local.ensure_profile(config, lambda *cmd: subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL))
    print('Existing credentials saved privately; explicit Keychain profile validated.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        # No command output/arguments can expose Apple credentials.
        print(str(error) if isinstance(error, ValueError) else 'Apple validation failed; the private saved file is retained for recovery.')
        raise SystemExit(2)
