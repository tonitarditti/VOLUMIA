import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ExportOptions } from "@volumia/shared";
import { Button, Select } from "@/components/ui";

type ExportModalProps = {
  open: boolean;
  busy: boolean;
  message: string | null;
  initialOptions?: ExportOptions;
  onClose: () => void;
  onExport: (options: ExportOptions) => Promise<void>;
};

const fallbackOptions: ExportOptions = {
  units: "cm",
  pivot: "floor-center",
  smoothing: true,
  fixBackfaces: true,
  keepMaterialsSeparated: true,
  keepComponentsSeparated: true,
  includePbrMaps: true,
  textureSize: "2k",
  includeLightweight: true,
};

export function ExportModal({ open, busy, message, initialOptions, onClose, onExport }: ExportModalProps) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ExportOptions>(fallbackOptions);

  useEffect(() => {
    if (open) {
      setOptions(initialOptions ?? fallbackOptions);
    }
  }, [open, initialOptions]);

  if (!open) return null;

  return (
    <div className="modalOverlay">
      <div className="floatingPanel exportModal">
        <h3>{t("exportModal.title")}</h3>

        <label className="field">
          <span>{t("exportModal.units")}</span>
          <Select value={options.units} onChange={(event) => setOptions((prev) => ({ ...prev, units: event.target.value as never }))}>
            <option value="cm">cm</option>
            <option value="m">m</option>
          </Select>
        </label>

        <label className="field">
          <span>{t("exportModal.pivot")}</span>
          <Select value={options.pivot} onChange={(event) => setOptions((prev) => ({ ...prev, pivot: event.target.value as never }))}>
            <option value="floor-center">{t("exportModal.pivotFloorCenter")}</option>
            <option value="center">{t("exportModal.pivotCenter")}</option>
          </Select>
        </label>

        <label className="field switchRow">
          <span>{t("exportModal.smoothing")}</span>
          <input type="checkbox" checked={options.smoothing} onChange={(event) => setOptions((prev) => ({ ...prev, smoothing: event.target.checked }))} />
        </label>
        <label className="field switchRow">
          <span>{t("exportModal.fixBackfaces")}</span>
          <input type="checkbox" checked={options.fixBackfaces} onChange={(event) => setOptions((prev) => ({ ...prev, fixBackfaces: event.target.checked }))} />
        </label>
        <label className="field switchRow">
          <span>{t("exportModal.keepMaterialsSeparated")}</span>
          <input
            type="checkbox"
            checked={options.keepMaterialsSeparated}
            onChange={(event) => setOptions((prev) => ({ ...prev, keepMaterialsSeparated: event.target.checked }))}
          />
        </label>
        <label className="field switchRow">
          <span>{t("exportModal.keepComponentsSeparated")}</span>
          <input
            type="checkbox"
            checked={options.keepComponentsSeparated}
            onChange={(event) => setOptions((prev) => ({ ...prev, keepComponentsSeparated: event.target.checked }))}
          />
        </label>
        <label className="field switchRow">
          <span>{t("exportModal.includePbrMaps")}</span>
          <input type="checkbox" checked={options.includePbrMaps} onChange={(event) => setOptions((prev) => ({ ...prev, includePbrMaps: event.target.checked }))} />
        </label>
        <label className="field switchRow">
          <span>{t("exportModal.includeLow")}</span>
          <input
            type="checkbox"
            checked={options.includeLightweight}
            onChange={(event) => setOptions((prev) => ({ ...prev, includeLightweight: event.target.checked }))}
          />
        </label>

        <label className="field">
          <span>{t("exportModal.textureSize")}</span>
          <Select value={options.textureSize} onChange={(event) => setOptions((prev) => ({ ...prev, textureSize: event.target.value as never }))}>
            <option value="2k">2K</option>
            <option value="4k">4K</option>
          </Select>
        </label>

        {message ? <p className="modalMessage">{message}</p> : null}

        <div className="modalActions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {t("common.close")}
          </Button>
          <Button type="button" variant="primary" onClick={() => void onExport(options)} disabled={busy}>
            {busy ? t("exportModal.exporting") : t("exportModal.exportPackage")}
          </Button>
        </div>
      </div>
    </div>
  );
}
