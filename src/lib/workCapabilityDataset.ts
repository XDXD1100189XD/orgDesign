import type { ExcelRow } from "./parseExcel";
import type { ColumnMapping } from "./fieldDictionary";

export type WorkCapabilityDatasetType =
  | "activity_library"
  | "activity_assignments"
  | "skill_library"
  | "role_skill_requirements"
  | "employee_skills"
  | "activity_skill_requirements";

export type WorkCapabilityValidationStatus =
  | "success"
  | "failed"
  | "imported_with_warnings";
export type WorkCapabilityNormalizationStatus =
  | "auto_applied"
  | "needs_review"
  | "approved"
  | "ignored";

export interface ParsedWorkCapabilityFile {
  fileName: string;
  datasetType?: WorkCapabilityDatasetType | null;
  headers: string[];
  rows: ExcelRow[];
}

export interface WorkCapabilitySourceFile {
  fileName: string;
  datasetType: WorkCapabilityDatasetType;
  rowCount: number;
}

export interface WorkCapabilityValidationSummary {
  status: WorkCapabilityValidationStatus;
  loaded: Record<WorkCapabilityDatasetType, number>;
  errors: string[];
  warnings: string[];
  normalization: WorkCapabilityNormalizationSummary;
}

export type Criticality = "Low" | "Medium" | "High";
export type SourceKind = "Synthetic" | "Manual" | "AI-Suggested" | "Imported";

export interface ActivityLibraryRow extends ExcelRow {
  activity_id: string;
  activity_name: string;
  department_focus: string;
  activity_category: string;
  process_area: string;
  nature: string;
  criticality: string;
  automation_cost_reduction_pct: number;
  outsourcing_cost_reduction_pct: number;
  complexity: string;
  frequency: string;
  active_flag: boolean;
  merged_into_activity_id: string | null;
  created_source: string | null;
  last_updated_at: string | null;
}

export interface ActivityAssignmentRow extends ExcelRow {
  assignment_id: string;
  employee_id: string;
  activity_id: string;
  time_allocation_pct: number;
  accountability: string;
  assignment_source: string;
  validated: boolean;
}

export interface SkillLibraryRow extends ExcelRow {
  skill_id: string;
  skill_name: string;
  skill_family: string;
  skill_category: string;
  skill_type: string;
  criticality: string;
  proficiency_scale: string;
  active_flag: boolean;
}

export interface RoleSkillRequirementRow extends ExcelRow {
  requirement_id: string;
  role_key: string;
  position_title: string;
  department: string;
  skill_id: string;
  required_level: number;
  criticality: string;
  requirement_source: string;
  validated: boolean;
  active_flag: boolean;
}

export interface EmployeeSkillRow extends ExcelRow {
  employee_skill_id: string;
  employee_id: string;
  skill_id: string;
  current_level: number;
  evidence_source: string;
  validated: boolean;
  synthetic_flag: boolean;
}

export interface ActivitySkillRequirementRow extends ExcelRow {
  activity_skill_requirement_id: string;
  activity_id: string;
  skill_id: string;
  required_level: number;
  criticality: string;
  relationship_type: string;
  weight: number;
  requirement_source: string;
  validated: boolean;
  active_flag: boolean;
}

export interface WorkCapabilityState {
  stateId: "asIs" | "toBe";
  activityAssignments: ActivityAssignmentRow[];
  roleSkillRequirements: RoleSkillRequirementRow[];
  employeeSkills: EmployeeSkillRow[];
  revision: number;
  updatedAt: string;
}

export interface WorkCapabilityDataset {
  datasetId: string;
  orgDatasetId: string;
  uploadedAt: string;
  sourceFiles: WorkCapabilitySourceFile[];
  shared: {
    activityLibrary: ActivityLibraryRow[];
    skillLibrary: SkillLibraryRow[];
    activitySkillRequirements: ActivitySkillRequirementRow[];
  };
  states: {
    asIs: WorkCapabilityState;
    toBe?: WorkCapabilityState;
  };
  validation: WorkCapabilityValidationSummary;
  normalization: WorkCapabilityNormalizationSummary;
  taxonomyChangeLog: WorkCapabilityTaxonomyChangeRecord[];
  activityMergeLog: WorkCapabilityActivityMergeRecord[];
  revision: number;
}

export type TaxonomyMutation =
  | { type: "rename_process"; from: string; to: string }
  | { type: "rename_category"; processArea: string; from: string; to: string }
  | {
      type: "move_category";
      processArea: string;
      category: string;
      toProcessArea: string;
    }
  | {
      type: "move_activity";
      activityId: string;
      processArea: string;
      category: string;
    }
  | {
      type: "update_activity";
      activityId: string;
      patch: Partial<ActivityLibraryRow>;
    }
  | { type: "add_activity"; row: ActivityLibraryRow }
  | { type: "deactivate_activity"; activityId: string }
  | { type: "deactivate_activities"; activityIds: string[] }
  | {
      type: "merge_activities";
      sourceActivityIds: string[];
      targetActivityId: string;
    };

export interface WorkCapabilityTaxonomyMutationImpact {
  activityRows: number;
  assignmentRows: number;
  skillRequirementRows: number;
  analyticsRecomputed: string[];
}

export interface WorkCapabilityTaxonomyChangeRecord {
  id: string;
  action: TaxonomyMutation["type"];
  target: string;
  affected: WorkCapabilityTaxonomyMutationImpact;
  timestamp: string;
}

export interface WorkCapabilityActivityMergeRecord {
  merge_id: string;
  survivor_activity_id: string;
  merged_activity_ids: string[];
  merged_activity_names: string[];
  assignments_moved: number;
  skill_requirements_moved: number;
  created_at: string;
}

export interface WorkCapabilityHardDeleteGuard {
  allowed: boolean;
  reason: string;
  assignmentRows: number;
  skillRequirementRows: number;
}

export type WorkCapabilityTaxonomyGraphNodeKind =
  | "root"
  | "domain"
  | "category"
  | "process"
  | "activity";

export interface WorkCapabilityTaxonomyGraphNode {
  id: string;
  kind: WorkCapabilityTaxonomyGraphNodeKind;
  label: string;
  depth: number;
  order: number;
  domain?: string;
  processArea?: string;
  category?: string;
  activityId?: string;
  parentId?: string;
  activityCount: number;
  categoryCount: number;
  processCount?: number;
  criticality?: string;
  nature?: string;
  automationPct?: number;
  outsourcingPct?: number;
  active: boolean;
  selected: boolean;
  expanded: boolean;
}

export interface WorkCapabilityTaxonomyGraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface WorkCapabilityTaxonomyGraph {
  nodes: WorkCapabilityTaxonomyGraphNode[];
  edges: WorkCapabilityTaxonomyGraphEdge[];
}

export type WorkCapabilitySkillRisk = "High" | "Medium" | "Low" | "Unknown";

export interface WorkCapabilityDeliveryFootprintRow {
  assignmentId: string;
  employeeId: string;
  employeeName: string;
  role: string;
  department: string;
  grade: string;
  timeAllocationPct: number;
  costContribution: number;
  fteContribution: number;
  accountability: string;
}

export interface WorkCapabilityRequiredSkillRow {
  skillId: string;
  skillName: string;
  requiredLevel: number;
  coveragePct: number | null;
  gap: WorkCapabilitySkillRisk;
}

export interface WorkCapabilityActivityMetric {
  activityId: string;
  activityName: string;
  domain: string;
  processArea: string;
  category: string;
  nature: string;
  criticality: string;
  complexity: string;
  frequency: string;
  automationCostReductionPct: number;
  outsourcingCostReductionPct: number;
  active: boolean;
  totalCost: number;
  totalFTE: number;
  assignedPeople: number;
  departmentsInvolved: number;
  accountableCount: number;
  responsibleCount: number;
  automationSaving: number;
  outsourcingSaving: number;
  skillRisk: WorkCapabilitySkillRisk;
  deliveryFootprint: WorkCapabilityDeliveryFootprintRow[];
  requiredSkills: WorkCapabilityRequiredSkillRow[];
}

export interface WorkCapabilityPortfolioTreeNode {
  id: string;
  label: string;
  kind: "domain" | "category" | "process";
  domain: string;
  processArea: string;
  category?: string;
  activityCount: number;
  categoryCount: number;
  processCount: number;
  criticalActivityCount: number;
  totalCost: number;
  totalFTE: number;
}

export interface WorkCapabilityActivityPortfolio {
  kpis: {
    totalActivities: number;
    criticalActivities: number;
    mappedCost: number;
    mappedFTE: number;
    ownershipGaps: number;
    automationSaving: number;
  };
  tree: WorkCapabilityPortfolioTreeNode[];
  activities: WorkCapabilityActivityMetric[];
  filterOptions: {
    departments: string[];
    domains: string[];
    processAreas: string[];
    categories: string[];
    criticalities: string[];
    natures: string[];
    skillRisks: WorkCapabilitySkillRisk[];
  };
}

export type ActivityAnalysisRiskFlag =
  | "Ownership gap"
  | "Fragmented activity"
  | "High cost transactional work"
  | "Seniority mismatch"
  | "Automation candidate"
  | "Outsourcing caution";

export type EmployeeWorkloadStatus =
  | "Severe overload"
  | "Overload"
  | "Normal"
  | "Under-mapped";

export interface ActivityAnalysisEmployeeMetric {
  employeeId: string;
  employeeName: string;
  role: string;
  department: string;
  totalWorkloadPct: number;
  mappedCost: number;
  mappedFTE: number;
  activityCount: number;
  workloadStatus: EmployeeWorkloadStatus;
}

export interface ActivityAnalysisActivityMetric {
  activityId: string;
  activityName: string;
  domain: string;
  processArea: string;
  category: string;
  nature: string;
  criticality: string;
  complexity: string;
  frequency: string;
  departmentFocus: string;
  activityCost: number;
  activityFte: number;
  assignedPeople: number;
  departmentsInvolved: number;
  accountableCount: number;
  responsibleCount: number;
  consultedCount: number;
  informedCount: number;
  automationCostReductionPct: number;
  outsourcingCostReductionPct: number;
  automationSaving: number;
  outsourcingSaving: number;
  avgGrade: number | null;
  riskFlags: ActivityAnalysisRiskFlag[];
  deliveryFootprint: WorkCapabilityDeliveryFootprintRow[];
}

export interface ActivityAnalysisPortfolio {
  kpis: {
    totalMappedCost: number;
    totalMappedFTE: number;
    totalActivities: number;
    totalAssignedPeople: number;
    overloadedEmployees: number;
    ownershipGaps: number;
    automationSaving: number;
    outsourcingSaving: number;
  };
  activities: ActivityAnalysisActivityMetric[];
  employees: ActivityAnalysisEmployeeMetric[];
  filterOptions: {
    departments: string[];
    domains: string[];
    processAreas: string[];
    categories: string[];
    criticalities: string[];
    natures: string[];
    riskFlags: ActivityAnalysisRiskFlag[];
  };
}

export type SkillGapStatus = "Covered" | "Minor gap" | "Major gap";
export type RoleReadinessStatus =
  | "Ready"
  | "Minor gaps"
  | "Development needed"
  | "High capability risk";
export type ActivitySkillRisk = "High" | "Medium" | "Low" | "Unknown";
export type SinglePointRisk = "High" | "Medium" | "Low";

export interface SkillsCapabilitySkillMetric {
  skillId: string;
  skillName: string;
  skillFamily: string;
  criticality: string;
  employeesWithSkill: number;
  employeesAtLevel3Plus: number;
  employeesAtLevel4Plus: number;
  departmentsCovered: number;
  activitiesRequiringSkill: number;
  rolesRequiringSkill: number;
  singlePointRisk: SinglePointRisk;
}

export interface SkillsCapabilityRoleMetric {
  employeeId: string;
  employeeName: string;
  role: string;
  department: string;
  grade: string;
  requiredSkills: number;
  coveredSkills: number;
  minorGaps: number;
  majorGaps: number;
  criticalGaps: number;
  readinessScore: number;
  riskStatus: RoleReadinessStatus;
  skillDetails: {
    skillId: string;
    skillName: string;
    requiredLevel: number;
    currentLevel: number;
    gap: number;
    gapStatus: SkillGapStatus;
    criticality: string;
  }[];
  activitiesImpacted: string[];
}

export interface SkillsCapabilityActivityMetric {
  activityId: string;
  activityName: string;
  criticality: string;
  assignedPeople: number;
  requiredSkills: number;
  lowestSkillCoveragePct: number;
  majorSkillGaps: number;
  skillRisk: ActivitySkillRisk;
  costAtRisk: number;
  fteAtRisk: number;
  skillCoverageDetails: {
    skillId: string;
    skillName: string;
    requiredLevel: number;
    coveragePct: number;
    employeesMeetingLevel: number;
    totalAssigned: number;
  }[];
}

export interface SkillsCapabilityPortfolio {
  kpis: {
    criticalSkills: number;
    majorSkillGaps: number;
    averageReadiness: number;
    rolesBelow70PctReadiness: number;
    activitiesAtSkillRisk: number;
    singlePointCriticalSkills: number;
    unvalidatedSyntheticSkills: number;
  };
  skills: SkillsCapabilitySkillMetric[];
  roles: SkillsCapabilityRoleMetric[];
  activities: SkillsCapabilityActivityMetric[];
  filterOptions: {
    departments: string[];
    skillFamilies: string[];
    criticalities: string[];
    riskStatuses: RoleReadinessStatus[];
    skillRisks: ActivitySkillRisk[];
  };
}

export type SuccessionCandidateStatus =
  | "Suggested"
  | "Selected"
  | "Rejected"
  | "Backup";
export type SuccessionReadinessStatus =
  | "Ready Now"
  | "Ready Soon"
  | "Development Needed"
  | "Not Recommended";
export type SuccessionRiskStatus = "High" | "Medium" | "Low";
export type SuccessionConflictRisk =
  | "None"
  | "Attention"
  | "High conflict"
  | "Review required"
  | "Capacity risk"
  | "Backfill risk";

export interface SuccessionCandidateRecord {
  target_employee_id: string;
  candidate_employee_id: string;
  readiness_score: number;
  readiness_status: SuccessionReadinessStatus;
  rank: number;
  status: SuccessionCandidateStatus;
  selected_flag: boolean;
  already_selected_count: number;
  attention_flag: boolean;
  attention_reason: string;
}

export interface SuccessionSkillGapDetail {
  skillId: string;
  skillName: string;
  requiredLevel: number;
  currentLevel: number;
  criticality: string;
  gap: number;
  gapStatus: SkillGapStatus;
}

export interface SuccessionCriticalActivity {
  activityId: string;
  activityName: string;
  criticality: string;
  timeAllocationPct: number;
  accountability: string;
}

export interface SuccessionCriticalRoleMetric {
  employeeId: string;
  employeeName: string;
  role: string;
  department: string;
  grade: string;
  span: number;
  loadedCost: number;
  currentWorkloadPct: number;
  criticalityScore: number;
  criticalActivitiesOwned: number;
  criticalActivityDetails: SuccessionCriticalActivity[];
  criticalSkillsHeld: number;
  requiredCriticalSkills: number;
  successorCount: number;
  bestSuccessorReadiness: number;
  successionRisk: SuccessionRiskStatus;
  riskReasons: string[];
}

export interface SuccessionCandidateMetric {
  targetEmployeeId: string;
  candidateEmployeeId: string;
  candidateName: string;
  currentRole: string;
  department: string;
  grade: string;
  readinessScore: number;
  readinessStatus: SuccessionReadinessStatus;
  rank: number;
  status: SuccessionCandidateStatus;
  selectedFlag: boolean;
  coveredSkills: number;
  minorGaps: number;
  majorGaps: number;
  criticalGaps: number;
  currentWorkloadPct: number;
  alreadySelectedFor: number;
  attentionFlag: boolean;
  attentionReason: string;
  skillDetails: SuccessionSkillGapDetail[];
}

export interface SuccessionLoadMetric {
  candidateEmployeeId: string;
  candidateName: string;
  selectedTargetRoles: string[];
  selectedTargetCount: number;
  averageReadiness: number;
  currentWorkloadPct: number;
  conflictRisk: SuccessionConflictRisk;
  recommendedAction: string;
}

export interface SuccessionPlanningPortfolio {
  kpis: {
    criticalRoles: number;
    rolesWithoutSuccessor: number;
    rolesWithOneSuccessor: number;
    averageSuccessorReadiness: number;
    highRiskRoles: number;
    duplicateSuccessorFlags: number;
    criticalActivityDependency: number;
  };
  criticalRoles: SuccessionCriticalRoleMetric[];
  candidates: SuccessionCandidateMetric[];
  successorLoads: SuccessionLoadMetric[];
  filterOptions: {
    departments: string[];
    riskStatuses: SuccessionRiskStatus[];
    readinessStatuses: SuccessionReadinessStatus[];
    candidateStatuses: SuccessionCandidateStatus[];
  };
}

export interface SuccessionPlanningPortfolioInput
  extends WorkCapabilityActivityPortfolioInput {
  successionCandidates?: SuccessionCandidateRecord[];
}

export interface WorkCapabilityArchiveImpact {
  activityCount: number;
  assignedPeople: number;
  totalCost: number;
  totalFTE: number;
  skillRequirements: number;
  accountabilityLinks: number;
}

export interface WorkCapabilityMergeImpact {
  assignmentsMoved: number;
  skillRequirementsMerged: number;
  duplicateSkillRequirementsDeduped: number;
  costAffected: number;
  fteAffected: number;
}

export type WorkCapabilityCleanupSuggestionType =
  | "possible_duplicate"
  | "single_child_chain"
  | "unassigned_activity"
  | "missing_skill_requirements"
  | "missing_accountable_owner"
  | "archived_count";

export interface WorkCapabilityTaxonomyCleanupSuggestion {
  id: string;
  type: WorkCapabilityCleanupSuggestionType;
  severity: "High" | "Medium" | "Low";
  title: string;
  description: string;
  activityIds: string[];
  count: number;
  actions: Array<"Review" | "Merge" | "Archive" | "Add Skills">;
}

export interface WorkCapabilityActivityPortfolioInput {
  dataset: WorkCapabilityDataset;
  orgRows: ExcelRow[];
  orgEmployeeIdColumn: string;
  columnMapping?: ColumnMapping | null;
  includeArchived?: boolean;
}

export interface WorkCapabilityTaxonomyGraphOptions {
  selectedNodeId?: string | null;
  searchQuery?: string;
  showInactive?: boolean;
}

export interface WorkCapabilityNormalizationRecord {
  id: string;
  datasetType: WorkCapabilityDatasetType;
  field: string;
  rawValue: string;
  suggestedValue: string;
  normalizedValue: string;
  rowCount: number;
  firstRowNumber: number;
  status: WorkCapabilityNormalizationStatus;
  acceptedValues: string[];
  confidence: number;
  reason: string;
}

export interface WorkCapabilityNormalizationSummary {
  totalGroups: number;
  autoApplied: number;
  needsReview: number;
  approved: number;
  ignored: number;
  records: WorkCapabilityNormalizationRecord[];
}

type FieldKind = "string" | "number" | "integer" | "boolean" | "enum";

interface FieldSpec {
  required?: boolean;
  type: FieldKind;
  values?: string[];
  min?: number;
  max?: number;
}

interface DatasetSpec {
  primaryKey: string;
  requiredHeaders: string[];
  fields: Record<string, FieldSpec>;
}

const DATASET_ORDER: WorkCapabilityDatasetType[] = [
  "activity_library",
  "activity_assignments",
  "skill_library",
  "role_skill_requirements",
  "employee_skills",
  "activity_skill_requirements",
];

const SPECS: Record<WorkCapabilityDatasetType, DatasetSpec> = {
  activity_library: {
    primaryKey: "activity_id",
    requiredHeaders: [
      "activity_id",
      "activity_name",
      "department_focus",
      "activity_category",
      "process_area",
      "nature",
      "criticality",
      "automation_cost_reduction_pct",
      "outsourcing_cost_reduction_pct",
      "complexity",
      "frequency",
      "active_flag",
    ],
    fields: {
      activity_id: { type: "string", required: true },
      activity_name: { type: "string", required: true },
      department_focus: { type: "string", required: true },
      activity_category: { type: "string", required: true },
      process_area: { type: "string", required: true },
      nature: {
        type: "enum",
        required: true,
        values: ["Strategic", "Operational", "Transactional", "Governance"],
      },
      criticality: {
        type: "enum",
        required: true,
        values: ["Low", "Medium", "High"],
      },
      automation_cost_reduction_pct: { type: "number", required: true },
      outsourcing_cost_reduction_pct: { type: "number", required: true },
      complexity: {
        type: "enum",
        required: true,
        values: ["Low", "Medium", "High"],
      },
      frequency: {
        type: "enum",
        required: true,
        values: ["Daily", "Weekly", "Monthly", "Quarterly", "Ad hoc"],
      },
      active_flag: { type: "boolean", required: true },
    },
  },
  activity_assignments: {
    primaryKey: "assignment_id",
    requiredHeaders: [
      "assignment_id",
      "employee_id",
      "activity_id",
      "time_allocation_pct",
      "accountability",
      "assignment_source",
      "validated",
    ],
    fields: {
      assignment_id: { type: "string", required: true },
      employee_id: { type: "string", required: true },
      activity_id: { type: "string", required: true },
      time_allocation_pct: { type: "number", required: true },
      accountability: {
        type: "enum",
        required: true,
        values: ["Responsible", "Accountable", "Consulted", "Informed"],
      },
      assignment_source: {
        type: "enum",
        required: true,
        values: ["Synthetic", "Manual", "AI-Suggested", "Imported"],
      },
      confidence_score: { type: "number" },
      validated: { type: "boolean", required: true },
    },
  },
  skill_library: {
    primaryKey: "skill_id",
    requiredHeaders: [
      "skill_id",
      "skill_name",
      "skill_family",
      "skill_category",
      "skill_type",
      "criticality",
      "proficiency_scale",
      "active_flag",
    ],
    fields: {
      skill_id: { type: "string", required: true },
      skill_name: { type: "string", required: true },
      skill_family: { type: "string", required: true },
      skill_category: { type: "string", required: true },
      skill_type: {
        type: "enum",
        required: true,
        values: [
          "Technical",
          "Functional",
          "Leadership",
          "Analytical",
          "Process",
          "Behavioral",
        ],
      },
      criticality: {
        type: "enum",
        required: true,
        values: ["Low", "Medium", "High"],
      },
      proficiency_scale: { type: "string", required: true },
      active_flag: { type: "boolean", required: true },
    },
  },
  role_skill_requirements: {
    primaryKey: "requirement_id",
    requiredHeaders: [
      "requirement_id",
      "role_key",
      "position_title",
      "department",
      "skill_id",
      "required_level",
      "criticality",
      "requirement_source",
      "validated",
      "active_flag",
    ],
    fields: {
      requirement_id: { type: "string", required: true },
      role_key: { type: "string", required: true },
      position_title: { type: "string", required: true },
      department: { type: "string", required: true },
      role_level: {
        type: "enum",
        values: [
          "Executive",
          "Director",
          "Manager",
          "Lead",
          "Individual Contributor",
          "Analyst",
          "Specialist",
        ],
      },
      skill_id: { type: "string", required: true },
      required_level: { type: "integer", required: true, min: 1, max: 5 },
      criticality: {
        type: "enum",
        required: true,
        values: ["Low", "Medium", "High"],
      },
      requirement_source: {
        type: "enum",
        required: true,
        values: ["Synthetic", "Manual", "AI-Suggested", "Imported"],
      },
      validated: { type: "boolean", required: true },
      active_flag: { type: "boolean", required: true },
    },
  },
  employee_skills: {
    primaryKey: "employee_skill_id",
    requiredHeaders: [
      "employee_skill_id",
      "employee_id",
      "skill_id",
      "current_level",
      "evidence_source",
      "validated",
      "synthetic_flag",
    ],
    fields: {
      employee_skill_id: { type: "string", required: true },
      employee_id: { type: "string", required: true },
      skill_id: { type: "string", required: true },
      current_level: { type: "integer", required: true, min: 1, max: 5 },
      required_level: { type: "integer", min: 1, max: 5 },
      skill_gap: { type: "integer" },
      gap_status: {
        type: "enum",
        values: ["Covered", "Minor gap", "Major gap"],
      },
      criticality: { type: "enum", values: ["Low", "Medium", "High"] },
      evidence_source: {
        type: "enum",
        required: true,
        values: [
          "Synthetic",
          "Manual",
          "Manager",
          "Certification",
          "AI-Suggested",
          "Imported",
        ],
      },
      confidence_score: { type: "number" },
      validated: { type: "boolean", required: true },
      synthetic_flag: { type: "boolean", required: true },
    },
  },
  activity_skill_requirements: {
    primaryKey: "activity_skill_requirement_id",
    requiredHeaders: [
      "activity_skill_requirement_id",
      "activity_id",
      "skill_id",
      "required_level",
      "criticality",
      "relationship_type",
      "weight",
      "requirement_source",
      "validated",
      "active_flag",
    ],
    fields: {
      activity_skill_requirement_id: { type: "string", required: true },
      activity_id: { type: "string", required: true },
      skill_id: { type: "string", required: true },
      required_level: { type: "integer", required: true, min: 1, max: 5 },
      criticality: {
        type: "enum",
        required: true,
        values: ["Low", "Medium", "High"],
      },
      relationship_type: {
        type: "enum",
        required: true,
        values: ["Primary", "Supporting", "Governance", "Enabling"],
      },
      weight: { type: "number", required: true },
      requirement_source: {
        type: "enum",
        required: true,
        values: ["Synthetic", "Manual", "AI-Suggested", "Imported"],
      },
      validated: { type: "boolean", required: true },
      active_flag: { type: "boolean", required: true },
    },
  },
};

const NORMALIZED_SUFFIX = "_normalized";

const NORMALIZATION_ALIASES: Record<
  string,
  { value: string; confidence: number; reason: string }
> = {
  "assignment_source|synthetic role/department rule": {
    value: "Synthetic",
    confidence: 0.98,
    reason: "Rule-generated source label maps to Synthetic.",
  },
  "requirement_source|synthetic rule-based from title, department, grade": {
    value: "Synthetic",
    confidence: 0.98,
    reason: "Rule-generated source label maps to Synthetic.",
  },
  "requirement_source|synthetic keyword + department rule": {
    value: "Synthetic",
    confidence: 0.98,
    reason: "Rule-generated source label maps to Synthetic.",
  },
  "evidence_source|synthetic-role-inferred": {
    value: "Synthetic",
    confidence: 0.98,
    reason: "Synthetic evidence subtype maps to Synthetic.",
  },
  "evidence_source|synthetic-manager-proxy": {
    value: "Synthetic",
    confidence: 0.98,
    reason: "Synthetic evidence subtype maps to Synthetic.",
  },
  "evidence_source|synthetic-performance-adjusted": {
    value: "Synthetic",
    confidence: 0.98,
    reason: "Synthetic evidence subtype maps to Synthetic.",
  },
  "evidence_source|synthetic-latent-skill": {
    value: "Synthetic",
    confidence: 0.98,
    reason: "Synthetic evidence subtype maps to Synthetic.",
  },
  "skill_type|business": {
    value: "Functional",
    confidence: 0.9,
    reason: "Business skills are treated as functional capability skills.",
  },
  "skill_type|soft": {
    value: "Behavioral",
    confidence: 0.9,
    reason: "Soft skills map to Behavioral in the app taxonomy.",
  },
  "role_level|ic": {
    value: "Individual Contributor",
    confidence: 0.98,
    reason: "IC is the standard abbreviation for Individual Contributor.",
  },
  "role_level|senior ic": {
    value: "Individual Contributor",
    confidence: 0.92,
    reason: "Senior IC is still grouped as Individual Contributor.",
  },
  "role_level|senior leader": {
    value: "Executive",
    confidence: 0.85,
    reason: "Senior leader is grouped with Executive for high-level planning.",
  },
  "gap_status|not required / adjacent": {
    value: "Not Required",
    confidence: 0.95,
    reason:
      "Adjacent skills that are not required use a custom Not Required category.",
  },
  "relationship_type|optional": {
    value: "Optional",
    confidence: 0.95,
    reason:
      "Optional is a custom relationship category preserved for planning.",
  },
};

function idForDataset(): string {
  return `work_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function idForTaxonomyChange(): string {
  return `tax_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function rowValue(row: ExcelRow, field: string): unknown {
  return row[field];
}

function textValue(row: ExcelRow, field: string): string {
  const value = rowValue(row, field);
  return value == null ? "" : String(value).trim();
}

function isBlank(value: unknown): boolean {
  return value == null || String(value).trim() === "";
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(normalized)) return true;
    if (["false", "no", "n", "0"].includes(normalized)) return false;
  }
  return null;
}

function emptyLoaded(): Record<WorkCapabilityDatasetType, number> {
  return {
    activity_library: 0,
    activity_assignments: 0,
    skill_library: 0,
    role_skill_requirements: 0,
    employee_skills: 0,
    activity_skill_requirements: 0,
  };
}

function byType(
  files: ParsedWorkCapabilityFile[],
): Partial<Record<WorkCapabilityDatasetType, ParsedWorkCapabilityFile>> {
  const output: Partial<
    Record<WorkCapabilityDatasetType, ParsedWorkCapabilityFile>
  > = {};
  for (const file of files) {
    const detected =
      file.datasetType ?? detectWorkCapabilityDataset(file.headers);
    if (detected && !output[detected]) {
      output[detected] = { ...file, datasetType: detected };
    }
  }
  return output;
}

function rowNumber(index: number): number {
  return index + 2;
}

export function detectWorkCapabilityDataset(
  headers: string[],
): WorkCapabilityDatasetType | null {
  const headerSet = new Set(headers);
  let best: { type: WorkCapabilityDatasetType; score: number } | null = null;
  for (const type of DATASET_ORDER) {
    const score = SPECS[type].requiredHeaders.filter((header) =>
      headerSet.has(header),
    ).length;
    if (score === SPECS[type].requiredHeaders.length) return type;
    if (!best || score > best.score) best = { type, score };
  }
  return best && best.score >= 3 ? best.type : null;
}

function labelKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizationRecordId(
  type: WorkCapabilityDatasetType,
  field: string,
  rawValue: string,
): string {
  return `${type}:${field}:${encodeURIComponent(labelKey(rawValue))}`;
}

function enumFieldsFor(
  type: WorkCapabilityDatasetType,
): Array<[string, FieldSpec]> {
  return Object.entries(SPECS[type].fields).filter(
    ([, spec]) => spec.type === "enum" && spec.values,
  );
}

function emptyNormalization(
  records: WorkCapabilityNormalizationRecord[] = [],
): WorkCapabilityNormalizationSummary {
  return {
    totalGroups: records.length,
    autoApplied: records.filter((record) => record.status === "auto_applied")
      .length,
    needsReview: records.filter((record) => record.status === "needs_review")
      .length,
    approved: records.filter((record) => record.status === "approved").length,
    ignored: records.filter((record) => record.status === "ignored").length,
    records,
  };
}

function buildNormalizationSummary(
  filesByType: Partial<
    Record<WorkCapabilityDatasetType, ParsedWorkCapabilityFile>
  >,
): WorkCapabilityNormalizationSummary {
  const byId = new Map<string, WorkCapabilityNormalizationRecord>();

  for (const type of DATASET_ORDER) {
    const rows = filesByType[type]?.rows ?? [];
    for (const [field, spec] of enumFieldsFor(type)) {
      const acceptedValues = spec.values ?? [];
      rows.forEach((row, index) => {
        const rawValue = textValue(row, field);
        if (!rawValue || acceptedValues.includes(rawValue)) return;

        const id = normalizationRecordId(type, field, rawValue);
        const alias = NORMALIZATION_ALIASES[`${field}|${labelKey(rawValue)}`];
        const existing = byId.get(id);
        if (existing) {
          existing.rowCount += 1;
          return;
        }

        byId.set(id, {
          id,
          datasetType: type,
          field,
          rawValue,
          suggestedValue: alias?.value ?? "",
          normalizedValue: alias?.value ?? "",
          rowCount: 1,
          firstRowNumber: rowNumber(index),
          status: alias ? "auto_applied" : "needs_review",
          acceptedValues,
          confidence: alias?.confidence ?? 0,
          reason:
            alias?.reason ??
            "No trusted normalization rule exists yet; review before using this value in analytics.",
        });
      });
    }
  }

  return emptyNormalization(
    [...byId.values()].sort((a, b) => {
      const typeOrder =
        DATASET_ORDER.indexOf(a.datasetType) -
        DATASET_ORDER.indexOf(b.datasetType);
      if (typeOrder !== 0) return typeOrder;
      if (a.field !== b.field) return a.field.localeCompare(b.field);
      return a.rawValue.localeCompare(b.rawValue);
    }),
  );
}

function normalizationByRecord(
  summary: WorkCapabilityNormalizationSummary,
): Map<string, WorkCapabilityNormalizationRecord> {
  return new Map(summary.records.map((record) => [record.id, record]));
}

function normalizedValueFor(
  type: WorkCapabilityDatasetType,
  field: string,
  rawValue: string,
  acceptedValues: string[],
  records: Map<string, WorkCapabilityNormalizationRecord>,
): string {
  if (!rawValue) return "";
  if (acceptedValues.includes(rawValue)) return rawValue;
  const record = records.get(normalizationRecordId(type, field, rawValue));
  if (!record) return "";
  if (record.status === "auto_applied" || record.status === "approved") {
    return record.normalizedValue || record.suggestedValue || "";
  }
  return "";
}

function normalizeRowsForType<T extends ExcelRow>(
  type: WorkCapabilityDatasetType,
  rows: ExcelRow[],
  summary: WorkCapabilityNormalizationSummary,
): T[] {
  const records = normalizationByRecord(summary);
  return clone(rows).map((row: ExcelRow) => {
    for (const [field, spec] of enumFieldsFor(type)) {
      const rawValue = textValue(row, field);
      row[`${field}${NORMALIZED_SUFFIX}`] = normalizedValueFor(
        type,
        field,
        rawValue,
        spec.values ?? [],
        records,
      );
    }
    return row;
  }) as T[];
}

function applyNormalizationToDataset(
  dataset: WorkCapabilityDataset,
): WorkCapabilityDataset {
  return {
    ...dataset,
    shared: {
      activityLibrary: normalizeRowsForType<ActivityLibraryRow>(
        "activity_library",
        dataset.shared.activityLibrary,
        dataset.normalization,
      ),
      skillLibrary: normalizeRowsForType<SkillLibraryRow>(
        "skill_library",
        dataset.shared.skillLibrary,
        dataset.normalization,
      ),
      activitySkillRequirements:
        normalizeRowsForType<ActivitySkillRequirementRow>(
          "activity_skill_requirements",
          dataset.shared.activitySkillRequirements,
          dataset.normalization,
        ),
    },
    states: {
      asIs: {
        ...dataset.states.asIs,
        activityAssignments: normalizeRowsForType<ActivityAssignmentRow>(
          "activity_assignments",
          dataset.states.asIs.activityAssignments,
          dataset.normalization,
        ),
        roleSkillRequirements: normalizeRowsForType<RoleSkillRequirementRow>(
          "role_skill_requirements",
          dataset.states.asIs.roleSkillRequirements,
          dataset.normalization,
        ),
        employeeSkills: normalizeRowsForType<EmployeeSkillRow>(
          "employee_skills",
          dataset.states.asIs.employeeSkills,
          dataset.normalization,
        ),
      },
      toBe: dataset.states.toBe
        ? {
            ...dataset.states.toBe,
            activityAssignments: normalizeRowsForType<ActivityAssignmentRow>(
              "activity_assignments",
              dataset.states.toBe.activityAssignments,
              dataset.normalization,
            ),
            roleSkillRequirements:
              normalizeRowsForType<RoleSkillRequirementRow>(
                "role_skill_requirements",
                dataset.states.toBe.roleSkillRequirements,
                dataset.normalization,
              ),
            employeeSkills: normalizeRowsForType<EmployeeSkillRow>(
              "employee_skills",
              dataset.states.toBe.employeeSkills,
              dataset.normalization,
            ),
          }
        : undefined,
    },
  };
}

const TAXONOMY_RECOMPUTE_SURFACES = [
  "Process Taxonomy",
  "Activity Analysis",
  "Cost & FTE",
  "Automation Impact",
  "Skills & Capability",
  "AI Analyst",
];

function stateAssignmentRows(
  dataset: WorkCapabilityDataset,
): ActivityAssignmentRow[] {
  return [
    ...dataset.states.asIs.activityAssignments,
    ...(dataset.states.toBe?.activityAssignments ?? []),
  ];
}

function countAssignmentsForActivities(
  dataset: WorkCapabilityDataset,
  activityIds: Set<string>,
): number {
  return stateAssignmentRows(dataset).filter((row) =>
    activityIds.has(textValue(row, "activity_id")),
  ).length;
}

function countSkillRequirementsForActivities(
  dataset: WorkCapabilityDataset,
  activityIds: Set<string>,
): number {
  return dataset.shared.activitySkillRequirements.filter((row) =>
    activityIds.has(textValue(row, "activity_id")),
  ).length;
}

function requireActivity(
  dataset: WorkCapabilityDataset,
  activityId: string,
): ActivityLibraryRow {
  const activity = dataset.shared.activityLibrary.find(
    (row) => textValue(row, "activity_id") === activityId,
  );
  if (!activity)
    throw new Error(
      `activity_id ${activityId} does not exist in activity_library`,
    );
  return activity;
}

function taxonomyImpact(
  activityRows: number,
  assignmentRows: number,
  skillRequirementRows: number,
): WorkCapabilityTaxonomyMutationImpact {
  return {
    activityRows,
    assignmentRows,
    skillRequirementRows,
    analyticsRecomputed: TAXONOMY_RECOMPUTE_SURFACES,
  };
}

export function getWorkCapabilityTaxonomyMutationImpact(
  dataset: WorkCapabilityDataset,
  mutation: TaxonomyMutation,
): WorkCapabilityTaxonomyMutationImpact {
  if (mutation.type === "rename_process") {
    const activityIds = new Set(
      dataset.shared.activityLibrary
        .filter((row) => textValue(row, "process_area") === mutation.from)
        .map((row) => textValue(row, "activity_id")),
    );
    return taxonomyImpact(activityIds.size, 0, 0);
  }

  if (mutation.type === "rename_category") {
    const activityIds = new Set(
      dataset.shared.activityLibrary
        .filter(
          (row) =>
            textValue(row, "process_area") === mutation.processArea &&
            textValue(row, "activity_category") === mutation.from,
        )
        .map((row) => textValue(row, "activity_id")),
    );
    return taxonomyImpact(activityIds.size, 0, 0);
  }

  if (mutation.type === "move_category") {
    const activityIds = new Set(
      dataset.shared.activityLibrary
        .filter(
          (row) =>
            textValue(row, "process_area") === mutation.processArea &&
            textValue(row, "activity_category") === mutation.category,
        )
        .map((row) => textValue(row, "activity_id")),
    );
    return taxonomyImpact(activityIds.size, 0, 0);
  }

  if (mutation.type === "add_activity") {
    return taxonomyImpact(1, 0, 0);
  }

  if (
    mutation.type === "move_activity" ||
    mutation.type === "update_activity"
  ) {
    requireActivity(dataset, mutation.activityId);
    return taxonomyImpact(1, 0, 0);
  }

  if (mutation.type === "deactivate_activity") {
    requireActivity(dataset, mutation.activityId);
    const activityIds = new Set([mutation.activityId]);
    return taxonomyImpact(
      1,
      countAssignmentsForActivities(dataset, activityIds),
      countSkillRequirementsForActivities(dataset, activityIds),
    );
  }

  if (mutation.type === "deactivate_activities") {
    const activityIds = new Set(mutation.activityIds);
    for (const activityId of activityIds) requireActivity(dataset, activityId);
    return taxonomyImpact(
      activityIds.size,
      countAssignmentsForActivities(dataset, activityIds),
      countSkillRequirementsForActivities(dataset, activityIds),
    );
  }

  if (mutation.type === "merge_activities") {
    requireActivity(dataset, mutation.targetActivityId);
    const sourceIds = new Set(
      mutation.sourceActivityIds.filter(
        (id) => id !== mutation.targetActivityId,
      ),
    );
    for (const sourceId of sourceIds) requireActivity(dataset, sourceId);
    return taxonomyImpact(
      sourceIds.size,
      countAssignmentsForActivities(dataset, sourceIds),
      countSkillRequirementsForActivities(dataset, sourceIds),
    );
  }

  return taxonomyImpact(0, 0, 0);
}

export function canHardDeleteWorkCapabilityActivity(
  dataset: WorkCapabilityDataset,
  activityId: string,
): WorkCapabilityHardDeleteGuard {
  const activityIds = new Set([activityId]);
  const assignmentRows = countAssignmentsForActivities(dataset, activityIds);
  const skillRequirementRows = countSkillRequirementsForActivities(
    dataset,
    activityIds,
  );
  if (assignmentRows > 0 || skillRequirementRows > 0) {
    return {
      allowed: false,
      reason:
        "Hard delete is blocked because dependent rows exist; deactivate or merge the activity instead.",
      assignmentRows,
      skillRequirementRows,
    };
  }
  return {
    allowed: true,
    reason: "No dependent assignment or skill requirement rows exist.",
    assignmentRows,
    skillRequirementRows,
  };
}

function taxonomySegment(value: string): string {
  return value.replaceAll("::", " / ");
}

export function workCapabilityDomainNodeId(domain: string): string {
  return `domain::${taxonomySegment(domain)}`;
}

export function workCapabilityCategoryNodeId(
  domain: string,
  category: string,
): string {
  return `category::${taxonomySegment(domain)}::${taxonomySegment(category)}`;
}

export function workCapabilityProcessNodeId(
  domain: string,
  category: string,
  processArea: string,
): string {
  return `process::${taxonomySegment(domain)}::${taxonomySegment(category)}::${taxonomySegment(processArea)}`;
}

export function workCapabilityActivityNodeId(activityId: string): string {
  return `activity:${activityId}`;
}

function activityIsActive(row: ExcelRow): boolean {
  const value = row.active_flag;
  if (value == null || value === "") return true;
  return normalizeBoolean(value) ?? Boolean(value);
}

function criticalityRank(value: string): number {
  if (value === "High") return 3;
  if (value === "Medium") return 2;
  if (value === "Low") return 1;
  return 0;
}

function highestCriticality(rows: ActivityLibraryRow[]): string | undefined {
  return rows
    .map((row) => textValue(row, "criticality"))
    .filter(Boolean)
    .sort((a, b) => criticalityRank(b) - criticalityRank(a))[0];
}

function normalizeTaxonomyLabel(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function deriveWorkDomain(row: ActivityLibraryRow): string {
  const departmentFocus = textValue(row, "department_focus").trim();
  if (departmentFocus && departmentFocus.toLowerCase() !== "all")
    return departmentFocus;

  const category = textValue(row, "activity_category").trim();
  const processArea = textValue(row, "process_area").trim();
  const activityName = textValue(row, "activity_name").trim();
  const haystack = `${category} ${processArea} ${activityName}`.toLowerCase();

  if (
    /\b(data|analytics|report|reporting|dashboard|insight|bi)\b/.test(haystack)
  )
    return "Data & Analytics";
  if (
    /\b(transition|kt|knowledge transfer|vendor|service transfer)\b/.test(
      haystack,
    )
  )
    return "Transition Management";
  if (
    /\b(technology|engineering|application|development|platform|system)\b/.test(
      haystack,
    )
  )
    return "Technology Operations";
  if (/\b(governance|risk|audit|compliance|control)\b/.test(haystack))
    return "Governance & Risk";
  if (/\b(people|hr|talent|workforce|learning)\b/.test(haystack))
    return "People & Culture";
  if (/\b(finance|budget|procurement|invoice|billing)\b/.test(haystack))
    return "Finance";
  if (/\b(support|admin|operations|service|customer)\b/.test(haystack))
    return "Business Support";

  return normalizeTaxonomyLabel(category, "General Work");
}

function taxonomyMatches(row: ActivityLibraryRow, query: string): boolean {
  if (!query) return false;
  const haystack = [
    textValue(row, "activity_id"),
    textValue(row, "activity_name"),
    textValue(row, "department_focus"),
    textValue(row, "process_area"),
    textValue(row, "activity_category"),
    textValue(row, "criticality"),
    textValue(row, "nature"),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function buildWorkCapabilityTaxonomyGraph(
  dataset: WorkCapabilityDataset,
  options: WorkCapabilityTaxonomyGraphOptions = {},
): WorkCapabilityTaxonomyGraph {
  const selectedNodeId = options.selectedNodeId ?? "taxonomy-root";
  const query = (options.searchQuery ?? "").trim();
  const sourceRows = dataset.shared.activityLibrary.filter(
    (row) => options.showInactive || activityIsActive(row),
  );
  const matchedActivityIds = new Set(
    query
      ? sourceRows
          .filter((row) => taxonomyMatches(row, query))
          .map((row) => textValue(row, "activity_id"))
      : [],
  );

  const byDomain = new Map<
    string,
    Map<string, Map<string, ActivityLibraryRow[]>>
  >();
  for (const activity of sourceRows) {
    if (
      query &&
      matchedActivityIds.size > 0 &&
      !taxonomyMatches(activity, query)
    )
      continue;
    const domain = deriveWorkDomain(activity);
    const category = normalizeTaxonomyLabel(
      textValue(activity, "activity_category"),
      "Uncategorized",
    );
    const processArea = normalizeTaxonomyLabel(
      textValue(activity, "process_area"),
      "General Process",
    );
    if (!byDomain.has(domain)) byDomain.set(domain, new Map());
    const categories = byDomain.get(domain)!;
    if (!categories.has(category)) categories.set(category, new Map());
    const processes = categories.get(category)!;
    if (!processes.has(processArea)) processes.set(processArea, []);
    processes.get(processArea)!.push(activity);
  }

  const nodes: WorkCapabilityTaxonomyGraphNode[] = [
    {
      id: "taxonomy-root",
      kind: "root",
      label: "Work Taxonomy",
      depth: 0,
      order: 0,
      activityCount: sourceRows.length,
      categoryCount: Array.from(byDomain.values()).reduce(
        (sum, categories) => sum + categories.size,
        0,
      ),
      processCount: Array.from(byDomain.values()).reduce(
        (sum, categories) =>
          sum +
          Array.from(categories.values()).reduce(
            (inner, processes) => inner + processes.size,
            0,
          ),
        0,
      ),
      active: true,
      selected: selectedNodeId === "taxonomy-root",
      expanded: true,
    },
  ];
  const edges: WorkCapabilityTaxonomyGraphEdge[] = [];

  let domainOrder = 0;
  const sortedDomains = Array.from(byDomain.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [domain, categories] of sortedDomains) {
    const domainId = workCapabilityDomainNodeId(domain);
    const domainActivities = Array.from(categories.values()).flatMap(
      (processes) => Array.from(processes.values()).flat(),
    );
    const domainSelected = selectedNodeId === domainId;
    nodes.push({
      id: domainId,
      kind: "domain",
      label: domain,
      depth: 1,
      order: domainOrder++,
      domain,
      parentId: "taxonomy-root",
      activityCount: domainActivities.length,
      categoryCount: categories.size,
      processCount: Array.from(categories.values()).reduce(
        (sum, processes) => sum + processes.size,
        0,
      ),
      criticality: highestCriticality(domainActivities),
      active: true,
      selected: domainSelected,
      expanded: true,
    });
    edges.push({
      id: `taxonomy-root->${domainId}`,
      source: "taxonomy-root",
      target: domainId,
    });

    let categoryOrder = 0;
    const sortedCategories = Array.from(categories.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    for (const [category, processes] of sortedCategories) {
      const categoryId = workCapabilityCategoryNodeId(domain, category);
      const categoryActivities = Array.from(processes.values()).flat();
      const categorySelected = selectedNodeId === categoryId;
      const categoryHasSelectedActivity = categoryActivities.some(
        (row) =>
          selectedNodeId ===
          workCapabilityActivityNodeId(textValue(row, "activity_id")),
      );
      const expandCategory =
        query.length > 0 ||
        categorySelected ||
        categoryHasSelectedActivity ||
        Array.from(processes.keys()).some(
          (processArea) =>
            selectedNodeId ===
            workCapabilityProcessNodeId(domain, category, processArea),
        );
      nodes.push({
        id: categoryId,
        kind: "category",
        label: category,
        depth: 2,
        order: categoryOrder++,
        domain,
        category,
        parentId: domainId,
        activityCount: categoryActivities.length,
        categoryCount: 0,
        processCount: processes.size,
        criticality: highestCriticality(categoryActivities),
        active: true,
        selected: categorySelected,
        expanded: expandCategory,
      });
      edges.push({
        id: `${domainId}->${categoryId}`,
        source: domainId,
        target: categoryId,
      });

      let processOrder = 0;
      for (const [processArea, activities] of Array.from(
        processes.entries(),
      ).sort(([a], [b]) => a.localeCompare(b))) {
        const processId = workCapabilityProcessNodeId(
          domain,
          category,
          processArea,
        );
        const processSelected = selectedNodeId === processId;
        const processHasSelectedActivity = activities.some(
          (row) =>
            selectedNodeId ===
            workCapabilityActivityNodeId(textValue(row, "activity_id")),
        );
        const expandProcess =
          query.length > 0 ||
          categorySelected ||
          processSelected ||
          processHasSelectedActivity;
        nodes.push({
          id: processId,
          kind: "process",
          label: processArea,
          depth: 3,
          order: processOrder++,
          domain,
          category,
          processArea,
          parentId: categoryId,
          activityCount: activities.length,
          categoryCount: 0,
          processCount: 0,
          criticality: highestCriticality(activities),
          active: true,
          selected: processSelected,
          expanded: expandProcess,
        });
        edges.push({
          id: `${categoryId}->${processId}`,
          source: categoryId,
          target: processId,
        });

        if (!expandProcess) continue;
        activities
          .slice()
          .sort((a, b) =>
            textValue(a, "activity_name").localeCompare(
              textValue(b, "activity_name"),
            ),
          )
          .forEach((activity, index) => {
            const activityId = textValue(activity, "activity_id");
            const nodeId = workCapabilityActivityNodeId(activityId);
            nodes.push({
              id: nodeId,
              kind: "activity",
              label: textValue(activity, "activity_name") || activityId,
              depth: 4,
              order: index,
              domain,
              processArea,
              category,
              activityId,
              parentId: processId,
              activityCount: 1,
              categoryCount: 0,
              processCount: 0,
              criticality: textValue(activity, "criticality"),
              nature: textValue(activity, "nature"),
              automationPct:
                normalizeNumber(activity.automation_cost_reduction_pct) ?? 0,
              outsourcingPct:
                normalizeNumber(activity.outsourcing_cost_reduction_pct) ?? 0,
              active: activityIsActive(activity),
              selected: selectedNodeId === nodeId,
              expanded: false,
            });
            edges.push({
              id: `${processId}->${nodeId}`,
              source: processId,
              target: nodeId,
            });
          });
      }
    }
  }

  return { nodes, edges };
}

function mappedColumn(
  mapping: ColumnMapping | null | undefined,
  field: string,
): string | null {
  return mapping?.[field as keyof ColumnMapping]?.column ?? null;
}

function firstText(
  row: ExcelRow | undefined,
  fields: Array<string | null | undefined>,
): string {
  if (!row) return "";
  for (const field of fields) {
    if (!field) continue;
    const value = textValue(row, field);
    if (value) return value;
  }
  return "";
}

function firstNumber(
  row: ExcelRow | undefined,
  fields: Array<string | null | undefined>,
  fallback = 0,
): number {
  if (!row) return fallback;
  for (const field of fields) {
    if (!field) continue;
    const value = normalizeNumber(row[field]);
    if (value != null) return value;
  }
  return fallback;
}

function orgColumnCandidates(
  columnMapping: ColumnMapping | null | undefined,
  canonicalField: string,
  fallbacks: string[],
): Array<string | null | undefined> {
  return [mappedColumn(columnMapping, canonicalField), ...fallbacks];
}

function riskForCoverage(
  activityCriticality: string,
  coverages: Array<number | null>,
): WorkCapabilitySkillRisk {
  if (coverages.length === 0 || coverages.some((coverage) => coverage == null))
    return "Unknown";
  if (
    activityCriticality === "High" &&
    coverages.some((coverage) => (coverage ?? 0) < 50)
  )
    return "High";
  if (coverages.some((coverage) => (coverage ?? 0) < 80)) return "Medium";
  return "Low";
}

function normalizedLabelKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildWorkCapabilityActivityPortfolio(
  input: WorkCapabilityActivityPortfolioInput,
): WorkCapabilityActivityPortfolio {
  const includeArchived = input.includeArchived ?? false;
  const orgById = new Map(
    input.orgRows.map((row) => [
      textValue(row, input.orgEmployeeIdColumn),
      row,
    ]),
  );
  const assignments = input.dataset.states.asIs.activityAssignments;
  const employeeSkills = input.dataset.states.asIs.employeeSkills;
  const skillsById = new Map(
    input.dataset.shared.skillLibrary.map((row) => [
      textValue(row, "skill_id"),
      row,
    ]),
  );
  const skillRowsByEmployee = new Map<string, EmployeeSkillRow[]>();

  for (const skillRow of employeeSkills) {
    const employeeId = textValue(skillRow, "employee_id");
    if (!skillRowsByEmployee.has(employeeId))
      skillRowsByEmployee.set(employeeId, []);
    skillRowsByEmployee.get(employeeId)!.push(skillRow);
  }

  const nameFields = orgColumnCandidates(input.columnMapping, "Full Name", [
    "full_name",
    "name",
    "employee_name",
  ]);
  const roleFields = orgColumnCandidates(
    input.columnMapping,
    "Business Title",
    ["position_title", "title", "business_title"],
  );
  const departmentFields = orgColumnCandidates(
    input.columnMapping,
    "Department Name",
    ["department", "department_name", "dept"],
  );
  const gradeFields = orgColumnCandidates(
    input.columnMapping,
    "Compensation Grade",
    ["grade", "compensation_grade", "level"],
  );
  const costFields = [
    mappedColumn(input.columnMapping, "Annual Compensation"),
    mappedColumn(input.columnMapping, "Annual Rate"),
    "loaded_cost",
    "total_annual_compensation",
    "annual_compensation",
    "annual_rate",
    "salary",
  ];
  const fteFields = orgColumnCandidates(input.columnMapping, "FTE", [
    "FTE",
    "fte",
  ]);

  const activities = input.dataset.shared.activityLibrary
    .filter((activity) => includeArchived || activityIsActive(activity))
    .map((activity): WorkCapabilityActivityMetric => {
      const activityId = textValue(activity, "activity_id");
      const activityAssignments = assignments.filter(
        (row) => textValue(row, "activity_id") === activityId,
      );
      const employeeIds = new Set<string>();
      const departments = new Set<string>();
      let accountableCount = 0;
      let responsibleCount = 0;
      let totalCost = 0;
      let totalFTE = 0;

      const deliveryFootprint = activityAssignments.map(
        (assignment): WorkCapabilityDeliveryFootprintRow => {
          const employeeId = textValue(assignment, "employee_id");
          const orgRow = orgById.get(employeeId);
          const timeAllocationPct =
            normalizeNumber(assignment.time_allocation_pct) ?? 0;
          const employeeCost = firstNumber(orgRow, costFields, 0);
          const employeeFTE = firstNumber(orgRow, fteFields, 1);
          const costContribution = (employeeCost * timeAllocationPct) / 100;
          const fteContribution = (employeeFTE * timeAllocationPct) / 100;
          const accountability = textValue(assignment, "accountability");
          const department =
            firstText(orgRow, departmentFields) ||
            textValue(assignment, "department");

          if (employeeId) employeeIds.add(employeeId);
          if (department) departments.add(department);
          if (accountability === "Accountable") accountableCount += 1;
          if (accountability === "Responsible") responsibleCount += 1;
          totalCost += costContribution;
          totalFTE += fteContribution;

          return {
            assignmentId: textValue(assignment, "assignment_id"),
            employeeId,
            employeeName:
              firstText(orgRow, nameFields) ||
              textValue(assignment, "employee_name"),
            role:
              firstText(orgRow, roleFields) ||
              textValue(assignment, "position_title"),
            department,
            grade:
              firstText(orgRow, gradeFields) || textValue(assignment, "grade"),
            timeAllocationPct,
            costContribution,
            fteContribution,
            accountability,
          };
        },
      );

      const requirements =
        input.dataset.shared.activitySkillRequirements.filter(
          (row) =>
            textValue(row, "activity_id") === activityId &&
            activityIsActive(row),
        );
      const requiredSkills = requirements.map(
        (requirement): WorkCapabilityRequiredSkillRow => {
          const skillId = textValue(requirement, "skill_id");
          const requiredLevel =
            normalizeNumber(requirement.required_level) ?? 0;
          const assignedEmployeeIds = Array.from(employeeIds);
          let employeesWithData = 0;
          let coveredEmployees = 0;

          for (const employeeId of assignedEmployeeIds) {
            const employeeSkill = (
              skillRowsByEmployee.get(employeeId) ?? []
            ).find((row) => textValue(row, "skill_id") === skillId);
            if (!employeeSkill) continue;
            employeesWithData += 1;
            if (
              (normalizeNumber(employeeSkill.current_level) ?? 0) >=
              requiredLevel
            )
              coveredEmployees += 1;
          }

          const coveragePct =
            assignedEmployeeIds.length === 0 ||
            employeesWithData < assignedEmployeeIds.length
              ? null
              : (coveredEmployees / assignedEmployeeIds.length) * 100;
          const gap =
            coveragePct == null
              ? "Unknown"
              : coveragePct < 50
                ? "High"
                : coveragePct < 80
                  ? "Medium"
                  : "Low";

          return {
            skillId,
            skillName:
              firstText(skillsById.get(skillId), ["skill_name"]) ||
              textValue(requirement, "skill_name") ||
              skillId,
            requiredLevel,
            coveragePct,
            gap,
          };
        },
      );

      const automationCostReductionPct =
        normalizeNumber(activity.automation_cost_reduction_pct) ?? 0;
      const outsourcingCostReductionPct =
        normalizeNumber(activity.outsourcing_cost_reduction_pct) ?? 0;
      const skillRisk = riskForCoverage(
        textValue(activity, "criticality"),
        requiredSkills.map((skill) => skill.coveragePct),
      );

      return {
        activityId,
        activityName: textValue(activity, "activity_name") || activityId,
        domain: deriveWorkDomain(activity),
        processArea: normalizeTaxonomyLabel(
          textValue(activity, "process_area"),
          "General Process",
        ),
        category: normalizeTaxonomyLabel(
          textValue(activity, "activity_category"),
          "Uncategorized",
        ),
        nature: textValue(activity, "nature"),
        criticality: textValue(activity, "criticality"),
        complexity: textValue(activity, "complexity"),
        frequency: textValue(activity, "frequency"),
        automationCostReductionPct,
        outsourcingCostReductionPct,
        active: activityIsActive(activity),
        totalCost,
        totalFTE,
        assignedPeople: employeeIds.size,
        departmentsInvolved: departments.size,
        accountableCount,
        responsibleCount,
        automationSaving: (totalCost * automationCostReductionPct) / 100,
        outsourcingSaving: (totalCost * outsourcingCostReductionPct) / 100,
        skillRisk,
        deliveryFootprint,
        requiredSkills,
      };
    })
    .sort(
      (a, b) =>
        b.totalCost - a.totalCost ||
        a.activityName.localeCompare(b.activityName),
    );

  const tree: WorkCapabilityPortfolioTreeNode[] = [];
  const domainMap = new Map<string, WorkCapabilityActivityMetric[]>();
  for (const activity of activities) {
    if (!domainMap.has(activity.domain)) domainMap.set(activity.domain, []);
    domainMap.get(activity.domain)!.push(activity);
  }

  for (const [domain, domainActivities] of Array.from(domainMap.entries()).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    const domainCategories = new Set(
      domainActivities.map((activity) => activity.category),
    );
    const domainProcesses = new Set(
      domainActivities.map(
        (activity) => `${activity.category}::${activity.processArea}`,
      ),
    );
    tree.push({
      id: workCapabilityDomainNodeId(domain),
      label: domain,
      kind: "domain",
      domain,
      processArea: "",
      activityCount: domainActivities.length,
      categoryCount: domainCategories.size,
      processCount: domainProcesses.size,
      criticalActivityCount: domainActivities.filter(
        (activity) => activity.criticality === "High",
      ).length,
      totalCost: domainActivities.reduce(
        (sum, activity) => sum + activity.totalCost,
        0,
      ),
      totalFTE: domainActivities.reduce(
        (sum, activity) => sum + activity.totalFTE,
        0,
      ),
    });

    const categoryMap = new Map<string, WorkCapabilityActivityMetric[]>();
    for (const activity of domainActivities) {
      if (!categoryMap.has(activity.category))
        categoryMap.set(activity.category, []);
      categoryMap.get(activity.category)!.push(activity);
    }

    for (const [category, categoryActivities] of Array.from(
      categoryMap.entries(),
    ).sort(([a], [b]) => a.localeCompare(b))) {
      const categoryProcesses = new Map<
        string,
        WorkCapabilityActivityMetric[]
      >();
      for (const activity of categoryActivities) {
        if (!categoryProcesses.has(activity.processArea))
          categoryProcesses.set(activity.processArea, []);
        categoryProcesses.get(activity.processArea)!.push(activity);
      }

      tree.push({
        id: workCapabilityCategoryNodeId(domain, category),
        label: category,
        kind: "category",
        domain,
        processArea: "",
        category,
        activityCount: categoryActivities.length,
        categoryCount: 0,
        processCount: categoryProcesses.size,
        criticalActivityCount: categoryActivities.filter(
          (activity) => activity.criticality === "High",
        ).length,
        totalCost: categoryActivities.reduce(
          (sum, activity) => sum + activity.totalCost,
          0,
        ),
        totalFTE: categoryActivities.reduce(
          (sum, activity) => sum + activity.totalFTE,
          0,
        ),
      });

      for (const [processArea, processActivities] of Array.from(
        categoryProcesses.entries(),
      ).sort(([a], [b]) => a.localeCompare(b))) {
        tree.push({
          id: workCapabilityProcessNodeId(domain, category, processArea),
          label: processArea,
          kind: "process",
          domain,
          processArea,
          category,
          activityCount: processActivities.length,
          categoryCount: 0,
          processCount: 0,
          criticalActivityCount: processActivities.filter(
            (activity) => activity.criticality === "High",
          ).length,
          totalCost: processActivities.reduce(
            (sum, activity) => sum + activity.totalCost,
            0,
          ),
          totalFTE: processActivities.reduce(
            (sum, activity) => sum + activity.totalFTE,
            0,
          ),
        });
      }
    }
  }

  const departments = new Set<string>();
  for (const activity of activities) {
    for (const row of activity.deliveryFootprint)
      if (row.department) departments.add(row.department);
  }

  return {
    kpis: {
      totalActivities: activities.length,
      criticalActivities: activities.filter(
        (activity) => activity.criticality === "High",
      ).length,
      mappedCost: activities.reduce(
        (sum, activity) => sum + activity.totalCost,
        0,
      ),
      mappedFTE: activities.reduce(
        (sum, activity) => sum + activity.totalFTE,
        0,
      ),
      ownershipGaps: activities.filter(
        (activity) => activity.accountableCount === 0,
      ).length,
      automationSaving: activities.reduce(
        (sum, activity) => sum + activity.automationSaving,
        0,
      ),
    },
    tree,
    activities,
    filterOptions: {
      departments: Array.from(departments).sort(),
      domains: Array.from(
        new Set(activities.map((activity) => activity.domain)),
      ).sort(),
      processAreas: Array.from(
        new Set(activities.map((activity) => activity.processArea)),
      ).sort(),
      categories: Array.from(
        new Set(activities.map((activity) => activity.category)),
      ).sort(),
      criticalities: Array.from(
        new Set(
          activities.map((activity) => activity.criticality).filter(Boolean),
        ),
      ).sort(),
      natures: Array.from(
        new Set(activities.map((activity) => activity.nature).filter(Boolean)),
      ).sort(),
      skillRisks: Array.from(
        new Set(activities.map((activity) => activity.skillRisk)),
      ).sort() as WorkCapabilitySkillRisk[],
    },
  };
}

export function buildActivityAnalysisPortfolio(
  input: WorkCapabilityActivityPortfolioInput,
): ActivityAnalysisPortfolio {
  const orgById = new Map(
    input.orgRows.map((row) => [
      textValue(row, input.orgEmployeeIdColumn),
      row,
    ]),
  );
  const assignments = input.dataset.states.asIs.activityAssignments;

  const nameFields = orgColumnCandidates(input.columnMapping, "Full Name", [
    "full_name",
    "name",
    "employee_name",
  ]);
  const roleFields = orgColumnCandidates(
    input.columnMapping,
    "Business Title",
    ["position_title", "title", "business_title"],
  );
  const departmentFields = orgColumnCandidates(
    input.columnMapping,
    "Department Name",
    ["department", "department_name", "dept"],
  );
  const gradeFields = orgColumnCandidates(
    input.columnMapping,
    "Compensation Grade",
    ["grade", "compensation_grade", "level"],
  );
  const costFields = [
    mappedColumn(input.columnMapping, "Annual Compensation"),
    mappedColumn(input.columnMapping, "Annual Rate"),
    "loaded_cost",
    "total_annual_compensation",
    "annual_compensation",
    "annual_rate",
    "salary",
  ];
  const fteFields = orgColumnCandidates(input.columnMapping, "FTE", [
    "FTE",
    "fte",
  ]);

  const normalizeAccountability = (value: string) => value.trim().toLowerCase();

  const employeeMetrics = new Map<string, ActivityAnalysisEmployeeMetric>();
  const categorySet = new Set<string>();
  const domainSet = new Set<string>();
  const processAreaSet = new Set<string>();
  const natureSet = new Set<string>();
  const criticalitySet = new Set<string>();
  const departmentSet = new Set<string>();
  const riskFlagSet = new Set<ActivityAnalysisRiskFlag>();

  const activities = input.dataset.shared.activityLibrary
    .filter((activity) => activityIsActive(activity))
    .map((activity): ActivityAnalysisActivityMetric => {
      const activityId = textValue(activity, "activity_id");
      const activityAssignments = assignments.filter(
        (row) => textValue(row, "activity_id") === activityId,
      );
      const employeeIds = new Set<string>();
      const departments = new Set<string>();
      let accountableCount = 0;
      let responsibleCount = 0;
      let consultedCount = 0;
      let informedCount = 0;
      let totalCost = 0;
      let totalFTE = 0;
      let gradeSum = 0;
      let gradeCount = 0;
      let departmentFocus = textValue(activity, "department_focus");

      for (const assignment of activityAssignments) {
        const employeeId = textValue(assignment, "employee_id");
        const orgRow = orgById.get(employeeId);
        const timeAllocationPct =
          normalizeNumber(assignment.time_allocation_pct) ?? 0;
        const employeeCost = firstNumber(orgRow, costFields, 0);
        const employeeFTE = firstNumber(orgRow, fteFields, 1);
        const costContribution = (employeeCost * timeAllocationPct) / 100;
        const fteContribution = (employeeFTE * timeAllocationPct) / 100;
        const accountability = normalizeAccountability(
          textValue(assignment, "accountability"),
        );
        const department =
          firstText(orgRow, departmentFields) ||
          textValue(assignment, "department");
        const employeeName =
          firstText(orgRow, nameFields) ||
          textValue(assignment, "employee_name");
        const employeeRole =
          firstText(orgRow, roleFields) ||
          textValue(assignment, "position_title");
        const gradeValue = firstNumber(orgRow, gradeFields, NaN);

        if (employeeId) employeeIds.add(employeeId);
        if (department) departments.add(department);
        if (accountability === "accountable") accountableCount += 1;
        if (accountability === "responsible") responsibleCount += 1;
        if (accountability === "consulted") consultedCount += 1;
        if (accountability === "informed") informedCount += 1;
        totalCost += costContribution;
        totalFTE += fteContribution;

        if (!Number.isNaN(gradeValue)) {
          gradeSum += gradeValue;
          gradeCount += 1;
        }

        const existing = employeeMetrics.get(employeeId) ?? {
          employeeId,
          employeeName,
          role: employeeRole,
          department: department || "",
          totalWorkloadPct: 0,
          mappedCost: 0,
          mappedFTE: 0,
          activityCount: 0,
          workloadStatus: "Normal",
        };
        existing.totalWorkloadPct += timeAllocationPct;
        existing.mappedCost += costContribution;
        existing.mappedFTE += fteContribution;
        existing.activityCount += 1;
        employeeMetrics.set(employeeId, existing);
      }

      const avgGrade = gradeCount > 0 ? gradeSum / gradeCount : null;
      categorySet.add(
        textValue(activity, "activity_category") || "Uncategorized",
      );
      domainSet.add(deriveWorkDomain(activity));
      processAreaSet.add(
        normalizeTaxonomyLabel(
          textValue(activity, "process_area"),
          "General Process",
        ),
      );
      natureSet.add(textValue(activity, "nature"));
      criticalitySet.add(textValue(activity, "criticality"));
      for (const dept of departments) departmentSet.add(dept);

      return {
        activityId,
        activityName: textValue(activity, "activity_name") || activityId,
        domain: deriveWorkDomain(activity),
        processArea: normalizeTaxonomyLabel(
          textValue(activity, "process_area"),
          "General Process",
        ),
        category: normalizeTaxonomyLabel(
          textValue(activity, "activity_category"),
          "Uncategorized",
        ),
        nature: textValue(activity, "nature"),
        criticality: textValue(activity, "criticality"),
        complexity: textValue(activity, "complexity"),
        frequency: textValue(activity, "frequency"),
        departmentFocus,
        activityCost: totalCost,
        activityFte: totalFTE,
        assignedPeople: employeeIds.size,
        departmentsInvolved: departments.size,
        accountableCount,
        responsibleCount,
        consultedCount,
        informedCount,
        automationCostReductionPct:
          normalizeNumber(activity.automation_cost_reduction_pct) ?? 0,
        outsourcingCostReductionPct:
          normalizeNumber(activity.outsourcing_cost_reduction_pct) ?? 0,
        automationSaving:
          (totalCost *
            (normalizeNumber(activity.automation_cost_reduction_pct) ?? 0)) /
          100,
        outsourcingSaving:
          (totalCost *
            (normalizeNumber(activity.outsourcing_cost_reduction_pct) ?? 0)) /
          100,
        avgGrade,
        riskFlags: [],
        deliveryFootprint: activityAssignments.map(
          (assignment): WorkCapabilityDeliveryFootprintRow => {
            const employeeId = textValue(assignment, "employee_id");
            const orgRow = orgById.get(employeeId);
            const timeAllocationPct =
              normalizeNumber(assignment.time_allocation_pct) ?? 0;
            const employeeCost = firstNumber(orgRow, costFields, 0);
            const employeeFTE = firstNumber(orgRow, fteFields, 1);
            const costContribution = (employeeCost * timeAllocationPct) / 100;
            const fteContribution = (employeeFTE * timeAllocationPct) / 100;
            const accountability = textValue(assignment, "accountability");
            const department =
              firstText(orgRow, departmentFields) ||
              textValue(assignment, "department");

            return {
              assignmentId: textValue(assignment, "assignment_id"),
              employeeId,
              employeeName:
                firstText(orgRow, nameFields) ||
                textValue(assignment, "employee_name"),
              role:
                firstText(orgRow, roleFields) ||
                textValue(assignment, "position_title"),
              department,
              grade:
                firstText(orgRow, gradeFields) ||
                textValue(assignment, "grade"),
              timeAllocationPct,
              costContribution,
              fteContribution,
              accountability,
            };
          },
        ),
      };
    });

  const costValues = activities
    .map((activity) => activity.activityCost)
    .sort((a, b) => a - b);
  const topQuartileCost = costValues.length
    ? costValues[Math.max(0, Math.floor(costValues.length * 0.75) - 1)]
    : 0;

  const analyzedActivities = activities.map((activity) => {
    const riskFlags: ActivityAnalysisRiskFlag[] = [];
    if (activity.accountableCount === 0 || activity.responsibleCount === 0) {
      riskFlags.push("Ownership gap");
      riskFlagSet.add("Ownership gap");
    }
    if (activity.departmentsInvolved >= 3 || activity.assignedPeople >= 10) {
      riskFlags.push("Fragmented activity");
      riskFlagSet.add("Fragmented activity");
    }
    if (
      activity.nature === "Transactional" &&
      activity.activityCost >= topQuartileCost &&
      activity.activityCost > 0
    ) {
      riskFlags.push("High cost transactional work");
      riskFlagSet.add("High cost transactional work");
    }
    if (
      activity.avgGrade != null &&
      activity.avgGrade >= 7 &&
      activity.nature === "Transactional"
    ) {
      riskFlags.push("Seniority mismatch");
      riskFlagSet.add("Seniority mismatch");
    }
    if (
      activity.automationCostReductionPct >= 25 &&
      activity.criticality !== "High"
    ) {
      riskFlags.push("Automation candidate");
      riskFlagSet.add("Automation candidate");
    }
    if (
      activity.outsourcingCostReductionPct >= 25 &&
      activity.criticality === "High"
    ) {
      riskFlags.push("Outsourcing caution");
      riskFlagSet.add("Outsourcing caution");
    }
    return { ...activity, riskFlags };
  });

  const employees: ActivityAnalysisEmployeeMetric[] = Array.from(
    employeeMetrics.values(),
  ).map((employee) => {
    const totalWorkloadPct = employee.totalWorkloadPct ?? 0;
    const workloadStatus: EmployeeWorkloadStatus =
      totalWorkloadPct > 120
        ? "Severe overload"
        : totalWorkloadPct > 110
          ? "Overload"
          : totalWorkloadPct < 60
            ? "Under-mapped"
            : "Normal";
    return {
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      role: employee.role,
      department: employee.department,
      totalWorkloadPct,
      mappedCost: employee.mappedCost ?? 0,
      mappedFTE: employee.mappedFTE ?? 0,
      activityCount: employee.activityCount ?? 0,
      workloadStatus,
    };
  });

  for (const employee of employees) {
    if (employee.department) departmentSet.add(employee.department);
  }

  return {
    kpis: {
      totalMappedCost: analyzedActivities.reduce(
        (sum, activity) => sum + activity.activityCost,
        0,
      ),
      totalMappedFTE: analyzedActivities.reduce(
        (sum, activity) => sum + activity.activityFte,
        0,
      ),
      totalActivities: analyzedActivities.length,
      totalAssignedPeople: employees.length,
      overloadedEmployees: employees.filter(
        (employee) => employee.totalWorkloadPct > 120,
      ).length,
      ownershipGaps: analyzedActivities.filter(
        (activity) =>
          activity.accountableCount === 0 || activity.responsibleCount === 0,
      ).length,
      automationSaving: analyzedActivities.reduce(
        (sum, activity) => sum + activity.automationSaving,
        0,
      ),
      outsourcingSaving: analyzedActivities.reduce(
        (sum, activity) => sum + activity.outsourcingSaving,
        0,
      ),
    },
    activities: analyzedActivities.sort(
      (a, b) =>
        b.activityCost - a.activityCost ||
        a.activityName.localeCompare(b.activityName),
    ),
    employees: employees.sort(
      (a, b) =>
        b.totalWorkloadPct - a.totalWorkloadPct ||
        a.employeeName.localeCompare(b.employeeName),
    ),
    filterOptions: {
      departments: Array.from(departmentSet).sort(),
      domains: Array.from(domainSet).sort(),
      processAreas: Array.from(processAreaSet).sort(),
      categories: Array.from(categorySet).sort(),
      criticalities: Array.from(criticalitySet).sort(),
      natures: Array.from(natureSet).sort(),
      riskFlags: Array.from(riskFlagSet).sort(),
    },
  };
}

export function buildSkillsCapabilityPortfolio(
  input: WorkCapabilityActivityPortfolioInput,
): SkillsCapabilityPortfolio {
  const orgById = new Map(
    input.orgRows.map((row) => [
      textValue(row, input.orgEmployeeIdColumn),
      row,
    ]),
  );
  const assignments = input.dataset.states.asIs.activityAssignments;
  const roleRequirements = input.dataset.states.asIs.roleSkillRequirements;
  const employeeSkills = input.dataset.states.asIs.employeeSkills;
  const activityRequirements = input.dataset.shared.activitySkillRequirements;
  const skillLibrary = input.dataset.shared.skillLibrary;

  const nameFields = orgColumnCandidates(input.columnMapping, "Full Name", [
    "full_name",
    "name",
    "employee_name",
  ]);
  const roleFields = orgColumnCandidates(
    input.columnMapping,
    "Business Title",
    ["position_title", "title", "business_title"],
  );
  const departmentFields = orgColumnCandidates(
    input.columnMapping,
    "Department Name",
    ["department", "department_name", "dept"],
  );
  const gradeFields = orgColumnCandidates(
    input.columnMapping,
    "Compensation Grade",
    ["grade", "compensation_grade", "level"],
  );
  const costFields = [
    mappedColumn(input.columnMapping, "Annual Compensation"),
    mappedColumn(input.columnMapping, "Annual Rate"),
    "loaded_cost",
    "total_annual_compensation",
    "annual_compensation",
    "annual_rate",
    "salary",
  ];
  const fteFields = orgColumnCandidates(input.columnMapping, "FTE", [
    "FTE",
    "fte",
  ]);

  // Build lookup maps
  const skillById = new Map(
    skillLibrary.map((skill) => [textValue(skill, "skill_id"), skill]),
  );
  const employeeSkillsByEmployee = new Map<string, EmployeeSkillRow[]>();
  for (const skill of employeeSkills) {
    const employeeId = textValue(skill, "employee_id");
    if (!employeeSkillsByEmployee.has(employeeId)) {
      employeeSkillsByEmployee.set(employeeId, []);
    }
    employeeSkillsByEmployee.get(employeeId)!.push(skill);
  }

  const roleRequirementsByRole = new Map<string, RoleSkillRequirementRow[]>();
  for (const req of roleRequirements) {
    const roleKey = textValue(req, "role_key");
    if (!roleRequirementsByRole.has(roleKey)) {
      roleRequirementsByRole.set(roleKey, []);
    }
    roleRequirementsByRole.get(roleKey)!.push(req);
  }

  const activityRequirementsByActivity = new Map<
    string,
    ActivitySkillRequirementRow[]
  >();
  for (const req of activityRequirements) {
    const activityId = textValue(req, "activity_id");
    if (!activityRequirementsByActivity.has(activityId)) {
      activityRequirementsByActivity.set(activityId, []);
    }
    activityRequirementsByActivity.get(activityId)!.push(req);
  }

  // Build skill supply from all employee skills
  const skillSupply = new Map<
    string,
    {
      employees: Set<string>;
      level3Plus: Set<string>;
      level4Plus: Set<string>;
      departments: Set<string>;
    }
  >();
  for (const employeeSkill of employeeSkills) {
    const skillId = textValue(employeeSkill, "skill_id");
    const employeeId = textValue(employeeSkill, "employee_id");
    const currentLevel = normalizeNumber(employeeSkill.current_level) ?? 0;
    const orgRow = orgById.get(employeeId);
    const department = orgRow ? firstText(orgRow, departmentFields) : "";

    if (!skillSupply.has(skillId)) {
      skillSupply.set(skillId, {
        employees: new Set(),
        level3Plus: new Set(),
        level4Plus: new Set(),
        departments: new Set(),
      });
    }
    const supply = skillSupply.get(skillId)!;
    if (currentLevel > 0) supply.employees.add(employeeId);
    if (currentLevel >= 3) supply.level3Plus.add(employeeId);
    if (currentLevel >= 4) supply.level4Plus.add(employeeId);
    if (department) supply.departments.add(department);
  }

  // Calculate role metrics
  const roleMetrics: SkillsCapabilityRoleMetric[] = [];
  const skillDemand = new Map<
    string,
    { roles: Set<string>; activities: Set<string> }
  >();

  for (const [roleKey, requirements] of roleRequirementsByRole) {
    // Get the position_title from the first requirement for this role
    const rolePositionTitle = requirements.length > 0 ? textValue(requirements[0], "position_title") : "";
    
    // Find employees with this role by matching role_key or position_title
    const employeesWithRole = input.orgRows.filter((row) => {
      const empId = textValue(row, input.orgEmployeeIdColumn);
      if (!empId) return false;
      const empPositionTitle = firstText(row, roleFields) || "";
      const empRoleKey = textValue(row, "role_key") || "";
      // Match by role_key field or by position_title from org rows matching role_key or position_title from requirements
      return empRoleKey === roleKey || empPositionTitle === roleKey || empPositionTitle === rolePositionTitle;
    });

    for (const employeeRow of employeesWithRole) {
      const employeeId = textValue(employeeRow, input.orgEmployeeIdColumn);
      const employeeName = firstText(employeeRow, nameFields) || employeeId;
      const department = firstText(employeeRow, departmentFields) || "";
      const grade = firstText(employeeRow, gradeFields) || "";
      const employeeSkillRows = employeeSkillsByEmployee.get(employeeId) || [];
      const employeeSkillsMap = new Map(
        employeeSkillRows.map((skill) => [textValue(skill, "skill_id"), skill]),
      );

      let totalWeight = 0;
      let weightedScore = 0;
      let coveredSkills = 0;
      let minorGaps = 0;
      let majorGaps = 0;
      let criticalGaps = 0;

      const skillDetails = requirements.map((req) => {
        const skillId = textValue(req, "skill_id");
        const skill = skillById.get(skillId);
        const skillName = skill ? textValue(skill, "skill_name") : skillId;
        const requiredLevel = normalizeNumber(req.required_level) ?? 0;
        const criticality = textValue(req, "criticality");
        const weight =
          criticality === "High" ? 3 : criticality === "Medium" ? 2 : 1;
        const employeeSkill = employeeSkillsMap.get(skillId);
        const currentLevel = employeeSkill
          ? (normalizeNumber(employeeSkill.current_level) ?? 0)
          : 0;
        const gap = Math.max(0, requiredLevel - currentLevel);
        const gapStatus: SkillGapStatus =
          gap === 0 ? "Covered" : gap === 1 ? "Minor gap" : "Major gap";

        totalWeight += weight;
        weightedScore += Math.min(currentLevel / requiredLevel, 1) * weight;

        if (gap === 0) coveredSkills++;
        else if (gap === 1) minorGaps++;
        else if (gap >= 2) majorGaps++;
        if (gap >= 2 && criticality === "High") criticalGaps++;

        // Track skill demand
        if (!skillDemand.has(skillId)) {
          skillDemand.set(skillId, { roles: new Set(), activities: new Set() });
        }
        skillDemand.get(skillId)!.roles.add(roleKey);

        return {
          skillId,
          skillName,
          requiredLevel,
          currentLevel,
          gap,
          gapStatus,
          criticality,
        };
      });

      const readinessScore =
        totalWeight > 0 ? (weightedScore / totalWeight) * 100 : 0;
      const riskStatus: RoleReadinessStatus =
        readinessScore >= 85
          ? "Ready"
          : readinessScore >= 70
            ? "Minor gaps"
            : readinessScore >= 50
              ? "Development needed"
              : "High capability risk";

      // Find activities impacted by gaps
      const activitiesImpacted = new Set<string>();
      for (const assignment of assignments) {
        if (textValue(assignment, "employee_id") === employeeId) {
          const activityId = textValue(assignment, "activity_id");
          const activityReqs =
            activityRequirementsByActivity.get(activityId) || [];
          const hasGaps = activityReqs.some((req) => {
            const skillId = textValue(req, "skill_id");
            const employeeSkill = employeeSkillsMap.get(skillId);
            const currentLevel = employeeSkill
              ? (normalizeNumber(employeeSkill.current_level) ?? 0)
              : 0;
            const requiredLevel = normalizeNumber(req.required_level) ?? 0;
            return currentLevel < requiredLevel;
          });
          if (hasGaps) activitiesImpacted.add(activityId);
        }
      }

      roleMetrics.push({
        employeeId,
        employeeName,
        role: roleKey,
        department,
        grade,
        requiredSkills: requirements.length,
        coveredSkills,
        minorGaps,
        majorGaps,
        criticalGaps,
        readinessScore,
        riskStatus,
        skillDetails,
        activitiesImpacted: Array.from(activitiesImpacted),
      });
    }
  }

  // Calculate activity metrics
  const activityMetrics: SkillsCapabilityActivityMetric[] = [];
  const activityLibrary = input.dataset.shared.activityLibrary;

  for (const activity of activityLibrary) {
    const activityId = textValue(activity, "activity_id");
    const activityName = textValue(activity, "activity_name") || activityId;
    const criticality = textValue(activity, "criticality");
    const requirements = activityRequirementsByActivity.get(activityId) || [];
    const activityAssignments = assignments.filter(
      (row) => textValue(row, "activity_id") === activityId,
    );
    const assignedEmployeeIds = new Set(
      activityAssignments.map((row) => textValue(row, "employee_id")),
    );

    let lowestSkillCoveragePct = 100;
    let majorSkillGaps = 0;
    let totalCostAtRisk = 0;
    let totalFteAtRisk = 0;
    const missingSkillData =
      requirements.length === 0 ||
      assignedEmployeeIds.size === 0 ||
      employeeSkills.length === 0;

    const skillCoverageDetails = requirements.map((req) => {
      const skillId = textValue(req, "skill_id");
      const skill = skillById.get(skillId);
      const skillName = skill ? textValue(skill, "skill_name") : skillId;
      const requiredLevel = normalizeNumber(req.required_level) ?? 0;
      let employeesMeetingLevel = 0;
      let totalAssigned = 0;

      for (const employeeId of assignedEmployeeIds) {
        const employeeSkills = employeeSkillsByEmployee.get(employeeId) || [];
        const employeeSkill = employeeSkills.find(
          (skill) => textValue(skill, "skill_id") === skillId,
        );
        const currentLevel = employeeSkill
          ? (normalizeNumber(employeeSkill.current_level) ?? 0)
          : 0;
        totalAssigned++;
        if (currentLevel >= requiredLevel) employeesMeetingLevel++;
      }

      const coveragePct =
        totalAssigned > 0 ? (employeesMeetingLevel / totalAssigned) * 100 : 0;
      lowestSkillCoveragePct = Math.min(lowestSkillCoveragePct, coveragePct);

      if (coveragePct < 50) majorSkillGaps++;

      // Calculate cost/FTE at risk for this skill gap
      if (coveragePct < 100) {
        for (const employeeId of assignedEmployeeIds) {
          const orgRow = orgById.get(employeeId);
          if (orgRow) {
            const employeeSkills =
              employeeSkillsByEmployee.get(employeeId) || [];
            const employeeSkill = employeeSkills.find(
              (skill) => textValue(skill, "skill_id") === skillId,
            );
            const currentLevel = employeeSkill
              ? (normalizeNumber(employeeSkill.current_level) ?? 0)
              : 0;
            if (currentLevel < requiredLevel) {
              const cost = firstNumber(orgRow, costFields, 0);
              const fte = firstNumber(orgRow, fteFields, 1);
              const assignment = activityAssignments.find(
                (a) => textValue(a, "employee_id") === employeeId,
              );
              const timeAllocationPct = assignment
                ? (normalizeNumber(assignment.time_allocation_pct) ?? 0)
                : 0;
              totalCostAtRisk += (cost * timeAllocationPct) / 100;
              totalFteAtRisk += (fte * timeAllocationPct) / 100;
            }
          }
        }
      }

      // Track skill demand
      if (!skillDemand.has(skillId)) {
        skillDemand.set(skillId, { roles: new Set(), activities: new Set() });
      }
      skillDemand.get(skillId)!.activities.add(activityId);

      return {
        skillId,
        skillName,
        requiredLevel,
        coveragePct,
        employeesMeetingLevel,
        totalAssigned,
      };
    });

    if (requirements.length === 0) {
      lowestSkillCoveragePct = 0;
    }

    let skillRisk: ActivitySkillRisk = "Unknown";
    if (!missingSkillData) {
      skillRisk =
        criticality === "High" && lowestSkillCoveragePct < 50
          ? "High"
          : lowestSkillCoveragePct < 80
            ? "Medium"
            : "Low";
    }

    activityMetrics.push({
      activityId,
      activityName,
      criticality,
      assignedPeople: assignedEmployeeIds.size,
      requiredSkills: requirements.length,
      lowestSkillCoveragePct,
      majorSkillGaps,
      skillRisk,
      costAtRisk: totalCostAtRisk,
      fteAtRisk: totalFteAtRisk,
      skillCoverageDetails,
    });
  }

  // Calculate skill metrics
  const skillMetrics: SkillsCapabilitySkillMetric[] = [];

  for (const skill of skillLibrary) {
    const skillId = textValue(skill, "skill_id");
    const skillName = textValue(skill, "skill_name") || skillId;
    const skillFamily = textValue(skill, "skill_family");
    const criticality = textValue(skill, "criticality");
    const supply = skillSupply.get(skillId) || {
      employees: new Set(),
      level3Plus: new Set(),
      level4Plus: new Set(),
      departments: new Set(),
    };
    const demand = skillDemand.get(skillId) || {
      roles: new Set(),
      activities: new Set(),
    };

    const employeesMeetingRequired = new Set<string>();
    const requiredLevel = 3; // Assume level 3+ is required for critical skills

    for (const employeeId of supply.employees) {
      const employeeSkills = employeeSkillsByEmployee.get(employeeId) || [];
      const employeeSkill = employeeSkills.find(
        (skill) => textValue(skill, "skill_id") === skillId,
      );
      const currentLevel = employeeSkill
        ? (normalizeNumber(employeeSkill.current_level) ?? 0)
        : 0;
      if (currentLevel >= requiredLevel)
        employeesMeetingRequired.add(employeeId);
    }

    const singlePointRisk: SinglePointRisk =
      criticality === "High" && employeesMeetingRequired.size <= 1
        ? "High"
        : criticality === "High" && employeesMeetingRequired.size <= 2
          ? "Medium"
          : "Low";

    skillMetrics.push({
      skillId,
      skillName,
      skillFamily,
      criticality,
      employeesWithSkill: supply.employees.size,
      employeesAtLevel3Plus: supply.level3Plus.size,
      employeesAtLevel4Plus: supply.level4Plus.size,
      departmentsCovered: supply.departments.size,
      activitiesRequiringSkill: demand.activities.size,
      rolesRequiringSkill: demand.roles.size,
      singlePointRisk,
    });
  }

  // Calculate KPIs
  const criticalSkills = skillMetrics.filter(
    (skill) => skill.criticality === "High",
  ).length;
  const majorSkillGaps = roleMetrics.reduce(
    (sum, role) => sum + role.majorGaps,
    0,
  );
  const averageReadiness =
    roleMetrics.length > 0
      ? roleMetrics.reduce((sum, role) => sum + role.readinessScore, 0) /
        roleMetrics.length
      : 0;
  const rolesBelow70PctReadiness = roleMetrics.filter(
    (role) => role.readinessScore < 70,
  ).length;
  const activitiesAtSkillRisk = activityMetrics.filter(
    (activity) =>
      activity.skillRisk === "High" || activity.skillRisk === "Medium",
  ).length;
  const singlePointCriticalSkills = skillMetrics.filter(
    (skill) => skill.singlePointRisk === "High",
  ).length;
  const unvalidatedSyntheticSkills = employeeSkills.filter(
    (skill) => !skill.validated && skill.synthetic_flag,
  ).length;

  // Collect filter options
  const departments = new Set(roleMetrics.map((role) => role.department));
  const skillFamilies = new Set(skillMetrics.map((skill) => skill.skillFamily));
  const criticalities = new Set(skillMetrics.map((skill) => skill.criticality));
  const riskStatuses = new Set(roleMetrics.map((role) => role.riskStatus));
  const skillRisks = new Set(
    activityMetrics.map((activity) => activity.skillRisk),
  );

  return {
    kpis: {
      criticalSkills,
      majorSkillGaps,
      averageReadiness,
      rolesBelow70PctReadiness,
      activitiesAtSkillRisk,
      singlePointCriticalSkills,
      unvalidatedSyntheticSkills,
    },
    skills: skillMetrics.sort(
      (a, b) =>
        b.employeesWithSkill - a.employeesWithSkill ||
        a.skillName.localeCompare(b.skillName),
    ),
    roles: roleMetrics.sort(
      (a, b) =>
        a.readinessScore - b.readinessScore ||
        a.employeeName.localeCompare(b.employeeName),
    ),
    activities: activityMetrics.sort((a, b) => {
      const riskOrder = { High: 3, Medium: 2, Low: 1, Unknown: 0 };
      return (
        riskOrder[b.skillRisk] - riskOrder[a.skillRisk] ||
        a.activityName.localeCompare(b.activityName)
      );
    }),
    filterOptions: {
      departments: Array.from(departments).sort(),
      skillFamilies: Array.from(skillFamilies).sort(),
      criticalities: Array.from(criticalities).sort(),
      riskStatuses: Array.from(riskStatuses).sort(),
      skillRisks: Array.from(skillRisks).sort(),
    },
  };
}

function readinessStatusFor(score: number): SuccessionReadinessStatus {
  return score >= 85
    ? "Ready Now"
    : score >= 70
      ? "Ready Soon"
      : score >= 50
        ? "Development Needed"
        : "Not Recommended";
}

function selectedCandidateKey(targetEmployeeId: string, candidateEmployeeId: string) {
  return `${targetEmployeeId}::${candidateEmployeeId}`;
}

function isSelectedSuccessionStatus(status: SuccessionCandidateStatus): boolean {
  return status === "Selected" || status === "Backup";
}

function titleLooksCritical(title: string): boolean {
  return /\b(ceo|chief|cxo|evp|svp|vp|head|director|manager|lead)\b/i.test(
    title,
  );
}

function numericGrade(value: string): number {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function percentile(values: number[], ratio: number): number {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * ratio)),
  );
  return sorted[index];
}

export function buildSuccessionPlanningPortfolio(
  input: SuccessionPlanningPortfolioInput,
): SuccessionPlanningPortfolio {
  const nameFields = orgColumnCandidates(input.columnMapping, "Full Name", [
    "full_name",
    "name",
    "employee_name",
  ]);
  const roleFields = orgColumnCandidates(
    input.columnMapping,
    "Business Title",
    ["position_title", "title", "business_title"],
  );
  const departmentFields = orgColumnCandidates(
    input.columnMapping,
    "Department Name",
    ["department", "department_name", "dept"],
  );
  const gradeFields = orgColumnCandidates(input.columnMapping, "Compensation Grade", [
    "grade",
    "compensation_grade",
    "level",
  ]);
  const costFields = [
    mappedColumn(input.columnMapping, "Annual Compensation"),
    mappedColumn(input.columnMapping, "Annual Rate"),
    "loaded_cost",
    "total_annual_compensation",
    "annual_compensation",
    "annual_rate",
    "salary",
  ];
  const managerFields = orgColumnCandidates(input.columnMapping, "Manager ID", [
    "manager_id",
    "managerid",
    "parentid",
    "parent_id",
  ]);

  const assignments = input.dataset.states.asIs.activityAssignments;
  const roleRequirements = input.dataset.states.asIs.roleSkillRequirements;
  const employeeSkills = input.dataset.states.asIs.employeeSkills;
  const activityRequirements = input.dataset.shared.activitySkillRequirements;
  const skillLibrary = input.dataset.shared.skillLibrary;
  const activitiesById = new Map(
    input.dataset.shared.activityLibrary.map((activity) => [
      textValue(activity, "activity_id"),
      activity,
    ]),
  );
  const skillById = new Map(
    skillLibrary.map((skill) => [textValue(skill, "skill_id"), skill]),
  );
  const orgById = new Map(
    input.orgRows.map((row) => [
      textValue(row, input.orgEmployeeIdColumn),
      row,
    ]),
  );

  const spanByManager = new Map<string, number>();
  for (const row of input.orgRows) {
    const managerId = firstText(row, managerFields);
    if (!managerId) continue;
    spanByManager.set(managerId, (spanByManager.get(managerId) ?? 0) + 1);
  }

  const workloadByEmployee = new Map<string, number>();
  for (const assignment of assignments) {
    const employeeId = textValue(assignment, "employee_id");
    workloadByEmployee.set(
      employeeId,
      (workloadByEmployee.get(employeeId) ?? 0) +
        (normalizeNumber(assignment.time_allocation_pct) ?? 0),
    );
  }

  const employeeSkillsByEmployee = new Map<string, EmployeeSkillRow[]>();
  for (const skill of employeeSkills) {
    const employeeId = textValue(skill, "employee_id");
    if (!employeeSkillsByEmployee.has(employeeId))
      employeeSkillsByEmployee.set(employeeId, []);
    employeeSkillsByEmployee.get(employeeId)!.push(skill);
  }

  const criticalSkillSupply = new Map<string, Set<string>>();
  for (const skill of employeeSkills) {
    const skillId = textValue(skill, "skill_id");
    const libraryRow = skillById.get(skillId);
    if (!libraryRow || textValue(libraryRow, "criticality") !== "High") continue;
    const currentLevel = normalizeNumber(skill.current_level) ?? 0;
    if (currentLevel < 3) continue;
    if (!criticalSkillSupply.has(skillId)) criticalSkillSupply.set(skillId, new Set());
    criticalSkillSupply.get(skillId)!.add(textValue(skill, "employee_id"));
  }
  const scarceCriticalSkillIds = new Set(
    [...criticalSkillSupply.entries()]
      .filter(([, employees]) => employees.size <= 1)
      .map(([skillId]) => skillId),
  );

  const roleRequirementMatches = (row: ExcelRow, req: RoleSkillRequirementRow) => {
    const role = firstText(row, roleFields);
    const roleKey = textValue(row, "role_key");
    const department = firstText(row, departmentFields);
    return (
      (!!roleKey && roleKey === textValue(req, "role_key")) ||
      (!!role && role === textValue(req, "role_key")) ||
      (!!role && role === textValue(req, "position_title")) ||
      (!!role &&
        role.toLowerCase() === textValue(req, "position_title").toLowerCase() &&
        (!textValue(req, "department") ||
          textValue(req, "department") === department))
    );
  };

  const requirementsForEmployee = (row: ExcelRow) =>
    roleRequirements.filter((req) => roleRequirementMatches(row, req));

  const costs = input.orgRows.map((row) => firstNumber(row, costFields, 0));
  const topCostQuartile = percentile(costs, 0.75);

  const criticalRoleCandidates = input.orgRows
    .map((row) => {
      const employeeId = textValue(row, input.orgEmployeeIdColumn);
      const employeeName = firstText(row, nameFields) || employeeId;
      const role = firstText(row, roleFields);
      const department = firstText(row, departmentFields);
      const grade = firstText(row, gradeFields);
      const loadedCost = firstNumber(row, costFields, 0);
      const span = spanByManager.get(employeeId) ?? 0;
      const workload = workloadByEmployee.get(employeeId) ?? 0;
      const requirements = requirementsForEmployee(row);
      const employeeSkillRows = employeeSkillsByEmployee.get(employeeId) ?? [];
      const heldScarceCriticalSkills = employeeSkillRows.filter((skill) =>
        scarceCriticalSkillIds.has(textValue(skill, "skill_id")),
      ).length;
      const criticalActivityDetails = assignments
        .filter((assignment) => textValue(assignment, "employee_id") === employeeId)
        .flatMap((assignment) => {
          const activity = activitiesById.get(textValue(assignment, "activity_id"));
          if (
            !activity ||
            textValue(activity, "criticality") !== "High" ||
            !/accountable/i.test(textValue(assignment, "accountability"))
          ) {
            return [];
          }
          return [{
            assignment,
            activity,
          }];
        })
        .map(({ assignment, activity }) => ({
          activityId: textValue(activity, "activity_id"),
          activityName: textValue(activity, "activity_name"),
          criticality: textValue(activity, "criticality"),
          timeAllocationPct:
            normalizeNumber(assignment.time_allocation_pct) ?? 0,
          accountability: textValue(assignment, "accountability"),
        }));

      const seniorGrade = numericGrade(grade) >= 7;
      const critical =
        seniorGrade ||
        titleLooksCritical(role) ||
        span >= 5 ||
        criticalActivityDetails.length > 0 ||
        heldScarceCriticalSkills > 0 ||
        (topCostQuartile > 0 && loadedCost >= topCostQuartile);
      const criticalityScore =
        (seniorGrade ? 15 : 0) +
        (titleLooksCritical(role) ? 20 : 0) +
        Math.min(span * 3, 24) +
        criticalActivityDetails.length * 20 +
        heldScarceCriticalSkills * 15 +
        (topCostQuartile > 0 && loadedCost >= topCostQuartile ? 12 : 0);

      return {
        row,
        employeeId,
        employeeName,
        role,
        department,
        grade,
        loadedCost,
        span,
        workload,
        requirements,
        critical,
        criticalityScore,
        criticalActivityDetails,
        criticalSkillsHeld: heldScarceCriticalSkills,
      };
    })
    .filter((role) => role.critical);

  const criticalEmployeeIds = new Set(
    criticalRoleCandidates.map((role) => role.employeeId),
  );
  const selectedRecords = input.successionCandidates ?? [];
  const selectedRecordsByPair = new Map(
    selectedRecords.map((record) => [
      selectedCandidateKey(
        record.target_employee_id,
        record.candidate_employee_id,
      ),
      record,
    ]),
  );
  const selectedByCandidate = new Map<string, SuccessionCandidateRecord[]>();
  for (const record of selectedRecords.filter(
    (item) => item.selected_flag || isSelectedSuccessionStatus(item.status),
  )) {
    const candidateId = record.candidate_employee_id;
    if (!selectedByCandidate.has(candidateId))
      selectedByCandidate.set(candidateId, []);
    selectedByCandidate.get(candidateId)!.push(record);
  }

  const scoreCandidate = (
    targetRequirements: RoleSkillRequirementRow[],
    candidateRow: ExcelRow,
  ) => {
    const candidateId = textValue(candidateRow, input.orgEmployeeIdColumn);
    const skills = new Map(
      (employeeSkillsByEmployee.get(candidateId) ?? []).map((skill) => [
        textValue(skill, "skill_id"),
        skill,
      ]),
    );
    let totalWeight = 0;
    let weightedScore = 0;
    let coveredSkills = 0;
    let minorGaps = 0;
    let majorGaps = 0;
    let criticalGaps = 0;
    const skillDetails = targetRequirements.map((req) => {
      const skillId = textValue(req, "skill_id");
      const requiredLevel = normalizeNumber(req.required_level) ?? 0;
      const currentLevel =
        normalizeNumber(skills.get(skillId)?.current_level) ?? 0;
      const criticality = textValue(req, "criticality");
      const weight =
        criticality === "High" ? 3 : criticality === "Medium" ? 2 : 1;
      const gap = Math.max(0, requiredLevel - currentLevel);
      const gapStatus: SkillGapStatus =
        gap === 0 ? "Covered" : gap === 1 ? "Minor gap" : "Major gap";
      totalWeight += weight;
      weightedScore +=
        (requiredLevel > 0 ? Math.min(currentLevel / requiredLevel, 1) : 0) *
        weight;
      if (gap === 0) coveredSkills++;
      else if (gap === 1) minorGaps++;
      else majorGaps++;
      if (gap >= 2 && criticality === "High") criticalGaps++;
      return {
        skillId,
        skillName:
          (skillById.get(skillId)
            ? textValue(skillById.get(skillId)!, "skill_name")
            : "") ||
          textValue(req, "skill_name") ||
          skillId,
        requiredLevel,
        currentLevel,
        criticality,
        gap,
        gapStatus,
      };
    });
    const readinessScore =
      totalWeight > 0 ? (weightedScore / totalWeight) * 100 : 0;
    return {
      readinessScore,
      readinessStatus: readinessStatusFor(readinessScore),
      coveredSkills,
      minorGaps,
      majorGaps,
      criticalGaps,
      skillDetails,
    };
  };

  const allCandidates: SuccessionCandidateMetric[] = [];
  const criticalRoles: SuccessionCriticalRoleMetric[] = [];

  for (const target of criticalRoleCandidates) {
    const targetRequirements = target.requirements;
    const ranked = input.orgRows
      .filter((row) => {
        const employeeId = textValue(row, input.orgEmployeeIdColumn);
        return employeeId && employeeId !== target.employeeId && !criticalEmployeeIds.has(employeeId);
      })
      .map((candidateRow) => {
        const candidateId = textValue(candidateRow, input.orgEmployeeIdColumn);
        const score = scoreCandidate(targetRequirements, candidateRow);
        const selected =
          selectedRecordsByPair.get(
            selectedCandidateKey(target.employeeId, candidateId),
          ) ?? null;
        const selectedCount = selectedByCandidate.get(candidateId)?.length ?? 0;
        const currentWorkloadPct = workloadByEmployee.get(candidateId) ?? 0;
        const attentionReasons = [
          selectedCount >= 2 ? "Selected for multiple roles" : "",
          currentWorkloadPct > 110 ? "Capacity risk" : "",
        ].filter(Boolean);
        return {
          targetEmployeeId: target.employeeId,
          candidateEmployeeId: candidateId,
          candidateName: firstText(candidateRow, nameFields) || candidateId,
          currentRole: firstText(candidateRow, roleFields),
          department: firstText(candidateRow, departmentFields),
          grade: firstText(candidateRow, gradeFields),
          readinessScore: score.readinessScore,
          readinessStatus:
            selected?.readiness_status ?? score.readinessStatus,
          rank: 0,
          status: selected?.status ?? "Suggested",
          selectedFlag:
            selected?.selected_flag ??
            (selected ? isSelectedSuccessionStatus(selected.status) : false),
          coveredSkills: score.coveredSkills,
          minorGaps: score.minorGaps,
          majorGaps: score.majorGaps,
          criticalGaps: score.criticalGaps,
          currentWorkloadPct,
          alreadySelectedFor: selectedCount,
          attentionFlag:
            selected?.attention_flag ?? attentionReasons.length > 0,
          attentionReason:
            selected?.attention_reason ?? attentionReasons.join("; "),
          skillDetails: score.skillDetails,
        } satisfies SuccessionCandidateMetric;
      })
      .filter(
        (candidate) =>
          targetRequirements.length === 0 || candidate.readinessScore > 0,
      )
      .sort(
        (a, b) =>
          b.readinessScore - a.readinessScore ||
          a.currentWorkloadPct - b.currentWorkloadPct ||
          a.candidateName.localeCompare(b.candidateName),
      )
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

    allCandidates.push(...ranked);
    const readyCandidates = ranked.filter(
      (candidate) =>
        candidate.status !== "Rejected" && candidate.readinessScore >= 70,
    );
    const bestReadiness = ranked[0]?.readinessScore ?? 0;
    const requiredCriticalSkills = targetRequirements.filter(
      (req) => textValue(req, "criticality") === "High",
    ).length;
    let successionRisk: SuccessionRiskStatus =
      readyCandidates.length === 0
        ? "High"
        : readyCandidates.length === 1
          ? "Medium"
          : "Low";
    if (readyCandidates.some((candidate) => candidate.readinessScore >= 85)) {
      successionRisk = readyCandidates.length === 1 ? "Low" : successionRisk;
    }
    if (target.criticalActivityDetails.length > 0 && readyCandidates.length === 0)
      successionRisk = "High";
    const riskReasons = [
      readyCandidates.length === 0 ? "No candidate above 70% readiness" : "",
      readyCandidates.length === 1 ? "Only one ready successor" : "",
      target.criticalActivityDetails.length > 0
        ? "Owns high-criticality activities"
        : "",
    ].filter(Boolean);

    criticalRoles.push({
      employeeId: target.employeeId,
      employeeName: target.employeeName,
      role: target.role,
      department: target.department,
      grade: target.grade,
      span: target.span,
      loadedCost: target.loadedCost,
      currentWorkloadPct: target.workload,
      criticalityScore: target.criticalityScore,
      criticalActivitiesOwned: target.criticalActivityDetails.length,
      criticalActivityDetails: target.criticalActivityDetails,
      criticalSkillsHeld: target.criticalSkillsHeld,
      requiredCriticalSkills,
      successorCount: readyCandidates.length,
      bestSuccessorReadiness: bestReadiness,
      successionRisk,
      riskReasons,
    });
  }

  const successorLoads: SuccessionLoadMetric[] = [...selectedByCandidate.entries()]
    .map(([candidateId, records]) => {
      const candidateRow = orgById.get(candidateId);
      const candidateName = firstText(candidateRow, nameFields) || candidateId;
      const departments = new Set(
        records
          .map((record) => criticalRoles.find((role) => role.employeeId === record.target_employee_id)?.department)
          .filter(Boolean),
      );
      const targetRoles = records.map((record) => {
        const target = criticalRoles.find(
          (role) => role.employeeId === record.target_employee_id,
        );
        return target
          ? `${target.employeeName} - ${target.role}`
          : record.target_employee_id;
      });
      const currentWorkloadPct = workloadByEmployee.get(candidateId) ?? 0;
      const isCriticalIncumbent = criticalEmployeeIds.has(candidateId);
      const averageReadiness =
        records.reduce((sum, record) => sum + record.readiness_score, 0) /
        Math.max(records.length, 1);
      let conflictRisk: SuccessionConflictRisk = "None";
      let recommendedAction = "No action required";
      if (records.length >= 3) {
        conflictRisk = "High conflict";
        recommendedAction = "Choose alternate successors for lower-priority roles.";
      } else if (records.length >= 2) {
        conflictRisk = "Attention";
        recommendedAction = "Confirm prioritization across selected roles.";
      }
      if (departments.size > 1) {
        conflictRisk = "Review required";
        recommendedAction = "Review cross-department succession ownership.";
      }
      if (currentWorkloadPct > 110) {
        conflictRisk = "Capacity risk";
        recommendedAction = "Reduce workload or identify a backup successor.";
      }
      if (isCriticalIncumbent) {
        conflictRisk = "Backfill risk";
        recommendedAction = "Backfill candidate's current critical role first.";
      }
      return {
        candidateEmployeeId: candidateId,
        candidateName,
        selectedTargetRoles: targetRoles,
        selectedTargetCount: records.length,
        averageReadiness,
        currentWorkloadPct,
        conflictRisk,
        recommendedAction,
      };
    })
    .sort(
      (a, b) =>
        b.selectedTargetCount - a.selectedTargetCount ||
        b.currentWorkloadPct - a.currentWorkloadPct ||
        a.candidateName.localeCompare(b.candidateName),
    );

  const rolesWithoutSuccessor = criticalRoles.filter(
    (role) => role.successorCount === 0,
  ).length;
  const rolesWithOneSuccessor = criticalRoles.filter(
    (role) => role.successorCount === 1,
  ).length;
  const averageSuccessorReadiness =
    criticalRoles.length > 0
      ? criticalRoles.reduce(
          (sum, role) => sum + role.bestSuccessorReadiness,
          0,
        ) / criticalRoles.length
      : 0;
  const highRiskRoles = criticalRoles.filter(
    (role) => role.successionRisk === "High",
  ).length;
  const duplicateSuccessorFlags = successorLoads.filter(
    (load) => load.selectedTargetCount >= 2,
  ).length;
  const criticalActivityDependency = criticalRoles.filter(
    (role) => role.criticalActivitiesOwned > 0,
  ).length;

  return {
    kpis: {
      criticalRoles: criticalRoles.length,
      rolesWithoutSuccessor,
      rolesWithOneSuccessor,
      averageSuccessorReadiness,
      highRiskRoles,
      duplicateSuccessorFlags,
      criticalActivityDependency,
    },
    criticalRoles: criticalRoles.sort(
      (a, b) =>
        b.criticalityScore - a.criticalityScore ||
        a.employeeName.localeCompare(b.employeeName),
    ),
    candidates: allCandidates,
    successorLoads,
    filterOptions: {
      departments: Array.from(
        new Set(criticalRoles.map((role) => role.department).filter(Boolean)),
      ).sort(),
      riskStatuses: ["High", "Medium", "Low"],
      readinessStatuses: [
        "Ready Now",
        "Ready Soon",
        "Development Needed",
        "Not Recommended",
      ],
      candidateStatuses: ["Suggested", "Selected", "Rejected", "Backup"],
    },
  };
}

export function getWorkCapabilityArchiveImpact(input: {
  dataset: WorkCapabilityDataset;
  portfolio: WorkCapabilityActivityPortfolio;
  activityIds: string[];
}): WorkCapabilityArchiveImpact {
  const activityIds = new Set(input.activityIds);
  const selectedActivities = input.portfolio.activities.filter((activity) =>
    activityIds.has(activity.activityId),
  );
  const people = new Set<string>();
  let accountabilityLinks = 0;

  for (const activity of selectedActivities) {
    for (const row of activity.deliveryFootprint) {
      if (row.employeeId) people.add(row.employeeId);
      if (row.accountability) accountabilityLinks += 1;
    }
  }

  return {
    activityCount: selectedActivities.length,
    assignedPeople: people.size,
    totalCost: selectedActivities.reduce(
      (sum, activity) => sum + activity.totalCost,
      0,
    ),
    totalFTE: selectedActivities.reduce(
      (sum, activity) => sum + activity.totalFTE,
      0,
    ),
    skillRequirements: input.dataset.shared.activitySkillRequirements.filter(
      (row) => activityIds.has(textValue(row, "activity_id")),
    ).length,
    accountabilityLinks,
  };
}

export function getWorkCapabilityMergeImpact(input: {
  dataset: WorkCapabilityDataset;
  portfolio: WorkCapabilityActivityPortfolio;
  sourceActivityIds: string[];
  targetActivityId: string;
}): WorkCapabilityMergeImpact {
  const sourceIds = new Set(
    input.sourceActivityIds.filter((id) => id && id !== input.targetActivityId),
  );
  const relevantSkillRequirements =
    input.dataset.shared.activitySkillRequirements
      .filter(
        (row) =>
          sourceIds.has(textValue(row, "activity_id")) ||
          textValue(row, "activity_id") === input.targetActivityId,
      )
      .map((row) => ({
        activity_id: sourceIds.has(textValue(row, "activity_id"))
          ? input.targetActivityId
          : textValue(row, "activity_id"),
        skill_id: textValue(row, "skill_id"),
      }));
  const skillKeys = new Set(
    relevantSkillRequirements.map(
      (row) => `${row.activity_id}::${row.skill_id}`,
    ),
  );

  return {
    assignmentsMoved: input.dataset.states.asIs.activityAssignments.filter(
      (row) => sourceIds.has(textValue(row, "activity_id")),
    ).length,
    skillRequirementsMerged:
      input.dataset.shared.activitySkillRequirements.filter((row) =>
        sourceIds.has(textValue(row, "activity_id")),
      ).length,
    duplicateSkillRequirementsDeduped: Math.max(
      0,
      relevantSkillRequirements.length - skillKeys.size,
    ),
    costAffected: input.portfolio.activities
      .filter((activity) => sourceIds.has(activity.activityId))
      .reduce((sum, activity) => sum + activity.totalCost, 0),
    fteAffected: input.portfolio.activities
      .filter((activity) => sourceIds.has(activity.activityId))
      .reduce((sum, activity) => sum + activity.totalFTE, 0),
  };
}

export function buildWorkCapabilityTaxonomyCleanupSuggestions(input: {
  dataset: WorkCapabilityDataset;
  portfolio: WorkCapabilityActivityPortfolio;
}): WorkCapabilityTaxonomyCleanupSuggestion[] {
  const suggestions: WorkCapabilityTaxonomyCleanupSuggestion[] = [];
  const activeActivities = input.portfolio.activities.filter(
    (activity) => activity.active,
  );

  const byName = new Map<string, WorkCapabilityActivityMetric[]>();
  for (const activity of activeActivities) {
    const key = normalizedLabelKey(activity.activityName);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(activity);
  }
  for (const [key, activities] of byName) {
    if (activities.length < 2) continue;
    suggestions.push({
      id: `duplicate:${key}`,
      type: "possible_duplicate",
      severity: "Medium",
      title: `Possible duplicate activities: ${activities[0].activityName}`,
      description: `${activities.length} activities share the same or very similar name.`,
      activityIds: activities.map((activity) => activity.activityId),
      count: activities.length,
      actions: ["Review", "Merge"],
    });
  }

  const activeCategoryMap = new Map<string, WorkCapabilityActivityMetric[]>();
  for (const activity of activeActivities) {
    const key = `${activity.domain}::${activity.category}`;
    if (!activeCategoryMap.has(key)) activeCategoryMap.set(key, []);
    activeCategoryMap.get(key)!.push(activity);
  }
  for (const [categoryKey, categoryActivities] of activeCategoryMap) {
    const processes = new Set(
      categoryActivities.map((activity) => activity.processArea),
    );
    if (processes.size !== 1 || categoryActivities.length !== 1) continue;
    const [domain, category] = categoryKey.split("::");
    const processArea = Array.from(processes)[0];
    const activityIds = categoryActivities.map(
      (activity) => activity.activityId,
    );
    suggestions.push({
      id: `single-child:${workCapabilityProcessNodeId(domain, category, processArea)}`,
      type: "single_child_chain",
      severity: "Low",
      title: `Single-child chain: ${domain} / ${category} / ${processArea}`,
      description:
        "This branch has one category, one process, and one activity. It may be over-classified.",
      activityIds,
      count: activityIds.length,
      actions: ["Review"],
    });
  }

  const unassigned = activeActivities.filter(
    (activity) => activity.assignedPeople === 0,
  );
  if (unassigned.length > 0) {
    suggestions.push({
      id: "unassigned-activities",
      type: "unassigned_activity",
      severity: "High",
      title: `${unassigned.length} activities have no assigned people`,
      description:
        "These activities are in the taxonomy but have no delivery footprint yet.",
      activityIds: unassigned.map((activity) => activity.activityId),
      count: unassigned.length,
      actions: ["Review", "Archive"],
    });
  }

  const missingSkills = activeActivities.filter(
    (activity) => activity.requiredSkills.length === 0,
  );
  if (missingSkills.length > 0) {
    suggestions.push({
      id: "missing-skill-requirements",
      type: "missing_skill_requirements",
      severity: "Medium",
      title: `${missingSkills.length} activities are missing required skills`,
      description:
        "Add skill requirements before relying on capability risk views for these activities.",
      activityIds: missingSkills.map((activity) => activity.activityId),
      count: missingSkills.length,
      actions: ["Review", "Add Skills"],
    });
  }

  const ownerGaps = activeActivities.filter(
    (activity) => activity.accountableCount === 0,
  );
  if (ownerGaps.length > 0) {
    suggestions.push({
      id: "missing-accountable-owner",
      type: "missing_accountable_owner",
      severity: "High",
      title: `${ownerGaps.length} activities have no accountable owner`,
      description: "Accountability gaps can make process ownership unclear.",
      activityIds: ownerGaps.map((activity) => activity.activityId),
      count: ownerGaps.length,
      actions: ["Review"],
    });
  }

  const archived = input.dataset.shared.activityLibrary.filter(
    (row) => !activityIsActive(row),
  );
  if (archived.length > 0) {
    suggestions.push({
      id: "archived-activities",
      type: "archived_count",
      severity: "Low",
      title: `${archived.length} archived activities are hidden by default`,
      description:
        "Turn on Show Archived to review or restore archived taxonomy rows.",
      activityIds: archived.map((row) => textValue(row, "activity_id")),
      count: archived.length,
      actions: ["Review"],
    });
  }

  return suggestions.sort(
    (a, b) =>
      criticalityRank(b.severity) - criticalityRank(a.severity) ||
      b.count - a.count,
  );
}

function coerceActivityPatch(
  patch: Partial<ActivityLibraryRow>,
): Partial<ActivityLibraryRow> {
  const next: Partial<ActivityLibraryRow> = { ...patch };
  if (next.automation_cost_reduction_pct != null) {
    next.automation_cost_reduction_pct =
      normalizeNumber(next.automation_cost_reduction_pct) ?? 0;
  }
  if (next.outsourcing_cost_reduction_pct != null) {
    next.outsourcing_cost_reduction_pct =
      normalizeNumber(next.outsourcing_cost_reduction_pct) ?? 0;
  }
  if (next.active_flag != null) {
    next.active_flag =
      normalizeBoolean(next.active_flag) ?? Boolean(next.active_flag);
  }
  return next;
}

function mutationTarget(mutation: TaxonomyMutation): string {
  if (mutation.type === "rename_process")
    return `${mutation.from} -> ${mutation.to}`;
  if (mutation.type === "rename_category")
    return `${mutation.processArea} / ${mutation.from} -> ${mutation.to}`;
  if (mutation.type === "move_category")
    return `${mutation.processArea} / ${mutation.category} -> ${mutation.toProcessArea}`;
  if (mutation.type === "move_activity") return mutation.activityId;
  if (mutation.type === "update_activity") return mutation.activityId;
  if (mutation.type === "add_activity") return mutation.row.activity_id;
  if (mutation.type === "deactivate_activity") return mutation.activityId;
  if (mutation.type === "deactivate_activities")
    return mutation.activityIds.join(", ");
  return `${mutation.sourceActivityIds.join(", ")} -> ${mutation.targetActivityId}`;
}

function syncTaxonomyLoadedCount(
  dataset: WorkCapabilityDataset,
): WorkCapabilityDataset {
  return {
    ...dataset,
    validation: {
      ...dataset.validation,
      loaded: {
        ...dataset.validation.loaded,
        activity_library: dataset.shared.activityLibrary.length,
        activity_assignments: dataset.states.asIs.activityAssignments.length,
        activity_skill_requirements:
          dataset.shared.activitySkillRequirements.length,
      },
    },
  };
}

function appendMergeNote(existing: unknown, next: unknown): string {
  const values = [existing, next]
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean);
  return Array.from(new Set(values)).join(" | ");
}

function dedupeMergedAssignments(
  rows: ActivityAssignmentRow[],
): ActivityAssignmentRow[] {
  const byKey = new Map<string, ActivityAssignmentRow>();
  for (const row of rows) {
    const key = [
      textValue(row, "employee_id"),
      textValue(row, "activity_id"),
      textValue(row, "accountability"),
    ].join("::");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...row,
        time_allocation_pct: normalizeNumber(row.time_allocation_pct) ?? 0,
      });
      continue;
    }
    byKey.set(key, {
      ...existing,
      time_allocation_pct:
        (normalizeNumber(existing.time_allocation_pct) ?? 0) +
        (normalizeNumber(row.time_allocation_pct) ?? 0),
      notes: appendMergeNote(existing.notes, row.notes),
    });
  }
  return Array.from(byKey.values());
}

function highestCriticalityValue(a: string, b: string): string {
  return criticalityRank(b) > criticalityRank(a) ? b : a;
}

function dedupeMergedSkillRequirements(
  rows: ActivitySkillRequirementRow[],
): ActivitySkillRequirementRow[] {
  const byKey = new Map<string, ActivitySkillRequirementRow>();
  for (const row of rows) {
    const key = [
      textValue(row, "activity_id"),
      textValue(row, "skill_id"),
    ].join("::");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...row,
        required_level: normalizeNumber(row.required_level) ?? 0,
        weight: normalizeNumber(row.weight) ?? 0,
      });
      continue;
    }
    byKey.set(key, {
      ...existing,
      required_level: Math.max(
        normalizeNumber(existing.required_level) ?? 0,
        normalizeNumber(row.required_level) ?? 0,
      ),
      criticality: highestCriticalityValue(
        textValue(existing, "criticality"),
        textValue(row, "criticality"),
      ),
      weight: Math.max(
        normalizeNumber(existing.weight) ?? 0,
        normalizeNumber(row.weight) ?? 0,
      ),
    });
  }
  return Array.from(byKey.values());
}

export function applyWorkCapabilityTaxonomyMutation(
  dataset: WorkCapabilityDataset,
  mutation: TaxonomyMutation,
): WorkCapabilityDataset {
  const impact = getWorkCapabilityTaxonomyMutationImpact(dataset, mutation);
  const next = clone(dataset);
  const now = new Date().toISOString();

  if (mutation.type === "rename_process") {
    const to = mutation.to.trim();
    if (!to) throw new Error("Process area name is required");
    next.shared.activityLibrary = next.shared.activityLibrary.map(
      (row: ActivityLibraryRow) =>
        textValue(row, "process_area") === mutation.from
          ? { ...row, process_area: to }
          : row,
    );
  } else if (mutation.type === "rename_category") {
    const to = mutation.to.trim();
    if (!to) throw new Error("Activity category name is required");
    next.shared.activityLibrary = next.shared.activityLibrary.map(
      (row: ActivityLibraryRow) =>
        textValue(row, "process_area") === mutation.processArea &&
        textValue(row, "activity_category") === mutation.from
          ? { ...row, activity_category: to }
          : row,
    );
  } else if (mutation.type === "move_category") {
    const toProcessArea = mutation.toProcessArea.trim();
    if (!toProcessArea) throw new Error("Target process area is required");
    next.shared.activityLibrary = next.shared.activityLibrary.map(
      (row: ActivityLibraryRow) =>
        textValue(row, "process_area") === mutation.processArea &&
        textValue(row, "activity_category") === mutation.category
          ? { ...row, process_area: toProcessArea }
          : row,
    );
  } else if (mutation.type === "move_activity") {
    const processArea = mutation.processArea.trim();
    const category = mutation.category.trim();
    if (!processArea || !category)
      throw new Error("Process area and category are required");
    next.shared.activityLibrary = next.shared.activityLibrary.map(
      (row: ActivityLibraryRow) =>
        textValue(row, "activity_id") === mutation.activityId
          ? { ...row, process_area: processArea, activity_category: category }
          : row,
    );
  } else if (mutation.type === "update_activity") {
    next.shared.activityLibrary = next.shared.activityLibrary.map(
      (row: ActivityLibraryRow) =>
        textValue(row, "activity_id") === mutation.activityId
          ? {
              ...row,
              ...coerceActivityPatch(mutation.patch),
              activity_id: row.activity_id,
            }
          : row,
    );
  } else if (mutation.type === "add_activity") {
    const activityId = textValue(mutation.row, "activity_id");
    if (!activityId) throw new Error("activity_id is required");
    if (
      next.shared.activityLibrary.some(
        (row: ActivityLibraryRow) =>
          textValue(row, "activity_id") === activityId,
      )
    ) {
      throw new Error(
        `activity_id ${activityId} already exists in activity_library`,
      );
    }
    next.shared.activityLibrary = [
      ...next.shared.activityLibrary,
      {
        ...mutation.row,
        ...coerceActivityPatch(mutation.row),
        active_flag: normalizeBoolean(mutation.row.active_flag) ?? true,
      },
    ];
  } else if (mutation.type === "deactivate_activity") {
    next.shared.activityLibrary = next.shared.activityLibrary.map(
      (row: ActivityLibraryRow) =>
        textValue(row, "activity_id") === mutation.activityId
          ? { ...row, active_flag: false }
          : row,
    );
  } else if (mutation.type === "deactivate_activities") {
    const activityIds = new Set(mutation.activityIds);
    next.shared.activityLibrary = next.shared.activityLibrary.map(
      (row: ActivityLibraryRow) =>
        activityIds.has(textValue(row, "activity_id"))
          ? { ...row, active_flag: false, last_updated_at: now }
          : row,
    );
  } else if (mutation.type === "merge_activities") {
    const sourceIds = new Set(
      mutation.sourceActivityIds.filter(
        (id) => id !== mutation.targetActivityId,
      ),
    );
    const mergedActivityNames = next.shared.activityLibrary
      .filter((row: ActivityLibraryRow) =>
        sourceIds.has(textValue(row, "activity_id")),
      )
      .map(
        (row: ActivityLibraryRow) =>
          textValue(row, "activity_name") || textValue(row, "activity_id"),
      );
    next.shared.activityLibrary = next.shared.activityLibrary.map(
      (row: ActivityLibraryRow) =>
        sourceIds.has(textValue(row, "activity_id"))
          ? {
              ...row,
              active_flag: false,
              merged_into_activity_id: mutation.targetActivityId,
              last_updated_at: now,
            }
          : row,
    );
    next.shared.activitySkillRequirements = dedupeMergedSkillRequirements(
      next.shared.activitySkillRequirements.map(
        (row: ActivitySkillRequirementRow) =>
          sourceIds.has(textValue(row, "activity_id"))
            ? { ...row, activity_id: mutation.targetActivityId }
            : row,
      ),
    );
    next.states.asIs.activityAssignments = dedupeMergedAssignments(
      next.states.asIs.activityAssignments.map((row: ActivityAssignmentRow) =>
        sourceIds.has(textValue(row, "activity_id"))
          ? { ...row, activity_id: mutation.targetActivityId }
          : row,
      ),
    );
    if (next.states.toBe) {
      next.states.toBe.activityAssignments = dedupeMergedAssignments(
        next.states.toBe.activityAssignments.map(
          (row: ActivityAssignmentRow) =>
            sourceIds.has(textValue(row, "activity_id"))
              ? { ...row, activity_id: mutation.targetActivityId }
              : row,
        ),
      );
      next.states.toBe.updatedAt = now;
      next.states.toBe.revision += 1;
    }
    next.activityMergeLog = [
      ...(next.activityMergeLog ?? []),
      {
        merge_id: `MRG_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        survivor_activity_id: mutation.targetActivityId,
        merged_activity_ids: Array.from(sourceIds),
        merged_activity_names: mergedActivityNames,
        assignments_moved: impact.assignmentRows,
        skill_requirements_moved: impact.skillRequirementRows,
        created_at: now,
      },
    ];
  } else {
    throw new Error("Unsupported taxonomy mutation");
  }

  next.revision += 1;
  next.taxonomyChangeLog = [
    ...(next.taxonomyChangeLog ?? []),
    {
      id: idForTaxonomyChange(),
      action: mutation.type,
      target: mutationTarget(mutation),
      affected: impact,
      timestamp: now,
    },
  ];

  return applyNormalizationToDataset(syncTaxonomyLoadedCount(next));
}

function validateScalar(
  type: WorkCapabilityDatasetType,
  row: ExcelRow,
  index: number,
  field: string,
  spec: FieldSpec,
  errors: string[],
): void {
  const value = rowValue(row, field);
  if (spec.required && isBlank(value)) {
    if (
      type === "activity_library" &&
      ["department_focus", "activity_category", "process_area"].includes(field)
    )
      return;
    errors.push(`${type} row ${rowNumber(index)}: ${field} is required`);
    return;
  }
  if (isBlank(value)) return;

  if (spec.type === "number" || spec.type === "integer") {
    const parsed = normalizeNumber(value);
    if (
      parsed == null ||
      (spec.type === "integer" && !Number.isInteger(parsed))
    ) {
      errors.push(
        `${type} row ${rowNumber(index)}: ${field} must be a ${spec.type === "integer" ? "integer" : "number"}`,
      );
      return;
    }
    if (spec.min != null && parsed < spec.min)
      errors.push(
        `${type} row ${rowNumber(index)}: ${field} must be at least ${spec.min}`,
      );
    if (spec.max != null && parsed > spec.max)
      errors.push(
        `${type} row ${rowNumber(index)}: ${field} must be at most ${spec.max}`,
      );
  }

  if (spec.type === "boolean" && normalizeBoolean(value) == null) {
    errors.push(`${type} row ${rowNumber(index)}: ${field} must be a boolean`);
  }

  void type;
}

function validateRows(
  type: WorkCapabilityDatasetType,
  file: ParsedWorkCapabilityFile,
  errors: string[],
  warnings: string[],
): void {
  const spec = SPECS[type];
  const headers = new Set(file.headers);
  for (const header of spec.requiredHeaders) {
    if (!headers.has(header))
      errors.push(`${type}: missing required column ${header}`);
  }

  const seen = new Set<string>();
  file.rows.forEach((row, index) => {
    const key = textValue(row, spec.primaryKey);
    if (key) {
      if (seen.has(key)) errors.push(`${type}: duplicate primary key ${key}`);
      seen.add(key);
    }
    for (const [field, fieldSpec] of Object.entries(spec.fields)) {
      validateScalar(type, row, index, field, fieldSpec, errors);
    }

    if ("active_flag" in row && normalizeBoolean(row.active_flag) === false) {
      warnings.push(`${type} row ${rowNumber(index)}: active_flag is false`);
    }
    if ("confidence_score" in spec.fields && isBlank(row.confidence_score)) {
      warnings.push(
        `${type} row ${rowNumber(index)}: confidence_score is missing`,
      );
    }
  });
}

function validateRelationships(
  filesByType: Partial<
    Record<WorkCapabilityDatasetType, ParsedWorkCapabilityFile>
  >,
  orgRows: ExcelRow[],
  orgEmployeeIdColumn: string,
  errors: string[],
  warnings: string[],
): void {
  const orgIds = new Set(
    orgRows.map((row) => textValue(row, orgEmployeeIdColumn)).filter(Boolean),
  );
  const activities = new Set(
    (filesByType.activity_library?.rows ?? [])
      .map((row) => textValue(row, "activity_id"))
      .filter(Boolean),
  );
  const skills = new Set(
    (filesByType.skill_library?.rows ?? [])
      .map((row) => textValue(row, "skill_id"))
      .filter(Boolean),
  );

  (filesByType.activity_assignments?.rows ?? []).forEach((row, index) => {
    const employeeId = textValue(row, "employee_id");
    const activityId = textValue(row, "activity_id");
    if (employeeId && !orgIds.has(employeeId))
      errors.push(
        `activity_assignments row ${rowNumber(index)}: employee_id ${employeeId} does not exist in As-Is org rows`,
      );
    if (activityId && !activities.has(activityId))
      errors.push(
        `activity_assignments row ${rowNumber(index)}: activity_id ${activityId} does not exist in activity_library`,
      );
    const orgRow = orgRows.find(
      (candidate) => textValue(candidate, orgEmployeeIdColumn) === employeeId,
    );
    if (
      orgRow &&
      !isBlank(row.employee_name) &&
      !isBlank(orgRow.name) &&
      textValue(row, "employee_name") !== textValue(orgRow, "name")
    ) {
      warnings.push(
        `activity_assignments row ${rowNumber(index)}: employee_name differs from org data`,
      );
    }
  });

  (filesByType.employee_skills?.rows ?? []).forEach((row, index) => {
    const employeeId = textValue(row, "employee_id");
    const skillId = textValue(row, "skill_id");
    if (employeeId && !orgIds.has(employeeId))
      errors.push(
        `employee_skills row ${rowNumber(index)}: employee_id ${employeeId} does not exist in As-Is org rows`,
      );
    if (skillId && !skills.has(skillId))
      errors.push(
        `employee_skills row ${rowNumber(index)}: skill_id ${skillId} does not exist in skill_library`,
      );
  });

  (filesByType.role_skill_requirements?.rows ?? []).forEach((row, index) => {
    const skillId = textValue(row, "skill_id");
    if (skillId && !skills.has(skillId))
      errors.push(
        `role_skill_requirements row ${rowNumber(index)}: skill_id ${skillId} does not exist in skill_library`,
      );
  });

  (filesByType.activity_skill_requirements?.rows ?? []).forEach(
    (row, index) => {
      const activityId = textValue(row, "activity_id");
      const skillId = textValue(row, "skill_id");
      if (activityId && !activities.has(activityId))
        errors.push(
          `activity_skill_requirements row ${rowNumber(index)}: activity_id ${activityId} does not exist in activity_library`,
        );
      if (skillId && !skills.has(skillId))
        errors.push(
          `activity_skill_requirements row ${rowNumber(index)}: skill_id ${skillId} does not exist in skill_library`,
        );
    },
  );
}

export function validateWorkCapabilityFiles(input: {
  files: ParsedWorkCapabilityFile[];
  orgRows: ExcelRow[];
  orgEmployeeIdColumn: string;
}): WorkCapabilityValidationSummary {
  const errors: string[] = [];
  const warnings: string[] = [];
  const loaded = emptyLoaded();
  const filesByType = byType(input.files);
  const normalization = buildNormalizationSummary(filesByType);

  for (const type of DATASET_ORDER) {
    const file = filesByType[type];
    if (!file) {
      errors.push(`${type}: required dataset was not uploaded`);
      continue;
    }
    loaded[type] = file.rows.length;
    validateRows(type, file, errors, warnings);
  }

  validateRelationships(
    filesByType,
    input.orgRows,
    input.orgEmployeeIdColumn,
    errors,
    warnings,
  );

  if (normalization.totalGroups > 0) {
    warnings.push(
      `Normalization: ${normalization.totalGroups} non-standard label groups found; ` +
        `${normalization.autoApplied} auto-normalized; ${normalization.needsReview} need review.`,
    );
  }

  return {
    status:
      errors.length > 0
        ? "failed"
        : warnings.length > 0
          ? "imported_with_warnings"
          : "success",
    loaded,
    errors,
    warnings,
    normalization,
  };
}

export function createWorkCapabilityDataset(input: {
  orgDatasetId: string;
  files: ParsedWorkCapabilityFile[];
  orgRows: ExcelRow[];
  orgEmployeeIdColumn: string;
}): WorkCapabilityDataset {
  const validation = validateWorkCapabilityFiles(input);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join("\n"));
  }

  const filesByType = byType(input.files);
  const uploadedAt = new Date().toISOString();
  const normalization = validation.normalization;

  const dataset: WorkCapabilityDataset = {
    datasetId: idForDataset(),
    orgDatasetId: input.orgDatasetId,
    uploadedAt,
    sourceFiles: DATASET_ORDER.map((type) => ({
      fileName: filesByType[type]?.fileName ?? `${type}.csv`,
      datasetType: type,
      rowCount: filesByType[type]?.rows.length ?? 0,
    })),
    shared: {
      activityLibrary: normalizeRowsForType<ActivityLibraryRow>(
        "activity_library",
        filesByType.activity_library?.rows ?? [],
        normalization,
      ),
      skillLibrary: normalizeRowsForType<SkillLibraryRow>(
        "skill_library",
        filesByType.skill_library?.rows ?? [],
        normalization,
      ),
      activitySkillRequirements:
        normalizeRowsForType<ActivitySkillRequirementRow>(
          "activity_skill_requirements",
          filesByType.activity_skill_requirements?.rows ?? [],
          normalization,
        ),
    },
    states: {
      asIs: {
        stateId: "asIs",
        activityAssignments: normalizeRowsForType<ActivityAssignmentRow>(
          "activity_assignments",
          filesByType.activity_assignments?.rows ?? [],
          normalization,
        ),
        roleSkillRequirements: normalizeRowsForType<RoleSkillRequirementRow>(
          "role_skill_requirements",
          filesByType.role_skill_requirements?.rows ?? [],
          normalization,
        ),
        employeeSkills: normalizeRowsForType<EmployeeSkillRow>(
          "employee_skills",
          filesByType.employee_skills?.rows ?? [],
          normalization,
        ),
        revision: 0,
        updatedAt: uploadedAt,
      },
    },
    validation,
    normalization,
    taxonomyChangeLog: [],
    activityMergeLog: [],
    revision: 0,
  };
  return dataset;
}

export function updateWorkCapabilityNormalization(
  dataset: WorkCapabilityDataset,
  input: {
    id: string;
    status: "approved" | "ignored";
    normalizedValue?: string;
  },
): WorkCapabilityDataset {
  const records = dataset.normalization.records.map((record) => {
    if (record.id !== input.id) return { ...record };
    if (input.status === "ignored") {
      return {
        ...record,
        status: "ignored" as const,
        normalizedValue: "",
      };
    }
    const normalizedValue = (
      input.normalizedValue ??
      record.suggestedValue ??
      ""
    ).trim();
    return {
      ...record,
      status: "approved" as const,
      suggestedValue: normalizedValue || record.suggestedValue,
      normalizedValue,
      confidence:
        normalizedValue === record.suggestedValue ? record.confidence : 1,
      reason:
        normalizedValue === record.suggestedValue
          ? record.reason
          : "User-approved custom normalization.",
    };
  });
  const normalization = emptyNormalization(records);
  const validation: WorkCapabilityValidationSummary = {
    ...dataset.validation,
    normalization,
    status:
      dataset.validation.errors.length > 0
        ? "failed"
        : dataset.validation.warnings.length > 0 ||
            normalization.totalGroups > 0
          ? "imported_with_warnings"
          : "success",
  };
  return applyNormalizationToDataset({
    ...dataset,
    normalization,
    validation,
    revision: dataset.revision + 1,
  });
}
