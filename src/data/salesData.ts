import { formatCurrency } from '@/utils/format';

import type { TelemetrySnapshot } from '@/types';

export interface SalesRecord {
  id: string;
  country: string;
  period: string;
  revenue: number;
  unitsSold: number;
  activeCustomers: number;
  productCategory: 'Enterprise Software' | 'Cloud Analytics' | 'Consulting Services' | 'AI Modules';
}

export const SYNTHETIC_SALES_DATA: SalesRecord[] = [
  // United States
  { id: '1', country: 'United States', period: 'Q1', revenue: 320000, unitsSold: 1200, activeCustomers: 150, productCategory: 'Cloud Analytics' },
  { id: '2', country: 'United States', period: 'Q1', revenue: 150000, unitsSold: 500, activeCustomers: 80, productCategory: 'Enterprise Software' },
  { id: '3', country: 'United States', period: 'Q2', revenue: 380000, unitsSold: 1400, activeCustomers: 165, productCategory: 'AI Modules' },
  { id: '4', country: 'United States', period: 'Q2', revenue: 120000, unitsSold: 400, activeCustomers: 70, productCategory: 'Consulting Services' },
  { id: '5', country: 'United States', period: 'Q3', revenue: 310000, unitsSold: 1150, activeCustomers: 160, productCategory: 'Cloud Analytics' },
  { id: '6', country: 'United States', period: 'Q3', revenue: 90000, unitsSold: 300, activeCustomers: 50, productCategory: 'Enterprise Software' },
  { id: '7', country: 'United States', period: 'Q4', revenue: 410000, unitsSold: 1550, activeCustomers: 180, productCategory: 'AI Modules' },
  { id: '8', country: 'United States', period: 'Q4', revenue: 220000, unitsSold: 800, activeCustomers: 110, productCategory: 'Consulting Services' },

  // Germany
  { id: '9', country: 'Germany', period: 'Q1', revenue: 180000, unitsSold: 700, activeCustomers: 80, productCategory: 'Cloud Analytics' },
  { id: '10', country: 'Germany', period: 'Q2', revenue: 195000, unitsSold: 750, activeCustomers: 85, productCategory: 'Enterprise Software' },
  { id: '11', country: 'Germany', period: 'Q3', revenue: 170000, unitsSold: 680, activeCustomers: 82, productCategory: 'AI Modules' },
  { id: '12', country: 'Germany', period: 'Q4', revenue: 215000, unitsSold: 820, activeCustomers: 90, productCategory: 'Consulting Services' },

  // Japan
  { id: '13', country: 'Japan', period: 'Q1', revenue: 150000, unitsSold: 600, activeCustomers: 70, productCategory: 'Cloud Analytics' },
  { id: '14', country: 'Japan', period: 'Q2', revenue: 165000, unitsSold: 640, activeCustomers: 74, productCategory: 'Enterprise Software' },
  { id: '15', country: 'Japan', period: 'Q3', revenue: 140000, unitsSold: 580, activeCustomers: 72, productCategory: 'AI Modules' },
  { id: '16', country: 'Japan', period: 'Q4', revenue: 185000, unitsSold: 710, activeCustomers: 78, productCategory: 'Consulting Services' },

  // United Kingdom
  { id: '17', country: 'United Kingdom', period: 'Q1', revenue: 120000, unitsSold: 480, activeCustomers: 50, productCategory: 'Cloud Analytics' },
  { id: '18', country: 'United Kingdom', period: 'Q2', revenue: 135000, unitsSold: 520, activeCustomers: 55, productCategory: 'Enterprise Software' },
  { id: '19', country: 'United Kingdom', period: 'Q3', revenue: 115000, unitsSold: 460, activeCustomers: 52, productCategory: 'AI Modules' },
  { id: '20', country: 'United Kingdom', period: 'Q4', revenue: 150000, unitsSold: 590, activeCustomers: 60, productCategory: 'Consulting Services' }
];

export interface DashboardMetrics {
  filteredData: SalesRecord[];
  unitsSold: number;
  activeCustomers: number;
  /** Value rendered on the Revenue KPI card. */
  revenueKPI: number;
  /** Sum of the revenue values plotted/listed for the current filters. */
  chartRevenueTotal: number;
}

const sum = (records: SalesRecord[], pick: (r: SalesRecord) => number): number =>
  records.reduce((total, r) => total + pick(r), 0);

/**
 * Single source of truth for what the dashboard renders. Telemetry is derived from the same
 * result, so it always reflects the values on screen rather than any hidden ground truth.
 */
export function getDashboardMetrics(country: string, period: string): DashboardMetrics {
  const filteredData = SYNTHETIC_SALES_DATA.filter(
    (r) => (country === 'All' || r.country === country) && (period === 'All' || r.period === period)
  );
  const chartRevenueTotal = sum(filteredData, (r) => r.revenue);

  // DELIBERATE BUG: with a country filter active the Revenue KPI ignores the country and keeps
  // showing the global total for the selected period.
  const revenueKPI =
    country === 'All'
      ? chartRevenueTotal
      : sum(
          SYNTHETIC_SALES_DATA.filter((r) => period === 'All' || r.period === period),
          (r) => r.revenue
        );

  return {
    filteredData,
    unitsSold: sum(filteredData, (r) => r.unitsSold),
    activeCustomers: sum(filteredData, (r) => r.activeCustomers),
    revenueKPI,
    chartRevenueTotal
  };
}

export function getTelemetrySnapshot(country: string, period: string): TelemetrySnapshot {
  const metrics = getDashboardMetrics(country, period);
  return {
    country,
    period,
    revenueKPI: formatCurrency(metrics.revenueKPI),
    chartTotal: metrics.chartRevenueTotal
  };
}
