import { createContext, useContext, type PropsWithChildren } from "react";

export type AppCommands = {
  importProjects: () => void | Promise<void>;
  exportProjects: () => void | Promise<void>;
  importSettings: () => void | Promise<void>;
  exportSettings: () => void | Promise<void>;
  resetWindowLayout: () => void | Promise<void>;
  resetAllData: () => void | Promise<void>;
};

const AppCommandsContext = createContext<AppCommands | null>(null);

type AppCommandsProviderProps = PropsWithChildren<{
  value: AppCommands;
}>;

export function AppCommandsProvider({
  children,
  value,
}: AppCommandsProviderProps) {
  return (
    <AppCommandsContext.Provider value={value}>
      {children}
    </AppCommandsContext.Provider>
  );
}

export function useAppCommands() {
  const context = useContext(AppCommandsContext);
  if (!context) {
    throw new Error("useAppCommands must be used within AppCommandsProvider.");
  }
  return context;
}
