export type Priority = 1 | 2 | 3 | 4 | 5;
export type Complexity = 1 | 2 | 3 | 4 | 5;
export type Risk = 1 | 2 | 3 | 4 | 5;
export type Effort = 1 | 2 | 3 | 4 | 5;

export const STAGES = [
  "Submitted",
  "Intake",
  "Discovery",
  "Development",
  "Testing & Validation",
  "Deployment",
  "Completed",
  "Archive",
] as const;
export type Stage = (typeof STAGES)[number];

export const STATUSES = [
  "Not Started",
  "In Progress",
  "Blocked",
  "On Hold",
  "Live",
  "Retired",
] as const;
export type Status = (typeof STATUSES)[number];

export const WORKGROUPS = [
  "Flight Ops",
  "Ground Handling",
  "Stations",
  "Finance Operations",
  "Safety & HR",
  "Customer Experience",
  "Cargo",
  "Engineering",
] as const;
export type Workgroup = (typeof WORKGROUPS)[number];

export const CATEGORIES = [
  "Automation",
  "Predictive AI",
  "Generative AI",
  "Optimization",
  "Analytics",
  "Copilot",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SOLUTION_TYPES = [
  "Power Automate",
  "Python Service",
  "LLM Agent",
  "Custom App",
  "Notebook",
  "Workflow",
] as const;
export type SolutionType = (typeof SOLUTION_TYPES)[number];

export interface ActivityEntry {
  id: string;
  date: string; // ISO
  type:
    | "stage_change"
    | "status_change"
    | "owner_change"
    | "priority_change"
    | "metric_change"
    | "created"
    | "comment";
  message: string;
  actor?: string;
}

export interface CommentEntry {
  id: string;
  author: string;
  date: string;
  body: string;
  resolved?: boolean;
  replies?: CommentEntry[];
}

export interface UseCase {
  id: string; // UC-0001
  title: string;
  description: string;

  workgroup: Workgroup;
  businessArea: string;
  strategicGoal: string;
  grouping: string;

  businessOwner: string;
  useCaseOwner: string;
  developer: string;
  technicalLead: string;

  category: Category;
  tags: string[];
  solutionType: SolutionType;
  dataSource: string;

  complexity: Complexity;
  risk: Risk;
  priority: Priority;

  status: Status;
  stage: Stage;
  currentSection: string;

  createdDate: string;
  lastModifiedDate: string;

  timeSavedPerMonth: number; // hours
  annualTimeSaved: number; // hours
  costSavings: number; // USD
  effortBefore: Effort;
  effortAfter: Effort;
  proactivePct: number;
  reactivePct: number;

  comments: CommentEntry[];
  attachments: string[];
  links: string[];

  activity: ActivityEntry[];
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  1: "Lowest",
  2: "Low",
  3: "Medium",
  4: "High",
  5: "Critical",
};