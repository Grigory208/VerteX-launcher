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
const { applyWideSkin, packFormatFor } = require('./skin-manager');

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
const JARVIS_OLLAMA_URL = 'http://localhost:11434/api/chat';
const JARVIS_OLLAMA_MODEL = 'qwen2.5:0.5b-instruct';
const JARVIS_SYSTEM_PROMPT = [
  'Ты — JARVIS, встроенный текстовый ассистент лаунчера VerteX (Minecraft).',
  'Отвечай по-русски, кратко и по делу, нейтральным техническим тоном.',
  'Ты помогаешь: собрать модпак, проверить совместимость модов, найти моды в Modrinth,',
  'объяснить ошибки запуска игры и подсказать настройки.',
  'Также умеешь писать моды: команда «создай мод <название>» создаёт каркас Fabric-мода (Java + Gradle + fabric.mod.json) в папке jarvis-mods.',
  'Когда просишь написать код для мода — выдавай Java/Kotlin код в markdown-блоках ``` и объясняй, в какой файл положить.',
].join(' ');

async function fetchTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

async function jarvisAskOllama(messages) {
  const res = await fetchTimeout(JARVIS_OLLAMA_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: JARVIS_OLLAMA_MODEL, messages, stream: false }),
  }, 120000);
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  const text = data && data.message && data.message.content;
  if (!text || !String(text).trim()) throw new Error('Ollama: пустой ответ');
  return String(text).trim();
}

async function jarvisAskPollinations(messages) {
  const res = await fetchTimeout('https://text.pollinations.ai/openai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'openai-fast', messages, private: true }),
  }, 120000);
  if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
  const data = await res.json();
  const text = data && data.choices && data.choices[0] &&
    data.choices[0].message && data.choices[0].message.content;
  if (!text || !String(text).trim()) throw new Error('Pollinations: пустой ответ');
  return String(text).trim();
}

async function jarvisAskPollinationsText(messages) {
  // Тот же Pollinations, но другой маршрут: POST text-эндпойнт, ответ — обычный текст, не JSON.
  const res = await fetchTimeout('https://text.pollinations.ai/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'openai-fast', messages, private: true }),
  }, 120000);
  if (!res.ok) throw new Error(`Pollinations-Text HTTP ${res.status}`);
  const text = await res.text();
  if (!text || !String(text).trim() || /^\s*\{\s*\}\s*$/.test(text)) throw new Error('Pollinations-Text: пустой ответ');
  return String(text).trim();
}

async function jarvisAskDuckDuckGo(messages) {
  // DuckDuckGo AI Chat — без ключей. Двухшаговый: status -> x-vqd-4 -> chat (SSE).
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const st = await fetchTimeout('https://duckduckgo.com/duckchat/v1/status', {
    headers: { 'x-vqd-accept': '1', 'User-Agent': UA },
  }, 20000);
  const vqd = st.headers.get('x-vqd-4') || st.headers.get('x-vqd');
  if (!vqd) throw new Error('DDG: не выдан x-vqd-4 токен');
  const res = await fetchTimeout('https://duckduckgo.com/duckchat/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'x-vqd-4': vqd, 'User-Agent': UA,
      'Accept': 'text/event-stream', 'x-vqd-hash-1': '1',
    },
    body: JSON.stringify({ model: 'llama-3.3-70b', messages, stream: true }),
  }, 120000);
  if (!res.ok) throw new Error(`DDG HTTP ${res.status}`);
  const raw = await res.text();
  let text = '';
  for (const line of raw.split('\n')) {
    const trim = line.trim();
    if (!trim.startsWith('data:')) continue;
    const payload = trim.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const j = JSON.parse(payload);
      if (typeof j.message === 'string') text += j.message;
    } catch (_) { /* мусорная строка SSE — пропускаем */ }
  }
  if (!text.trim()) throw new Error('DDG: пустой ответ');
  return text.trim();
}

async function jarvisAskHackClub(messages) {
  // ai.hackclub.com — бесплатный OpenAI-совместимый шлюз без ключей.
  const res = await fetchTimeout('https://ai.hackclub.com/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  }, 120000);
  if (!res.ok) throw new Error(`HackClub HTTP ${res.status}`);
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text || !String(text).trim()) throw new Error('HackClub: пустой ответ');
  return String(text).trim();
}

ipcMain.handle('jarvis-chat', async (event, messages) => {
  const chat = [{ role: 'system', content: JARVIS_SYSTEM_PROMPT }]
    .concat(Array.isArray(messages) ? messages : []);
  const chain = [
    ['Ollama', () => jarvisAskOllama(chat)],
    ['Pollinations', () => jarvisAskPollinations(chat)],
    ['Pollinations-Text', () => jarvisAskPollinationsText(chat)],
    ['DuckDuckGo', () => jarvisAskDuckDuckGo(chat)],
    ['HackClub', () => jarvisAskHackClub(chat)],
  ];
  const errors = [];
  for (const [label, ask] of chain) {
    try { return await ask(); }
    catch (e) { errors.push(`${label}: ${e.message}`); }
  }
  throw new Error('Мозг недоступен (' + errors.join('; ') + '). ' +
    'Проверь интернет или запусти Ollama: ollama serve');
});

// ============================== JARVIS: каркас мода ==============================
// Команда «создай мод <название>» — агент генерирует готовый к сборке Fabric-проект
// (Gradle + fabric.mod.json + Java-входная точка) в <gamePath>/jarvis-mods/<modid>.
function httpsJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    try {
      const req = https.get(url, { timeout: timeoutMs || 10000 }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    } catch (e) { reject(e); }
  });
}

ipcMain.handle('jarvis-scaffold-mod', async (event, opts) => {
  try {
    const name = String((opts && opts.name) || '').trim();
    const gamePath = String((opts && opts.gamePath) || '').trim();
    const mcVersion = String((opts && opts.mcVersion) || '1.21.1').trim();
    if (!gamePath) return { success: false, error: 'Не указан путь к игре (gamePath)' };

    let modid = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'example_mod';
    if (/^\d/.test(modid)) modid = 'mod_' + modid; // id проекта должен начинаться с буквы
    const className = modid.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('') || 'ExampleMod';
    const pkg = 'com.vertex.' + modid;
    const major = (() => {
      const m = mcVersion.match(/^1\.(\d+)/);
      const mm = m ? parseInt(m[1], 10) : 21;
      if (mm >= 20 && !(mcVersion === '1.20.1' || mcVersion === '1.20.2' || mcVersion === '1.20.3' || mcVersion === '1.20.4')) return 21; // 1.20.5+
      if (mm >= 18) return 17;
      return 8;
    })();
    const optRelease = major >= 9 ? major : 8;

    // Свежие версии yarn/loader/fabric-api (meta.fabricmc.net / Modrinth), с проверенным fallback.
    let yarn = mcVersion + '+build.1';
    let loaderVer = '0.16.14';
    try {
      const y = await httpsJson(`https://meta.fabricmc.net/v2/versions/yarn/${encodeURIComponent(mcVersion)}?limit=1`, 10000);
      if (Array.isArray(y) && y[0] && y[0].version_number) yarn = y[0].version_number;
    } catch (_) {}
    try {
      const l = await httpsJson('https://meta.fabricmc.net/v2/versions/loader?limit=1', 10000);
      if (Array.isArray(l) && l[0] && l[0].version) loaderVer = l[0].version;
    } catch (_) {}
    let fabricApi = '0.116.1+1.21.1';
    try {
      const gv = JSON.stringify([mcVersion]);
      const ld = JSON.stringify(['fabric']);
      const f = await httpsJson(`https://api.modrinth.com/v2/project/fabric-api/version?game_versions=${encodeURIComponent(gv)}&loaders=${encodeURIComponent(ld)}`, 15000);
      if (Array.isArray(f) && f[0]) {
        const rel = f.find((v) => v.version_type === 'release') || f[0];
        fabricApi = rel.version_number;
      }
    } catch (_) {}

    const dir = path.join(gamePath, 'jarvis-mods', modid);
    const javaDir = path.join(dir, 'src', 'main', 'java', ...pkg.split('.'));
    fs.mkdirSync(javaDir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'main', 'resources'), { recursive: true });

    const files = {};

    files['gradle.properties'] =
`org.gradle.jvmargs=-Xmx1G
org.gradle.parallel=true

minecraft_version=${mcVersion}
yarn_mappings=${yarn}
loader_version=${loaderVer}
fabric_version=${fabricApi}

mod_version=1.0.0
maven_group=${pkg}
archives_base_name=${modid}
`;

    files['settings.gradle'] =
`pluginManagement {
	repositories {
		maven { name = 'Fabric'; url = 'https://maven.fabricmc.net/' }
		mavenCentral()
		gradlePluginPortal()
	}
}

rootProject.name = '${modid}'
`;

    files['build.gradle'] =
`plugins {
	id 'fabric-loom' version '1.7-SNAPSHOT'
	id 'maven-publish'
}

version = project.mod_version
group = project.maven_group

base {
	archivesName = project.archives_base_name
}

dependencies {
	minecraft "com.mojang:minecraft:\${project.minecraft_version}"
	mappings "net.fabricmc:yarn:\${project.yarn_mappings}:v2"
	modImplementation "net.fabricmc:fabric-loader:\${project.loader_version}"
	modImplementation "net.fabricmc.fabric-api:fabric-api:\${project.fabric_version}"
}

processResources {
	inputs.property "version", project.version
	filesMatching("fabric.mod.json") {
		expand "version": project.version
	}
}

tasks.withType(JavaCompile).configureEach {
	it.options.release = ${optRelease}
}

java {
	withSourcesJar()
	sourceCompatibility = JavaVersion.VERSION_${major === 8 ? 1 : major}
	targetCompatibility = JavaVersion.VERSION_${major === 8 ? 1 : major}
}
`;

    files[`src/main/resources/fabric.mod.json`] = JSON.stringify({
      schemaVersion: 1,
      id: modid,
      version: '${version}',
      name: name || modid,
      description: 'Каркас мода, создан агентом JARVIS в VerteX Launcher',
      authors: ['Grigory208'],
      license: 'MIT',
      environment: '*',
      entrypoints: { main: [pkg + '.' + className] },
      depends: {
        fabricloader: '>=' + loaderVer,
        fabric: '*',
        minecraft: '~' + mcVersion,
        java: '>=' + major,
      },
    }, null, 2);

    files[`src/main/java/${pkg.replace(/\./g, '/')}/${className}.java`] =
`package ${pkg};

import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ${className} implements ModInitializer {
	public static final String MOD_ID = "${modid}";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	@Override
	public void onInitialize() {
		LOGGER.info("[JARVIS] Мод {} инициализирован!", MOD_ID);
		// TODO: опиши здесь фичи мода. JARVIS в чате лаунчера подскажет код —
		// попроси «как сделать <фича> в fabric ${mcVersion}» и он выдаст готовый блок.
	}
}
`;

    for (const [rel, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, rel), content, 'utf8');
    }

    console.log(`[JARVIS] Каркас мода создан: ${dir}`);
    return {
      success: true,
      modid,
      dir,
      mcVersion,
      yarn,
      loaderVer,
      fabricApi,
      javaVersion: major,
      files: Object.keys(files),
    };
  } catch (e) {
    console.error('[JARVIS] Ошибка генерации каркаса мода:', e);
    return { success: false, error: e.message };
  }
});

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

    // Скин: локальный (Supabase, user skins / deep-link) через args.skinUrl.
    // Vercel-skin-server удален: отдавал фейковые текстуры ("texture/...").
    const tempSkinPath = path.join(app.getPath('temp'), `${username}_skin.png`);
    const skinUrlArg = args.skinUrl;
    if (skinUrlArg) {
        try {
            console.log(`[BACKEND] Применение скина из ${skinUrlArg}...`);
            await downloadFile(skinUrlArg, tempSkinPath);
            applyWideSkin(gameDirectory, tempSkinPath, packFormatFor(version));
            console.log('[BACKEND] ✅ Ресурсупаковка со скином сгенерирована и включена.');
        } catch (skinError) {
            console.error('[BACKEND] ❌ Не удалось применить скин:', skinError.message);
        }
    }
    // ⬆️ КОНЕЦ НОВОГО БЛОКА ⬆️

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

ipcMain.handle('apply-skin', async (event, { skinUrl, username, gamePath, mcVersion }) => {
  const gameDirectory = getGameDirectory(gamePath);
  const tempPath = path.join(app.getPath('temp'), `${username}_manual_skin.png`);
  try {
      await downloadFile(skinUrl, tempPath);
      applyWideSkin(gameDirectory, tempPath, packFormatFor(mcVersion));
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