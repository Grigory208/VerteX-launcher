const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * Создает и включает ресурспак со скином (WIDE / STEVE).
 */
function applyWideSkin(gameDir, skinPath, packFormat = 15) {
    try {
        const zip = new AdmZip();

        // 1. Создаем файл pack.mcmeta
        const packMeta = {
            pack: {
                pack_format: packFormat,
                description: "My Custom Wide Skin"
            }
        };
        zip.addFile("pack.mcmeta", Buffer.from(JSON.stringify(packMeta, null, 2), "utf8"));

        // 2. Внутренний путь в архиве
        const internalPath = "assets/minecraft/textures/entity/player/wide/steve.png";
        
        // 3. Добавляем сам файл скина
        zip.addLocalFile(skinPath, path.dirname(internalPath), "steve.png");

        // 4. Сохраняем ZIP в папку resourcepacks
        const packName = "MyLocalSkin.zip";
        const packPath = path.join(gameDir, "resourcepacks", packName);
        
        if (!fs.existsSync(path.join(gameDir, "resourcepacks"))) {
            fs.mkdirSync(path.join(gameDir, "resourcepacks"), { recursive: true });
        }

        zip.writeZip(packPath);
        console.log(`[SkinManager] Ресурспак создан: ${packPath}`);

        // 5. Включаем ресурспак в options.txt
        enablePackInOptions(gameDir, packName);

    } catch (error) {
        console.error("[SkinManager] Ошибка при создании скина:", error);
    }
}

function enablePackInOptions(gameDir, packName) {
    const optionsPath = path.join(gameDir, "options.txt");
    
    if (!fs.existsSync(optionsPath)) {
        console.log("[SkinManager] options.txt не найден. Пак активируется при следующем запуске.");
        return;
    }

    let options = fs.readFileSync(optionsPath, "utf8");
    const packString = `"file/${packName}"`;

    if (options.includes(packString)) return;

    if (options.match(/resourcePacks:\[(.*?)\]/)) {
        options = options.replace(/resourcePacks:\[(.*?)\]/, (match, p1) => {
            if (p1.trim() === "") return `resourcePacks:[${packString}]`;
            return `resourcePacks:[${p1},${packString}]`;
        });
    } else {
        options += `\nresourcePacks:[${packString}]`;
    }

    fs.writeFileSync(optionsPath, options, "utf8");
    console.log(`[SkinManager] Ресурспак ${packName} включен в options.txt`);
}

module.exports = { applyWideSkin };