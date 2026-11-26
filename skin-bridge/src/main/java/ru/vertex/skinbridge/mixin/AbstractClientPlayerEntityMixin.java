package ru.vertex.skinbridge.mixin;

import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.util.DefaultSkinHelper;
import net.minecraft.client.util.SkinTextures;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import ru.vertex.skinbridge.Bridge;
import ru.vertex.skinbridge.SkinService;

/**
 * 1) СВОЙ игрок: лаунчер положил vertex-skin/local.png — форсим стандартный скин,
 *    который ресурспак MyLocalSkin.zip уже перерисовал нашим PNG (перебивает SkinsRestorer).
 * 2) ЧУЖИЕ игроки без серверных текстур: инектор через SkinService — скин качается
 *    с сервера скинов VerteX (свой серв → Mojang → внешние хостинги).
 */
@Mixin(AbstractClientPlayerEntity.class)
public abstract class AbstractClientPlayerEntityMixin {

    @Inject(method = "getSkinTextures", at = @At("HEAD"), cancellable = true)
    private void vertex$injectSkins(CallbackInfoReturnable<SkinTextures> cir) {
        AbstractClientPlayerEntity self = (AbstractClientPlayerEntity) (Object) this;
        if (Bridge.forceDefaultSkin(self)) {
            cir.setReturnValue(DefaultSkinHelper.getSkinTextures(self.getUuid()));
            return;
        }
        SkinTextures injected = SkinService.resolve(self);
        if (injected != null) {
            cir.setReturnValue(injected);
        }
    }
}
