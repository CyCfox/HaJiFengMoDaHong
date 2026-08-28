export type GameEventMap = {
  "run:changed": void;
  "run:start": void;
  "battle:hud": { hp: number; maxHp: number; armor: number; maxArmor: number; coins: number; level: number; kills: number; extractionReady: boolean; backpackUsed: number; backpackMax: number; loadUsed: number; loadMax: number };
  "battle:toast": { message: string; tone?: "info" | "success" | "warning" | "danger" };
  "battle:extracted": void;
  "battle:gameover": void;
  "affairs:opened": void;
  "audio:play": { name: string; volume?: number };
  "boot:ready": void;
  "battle:pause": void;
  "battle:resume": void;
  "battle:toggleBag": void;
  "battle:discardItem": { collectionId: string };
  "api:litChanged": { lit: string[] };
};

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers = new Map<keyof GameEventMap, Set<Handler<never>>>();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<GameEventMap[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) (handler as Handler<GameEventMap[K]>)(payload);
  }
}

export const GameBus = new EventBus();
export type GameEvents = keyof GameEventMap;
