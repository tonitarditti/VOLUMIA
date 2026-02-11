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
        <div className="progressWrap" aria-label="progress">
          <div className="progressBar" style={{ width: `${progress}%` }} />
        </div>
        <span className="kbd">{progress}%</span>
      </div>
    </div>
  );
}
