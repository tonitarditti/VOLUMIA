import { dialog, ipcMain } from "electron";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import {
  IPC_CHANNELS,
  type ExportProjectsResult,
  type ImportProjectsResult,
  type ProjectsExportEnvelope,
} from "../channels";

export function registerProjectsFileHandlers() {
  ipcMain.handle(
    IPC_CHANNELS.exportProjectsJson,
    async (_event, payload: ProjectsExportEnvelope): Promise<ExportProjectsResult> => {
      const response = await dialog.showSaveDialog({
        title: "Export Projects",
        defaultPath: "volumia-projects.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (response.canceled || !response.filePath) {
        return { canceled: true };
      }

      const safePayload: ProjectsExportEnvelope = {
        ...payload,
        app: "VOLUMIA",
        schemaVersion: 1,
      };

      const json = JSON.stringify(safePayload, null, 2);
      await writeFile(response.filePath, json, "utf-8");

      return {
        canceled: false,
        filePath: response.filePath,
      };
    }
  );

  ipcMain.handle(IPC_CHANNELS.importProjectsJson, async (): Promise<ImportProjectsResult> => {
    const response = await dialog.showOpenDialog({
      title: "Import Projects",
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
