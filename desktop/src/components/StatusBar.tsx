import type { AppRoute } from "../app/routes";

type StatusBarProps = {
  route: AppRoute;
  status: string;
  progress: number;
  itemCount: number;
};

export function StatusBar({ route, status, progress, itemCount }: StatusBarProps) {
  return (
    <footer className="statusBar bg-panel border-appBorder">
      <p>View: {route}</p>
      <p>Status: {status}</p>
      <p>Progress: {progress}%</p>
      <p>Library: {itemCount} items</p>
    </footer>
  );
}
