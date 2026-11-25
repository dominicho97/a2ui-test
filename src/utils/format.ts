/** Locale-pinned so the on-screen KPI, the telemetry string and the investigator text always match. */
export function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}
