
export type Priority = 1 | 2;
export type Complexity = 1 | 2 | 3 | 4 | 5;
export type Effort = 1 | 2 | 3 | 4 | 5;

export const STAGES = [
  "Submitted","Intake","Discovery","Development",
  "Testing & Validation","Deployment","Completed","Archive",
] as const;
export type Stage = (typeof STAGES)[number];

export const STATUSES = ["Blocked","Action Needed"] as const;
export type Status = (typeof STATUSES)[number];

export const WORKGROUPS = ["Back Office","SOC","Flt Ops","Inflight","M&E","Safety","Stations"] as const;

export const BUSINESS_AREAS = [
  "Airports","All","All (including Alaska)","All SOC","BI","CLP","CPO","CPO/Inflight",
  "Catering","Crew Planning","Crew Scheduling","Dispatch","Dispatch (possibly MTX control)",
  "Dispatch/CLP","Dispatch/CLP/Crew Scheduling","Drug Abatement","Employee Relations",
  "Finance","Flight Ops","Flight Ops/Dispatch","Flight Ops/Inflight","GSE","HR","HR BP",
  "HR Shared Service","Inflight","Inflight/Flight Ops","Labor","MTX","MTX Planning",
  "Materials","Ops","Ops Leaders","Reliability","SOC","Safety","Safety/Audit","Standards",
  "Station Leadership","Stations","Training","Training Scheduling",
] as const;

export const STRATEGIC_FOCUSES = ["Financial Durability","Operational Excellence","People and Culture","Safety"] as const;
export const GROUPINGS        = ["HR Procode","M&E Procode","Shareable","SOC Agent"] as const;
export const VENDORS          = ["AAG Analytics & Data Science","AAG ITS","Buy","Databricks","QX Internal - Copilot/Automation Team","QX Internal - ORA","System/Software Vendor","UPLabs","Use Case Owner and Team"] as const;
export const SOLUTION_TYPES   = ["Power Automate","Python Service","LLM Agent","Custom App","Notebook","Workflow"] as const;
export const TIME_UNITS       = ["day","week","month","quarter","year"] as const;
export type SolutionType = (typeof SOLUTION_TYPES)[number];

export const PRIORITY_LABEL: Record<number, string> = { 1: "2026", 2: "2027+" };

export interface ActivityEntry {
  id: string; date: string;
  type: "stage_change"|"status_change"|"owner_change"|"priority_change"|"metric_change"|"created"|"comment";
  message: string; actor?: string;
}
export interface CommentEntry {
  id: string; author: string; date: string; body: string;
  resolved?: boolean; replies?: CommentEntry[];
}
export interface TodoItem {
  id: string; useCaseId: string; text: string; assignee: string; done: boolean; createdDate: string;
}
export interface UseCase {
  id: string; title: string; description: string;
  workgroup: string; businessArea: string; strategicGoal: string; grouping: string;
  businessOwner: string; useCaseOwner: string; developer: string;
  solutionType: string; dataSource: string;
  complexity: Complexity; priority: Priority | null;
  status: string; stage: Stage; currentSection: string;
  createdDate: string; lastModifiedDate: string;
  timeSavedValue: number; timeSavedUnit: string;
  annualTimeSaved: number; costSavings: number;
  effortBefore: Effort; effortAfter: Effort;
  proactivePct: number; reactivePct: number;
  comments: CommentEntry[]; attachments: string[]; links: string[];
  activity: ActivityEntry[];
}
