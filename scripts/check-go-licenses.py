import csv
import subprocess
from io import StringIO

allowed = {"Apache-2.0", "BSD-3-Clause", "ISC", "MIT"}
result = subprocess.run(
    ["go", "run", "github.com/google/go-licenses@v1.6.0", "csv", "./cmd/efficient-daemon"],
    check=True,
    capture_output=True,
    text=True,
)
print(result.stderr, end="")

rows = list(csv.reader(StringIO(result.stdout)))
if not rows:
    raise SystemExit("Go license audit returned no dependencies")

unsupported = [(row[0], row[-1]) for row in rows if row and row[-1] not in allowed]
if unsupported:
    raise SystemExit("unsupported Go dependency licenses: " + ", ".join(f"{name} ({license})" for name, license in unsupported))
