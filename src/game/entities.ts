import Phaser from "phaser";
import type { EnemyConfig, WeaponInstance, WeaponKind } from "../../shared/types";
import { getWeaponConfig, getWeaponStats } from "../../shared/calculations";
import { DAM_BOTTOM_Y } from "../../shared/map";
import { store } from "../core/RunStore";

export class Player extends Phaser.Physics.Arcade.Sprite {
  private animTimer = 0;
  private frameIndex = 0;
  private moveTime = 0;
  hp = 100;
  armor = 60;
  maxHp = 100;
  maxArmor = 60;
  speed = 220;
  targetScale = 1;
  respawnArmorTimer = 0;
  private baseWidth = 64;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "crop_player_1");
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(20);
    this.setDisplaySize(this.baseWidth, this.baseWidth * (this.height / this.width));
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(15, this.displayWidth / 2 - 15, this.displayHeight / 2 - 15);
    body.setCollideWorldBounds(true);
  }

  updatePlayer(delta: number, keys: { up: boolean; down: boolean; left: boolean; right: boolean }): void {
    this.setStateFromStore();
    let dx = 0;
    let dy = 0;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;
    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;
    const len = Math.hypot(dx, dy) || 1;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const minAllowedY = DAM_BOTTOM_Y + 20;
    let vy = (dy / len) * this.speed;
    if (dy < 0 && this.y <= minAllowedY) vy = 0;
    body.setVelocity((dx / len) * this.speed, vy);
    if (dx !== 0) this.setFlipX(dx < 0);

    this.animTimer += delta;
    this.moveTime += delta;
    const frameMs = 500 / 11;
    if (this.animTimer >= frameMs) {
      this.animTimer -= frameMs;
      this.frameIndex = (this.frameIndex + 1) % 11;
      this.setTexture(`crop_player_${this.frameIndex + 1}`);
    }

    const bob = Math.sin(this.moveTime * 0.008) * 0.03;
    const ratio = this.height / this.width;
    this.setDisplaySize(this.baseWidth * (1 + bob), this.baseWidth * (1 + bob) * ratio);
    this.setOrigin(0.5, 0.8);
  }

  setStateFromStore(): void {
    const state = store.getState();
    this.maxHp = state.maxHp;
    this.maxArmor = state.maxArmor;
    this.hp = state.currentHp;
    this.armor = state.currentArmor;
    this.speed = state.moveSpeed;
  }

  syncToStore(): void {
    const state = store.getState();
    state.currentHp = this.hp;
    state.currentArmor = this.armor;
  }

  applyDamage(amount: number): boolean {
    const armorDamage = Math.min(this.armor, amount);
    this.armor -= armorDamage;
    const hpDamage = Math.max(0, amount - armorDamage);
    this.hp -= hpDamage;
    if (this.hp < 0) this.hp = 0;
    this.syncToStore();
    return this.hp <= 0;
  }

  setTargetScale(scale: number): void {
    this.targetScale = scale;
  }
}

export interface EnemyFireEvent {
  enemy: Enemy;
  angle: number;
  distance: number;
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly id: string;
  readonly kind: string;
  readonly config: EnemyConfig;
  hp: number;
  maxHp: number;
  baseSpeed: number;
  speedMultiplier = 1;
  speed: number;
  attackRange: number;
  damage: number;
  fireRate: number;
  attackCooldown: number;
  stunTimer = 0;
  stunImmuneTimer = 0;
  burnStacks = 0;
  burnTimer = 0;
  burnTickTimer = 0;
  burnImmuneTimer = 0;
  flameTickTimer = 0;
  burnStatusToken = 0;
  freezeStatusToken = 0;
  freezeStacks = 0;
  freezeTimer = 0;
  freezeImmuneTimer = 0;
  private pulseTime = Math.random() * 1000;
  private inBossPhase = 0;
  private baseScaleX = 1;
  private baseScaleY = 1;
  readonly shadow: Phaser.GameObjects.Ellipse;
  private shadowWidth = 1;
  private shadowHeight = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: string, config: EnemyConfig, multipliers: { hp: number; damage: number; fireRate: number; moveSpeed: number }) {
    super(scene, x, y, `crop_enemy_${kind}`);
    this.id = `enemy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.kind = kind;
    this.config = config;
    this.maxHp = Math.round(config.baseHp * multipliers.hp);
    this.hp = this.maxHp;
    this.baseSpeed = config.moveSpeed * multipliers.moveSpeed;
    this.speed = this.baseSpeed;
    this.attackRange = config.range;
    this.damage = config.damage * multipliers.damage;
    this.fireRate = config.fireRate * multipliers.fireRate;
    this.attackCooldown = 0.2 + Math.random() * 0.5;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(config.isBoss ? 30 : 15);
    const targetWidth = config.isBoss ? 64 : config.kind === "flamer" ? 52 : config.kind === "shield" ? 46 : config.kind === "rocket" ? 58 : config.kind === "gunner" ? 50 : 34;
    const ratio = this.height / this.width;
    this.setDisplaySize(targetWidth, targetWidth * ratio);
    this.setOrigin(0.5, 0.82);
    this.baseScaleX = this.scaleX;
    this.baseScaleY = this.scaleY;
    this.shadowWidth = targetWidth * 1.15;
    this.shadowHeight = targetWidth * 0.36;
    this.shadow = scene.add.ellipse(x, y, this.shadowWidth, this.shadowHeight, 0x000000, 0.34).setDepth(4);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(config.radius, this.displayWidth / 2 - config.radius, this.displayHeight / 2 - config.radius);
    body.setCollideWorldBounds(true);
    this.setPosition(x, y);
  }

  getTargetScale(): number {
    return this.config.isBoss ? 0.055 : 0.08;
  }

  updateAI(time: number, delta: number, player: Player, onFire: (event: EnemyFireEvent) => void): void {
    const seconds = delta / 1000;
    if (!this.active || !this.visible || !(this.hp > 0)) {
      const body = this.body as Phaser.Physics.Arcade.Body | null;
      if (body) {
        body.setVelocity(0, 0);
        body.enable = false;
      }
      this.setActive(false);
      this.setVisible(false);
      this.setAlpha(0);
      this.shadow?.setVisible(false);
      return;
    }
    this.pulseTime += delta;
    if (this.stunTimer > 0) {
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      return;
    }
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const dirX = dx / dist;
    const dirY = dy / dist;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const desired = this.config.kind === "shield" ? this.attackRange * 0.88 : this.config.kind === "flamer" ? this.attackRange * 0.82 : this.attackRange * 0.78;
    if (dist > desired) {
      body.setVelocity(dirX * this.baseSpeed * this.speedMultiplier, dirY * this.baseSpeed * this.speedMultiplier);
    } else {
      const strafe = Math.sin(this.pulseTime * 0.002) * 0.35;
      body.setVelocity(-dirY * this.baseSpeed * this.speedMultiplier * strafe, dirX * this.baseSpeed * this.speedMultiplier * strafe);
    }
    this.setFlipX(dirX < 0);
    const breath = 1 + 0.12 * Math.max(0, Math.sin(this.pulseTime * 0.0105));
    this.setScale(this.baseScaleX * breath, this.baseScaleY * breath);
    this.shadow.setPosition(this.x, this.y + this.displayHeight * 0.32);
    this.shadow.setScale(breath, breath);

    if (dist <= this.attackRange && this.attackCooldown <= 0) {
      this.attackCooldown = 1 / this.fireRate;
      onFire({ enemy: this, angle: Math.atan2(dy, dx), distance: dist });
    } else {
      this.attackCooldown -= seconds;
    }
  }

  applyDamage(amount: number): number {
    const actual = this.config.kind === "shield" ? amount * 0.35 : amount;
    this.hp -= actual;
    return actual;
  }

  destroy(fromScene?: boolean): void {
    this.shadow?.destroy();
    super.destroy(fromScene);
  }

  beginBossPhase(): number {
    const ratio = this.hp / this.maxHp;
    const phase = ratio > 0.75 ? 0 : ratio > 0.4 ? 1 : 2;
    if (this.config.isBoss && phase > this.inBossPhase) this.inBossPhase = phase;
    return this.inBossPhase;
  }
}

export class WeaponMount extends Phaser.GameObjects.Container {
  readonly configKey: string;
  readonly weapon: WeaponInstance;
  readonly image: Phaser.GameObjects.Image;
  aimAngle = -Math.PI / 2;
  cooldown: number;
  stats: ReturnType<typeof getWeaponStats>;
  orbitAngle = 0;
  serial: number;
  private followX = 0;
  private followY = 0;
  private initialized = false;

  constructor(scene: Phaser.Scene, weapon: WeaponInstance, serial: number, orbitAngle: number) {
    super(scene, 0, 0);
    this.configKey = weapon.kind;
    this.weapon = weapon;
    this.serial = serial;
    this.orbitAngle = orbitAngle;
    this.stats = getWeaponStats(weapon, store.getState().buffs);
    this.cooldown = Math.random() * (1 / Math.max(0.1, this.stats.fireRate));
    const config = getWeaponConfig(weapon.kind);
    this.image = scene.add.image(0, 0, `crop_weapon_${config.kind}`);
    const weaponRatio = this.image.height / this.image.width;
    const weaponWidths: Record<WeaponKind, number> = { g18: 54, uzi: 70, akm: 82, awm: 96 };
    this.image.setDisplaySize(weaponWidths[weapon.kind], weaponWidths[weapon.kind] * weaponRatio);
    this.image.setOrigin(0.25, 0.5);
    this.add(this.image);
    scene.add.existing(this);
    this.setDepth(22);
  }

  updateMount(player: Player, count: number, delta: number, radius = 58): void {
    const angle = (Math.PI * 2 * this.serial) / Math.max(1, count) - Math.PI / 2;
    const targetX = player.x + Math.cos(angle) * radius;
    const targetY = player.y + Math.sin(angle) * radius;
    if (!this.initialized) {
      this.followX = targetX;
      this.followY = targetY;
      this.initialized = true;
    } else {
      const follow = 1 - Math.exp(-4.2 * (delta / 1000));
      this.followX = Phaser.Math.Linear(this.followX, targetX, follow);
      this.followY = Phaser.Math.Linear(this.followY, targetY, follow);
    }
    this.setPosition(this.followX, this.followY);
    this.stats = getWeaponStats(this.weapon, store.getState().buffs);
  }

  aim(at: { x: number; y: number }, delta: number): void {
    const target = Math.atan2(at.y - this.y, at.x - this.x);
    const current = Phaser.Math.Angle.RotateTo(this.aimAngle, target, 12 * (delta / 1000));
    this.aimAngle = current;
    this.image.setRotation(current + Math.PI);
  }

  canFire(): boolean {
    return this.cooldown <= 0;
  }

  tickFire(delta: number): void {
    this.cooldown -= delta / 1000;
  }

  resetCooldown(): void {
    this.cooldown = 1 / Math.max(0.05, this.stats.fireRate);
  }
}

export class Projectile extends Phaser.GameObjects.Image {
  readonly dir: Phaser.Math.Vector2;
  readonly speed: number;
  readonly damage: number;
  pierce: number;
  readonly isPlayer: boolean;
  readonly kind: string;
  readonly ownerWeaponId: string;
  readonly startX: number;
  readonly startY: number;
  readonly maxDistance?: number;
  readonly facesLeft: boolean;
  hitEnemies = new Set<string>();

  constructor(scene: Phaser.Scene, x: number, y: number, angle: number, texture: string, options: { speed: number; damage: number; pierce: number; isPlayer: boolean; kind: string; ownerWeaponId?: string; scale?: number; maxDistance?: number; facesLeft?: boolean; displayWidth?: number }) {
    super(scene, x, y, texture);
    this.startX = x;
    this.startY = y;
    this.maxDistance = options.maxDistance;
    this.facesLeft = options.facesLeft ?? false;
    this.dir = new Phaser.Math.Vector2(Math.cos(angle), Math.sin(angle));
    this.speed = options.speed;
    this.damage = options.damage;
    this.pierce = options.pierce;
    this.isPlayer = options.isPlayer;
    this.kind = options.kind;
    this.ownerWeaponId = options.ownerWeaponId ?? "";
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(this.dir.x * this.speed, this.dir.y * this.speed);
    body.setAllowGravity(false);
    this.setDepth(options.isPlayer ? 25 : 14);
    if (options.displayWidth) {
      const ratio = this.height / this.width;
      this.setDisplaySize(options.displayWidth, options.displayWidth * ratio);
    } else if (options.scale) {
      this.setScale(options.scale);
    }
  }

  update(): void {
    this.rotation = this.dir.angle() + (this.facesLeft ? Math.PI : 0);
  }
}
