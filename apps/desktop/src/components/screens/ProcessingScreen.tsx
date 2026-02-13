import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProcessingStore } from "@/state/processing.store";

export function ProcessingScreen() {
  const { t } = useTranslation();
  const progress = useProcessingStore((state) => state.progress);
  const messageKey = useProcessingStore((state) => state.messageKey);
  const errorDetail = useProcessingStore((state) => state.errorDetail);
  const startedAt = useProcessingStore((state) => state.startedAt);
  const steps = useProcessingStore((state) => state.steps);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }

    const update = () => {
      setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="screenWrap processingScreen cardSurface centered">
      <h2>{t("processing.title")}</h2>
      <p>{t(messageKey)}</p>
      {errorDetail ? <small>{errorDetail}</small> : null}

      <div className="progressBarWrap">
        <div className="progressBar" style={{ width: `${progress}%` }} />
      </div>
      <span className="progressValue">{progress}%</span>

      <ul className="processingSteps">
        {steps.map((step) => (
          <li key={step.id} className={`stepItem ${step.status}`}>
            <span>{t(`processing.steps.${step.id}`)}</span>
            <strong>{t(`processing.stepStatus.${step.status}`)}</strong>
          </li>
        ))}
      </ul>

      <small>{t("processing.elapsed", { seconds: elapsed })}</small>
    </div>
  );
}
