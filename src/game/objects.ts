import Phaser from "phaser";
import type { CollectionConfig, ContainerConfig, Rarity } from "../../shared/types";

const RARITY_COLORS: Record<Rarity, number> = {
  blue: 0x5ba7ff,
  purple: 0xb983ff,
  gold: 0xffd54a,
  red: 0xff5964,
};

export class Loot extends Phaser.GameObjects.Image {
  readonly collection: CollectionConfig;
  readonly uid: string;
  private pulseScaleX = 1;
  private pulseScaleY = 1;
  private readonly targetY: number;
  private readonly glowOuter: Phaser.GameObjects.Arc;
  private readonly glowInner: Phaser.GameObjects.Arc;
  private readonly pickupReadyAt: number;

  constructor(scene: Phaser.Scene, x: number, y: number, collection: CollectionConfig, uid: string, pickupDelayMs = 350) {
    const dropStartY = y - 52;
    super(scene, x, dropStartY, `crop_collection_${collection.id}`);
    this.collection = collection;
    this.uid = uid;
    this.targetY = y;
    this.pickupReadyAt = scene.time.now + pickupDelayMs;
    scene.add.existing(this);
    this.setDepth(8);
    const lootWidth = collection.id === "maiden_pendant" ? 30 : 38;
    const ratio = this.height / this.width;
    this.setDisplaySize(lootWidth, lootWidth * ratio);
    this.pulseScaleX = this.scaleX;
    this.pulseScaleY = this.scaleY;
    this.setAlpha(0);

    const color = RARITY_COLORS[collection.rarity];
    this.glowOuter = scene.add.circle(x, dropStartY, 21, color, 0.10);
    this.glowOuter.setStrokeStyle(3, color, 0.72);
    this.glowOuter.setBlendMode(Phaser.BlendModes.ADD);
    this.glowOuter.setDepth(7);
    this.glowOuter.setAlpha(0);
    this.glowInner = scene.add.circle(x, dropStartY, 15, color, 0.16);
    this.glowInner.setStrokeStyle(2, color, 0.40);
    this.glowInner.setBlendMode(Phaser.BlendModes.ADD);
    this.glowInner.setDepth(7);
    this.glowInner.setAlpha(0);

    scene.tweens.add({
      targets: [this, this.glowOuter, this.glowInner],
      y: this.targetY,
      alpha: 1,
      duration: 480,
      ease: "Bounce.easeOut",
    });
  }

  canPickup(time: number): boolean {
    return time >= this.pickupReadyAt;
  }

  updateLoot(delta: number, time: number): void {
    const pulse = 1 + Math.sin(time / 240) * 0.08;
    this.setScale(this.pulseScaleX * pulse, this.pulseScaleY * pulse);
    this.glowOuter.setPosition(this.x, this.y);
    this.glowInner.setPosition(this.x, this.y);
    const glowPulse = 0.92 + Math.sin(time / 180) * 0.08;
    this.glowOuter.setScale(glowPulse);
    this.glowInner.setScale(glowPulse);
  }

  destroy(fromScene?: boolean): void {
    this.glowOuter?.destroy();
    this.glowInner?.destroy();
    super.destroy(fromScene);
  }
}

export class ContainerObject extends Phaser.GameObjects.Image {
  readonly config: ContainerConfig;
  readonly uid: string;
  openProgress = 0;
  openSeconds: number;
  isOpen = false;

  constructor(scene: Phaser.Scene, x: number, y: number, config: ContainerConfig, uid: string) {
    super(scene, x, y, `crop_container_${config.kind}`);
    this.config = config;
    this.uid = uid;
    this.openSeconds = config.openSeconds;
    scene.add.existing(this);
    this.setDepth(7);
    const containerWidth = config.kind === "small" ? 44 : 50;
    const ratio = this.height / this.width;
    this.setDisplaySize(containerWidth, containerWidth * ratio);
    this.setOrigin(0.5, 0.72);
  }

  updateContainer(delta: number, playerNear: boolean): void {
    if (this.isOpen) return;
    if (playerNear) {
      this.openProgress = Math.min(this.openSeconds, this.openProgress + delta / 1000);
      this.setTint(0xfff1a8);
    } else {
      this.clearTint();
    }
  }

  getProgress(): number {
    return Math.min(1, this.openProgress / this.openSeconds);
  }
}
