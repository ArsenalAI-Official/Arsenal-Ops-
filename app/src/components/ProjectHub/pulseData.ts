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

const STORAGE_PREFIX = 'pulse-data:';

/** Clear the localStorage cache for a project. The server-side reset happens
 *  by issuing a PUT with the fixture payload from `usePulseManualData`. */
export const resetPulseData = (projectId: string | number): void => {
  try {
    localStorage.removeItem(STORAGE_PREFIX + projectId);
  } catch {
    /* ignore */
  }
};

/**
 * Structurally-valid PulseData with every metric zeroed and every list empty.
 * Used by the "Clear all data" action in PulseSettings — distinct from the
 * "Reset to dummy data" action, which fills the form with the demo fixture.
 * The empty payload is a real persisted state (not localStorage absence) so
 * a refresh doesn't bring fixture/demo data back.
 */
export const buildEmptyPulseData = (): PulseData => ({
  project: { name: '', keyPrefix: '', contractStart: '', launchTarget: '', contractEnd: '' },
  ledger: [],
  months: [],
  lastActualIdx: -1,
  currentMonthTrackedPct: 0,
  includedServices: [],
  summary: {
    healthScore: 0,
    healthStatus: 'Healthy',
    deliveryPct: 0,
    deliveryCompleted: 0,
    deliveryTotal: 0,
    overdueCount: 0,
    openBugs: 0,
    criticalOpen: 0,
    overallCompletion: 0,
    workItems: 0,
    pointsCompleted: 0,
    pointsTotal: 0,
    activeSprints: 0,
    monthLabel: '',
    monthIndex: 0,
    totalMonths: 0,
    narrative: '',
    risksTrendNote: '',
    peopleTrendNote: '',
  },
  risks: [],
  milestones: [],
  updates: [],
  forecastVsActuals: { current: [], last: [], project: [] },
});

// ───────────────────────────────────────────────────────────────────────────
// DB-derived overlay types & merge helper
//
// `DerivedPulseData` mirrors the DB-derivable subset of `PulseData` that the
// backend's `GET /api/projects/{id}/pulse-derived` endpoint returns. Anything
// editorial (narrative copy, ledger, risks, dollar categories, billing) is
// intentionally absent — those continue to live in localStorage `PulseData`
// and are supplied by `mergePulseData` from the manual side.
// ───────────────────────────────────────────────────────────────────────────

/** DB-derived subset of `PulseProjectMeta`. */
export interface DerivedPulseProjectMeta {
  name?: string;
  keyPrefix?: string;
  contractStart?: string;
  launchTarget?: string;
  contractEnd?: string;
}

/** DB-derived subset of `PulseSummary`. Notably omits `narrative` and
 *  `risksTrendNote`, which remain editorial. */
export interface DerivedPulseSummary {
  healthScore?: number;
  healthStatus?: 'Healthy' | 'At Risk' | 'Critical';
  deliveryPct?: number;
  deliveryCompleted?: number;
  deliveryTotal?: number;
  overdueCount?: number;
  openBugs?: number;
  criticalOpen?: number;
  overallCompletion?: number;
  workItems?: number;
  pointsCompleted?: number;
  pointsTotal?: number;
  activeSprints?: number;
  monthLabel?: string;
  monthIndex?: number;
  totalMonths?: number;
  peopleTrendNote?: string;
}

/** Derived row for the monthly burn table. Only includes the columns the
 *  backend can compute from `time_entries`; cost-category dollars stay manual. */
export interface DerivedMonthRow {
  m: string;
  devAct: number | null;
  actual?: boolean;
  partial?: boolean;
}

/** Derived row for the included-services table — cumulative hours used through
 *  this month. Contract totals + billing fields stay manual. */
export interface DerivedIncludedServicesRow {
  month: string;
  usedHours: number;
}

/** Derived milestone. Phase/date/status come from `project_milestones`;
 *  budget/spent/pct continue to be edited by hand. */
export interface DerivedPulseMilestone {
  id: string;
  phase: string;
  date: string;
  status: 'done' | 'in-progress' | 'upcoming';
}

/** Backend-supplied metadata about the derive run. `degraded_sections`
 *  lists the snapshot sections that fell back to a default because their
 *  underlying compute failed; an empty list means every section succeeded. */
export interface DerivedPulseMeta {
  degraded_sections: string[];
}

export interface DerivedPulseData {
  project?: DerivedPulseProjectMeta;
  summary?: DerivedPulseSummary;
  months?: DerivedMonthRow[];
  lastActualIdx?: number;
  currentMonthTrackedPct?: number;
  includedServices?: DerivedIncludedServicesRow[];
  milestones?: DerivedPulseMilestone[];
  updates?: PulseUpdate[];
  forecastVsActuals?: ForecastVsActuals;
  _meta?: DerivedPulseMeta;
}

/**
 * Overlay DB-derived values onto the manually-edited localStorage `PulseData`.
 *
 * Contract:
 *   - If `derived` is null/undefined, `manual` is returned unchanged. This is
 *     the loading + error path; the Pulse view stays fully functional with
 *     pure-manual data until the endpoint responds.
 *   - For every field the derivation provides, derived wins. Anything derived
 *     omits comes from `manual`.
 *   - `ledger`, `risks`, narrative copy, dollar cost categories per month, and
 *     contract/billing inputs always come from `manual`.
 */
export const mergePulseData = (
  manual: PulseData,
  derived: DerivedPulseData | null | undefined,
): PulseData => {
  if (!derived) return manual;

  // Months: align by month label. Derived only supplies hours + flags, so we
  // keep manual's cost categories (`dev`, `ad`, `gtm`, `ba`, `mgmt`) and
  // `devFC` forecast on each row. If the project has no end_date the backend
  // returns an empty months array — fall back to manual rather than wiping
  // the chart.
  let mergedMonths = manual.months;
  if (derived.months && derived.months.length > 0) {
    mergedMonths = derived.months.map((d) => {
      const m = manual.months.find((row) => row.m === d.m);
      if (m) {
        return {
          ...m,
          m: d.m,
          devAct: d.devAct,
          actual: d.actual,
          partial: d.partial,
        };
      }
      // No manual row for this month yet — zero out cost categories. PM can
      // backfill them in PulseSettings later.
      return {
        m: d.m,
        devFC: 0,
        devAct: d.devAct,
        dev: 0,
        ad: 0,
        gtm: 0,
        ba: 0,
        mgmt: 0,
        actual: d.actual,
        partial: d.partial,
      };
    });
  }

  // Included services: align by `month` string. Derived only supplies
  // `usedHours`; manual rows carry contract total + billing data.
  let mergedIncludedServices = manual.includedServices;
  if (derived.includedServices && derived.includedServices.length > 0) {
    mergedIncludedServices = derived.includedServices.map((d) => {
      const m = manual.includedServices.find((row) => row.month === d.month);
      if (m) {
        return { ...m, month: d.month, usedHours: d.usedHours };
      }
      return {
        month: d.month,
        totalHours: 0,
        usedHours: d.usedHours,
        billableAccrued: 0,
        billableAccruedCost: 0,
        billableInvoiced: 0,
        invoiceCount: 0,
        expectedRemaining: 0,
      };
    });
  }

  // Milestones: derived owns phase/date/status; manual owns budget/spent/pct.
  // Align by `id`. If the derived milestone has no manual counterpart (e.g.
  // a milestone created via the Roadmap tab that PM hasn't priced yet),
  // budget/spent/pct default to 0.
  // Empty-list fall-through rule: if the backend returns `[]` for milestones,
  // treat it the same as "no derive" and keep the manual list. This matches
  // the months / includedServices guards above and the doc-comment contract.
  let mergedMilestones = manual.milestones;
  if (derived.milestones && derived.milestones.length > 0) {
    mergedMilestones = derived.milestones.map((d) => {
      const m = manual.milestones.find((row) => row.id === d.id);
      if (m) {
        return {
          ...m,
          id: d.id,
          phase: d.phase,
          date: d.date,
          status: d.status,
        };
      }
      return {
        id: d.id,
        phase: d.phase,
        date: d.date,
        status: d.status,
        budget: 0,
        spent: 0,
        pct: 0,
      };
    });
  }

  return {
    ...manual,
    project: { ...manual.project, ...(derived.project ?? {}) },
    // Summary: derived's keys overlay manual's, so `narrative` and
    // `risksTrendNote` (which derived intentionally omits) survive.
    summary: { ...manual.summary, ...(derived.summary ?? {}) },
    months: mergedMonths,
    lastActualIdx:
      typeof derived.lastActualIdx === 'number' ? derived.lastActualIdx : manual.lastActualIdx,
    currentMonthTrackedPct:
      typeof derived.currentMonthTrackedPct === 'number'
        ? derived.currentMonthTrackedPct
        : manual.currentMonthTrackedPct,
    includedServices: mergedIncludedServices,
    milestones: mergedMilestones,
    // Updates + forecastVsActuals are wholesale-replaced when derived
    // supplies them. (The activity-log feed and epic-estimate rollup are
    // entirely DB-sourced; there is nothing editorial to preserve.)
    updates: derived.updates ?? manual.updates,
    forecastVsActuals: derived.forecastVsActuals ?? manual.forecastVsActuals,
    // ledger + risks are always manual.
    ledger: manual.ledger,
    risks: manual.risks,
  };
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
