import { fireEvent, render, screen } from '@testing-library/react';

import Dashboard from '@/components/Dashboard';
import { getDashboardMetrics, getTelemetrySnapshot } from '@/data/salesData';

describe('Dashboard', () => {
  it('does not reveal the injected defect to the person testing', () => {
    const { container } = render(
      <Dashboard country="Germany" period="All" onFilterChange={() => undefined} />
    );
    expect(container).not.toHaveTextContent(/mismatch/i);
    expect(container).not.toHaveTextContent(/correctly filtered/i);
    expect(container).not.toHaveTextContent(/calculation ledger/i);
  });

  it('reports the filter change together with the values as displayed', () => {
    const onFilterChange = vi.fn();
    render(<Dashboard country="All" period="All" onFilterChange={onFilterChange} />);

    fireEvent.change(screen.getByTestId('country-filter'), { target: { value: 'Germany' } });

    expect(onFilterChange).toHaveBeenCalledWith('Germany', 'All', getTelemetrySnapshot('Germany', 'All'));
  });

  it('keeps the deliberate defect: KPI ignores country, chart does not', () => {
    const global = getDashboardMetrics('All', 'All');
    const germany = getDashboardMetrics('Germany', 'All');
    expect(germany.revenueKPI).toBe(global.revenueKPI);
    expect(germany.chartRevenueTotal).toBeLessThan(global.chartRevenueTotal);
  });

  it('renders the same KPI value that telemetry records', () => {
    render(<Dashboard country="Japan" period="Q2" onFilterChange={() => undefined} />);
    expect(screen.getByTestId('revenue-kpi')).toHaveTextContent(getTelemetrySnapshot('Japan', 'Q2').revenueKPI);
  });
});
