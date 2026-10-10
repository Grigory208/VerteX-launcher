export {};

declare global {
  interface HardwareInfo {
    cpu: string;
    ram: string;
    disk: string;
    gpu: string;
  }

  interface LaunchMinecraftArgs {
    version: string;
    username: string;
    memory: number;
  }

  interface LaunchMinecraftResult {
    success: boolean;
    error?: string;
    pid?: number;
  }

  interface ElectronAPI {
    getHardwareInfo: () => Promise<HardwareInfo>;
    launchMinecraft: (args: LaunchMinecraftArgs) => Promise<LaunchMinecraftResult>;
    onMinecraftStdout: (callback: (data: string) => void) => void;
    onMinecraftStderr: (callback: (data: string) => void) => void;
    onMinecraftClosed: (callback: (data: { code: number }) => void) => void;
    windowMinimize: () => Promise<void>;
    windowMaximize: () => Promise<void>;
    windowClose: () => Promise<void>;
    getLauncherSettings: () => Promise<{ maxStorageGb: number; gamePath: string; javaPath: string; memoryMb: number; javaArgs: string }>;
    saveLauncherSettings: (settings: { maxStorageGb: number; gamePath: string; javaPath: string; memoryMb: number; javaArgs: string }) => Promise<void>;
    chooseGameFolder: () => Promise<string | null>;
    getEditorStyles: () => Promise<Record<string, unknown> | null>;
    saveEditorStyles: (styles: Record<string, unknown>) => Promise<void>;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}
