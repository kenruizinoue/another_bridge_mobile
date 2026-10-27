"""Check that every symbol an app binary imports from a framework inside the
app bundle is exported by that framework. Catches dyld "Symbol not found"
launch crashes before installing."""
import re
import subprocess
import sys
from pathlib import Path

app = Path(sys.argv[1])
bins = {app.stem: app / app.stem}
for fw in sorted((app / "Frameworks").glob("*.framework")):
    bins[fw.stem] = fw / fw.stem


def run(args):
    return subprocess.run(args, capture_output=True, text=True).stdout


exports = {}
for name, path in bins.items():
    out = run(["dyld_info", "-exports", str(path)])
    exports[name] = {line.split()[-1] for line in out.splitlines()[2:] if line.strip()}

imp_re = re.compile(r"^\s+(?:0x[0-9A-Fa-f]+\s+)?(\S+)\s+\(from (\S+)\)")
missing = 0
checked = 0
for name, path in bins.items():
    for line in run(["dyld_info", "-imports", str(path)]).splitlines():
        m = imp_re.match(line)
        if not m:
            continue
        sym, lib = m.groups()
        if lib in exports:
            checked += 1
        if lib in exports and sym not in exports[lib]:
            missing += 1
            print(f"MISSING {name} needs {sym} from {lib}")
print(f"checked {len(bins)} binaries, {checked} in-app imports, {missing} missing")
sys.exit(1 if missing else 0)
