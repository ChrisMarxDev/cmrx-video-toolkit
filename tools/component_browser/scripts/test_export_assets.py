import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('export_assets', Path(__file__).with_name('export_assets.py'))
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)


class ExportAssetsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def package(self, name, extra=''):
        root = self.root / name
        (root / 'lib').mkdir(parents=True)
        (root / 'pubspec.yaml').write_text(f'name: {name}\n{extra}')
        (root / 'lib' / 'widget.dart').write_text('// actual reusable source\n')
        return root

    def test_portable_dependency_and_license_snapshot(self):
        shared = self.package('shared')
        primary = self.package('primary', 'dependencies:\n  shared:\n    path: ../shared\n')
        (self.root / 'LICENSE').write_text('Synthetic license notice\n')
        found = export.packages(primary)
        self.assertEqual(set(found), {'primary', 'shared'})
        target = self.root / 'snapshot/packages/primary'
        export.copy_package(primary, target)
        self.assertIn('path: ../shared', (target / 'pubspec.yaml').read_text())
        self.assertEqual((target / 'lib/widget.dart').read_text(), '// actual reusable source\n')
        self.assertEqual((target / 'LICENSE').read_text(), 'Synthetic license notice\n')
        self.assertFalse((target / '.dart_tool').exists())

    def test_symlink_source_refuses_escape(self):
        primary = self.package('primary')
        outside = self.root / 'unrelated.txt'
        outside.write_text('not an asset')
        (primary / 'lib/escape.dart').symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            export.copy_package(primary, self.root / 'snapshot')

    def test_package_names_cannot_escape_output(self):
        primary = self.package('primary')
        (primary / 'pubspec.yaml').write_text('name: ../../outside\n')
        with self.assertRaisesRegex(ValueError, 'package name'):
            export.packages(primary)


if __name__ == '__main__':
    unittest.main()
