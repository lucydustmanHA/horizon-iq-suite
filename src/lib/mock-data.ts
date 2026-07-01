import type { UseCase } from "./types";

const NAMES = [
  "Ava Ramirez",
  "Marcus Vane",
  "Priya Shah",
  "Jonas Beck",
  "Hana Okabe",
  "Ravi Kapoor",
  "Elena Rossi",
  "David Chen",
  "Sofia Lindqvist",
  "Omar Haddad",
  "Kira Sato",
  "Liam O'Neill",
];
const pick = <T,>(arr: readonly T[], i: number) => arr[i % arr.length];

const USE_CASE_TITLES: Array<{ title: string; desc: string }> = [
  { title: "Flight Delay Root-Cause Classifier", desc: "NLP-based sentiment and ops log analysis to auto-tag root causes." },
  { title: "Gate Reassignment Optimizer", desc: "Stochastic optimization for hub gate management under disruption." },
  { title: "Crew Fatigue Risk Model", desc: "Predicts fatigue risk from schedule + biometric telemetry." },
  { title: "Auto-Invoicing LLM Agent", desc: "Reads supplier invoices, extracts line items, posts to ERP." },
  { title: "Predictive Maintenance v2", desc: "APU health scoring using sensor telemetry timeseries." },
  { title: "Turnaround Time Coach", desc: "Live coach for ramp teams to hit block-off targets." },
  { title: "Baggage Mishandling Predictor", desc: "Flags high-risk connections 60 min before transfer." },
  { title: "Fuel Uplift Anomaly Detection", desc: "Detects over/under fueling vs. flight plan." },
  { title: "Cargo Load Optimizer", desc: "Palletization and weight-balance recommendations." },
  { title: "Customer Support Co-Pilot", desc: "Agent assist for irregular ops handling." },
  { title: "Contract Clause Extractor", desc: "Extracts SLA clauses from procurement contracts." },
  { title: "Roster Swap Recommender", desc: "Suggests legal crew swaps for open pairings." },
  { title: "Weather Impact Forecaster", desc: "Station-level weather delay probabilities." },
  { title: "Duty Log Summarizer", desc: "GenAI daily digest for station managers." },
  { title: "IROPS Playbook Retrieval", desc: "RAG over historical IROPS runbooks." },
  { title: "Refund Eligibility Classifier", desc: "Auto-decisions Tier 1 refund cases." },
  { title: "Gate Camera Object Detection", desc: "CV to detect FOD before pushback." },
  { title: "Predictive Slot Utilization", desc: "Forecasts slot usage at slot-constrained airports." },
  { title: "Meal Waste Reducer", desc: "Optimizes catering counts by route." },
  { title: "Automated NOTAM Digest", desc: "Summarizes NOTAMs relevant to a given flight." },
  { title: "Loyalty Churn Predictor", desc: "Predicts elite tier churn 90 days out." },
  { title: "Ancillary Upsell Recommender", desc: "Contextual bag/seat upsell scoring." },
  { title: "Ground Equipment Utilization", desc: "GSE utilization heatmaps per station." },
  { title: "Inflight Wi-Fi Anomaly", desc: "Detects degraded Ka-band sessions." },
  { title: "Chatbot for HR FAQs", desc: "Employee-facing HR chatbot with policy RAG." },
  { title: "Automated Expense Coding", desc: "GL account prediction for expense reports." },
  { title: "Manifest OCR Extractor", desc: "OCR + LLM extraction from freight manifests." },
  { title: "Predictive Cabin Cleaning", desc: "Predicts cabin cleaning duration." },
  { title: "Voice-of-Customer Themes", desc: "Topic modeling on NPS verbatims." },
  { title: "Safety Report Triage", desc: "Classifies ASAP reports by risk and workflow." },
];

const STAGES = [
  "Submitted",
  "Intake",
  "Discovery",
  "Development",
  "Testing & Validation",
  "Deployment",
  "Completed",
  "Archive",
] as const;

const WORKGROUPS = [
  "Flight Ops",
  "Ground Handling",
  "Stations",
  "Finance Operations",
  "Safety & HR",
  "Customer Experience",
  "Cargo",
  "Engineering",
] as const;

const CATEGORIES = ["Automation", "Predictive AI", "Generative AI", "Optimization", "Analytics", "Copilot"] as const;
const SOLUTIONS = ["Power Automate", "Python Service", "LLM Agent", "Custom App", "Notebook", "Workflow"] as const;
const STATUSES = ["Not Started", "In Progress", "Blocked", "On Hold", "Live"] as const;
const STRATEGIC = ["Operational Excellence", "Guest Experience", "Cost Reduction", "Revenue Growth", "Safety First"];

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function generateSeedUseCases(): UseCase[] {
  return USE_CASE_TITLES.map((t, i) => {
    const id = `UC-${String(i + 1).padStart(4, "0")}`;
    const stage = pick(STAGES, i * 3 + (i % 5));
    const priority = (((i * 7) % 5) + 1) as UseCase["priority"];
    const risk = ((((i + 2) * 3) % 5) + 1) as UseCase["risk"];
    const complexity = ((((i + 1) * 5) % 5) + 1) as UseCase["complexity"];
    const timeSaved = 20 + ((i * 17) % 180);
    const effortBefore = (4 - (i % 2)) as UseCase["effortBefore"];
    const effortAfter = Math.max(1, effortBefore - 2) as UseCase["effortAfter"];
    const proactive = 30 + ((i * 11) % 60);
    const createdOffset = 15 + i * 6;
    const modifiedOffset = Math.max(1, createdOffset - ((i * 5) % 30));
    const activity: UseCase["activity"] = [
      { id: `${id}-a1`, date: daysAgo(createdOffset), type: "created", message: `Use case created` },
      { id: `${id}-a2`, date: daysAgo(createdOffset - 5), type: "stage_change", message: `Moved from Submitted to Intake` },
    ];
    if (["Development", "Testing & Validation", "Deployment", "Completed"].includes(stage)) {
      activity.push({ id: `${id}-a3`, date: daysAgo(createdOffset - 12), type: "stage_change", message: `Moved from Discovery to Development` });
    }
    if (["Testing & Validation", "Deployment", "Completed"].includes(stage)) {
      activity.push({ id: `${id}-a4`, date: daysAgo(createdOffset - 20), type: "stage_change", message: `Moved from Development to Testing & Validation` });
    }
    if (stage === "Completed") {
      activity.push({ id: `${id}-a5`, date: daysAgo(createdOffset - 28), type: "stage_change", message: `Moved from Deployment to Completed` });
    }
    return {
      id,
      title: t.title,
      description: t.desc,
      workgroup: pick(WORKGROUPS, i),
      businessArea: pick(["Operations", "Commercial", "Finance", "Safety", "Digital"], i),
      strategicGoal: pick(STRATEGIC, i),
      grouping: pick(["Wave 1", "Wave 2", "Wave 3"], i),
      businessOwner: pick(NAMES, i),
      useCaseOwner: pick(NAMES, i + 2),
      developer: pick(NAMES, i + 4),
      technicalLead: pick(NAMES, i + 6),
      category: pick(CATEGORIES, i),
      tags: [pick(["copilot", "ops", "nlp", "cv", "opt", "genai", "rag"], i), pick(["priority", "quick-win", "strategic"], i)],
      solutionType: pick(SOLUTIONS, i),
      dataSource: pick(["Snowflake", "SAP", "Sabre", "SharePoint", "S3", "Splunk"], i),
      complexity,
      risk,
      priority,
      status: pick(STATUSES, i),
      stage,
      currentSection: pick(["Model", "Data", "Integration", "Rollout"], i),
      createdDate: daysAgo(createdOffset),
      lastModifiedDate: daysAgo(modifiedOffset),
      timeSavedPerMonth: timeSaved,
      annualTimeSaved: timeSaved * 12,
      costSavings: timeSaved * 12 * 85,
      effortBefore,
      effortAfter,
      proactivePct: proactive,
      reactivePct: 100 - proactive,
      comments: [
        {
          id: `${id}-c1`,
          author: pick(NAMES, i + 1),
          date: daysAgo(Math.max(1, modifiedOffset - 2)),
          body: "Initial scoping notes attached — ready for owner review.",
        },
      ],
      attachments: [],
      links: [],
      activity: activity.sort((a, b) => a.date.localeCompare(b.date)),
    };
  });
}