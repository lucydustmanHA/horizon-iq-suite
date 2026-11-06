"""Start or stop a Databricks App on a schedule to save compute cost.

Usage (job task parameters):  <start|stop|check> <app-name>
Scheduled by two Jobs (America/Los_Angeles):
  * stop  - 7:00 PM Mon-Fri  (stays off overnight and all weekend)
  * start - 6:00 AM Mon-Fri
Starting an app redeploys its last active deployment, so no code changes are needed here.
"""
import sys
import time
from datetime import timedelta

from databricks.sdk import WorkspaceClient


def state_of(w: WorkspaceClient, name: str) -> str:
    app = w.apps.get(name)
    cs = app.compute_status.state.value if app.compute_status and app.compute_status.state else "UNKNOWN"
    return cs


def wait_while_transitioning(w: WorkspaceClient, name: str, limit_s: int = 600) -> str:
    deadline = time.time() + limit_s
    st = state_of(w, name)
    while st in ("STARTING", "STOPPING", "UPDATING", "DELETING") and time.time() < deadline:
        time.sleep(15)
        st = state_of(w, name)
    return st


def main() -> None:
    if len(sys.argv) < 3 or sys.argv[1] not in ("start", "stop", "check"):
        raise SystemExit("usage: app_power_schedule.py <start|stop|check> <app-name>")
    action, name = sys.argv[1], sys.argv[2]
    w = WorkspaceClient()
    st = wait_while_transitioning(w, name)
    print(f"[{action}] {name}: compute state before = {st}")

    if action == "check":
        return
    if action == "stop":
        if st == "STOPPED":
            print("Already stopped - nothing to do.")
            return
        w.apps.stop(name).result(timeout=timedelta(minutes=20))
    else:  # start
        if st == "ACTIVE":
            print("Already running - nothing to do.")
            return
        w.apps.start(name).result(timeout=timedelta(minutes=20))
    print(f"[{action}] {name}: compute state after = {state_of(w, name)}")


if __name__ == "__main__":
    main()
