import type { CollectionBackendMeta } from "./types";

export declare const COLLECTION_META: readonly CollectionBackendMeta[];
export declare const COLLECTION_META_BY_ID: ReadonlyMap<string, CollectionBackendMeta>;
export declare function getCollectionMeta(id: string): CollectionBackendMeta | null;
