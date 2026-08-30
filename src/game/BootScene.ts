import Phaser from "phaser";
import { BUFFS, COLLECTIONS, CONTAINERS, ENEMIES, MAP_ASSET, PLAYER_FRAME_COUNT, PLAYER_FRAME_PREFIX, WEAPONS } from "../../shared/balance";
import { projectAsset } from "../core/assets";
import { GameBus } from "../core/EventBus";
import { createCroppedTexture, sourceBounds, unionBounds } from "./textures";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    this.load.image("map", projectAsset(MAP_ASSET));
    for (let i = 1; i <= PLAYER_FRAME_COUNT; i++) {
      this.load.image(`player_${i}`, projectAsset(`${PLAYER_FRAME_PREFIX}${String(i).padStart(2, "0")}.png`));
    }
    for (const [key, config] of Object.entries(ENEMIES)) {
      this.load.image(`enemy_${key}`, projectAsset(config.asset));
    }
    for (const [key, config] of Object.entries(WEAPONS)) {
      this.load.image(`weapon_${key}`, projectAsset(config.asset));
    }
    for (const collection of COLLECTIONS) {
      this.load.image(`collection_${collection.id}`, projectAsset(collection.asset));
    }
    this.load.image("container_small", projectAsset(CONTAINERS.small.asset));
    this.load.image("container_large", projectAsset(CONTAINERS.large.asset));
    this.load.image("military_shell", projectAsset("assets/bullets/军用炮弹.png"));
    for (let i = 1; i <= 9; i++) {
      this.load.image(`boom_${i}`, projectAsset(`assets/effects/boom/frames/爆炸特效_spritesheet_1_frame_${String(i).padStart(2, "0")}.png`));
    }
    for (let i = 1; i <= 11; i++) {
      this.load.image(`fire_${i}`, projectAsset(`assets/effects/shotfire/frames/喷火特效_spritesheet_1_frame_${String(i).padStart(2, "0")}.png`));
    }
    for (let i = 1; i <= 8; i++) {
      this.load.image(`burn_${i}`, projectAsset(`assets/effects/burn/frames/燃烧特效_spritesheet_1_frame_${String(i).padStart(2, "0")}.png`));
    }
    for (let i = 1; i <= 9; i++) {
      this.load.image(`arrow_${i}`, projectAsset(`assets/effects/firearrow/frames/火箭_spritesheet_1_frame_${String(i).padStart(2, "0")}.png`));
    }
  }

  create(): void {
    const frameBounds = Array.from({ length: PLAYER_FRAME_COUNT }, (_, index) => sourceBounds(this, `player_${index + 1}`));
    const playerUnion = unionBounds(frameBounds);
    for (let i = 1; i <= PLAYER_FRAME_COUNT; i++) {
      createCroppedTexture(this, `player_${i}`, `crop_player_${i}`, playerUnion);
    }
    for (const key of Object.keys(ENEMIES)) createCroppedTexture(this, `enemy_${key}`, `crop_enemy_${key}`);
    for (const key of Object.keys(WEAPONS)) createCroppedTexture(this, `weapon_${key}`, `crop_weapon_${key}`);
    for (const collection of COLLECTIONS) createCroppedTexture(this, `collection_${collection.id}`, `crop_collection_${collection.id}`);
    createCroppedTexture(this, "container_small", "crop_container_small");
    createCroppedTexture(this, "container_large", "crop_container_large");
    createCroppedTexture(this, "military_shell", "crop_military_shell");
    const boomBounds = Array.from({ length: 9 }, (_, i) => sourceBounds(this, `boom_${i + 1}`));
    const boomUnion = unionBounds(boomBounds);
    for (let i = 1; i <= 9; i++) createCroppedTexture(this, `boom_${i}`, `crop_boom_${i}`, boomUnion);
    const fireBounds = Array.from({ length: 11 }, (_, i) => sourceBounds(this, `fire_${i + 1}`));
    const fireUnion = unionBounds(fireBounds);
    for (let i = 1; i <= 11; i++) createCroppedTexture(this, `fire_${i}`, `crop_fire_${i}`, fireUnion);
    const burnBounds = Array.from({ length: 8 }, (_, i) => sourceBounds(this, `burn_${i + 1}`));
    const burnUnion = unionBounds(burnBounds);
    for (let i = 1; i <= 8; i++) createCroppedTexture(this, `burn_${i}`, `crop_burn_${i}`, burnUnion);
    const arrowBounds = Array.from({ length: 9 }, (_, i) => sourceBounds(this, `arrow_${i + 1}`));
    const arrowUnion = unionBounds(arrowBounds);
    for (let i = 1; i <= 9; i++) createCroppedTexture(this, `arrow_${i}`, `crop_arrow_${i}`, arrowUnion);
    this.createBulletTextures();
    this.createEffectAnimations();
    GameBus.emit("boot:ready", undefined);
  }

  private createEffectAnimations(): void {
    if (!this.anims.exists("boom_anim")) {
      this.anims.create({
        key: "boom_anim",
        frames: Array.from({ length: 9 }, (_, i) => ({ key: `crop_boom_${i + 1}` })),
        frameRate: 18,
        repeat: 0,
      });
    }
    if (!this.anims.exists("shotfire_anim")) {
      this.anims.create({
        key: "shotfire_anim",
        frames: Array.from({ length: 11 }, (_, i) => ({ key: `crop_fire_${i + 1}` })),
        frameRate: 18,
        repeat: -1,
      });
    }
    if (!this.anims.exists("burn_anim")) {
      this.anims.create({
        key: "burn_anim",
        frames: Array.from({ length: 8 }, (_, i) => ({ key: `crop_burn_${i + 1}` })),
        frameRate: 12,
        repeat: -1,
      });
    }
    if (!this.anims.exists("firearrow_anim")) {
      this.anims.create({
        key: "firearrow_anim",
        frames: Array.from({ length: 9 }, (_, i) => ({ key: `crop_arrow_${i + 1}` })),
        frameRate: 14,
        repeat: -1,
      });
    }
  }

  private createBulletTextures(): void {
    const specs = [
      { key: "bullet_g18", color: 0xffd54a, width: 14, height: 4 },
      { key: "bullet_uzi", color: 0x38e3c0, width: 10, height: 3 },
      { key: "bullet_f12", color: 0x62d76a, width: 16, height: 5 },
      { key: "bullet_akm", color: 0xff9c3f, width: 16, height: 5 },
      { key: "bullet_awm", color: 0xff3b3b, width: 24, height: 6 },
      { key: "enemy_bullet", color: 0xf4d23c, width: 10, height: 4 },
      { key: "shield_wave", color: 0xe76f51, width: 18, height: 10 },
      { key: "rocket", color: 0xff5522, width: 18, height: 8 },
      { key: "flame", color: 0xff9f43, width: 14, height: 6 },
    ];
    for (const { key, color, width, height } of specs) {
      const g = this.add.graphics();
      g.fillStyle(color, 1);
      g.fillRect(0, 0, width, height);
      g.fillStyle(0xffffff, 0.65);
      g.fillRect(2, Math.floor(height / 2) - 1, Math.max(2, Math.floor(width / 2)), 2);
      g.generateTexture(key, width, height);
      g.destroy();
    }
  }
}
