export function DashboardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">{children}</div>;
}
