export type LedgerOwner = 'AAI' | 'Client';

export interface LedgerRow {
  category: string;
  amount: number;
  owner: LedgerOwner;
  note?: string;
  included?: boolean;
  tbd?: boolean;
  negative?: boolean;
}

export interface MonthRow {
  m: string;
  devFC: number;
  devAct: number | null;
  dev: number;
  ad: number;
  gtm: number;
  ba: number;
  mgmt: number;
  actual?: boolean;
  partial?: boolean;
}

/** One row of included-service / billing data, scoped to a single month.
 *  The Pulse hero picks the row matching `summary.monthLabel` (falling back
 *  to the last row in the list). Add a new row each month as you log billing. */
export interface IncludedServicesRow {
  month: string; // e.g. "April 2026" — match against summary.monthLabel
  totalHours: number; // contracted included hours total
  usedHours: number; // hours used through this month (cumulative)
  billableAccrued: number; // billable hours accrued past included
  billableAccruedCost: number;
  billableInvoiced: number;
  invoiceCount: number;
  expectedRemaining: number; // forecasted billable hours remaining through contract end
}

/** Backwards-compat alias — old code referred to a single snapshot. */
export type IncludedServices = IncludedServicesRow;

export interface PulseRisk {
  severity: 'high' | 'medium' | 'low';
  title: string;
  owner: string;
  due: string;
  note?: string;
}

export interface PulseMilestone {
  id: string;
  phase: string;
  date: string;
  status: 'done' | 'in-progress' | 'upcoming';
  budget: number;
  spent: number;
  pct: number;
}

export interface PulseUpdate {
  when: string;
  author: string;
  type: 'milestone' | 'note' | 'risk';
  text: string;
}

export interface FeatureForecastRow {
  feature: string;
  employee: string;
  fc: number;
  act: number;
}

export interface ForecastVsActuals {
  current: FeatureForecastRow[]; // Current month MTD
  last: FeatureForecastRow[]; // Last month
  project: FeatureForecastRow[]; // Entire project
}

export interface PulseProjectMeta {
  name: string;
  keyPrefix: string;
  contractStart: string;
  launchTarget: string;
  contractEnd: string;
}

export interface PulseSummary {
  healthScore: number;
  healthStatus: 'Healthy' | 'At Risk' | 'Critical';
  deliveryPct: number;
  deliveryCompleted: number;
  deliveryTotal: number;
  overdueCount: number;
  openBugs: number;
  criticalOpen: number;
  overallCompletion: number;
  workItems: number;
  pointsCompleted: number;
  pointsTotal: number;
  activeSprints: number;
  monthLabel: string;
  monthIndex: number;
  totalMonths: number;
  /** Editorial narrative paragraph shown under the hero headline. */
  narrative: string;
  /** Risks-tile trend text (e.g. "All clear"). */
  risksTrendNote: string;
  /** People-tile trend text (e.g. "6 active contributors"). */
  peopleTrendNote: string;
}

export interface PulseData {
  project: PulseProjectMeta;
  ledger: LedgerRow[];
  months: MonthRow[];
  lastActualIdx: number;
  /** Percent of the current (in-month) period elapsed for the "X% of month tracked" pill. */
  currentMonthTrackedPct: number;
  /** Per-month billing snapshots. Append a new row each month. */
  includedServices: IncludedServicesRow[];
  summary: PulseSummary;
  risks: PulseRisk[];
  milestones: PulseMilestone[];
  updates: PulseUpdate[];
  forecastVsActuals: ForecastVsActuals;
}

/** Pick the right billing row for the current month — matches by month string,
 *  falls back to the last row in the list, and finally to a zeroed default. */
export const currentIncludedServices = (data: PulseData): IncludedServicesRow => {
  const list = data.includedServices ?? [];
  const monthMatch = list.find((r) => r.month === data.summary.monthLabel);
  if (monthMatch) return monthMatch;
  if (list.length > 0) return list[list.length - 1];
  return {
    month: data.summary.monthLabel || '',
    totalHours: 0,
    usedHours: 0,
    billableAccrued: 0,
    billableAccruedCost: 0,
    billableInvoiced: 0,
    invoiceCount: 0,
    expectedRemaining: 0,
  };
};

export const DUMMY_PULSE_DATA: PulseData = {
  project: {
    name: 'Lattice Ledger',
    keyPrefix: 'LDG',
    contractStart: 'Feb 2026',
    launchTarget: 'Sep 2026',
    contractEnd: 'Jan 2027',
  },
  ledger: [
    {
      category: 'Development Cost',
      amount: 210000,
      owner: 'AAI',
      note: 'Build + test + deploy, 2,800h @ blended rate',
    },
    {
      category: 'Operational Mgmt Cost',
      amount: 72000,
      owner: 'AAI',
      note: 'Architecture, code review, deployments',
    },
    {
      category: 'Product Mgmt Cost',
      amount: 0,
      owner: 'AAI',
      note: 'Included — ~50h/mo at $0',
      included: true,
    },
    {
      category: 'BA / GTM Analyst',
      amount: 34000,
      owner: 'AAI',
      note: 'Estimated, not formally signed',
    },
    {
      category: 'Ad Spend Allocation',
      amount: 48000,
      owner: 'Client',
      note: 'Paid search, retargeting, creative',
    },
    {
      category: 'GTM Leadership',
      amount: 0,
      owner: 'Client',
      note: 'TBD — owner to be assigned',
      tbd: true,
    },
    {
      category: 'Savings (included svcs)',
      amount: -82500,
      owner: 'AAI',
      note: '750 included hours @ blended rate',
      negative: true,
    },
  ],
  months: [
    {
      m: 'Feb 26',
      devFC: 420,
      devAct: 402,
      dev: 30150,
      ad: 0,
      gtm: 0,
      ba: 0,
      mgmt: 6000,
      actual: true,
    },
    {
      m: 'Mar 26',
      devFC: 440,
      devAct: 431,
      dev: 32325,
      ad: 0,
      gtm: 0,
      ba: 0,
      mgmt: 7800,
      actual: true,
    },
    {
      m: 'Apr 26',
      devFC: 425,
      devAct: 228,
      dev: 17100,
      ad: 0,
      gtm: 0,
      ba: 1800,
      mgmt: 6300,
      actual: true,
      partial: true,
    },
    { m: 'May 26', devFC: 410, devAct: null, dev: 30750, ad: 0, gtm: 0, ba: 5200, mgmt: 6600 },
    { m: 'Jun 26', devFC: 395, devAct: null, dev: 29625, ad: 0, gtm: 0, ba: 5200, mgmt: 6600 },
    {
      m: 'Jul 26',
      devFC: 360,
      devAct: null,
      dev: 27000,
      ad: 4000,
      gtm: 2000,
      ba: 4400,
      mgmt: 6000,
    },
    {
      m: 'Aug 26',
      devFC: 280,
      devAct: null,
      dev: 21000,
      ad: 6000,
      gtm: 2000,
      ba: 3200,
      mgmt: 5400,
    },
    {
      m: 'Sep 26',
      devFC: 180,
      devAct: null,
      dev: 13500,
      ad: 8000,
      gtm: 3000,
      ba: 2000,
      mgmt: 4800,
    },
    { m: 'Oct 26', devFC: 90, devAct: null, dev: 6750, ad: 8000, gtm: 3000, ba: 1200, mgmt: 3600 },
    { m: 'Nov 26', devFC: 60, devAct: null, dev: 4500, ad: 8000, gtm: 3000, ba: 800, mgmt: 3000 },
    { m: 'Dec 26', devFC: 40, devAct: null, dev: 3000, ad: 8000, gtm: 3000, ba: 800, mgmt: 3000 },
    { m: 'Jan 27', devFC: 0, devAct: null, dev: 0, ad: 6000, gtm: 3000, ba: 0, mgmt: 2400 },
  ],
  lastActualIdx: 2,
  currentMonthTrackedPct: 62,
  includedServices: [
    {
      month: 'February 2026',
      totalHours: 1000,
      usedHours: 380,
      billableAccrued: 0,
      billableAccruedCost: 0,
      billableInvoiced: 0,
      invoiceCount: 0,
      expectedRemaining: 3850,
    },
    {
      month: 'March 2026',
      totalHours: 1000,
      usedHours: 740,
      billableAccrued: 240,
      billableAccruedCost: 18000,
      billableInvoiced: 120,
      invoiceCount: 1,
      expectedRemaining: 3100,
    },
    {
      month: 'April 2026',
      totalHours: 1000,
      usedHours: 1000,
      billableAccrued: 745,
      billableAccruedCost: 55875,
      billableInvoiced: 310,
      invoiceCount: 2,
      expectedRemaining: 2400,
    },
  ],
  summary: {
    healthScore: 100,
    healthStatus: 'Healthy',
    deliveryPct: 67,
    deliveryCompleted: 16,
    deliveryTotal: 24,
    overdueCount: 0,
    openBugs: 0,
    criticalOpen: 0,
    overallCompletion: 70,
    workItems: 24,
    pointsCompleted: 42,
    pointsTotal: 60,
    activeSprints: 0,
    monthLabel: 'April 2026',
    monthIndex: 3,
    totalMonths: 12,
    narrative:
      'April closes with the Core data pipeline fully delivered and Feature build underway. Dev hours are tracking 82% of plan — slight underspend driven by the pipeline finishing early. One high-severity risk remains on the OCR accuracy target; benchmarking is in progress.',
    risksTrendNote: 'All clear',
    peopleTrendNote: '6 active contributors',
  },
  risks: [
    {
      severity: 'high',
      title: 'OCR pipeline accuracy below 92% target',
      owner: 'Kai',
      due: 'May 5',
      note: 'Benchmarking new model family this sprint.',
    },
    {
      severity: 'medium',
      title: 'Dev hours tracking 18% under plan for April',
      owner: 'PM',
      due: '—',
      note: 'May indicate scope gaps or undertime. Reviewing.',
    },
    {
      severity: 'low',
      title: 'Ad spend not yet initiated',
      owner: 'GTM',
      due: 'Jul 1',
      note: 'Pre-launch plan per GTM phase.',
    },
  ],
  milestones: [
    {
      id: 'm1',
      phase: 'Foundations',
      date: 'Feb 26',
      status: 'done',
      budget: 45000,
      spent: 43200,
      pct: 100,
    },
    {
      id: 'm2',
      phase: 'Core data pipeline',
      date: 'Mar 26',
      status: 'done',
      budget: 62000,
      spent: 61450,
      pct: 100,
    },
    {
      id: 'm3',
      phase: 'Feature build',
      date: 'Jun 26',
      status: 'in-progress',
      budget: 118000,
      spent: 12500,
      pct: 35,
    },
    {
      id: 'm4',
      phase: 'MVP launch',
      date: 'Sep 26',
      status: 'upcoming',
      budget: 95000,
      spent: 0,
      pct: 0,
    },
    {
      id: 'm5',
      phase: 'GTM + scale',
      date: 'Jan 27',
      status: 'upcoming',
      budget: 50000,
      spent: 0,
      pct: 0,
    },
  ],
  updates: [
    {
      when: 'Apr 18',
      author: 'Maya',
      type: 'milestone',
      text: 'Closed Core data pipeline phase ahead of schedule.',
    },
    {
      when: 'Apr 15',
      author: 'PM',
      type: 'note',
      text: 'Team moving into Feature build; ticket breakdown in backlog.',
    },
    {
      when: 'Apr 10',
      author: 'Kai',
      type: 'risk',
      text: 'Raised OCR accuracy risk; benchmarking alternatives.',
    },
    {
      when: 'Apr 02',
      author: 'Ravi',
      type: 'milestone',
      text: 'Ingestion bridge integration passed QA.',
    },
  ],
  forecastVsActuals: {
    current: [
      { feature: 'Template Rendering', employee: 'Maya', fc: 60, act: 48 },
      { feature: 'Assistant Services', employee: 'Priya', fc: 45, act: 38 },
      { feature: 'Heirloom Prototype', employee: 'Jules', fc: 32, act: 30 },
      { feature: 'Verification Cleaning', employee: 'Ravi', fc: 40, act: 22 },
      { feature: 'Ingestion Bridge', employee: 'Ravi', fc: 55, act: 41 },
      { feature: 'Identity & Auth', employee: 'Tom', fc: 30, act: 29 },
    ],
    last: [
      { feature: 'Structured DB Schema', employee: 'Maya', fc: 50, act: 44 },
      { feature: 'Progression Manager', employee: 'Maya', fc: 55, act: 45 },
      { feature: 'Task State Machine', employee: 'Maya', fc: 72, act: 62 },
      { feature: 'Verification Cleaning', employee: 'Ravi', fc: 85, act: 70 },
      { feature: 'Ingestion Bridge', employee: 'Ravi', fc: 105, act: 92 },
      { feature: 'OCR & NLP Pipeline', employee: 'Kai', fc: 240, act: 210 },
      { feature: 'Heirloom Prototype', employee: 'Jules', fc: 32, act: 32 },
      { feature: 'Identity & Auth', employee: 'Tom', fc: 95, act: 84 },
    ],
    project: [
      { feature: 'Structured DB Schema', employee: 'Maya', fc: 50, act: 44 },
      { feature: 'Progression Manager', employee: 'Maya', fc: 55, act: 45 },
      { feature: 'Task State Machine', employee: 'Maya', fc: 72, act: 62 },
      { feature: 'Template Rendering', employee: 'Maya', fc: 60, act: 48 },
      { feature: 'Unstructured Data Store', employee: 'Maya', fc: 35, act: 22 },
      { feature: 'Verification Cleaning', employee: 'Ravi', fc: 125, act: 92 },
      { feature: 'Ingestion Bridge', employee: 'Ravi', fc: 160, act: 133 },
      { feature: 'Heirloom Prototype', employee: 'Jules', fc: 62, act: 62 },
      { feature: 'OCR & NLP Pipeline', employee: 'Kai', fc: 240, act: 210 },
      { feature: 'Assistant Services', employee: 'Priya', fc: 45, act: 38 },
      { feature: 'Identity & Auth', employee: 'Tom', fc: 125, act: 113 },
    ],
  },
};

const STORAGE_PREFIX = 'pulse-data:';

export const loadPulseData = (projectId: string | number): PulseData => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + projectId);
    if (!raw) return DUMMY_PULSE_DATA;
    const parsed = JSON.parse(raw);
    // Migrate legacy includedServices: single object → single-element list.
    let includedServices: IncludedServicesRow[];
    if (Array.isArray(parsed.includedServices)) {
      includedServices = parsed.includedServices;
    } else if (parsed.includedServices && typeof parsed.includedServices === 'object') {
      const old = parsed.includedServices as any;
      includedServices = [
        {
          month: old.throughMonth || DUMMY_PULSE_DATA.summary.monthLabel,
          totalHours: old.totalHours ?? 0,
          usedHours: old.usedHours ?? 0,
          billableAccrued: old.billableAccrued ?? 0,
          billableAccruedCost: old.billableAccruedCost ?? 0,
          billableInvoiced: old.billableInvoiced ?? 0,
          invoiceCount: old.invoiceCount ?? 0,
          expectedRemaining: old.expectedRemaining ?? 0,
        },
      ];
    } else {
      includedServices = DUMMY_PULSE_DATA.includedServices;
    }
    // Deep-merge nested objects so older saved payloads pick up new fields.
    return {
      ...DUMMY_PULSE_DATA,
      ...parsed,
      project: { ...DUMMY_PULSE_DATA.project, ...(parsed.project || {}) },
      summary: { ...DUMMY_PULSE_DATA.summary, ...(parsed.summary || {}) },
      includedServices,
      forecastVsActuals: {
        ...DUMMY_PULSE_DATA.forecastVsActuals,
        ...(parsed.forecastVsActuals || {}),
      },
    };
  } catch {
    return DUMMY_PULSE_DATA;
  }
};

export const savePulseData = (projectId: string | number, data: PulseData): void => {
  localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(data));
};

export const resetPulseData = (projectId: string | number): void => {
  localStorage.removeItem(STORAGE_PREFIX + projectId);
};

export const computeDerived = (data: PulseData) => {
  const contractTotal = data.ledger
    .filter((l) => !l.included && !l.tbd)
    .reduce((a, b) => a + b.amount, 0);

  const aaiTotal = data.ledger
    .filter((l) => l.owner === 'AAI' && !l.included)
    .reduce((a, b) => a + b.amount, 0);

  const clientTotal = data.ledger
    .filter((l) => l.owner === 'Client' && !l.tbd)
    .reduce((a, b) => a + b.amount, 0);

  const monthsWithCum = (() => {
    let cum = 0;
    return data.months.map((row) => {
      const total = row.dev + row.ad + row.gtm + row.ba + row.mgmt;
      cum += total;
      return { ...row, total, cum };
    });
  })();

  const burnedToDate = monthsWithCum
    .slice(0, data.lastActualIdx + 1)
    .reduce((a, b) => a + b.total, 0);

  const forecastEnd = monthsWithCum[monthsWithCum.length - 1]?.cum || 0;

  return { contractTotal, aaiTotal, clientTotal, monthsWithCum, burnedToDate, forecastEnd };
};
