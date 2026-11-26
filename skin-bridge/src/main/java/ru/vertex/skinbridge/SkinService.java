package ru.vertex.skinbridge;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.client.util.SkinTextures;
import net.minecraft.util.Identifier;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Инектор скинов для ЧУЖИХ игроков.
 *
 * Вся цепочка провайдеров живёт на сервере скинов VerteX (Express на Vercel):
 *   GET {skinServer}/skin/<ник> → PNG + заголовок X-Vertex-Skin-Model (classic|slim)
 * Сервер сам по порядку пробует: свою базу (игроки VerteX) → Mojang → внешние
 * хостинги (ely.by, mc-heads, minotar). Мод ходит только на наш сервер.
 *
 * Механика: mixin вызывает {@link #resolve} на render-потоке. Пока скин не скачан —
 * игрок остаётся Стивом (как в ваниле на оффлайн-серверах). Когда скачан — регистрируем
 * динамическую текстуру и дальше отдаём её из кэша. Если сервер уже прислал для
 * профиля свой скин (SkinsRestorer и т.п.) — не трогаем.
 */
public final class SkinService {
    private static final long NEGATIVE_TTL_MS = 10 * 60 * 1000L; // после неудачи не дёргаем сервер 10 минут
    private static final Gson GSON = new Gson();
    private static final ExecutorService EXEC = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "vertex-skin-fetcher");
        t.setDaemon(true);
        return t;
    });
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private static volatile String serverBase;
    private static final Map<String, SkinTextures> resolved = new ConcurrentHashMap<>();
    private static final Map<String, Long> failed = new ConcurrentHashMap<>();
    private static final Set<String> pending = ConcurrentHashMap.newKeySet();
    private static boolean configLoaded;

    private SkinService() { }

    private static void loadConfig() {
        if (configLoaded) return;
        synchronized (SkinService.class) {
            if (configLoaded) return;
            try {
                Path cfg = FabricLoader.getInstance().getGameDir()
                        .resolve("vertex-skin").resolve("config.json");
                if (Files.isRegularFile(cfg)) {
                    JsonObject o = GSON.fromJson(Files.readString(cfg, StandardCharsets.UTF_8), JsonObject.class);
                    if (o != null && o.has("skinServer")) {
                        String base = o.get("skinServer").getAsString().trim();
                        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
                        serverBase = base.isEmpty() ? null : base;
                    }
                }
            } catch (Exception e) {
                VertexSkinBridgeClient.LOGGER.warn("[VertexSkinBridge] config.json не прочитан: {}", e.toString());
            }
            configLoaded = true;
        }
        if (serverBase != null) {
            VertexSkinBridgeClient.LOGGER.info("[VertexSkinBridge] сервер скинов: {}", serverBase);
        }
    }

    /**
     * Вызывается из mixin на render-потоке для каждого игрока.
     * @return новые SkinTextures, если для игрока уже скачан скин; иначе null (оставляем как есть).
     */
    public static SkinTextures resolve(AbstractClientPlayerEntity player) {
        if (player == null || player == MinecraftClient.getInstance().player) return null;
        // Сервер/ваниль уже прислали текстуры профиля — не мешаем.
        if (player.getGameProfile().getProperties().containsKey("textures")) return null;
        loadConfig();
        if (serverBase == null) return null;
        String name = player.getGameProfile().getName();
        if (name == null || name.isEmpty() || name.length() > 16) return null;

        SkinTextures ready = resolved.get(name);
        if (ready != null) return ready;
        Long f = failed.get(name);
        if (f != null && System.currentTimeMillis() - f < NEGATIVE_TTL_MS) return null;
        if (pending.add(name)) {
            EXEC.execute(() -> fetch(name));
        }
        return null;
    }

    /** Фоновый поток: качает PNG через наш сервер; текстуру регистрируем на render-потоке. */
    private static void fetch(String name) {
        try {
            String url = serverBase + "/skin/" + URLEncoder.encode(name, StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(8))
                    .header("Accept", "image/png")
                    .GET()
                    .build();
            HttpResponse<byte[]> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofByteArray());
            if (resp.statusCode() != 200) {
                failed.put(name, System.currentTimeMillis());
                if (resp.statusCode() != 404) {
                    VertexSkinBridgeClient.LOGGER.warn("[VertexSkinBridge] сервер скинов: HTTP {} для {}", resp.statusCode(), name);
                }
                return;
            }
            byte[] body = resp.body();
            if (body == null || body.length < 70) {
                failed.put(name, System.currentTimeMillis());
                return;
            }
            String modelHeader = resp.headers().firstValue("X-Vertex-Skin-Model").orElse("classic");
            NativeImage image = NativeImage.read(new ByteArrayInputStream(body));
            MinecraftClient.getInstance().execute(() -> apply(name, image, modelHeader));
        } catch (Exception e) {
            failed.put(name, System.currentTimeMillis());
            VertexSkinBridgeClient.LOGGER.warn("[VertexSkinBridge] скин для {} не скачан: {}", name, e.toString());
        }
    }

    /** Только render-поток: GL-текстуры нельзя создавать из фоновых потоков. */
    private static void apply(String name, NativeImage image, String modelHeader) {
        try {
            NativeImageBackedTexture texture = new NativeImageBackedTexture(image);
            Identifier id = MinecraftClient.getInstance().getTextureManager()
                    .registerDynamicTexture("vertexskinbridge", texture);
            SkinTextures.Model model = "slim".equalsIgnoreCase(modelHeader)
                    ? SkinTextures.Model.SLIM
                    : SkinTextures.Model.CLASSIC;
            resolved.put(name, new SkinTextures(id, null, null, null, model, false));
            VertexSkinBridgeClient.LOGGER.info("[VertexSkinBridge] скин {} применён ({}).", name, model);
        } catch (Exception e) {
            failed.put(name, System.currentTimeMillis());
            VertexSkinBridgeClient.LOGGER.warn("[VertexSkinBridge] скин {} не применён: {}", name, e.toString());
        } finally {
            pending.remove(name);
        }
    }
}
