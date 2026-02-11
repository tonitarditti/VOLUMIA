import { useJobStore } from "../stores/job.store";

export default function StatusBar() {
  const status = useJobStore((s) => s.status);
  const message = useJobStore((s) => s.message);
  const progress = useJobStore((s) => s.progress);

  return (
    <div className="statusbar">
      <div className="statusLeft">
        <span className="statusDot" data-status={status} />
        <span className="statusText">{message}</span>
      </div>

      <div className="statusRight">
        <progress className="progressNative" value={progress} max={100} aria-label="progress" />
        <span className="kbd">{progress}%</span>
      </div>
    </div>
  );
}
