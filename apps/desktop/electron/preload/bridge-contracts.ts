export interface DesktopBridgeResult<T> {
  ok: boolean;
  value?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface DesktopBridge {
  backend: {
    getStatus(): Promise<DesktopBridgeResult<unknown>>;
    start(): Promise<DesktopBridgeResult<unknown>>;
    stop(): Promise<DesktopBridgeResult<unknown>>;
    logs(): Promise<DesktopBridgeResult<string[]>>;
  };
  capture: {
    sources(sourceType: "screen" | "window"): Promise<DesktopBridgeResult<unknown[]>>;
    once(payload: unknown): Promise<DesktopBridgeResult<unknown>>;
  };
  settings: {
    get(): Promise<DesktopBridgeResult<unknown>>;
    save(payload: unknown): Promise<DesktopBridgeResult<unknown>>;
    clear(): Promise<DesktopBridgeResult<unknown>>;
  };
  history: {
    list(): Promise<DesktopBridgeResult<unknown[]>>;
    save(payload: unknown): Promise<DesktopBridgeResult<unknown[]>>;
    clear(): Promise<DesktopBridgeResult<unknown[]>>;
  };
  diagnostics: {
    get(): Promise<DesktopBridgeResult<unknown>>;
  };
  external: {
    open(url: string): Promise<DesktopBridgeResult<unknown>>;
  };
}

declare global {
  interface Window {
    desktopApi: DesktopBridge;
  }
}
