const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
const AdmZip = require('adm-zip');
const { Client } = require('minecraft-launcher-core');
const launcher = new Client();
const crypto = require('crypto');
const { execSync } = require('child_process');

const { vanilla, fabric, quilt, forge, neoforge } = require('tomate-loaders');
// ⬇️ ПОДКЛЮЧАЕМ НАШ МЕНЕДЖЕР СКИНОВ ⬇️
const { applyWideSkin } = require('./skin-manager');

app.setName('Vertex Launcher');

let mainWindow = null;
let gameProcess = null;
let pendingDeepLink = null;

const SETTINGS_FILE = path.join(app.getPath('userData'), 'launcher-settings.json');
const DEFAULT_SETTINGS = { maxStorageGb: 50, gamePath: '' };

function getGameDirectory(customPath) {
  return customPath && customPath.trim() !== '' ? customPath : path.join(app.getPath('userData'), 'minecraft');
}

function readSettingsFile() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) };
  } catch (_) {}
  return { ...DEFAULT_SETTINGS };
}

function writeSettingsFile(settings) {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch (_) {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 700, frame: false,
    title: 'Vertex Launcher',
    backgroundColor: '#0a0e16',
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });

  if (!app.isPackaged) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

  mainWindow.once('ready-to-show', () => { mainWindow.show(); });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function getCpuInfo() { const c = os.cpus(); return c.length ? `${c[0].model} (${c.length} cores)` : 'Unknown'; }
function getRamInfo() { return `${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(0)} GB`; }
function getDiskInfo() {
  if (os.platform() === 'win32') {
    try {
      const out = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf-8' });
      for (const line of out.trim().split('\n').slice(1)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) { const s = parseInt(parts[2]); if (s > 0) return `${(s / (1024 ** 3)).toFixed(0)} GB`; }
      }
    } catch (_) {}
  }
  return 'Unknown';
}
ipcMain.handle('get-hardware-info', () => ({ cpu: getCpuInfo(), ram: getRamInfo(), disk: getDiskInfo(), gpu: 'Auto-detected GPU' }));

function getOfflineUUID(username) {
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + username).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      // Обработка редиректов
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
        https.get(response.headers.location, (res) => { res.pipe(file); });
      } else {
        response.pipe(file);
      }
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
  });
}

async function ensureAuthlibInjector() {
  const resourcesDir = path.join(__dirname, 'resources');
  if (!fs.existsSync(resourcesDir)) fs.mkdirSync(resourcesDir, { recursive: true });
  
  const authlibPath = path.join(resourcesDir, 'authlib-injector-1.2.8.jar');
  if (fs.existsSync(authlibPath)) return authlibPath;

  console.log('[BACKEND] Скачиваем authlib-injector 1.2.8...');
  const downloadUrl = 'https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.8/authlib-injector-1.2.8.jar';
  
  try {
    await downloadFile(downloadUrl, authlibPath);
    console.log('[BACKEND] ✅ authlib-injector успешно скачан.');
    return authlibPath;
  } catch (e) {
    console.error('[BACKEND] ❌ Ошибка скачивания authlib-injector:', e.message);
    return null;
  }
}

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

function findBaseVersion(versionsDir, loader, mcVersion) {
  if (!fs.existsSync(versionsDir)) return null;
  const dirs = fs.readdirSync(versionsDir);
  for (const dir of dirs) {
    if (dir.toLowerCase().includes(loader) && dir.includes(mcVersion)) {
      const jsonPath = path.join(versionsDir, dir, `${dir}.json`);
      if (fs.existsSync(jsonPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          if (data.mainClass?.includes('modlauncher') || data.mainClass?.includes('bootstraplauncher') || data.mainClass?.includes('knot')) {
            return dir;
          }
        } catch (_) {}
      }
    }
  }
  return null;
}

ipcMain.handle('scan-installed-versions', async (event, { gamePath }) => {
  const gameDirectory = getGameDirectory(gamePath);
  const versionsDir = path.join(gameDirectory, 'versions');
  if (!fs.existsSync(versionsDir)) return [];

  const result = [];
  try {
    const dirs = fs.readdirSync(versionsDir);
    for (const dir of dirs) {
      const dirPath = path.join(versionsDir, dir);
      if (!fs.statSync(dirPath).isDirectory()) continue;

      const files = fs.readdirSync(dirPath);
      const hasJar = files.some(f => f.endsWith('.jar'));
      const hasJson = files.some(f => f.endsWith('.json'));
      if (!hasJar && !hasJson) continue; 

      const jsonFile = files.find(f => f.endsWith('.json'));
      let mcVersion = dir;
      let loader = 'vanilla';

      if (jsonFile) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dirPath, jsonFile), 'utf-8'));
          if (data.inheritsFrom) mcVersion = data.inheritsFrom;
          else if (data.id) mcVersion = data.id;

          const idLower = (data.id || '').toLowerCase() + jsonFile.toLowerCase();
          if (idLower.includes('fabric')) loader = 'fabric';
          else if (idLower.includes('neoforge')) loader = 'neoforge';
          else if (idLower.includes('forge')) loader = 'forge';
          else if (idLower.includes('quilt')) loader = 'quilt';
        } catch(e) {}
      }
      
      const exists = result.find(r => r.version === mcVersion && r.loader === loader);
      if (!exists) {
         result.push({ version: mcVersion, loader: loader, folderName: dir });
      }
    }
  } catch (e) {}
  return result;
});

ipcMain.handle('launch-minecraft', async (event, args) => {
  if (gameProcess) return { success: false, error: 'Игра уже запущена!' };

  const { version, username, memory, loader = 'vanilla', javaPath, javaArgs, gamePath, importedPackName } = args;
  const gameDirectory = getGameDirectory(gamePath);
  
  let launchDir = gameDirectory;
  if (importedPackName) launchDir = path.join(gameDirectory, 'versions', importedPackName);

  const targetJavaPath = javaPath && javaPath.trim() !== '' ? javaPath : 'javaw';
  const javaExec = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe') : 'java';

  let loaderModule = vanilla;
  if (loader === 'fabric') loaderModule = fabric;
  else if (loader === 'quilt') loaderModule = quilt;
  else if (loader === 'forge') loaderModule = forge;
  else if (loader === 'neoforge') loaderModule = neoforge;

  try {
    console.log(`\n[BACKEND] Подготовка загрузчика: ${loader} для версии ${version} в ${gameDirectory}...`);

    const authlibPath = await ensureAuthlibInjector();

    const configFromTomate = await loaderModule.getMCLCLaunchConfig({ gameVersion: version, rootPath: gameDirectory });
    let finalVersion = configFromTomate.version;
    if (typeof finalVersion === 'string') finalVersion = { number: finalVersion };

    if (importedPackName) finalVersion = { number: version, custom: importedPackName, type: 'release' };

    if (loader === 'neoforge' || loader === 'forge') {
      const versionsDir = path.join(gameDirectory, 'versions');
      const findModdedVersion = () => {
        if (!fs.existsSync(versionsDir)) return null;
        for (const dir of fs.readdirSync(versionsDir)) {
          if (dir.toLowerCase().includes(loader) && dir.includes(version)) {
            const customDir = path.join(versionsDir, dir);
            const files = fs.readdirSync(customDir);
            for (const file of files) {
              if (file.endsWith('.json')) {
                const jsonPath = path.join(customDir, file);
                try {
                  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                  if (data.mainClass?.includes('modlauncher') || data.mainClass?.includes('bootstraplauncher')) return dir;
                } catch (_) {}
              }
            }
          }
        }
        return null;
      };

      let installedVersionId = findModdedVersion();
      if (!installedVersionId) {
        const tomateDir = fs.readdirSync(versionsDir).find(d => d.toLowerCase().includes(loader) && d.includes(version));
        if (tomateDir) {
          const customDir = path.join(versionsDir, tomateDir);
          const installer = fs.readdirSync(customDir).find(f => f.endsWith('.jar') && !f.includes(version));
          if (installer) {
            const profilesPath = path.join(gameDirectory, 'launcher_profiles.json');
            if (!fs.existsSync(profilesPath)) fs.writeFileSync(profilesPath, JSON.stringify({ profiles: {}, settings: {}, version: 3 }));
            try {
              execSync(`"${javaExec}" -jar "${path.join(customDir, installer)}" --installClient "${gameDirectory}"`, { stdio: 'inherit' });
              installedVersionId = findModdedVersion();
            } catch (e) {}
          }
        }
      }
      if (!installedVersionId) throw new Error(`Не удалось установить ${loader} ${version}`);
      if (!importedPackName) finalVersion = { number: version, custom: installedVersionId, type: 'release' };

      let customJvmArgs = [];
      const moddedDir = path.join(versionsDir, installedVersionId);
      const jsonFile = fs.readdirSync(moddedDir).find(f => f.endsWith('.json'));
      const moddedJsonPath = path.join(moddedDir, jsonFile);
      try {
        const moddedData = JSON.parse(fs.readFileSync(moddedJsonPath, 'utf-8'));
        if (moddedData.arguments && Array.isArray(moddedData.arguments.jvm)) {
          moddedData.arguments.jvm.forEach(arg => {
            if (typeof arg === 'string') {
              let resolvedArg = arg.replace(/\${library_directory}/g, path.join(gameDirectory, 'libraries')).replace(/\${classpath_separator}/g, ';').replace(/\${version_name}/g, installedVersionId);
              customJvmArgs.push(resolvedArg);
            }
          });
        }
      } catch (e) {}
      args._customJvmArgs = customJvmArgs;
    }

    const guestUUID = getOfflineUUID(username);

    // ⬇️ НОВЫЙ БЛОК: ЗАПРОС JSON С СЕРВЕРА И СКАЧИВАНИЕ КАРТИНКИ ⬇️
    const tempSkinPath = path.join(app.getPath('temp'), `${username}_skin.png`);
    try {
        const skinApiUrl = `https://express-js-on-vercel-main.layero.app/api/skin/${username}`; // Твой API
        
        console.log(`[BACKEND] Запрос данных скина для ${username}...`);
        
        // Делаем запрос к твоему серверу
        const apiResponse = await fetch(skinApiUrl);
        if (!apiResponse.ok) throw new Error(`Сервер вернул статус ${apiResponse.status}`);
        
        const skinData = await apiResponse.json();
        
        // ⚠️ ВАЖНО: Здесь нужно заменить 'skinUrl' на то поле, которое возвращает твой сервер!
        // Например, если сервер отдает { "url": "..." }, то напиши skinData.url
        const actualSkinUrl = skinData.skinUrl || skinData.url || skinData.skin; 

        if (actualSkinUrl) {
            console.log(`[BACKEND] Скачивание картинки скина с ${actualSkinUrl}...`);
            await downloadFile(actualSkinUrl, tempSkinPath);
            
            let packFormat = 15;
            if (version.startsWith('1.21')) packFormat = 34;
            else if (version.startsWith('1.20.2') || version.startsWith('1.20.3') || version.startsWith('1.20.4')) packFormat = 18;
            
            applyWideSkin(gameDirectory, tempSkinPath, packFormat);
            console.log(`[BACKEND] ✅ Ресурспак со скином сгенерирован.`);
        } else {
            console.warn(`[BACKEND] ⚠️ В JSON не найдено поле со ссылкой на скин:`, skinData);
        }
    } catch (skinError) {
        console.error(`[BACKEND] ❌ Не удалось получить скин (возможно, его нет в базе):`, skinError.message);
    }
    // ⬆️ КОНЕЦ НОВОГО БЛОКА ⬆️

    let skinArgs = [];
    if (authlibPath) {
      skinArgs.push(`-javaagent:${authlibPath}=https://express-js-on-vercel-main.layero.app`);
    }

    const launchConfig = {
      version: finalVersion,
      root: gameDirectory,
      authorization: { access_token: '', client_token: '', uuid: guestUUID, name: username, user_properties: '{}', meta: { type: 'mojang', displayName: username } },
      memory: { max: memory || 4096, min: 1024 },
      javaPath: targetJavaPath,
      customArgs: [
        '-Djava.library.path=' + path.join(gameDirectory, 'bin', 'natives'),
        '--enable-native-access=ALL-UNNAMED',
        '-Dfile.encoding=UTF-8',
        ...(javaArgs ? javaArgs.split(' ').filter(Boolean) : []),
        ...(importedPackName ? ['--gameDir', launchDir] : []),
        ...(args._customJvmArgs || []),
        ...skinArgs
      ],
    };

    console.log(`[BACKEND] Запуск Minecraft [${loader}] ${version}...`);
    gameProcess = await launcher.launch(launchConfig);
    if (!gameProcess) throw new Error('MCLC вернул null');
    gameProcess.on('close', (code) => { gameProcess = null; if (mainWindow) mainWindow.webContents.send('game-closed'); });
    gameProcess.on('error', (err) => { gameProcess = null; if (mainWindow) mainWindow.webContents.send('game-closed'); });
    gameProcess.stdout.on('data', (d) => console.log(`[Minecraft]: ${d.toString().trim()}`));
    gameProcess.stderr.on('data', (d) => console.error(`[Minecraft ERROR]: ${d.toString().trim()}`));
    return { success: true, pid: gameProcess.pid };
  } catch (err) {
    gameProcess = null;
    return { success: false, error: err.message || String(err) };
  }
});

// ... (Остальной код без изменений: install-loader, install-custom-modpack, apply-skin и т.д.) ...

ipcMain.handle('install-loader', async (event, args) => {
  const { version, loader, gamePath } = args;
  const gameDirectory = getGameDirectory(gamePath);
  let loaderModule = vanilla;
  if (loader === 'fabric') loaderModule = fabric;
  else if (loader === 'quilt') loaderModule = quilt;
  else if (loader === 'forge') loaderModule = forge;
  else if (loader === 'neoforge') loaderModule = neoforge;
  try {
    await loaderModule.getMCLCLaunchConfig({ gameVersion: version, rootPath: gameDirectory });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('install-custom-modpack', async (event, { mods, mcVersion, loader, gamePath }) => {
  const gameDirectory = getGameDirectory(gamePath);
  const modsDir = path.join(gameDirectory, 'mods');
  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
  try {
    let loaderModule = vanilla;
    if (loader === 'fabric') loaderModule = fabric;
    else if (loader === 'quilt') loaderModule = quilt;
    else if (loader === 'forge') loaderModule = forge;
    else if (loader === 'neoforge') loaderModule = neoforge;
    await loaderModule.getMCLCLaunchConfig({ gameVersion: mcVersion, rootPath: gameDirectory });
    for (const mod of mods) {
      try {
        if (mod.download_url) {
          const dest = path.join(modsDir, mod.file_name || `${mod.slug}.jar`);
          await downloadFile(mod.download_url, dest);
        } else {
          const query = new URLSearchParams({ loaders: JSON.stringify([loader]), game_versions: JSON.stringify([mcVersion]) });
          const res = await fetch(`https://api.modrinth.com/v2/project/${mod.project_id}/version?${query}`, { headers: { 'User-Agent': 'VertexLauncher/1.0.0' } });
          if (res.ok) {
            const versions = await res.json();
            if (versions.length > 0 && versions[0].files.length > 0) {
              const file = versions[0].files[0];
              const dest = path.join(modsDir, file.filename);
              await downloadFile(file.url, dest);
            }
          }
        }
      } catch (modErr) { console.error(`[BACKEND] Не удалось скачать мод:`, modErr.message); }
    }
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('apply-skin', async (event, { skinUrl, username, gamePath }) => {
  const gameDirectory = getGameDirectory(gamePath);
  const tempPath = path.join(app.getPath('temp'), `${username}_manual_skin.png`);
  try {
      await downloadFile(skinUrl, tempPath);
      applyWideSkin(gameDirectory, tempPath, 15);
      return { success: true };
  } catch (e) {
      return { success: false, error: e.message };
  }
});

ipcMain.handle('download-mod', async (event, { url, filename, gamePath }) => {
  const gameDirectory = getGameDirectory(gamePath);
  const modsDir = path.join(gameDirectory, 'mods');
  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
  const dest = path.join(modsDir, filename);
  try {
    await downloadFile(url, dest);
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('select-and-import-modpack', async (event, { gamePath }) => {
  const gameDirectory = getGameDirectory(gamePath);
  try {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Modpacks', extensions: ['zip', 'mrpack'] }] });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    const filePath = result.filePaths[0];
    console.log(`[BACKEND] Импорт файла: ${filePath}`);
    const zip = new AdmZip(filePath);
    const indexFile = zip.getEntry('modrinth.index.json');
    let packName = path.basename(filePath, path.extname(filePath));
    let packVersion = '1.0.0'; let mcVersion = '1.20.1'; let loader = 'fabric';
    if (indexFile) {
      const indexData = JSON.parse(indexFile.getData().toString('utf-8'));
      packName = indexData.name || packName; packVersion = indexData.versionId || packVersion;
      mcVersion = indexData.dependencies?.minecraft || mcVersion;
      if (indexData.dependencies?.['fabric-loader']) loader = 'fabric';
      else if (indexData.dependencies?.['forge']) loader = 'forge';
      else if (indexData.dependencies?.['neoforge']) loader = 'neoforge';
      else if (indexData.dependencies?.['quilt-loader']) loader = 'quilt';
    }
    const safeName = packName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'ImportedPack';
    const versionDir = path.join(gameDirectory, 'versions', safeName);
    if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });
    if (indexFile) {
      const indexData = JSON.parse(indexFile.getData().toString('utf-8'));
      const modsDir = path.join(versionDir, 'mods');
      if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
      if (indexData.files && Array.isArray(indexData.files)) {
        for (const file of indexData.files) {
          if (file.downloads && file.downloads.length > 0) {
            const url = file.downloads[0]; const dest = path.join(versionDir, file.path); 
            const destDir = path.dirname(dest); if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            await downloadFile(url, dest);
          }
        }
      }
    } else { zip.extractAllTo(versionDir, true, true); }
    const versionsDir = path.join(gameDirectory, 'versions');
    const baseVersionId = findBaseVersion(versionsDir, loader, mcVersion);
    if (baseVersionId) {
      const baseJarPath = path.join(versionsDir, baseVersionId, `${baseVersionId}.jar`);
      if (fs.existsSync(baseJarPath)) fs.copyFileSync(baseJarPath, path.join(versionDir, `${safeName}.jar`));
    }
    const jsonPath = path.join(versionDir, `${safeName}.json`);
    const versionJson = { id: safeName, inheritsFrom: baseVersionId || mcVersion, type: 'release', releaseTime: new Date().toISOString() };
    fs.writeFileSync(jsonPath, JSON.stringify(versionJson, null, 2));
    console.log(`[BACKEND] ✅ Импорт модпака успешно завершен: ${safeName}`);
    return { success: true, pack: { id: crypto.randomUUID(), name: safeName, version: packVersion, mc_version: mcVersion, loader: loader, importedAt: new Date().toISOString() } };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('import-folder-modpack', async (event, { sourcePath, packName, mcVersion, loader, gamePath }) => {
  const gameDirectory = getGameDirectory(gamePath);
  let finalPackName = packName;
  if (!finalPackName || finalPackName.trim() === '') finalPackName = path.basename(sourcePath);
  const safeName = finalPackName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'ImportedPack';
  const versionDir = path.join(gameDirectory, 'versions', safeName);
  try {
    console.log(`[BACKEND] ⏳ Начат импорт папки "${safeName}" из ${sourcePath}...`);
    copyFolderSync(sourcePath, versionDir);
    const versionsDir = path.join(gameDirectory, 'versions');
    const baseVersionId = findBaseVersion(versionsDir, loader, mcVersion);
    if (baseVersionId) {
      const baseJarPath = path.join(versionsDir, baseVersionId, `${baseVersionId}.jar`);
      if (fs.existsSync(baseJarPath)) fs.copyFileSync(baseJarPath, path.join(versionDir, `${safeName}.jar`));
    }
    const jsonPath = path.join(versionDir, `${safeName}.json`);
    const versionJson = { id: safeName, inheritsFrom: baseVersionId || mcVersion, type: 'release', releaseTime: new Date().toISOString() };
    fs.writeFileSync(jsonPath, JSON.stringify(versionJson, null, 2));
    console.log(`[BACKEND] ✅ Импорт папки успешно завершен: ${safeName}`);
    return { success: true, pack: { id: crypto.randomUUID(), name: safeName, version: '1.0.0', mc_version: mcVersion, loader: loader, importedAt: new Date().toISOString() } };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('delete-version', async (event, { versionId, gamePath }) => {
  const gameDirectory = getGameDirectory(gamePath);
  const versionDir = path.join(gameDirectory, 'versions', versionId);
  try {
    if (fs.existsSync(versionDir)) {
      fs.rmSync(versionDir, { recursive: true, force: true });
      return { success: true };
    }
    return { success: false, error: 'Папка версии не найдена' };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('install-modpack', async (event, { url, gamePath }) => {
  const gameDirectory = getGameDirectory(gamePath);
  const tempZip = path.join(app.getPath('temp'), 'modpack_temp.zip');
  return new Promise((resolve) => {
    const file = fs.createWriteStream(tempZip);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        https.get(response.headers.location, (res) => { res.pipe(file); });
      } else { response.pipe(file); }
      file.on('finish', () => {
        file.close();
        try {
          const zip = new AdmZip(tempZip);
          zip.extractAllTo(gameDirectory, true);
          fs.unlinkSync(tempZip);
          resolve({ success: true });
        } catch (e) { resolve({ success: false, error: e.message }); }
      });
    }).on('error', (err) => {
      fs.unlink(tempZip, () => {});
      resolve({ success: false, error: err.message });
    });
  });
});

ipcMain.handle('fetch-mojang-versions', async () => {
  try {
    const response = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    if (!response.ok) throw new Error(`Mojang API error: ${response.status}`);
    return (await response.json()).versions;
  } catch (error) {
    console.log('[BACKEND] Не удалось обновить список версий Mojang.');
    return [];
  }
});

ipcMain.handle('fetch-modrinth', async (event, { endpoint, query }) => {
  try {
    const url = `https://api.modrinth.com/v2/${endpoint}?${new URLSearchParams(query).toString()}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'VertexLauncher/1.0.0' } });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) { throw error; }
});

ipcMain.handle('get-launcher-settings', () => readSettingsFile());
ipcMain.handle('save-launcher-settings', (_e, s) => { writeSettingsFile(s); });
ipcMain.handle('choose-game-folder', async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});
ipcMain.handle('window-minimize', () => mainWindow?.minimize());
ipcMain.handle('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.handle('window-close', () => mainWindow?.close());
ipcMain.handle('get-editor-styles', () => null);
ipcMain.handle('save-editor-styles', () => {});

ipcMain.handle('get-pending-deep-link', () => {
  const link = pendingDeepLink;
  pendingDeepLink = null;
  return link;
});

if (process.defaultApp) {
  if (process.argv.length >= 2) app.setAsDefaultProtocolClient('vertex-launcher', process.execPath, [path.resolve(process.argv[1])]);
} else { app.setAsDefaultProtocolClient('vertex-launcher'); }

process.argv.forEach((arg) => { if (arg.startsWith('vertex-launcher://')) pendingDeepLink = arg; });

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const url = commandLine.find(arg => arg.startsWith('vertex-launcher://'));
    if (url) {
      if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('auth-callback', url);
      else pendingDeepLink = url;
    }
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });