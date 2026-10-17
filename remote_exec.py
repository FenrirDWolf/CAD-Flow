import subprocess
import base64
import sys

def run_remote_powershell(ps_script: str):
    wrapped_script = f"$ProgressPreference = 'SilentlyContinue';\n{ps_script}"
    encoded = base64.b64encode(wrapped_script.encode('utf-16le')).decode('ascii')
    cmd = [
        "ssh",
        "-i", "C:/Users/santh/.ssh/id_ed25519",
        "-o", "StrictHostKeyChecking=no",
        "Administrator@212.86.105.232",
        f"powershell -NoProfile -NonInteractive -EncodedCommand {encoded}"
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if proc.stdout:
        print(proc.stdout)
    if proc.stderr:
        # Filter out CLIXML header if that's all it is
        err = proc.stderr.replace("#< CLIXML", "").strip()
        if err:
            print(f"STDERR: {err}", file=sys.stderr)
    return proc.returncode

if __name__ == "__main__":
    if len(sys.argv) > 1:
        script = " ".join(sys.argv[1:])
    else:
        script = sys.stdin.read()
    sys.exit(run_remote_powershell(script))
