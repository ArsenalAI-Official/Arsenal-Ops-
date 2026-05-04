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

export interface IncludedServices {
    totalHours: number;
    usedHours: number;
    throughMonth: string;
    billableAccrued: number;
    billableAccruedCost: number;
    billableInvoiced: number;
    invoiceCount: number;
    expectedRemaining: number;
}

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
}

export interface PulseData {
    project: PulseProjectMeta;
    ledger: LedgerRow[];
    months: MonthRow[];
    lastActualIdx: number;
    includedServices: IncludedServices;
    summary: PulseSummary;
    risks: PulseRisk[];
    milestones: PulseMilestone[];
    updates: PulseUpdate[];
}

export const DUMMY_PULSE_DATA: PulseData = {
    project: {
        name: 'Lattice Ledger',
        keyPrefix: 'LDG',
        contractStart: 'Feb 2026',
        launchTarget: 'Sep 2026',
        contractEnd: 'Jan 2027',
    },
    ledger: [
        { category: 'Development Cost', amount: 210000, owner: 'AAI', note: 'Build + test + deploy, 2,800h @ blended rate' },
        { category: 'Operational Mgmt Cost', amount: 72000, owner: 'AAI', note: 'Architecture, code review, deployments' },
        { category: 'Product Mgmt Cost', amount: 0, owner: 'AAI', note: 'Included — ~50h/mo at $0', included: true },
        { category: 'BA / GTM Analyst', amount: 34000, owner: 'AAI', note: 'Estimated, not formally signed' },
        { category: 'Ad Spend Allocation', amount: 48000, owner: 'Client', note: 'Paid search, retargeting, creative' },
        { category: 'GTM Leadership', amount: 0, owner: 'Client', note: 'TBD — owner to be assigned', tbd: true },
        { category: 'Savings (included svcs)', amount: -82500, owner: 'AAI', note: '750 included hours @ blended rate', negative: true },
    ],
    months: [
        { m: 'Feb 26', devFC: 420, devAct: 402, dev: 30150, ad: 0, gtm: 0, ba: 0, mgmt: 6000, actual: true },
        { m: 'Mar 26', devFC: 440, devAct: 431, dev: 32325, ad: 0, gtm: 0, ba: 0, mgmt: 7800, actual: true },
        { m: 'Apr 26', devFC: 425, devAct: 228, dev: 17100, ad: 0, gtm: 0, ba: 1800, mgmt: 6300, actual: true, partial: true },
        { m: 'May 26', devFC: 410, devAct: null, dev: 30750, ad: 0, gtm: 0, ba: 5200, mgmt: 6600 },
        { m: 'Jun 26', devFC: 395, devAct: null, dev: 29625, ad: 0, gtm: 0, ba: 5200, mgmt: 6600 },
        { m: 'Jul 26', devFC: 360, devAct: null, dev: 27000, ad: 4000, gtm: 2000, ba: 4400, mgmt: 6000 },
        { m: 'Aug 26', devFC: 280, devAct: null, dev: 21000, ad: 6000, gtm: 2000, ba: 3200, mgmt: 5400 },
        { m: 'Sep 26', devFC: 180, devAct: null, dev: 13500, ad: 8000, gtm: 3000, ba: 2000, mgmt: 4800 },
        { m: 'Oct 26', devFC: 90, devAct: null, dev: 6750, ad: 8000, gtm: 3000, ba: 1200, mgmt: 3600 },
        { m: 'Nov 26', devFC: 60, devAct: null, dev: 4500, ad: 8000, gtm: 3000, ba: 800, mgmt: 3000 },
        { m: 'Dec 26', devFC: 40, devAct: null, dev: 3000, ad: 8000, gtm: 3000, ba: 800, mgmt: 3000 },
        { m: 'Jan 27', devFC: 0, devAct: null, dev: 0, ad: 6000, gtm: 3000, ba: 0, mgmt: 2400 },
    ],
    lastActualIdx: 2,
    includedServices: {
        totalHours: 1000,
        usedHours: 1000,
        throughMonth: 'April 2026',
        billableAccrued: 745,
        billableAccruedCost: 55875,
        billableInvoiced: 310,
        invoiceCount: 2,
        expectedRemaining: 2400,
    },
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
    },
    risks: [
        { severity: 'high', title: 'OCR pipeline accuracy below 92% target', owner: 'Kai', due: 'May 5', note: 'Benchmarking new model family this sprint.' },
        { severity: 'medium', title: 'Dev hours tracking 18% under plan for April', owner: 'PM', due: '—', note: 'May indicate scope gaps or undertime. Reviewing.' },
        { severity: 'low', title: 'Ad spend not yet initiated', owner: 'GTM', due: 'Jul 1', note: 'Pre-launch plan per GTM phase.' },
    ],
    milestones: [
        { id: 'm1', phase: 'Foundations', date: 'Feb 26', status: 'done', budget: 45000, spent: 43200, pct: 100 },
        { id: 'm2', phase: 'Core data pipeline', date: 'Mar 26', status: 'done', budget: 62000, spent: 61450, pct: 100 },
        { id: 'm3', phase: 'Feature build', date: 'Jun 26', status: 'in-progress', budget: 118000, spent: 12500, pct: 35 },
        { id: 'm4', phase: 'MVP launch', date: 'Sep 26', status: 'upcoming', budget: 95000, spent: 0, pct: 0 },
        { id: 'm5', phase: 'GTM + scale', date: 'Jan 27', status: 'upcoming', budget: 50000, spent: 0, pct: 0 },
    ],
    updates: [
        { when: 'Apr 18', author: 'Maya', type: 'milestone', text: 'Closed Core data pipeline phase ahead of schedule.' },
        { when: 'Apr 15', author: 'PM', type: 'note', text: 'Team moving into Feature build; ticket breakdown in backlog.' },
        { when: 'Apr 10', author: 'Kai', type: 'risk', text: 'Raised OCR accuracy risk; benchmarking alternatives.' },
        { when: 'Apr 02', author: 'Ravi', type: 'milestone', text: 'Ingestion bridge integration passed QA.' },
    ],
};

const STORAGE_PREFIX = 'pulse-data:';

export const loadPulseData = (projectId: string | number): PulseData => {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + projectId);
        if (!raw) return DUMMY_PULSE_DATA;
        const parsed = JSON.parse(raw);
        return { ...DUMMY_PULSE_DATA, ...parsed };
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
        .filter(l => !l.included && !l.tbd)
        .reduce((a, b) => a + b.amount, 0);

    const aaiTotal = data.ledger
        .filter(l => l.owner === 'AAI' && !l.included)
        .reduce((a, b) => a + b.amount, 0);

    const clientTotal = data.ledger
        .filter(l => l.owner === 'Client' && !l.tbd)
        .reduce((a, b) => a + b.amount, 0);

    const monthsWithCum = (() => {
        let cum = 0;
        return data.months.map(row => {
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
