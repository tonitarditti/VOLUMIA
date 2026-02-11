type StatusBarProps = {
  status: string;
  progress: number;
  assetCount: number;
};

export function StatusBar({ status, progress, assetCount }: StatusBarProps) {
  return (
    <footer className="statusBar">
      <p>{status}</p>
      <p>Progress: {progress}%</p>
      <p>Library assets: {assetCount}</p>
      <p>Engine: Local secure IPC</p>
    </footer>
  );
}
