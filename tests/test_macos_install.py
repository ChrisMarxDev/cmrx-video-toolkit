"""Installer contract checks without installing anything on the test machine."""
import os
from pathlib import Path
import subprocess
import tempfile
import sys
import shlex
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/install/macos.sh'


class MacInstallTests(unittest.TestCase):
    def shell(self, code, **kwargs):
        return subprocess.run(['bash', '-c', 'script=$1; shift; source "$script"; ' + code, 'test', str(SCRIPT)],
                              text=True, capture_output=True, **kwargs)

    def test_help_and_bad_argument(self):
        for flag, status in [('--help', 0), ('--unknown', 2)]:
            r = subprocess.run(['bash', str(SCRIPT), flag], capture_output=True, text=True)
            self.assertEqual(r.returncode, status, r.stderr)

    def test_non_mac_never_installs(self):
        r = self.shell('uname() { echo Linux; }; main')
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('macOS only', r.stderr)
        self.assertNotIn('brew install', r.stdout)

    def test_failure_contains_recovery_command_and_status(self):
        r = self.shell('STEP=example; HINT="repair network"; run bash -c "exit 17"')
        self.assertEqual(r.returncode, 17)
        self.assertIn('Command: bash -c', r.stderr)
        self.assertNotIn('Command: \"$@\"', r.stderr)
        for value in ['Step: example', 'Exit code: 17', 'Command:', 'repair network', 'Retry:', 'Log:']:
            self.assertIn(value, r.stderr)

    def test_manual_failure_contains_log_and_retry(self):
        r = self.shell('LOG=/tmp/example; fail "missing tool"')
        self.assertIn('Log: /tmp/example', r.stderr)
        self.assertIn('Retry:', r.stderr)

    def test_node_reuses_only_compatible_runtime(self):
        with tempfile.TemporaryDirectory(prefix='cmrx space ') as d:
            candidate = Path(d) / 'node'
            for status in [0, 1]:
                candidate.write_text('#!/bin/sh\nexit '+str(status)+'\n'); candidate.chmod(0o755)
                r = self.shell('node_ok "$CANDIDATE"', env={**os.environ, 'CANDIDATE': str(candidate)})
                self.assertEqual(r.returncode, status)

    def test_ffmpeg_checks_features_and_probe(self):
        for encoders, status in [('libx264 aac prores_ks', 0), ('aac', 1)]:
            r = self.shell('ffmpeg() { echo "$ENCODERS"; }; ffprobe() { return 0; }; ffmpeg_ok',
                           env={**os.environ, 'ENCODERS': encoders})
            self.assertEqual(r.returncode, status)

    def test_brew_formula_is_not_reinstalled_on_retry(self):
        r = self.shell('brew_ready() { BREW=fakebrew; }; fakebrew() { '
                       'case "$1" in list) return 0;; --prefix) echo /tmp/tool;; '
                       '*) echo UNEXPECTED >&2; return 99;; esac; }; formula python@3.13')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('Already installed', r.stdout)
        self.assertNotIn('UNEXPECTED', r.stderr)

    def test_cold_flutter_bootstrap_output_does_not_reject_sdk(self):
        output = shlex.quote('{"dartSdkVersion":"3.13.7"}')
        r = self.shell('PYTHON='+shlex.quote(sys.executable)+'; '
            'fake_flutter() { echo "Resolving dependencies..."; echo '+output+'; }; '
            'flutter_ok fake_flutter')
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_flutter_reports_incompatible_or_missing_machine_data(self):
        for output in ['{"dartSdkVersion":"3.10.0"}', 'SDK download failed']:
            r = self.shell('PYTHON='+shlex.quote(sys.executable)+'; '
                'fake_flutter() { echo '+shlex.quote(output)+'; }; flutter_ok fake_flutter')
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('3.10.0' if '3.10' in output else 'SDK download failed', r.stderr)

    def test_fluvie_requires_validate_and_render_capabilities(self):
        r = self.shell('fake() { if [[ "$1" == render ]]; then echo "--toolchain --no-download --machine"; '
                       'else echo --json; fi; }; fluvie_ok fake')
        self.assertEqual(r.returncode, 0, r.stderr)
        r = self.shell('fake() { echo "--toolchain --machine"; }; fluvie_ok fake')
        self.assertNotEqual(r.returncode, 0)


if __name__ == '__main__':
    unittest.main()
