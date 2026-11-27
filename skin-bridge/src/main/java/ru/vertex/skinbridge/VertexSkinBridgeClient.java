package ru.vertex.skinbridge;

import net.fabricmc.api.ClientModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class VertexSkinBridgeClient implements ClientModInitializer {
    public static final Logger LOGGER = LoggerFactory.getLogger("vertexskinbridge");

    @Override
    public void onInitializeClient() {
        LOGGER.info("[VertexSkinBridge] активен: свой скин через vertex-skin/local.png, чужие — через сервер скинов VerteX.");
    }
}
