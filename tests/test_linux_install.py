"""Linux package/dispatch contracts; never invoke a real package manager."""
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/install/linux.sh'


class LinuxInstallTests(unittest.TestCase):
    def shell(self, code):
        return subprocess.run(['bash', '-c', 'script=$1; shift; source "$script"; '+code,
                               'test', str(SCRIPT)], text=True, capture_output=True)

    def test_packages_already_installed_skip_sudo(self):
        for manager, probe in [('apt', 'dpkg-query() { echo "install ok installed"; };'),
                               ('dnf', 'rpm() { return 0; };'),
                               ('pacman', 'pacman() { return 0; };')]:
            r = self.shell('MANAGER='+manager+'; '+probe+
                           'sudo() { echo UNEXPECTED; return 99; }; packages clang cmake')
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertNotIn('UNEXPECTED', r.stdout)

    def test_check_mode_never_installs_missing_package(self):
        r = self.shell('MANAGER=apt; CHECK_ONLY=1; dpkg-query() { return 1; }; '
                       'sudo() { echo UNEXPECTED; }; packages clang')
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('Missing system packages: clang', r.stderr)
        self.assertNotIn('UNEXPECTED', r.stdout)

    def test_only_missing_packages_are_installed(self):
        r = self.shell('MANAGER=apt; dpkg-query() { [[ "$*" == *cmake ]] && return 1; '
                       'echo "install ok installed"; }; sudo() { printf "PRIVILEGED %s\\n" "$*"; }; '
                       'packages clang cmake; packages clang cmake')
        self.assertEqual(r.returncode, 0, r.stderr)
        calls = [line for line in r.stdout.splitlines() if line.startswith('PRIVILEGED')]
        self.assertEqual(calls.count('PRIVILEGED apt-get update'), 1)
        self.assertEqual(calls.count('PRIVILEGED apt-get install -y --no-install-recommends cmake'), 2)
        self.assertFalse(any('clang' in call for call in calls))

    def test_arch_never_refreshes_without_full_upgrade(self):
        r = self.shell('MANAGER=pacman; pacman() { return 1; }; '
                       'sudo() { printf "PRIVILEGED %s\\n" "$*"; }; packages clang')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('pacman -S --needed --noconfirm clang', r.stdout)
        self.assertNotIn('-Sy', r.stdout)

    def test_existing_tools_skip_downloads(self):
        r = self.shell('node() { return 0; }; npm() { return 0; }; '
                       'flutter() { return 0; }; flutter_ok() { return 0; }; '
                       'whisper-cli() { return 0; }; '
                       'run() { echo UNEXPECTED; return 99; }; '
                       'install_node; install_flutter; install_whisper')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn('UNEXPECTED', r.stdout)

    @unittest.skipIf(getattr(os, 'geteuid', lambda: 1)() == 0, 'main intentionally refuses root')
    def test_main_keeps_selected_fvm_sdk_before_managed_sdk(self):
        with tempfile.TemporaryDirectory(prefix='fvm fixture ') as d:
            root = Path(d)
            selected = root / 'fvm/default/bin'
            managed = root / 'managed/flutter/bin'
            for folder in (selected, managed):
                folder.mkdir(parents=True)
                tool = folder / 'flutter'
                tool.write_text('#!/bin/sh\nexit 0\n'); tool.chmod(0o755)
            r = self.shell('STATE='+shlex.quote(str(root / 'managed'))+'; '
                'PATH='+shlex.quote(str(selected))+':/usr/bin:/bin; CHECK_ONLY=1; '
                'uname() { if [[ "$1" == -m ]]; then echo x86_64; else echo Linux; fi; }; ldd() { echo glibc; }; '
                'select_manager() { :; }; base_packages() { :; }; native_packages() { :; }; ffmpeg_ok() { return 0; }; '
                'install_python() { PYTHON=/usr/bin/true; }; install_node() { :; }; '
                'node() { :; }; npm() { :; }; flutter_ok() { return 0; }; '
                'install_whisper() { :; }; finish_install() { command -v flutter; }; main')
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn(str(selected / 'flutter'), r.stdout)
            self.assertNotIn(str(managed / 'flutter'), r.stdout)

    def test_dispatch_preserves_arguments_and_exit_code(self):
        with tempfile.TemporaryDirectory(prefix='installer space ') as d:
            root = Path(d)
            shutil.copy(ROOT / 'install.sh', root / 'install.sh')
            (root / 'scripts/install').mkdir(parents=True)
            (root / 'bin').mkdir()
            for target in ['macos', 'linux']:
                (root / ('scripts/install/'+target+'.sh')).write_text(
                    '#!/bin/bash\nprintf "'+target+':%s\\n" "$1"\nexit 17\n')
            for system, target in [('Darwin', 'macos'), ('Linux', 'linux'), ('FreeBSD', None)]:
                stub = root / 'bin/uname'; stub.write_text('#!/bin/sh\necho '+system+'\n'); stub.chmod(0o755)
                r = subprocess.run(['bash', str(root / 'install.sh'), 'argument with spaces'],
                    env={**os.environ, 'PATH': str(root / 'bin')+':'+os.environ['PATH']},
                    text=True, capture_output=True)
                self.assertEqual(r.returncode, 17 if target else 2)
                if target: self.assertIn(target+':argument with spaces', r.stdout)
                else: self.assertIn('Unsupported platform', r.stderr)


if __name__ == '__main__':
    unittest.main()
