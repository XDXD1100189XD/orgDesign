import type { ExcelRow } from '@/lib/parseExcel';
import type { WorkCapabilityDataset } from '@/lib/workCapabilityDataset';

export type WcTableName =
  | 'activity_library'
  | 'activity_assignments'
  | 'skill_library'
  | 'role_skill_requirements'
  | 'employee_skills'
  | 'activity_skill_requirements';

export const WC_TABLE_NAMES: WcTableName[] = [
  'activity_library',
  'activity_assignments',
  'skill_library',
  'role_skill_requirements',
  'employee_skills',
  'activity_skill_requirements',
];

export const WC_DERIVED_FIELDS: Partial<Record<WcTableName, string[]>> = {
  activity_library:            ['assigned_people', 'required_skills'],
  activity_assignments:        ['activity_name', 'activity_criticality'],
  skill_library:               ['employees_with_skill', 'employees_at_level_3_plus', 'activities_requiring_skill', 'roles_requiring_skill', 'single_point_risk'],
  role_skill_requirements:     ['skill_name', 'skill_family'],
  employee_skills:             ['skill_name', 'skill_family', 'skill_criticality'],
  activity_skill_requirements: ['skill_name', 'activity_name'],
};

export const WC_PRIMARY_KEYS: Partial<Record<WcTableName, string>> = {
  activity_library:            'activity_id',
  activity_assignments:        'assignment_id',
  skill_library:               'skill_id',
  role_skill_requirements:     'requirement_id',
  employee_skills:             'employee_skill_id',
  activity_skill_requirements: 'activity_skill_requirement_id',
};

export const WC_SCHEMA_RELATIONSHIPS: { from: string; to: string; key: string }[] = [
  { from: 'activity_assignments',        to: 'activity_library', key: 'activity_id'  },
  { from: 'activity_assignments',        to: 'org data',         key: 'employee_id'  },
  { from: 'activity_skill_requirements', to: 'activity_library', key: 'activity_id'  },
  { from: 'activity_skill_requirements', to: 'skill_library',    key: 'skill_id'     },
  { from: 'employee_skills',             to: 'skill_library',    key: 'skill_id'     },
  { from: 'employee_skills',             to: 'org data',         key: 'employee_id'  },
  { from: 'role_skill_requirements',     to: 'skill_library',    key: 'skill_id'     },
];

export function getWcRows(dataset: WorkCapabilityDataset, source: WcTableName): ExcelRow[] {
  switch (source) {
    case 'activity_library':            return dataset.shared.activityLibrary            as ExcelRow[];
    case 'activity_assignments':        return dataset.states.asIs.activityAssignments   as ExcelRow[];
    case 'skill_library':               return dataset.shared.skillLibrary               as ExcelRow[];
    case 'role_skill_requirements':     return dataset.states.asIs.roleSkillRequirements as ExcelRow[];
    case 'employee_skills':             return dataset.states.asIs.employeeSkills        as ExcelRow[];
    case 'activity_skill_requirements': return dataset.shared.activitySkillRequirements  as ExcelRow[];
    default: return [];
  }
}

export function computeWcDerived(dataset: WorkCapabilityDataset, source: WcTableName): ExcelRow[] {
  const base = getWcRows(dataset, source);
  switch (source) {
    case 'activity_library': {
      const assignments = dataset.states.asIs.activityAssignments;
      const actSkillReqs = dataset.shared.activitySkillRequirements;
      const assignedPeople = new Map<string, Set<string>>();
      for (const a of assignments) {
        const aid = String(a.activity_id ?? '');
        if (!assignedPeople.has(aid)) assignedPeople.set(aid, new Set());
        assignedPeople.get(aid)!.add(String(a.employee_id ?? ''));
      }
      const reqCounts = new Map<string, number>();
      for (const r of actSkillReqs) {
        const aid = String(r.activity_id ?? '');
        reqCounts.set(aid, (reqCounts.get(aid) ?? 0) + 1);
      }
      return base.map(row => ({
        ...row,
        assigned_people: assignedPeople.get(String(row.activity_id ?? ''))?.size ?? 0,
        required_skills: reqCounts.get(String(row.activity_id ?? '')) ?? 0,
      }));
    }

    case 'activity_assignments': {
      const actById = new Map(
        dataset.shared.activityLibrary.map(a => [String(a.activity_id ?? ''), a])
      );
      return base.map(row => {
        const act = actById.get(String(row.activity_id ?? ''));
        return {
          ...row,
          activity_name: act ? String(act.activity_name ?? '') : '',
          activity_criticality: act ? String(act.criticality ?? '') : '',
        };
      });
    }

    case 'skill_library': {
      const empSkills = dataset.states.asIs.employeeSkills;
      const actReqs = dataset.shared.activitySkillRequirements;
      const roleReqs = dataset.states.asIs.roleSkillRequirements;
      const empSet = new Map<string, Set<string>>();
      const emp3Set = new Map<string, Set<string>>();
      for (const es of empSkills) {
        const sid = String(es.skill_id ?? '');
        const eid = String(es.employee_id ?? '');
        const lvl = Number(es.current_level ?? 0);
        if (!empSet.has(sid)) empSet.set(sid, new Set());
        empSet.get(sid)!.add(eid);
        if (lvl >= 3) {
          if (!emp3Set.has(sid)) emp3Set.set(sid, new Set());
          emp3Set.get(sid)!.add(eid);
        }
      }
      const actCount = new Map<string, number>();
      for (const r of actReqs) {
        const sid = String(r.skill_id ?? '');
        actCount.set(sid, (actCount.get(sid) ?? 0) + 1);
      }
      const roleCount = new Map<string, number>();
      for (const r of roleReqs) {
        const sid = String(r.skill_id ?? '');
        roleCount.set(sid, (roleCount.get(sid) ?? 0) + 1);
      }
      return base.map(row => {
        const sid = String(row.skill_id ?? '');
        const ews = empSet.get(sid)?.size ?? 0;
        return {
          ...row,
          employees_with_skill: ews,
          employees_at_level_3_plus: emp3Set.get(sid)?.size ?? 0,
          activities_requiring_skill: actCount.get(sid) ?? 0,
          roles_requiring_skill: roleCount.get(sid) ?? 0,
          single_point_risk: ews <= 1 ? 'High' : ews <= 3 ? 'Medium' : 'Low',
        };
      });
    }

    case 'role_skill_requirements': {
      const skillById = new Map(
        dataset.shared.skillLibrary.map(s => [String(s.skill_id ?? ''), s])
      );
      return base.map(row => {
        const skill = skillById.get(String(row.skill_id ?? ''));
        return {
          ...row,
          skill_name: skill ? String(skill.skill_name ?? '') : '',
          skill_family: skill ? String(skill.skill_family ?? '') : '',
        };
      });
    }

    case 'employee_skills': {
      const skillById = new Map(
        dataset.shared.skillLibrary.map(s => [String(s.skill_id ?? ''), s])
      );
      return base.map(row => {
        const skill = skillById.get(String(row.skill_id ?? ''));
        return {
          ...row,
          skill_name: skill ? String(skill.skill_name ?? '') : '',
          skill_family: skill ? String(skill.skill_family ?? '') : '',
          skill_criticality: skill ? String(skill.criticality ?? '') : '',
        };
      });
    }

    case 'activity_skill_requirements': {
      const skillById = new Map(
        dataset.shared.skillLibrary.map(s => [String(s.skill_id ?? ''), s])
      );
      const actById = new Map(
        dataset.shared.activityLibrary.map(a => [String(a.activity_id ?? ''), a])
      );
      return base.map(row => {
        const skill = skillById.get(String(row.skill_id ?? ''));
        const act = actById.get(String(row.activity_id ?? ''));
        return {
          ...row,
          skill_name: skill ? String(skill.skill_name ?? '') : '',
          activity_name: act ? String(act.activity_name ?? '') : '',
        };
      });
    }

    default:
      return base;
  }
}
