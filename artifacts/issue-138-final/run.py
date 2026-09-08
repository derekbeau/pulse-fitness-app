import subprocess, sys, time, shlex, json
from datetime import datetime, timezone
from pathlib import Path

label, *cmd = sys.argv[1:]
p = Path(__file__).parent
start = time.time()
receipt = {
    "command": shlex.join(cmd),
    "cwd": str(Path.cwd()),
    "head": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
    "branch": subprocess.check_output(["git", "branch", "--show-current"], text=True).strip(),
    "startedAt": datetime.now(timezone.utc).isoformat(),
}
with (p / (label + ".log")).open("w") as f:
    f.write("$ " + shlex.join(cmd) + "\n")
    f.flush()
    result = subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT)
receipt.update(exitCode=result.returncode, elapsedSeconds=round(time.time()-start, 2), finishedAt=datetime.now(timezone.utc).isoformat())
(p / (label + ".json")).write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt), flush=True)
print("".join((p / (label + ".log")).read_text().splitlines(keepends=True)[-22:]), flush=True)
sys.exit(result.returncode)
