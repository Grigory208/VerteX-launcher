package ru.vertex.skinbridge;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayer;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Мост скина лаунчера VerteX.
 *
 * Лаунчер при запуске кладёт выбранный скин в <gameDir>/vertex-skin/local.png и одновременно
 * собирает ресурспак MyLocalSkin.zip, который перерисовывает СТАНДАРТНЫЕ скины (steve/alex).
 *
 * На серверах со скин-плагином (SkinsRestorer и т.п.) сервер присылает для нашего профиля
 * свою текстуру — и клиент использует её, игнорируя ресурспак. Этот мост возвращает для
 * СВОЕГО игрока стандартный скин (DefaultSkinHelper), который ресурспак уже заменил нашим
 * PNG. Итог: свой скин виден на любом сервере, ничего не качается и не подменяется в сети.
 */
public final class Bridge {
    private static final long RECHECK_MS = 1000;
    private static long lastCheck;
    private static boolean hasSkinFile;

    private Bridge() { }

    /** true — форсим стандартный скин для локального игрока (когда лаунчер положил скин). */
    public static boolean forceDefaultSkin(AbstractClientPlayer player) {
        if (player == null || player != MinecraftClient.getInstance().player) {
            return false;
        }
        long now = System.currentTimeMillis();
        if (now - lastCheck >= RECHECK_MS) {
            Path marker = FabricLoader.getInstance().getGameDir()
                    .resolve("vertex-skin").resolve("local.png");
            hasSkinFile = Files.isRegularFile(marker);
            lastCheck = now;
        }
        return hasSkinFile;
    }
}
