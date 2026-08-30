import Phaser from "phaser";
import { CONTAINERS, ENEMIES } from "../../shared/balance";
import { MAP_OBSTACLES, MAP_WORLD_HEIGHT, MAP_WORLD_WIDTH, MAP_SPAWN_MARGIN } from "../../shared/map";
import { getBuffBonus, getEnemyComposition, getEnemyMultipliers, getEquippedWeight, rollCollection } from "../../shared/calculations";
import type { BuffStack } from "../../shared/types";
import { store } from "../core/RunStore";
import { GameBus } from "../core/EventBus";
import { AudioManager } from "../audio/AudioManager";
import { ContainerObject, Loot } from "./objects";
import { Enemy, Player, Projectile, WeaponMount } from "./entities";
import type { EnemyFireEvent } from "./entities";

const WORLD = MAP_WORLD_WIDTH;
const MAX_RUNTIME_PELLETS = 24;
const MAX_PLAYER_PROJECTILES = 320;

export class BattleScene extends Phaser.Scene {
  private player!: Player;
  private keys!: Record<"W" | "A" | "S" | "D" | "F" | "TAB" | "ESC", Phaser.Input.Keyboard.Key>;
  private enemies: Enemy[] = [];
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private obstacleGroup!: Phaser.Physics.Arcade.StaticGroup;
  private projectiles: Projectile[] = [];
  private loots: Loot[] = [];
  private containers: ContainerObject[] = [];
  private mounts: WeaponMount[] = [];
  private spawnQueue: Array<{ kind: string; count: number; boss: boolean }> = [];
  private spawnTimer = 0;
  private killCount = 0;
  private totalStageEnemies = 0;
  private extractionReady = false;
  private extractionProgress = 0;
  private extractionArmed = false;
  private extractionZone: Phaser.GameObjects.Graphics | null = null;
  private extractionArrow: Phaser.GameObjects.Text | null = null;
  private extractionArrowNear: Phaser.GameObjects.Text | null = null;
  private extractionArrowArmed: Phaser.GameObjects.Text | null = null;
  private containerProgressGraphics!: Phaser.GameObjects.Graphics;
  private containerHint!: Phaser.GameObjects.Text;
  private extractionProgressGraphics!: Phaser.GameObjects.Graphics;
  private armorRegenTimer = 0;
  private hudTimer = 0;
  private uid = 1;
  private gameEnded = false;
  private deadEnemyIds = new Set<string>();
  private lastSafePlayerX = WORLD / 2;
  private lastSafePlayerY = WORLD / 2;
  private lastExtractionText = "";
  private handleResize = () => this.applyCameraZoom();
  private readonly effectTintToken = 0;
  private unsubscribeDiscard: (() => void) | null = null;
  private flameSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private fireZones: Array<{ sprite: Phaser.GameObjects.Sprite; x: number; y: number; radius: number; remaining: number; tickTimer: number }> = [];
  private bossSummonTimers = new Map<string, number>();
  private statusColorToken = 0;

  constructor() {
    super("Battle");
  }

  create(): void {
    this.gameEnded = false;
    this.killCount = 0;
    this.totalStageEnemies = 0;
    this.extractionReady = false;
    this.extractionProgress = 0;
    this.extractionArmed = false;
    this.enemies = [];
    this.projectiles = [];
    this.loots = [];
    this.containers = [];
    this.mounts = [];
    this.spawnQueue = [];
    this.spawnTimer = 0.8;
    this.lastSafePlayerX = WORLD / 2;
    this.lastSafePlayerY = WORLD / 2;
    this.extractionZone = null;
    this.extractionArrow = null;
    this.extractionArrowNear = null;
    this.extractionArrowArmed = null;
    this.lastExtractionText = "";
    this.flameSprites.clear();
    this.fireZones = [];
    this.bossSummonTimers.clear();
    this.statusColorToken = 0;
    this.deadEnemyIds.clear();

    this.physics.world.setBounds(0, 0, WORLD, WORLD);
    this.add.image(WORLD / 2, WORLD / 2, "map").setDisplaySize(WORLD, WORLD).setDepth(-20);
    this.containerProgressGraphics = this.add.graphics().setDepth(11);
    this.containerHint = this.add.text(0, 0, "开启中", { fontFamily: "sans-serif", fontSize: "14px", color: "#ffe084", stroke: "#1f1607", strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(60).setVisible(false);
    this.extractionProgressGraphics = this.add.graphics().setDepth(6);

    const state = store.getState();
    this.player = new Player(this, WORLD / 2, WORLD / 2);
    this.player.hp = state.currentHp;
    this.player.armor = state.currentArmor;
    this.player.syncToStore();
    this.enemyGroup = this.physics.add.group();
    this.obstacleGroup = this.physics.add.staticGroup();
    for (const obstacle of MAP_OBSTACLES) {
      const rect = this.add.rectangle(
        obstacle.x + obstacle.width / 2,
        obstacle.y + obstacle.height / 2,
        obstacle.width,
        obstacle.height,
        0x000000,
        0,
      ).setVisible(false);
      this.physics.add.existing(rect, true);
      this.obstacleGroup.add(rect);
    }
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);
    this.physics.add.collider(this.player, this.enemyGroup);

    const composition = getEnemyComposition(state.level);
    for (const item of composition) {
      this.totalStageEnemies += item.count;
      for (let i = 0; i < item.count; i++) {
        this.spawnQueue.push({ kind: item.kind, count: item.count, boss: item.kind === "boss" });
      }
    }
    this.spawnQueue.sort((a, b) => Number(a.boss) - Number(b.boss));

    this.createWeaponMounts();
    this.spawnContainers(state.level);

    this.keys = this.input.keyboard!.addKeys("W,A,S,D,F,TAB,ESC") as Record<"W" | "A" | "S" | "D" | "F" | "TAB" | "ESC", Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture(["W", "A", "S", "D", "F", "TAB", "ESC"]);
    this.input.keyboard!.on("keydown-ESC", () => {
      if (this.gameEnded) return;
      this.scene.pause();
      GameBus.emit("battle:pause", undefined);
    });

    const camera = this.cameras.main;
    camera.startFollow(this.player, true, 0.08, 0.08);
    camera.setBounds(0, 0, WORLD, WORLD);
    this.applyCameraZoom();
    this.scale.on("resize", this.handleResize);
    this.unsubscribeDiscard = GameBus.on("battle:discardItem", ({ collectionId }) => {
      this.spawnDiscardedItem(collectionId);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize);
      this.unsubscribeDiscard?.();
      this.unsubscribeDiscard = null;
    });
  }

  update(time: number, delta: number): void {
    if (this.gameEnded) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.F)) this.tryExtractKey();
    if (Phaser.Input.Keyboard.JustDown(this.keys.TAB)) GameBus.emit("battle:toggleBag", undefined);

    const state = store.getState();
    this.player.updatePlayer(delta, {
      up: this.keys.W.isDown,
      down: this.keys.S.isDown,
      left: this.keys.A.isDown,
      right: this.keys.D.isDown,
    });
    const playerRadius = 3;
    if (this.isPointBlocked(this.player.x, this.player.y, playerRadius)) {
      this.player.setPosition(this.lastSafePlayerX, this.lastSafePlayerY);
      const playerBody = this.player.body as Phaser.Physics.Arcade.Body | null;
      if (playerBody) {
        playerBody.stop();
        playerBody.setVelocity(0, 0);
      }
    } else {
      this.lastSafePlayerX = this.player.x;
      this.lastSafePlayerY = this.player.y;
    }
    this.updateArmorRegen(delta);
    this.updateSpawn(delta);
    this.sweepEnemyScenery();
    this.updateEnemies(time, delta);
    this.updateFlamers(delta);
    this.updateFireZones(delta);
    this.updateBossSummons(delta);
    this.updateWeapons(time, delta);
    this.updateStatuses(delta);
    this.updateProjectiles();
    this.updateLoot(delta, time);
    this.updateContainers(delta);
    this.updateExtraction(delta);
    this.hudTimer += delta;
    if (this.hudTimer >= 100) {
      this.hudTimer = 0;
      this.emitHud();
    }
    if (this.player.hp <= 0 && !this.gameEnded) this.gameOver();
  }

  private createWeaponMounts(): void {
    const equipped = store.getState().ownedWeapons.filter((w) => w.equipped);
    equipped.forEach((weapon, index) => {
      const mount = new WeaponMount(this, weapon, index, (Math.PI * 2 * index) / Math.max(1, equipped.length) - Math.PI / 2);
      this.mounts.push(mount);
    });
  }

  private applyCameraZoom(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const zoom = Math.max(width / WORLD, height / WORLD);
    this.cameras.main.setZoom(Math.max(0.4, zoom));
  }

  private updateSpawn(delta: number): void {
    this.spawnTimer -= delta / 1000;
    if (this.spawnTimer <= 0 && this.spawnQueue.length) {
      const active = this.enemies.filter((e) => e.active).length;
      const item = this.spawnQueue.shift()!;
      if (item.boss || active < 16) this.spawnEnemy(item.kind);
      else this.spawnQueue.unshift(item);
      this.spawnTimer = item.kind === "boss" ? 1.5 : 0.65;
    }
  }

  private spawnEnemy(kind: string): void {
    const config = ENEMIES[kind];
    if (!config) return;
    const multipliers = getEnemyMultipliers(store.getState().level);
    const enemy = new Enemy(this, 0, 0, kind, config, multipliers);
    const p = this.pickSpawnPoint(240 + Math.random() * 180);
    enemy.setPosition(p.x, p.y);
    this.enemies.push(enemy);
    this.enemyGroup.add(enemy);
    if (config.isBoss) {
      AudioManager.play("boss", 0.9);
      this.cameras.main.shake(320, 0.008);
      GameBus.emit("battle:toast", { message: "首领 赛伊德 已登场！", tone: "danger" });
    }
  }

  private pickSpawnPoint(minDistance: number, margin = MAP_SPAWN_MARGIN + 8): Phaser.Math.Vector2 {
    for (let i = 0; i < 120; i++) {
      const x = Phaser.Math.Between(MAP_SPAWN_MARGIN, WORLD - MAP_SPAWN_MARGIN);
      const y = Phaser.Math.Between(MAP_SPAWN_MARGIN, WORLD - MAP_SPAWN_MARGIN);
      const distance = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
      if (distance >= minDistance && !this.isPointBlocked(x, y, margin)) return new Phaser.Math.Vector2(x, y);
    }
    return this.findSafeFallback(this.player.x, this.player.y, minDistance, margin);
  }

  private isPointBlocked(x: number, y: number, margin = 0): boolean {
    return MAP_OBSTACLES.some((o) => (
      x >= o.x - margin && x <= o.x + o.width + margin &&
      y >= o.y - margin && y <= o.y + o.height + margin
    ));
  }

  private findSafeFallback(x: number, y: number, minDistance = 0, margin = MAP_SPAWN_MARGIN + 8): Phaser.Math.Vector2 {
    for (let radius = minDistance + 30; radius < WORLD; radius += 36) {
      for (let i = 0; i < 24; i++) {
        const angle = (Math.PI * 2 * i) / 24;
        const px = Phaser.Math.Clamp(x + Math.cos(angle) * radius, MAP_SPAWN_MARGIN, WORLD - MAP_SPAWN_MARGIN);
        const py = Phaser.Math.Clamp(y + Math.sin(angle) * radius, MAP_SPAWN_MARGIN, WORLD - MAP_SPAWN_MARGIN);
        if (!this.isPointBlocked(px, py, margin)) return new Phaser.Math.Vector2(px, py);
      }
    }
    return new Phaser.Math.Vector2(WORLD / 2, WORLD * 0.62);
  }

  private sweepEnemyScenery(): void {
    for (const child of [...this.children.list]) {
      if (!(child instanceof Enemy)) continue;
      if (!this.enemies.includes(child)) this.enemies.push(child);
      if (!(child.hp > 0)) this.killEnemy(child);
    }
    this.enemies = this.enemies.filter((enemy) => enemy.active && enemy.hp > 0 && !this.deadEnemyIds.has(enemy.id));
  }

  private updateEnemies(time: number, delta: number): void {
    for (const enemy of [...this.enemies]) {
      if (!enemy.active || this.deadEnemyIds.has(enemy.id)) continue;
      enemy.updateAI(time, delta, this.player, (event) => this.fireEnemy(event));
      if (enemy.hp <= 0) this.killEnemy(enemy);
    }
    this.enemies = this.enemies.filter((e) => e.active && e.hp > 0);
  }

  private updateWeapons(_time: number, delta: number): void {
    for (const mount of this.mounts) {
      mount.updateMount(this.player, this.mounts.length, delta);
      mount.tickFire(delta);
      const target = this.findNearestEnemy(mount.x, mount.y, mount.stats.range);
      if (target) {
        mount.aim({ x: target.x, y: target.y }, delta);
        const angleToTarget = Math.atan2(target.y - mount.y, target.x - mount.x);
        const aligned = Math.abs(Phaser.Math.Angle.Wrap(mount.aimAngle - angleToTarget)) < 0.18;
        if (target && mount.canFire() && aligned) this.fireWeapon(mount);
      }
    }
  }

  private findNearestEnemy(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bestDistance = range;
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.hp <= 0) continue;
      const distance = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (distance <= range && distance < bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    }
    return best;
  }

  private fireWeapon(mount: WeaponMount): void {
    const stats = mount.stats;
    const count = Math.min(Math.max(1, Math.floor(stats.pellets)), MAX_RUNTIME_PELLETS);
    if (this.projectiles.length + count > MAX_PLAYER_PROJECTILES) return;
    const angle = mount.aimAngle;
    const spread = count > 1 ? 0.14 / Math.max(1, count - 1) : 0;
    const speeds: Record<string, number> = { g18: 700, uzi: 800, akm: 900, awm: 1200 };
    for (let i = 0; i < count; i++) {
      const a = angle + (i - (count - 1) / 2) * spread;
      const texture = `bullet_${mount.configKey}`;
      const projectile = new Projectile(this, mount.x + Math.cos(a) * 22, mount.y + Math.sin(a) * 22, a, texture, {
        speed: speeds[mount.configKey] ?? 760,
        damage: stats.damage,
        pierce: stats.pierce,
        isPlayer: true,
        kind: mount.configKey,
        ownerWeaponId: mount.weapon.id,
        scale: mount.configKey === "awm" ? 1.2 : 1,
      });
      this.projectiles.push(projectile);
    }
    AudioManager.play(`shoot_${mount.configKey as "g18" | "uzi" | "akm" | "awm"}`, 0.55);
    const flash = this.add.circle(mount.x, mount.y, 4, 0xfff2a8, 0.9).setDepth(28);
    this.tweens.add({ targets: flash, alpha: 0, scale: 2.2, duration: 90, onComplete: () => flash.destroy() });
    mount.resetCooldown();
  }

  private fireEnemy(event: EnemyFireEvent): void {
    if (!event.enemy.active) return;
    const enemy = event.enemy;
    const config = enemy.config;
    const angle = event.angle;
    if (config.kind === "soldier") {
      const spreads = [-0.12, 0, 0.12];
      spreads.forEach((offset) => this.spawnEnemyProjectile(enemy, angle + offset, "enemy_bullet", 330, config.damage, 0));
    } else if (config.kind === "shield") {
      this.spawnEnemyProjectile(enemy, angle, "shield_wave", 240, config.damage, 0, { scale: 1.2 });
    } else if (config.kind === "rocket") {
      this.spawnEnemyProjectile(enemy, angle, "military_shell", 250, config.damage, 0, {
        kind: "military_shell",
        maxDistance: event.distance,
        facesLeft: true,
        displayWidth: 52,
      });
    } else if (config.kind === "gunner") {
      const count = 3;
      const spread = 0.20 / (count - 1);
      for (let i = 0; i < count; i++) this.spawnEnemyProjectile(enemy, angle + (i - 1) * spread, "enemy_bullet", 360, config.damage, 0);
    } else if (config.kind === "flamer") {
      return;
    } else if (config.kind === "boss") {
      if (Math.random() < 0.5) {
        for (let i = -2; i <= 2; i++) {
          this.spawnEnemyProjectile(enemy, angle + i * 0.18, "crop_fire_1", 300, 0, 0, {
            kind: "flame_arrow",
            maxDistance: event.distance,
            facesLeft: true,
            displayWidth: 72,
          });
        }
      } else {
        const count = 10;
        const spread = Math.PI * 2 / count;
        for (let i = 0; i < count; i++) this.spawnEnemyProjectile(enemy, angle + i * spread, "enemy_bullet", 360, config.damage * 0.5, 0);
      }
    }
  }

  private spawnEnemyProjectile(
    enemy: Enemy,
    angle: number,
    texture: string,
    speed: number,
    damage: number,
    pierce: number,
    extra: { kind?: string; maxDistance?: number; facesLeft?: boolean; displayWidth?: number; scale?: number } = {},
  ): void {
    const projectile = new Projectile(this, enemy.x + Math.cos(angle) * 24, enemy.y + Math.sin(angle) * 24, angle, texture, {
      speed,
      damage,
      pierce,
      isPlayer: false,
      kind: extra.kind ?? texture,
      scale: extra.scale,
      maxDistance: extra.maxDistance,
      facesLeft: extra.facesLeft,
      displayWidth: extra.displayWidth,
    });
    this.projectiles.push(projectile);
    if (texture === "military_shell" || texture === "crop_fire_1" || texture === "rocket") AudioManager.play("shoot_akm", 0.18);
  }
  private updateFlamers(delta: number): void {
    const seconds = delta / 1000;
    for (const enemy of [...this.enemies]) {
      if (enemy.kind !== "flamer" || !enemy.active || enemy.hp <= 0) continue;
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      const sprite = this.getFlamerSprite(enemy.id);
      if (distance <= enemy.attackRange) {
        const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        const offset = Math.min(enemy.attackRange * 0.5, distance * 0.5);
        sprite.setPosition(enemy.x + Math.cos(angle) * offset, enemy.y + Math.sin(angle) * offset);
        sprite.setRotation(angle + Math.PI);
        sprite.setVisible(true);
        const width = Math.min(enemy.attackRange, Math.max(100, distance * 1.05));
        const ratio = sprite.height / sprite.width;
        sprite.setDisplaySize(width, width * ratio);
        enemy.flameTickTimer -= seconds;
        if (enemy.flameTickTimer <= 0) {
          enemy.flameTickTimer = 0.2;
          this.damagePlayerByPercent(0.02);
        }
      } else {
        enemy.flameTickTimer = 0;
        sprite.setVisible(false);
      }
    }
  }

  private getFlamerSprite(id: string): Phaser.GameObjects.Sprite {
    let sprite = this.flameSprites.get(id);
    if (!sprite) {
      sprite = this.add.sprite(0, 0, "crop_fire_1").setDepth(12);
      const ratio = sprite.height / sprite.width;
      sprite.setDisplaySize(250, 250 * ratio);
      sprite.play("shotfire_anim", true);
      this.flameSprites.set(id, sprite);
    }
    return sprite;
  }

  private updateFireZones(delta: number): void {
    for (const zone of [...this.fireZones]) {
      zone.remaining -= delta;
      zone.tickTimer -= delta;
      const distance = Phaser.Math.Distance.Between(zone.x, zone.y, this.player.x, this.player.y);
      if (distance <= zone.radius && zone.tickTimer <= 0) {
        zone.tickTimer += 200;
        this.damagePlayerByPercent(0.02);
      }
      if (zone.remaining <= 0) {
        zone.sprite.destroy();
        this.fireZones = this.fireZones.filter((item) => item !== zone);
      }
    }
  }

  private createFireZone(x: number, y: number, radius = 90): void {
    const sprite = this.add.sprite(x, y, "crop_burn_1").setDepth(13);
    const ratio = sprite.height / sprite.width;
    sprite.setDisplaySize(radius * 2, radius * 2 * ratio);
    sprite.play("burn_anim", true);
    this.fireZones.push({ sprite, x, y, radius, remaining: 3000, tickTimer: 0 });
  }

  private updateBossSummons(delta: number): void {
    const seconds = delta / 1000;
    for (const enemy of [...this.enemies]) {
      if (enemy.kind !== "boss" || !enemy.active || enemy.hp <= 0) continue;
      let timer = this.bossSummonTimers.get(enemy.id) ?? 15;
      timer -= seconds;
      if (timer <= 0) {
        const kinds = ["soldier", "shield", "rocket", "gunner", "flamer"];
        for (let i = 0; i < 5; i++) {
          this.spawnEnemy(kinds[Math.floor(Math.random() * kinds.length)]);
        }
        this.totalStageEnemies += 5;
        this.bossSummonTimers.set(enemy.id, 15);
        GameBus.emit("battle:toast", { message: "赛伊德召唤了增援！", tone: "danger" });
      } else {
        this.bossSummonTimers.set(enemy.id, timer);
      }
    }
  }

  private damagePlayerByPercent(percent: number): void {
    if (this.gameEnded) return;
    const amount = Math.max(1, Math.ceil(this.player.maxHp * percent));
    this.armorRegenTimer = 0;
    this.player.hp -= amount;
    if (this.player.hp < 0) this.player.hp = 0;
    this.player.syncToStore();
    AudioManager.play("hurt", 0.35);
    const hit = this.add.text(this.player.x, this.player.y - 28, `-${amount}`, { fontFamily: "sans-serif", fontSize: "14px", color: "#ff7b4f", stroke: "#111", strokeThickness: 3 }).setDepth(60);
    this.tweens.add({ targets: hit, y: hit.y - 22, alpha: 0, duration: 420, onComplete: () => hit.destroy() });
    if (this.player.hp <= 0) this.gameOver();
  }
  private updateStatuses(delta: number): void {
    const seconds = delta / 1000;
    for (const enemy of [...this.enemies]) {
      if (enemy.burnImmuneTimer > 0) enemy.burnImmuneTimer -= seconds;
      if (enemy.burnTimer > 0) {
        enemy.burnTimer -= seconds;
        enemy.burnTickTimer -= seconds;
        if (enemy.burnTickTimer <= 0) {
          enemy.burnTickTimer += 0.5;
          enemy.hp -= enemy.maxHp * 0.01 * enemy.burnStacks;
          if (enemy.hp <= 0) this.killEnemy(enemy);
        }
        if (enemy.burnTimer <= 0) {
          enemy.burnTimer = 0;
          enemy.burnStacks = 0;
          enemy.burnImmuneTimer = 10;
        }
      }
      if (enemy.freezeImmuneTimer > 0) enemy.freezeImmuneTimer -= seconds;
      if (enemy.freezeTimer > 0) {
        enemy.freezeTimer -= seconds;
        enemy.speedMultiplier = Math.max(0, 1 - 0.2 * enemy.freezeStacks);
        if (enemy.freezeTimer <= 0) {
          enemy.freezeTimer = 0;
          enemy.freezeStacks = 0;
          enemy.freezeImmuneTimer = 10;
          enemy.speedMultiplier = 1;
        }
      }
      if (enemy.stunTimer <= 0 && enemy.stunImmuneTimer > 0) enemy.stunImmuneTimer -= seconds;
      if (enemy.stunTimer > 0 && enemy.stunTimer - seconds <= 0) {
        enemy.stunTimer = 0;
        enemy.stunImmuneTimer = 10;
      }
      if (enemy.burnTimer > 0 && enemy.freezeTimer > 0) {
        if (enemy.burnStatusToken > enemy.freezeStatusToken) enemy.setTint(0xff3d3d);
        else enemy.setTint(0x6fb7ff);
      } else if (enemy.burnTimer > 0) {
        enemy.setTint(0xff3d3d);
      } else if (enemy.freezeTimer > 0) {
        enemy.setTint(0x6fb7ff);
      } else {
        enemy.clearTint();
      }
    }
  }

  private applyStatusToEnemy(enemy: Enemy): void {
    if (!enemy.active || enemy.hp <= 0) return;
    const bonus = getBuffBonus(store.getState().buffs);
    if (bonus.burnStacks > 0 && enemy.burnTimer <= 0 && enemy.burnImmuneTimer <= 0) {
      enemy.burnStacks = bonus.burnStacks;
      enemy.burnTimer = 2;
      enemy.burnTickTimer = 0.5;
      enemy.burnStatusToken = ++this.statusColorToken;
    }
    if (bonus.freezeStacks > 0 && enemy.freezeTimer <= 0 && enemy.freezeImmuneTimer <= 0) {
      enemy.freezeStacks = bonus.freezeStacks;
      enemy.freezeTimer = 5;
      enemy.freezeStatusToken = ++this.statusColorToken;
    }
    if (bonus.stunChance > 0 && enemy.stunTimer <= 0 && enemy.stunImmuneTimer <= 0 && Math.random() < bonus.stunChance) {
      enemy.stunTimer = 1.5;
    }
  }
  private updateProjectiles(): void {
    for (const projectile of [...this.projectiles]) {
      if (!projectile.active) {
        this.removeProjectile(projectile);
        continue;
      }
      projectile.update();
      const x = projectile.x;
      const y = projectile.y;
      if (x < 0 || y < 0 || x > WORLD || y > WORLD) {
        this.handleProjectileArrival(projectile);
        this.removeProjectile(projectile);
        continue;
      }
      if (projectile.maxDistance !== undefined) {
        const traveled = Phaser.Math.Distance.Between(projectile.startX, projectile.startY, projectile.x, projectile.y);
        if (traveled >= projectile.maxDistance) {
          this.handleProjectileArrival(projectile);
          this.removeProjectile(projectile);
          continue;
        }
      }
      if (projectile.isPlayer) {
        this.checkPlayerProjectileHit(projectile);
      } else {
        this.checkEnemyProjectileHit(projectile);
      }
    }
  }

  private handleProjectileArrival(projectile: Projectile): void {
    if (projectile.kind === "military_shell" || projectile.kind === "rocket") {
      this.explode(projectile.x, projectile.y, 70, projectile.damage);
    } else if (projectile.kind === "flame_arrow") {
      this.createFireZone(projectile.x, projectile.y, 90);
    }
  }

  private checkPlayerProjectileHit(projectile: Projectile): void {
    for (const enemy of [...this.enemies]) {
      if (!enemy.active || enemy.hp <= 0 || projectile.hitEnemies.has(enemy.id)) continue;
      const radius = enemy.config.radius + 7;
      if (Phaser.Math.Distance.Between(projectile.x, projectile.y, enemy.x, enemy.y) > radius) continue;
      const actual = enemy.applyDamage(projectile.damage);
      this.applyStatusToEnemy(enemy);
      this.spawnHitSpark(projectile.x, projectile.y, enemy.kind === "boss" ? 0xff2255 : 0xffcf52);
      AudioManager.play("enemy_hit", 0.22);
      const lifesteal = getBuffBonus(store.getState().buffs).lifesteal;
      if (lifesteal > 0) {
        const heal = actual * lifesteal;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
        this.player.syncToStore();
      }
      projectile.hitEnemies.add(enemy.id);
      if (!(enemy.hp > 0)) this.killEnemy(enemy);
      if (projectile.pierce > 0) {
        projectile.pierce -= 1;
      } else {
        this.removeProjectile(projectile);
        return;
      }
    }
  }

  private checkEnemyProjectileHit(projectile: Projectile): void {
    const distance = Phaser.Math.Distance.Between(projectile.x, projectile.y, this.player.x, this.player.y);
    if (projectile.kind === "military_shell" || projectile.kind === "rocket") {
      if (distance < 34) {
        this.explode(projectile.x, projectile.y, 70, projectile.damage);
        this.removeProjectile(projectile);
      }
      return;
    }
    if (projectile.kind === "flame_arrow") {
      if (distance <= 14) {
        this.createFireZone(projectile.x, projectile.y, 90);
        this.removeProjectile(projectile);
      }
      return;
    }
    if (distance <= 14) {
      this.damagePlayer(projectile.damage, projectile.x, projectile.y);
      this.removeProjectile(projectile);
    }
  }

  private explode(x: number, y: number, radius: number, damage: number): void {
    const distance = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
    if (distance <= radius) this.damagePlayer(damage * (1 - distance / radius * 0.3), x, y);
    const explosion = this.add.sprite(x, y, "crop_boom_1").setDepth(34);
    const boomRatio = explosion.height / explosion.width;
    explosion.setDisplaySize(radius * 2, radius * 2 * boomRatio);
    explosion.play("boom_anim");
    this.time.delayedCall(500, () => explosion.destroy());
    const ring = this.add.circle(x, y, radius, 0xff6622, 0.24).setDepth(34);
    this.tweens.add({ targets: ring, alpha: 0, scale: 1.4, duration: 260, onComplete: () => ring.destroy() });
    AudioManager.play("explosion", 0.65);
    this.cameras.main.shake(140, Math.min(0.012, 0.001 + damage / 20000));
  }

  private damagePlayer(amount: number, x: number, y: number): void {
    const dead = this.player.applyDamage(amount);
    this.armorRegenTimer = 0;
    AudioManager.play("hurt", 0.7);
    this.cameras.main.shake(90, 0.003);
    const hit = this.add.text(x, y, `-${Math.ceil(amount)}`, { fontFamily: "sans-serif", fontSize: "15px", color: "#ff6b6b", stroke: "#111", strokeThickness: 3 }).setDepth(60);
    this.tweens.add({ targets: hit, y: y - 24, alpha: 0, duration: 560, onComplete: () => hit.destroy() });
    if (dead) this.gameOver();
  }

  private removeProjectile(projectile: Projectile): void {
    projectile.destroy();
    this.projectiles = this.projectiles.filter((p) => p !== projectile);
  }

  private killEnemy(enemy: Enemy): void {
    if (!enemy.active || enemy.hp > 0 || this.deadEnemyIds.has(enemy.id)) return;
    this.deadEnemyIds.add(enemy.id);
    this.killCount += 1;
    AudioManager.play("kill", 0.65);
    this.spawnKillBurst(enemy.x, enemy.y, enemy.config.isBoss);
    if (Math.random() < enemy.config.dropChance) this.spawnLoot(enemy.x, enemy.y, "enemy");
    enemy.setActive(false);
    enemy.setVisible(false);
    enemy.setAlpha(0);
    enemy.shadow?.setVisible(false);
    const enemyBody = enemy.body as Phaser.Physics.Arcade.Body | null;
    if (enemyBody) enemyBody.enable = false;
    this.enemyGroup.remove(enemy, false, false);
    const flameSprite = this.flameSprites.get(enemy.id);
    if (flameSprite) {
      flameSprite.destroy();
      this.flameSprites.delete(enemy.id);
    }
    enemy.destroy();
    this.enemies = this.enemies.filter((e) => e !== enemy);
    this.emitHud();
  }

  private spawnDiscardedItem(collectionId: string): void {
    const collection = store.getCollection(collectionId);
    if (!collection) return;
    const angle = Math.PI / 2 + (Math.random() - 0.5) * 0.7;
    const radius = 42 + Math.random() * 30;
    const rawX = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * radius, MAP_SPAWN_MARGIN, WORLD - MAP_SPAWN_MARGIN);
    const rawY = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * radius, MAP_SPAWN_MARGIN, WORLD - MAP_SPAWN_MARGIN);
    const safe = this.findSafeFallback(rawX, rawY, 0, 12);
    const loot = new Loot(this, safe.x, safe.y, collection, `discard-${this.uid++}`, 1200);
    this.loots.push(loot);
    AudioManager.play("drop", 0.55);
  }

  private spawnLoot(x: number, y: number, source: "enemy" | "small" | "large"): void {
    const state = store.getState();
    const collection = rollCollection(Math.random(), source, getBuffBonus(state.buffs).redChance);
    const safe = this.findSafeFallback(x + Phaser.Math.Between(-12, 12), y + Phaser.Math.Between(-12, 12), 0, 76);
    const loot = new Loot(this, safe.x, safe.y, collection, `loot-${this.uid++}`);
    this.loots.push(loot);
    AudioManager.play("drop", 0.45);
  }

  private updateLoot(delta: number, time: number): void {
    const state = store.getState();
    const bonus = getBuffBonus(state.buffs);
    for (const loot of [...this.loots]) {
      if (!loot.active) continue;
      loot.updateLoot(delta, time);
      if (!loot.canPickup(time)) continue;
      const distance = Phaser.Math.Distance.Between(loot.x, loot.y, this.player.x, this.player.y);
      const magnetRange = bonus.pickupMagnet ? 150 : state.pickupRadius;
      if (distance < magnetRange && distance > 4) {
        const speed = bonus.pickupMagnet ? 260 : 120;
        loot.x += ((this.player.x - loot.x) / distance) * speed * (delta / 1000);
        loot.y += ((this.player.y - loot.y) / distance) * speed * (delta / 1000);
      }
      if (distance < 18) {
        if (store.addToBackpack(loot.collection.id)) {
          AudioManager.play("pickup", 0.65);
          loot.destroy();
          this.loots = this.loots.filter((i) => i !== loot);
          this.emitHud();
        } else if (!loot.getData("fullWarned")) {
          loot.setData("fullWarned", true);
          GameBus.emit("battle:toast", { message: `背包空间不足，无法拾取 ${loot.collection.name}`, tone: "warning" });
        }
      }
    }
  }

  private spawnContainers(level: number): void {
    for (let i = 0; i < 3; i++) this.spawnContainer("small");
    if (level % 2 === 0) this.spawnContainer("large");
  }

  private spawnContainer(kind: "small" | "large"): void {
    const config = CONTAINERS[kind];
    const point = this.pickSpawnPoint(220);
    const container = new ContainerObject(this, point.x, point.y, config, `container-${this.uid++}`);
    this.containers.push(container);
  }

  private updateContainers(delta: number): void {
    this.containerProgressGraphics.clear();
    this.containerHint.setVisible(false);
    let nearestText: ContainerObject | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const container of [...this.containers]) {
      if (!container.active) continue;
      const distance = Phaser.Math.Distance.Between(container.x, container.y, this.player.x, this.player.y);
      container.updateContainer(delta, distance <= container.config.radius);
      if (distance <= container.config.radius && distance < nearestDistance) {
        nearestDistance = distance;
        nearestText = container;
      }
      if (container.isOpen || container.openProgress >= container.openSeconds) this.openContainer(container);
    }
    if (nearestText && nearestText.active) {
      const progress = nearestText.getProgress();
      const barWidth = 56;
      const barHeight = 8;
      const x = nearestText.x - barWidth / 2;
      const y = nearestText.y - nearestText.displayHeight * 0.78 - 18;
      this.containerProgressGraphics.fillStyle(0x101812, 0.94);
      this.containerProgressGraphics.fillRect(x - 3, y - 3, barWidth + 6, barHeight + 6);
      this.containerProgressGraphics.fillStyle(0x2d4935, 1);
      this.containerProgressGraphics.fillRect(x, y, barWidth, barHeight);
      this.containerProgressGraphics.fillStyle(0xffd54a, 1);
      this.containerProgressGraphics.fillRect(x, y, barWidth * progress, barHeight);
      this.containerProgressGraphics.lineStyle(2, 0x6f8e72, 0.8);
      this.containerProgressGraphics.strokeRect(x - 3, y - 3, barWidth + 6, barHeight + 6);
      this.containerHint.setVisible(true);
      this.containerHint.setPosition(nearestText.x, y - 8);
    }
  }

  private openContainer(container: ContainerObject): void {
    if (!container.active) return;
    const extra = getBuffBonus(store.getState().buffs).containerExtra;
    const rolls = 1 + extra;
    for (let i = 0; i < rolls; i++) this.spawnLoot(container.x + i * 12, container.y, container.config.kind);
    AudioManager.play("container_open", 0.8);
    container.destroy();
    this.containers = this.containers.filter((c) => c !== container);
  }

  private updateExtraction(delta: number): void {
    this.enemies = this.enemies.filter((enemy) => enemy.active && enemy.hp > 0 && !this.deadEnemyIds.has(enemy.id));
    const plannedEnemiesCleared = this.killCount >= this.totalStageEnemies && this.spawnQueue.length === 0;
    if (plannedEnemiesCleared) this.enemies = [];
    if ((this.enemies.length || this.spawnQueue.length) && !plannedEnemiesCleared) {
      this.extractionProgress = 0;
      this.extractionProgressGraphics.clear();
      return;
    }
    if (!this.extractionReady) {
      this.extractionReady = true;
      this.createExtractionZone();
    }
    const distance = this.extractionZone ? Phaser.Math.Distance.Between(this.player.x, this.player.y, this.extractionZone.x, this.extractionZone.y) : 999;
    if (distance < 64 && this.extractionArmed) {
      this.extractionProgress += delta / 1500;
    } else {
      this.extractionProgress = 0;
      if (distance >= 64) this.extractionArmed = false;
    }
    const near = distance < 64;
    if (this.extractionArrow) this.extractionArrow.setVisible(!near && !this.extractionArmed);
    if (this.extractionArrowNear) this.extractionArrowNear.setVisible(near && !this.extractionArmed);
    if (this.extractionArrowArmed) this.extractionArrowArmed.setVisible(near && this.extractionArmed);
    this.extractionProgressGraphics.clear();
    if (this.extractionZone && distance < 64 && this.extractionArmed) {
      const barWidth = 64;
      const barHeight = 9;
      const x = this.extractionZone.x - barWidth / 2;
      const y = this.extractionZone.y - 104;
      this.extractionProgressGraphics.fillStyle(0x101812, 0.94);
      this.extractionProgressGraphics.fillRect(x - 3, y - 3, barWidth + 6, barHeight + 6);
      this.extractionProgressGraphics.fillStyle(0x2d4935, 1);
      this.extractionProgressGraphics.fillRect(x, y, barWidth, barHeight);
      this.extractionProgressGraphics.fillStyle(0x8dffb1, 1);
      this.extractionProgressGraphics.fillRect(x, y, barWidth * this.extractionProgress, barHeight);
      this.extractionProgressGraphics.lineStyle(2, 0x6f8e72, 0.8);
      this.extractionProgressGraphics.strokeRect(x - 3, y - 3, barWidth + 6, barHeight + 6);
    }
    if (this.extractionProgress >= 1) {
      GameBus.emit("battle:extracted", undefined);
      AudioManager.play("extract", 0.9);
      this.gameEnded = true;
      this.scene.stop();
    }
  }

  private tryExtractKey(): void {
    if (!this.extractionReady || !this.extractionZone) return;
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.extractionZone.x, this.extractionZone.y);
    if (distance < 64) {
      this.extractionArmed = true;
      AudioManager.play("click", 0.7);
    }
  }

  private createExtractionZone(): void {
    if (this.extractionZone) return;
    const zone = this.add.graphics().setDepth(5);
    zone.setPosition(WORLD / 2, WORLD / 2);
    zone.fillStyle(0x2bff7c, 0.045);
    zone.fillRect(-78, -78, 156, 156);
    zone.fillStyle(0x39d26f, 0.13);
    zone.fillRect(-62, -62, 124, 124);
    zone.lineStyle(5, 0x62ff93, 0.95);
    zone.strokeRect(-62, -62, 124, 124);
    zone.lineStyle(2, 0xa9ffc4, 0.38);
    zone.strokeRect(-78, -78, 156, 156);
    this.extractionZone = zone;
    const textStyle = { fontFamily: "sans-serif", fontSize: "18px", color: "#8cffb0", stroke: "#08210d", strokeThickness: 4 };
    this.extractionArrow = this.add.text(WORLD / 2, WORLD / 2 - 86, "撤离点", textStyle).setOrigin(0.5).setDepth(45);
    this.extractionArrowNear = this.add.text(WORLD / 2, WORLD / 2 - 86, "撤离点 · 按 F 开始撤离", textStyle).setOrigin(0.5).setDepth(45).setVisible(false);
    this.extractionArrowArmed = this.add.text(WORLD / 2, WORLD / 2 - 86, "撤离中...", textStyle).setOrigin(0.5).setDepth(45).setVisible(false);
  }

  private spawnHitSpark(x: number, y: number, color: number): void {
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 8 + Math.random() * 22;
      const orb = this.add.circle(x, y, 2, color, 0.9).setDepth(32);
      this.tweens.add({
        targets: orb,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.3,
        duration: 180,
        onComplete: () => orb.destroy(),
      });
    }
  }

  private spawnKillBurst(x: number, y: number, boss: boolean): void {
    const count = boss ? 24 : 10;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const orb = this.add.circle(x, y, boss ? 5 : 3, boss ? 0xff3b3b : 0xffd95a, 1).setDepth(32);
      const distance = boss ? Phaser.Math.Between(50, 90) : Phaser.Math.Between(25, 55);
      this.tweens.add({ targets: orb, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance, alpha: 0, duration: 350, onComplete: () => orb.destroy() });
    }
  }

  private updateArmorRegen(delta: number): void {
    const bonus = getBuffBonus(store.getState().buffs);
    if (bonus.armorRegenPercent <= 0) return;
    this.armorRegenTimer += delta / 1000;
    if (this.armorRegenTimer >= 2 && this.player.armor < this.player.maxArmor) {
      const regen = this.player.maxArmor * bonus.armorRegenPercent * delta / 1000;
      this.player.armor = Math.min(this.player.maxArmor, this.player.armor + regen);
      this.player.syncToStore();
    }
  }
  private gameOver(): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    AudioManager.play("gameover", 1.0);
    GameBus.emit("battle:gameover", undefined);
    this.scene.stop();
  }

  private emitHud(): void {
    const state = store.getState();
    const equipped = state.ownedWeapons.filter((w) => w.equipped);
    const loadUsed = getEquippedWeight(state.ownedWeapons);
    GameBus.emit("battle:hud", {
      hp: this.player.hp,
      maxHp: state.maxHp,
      armor: this.player.armor,
      maxArmor: state.maxArmor,
      coins: state.coins,
      level: state.level,
      kills: this.killCount,
      extractionReady: this.extractionReady,
      backpackUsed: store.getBackpackUsed(),
      backpackMax: state.backpackCapacity,
      loadUsed,
      loadMax: state.loadCapacity,
    });
  }
}

