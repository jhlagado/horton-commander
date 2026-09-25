"""Exercise Horton's release-candidate flow in Triptych's native PTY host."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import sys
import termios
import time


TRIPTYCH_ROOT = Path(
    os.environ.get(
        "TRIPTYCH_ROOT",
        Path(__file__).resolve().parents[2] / "triptych",
    )
).resolve()
LAUNCHER = TRIPTYCH_ROOT / "tools/run-saved-machine-native.mjs"


def prove(archive, deployment, session, host, log_path):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
    transcript = bytearray()
    process = None
    log = log_path.open("xb")

    def read_available():
        try:
            data = os.read(master, 65536)
        except OSError:
            return b""
        transcript.extend(data)
        log.write(data)
        log.flush()
        return data

    def wait_for(marker, start=None, timeout=30):
        beginning = len(transcript) if start is None else start
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if marker in transcript[beginning:]:
                return
            if process is not None and process.poll() is not None:
                raise AssertionError(
                    f"native launcher exited {process.returncode}; output: "
                    f"{bytes(transcript[-1200:])!r}"
                )
            readable, _, _ = select.select([master], [], [], 0.1)
            if readable:
                read_available()
        raise AssertionError(
            f"timed out waiting for {marker!r}; output: {bytes(transcript[-1200:])!r}"
        )

    def wait_until_quiet(quiet=0.15, timeout=5):
        deadline = time.monotonic() + timeout
        quiet_since = time.monotonic()
        while time.monotonic() < deadline:
            if process is not None and process.poll() is not None:
                raise AssertionError(
                    f"native launcher exited {process.returncode}; output: "
                    f"{bytes(transcript[-1200:])!r}"
                )
            readable, _, _ = select.select([master], [], [], 0.05)
            if readable:
                read_available()
                quiet_since = time.monotonic()
            elif time.monotonic() - quiet_since >= quiet:
                return
        raise AssertionError(
            f"terminal did not become quiet; output: {bytes(transcript[-1200:])!r}"
        )

    def send_and_wait(data, *markers, timeout=30):
        # Drain bytes left by the previous screen before marking the start of
        # this key's response. Otherwise an unread old footer can satisfy the
        # next wait and make the PTY send a key during redraw.
        wait_until_quiet()
        start = len(transcript)
        os.write(master, data)
        for marker in markers:
            wait_for(marker, start, timeout)
        wait_until_quiet()

    def acquire_terminal():
        os.setsid()
        fcntl.ioctl(slave, termios.TIOCSCTTY, 0)

    try:
        process = subprocess.Popen(
            [
                "node",
                str(LAUNCHER),
                "--archive",
                str(archive),
                "--deployment",
                str(deployment),
                "--session",
                str(session),
                "--host",
                str(host),
            ],
            cwd=TRIPTYCH_ROOT,
            stdin=slave,
            stdout=slave,
            stderr=slave,
            preexec_fn=acquire_terminal,
        )
        os.close(slave)
        wait_for(b"\r\nA>")

        send_and_wait(b"A:HORTON\r", b"HORTON COMMANDER", b"Q quit")
        send_and_wait(b"\t", b"\x1b[7mHELLO   .TXT", b"Q quit")
        send_and_wait(
            b"\r",
            b"READ ONLY VIEWER",
            b"Native Triptych edit and copy test.",
            b"Esc/Q: return",
        )
        send_and_wait(b"\x1b", b"HORTON COMMANDER", b"Q quit")

        # Horton begins on A:/B:. Set the left panel to C: as destination and
        # keep the selected B: file active on the right as the copy source.
        send_and_wait(b"\t", b"\x1b[7mHORTON  .COM", b"Q quit")
        send_and_wait(b"]", b"B: *.*", b"Q quit")
        send_and_wait(b"]", b"C: *.*", b"Q quit")
        send_and_wait(b"\t", b"\x1b[7mHELLO   .TXT", b"Q quit")
        send_and_wait(
            b"c", b"Copy selected name to the other panel's drive? Y/N"
        )
        send_and_wait(
            b"y",
            b"Copy verified and complete; both panels refreshed.",
            b"Q quit",
        )
        send_and_wait(b" ", b"HORTON COMMANDER", b"Q quit")

        # The editor is still a separate transient. Follow Horton's displayed
        # CCP commands, save with real EDIT.COM, then consume /R and reopen.
        send_and_wait(b"e", b"Session saved to B:HORTON.RSM.", b"A>")
        send_and_wait(b"B:\r", b"B>")
        send_and_wait(
            b"A:EDIT HELLO.TXT\r",
            b"EDIT HELLO   .TXT",
            b"Native Triptych edit and copy test.",
        )
        send_and_wait(b"x\x13", b"Saved")
        send_and_wait(b"\x11", b"B>")
        send_and_wait(b"A:\r", b"A>")
        send_and_wait(b"A:HORTON /R\r", b"Resume this session? Y/N:")
        send_and_wait(
            b"y",
            b"HORTON COMMANDER",
            b"C: *.*",
            b"B: *.*",
            b"\x1b[7mHELLO   .TXT",
            b"Q quit",
        )
        send_and_wait(
            b"\r",
            b"READ ONLY VIEWER",
            b"xNative Triptych edit and copy test.",
            b"Esc/Q: return",
        )
        send_and_wait(b"\x1b", b"HORTON COMMANDER", b"Q quit")
        send_and_wait(b"q", b"A>")

        process.send_signal(signal.SIGINT)
        return_code = process.wait(timeout=15)
        if return_code != 130:
            raise AssertionError(f"native launcher exited {return_code}, expected 130")
        return {
            "status": "passed",
            "profile": "triptych-cpu-v0.1-2m-n04",
            "configuredDrives": ["A", "B", "C", "D"],
            "workflow": [
                "native CCP launch",
                "view B: file",
                "verified B: to C: copy",
                "edit and save B: file with EDIT.COM",
                "return through CCP and restore saved panels with /R",
                "reopen edited B: file",
            ],
        }
    finally:
        if process is not None and process.poll() is None:
            process.send_signal(signal.SIGINT)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        try:
            os.close(master)
        except OSError:
            pass
        try:
            os.close(slave)
        except OSError:
            pass
        log.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--deployment", type=Path, required=True)
    parser.add_argument("--session", type=Path, required=True)
    parser.add_argument("--host", type=Path, required=True)
    parser.add_argument("--log", type=Path, required=True)
    args = parser.parse_args()
    print(
        json.dumps(
            prove(args.archive, args.deployment, args.session, args.host, args.log),
            indent=2,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # Keep a useful message in CI's captured output.
        print(f"Increment 7 native proof failed: {error}", file=sys.stderr)
        raise
