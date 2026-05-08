export const COST_SCHEMA = {
  base_pay:         ['salary', 'current_salary', 'base_salary', 'annual_salary', 'fixed_pay'],
  variable_pay:     ['bonus', 'current_bonus', 'variable_pay', 'incentive'],
  pension:          ['pension', 'retirement', 'retirement_contribution'],
  healthcare:       ['healthcare_cost', 'medical_cost', 'health_benefit', 'insurance'],
  other_benefits:   ['other_benefits', 'benefits', 'misc_benefits'],
  employer_taxes:   ['payroll_taxes', 'employer_tax', 'taxes'],
  equity_comp:      ['share_based_payments', 'stock_comp', 'rsu', 'equity'],
  allowances:       ['expenses', 'allowances', 'reimbursements'],
  recruitment_cost: ['recruitment_cost', 'hiring_cost'],
  relocation_cost:  ['relocation_cost', 'relocation'],
  termination_cost: ['cost_of_termination', 'severance', 'termination_cost'],
} as const;

export type CostKey = keyof typeof COST_SCHEMA;

export const LOADED_COMPONENTS: CostKey[] = [
  'base_pay', 'variable_pay', 'employer_taxes', 'pension',
  'healthcare', 'other_benefits', 'equity_comp', 'allowances',
];

export const TRANSITION_COMPONENTS: CostKey[] = [
  'recruitment_cost', 'relocation_cost', 'termination_cost',
];

export const COST_LABELS: Record<CostKey, string> = {
  base_pay:         'Base Pay',
  variable_pay:     'Variable Pay',
  pension:          'Pension',
  healthcare:       'Healthcare',
  other_benefits:   'Other Benefits',
  employer_taxes:   'Employer Taxes',
  equity_comp:      'Equity / RSU',
  allowances:       'Allowances',
  recruitment_cost: 'Recruitment Cost',
  relocation_cost:  'Relocation Cost',
  termination_cost: 'Termination Cost',
};

export const GROSS_SALARY_ALIASES = [
  'total_annual_compensation', 'total_compensation', 'ctc', 'total_ctc',
  'gross_salary', 'gross_pay', 'total_pay', 'annual_ctc', 'total_gross',
] as const;

export const TENURE_ALIASES = [
  'tenure', 'years_of_service', 'service_years', 'length_of_service',
  'years_at_company', 'seniority_years', 'months_of_service', 'seniority',
] as const;

export const JOB_FAMILY_ALIASES = [
  'job_family', 'function', 'department', 'dept', 'business_unit',
  'team', 'division', 'job_function', 'org_unit', 'group',
] as const;

export const EMPLOYEE_NAME_ALIASES = [
  'name', 'employee_name', 'full_name', 'display_name', 'worker_name',
  'employee', 'person_name', 'staff_name',
] as const;

export const EMPLOYEE_ID_ALIASES = [
  'employee_id', 'emp_id', 'id', 'worker_id', 'staff_id', 'person_id',
] as const;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s_\-.]/g, '');
}

export function fuzzyMatch(header: string, aliases: readonly string[]): boolean {
  const n = normalize(header);
  for (const a of aliases) {
    const na = normalize(a);
    if (n === na || n.includes(na) || na.includes(n)) return true;
  }
  return false;
}

export function detectCostColumns(headers: string[]): Partial<Record<CostKey, string>> {
  const result: Partial<Record<CostKey, string>> = {};
  for (const key of Object.keys(COST_SCHEMA) as CostKey[]) {
    const match = headers.find((h) => fuzzyMatch(h, COST_SCHEMA[key]));
    if (match) result[key] = match;
  }
  return result;
}

export function detectColumn(
  headers: string[],
  aliases: readonly string[],
): string | null {
  return headers.find((h) => fuzzyMatch(h, aliases)) ?? null;
}

export function fmtNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}
