import type {
  AuthUser, CollectionCabinet, LeaderboardEntry, PlayerProfile, PlayerSave,
} from "../../shared/types";

export interface AuthResult {
  user: AuthUser;
  profile: PlayerProfile;
}

export interface LightResult {
  collectionId: string;
  level: number;
  redValue: number;
}

class SaveGatewayImpl {
  private baseUrl = "/api";
  private currentUser: AuthUser | null = null;

  getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error((data as { error?: string }).error ?? "请求失败");
      (error as Error & { status?: number }).status = res.status;
      throw error;
    }
    return data as T;
  }

  async me(): Promise<AuthResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/me`, { credentials: "include" });
      if (res.status === 401) {
        this.currentUser = null;
        return null;
      }
      if (!res.ok) return null;
      const data = (await res.json()) as { user: AuthUser | null; profile: PlayerProfile | null };
      this.currentUser = data.user;
      return data.user ? (data as { user: AuthUser; profile: PlayerProfile }) : null;
    } catch {
      this.currentUser = null;
      return null;
    }
  }

  async register(username: string, password: string): Promise<AuthResult> {
    const data = await this.request<{ user: AuthUser; profile: PlayerProfile }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify({ username, password }) },
    );
    this.currentUser = data.user;
    return data;
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const data = await this.request<{ user: AuthUser; profile: PlayerProfile }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) },
    );
    this.currentUser = data.user;
    return data;
  }

  async logout(): Promise<void> {
    await this.request<{ ok: boolean }>("/auth/logout", { method: "POST" });
    this.currentUser = null;
  }

  async loadCollections(): Promise<CollectionCabinet[]> {
    const data = await this.request<{ cabinets: CollectionCabinet[] }>("/collections");
    return data.cabinets;
  }

  async lightCollection(id: string): Promise<LightResult> {
    return this.request<LightResult>(`/collections/${encodeURIComponent(id)}/light`, { method: "POST" });
  }

  async loadSave(): Promise<PlayerSave | null> {
    const data = await this.request<{ save: PlayerSave | null }>("/save");
    return data.save;
  }

  async saveRun(save: PlayerSave): Promise<PlayerSave> {
    const data = await this.request<{ save: PlayerSave }>(
      "/save",
      { method: "POST", body: JSON.stringify({ save }) },
    );
    return data.save;
  }

  async resetAfterDeath(level: number, clearedLevels: number): Promise<PlayerSave> {
    const data = await this.request<{ save: PlayerSave }>(
      "/save/death",
      { method: "POST", body: JSON.stringify({ level, clearedLevels }) },
    );
    return data.save;
  }

  async submitProgress(level: number): Promise<number> {
    const data = await this.request<{ bestLevel: number }>(
      "/progress",
      { method: "POST", body: JSON.stringify({ level }) },
    );
    return data.bestLevel;
  }

  async getLeaderboard(type: "level" | "red"): Promise<LeaderboardEntry[]> {
    const data = await this.request<{ entries: LeaderboardEntry[] }>(`/leaderboard?type=${type}`);
    return data.entries;
  }
}

export const SaveGateway = new SaveGatewayImpl();
