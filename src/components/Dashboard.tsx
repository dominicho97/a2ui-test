import { useMemo, type ReactElement } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { getDashboardMetrics, getTelemetrySnapshot, SYNTHETIC_SALES_DATA } from '@/data/salesData';
import { formatCurrency } from '@/utils/format';
import type { TelemetrySnapshot } from '@/types';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
const REVENUE_TARGET = 3000000;

interface DashboardProps {
  country: string;
  period: string;
  onFilterChange: (country: string, period: string, telemetry: TelemetrySnapshot) => void;
}

export default function Dashboard({ country, period, onFilterChange }: DashboardProps): ReactElement {
  const handleCountryChange = (newCountry: string): void => {
    onFilterChange(newCountry, period, getTelemetrySnapshot(newCountry, period));
  };

  const handlePeriodChange = (newPeriod: string): void => {
    onFilterChange(country, newPeriod, getTelemetrySnapshot(country, newPeriod));
  };

  const metrics = useMemo(() => getDashboardMetrics(country, period), [country, period]);
  const {
    filteredData,
    unitsSold: totalUnitsSold,
    activeCustomers: totalActiveCustomers,
    revenueKPI: displayedRevenueKPI,
    chartRevenueTotal
  } = metrics;
  const targetPercent = ((displayedRevenueKPI / REVENUE_TARGET) * 100).toFixed(1);

  // 3. CHART DATA COMPILATION
  // Revenue by Quarter Chart Data (correctly filtered)
  const chartDataByPeriod = useMemo(() => {
    const periods = ['Q1', 'Q2', 'Q3', 'Q4'];
    return periods.map((p) => {
      const periodRecords = filteredData.filter((r) => r.period === p);
      return {
        name: p,
        Revenue: periodRecords.reduce((sum, r) => sum + r.revenue, 0)
      };
    });
  }, [filteredData]);

  // Product Category share
  const pieChartData = useMemo(() => {
    const categories: Record<string, number> = {};
    filteredData.forEach((r) => {
      categories[r.productCategory] = (categories[r.productCategory] || 0) + r.revenue;
    });
    return Object.keys(categories).map((cat) => ({
      name: cat,
      value: categories[cat]
    }));
  }, [filteredData]);

  return (
    <div className="flex flex-col h-full bg-[#f3f2f1] text-[#252423] font-sans rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Power BI Styled Header */}
      <header className="bg-[#111] text-white px-5 py-3 flex items-center justify-between border-b border-yellow-500">
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 bg-[#f2c811] text-black font-bold flex items-center justify-center text-sm rounded-sm shadow">
            Y
          </div>
          <span className="font-semibold tracking-wide text-sm md:text-base">
            Power BI Pro - Global Corporate Sales Dashboard
          </span>
        </div>
        <div className="flex items-center space-x-2 text-xs text-gray-400 bg-[#222] px-3 py-1.5 rounded border border-gray-700">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span>Live Workspace Connection</span>
        </div>
      </header>

      {/* Filter Ribbon bar */}
      <div className="bg-white border-b border-gray-200 p-3 flex flex-wrap gap-4 items-center">
        <div className="flex items-center space-x-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Country/Region Filter:</label>
          <select
            data-testid="country-filter"
            value={country}
            onChange={(e) => handleCountryChange(e.target.value)}
            className="bg-[#f3f2f1] border border-gray-300 rounded px-2.5 py-1 text-sm font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-yellow-500 hover:bg-gray-100 transition-colors"
          >
            <option value="All">All Countries (Global)</option>
            <option value="United States">United States</option>
            <option value="Germany">Germany</option>
            <option value="Japan">Japan</option>
            <option value="United Kingdom">United Kingdom</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Period Selector:</label>
          <select
            data-testid="period-filter"
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="bg-[#f3f2f1] border border-gray-300 rounded px-2.5 py-1 text-sm font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-yellow-500 hover:bg-gray-100 transition-colors"
          >
            <option value="All">All Periods (Full Year)</option>
            <option value="Q1">Q1</option>
            <option value="Q2">Q2</option>
            <option value="Q3">Q3</option>
            <option value="Q4">Q4</option>
          </select>
        </div>

      </div>

      {/* Main Dashboard Canvas Grid */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {/* KPI Tiles row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Revenue Tile */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between relative overflow-hidden group hover:border-yellow-400 transition-all">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#f2c811]"></div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Revenue KPI</p>
              <h3
                data-testid="revenue-kpi"
                className="text-2xl md:text-3xl font-bold tracking-tight mt-1 text-gray-900"
              >
                {formatCurrency(displayedRevenueKPI)}
              </h3>
            </div>
            <div className="flex justify-between items-center text-xs mt-3 pt-2 border-t border-gray-100">
              <span className="text-gray-400">Target: {formatCurrency(REVENUE_TARGET)}</span>
              <span className="text-green-600 font-medium">{targetPercent}% to Target</span>
            </div>
          </div>

          {/* Units Sold Tile (Working) */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between relative overflow-hidden group hover:border-blue-400 transition-all">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-blue-500"></div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Units Sold KPI</p>
              <h3 data-testid="units-kpi" className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight mt-1">
                {totalUnitsSold.toLocaleString()}
              </h3>
            </div>
            <div className="flex justify-between items-center text-xs mt-3 pt-2 border-t border-gray-100 text-gray-400">
              <span>Average Price: $253</span>
              <span className="text-blue-600 font-medium">Within Forecast</span>
            </div>
          </div>

          {/* Active Customers Tile (Working) */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between relative overflow-hidden group hover:border-emerald-400 transition-all">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500"></div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Active Customer Base</p>
              <h3 data-testid="customers-kpi" className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight mt-1">
                {totalActiveCustomers.toLocaleString()}
              </h3>
            </div>
            <div className="flex justify-between items-center text-xs mt-3 pt-2 border-t border-gray-100 text-gray-400">
              <span>Retention: 94.2%</span>
              <span className="text-emerald-600 font-medium">+8.3% MoM</span>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue by Reporting Period (Recharts Bar Chart) */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
              <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
              Revenue Trend by Period
            </h4>
            <div className="h-64" data-testid="period-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataByPeriod} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" />
                  <XAxis dataKey="name" stroke="#a0aec0" fontSize={12} tickLine={false} />
                  <YAxis stroke="#a0aec0" fontSize={12} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']} />
                  <Bar dataKey="Revenue" fill="#f2c811" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Product Category Share (Recharts Pie Chart) */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>
              Product Category Breakdown
            </h4>
            <div className="h-64 flex flex-col md:flex-row items-center justify-center" data-testid="category-chart">
              {pieChartData.length > 0 ? (
                <>
                  <div className="w-full md:w-1/2 h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieChartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Share']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full md:w-1/2 px-2 flex flex-col space-y-1.5 text-xs text-gray-600">
                    {pieChartData.map((entry, idx) => (
                      <div key={entry.name} className="flex items-center space-x-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                        <span className="font-medium text-gray-700 truncate">{entry.name}:</span>
                        <span>${entry.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <span className="text-sm text-gray-400">No data available for filters</span>
              )}
            </div>
          </div>
        </div>

        {/* Detailed Sales Ledger Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-[#fcfcfc] px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-700">Detailed Transaction Ledger</h4>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-mono">
              Showing {filteredData.length} of {SYNTHETIC_SALES_DATA.length} records
            </span>
          </div>
          <div className="overflow-x-auto max-h-48 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-100 text-left text-xs text-gray-600">
              <thead className="bg-[#f3f2f1] text-[11px] text-gray-400 uppercase font-semibold sticky top-0">
                <tr>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Country</th>
                  <th className="px-4 py-2">Period</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Units</th>
                  <th className="px-4 py-2 text-right">Customers</th>
                  <th className="px-4 py-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredData.map((row) => (
                  <tr key={row.id} className="hover:bg-[#faf9f8] transition-colors">
                    <td className="px-4 py-1.5 font-mono text-gray-400">#{row.id}</td>
                    <td className="px-4 py-1.5 font-medium text-gray-800">{row.country}</td>
                    <td className="px-4 py-1.5">{row.period}</td>
                    <td className="px-4 py-1.5 text-gray-500">{row.productCategory}</td>
                    <td className="px-4 py-1.5 text-right">{row.unitsSold.toLocaleString()}</td>
                    <td className="px-4 py-1.5 text-right">{row.activeCustomers}</td>
                    <td className="px-4 py-1.5 text-right font-medium text-gray-900">${row.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-[#f8f9fa] border-t border-gray-100 px-4 py-2 flex items-center justify-between text-xs font-semibold text-gray-700">
            <span>Total Revenue</span>
            <span data-testid="ledger-total" className="text-gray-900 font-mono text-sm">{formatCurrency(chartRevenueTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
