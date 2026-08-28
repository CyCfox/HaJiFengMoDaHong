class SaveGatewayImpl {
  private baseUrl = "/api";

  async loadLitCollections(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/collections`);
    if (!res.ok) throw new Error("加载收藏室失败");
    const data = (await res.json()) as { lit: string[] };
    return data.lit;
  }

  async lightCollection(id: string): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/collections/${encodeURIComponent(id)}/light`, { method: "POST" });
    if (!res.ok) throw new Error("点亮藏品失败");
    const data = (await res.json()) as { lit: string[] };
    return data.lit;
  }
}

export const SaveGateway = new SaveGatewayImpl();

