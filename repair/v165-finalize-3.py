from pathlib import Path

old = '.github/workflows/v1.6.1-monitoring-review.yml'
new = '.github/workflows/v1.6.5-release-review.yml'
changed = []
for path in Path('tests').glob('*.test.cjs'):
    text = path.read_text()
    if old in text:
        path.write_text(text.replace(old, new))
        changed.append(str(path))
if not changed:
    raise SystemExit('expected at least one stale v1.6.1 release-review workflow reference in tests')

Path('repair/v165-finalize-3.py').unlink(missing_ok=True)
Path('.github/workflows/v1.6.5-finalize-3.yml').unlink(missing_ok=True)
