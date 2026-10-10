const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { Client } = require('minecraft-launcher-core');
const launcher = new Client();
const https = require('https');

let mainWindow = null;          

const SETTINGS_FILE = path.join(app.getPath('userData'), 'launcher-settings.json');
const EDITOR_FILE = path.join(app.getPath('userData'), 'editor-styles.json');
const DEFAULT_SETTINGS = { maxStorageGb: 50, gamePath: '' };

function readSettingsFile() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      return { ...DEFAULT_SETTINGS, ...data };
    }
  } catch (_) {}
  return { ...DEFAULT_SETTINGS };
}

function writeSettingsFile(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (_) {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0a0e16',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getCpuInfo() {
  const cpus = os.cpus();
  if (cpus.length === 0) return 'Unknown CPU';
  const model = cpus[0].model || 'Unknown CPU';
  return `${model} (${cpus.length} cores)`;
}

function getRamInfo() {
  const totalBytes = os.totalmem();
  const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(0);
  return `${totalGB} GB`;
}

function getDiskInfo() {
  const platform = os.platform();
  if (platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf-8' });
      const lines = output.trim().split('\n').slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const free = parseInt(parts[1]);
          const size = parseInt(parts[2]);
          if (size > 0) {
            const sizeGB = (size / (1024 * 1024 * 1024)).toFixed(0);
            return `${sizeGB} GB`;
          }
        }
      }
    } catch (e) {
      // fallback
    }
  }
  const homedir = os.homedir();
  try {
    const stat = require('fs').statSync(homedir);
    return 'Unknown';
  } catch (e) {
    return 'Unknown';
  }
}

function getGpuInfo() {
  return 'Auto-detected GPU';
}

ipcMain.handle('get-hardware-info', () => {
  return {
    cpu: getCpuInfo(),
    ram: getRamInfo(),
    disk: getDiskInfo(),
    gpu: getGpuInfo(),
  };
});

// Полностью обновленный обработчик запуска с авто-скачиванием Fabric
ipcMain.handle('launch-minecraft', async (event, args) => {
  const { version, username, memory, loader, loaderVersion } = args;
  const gameDirectory = path.join(app.getPath('userData'), 'minecraft');
  
  const targetJavaPath = process.env.JAVA_HOME 
    ? path.join(process.env.JAVA_HOME, 'bin', 'javaw.exe') 
    : 'javaw';

  let versionConfig = {
    number: version,
    type: 'release'
  };

  // --- АВТОМАТИЧЕСКАЯ УСТАНОВКА FABRIC С ОФИЦИАЛЬНОГО САЙТА ---
  // --- УМНЫЙ АВТОНОМНЫЙ ГЕНЕРАТОР ССЫЛОК FABRIC ---
  if (loader && loader.toLowerCase() === 'fabric') {
    const cleanVersion = String(version).trim();
    let targetFabricVersion = loaderVersion ? String(loaderVersion).trim() : '';

    // Если версия лоадера не прилетела, лаунчер сам ищет её на сайте Fabric Meta!
    if (!targetFabricVersion) {
      console.log(`[Launcher] Ищем совместимый лоадер для версии ${cleanVersion}...`);
      try {
        const fetchLatestLoader = () => {
          return new Promise((resolve, reject) => {
            const url = `https://fabricmc.net{cleanVersion}`;
            const https = require('https');
            https.get(url, (res) => {
              let data = '';
              res.on('data', (chunk) => data += chunk);
              res.on('end', () => {
                if (res.statusCode === 200) {
                  const list = JSON.parse(data);
                  // Забираем самый свежий лоадер из официального списка сайта
                  if (list && list.length > 0 && list[0].loader) {
                    resolve(list[0].loader.version);
                  } else {
                    reject(new Error('Список лоадеров пуст'));
                  }
                } else {
                  reject(new Error(`Ошибка поиска версии: Код ${res.statusCode}`));
                }
              });
            }).on('error', (err) => reject(err));
          });
        };

        targetFabricVersion = await fetchLatestLoader();
        console.log(`[Launcher] Автоматически подобран лоадер с сайта: ${targetFabricVersion}`);
      } catch (err) {
        console.warn(`[Launcher WARN] Ставим проверенный фолбек:`, err.message);
        targetFabricVersion = cleanVersion.startsWith('1.12') ? '0.15.11' : '0.16.5';
      }
    }

    const fabricVersionName = `fabric-loader-${targetFabricVersion}-${cleanVersion}`;
    const fabricFolder = path.join(gameDirectory, 'versions', fabricVersionName);
    
    if (!fs.existsSync(fabricFolder)) {
      console.log(`[Launcher] Начинаем авто-скачивание профиля: ${fabricVersionName}`);
      try {
        const getFabricManifest = () => {
          return new Promise((resolve, reject) => {
            const url = `https://fabricmc.net/${cleanVersion}/${targetFabricVersion}/profile/json`;
            const https = require('https');
            https.get(url, (res) => {
              let data = '';
              res.on('data', (chunk) => data += chunk);
              res.on('end', () => {
                if (res.statusCode === 200) resolve(JSON.parse(data));
                else reject(new Error(`Код ответа: ${res.statusCode}`));
              });
            }).on('error', (err) => reject(err));
          });
        };

        const manifest = await getFabricManifest();
        fs.mkdirSync(fabricFolder, { recursive: true });
        fs.writeFileSync(path.join(fabricFolder, `${fabricVersionName}.json`), JSON.stringify(manifest, null, 2));
        console.log(`[Launcher] Профиль Fabric успешно сгенерирован и сохранен!`);
      } catch (fabricError) {
        console.error(`[Launcher ERROR] Ошибка генерации:`, fabricError);
        return { success: false, error: `Сбой генератора ссылок Fabric: ${fabricError.message}` };
      }
    }

    versionConfig = {
      number: cleanVersion,
      custom: fabricVersionName
    };
  }
  // Подключаем встроенный генератор случайных ключей Windows/Node.js
  const crypto = require('crypto');
  // Генерируем случайный уникальный UUID для каждого игрока
  const guestUUID = crypto.randomUUID();

  // Сборка финального конфига для запуска
  const launchConfig = {
    clientPackage: null,
    authorization: {
      access_token: '',
      client_token: '',
      uuid:  guestUUID, // ТЕПЕРЬ ТУТ СЛУЧАЙНЫЙ УНИКАЛЬНЫЙ UUID!
      name: username,
      user_properties: '{}',
      meta: { type: 'mojang', displayName: username },
    },
    root: gameDirectory,
    version: versionConfig,
    memory: {
      max: memory || 4096,
      min: 1024,
    },
    javaPath: targetJavaPath,
    customArgs: [
      '-Djava.library.path=' + path.join(gameDirectory, 'bin', 'natives'),
      '--enable-native-access=ALL-UNNAMED'
    ],
  };

  try {
    console.log(`[BACKEND] Инициализация запуска Minecraft [${loader || 'Vanilla'}] ${version}...`);
    const proc = await launcher.launch(launchConfig);

    proc.stdout.on('data', (data) => console.log(`[Minecraft]: ${data.toString().trim()}`));
    proc.stderr.on('data', (data) => console.error(`[Minecraft ERROR]: ${data.toString().trim()}`));
    
    return { success: true, pid: proc.pid };
  } catch (err) {
    console.error(`[Launcher ERROR] Критический сбой при старте игры:`, err);
    return { success: false, error: err.message || String(err) };
  }
});



ipcMain.handle('get-launcher-settings', () => readSettingsFile());

ipcMain.handle('save-launcher-settings', (_event, settings) => {
  writeSettingsFile(settings);
});

ipcMain.handle('choose-game-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('get-editor-styles', () => {
  try {
    if (fs.existsSync(EDITOR_FILE)) {
      return JSON.parse(fs.readFileSync(EDITOR_FILE, 'utf-8'));
    }
  } catch (_) {}
  return null;
});

ipcMain.handle('save-editor-styles', (_event, styles) => {
  try {
    fs.writeFileSync(EDITOR_FILE, JSON.stringify(styles, null, 2));
  } catch (_) {}
});

ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
