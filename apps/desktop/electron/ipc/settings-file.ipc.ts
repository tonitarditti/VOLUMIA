import { dialog, ipcMain } from "electron";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import {
  IPC_CHANNELS,
  type ExportSettingsResult,
  type ImportSettingsResult,
  type SettingsExportEnvelope,
} from "../channels";

export function registerSettingsFileHandlers() {
  ipcMain.handle(
    IPC_CHANNELS.exportSettingsJson,
    async (_event, payload: SettingsExportEnvelope): Promise<ExportSettingsResult> => {
      const response = await dialog.showSaveDialog({
        title: "Export Settings",
        defaultPath: "volumia-settings.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (response.canceled || !response.filePath) {
        return { canceled: true };
      }

      const safePayload: SettingsExportEnvelope = {
        ...payload,
        app: "VOLUMIA",
        schemaVersion: 1,
      };

      await writeFile(response.filePath, JSON.stringify(safePayload, null, 2), "utf-8");
      return {
        canceled: false,
        filePath: response.filePath,
      };
    }
  );

  ipcMain.handle(IPC_CHANNELS.importSettingsJson, async (): Promise<ImportSettingsResult> => {
    const response = await dialog.showOpenDialog({
      title: "Import Settings",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (response.canceled || response.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = path.resolve(response.filePaths[0]);
    const content = await readFile(filePath, "utf-8");
    return {
      canceled: false,
      filePath,
      content,
    };
  });
}
