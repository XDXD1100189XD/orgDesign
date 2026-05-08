// ── Types ──────────────────────────────────────────────────────────────────────

export type CanonicalField =
  | 'Employee ID' | 'Manager ID'
  | 'Full Name' | 'Business Title'
  | 'Department Name' | 'Division' | 'Sub-Division'
  | 'Location' | 'Country' | 'Region'
  | 'Job Family' | 'Job Sub Family'
  | 'Compensation Grade' | 'Management Level'
  | 'Worker Type' | 'FTE' | 'Annual Compensation' | 'Annual Rate'
  | 'Position Status' | 'Squad' | 'Days Open';

export interface MappingEntry {
  column:     string | null;  // null = "None"
  confidence: number;         // 0–1
  isManual:   boolean;
}

export type ColumnMapping = Record<CanonicalField, MappingEntry>;

export const CANONICAL_FIELDS: CanonicalField[] = [
  'Employee ID', 'Manager ID',
  'Full Name', 'Business Title',
  'Department Name', 'Division', 'Sub-Division', 'Location', 'Country', 'Region',
  'Job Family', 'Job Sub Family',
  'Compensation Grade', 'Management Level', 'Worker Type', 'FTE',
  'Annual Compensation', 'Annual Rate', 'Position Status', 'Squad', 'Days Open',
];

export const REQUIRED_FIELDS: CanonicalField[] = ['Employee ID', 'Manager ID'];

export const FIELD_GROUPS: { label: string; fields: CanonicalField[] }[] = [
  { label: 'Hierarchy',     fields: ['Employee ID', 'Manager ID'] },
  { label: 'Identity',      fields: ['Full Name', 'Business Title'] },
  { label: 'Organization',  fields: ['Department Name', 'Division', 'Sub-Division', 'Location', 'Country', 'Region'] },
  { label: 'Workforce',     fields: ['Job Family', 'Job Sub Family', 'Management Level', 'Worker Type', 'FTE', 'Position Status', 'Squad'] },
  { label: 'Compensation',  fields: ['Compensation Grade', 'Annual Compensation', 'Annual Rate'] },
  { label: 'Recruiting',    fields: ['Days Open'] },
];

// ── Dictionary ─────────────────────────────────────────────────────────────────

export const FIELD_DICTIONARY: Record<CanonicalField, string[]> = {
  'Employee ID': [
    'employee id', 'employee number', 'emp id', 'emp no', 'empno',
    'employee code', 'emp code', 'worker id', 'worker number',
    'personnel number', 'personnel no', 'pers no', 'pernr',
    'associate id', 'associate number', 'staff id', 'staff number',
    'employee identifier', 'employee unique id', 'user id', 'userid',
    'person id', 'person number', 'people id',
    'position id', 'position number', 'position code', 'pos id', 'pos no',
    'position identifier', 'position reference', 'position ref',
    'headcount id', 'hc id', 'badge id', 'badge number',
    'hr id', 'hris id', 'workday id', 'sap id', 'oracle id',
    'id', 'uid', 'unique id',
  ],
  'Manager ID': [
    'manager id', 'manager number', 'mgr id', 'mgr no', 'mgrid',
    'manager code', 'manager employee id', 'manager emp id',
    'supervisor id', 'supervisor number', 'sup id', 'supv id',
    'reports to id', 'reports to', 'reportsto',
    'reporting manager id', 'reporting to', 'reporting manager',
    'manager position id', 'manager position', 'mgr position id',
    'parent position id', 'parent id', 'parent employee id',
    'supervisor position id', 'supervisory org manager',
    'line manager id', 'line manager', 'boss id', 'leader id',
    'direct manager id', 'immediate supervisor id', 'head id',
  ],
  'Business Title': [
    'business title', 'job title', 'title', 'position title',
    'role title', 'role', 'role name', 'job role', 'designation',
    'job designation', 'official title', 'working title',
    'functional title', 'display title', 'card label', 'card title',
    'position name', 'job name', 'post', 'post title', 'rank',
    'current title', 'primary title',
  ],
  'Full Name': [
    'full name', 'fullname', 'name', 'employee name', 'emp name',
    'worker name', 'person name', 'display name', 'preferred name',
    'legal name', 'complete name', 'full legal name', 'staff name',
    'associate name', 'user name',
    'first name last name', 'firstname lastname', 'first and last name',
    'given name surname',
  ],
  'Department Name': [
    'department', 'department name', 'dept', 'dept name', 'deptname',
    'team', 'team name', 'department/team',
    'org unit', 'organizational unit', 'organization unit',
    'org', 'organization', 'organisation', 'department description',
    'department title', 'dept code', 'department code',
    'cost center', 'cost centre', 'cost center name',
    'function', 'functional area', 'department function',
    'group', 'group name', 'section',
  ],
  'Division': [
    'division', 'division name', 'div', 'div name',
    'business unit', 'bu', 'business unit name',
    'company', 'company name', 'legal entity',
    'parent department', 'parent org', 'parent organization',
    'vertical', 'line of business', 'lob', 'branch',
  ],
  'Sub-Division': [
    'sub division', 'subdivision', 'sub-division', 'sub div',
    'sub department', 'subdepartment', 'sub-department',
    'sub business unit', 'sub bu', 'sub-bu',
    'sub unit', 'subunit', 'sub-unit',
    'child division', 'department subgroup', 'subgroup',
    'sub group', 'secondary division', 'tier 2 division',
  ],
  'Location': [
    'location', 'location name', 'loc', 'office', 'office location',
    'site', 'site name', 'work location', 'worksite', 'work site',
    'city', 'office city', 'base location', 'primary location',
    'physical location', 'place of work', 'work address', 'office address',
    'branch location', 'facility', 'campus', 'building',
  ],
  'Country': [
    'country', 'country name', 'country code', 'country/region',
    'nation', 'nationality of work', 'work country',
    'country of employment', 'iso country', 'country iso',
  ],
  'Region': [
    'region', 'region name', 'geo', 'geography', 'geo region',
    'geographic region', 'geographical region',
    'area', 'territory', 'zone', 'world region',
    'macro region', 'global region', 'regional grouping',
  ],
  'Job Family': [
    'job family', 'jobfamily', 'job family name',
    'job category', 'job function', 'job functional area',
    'function family', 'career family', 'role family',
    'job group', 'job class family', 'occupational family',
    'discipline', 'job discipline', 'career stream',
  ],
  'Job Sub Family': [
    'job sub family', 'job subfamily', 'job sub-family',
    'sub job family', 'sub-job family',
    'job sub category', 'job subcategory', 'job sub-category',
    'job sub function', 'sub function', 'subfunction',
    'career sub family', 'role sub family', 'specialty',
    'job specialty', 'job specialization', 'discipline sub family',
  ],
  'Compensation Grade': [
    'compensation grade', 'comp grade', 'comp grade name',
    'pay grade', 'paygrade', 'salary grade', 'grade',
    'grade level', 'job grade', 'job level grade',
    'pay band', 'salary band', 'comp band', 'band',
    'pay scale', 'salary scale', 'compensation level',
    'comp level', 'ces grade', 'global grade',
  ],
  'Management Level': [
    'management level', 'mgmt level', 'mgmt lvl',
    'management tier', 'leadership level', 'leader level',
    'job level', 'career level', 'level',
    'seniority level', 'seniority', 'org level', 'hierarchy level',
    'tier', 'rank level', 'position level',
    'management band', 'leadership band',
  ],
  'Worker Type': [
    'worker type', 'workertype', 'worker category',
    'employee type', 'employment type', 'emp type',
    'employee class', 'employee classification', 'emp class',
    'employment classification', 'employment status type',
    'staff type', 'personnel type', 'person type', 'people type',
    'engagement type', 'contract type', 'contingent or employee', 'fte type',
  ],
  'FTE': [
    'fte', 'fte factor', 'fte ratio',
    'full time equivalent', 'full-time equivalent', 'fulltime equivalent',
    'fte percent', 'fte percentage', 'fte fraction', 'scheduled fte',
    'working time fraction', 'wtf',
    'employment percentage', 'employment percent',
    'working hours fraction', 'headcount factor',
  ],
  'Annual Compensation': [
    'annual compensation', 'annual comp', 'annual salary',
    'annualized salary', 'annualised salary', 'annualized comp',
    'total annual compensation', 'tac', 'base annual salary',
    'base salary annual', 'yearly salary', 'yearly compensation',
    'salary', 'base salary', 'base pay', 'base comp',
    'cost to company', 'ctc', 'total cost',
    'compensation', 'remuneration', 'pay',
    'gross annual salary', 'gross salary', 'annual gross', 'fixed pay annual',
  ],
  'Annual Rate': [
    'annual rate', 'annualized rate', 'annualised rate',
    'annual pay rate', 'annual rate of pay', 'rate annual',
    'yearly rate', 'annual base rate', 'base annual rate',
    'annual rate amount', 'annualized base rate',
  ],
  'Position Status': [
    'position status', 'pos status', 'position state',
    'status', 'req status', 'requisition status',
    'headcount status', 'hc status', 'vacancy status',
    'filled status', 'open status', 'filled or open', 'filled/open',
    'position fill status', 'fill status', 'active status',
    'existing position', 'open req', 'open requisition',
    'frozen req', 'frozen requisition', 'open position', 'frozen position',
  ],
  'Squad': [
    'squad', 'squad name', 'agile squad', 'agile team',
    'delivery team', 'delivery squad', 'scrum team',
    'pod', 'pod name', 'tribe', 'chapter',
    'feature team', 'product team', 'engineering team', 'team squad',
  ],
  'Days Open': [
    'days open', 'days vacant', 'vacancy days', 'days since posted',
    'days since opened', 'age of req', 'req age', 'requisition age',
    'open duration', 'vacancy duration', 'time open',
    'days in open status', 'days posted', 'posting age', 'aging days', 'open aging',
  ],
};

// ── Levenshtein ────────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenSet(s: string): string {
  return norm(s).split(' ').sort().join(' ');
}

function pairScore(header: string, synonym: string): number {
  const nh = norm(header),  ns = norm(synonym);
  const th = tokenSet(header), ts = tokenSet(synonym);
  const maxA = Math.max(nh.length, ns.length);
  const maxB = Math.max(th.length, ts.length);
  const sA = maxA ? levenshtein(nh, ns) / maxA : 0;
  const sB = maxB ? levenshtein(th, ts) / maxB : 0;
  return Math.min(sA, sB);   // lower = better
}

// ── Column matching ────────────────────────────────────────────────────────────

const THRESHOLD = 0.25;

export function matchColumns(headers: string[]): ColumnMapping {
  // Score every (field × header) pair — take best synonym per pair
  type Pair = { header: string; score: number };
  const fieldCandidates: Record<string, Pair[]> = {};

  for (const field of CANONICAL_FIELDS) {
    const pairs: Pair[] = headers.map(header => {
      let best = Infinity;
      for (const syn of FIELD_DICTIONARY[field]) {
        const s = pairScore(header, syn);
        if (s < best) best = s;
      }
      return { header, score: best };
    });
    fieldCandidates[field] = pairs.sort((a, b) => a.score - b.score);
  }

  // Greedy assignment: required fields first, then ascending best-score
  const assigned = new Set<string>();
  const result: Partial<ColumnMapping> = {};

  const ordered = [...CANONICAL_FIELDS].sort((a, b) => {
    const ra = REQUIRED_FIELDS.includes(a) ? 0 : 1;
    const rb = REQUIRED_FIELDS.includes(b) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return (fieldCandidates[a][0]?.score ?? 1) - (fieldCandidates[b][0]?.score ?? 1);
  });

  for (const field of ordered) {
    const best = fieldCandidates[field].find(
      c => c.score <= THRESHOLD && !assigned.has(c.header)
    );
    if (best) {
      assigned.add(best.header);
      result[field] = {
        column:     best.header,
        confidence: Math.round((1 - best.score) * 100) / 100,
        isManual:   false,
      };
    } else {
      result[field] = { column: null, confidence: 0, isManual: false };
    }
  }

  return result as ColumnMapping;
}
