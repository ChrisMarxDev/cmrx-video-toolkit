import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import deploy_config as local


class PrivateConfigTests(unittest.TestCase):
    def test_private_write_roundtrip_and_refuse_world_readable(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder)/'credentials.json'
            local.save_private(file, {'test': 'private fixture'})
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            self.assertEqual(local.read_private(file)['test'], 'private fixture')
            file.chmod(0o644)
            with self.assertRaises(ValueError): local.read_private(file)

    def test_symlink_is_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'file'; link=Path(folder)/'link'
            local.save_private(file, {})
            link.symlink_to(file)
            with self.assertRaises(ValueError): local.read_private(link)

    def test_valid_profile_does_not_read_or_restore_backup(self):
        calls=[]
        with patch.object(local,'restore_profile') as restore:
            local.ensure_profile(dict(profile='profile',keychain='/keychain'), lambda *args:calls.append(args))
            restore.assert_not_called()
        self.assertIn('/keychain', calls[0])

    def test_missing_profile_restored_once_then_revalidated(self):
        import subprocess
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'credentials.json';local.save_private(file,{})
            count=[0]
            def run(*args):
                count[0]+=1
                if count[0]==1:raise subprocess.CalledProcessError(69,args)
            with patch.object(local,'restore_profile') as restore:
                local.ensure_profile(dict(profile='profile',keychain='/keychain',credentials_file=str(file)),run)
                restore.assert_called_once()
            self.assertEqual(count[0],2)
