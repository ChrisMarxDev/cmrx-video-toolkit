#!/usr/bin/env python3
"""Apply the reviewed private-test-port patch and rebuild Flutter's tool snapshot."""
import argparse, pathlib, subprocess, os
PIN = 'abaf9c523780a608bd46686fd5e53740a07077f8'
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--sdk', required=True, type=pathlib.Path)
p.add_argument('--pub-cache', required=True, type=pathlib.Path)
a = p.parse_args(); sdk=a.sdk.resolve(); cache=a.pub_cache.resolve()
if subprocess.check_output(['git','-C',str(sdk),'rev-parse','HEAD'],text=True).strip()!=PIN: raise SystemExit('Flutter revision mismatch')
f=sdk/'packages/flutter_tools/lib/src/test/flutter_tester_device.dart'
s=f.read_text(); old='_server = await bind(host, /*port*/ 0);'; new="_server = await bind(host, int.tryParse(platform.environment['CMRX_TEST_PORT'] ?? '') ?? 0);"
if old not in s and new not in s: raise SystemExit('Flutter test-port patch no longer applies')
f.write_text(s.replace(old,new))
env={**os.environ,'PUB_CACHE':str(cache),'FLUTTER_ROOT':str(sdk)}
subprocess.run([str(sdk/'bin/cache/dart-sdk/bin/dart'),'pub','get','--offline'],cwd=sdk/'packages/flutter_tools',env=env,check=True)
subprocess.run([str(sdk/'bin/cache/dart-sdk/bin/dart'),'--snapshot='+str(sdk/'bin/cache/flutter_tools.snapshot'),'--snapshot-kind=app-jit','--packages='+str(sdk/'packages/flutter_tools/.dart_tool/package_config.json'),'--no-enable-mirrors',str(sdk/'packages/flutter_tools/bin/flutter_tools.dart'),'--version'],env=env,check=True)
(sdk/'bin/cache/cmrx-test-port-patch').write_text(PIN+'\n')
