export {};

declare global {
  interface Window {
    electronAPI: {
      selectImages: () => Promise<string[]>;
      openFolder: (folderPath: string) => Promise<boolean>;
    };
  }
}
