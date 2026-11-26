package ru.vertex.skinbridge.mixin;

import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.util.DefaultSkinHelper;
import net.minecraft.client.util.SkinTextures;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import ru.vertex.skinbridge.Bridge;

/**
 * Перехватываем выбор скина любого игрока и для СВОЕГО (локального) игрока возвращаем
 * стандартный скин (DefaultSkinHelper) — тот, который ресурспак лаунчера уже перерисовал
 * нашим PNG. Серверные текстуры профиля (SkinsRestorer и т.п.) для себя игнорируем.
 */
@Mixin(AbstractClientPlayerEntity.class)
public abstract class AbstractClientPlayerEntityMixin {

    @Inject(method = "getSkinTextures", at = @At("HEAD"), cancellable = true)
    private void vertex$forceLauncherSkin(CallbackInfoReturnable<SkinTextures> cir) {
        AbstractClientPlayerEntity self = (AbstractClientPlayerEntity) (Object) this;
        if (Bridge.forceDefaultSkin(self)) {
            cir.setReturnValue(DefaultSkinHelper.getSkinTextures(self.getUuid()));
        }
    }
}
