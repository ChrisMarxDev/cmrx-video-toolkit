import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('validate_fluvie', Path(__file__).resolve().parents[1] / 'scripts/validate_fluvie.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class ValidationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='validation space ')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        (self.root / 'pubspec.yaml').write_text('name: example\n')
        (self.root / '.dart_tool').mkdir()
        (self.root / '.dart_tool/package_config.json').write_text('{}')
        self.source = self.root / 'video.dart'
        self.source.write_text('Video build() => Video();\n')

    def response(self, diagnostics=(), **overrides):
        errors = any(d['severity'] == 'error' for d in diagnostics)
        data = dict(schemaVersion=1, path=str(self.source), ok=not errors, diagnostics=list(diagnostics))
        data.update(overrides)
        return subprocess.CompletedProcess([], int(errors), json.dumps(data), '')

    def diagnostic(self, severity):
        return dict(severity=severity, message='Finding', code='example_rule', line=3, column=7)

    def test_findings_and_strict_policy(self):
        for severity, strict, expected in [('error', False, 'invalid'), ('warning', False, 'valid'), ('warning', True, 'invalid'), ('info', True, 'valid')]:
            with self.subTest(severity=severity, strict=strict), patch.object(validator.subprocess, 'run', return_value=self.response([self.diagnostic(severity)])):
                result = validator.validate(self.source, strict=strict)
                self.assertEqual(result['status'], expected)
                self.assertEqual(result['diagnostics'][0]['line'], 3)
                self.assertEqual(result['counts'][severity], 1)

    def test_original_paths_and_source_preserved(self):
        before = self.source.read_bytes()
        with patch.object(validator.subprocess, 'run', return_value=self.response()) as run:
            result = validator.validate(self.source)
        self.assertTrue(result['ok'])
        self.assertEqual(run.call_args.args[0], ['fluvie', 'validate', str(self.source), '--project', str(self.root), '--json'])
        self.assertEqual(self.source.read_bytes(), before)
        self.assertNotIn('shell', run.call_args.kwargs)

    def test_failures_never_pass(self):
        for error in [FileNotFoundError('missing CLI'), subprocess.TimeoutExpired('fluvie', 1)]:
            with self.subTest(error=error), patch.object(validator.subprocess, 'run', side_effect=error):
                self.assertEqual(validator.validate(self.source)['status'], 'unavailable')
        responses = [subprocess.CompletedProcess([], 64, 'Unknown command validate', ''),
                     self.response(error='analyzer failed'), self.response(schemaVersion=9),
                     self.response(ok=False), self.response(path='/wrong.dart'),
                     self.response([dict(severity='warning', message='bad')]),
                     subprocess.CompletedProcess([], 1, self.response().stdout, '')]
        for response in responses:
            with self.subTest(response=response), patch.object(validator.subprocess, 'run', return_value=response):
                result = validator.validate(self.source)
                self.assertEqual(result['status'], 'unavailable')
                self.assertFalse(result['ok'])

    def test_missing_dependencies_prevents_process(self):
        (self.root / '.dart_tool/package_config.json').unlink()
        with patch.object(validator.subprocess, 'run') as run:
            result = validator.validate(self.source)
        run.assert_not_called()
        self.assertEqual(result['status'], 'unavailable')
        self.assertIn('flutter pub get', result['error'])

    def test_invalid_input_project_and_timeout(self):
        for kwargs in [dict(path=self.root / 'absent.dart'), dict(path=self.source, project=self.root / 'missing'), dict(path=self.source, timeout=float('nan'))]:
            with patch.object(validator.subprocess, 'run') as run:
                self.assertEqual(validator.validate(**kwargs)['status'], 'unavailable')
                run.assert_not_called()

    def test_json_and_exit_codes(self):
        for response, args, expected in [(self.response(), [], 0), (self.response([self.diagnostic('error')]), [], 1), (self.response([self.diagnostic('warning')]), ['--strict'], 1), (self.response(error='failed'), [], 2)]:
            with patch.object(validator.subprocess, 'run', return_value=response), patch('builtins.print') as output:
                self.assertEqual(validator.main([str(self.source), '--json', *args]), expected)
                self.assertEqual(json.loads(output.call_args.args[0])['ok'], expected == 0)


if __name__ == '__main__':
    unittest.main()
