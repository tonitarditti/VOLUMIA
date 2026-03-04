import type { ReactNode } from "react";

export type WorkspaceMode =
  | "references"
  | "model"
  | "material"
  | "light"
  | "ai"
  | "result";

export type WorkspaceModeDefinition = {
  id: WorkspaceMode;
  label: string;
  shortLabel: string;
  tooltip: string;
  shortcut: "1" | "2" | "3" | "4" | "5" | "6";
  icon: ReactNode;
  title: string;
  description: string;
};

function RailIcon({
  children,
  strokeWidth = 1.7,
}: {
  children: ReactNode;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-5 w-5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
    >
      {children}
    </svg>
  );
}

const modeDefinitions: WorkspaceModeDefinition[] = [
  {
    id: "references",
    label: "References",
    shortLabel: "RF",
    tooltip: "References",
    shortcut: "1",
    title: "References",
    description:
      "Review input imagery, notes and project context before running reconstruction.",
    icon: (
      <RailIcon>
        <rect x="3.25" y="4" width="5.25" height="12" rx="1.25" />
        <rect x="11.5" y="4.75" width="5.25" height="10.5" rx="1.25" />
        <path d="M4.75 8.25h2.25" />
        <path d="M4.75 11h2.75" />
        <path d="M12.75 8h2.5" />
      </RailIcon>
    ),
  },
  {
    id: "model",
    label: "Model",
    shortLabel: "M",
    tooltip: "Model",
    shortcut: "2",
    title: "Model",
    description:
      "Inspect geometry output, reconstruction tier and the current asset state.",
    icon: (
      <RailIcon>
        <path d="M10 3.5 4 6.75v6.5L10 16.5l6-3.25v-6.5L10 3.5Z" />
        <path d="M4 6.75 10 10l6-3.25" />
        <path d="M10 10v6.5" />
      </RailIcon>
    ),
  },
  {
    id: "material",
    label: "Material",
    shortLabel: "MT",
    tooltip: "Material",
    shortcut: "3",
    title: "Material",
    description:
      "Track texture and mapping readiness without replacing the loaded GLB pipeline.",
    icon: (
      <RailIcon>
        <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
        <path d="M3.5 8.5h13" />
        <path d="M8.5 3.5v13" />
        <circle
          cx="12.75"
          cy="12.75"
          r="1.25"
          fill="currentColor"
          stroke="none"
        />
      </RailIcon>
    ),
  },
  {
    id: "light",
    label: "Light",
    shortLabel: "L",
    tooltip: "Light",
    shortcut: "4",
    title: "Light",
    description:
      "Review the current studio atmosphere, lighting balance and viewport presentation.",
    icon: (
      <RailIcon>
        <circle cx="10" cy="10" r="2.75" />
        <path d="M10 3.5v2" />
        <path d="M10 14.5v2" />
        <path d="m5.45 5.45 1.35 1.35" />
        <path d="m13.2 13.2 1.35 1.35" />
        <path d="M3.5 10h2" />
        <path d="M14.5 10h2" />
        <path d="m5.45 14.55 1.35-1.35" />
        <path d="m13.2 6.8 1.35-1.35" />
      </RailIcon>
    ),
  },
  {
    id: "ai",
    label: "AI",
    shortLabel: "AI",
    tooltip: "AI",
    shortcut: "5",
    title: "AI",
    description:
      "Manage engine readiness, generation presets and reconstruction controls.",
    icon: (
      <RailIcon>
        <rect x="4" y="5" width="12" height="10" rx="2.5" />
        <path d="M7 9.25h6" />
        <path d="M7 12h4" />
        <path d="M10 2.75v2" />
        <path d="M6 3.5 7 5" />
        <path d="M14 3.5 13 5" />
      </RailIcon>
    ),
  },
  {
    id: "result",
    label: "Result",
    shortLabel: "R",
    tooltip: "Result",
    shortcut: "6",
    title: "Result",
    description:
      "Review run progress, engine metadata and output paths for the current project.",
    icon: (
      <RailIcon>
        <path d="M4.5 4.5h11v11h-11z" />
        <path d="M7.25 10.5 9 12.25l3.75-3.75" />
      </RailIcon>
    ),
  },
];

export const workspaceModeDefinitions = modeDefinitions;

export const workspaceModeDefinitionMap = Object.fromEntries(
  modeDefinitions.map((mode) => [mode.id, mode]),
) as Record<WorkspaceMode, WorkspaceModeDefinition>;

export function getWorkspaceModeDefinition(mode: WorkspaceMode) {
  return workspaceModeDefinitionMap[mode];
}
