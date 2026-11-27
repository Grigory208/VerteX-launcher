package ru.vertex.skinbridge;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.client.util.DefaultSkinHelper;
import net.minecraft.client.util.SkinTextures;
import net.minecraft.util.Identifier;

import java.io.ByteArrayInputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.RecordComponent;
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
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Инектор скинов для ЧУЖИХ игроков.
 *
 * Вся цепочка провайдеров живёт на сервере скинов VerteX (Express):
 *   GET {skinServer}/skin/<ник> → PNG + заголовок X-Vertex-Skin-Model (classic|slim)
 * Сервер сам по порядку пробует: свою базу (игроки VerteX) → Mojang → внешние
 * хостинги (ely.by, mc-heads, minotar). Мод ходит только на наш сервер.
 *
 * Версионная устойчивость: НЕ используем authlib (GameProfile — его API меняется
 * между версиями MC, что валило игру NoSuchMethodError на 1.21.11). Ник — через
 * Entity#getName(). Проверка «это дефолтный Стив» — сравнением с DefaultSkinHelper.
 * Новый SkinTextures собираем рефлексией по структуре record'а, т.к. набор
 * компонентов меняется между версиями. Любая ошибка — тихо пропускаем игрока
 * (остаётся Стив), НИКОГДА не роняем игру.
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
     * @param current то, что ванила собралась вернуть (дефолтный Стив для оффлайн-профилей).
     * @return новые SkinTextures, если для игрока уже скачан скин; иначе null (оставляем как есть).
     */
    public static SkinTextures resolve(AbstractClientPlayerEntity player, SkinTextures current) {
        try {
            if (player == null || current == null) return null;
            if (player == MinecraftClient.getInstance().player) return null; // свой игрок — через local.png
            // Трогаем только дефолтных Стивов: если сервер/ваниля уже дали настоящий скин — не мешаем.
            if (!isDefaultSkin(player.getUuid(), current)) return null;
            loadConfig();
            if (serverBase == null) return null;
            String name = player.getName().getString(); // Entity#getName, authlib не трогаем
            if (name == null || name.isEmpty() || name.length() > 16) return null;

            SkinTextures ready = resolved.get(name);
            if (ready != null) return ready;
            Long f = failed.get(name);
            if (f != null && System.currentTimeMillis() - f < NEGATIVE_TTL_MS) return null;
            if (pending.add(name)) {
                EXEC.execute(() -> fetch(name, current));
            }
            return null;
        } catch (Throwable t) {
            // Несовместимость версии и т.п. — игрок остаётся Стивом, но игра НЕ падает.
            return null;
        }
    }

    /** Дефолтный ли это скин (Steve/Alex из DefaultSkinHelper) — значит сервер не прислал текстуры. */
    private static boolean isDefaultSkin(UUID uuid, SkinTextures current) throws Throwable {
        try {
            Identifier def = DefaultSkinHelper.getSkinTextures(uuid).texture();
            Identifier cur = current.texture();
            return cur != null && cur.equals(def);
        } catch (Throwable t) {
            // Не смогли сравнить — перебивать не рискуем.
            return false;
        }
    }

    /** Фоновый поток: качает PNG через наш сервер; текстуру регистрируем на render-потоке. */
    private static void fetch(String name, SkinTextures template) {
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
            MinecraftClient.getInstance().execute(() -> apply(name, template, image, modelHeader));
        } catch (Throwable t) {
            failed.put(name, System.currentTimeMillis());
            VertexSkinBridgeClient.LOGGER.warn("[VertexSkinBridge] скин для {} не скачан: {}", name, t.toString());
        }
    }

    /** Только render-поток: GL-текстуры нельзя создавать из фоновых потоков. */
    private static void apply(String name, SkinTextures template, NativeImage image, String modelHeader) {
        try {
            NativeImageBackedTexture texture = new NativeImageBackedTexture(image);
            Identifier id = MinecraftClient.getInstance().getTextureManager()
                    .registerDynamicTexture("vertexskinbridge", texture);
            boolean slim = "slim".equalsIgnoreCase(modelHeader);
            SkinTextures patched = withTextureAndModel(template, id, slim);
            if (patched == null) {
                failed.put(name, System.currentTimeMillis());
                VertexSkinBridgeClient.LOGGER.warn("[VertexSkinBridge] не смог собрать SkinTextures для {} (форма record'а не узнаана)", name);
                return;
            }
            resolved.put(name, patched);
            VertexSkinBridgeClient.LOGGER.info("[VertexSkinBridge] скин {} применён ({}).", name, slim ? "slim" : "classic");
        } catch (Throwable t) {
            failed.put(name, System.currentTimeMillis());
            VertexSkinBridgeClient.LOGGER.warn("[VertexSkinBridge] скин {} не применён: {}", name, t.toString());
        } finally {
            pending.remove(name);
        }
    }

    /**
     * Копия record'а SkinTextures с заменённой текстурой и моделью, без привязки
     * к конкретному набору компонентов (он меняется между версиями MC).
     */
    private static SkinTextures withTextureAndModel(SkinTextures template, Identifier texId, boolean slim) {
        try {
            RecordComponent[] comps = SkinTextures.class.getRecordComponents();
            if (comps == null) return null;
            Class<?>[] types = new Class<?>[comps.length];
            Object[] args = new Object[comps.length];
            boolean textureReplaced = false, modelReplaced = false;
            for (int i = 0; i < comps.length; i++) {
                types[i] = comps[i].getType();
                Object v = comps[i].getAccessor().invoke(template);
                Class<?> t = comps[i].getType();
                if (t == Identifier.class && texId.equals(v)) {
                    args[i] = texId;
                    textureReplaced = true;
                } else if (t.isEnum() && t.getSimpleName().equals("Model")) {
                    Object m = pickModel(t, slim);
                    if (m == null) return null;
                    args[i] = m;
                    modelReplaced = true;
                } else {
                    args[i] = v;
                }
            }
            if (!textureReplaced || !modelReplaced) return null;
            Constructor<?> ctor = SkinTextures.class.getDeclaredConstructor(types);
            ctor.setAccessible(true);
            return (SkinTextures) ctor.newInstance(args);
        } catch (Throwable t) {
            return null;
        }
    }

    /** Константа enum'а модели: SLIM при slim, иначе WIDE (1.21.1+) или CLASSIC (старые). */
    private static Object pickModel(Class<?> enumClass, boolean slim) {
        Object[] constants = enumClass.getEnumConstants();
        if (constants == null || constants.length == 0) return null;
        if (slim) {
            for (Object c : constants) {
                if (((Enum<?>) c).name().equals("SLIM")) return c;
            }
        } else {
            for (String want : new String[]{"WIDE", "CLASSIC"}) {
                for (Object c : constants) {
                    if (((Enum<?>) c).name().equals(want)) return c;
                }
            }
        }
        return constants[0];
    }
}
