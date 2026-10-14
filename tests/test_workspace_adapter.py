"""A private workspace can select its own component package without a fork."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class WorkspaceAdapterTests(unittest.TestCase):
    def test_compose_private_package_and_preserve_existing_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            for name in ['edit', 'composition/lib']:
                (p/name).mkdir(parents=True)
            (p/'project.json').write_text(json.dumps({'fps':30,'width':540,'height':960}))
            (p/'edit/timeline.json').write_text(json.dumps({'duration':2,'revision':'fixture'}))
            (p/'edit/cut-manifest.json').write_text(json.dumps({'timeline_revision':'fixture'}))
            env = dict(os.environ, CMRX_COMPONENT_NAME='private_design',
                       CMRX_COMPONENT_PACKAGE=str(p/'private_design'), CMRX_TOKEN_CLASS='PrivateTokens')
            cmd = ['python3',str(ROOT/'scripts/video.py'),'compose',str(p)]
            result = subprocess.run(cmd,env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            main=(p/'composition/lib/main.dart').read_text()
            self.assertIn('package:private_design/private_design.dart',main)
            self.assertIn('PrivateTokens.ink',main)
            self.assertIn(str(p/'private_design'),(p/'composition/pubspec.yaml').read_text())
            self.assertNotEqual(subprocess.run(cmd,env=env,capture_output=True).returncode,0)
            self.assertEqual(main,(p/'composition/lib/main.dart').read_text())
