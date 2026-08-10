# Databricks notebook source
# DBTITLE 1,QX AI Weekly Health Report
# MAGIC %md
# MAGIC # QX AI Weekly Health Report
# MAGIC
# MAGIC This notebook generates and sends the weekly "QX AI HEALTH REPORT" email to all active recipients in `report_recipients`.
# MAGIC
# MAGIC **Sections:**
# MAGIC - All Use Cases: Total, 2026 Remaining, 2027+, Completed All-Time
# MAGIC - 2026 Pipeline: Total, Hold, Completed 2026
# MAGIC - Stage breakdown (count per stage)
# MAGIC - Flagged items (Action Needed + Blocked)
# MAGIC
# MAGIC **Schedule:** Weekly (Monday 8 AM via Databricks Job)
# MAGIC
# MAGIC **Requires:** Azure AD app registration with `Mail.Send` permission. Credentials stored in Databricks Secrets.

# COMMAND ----------

# DBTITLE 1,Configuration
# -- Configuration --
# Lakebase connection
LAKEBASE_HOST = "ep-summer-silence-eenujnkm.database.westus2.azuredatabricks.net"
LAKEBASE_DB = "databricks_postgres"
LAKEBASE_ENDPOINT = "projects/horizon-ai-innovation/branches/production/endpoints/primary"

# Email delivery via Power Automate (no Azure AD app needed)
# The webhook URL is in the "Send" cell below.

# Report branding
REPORT_TITLE = "QX AI HEALTH REPORT"
from datetime import date
REPORT_DATE = date.today().strftime("%B %d, %Y")

# COMMAND ----------

# DBTITLE 1,Connect to Lakebase
import requests
import psycopg2
import json

def get_lakebase_connection():
    """Get a Lakebase Postgres connection using workspace token."""
    # Use the notebook's ambient auth token
    token = dbutils.notebook.entry_point.getDbutils().notebook().getContext().apiToken().get()
    host = spark.conf.get("spark.databricks.workspaceUrl")
    
    # Generate Lakebase credential
    resp = requests.post(
        f"https://{host}/api/2.0/postgres/credentials",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"endpoint": LAKEBASE_ENDPOINT}
    )
    resp.raise_for_status()
    pg_token = resp.json()["token"]
    
    # Decode JWT sub for username
    import base64
    payload = pg_token.split(".")[1]
    payload += "=" * (4 - len(payload) % 4)
    user = json.loads(base64.b64decode(payload))["sub"]
    
    return psycopg2.connect(
        host=LAKEBASE_HOST,
        database=LAKEBASE_DB,
        user=user,
        password=pg_token,
        port=5432,
        sslmode="require"
    )

conn = get_lakebase_connection()
print("✓ Connected to Lakebase")

# COMMAND ----------

# DBTITLE 1,Query report data
import pandas as pd

def query_report_data(conn):
    """Query all stats needed for the weekly report."""
    with conn.cursor() as cur:
        # Total use cases
        cur.execute("SELECT COUNT(*) FROM public.use_cases")
        total = cur.fetchone()[0]

        # By priority (2026 = priority 1, 2027+ = priority 2)
        cur.execute("SELECT priority, COUNT(*) FROM public.use_cases GROUP BY priority")
        priority_counts = dict(cur.fetchall())
        priority_2026 = priority_counts.get(1, 0)
        priority_2027 = priority_counts.get(2, 0)

        # By stage
        cur.execute("SELECT stage, COUNT(*) FROM public.use_cases GROUP BY stage ORDER BY COUNT(*) DESC")
        stage_breakdown = cur.fetchall()

        # Completed all-time
        cur.execute("SELECT COUNT(*) FROM public.use_cases WHERE TRIM(stage) = 'Completed'")
        completed_all_time = cur.fetchone()[0]

        # 2026 pipeline (priority = 1)
        cur.execute("SELECT COUNT(*) FROM public.use_cases WHERE priority = 1")
        pipeline_2026_total = cur.fetchone()[0]

        # 2026 completed (priority 1 + Completed stage)
        cur.execute("SELECT COUNT(*) FROM public.use_cases WHERE priority = 1 AND TRIM(stage) = 'Completed'")
        pipeline_2026_completed = cur.fetchone()[0]

        # 2026 on hold (priority 1 + Archive stage)
        cur.execute("SELECT COUNT(*) FROM public.use_cases WHERE priority = 1 AND TRIM(stage) = 'Archive'")
        pipeline_2026_hold = cur.fetchone()[0]

        # Flagged (Action Needed + Blocked)
        cur.execute("SELECT COUNT(*) FROM public.use_cases WHERE TRIM(status) IN ('Action Needed', 'Blocked')")
        flagged = cur.fetchone()[0]

        # Blocked only
        cur.execute("SELECT COUNT(*) FROM public.use_cases WHERE TRIM(status) = 'Blocked'")
        blocked = cur.fetchone()[0]

        # Recipients
        cur.execute("SELECT email, display_name FROM public.report_recipients WHERE active = true")
        recipients = cur.fetchall()

    return {
        "total": total,
        "priority_2026": priority_2026,
        "priority_2027": priority_2027,
        "completed_all_time": completed_all_time,
        "pipeline_2026_total": pipeline_2026_total,
        "pipeline_2026_completed": pipeline_2026_completed,
        "pipeline_2026_hold": pipeline_2026_hold,
        "pipeline_2026_remaining": pipeline_2026_total - pipeline_2026_completed - pipeline_2026_hold,
        "flagged": flagged,
        "blocked": blocked,
        "stage_breakdown": stage_breakdown,
        "recipients": recipients,
    }

data = query_report_data(conn)
print(f"Report data: {data['total']} total use cases, {data['flagged']} flagged, {len(data['recipients'])} recipients")
for stage, count in data["stage_breakdown"]:
    print(f"  {stage}: {count}")

# COMMAND ----------

# DBTITLE 1,Generate branded HTML email
def generate_html_report(data: dict) -> str:
    """Generate a branded HTML email matching the Horizon QX app design."""
    # Stage color mapping (matches app badges)
    stage_colors = {
        "Submitted": ("#e8f4f6", "#2a7a86"), "Intake": ("#e8f4f6", "#2a7a86"),
        "Discovery": ("#fef3e2", "#b85a1f"), "Development": ("#dbeafe", "#1e40af"),
        "Archive": ("#f1f5f9", "#64748b"), "Completed": ("#d4edda", "#1a5c2a"),
        "Testing & Validation": ("#fce7f3", "#9d174d"),
    }
    stage_rows = ""
    for stage, count in data["stage_breakdown"]:
        bg, fg = stage_colors.get(stage, ("#f1f5f9", "#475569"))
        stage_rows += f'<tr><td style="padding:8px 0;color:#475569;">{stage}</td><td style="padding:8px 0;text-align:right;"><span style="background:{bg};color:{fg};font-weight:600;padding:2px 10px;border-radius:99px;font-size:12px;">{count}</span></td></tr>'

    pct_2026 = round(data["pipeline_2026_completed"] / max(data["pipeline_2026_total"], 1) * 100)
    action_needed = data["flagged"] - data.get("blocked", 0)
    blocked = data.get("blocked", 0)

    html = f"""<div style="font-family:'Inter',system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;background:#f8fafb;padding:0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#1a2e35;padding:36px 32px 28px;text-align:center;">
<div style="margin-bottom:12px;"><span style="display:inline-block;background-color:#419dab;color:#ffffff;font-size:10px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:1px;">AI &amp; INNOVATION</span></div>
<h1 style="color:#ffffff;font-size:26px;font-weight:800;margin:0;letter-spacing:-0.5px;">QX Health Report</h1>
<p style="color:#7fb8c2;font-size:13px;margin:8px 0 0;">{REPORT_DATE}</p></td></tr></table>
<div style="padding:24px 24px 32px;">
<table width="100%" cellpadding="0" cellspacing="8" border="0" style="margin-bottom:20px;"><tr>
<td width="33%" style="background-color:#ffffff;border-radius:12px;padding:16px 20px;text-align:center;border-top:3px solid #419dab;">
<p style="font-size:28px;font-weight:800;color:#1a2e35;margin:0;">{data['total']}</p>
<p style="font-size:11px;color:#64748b;margin:4px 0 0;text-transform:uppercase;letter-spacing:0.5px;">Total Use Cases</p></td>
<td width="33%" style="background-color:#ffffff;border-radius:12px;padding:16px 20px;text-align:center;border-top:3px solid #419dab;">
<p style="font-size:28px;font-weight:800;color:#419dab;margin:0;">{data['completed_all_time']}</p>
<p style="font-size:11px;color:#64748b;margin:4px 0 0;text-transform:uppercase;letter-spacing:0.5px;">Completed</p></td>
<td width="33%" style="background-color:#ffffff;border-radius:12px;padding:16px 20px;text-align:center;border-top:3px solid #ed7438;">
<p style="font-size:28px;font-weight:800;color:#ed7438;margin:0;">{data['flagged']}</p>
<p style="font-size:11px;color:#64748b;margin:4px 0 0;text-transform:uppercase;letter-spacing:0.5px;">Flagged</p></td></tr></table>

<div style="background-color:#ffffff;border-radius:12px;padding:20px 24px;margin-bottom:12px;border-left:4px solid #419dab;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td><h2 style="font-size:14px;font-weight:700;color:#1a2e35;margin:0;">2026 Pipeline</h2></td><td style="text-align:right;"><span style="font-size:12px;color:#419dab;font-weight:600;background-color:#e8f4f6;padding:3px 10px;border-radius:99px;">{pct_2026}% complete</span></td></tr></table>
<div style="background-color:#e2ebed;border-radius:99px;height:10px;margin:14px 0 16px;overflow:hidden;">
<div style="background-color:#419dab;border-radius:99px;height:10px;width:{pct_2026}%;"></div></div>
<table width="100%" style="border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Total in Pipeline</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#1a2e35;font-size:15px;">{data['pipeline_2026_total']}</td></tr>
<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Completed</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#419dab;font-size:15px;">{data['pipeline_2026_completed']}</td></tr>
<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Remaining</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#1a2e35;font-size:15px;">{data['pipeline_2026_remaining']}</td></tr>
<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">On Hold</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#ed7438;font-size:15px;">{data['pipeline_2026_hold']}</td></tr></table></div>

<div style="background-color:#ffffff;border-radius:12px;padding:20px 24px;margin-bottom:12px;border-left:4px solid #419dab;">
<h2 style="font-size:14px;font-weight:700;color:#1a2e35;margin:0 0 14px;">Pipeline by Stage</h2>
<table width="100%" style="border-collapse:collapse;font-size:13px;">{stage_rows}</table></div>

<div style="background-color:#fef6f0;border:1px solid #fcd5be;border-left:4px solid #ed7438;border-radius:12px;padding:16px 20px;margin-bottom:12px;">
<h2 style="font-size:14px;font-weight:700;color:#b84a15;margin:0 0 6px;">Attention Needed</h2>
<p style="font-size:13px;color:#c25a24;margin:0;"><strong>{action_needed}</strong> Action Needed &nbsp;·&nbsp; <strong>{blocked}</strong> Blocked</p></div>

<div style="background-color:#ffffff;border-radius:12px;padding:20px 24px;margin-bottom:20px;border-left:4px solid #419dab;">
<h2 style="font-size:14px;font-weight:700;color:#1a2e35;margin:0 0 14px;">All Use Cases</h2>
<table width="100%" style="border-collapse:collapse;font-size:13px;">
<tr><td style="padding:6px 0;color:#64748b;">2026 Remaining</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#1a2e35;">{data['pipeline_2026_remaining']}</td></tr>
<tr><td style="padding:6px 0;color:#64748b;">2027+</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#1a2e35;">{data['priority_2027']}</td></tr>
<tr><td style="padding:6px 0;color:#64748b;">Completed All-Time</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#419dab;">{data['completed_all_time']}</td></tr></table></div>

<div style="text-align:center;margin:24px 0 8px;">
<a href="https://qx-business-transformation-620317033646362.2.azure.databricksapps.com" style="display:inline-block;background-color:#419dab;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">View Full Dashboard →</a></div>

<div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e2ebed;">
<p style="font-size:11px;color:#94a3b8;margin:0;">Auto-generated from <span style="color:#419dab;font-weight:500;">Horizon QX</span> · Delivered weekly on Monday</p></div>
</div></div>"""
    return html

html_report = generate_html_report(data)
print("✓ HTML report generated")
print(f"  Preview length: {len(html_report)} chars")

# COMMAND ----------

# DBTITLE 1,Send via SendGrid
# SendGrid email delivery
# API key stored in Databricks Secrets: scope=qx-email, key=sendgrid-api-key
SENDGRID_API_KEY = dbutils.secrets.get(scope="qx-email", key="sendgrid-api-key")
FROM_EMAIL = "lucy.dustman@horizonair.com"
FROM_NAME = "Horizon QX Reports"

def send_email_sendgrid(html_body: str, recipients: list, subject: str):
    """Send email via SendGrid API."""
    to_list = [{"email": email, "name": name} for email, name in recipients]

    payload = {
        "personalizations": [{"to": to_list}],
        "from": {"email": FROM_EMAIL, "name": FROM_NAME},
        "reply_to": {"email": FROM_EMAIL, "name": FROM_NAME},
        "subject": subject,
        "content": [{"type": "text/html", "value": html_body}],
    }

    resp = requests.post(
        "https://api.sendgrid.com/v3/mail/send",
        headers={
            "Authorization": f"Bearer {SENDGRID_API_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )

    if resp.status_code == 202:
        print(f"✓ Email sent to {len(recipients)} recipient(s) via SendGrid")
    else:
        raise RuntimeError(f"SendGrid error {resp.status_code}: {resp.text}")

# Send the report
if data["recipients"]:
    subject = f"{REPORT_TITLE} — {REPORT_DATE}"
    send_email_sendgrid(html_report, data["recipients"], subject)
else:
    print("⚠ No active recipients found — skipping send")

conn.close()
print("✓ Done")

# COMMAND ----------


