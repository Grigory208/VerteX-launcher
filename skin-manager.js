const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * pack_format ресурсупаковок по версии MC (minecraft.wiki / pack format).
 * Для 1.20.2+ дополнительно пишем supported_formats (диапазон), чтобы пак
 * принимался любой новой версией без предупреждений.
 */
function packFormatFor(mcVersion) {
    const m = String(mcVersion || '').match(/^1\.(\d+)(?:\.(\d+))?/);
    if (!m) return 15;
    const minor = parseInt(m[1], 10);
    const patch = parseInt(m[2] || '0', 10);
    if (minor === 15) return 5;           // 1.15
    if (minor === 16) return patch >= 2 ? 6 : 5;
    if (minor === 17) return 7;
    if (minor === 18) return 8;
    if (minor === 19) return patch === 3 ? 12 : patch >= 4 ? 13 : 9;
    if (minor === 20) {
        if (patch <= 1) return 15;
        if (patch === 2) return 18;
        if (patch <= 4) return 22;
        return 32;                         // 1.20.5 / 1.20.6
    }
    if (minor === 21) {
        if (patch <= 1) return 34;
        if (patch <= 3) return 42;         // 1.21.2 / 1.21.3
        if (patch === 4) return 46;
        if (patch === 5) return 55;
        if (patch === 6) return 63;
        if (patch <= 8) return 64;         // 1.21.7 / 1.21.8
        if (patch <= 10) return 69;        // 1.21.9 / 1.21.10
        return 75;                         // 1.21.11+
    }
    return 75; // новые (26.x) — продолжение нумерации
}

/**
 * Создает и включает ресурсупаковку со скином (WIDE / STEVE).
 */
// Диагностика: проверить, что файл — валидный PNG правильного размера.
// Игра молча игнорирует кривой PNG, и без этой проверки мы не узнаём, где рвётся цепочка.
function pngInfo(file) {
    try {
        const b = fs.readFileSync(file);
        const isPng = b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
        const w = isPng ? b.readUInt32BE(16) : 0;
        const h = isPng ? b.readUInt32BE(20) : 0;
        const verdict = !isPng ? '⚠️ ЭТО НЕ PNG — игра его молча отбросит'
            : (w === 64 && (h === 32 || h === 64)) || (w === 128 && h === 128)
                ? 'формат ок'
                : `⚠️ нестандартный размер — ожидается 64x32/64x64, игра может не отрисовать скин`;
        console.log(`[SkinManager] PNG скина: ${w}x${h}, ${b.length} Б — ${verdict}`);
        return { ok: isPng, w, h, size: b.length };
    } catch (e) {
        console.error(`[SkinManager] Не прочитал PNG скина (${file}): ${e.message}`);
        return { ok: false, w: 0, h: 0, size: 0 };
    }
}

function applyWideSkin(gameDir, skinPath, packFormat) {
    try {
        const info = pngInfo(skinPath);
        const fmt = packFormat || packFormatFor('');

        // pack.mcmeta: точный формат + широкий диапазон supported_formats (1.20.2+)
        const pack = { pack_format: fmt, description: 'VerteX Local Skin' };
        if (fmt >= 18) pack.supported_formats = { min_inclusive: fmt, max_inclusive: 999 };
        const packMeta = { pack };

        const zip = new AdmZip();
        zip.addFile('pack.mcmeta', Buffer.from(JSON.stringify(packMeta, null, 2), 'utf8'));

        // С 1.19.3 скины игрока лежат textures/entity/player/{wide|slim}/{steve|alex}.png.
        // Какой из них отрендерится — решает хэш UUID (DefaultPlayerSkin), поэтому
        // переопределяем ВСЕ 4 комбинации, иначе у половины юзеров скин не применится.
        for (const dir of ['wide', 'slim']) {
          for (const name of ['steve', 'alex']) {
            zip.addLocalFile(skinPath, `assets/minecraft/textures/entity/player/${dir}`, `${name}.png`);
          }
        }
        // До 1.19.3 скины лежали в textures/entity/{steve|alex}.png — добавляем и туда,
        // лишние пути новые версии просто игнорируют.
        for (const name of ['steve', 'alex']) {
          zip.addLocalFile(skinPath, 'assets/minecraft/textures/entity', `${name}.png`);
        }

        const packName = 'MyLocalSkin.zip';
        const packsDir = path.join(gameDir, 'resourcepacks');
        if (!fs.existsSync(packsDir)) fs.mkdirSync(packsDir, { recursive: true });
        const packPath = path.join(packsDir, packName);
        zip.writeZip(packPath);
        console.log(`[SkinManager] Ресурсупаковка создана: ${packPath} (pack_format ${fmt}, записей в zip: ${zip.getEntries().length}, скин ${info.w}x${info.h}:${info.ok ? 'ok' : 'БИТЫЙ'})`);

        enablePackInOptions(gameDir, packName);
    } catch (error) {
        console.error('[SkinManager] Ошибка при создании скина:', error);
    }
}

function enablePackInOptions(gameDir, packName) {
    const optionsPath = path.join(gameDir, 'options.txt');
    const packString = `"file/${packName}"`;

    // options.txt может отсутствовать при первом запуске — тогда игра стартует
    // без нашего пака. Создаем минимальный файл сами.
    if (!fs.existsSync(optionsPath)) {
        fs.writeFileSync(optionsPath, `resourcePacks:[${packString}]\n`, 'utf8');
        console.log('[SkinManager] options.txt создан с активным паком скина');
        return;
    }

    let options = fs.readFileSync(optionsPath, 'utf8');
    if (options.includes(packString)) return;

    if (options.match(/resourcePacks:\[(.*?)\]/)) {
        options = options.replace(/resourcePacks:\[(.*?)\]/, (match, p1) => {
            if (p1.trim() === '') return `resourcePacks:[${packString}]`;
            return `resourcePacks:[${p1},${packString}]`;
        });
    } else {
        options += `\nresourcePacks:[${packString}]`;
    }

    fs.writeFileSync(optionsPath, options, 'utf8');
    console.log(`[SkinManager] Ресурсупаковка ${packName} включена в options.txt`);
}

module.exports = { applyWideSkin, packFormatFor };
