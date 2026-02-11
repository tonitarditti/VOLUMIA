export {};

declare global {
  interface Window {
    volumia: {
      ping: () => string;
    };
  }
}
