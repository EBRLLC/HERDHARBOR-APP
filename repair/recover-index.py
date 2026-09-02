import hashlib
import re
from pathlib import Path

BASE_SHA1 = "c5f1a0872ce220c312686e3b77747fd507f1c51e"
TARGET_SHA1 = "ed1994703df927c4d00994c94747d6f3ef2b8d21"


def git_blob_sha(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode()
    return hashlib.sha1(header + data).hexdigest()


path = Path("index.html")
raw = path.read_bytes()
if git_blob_sha(raw) != BASE_SHA1:
    raise SystemExit(f"index base blob mismatch: {git_blob_sha(raw)}")

# The base file uses CRLF. Work's exact local commit changed only 217 lines, so
# preserve the source newline convention while applying the supplied zero-context diff.
eol = "\r\n" if b"\r\n" in raw else "\n"
text = raw.decode("utf-8")
lines = text.splitlines(keepends=True)
patch_lines = Path("repair/index-e62a71b.patch").read_text(encoding="utf-8").splitlines()

header_re = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")
hunks = []
i = 0
while i < len(patch_lines):
    match = header_re.match(patch_lines[i])
    if not match:
        i += 1
        continue
    old_start = int(match.group(1))
    old_count = int(match.group(2) or 1)
    new_count = int(match.group(4) or 1)
    i += 1
    old_payload = []
    new_payload = []
    while i < len(patch_lines) and not patch_lines[i].startswith("@@ "):
        row = patch_lines[i]
        if row.startswith("-") and not row.startswith("---"):
            old_payload.append(row[1:])
        elif row.startswith("+") and not row.startswith("+++"):
            new_payload.append(row[1:])
        elif row.startswith("\\ No newline"):
            pass
        elif row.startswith("diff --git") or row.startswith("index ") or row.startswith("--- ") or row.startswith("+++ "):
            break
        i += 1
    if len(old_payload) != old_count or len(new_payload) != new_count:
        raise SystemExit(
            f"malformed hunk at -{old_start}: expected {old_count}/{new_count}, "
            f"found {len(old_payload)}/{len(new_payload)}"
        )
    hunks.append((old_start, old_count, old_payload, new_payload))

if not hunks:
    raise SystemExit("no index hunks parsed")

# Apply bottom-up so original line numbers remain authoritative.
for old_start, old_count, old_payload, new_payload in reversed(hunks):
    start = old_start if old_count == 0 else old_start - 1
    existing = [line.rstrip("\r\n") for line in lines[start:start + old_count]]
    if existing != old_payload:
        raise SystemExit(
            f"hunk source mismatch at -{old_start}:\n"
            f"expected={old_payload!r}\nactual={existing!r}"
        )
    replacement = [row + eol for row in new_payload]
    lines[start:start + old_count] = replacement

result = "".join(lines).encode("utf-8")
actual = git_blob_sha(result)
if actual != TARGET_SHA1:
    raise SystemExit(f"recovered index blob mismatch: {actual}; expected {TARGET_SHA1}")
path.write_bytes(result)
print(f"Recovered exact index blob {actual} from {len(hunks)} hunks")
