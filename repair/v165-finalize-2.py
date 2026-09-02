from pathlib import Path

path = Path("tests/market-analytics-foundation-v1.6.5.test.cjs")
text = path.read_text()
old = '  assert.match(analyticsSource, /queryAggregate\\(\\{ species: ui\\.species \\|\\| undefined, currency: "USD", start:/);'
new = '  assert.match(analyticsSource, /queryAggregate\\(\\{ species: ui\\.species \\|\\| undefined, \\.\\.\\.marketFilterPayload\\(\\), currency: "USD", start:/);'
count = text.count(old)
if count != 1:
    raise SystemExit(f"stale Market aggregate assertion anchor mismatch: {count}")
path.write_text(text.replace(old, new, 1))

Path("repair/v165-finalize-2.py").unlink(missing_ok=True)
Path(".github/workflows/v1.6.5-finalize-2.yml").unlink(missing_ok=True)
