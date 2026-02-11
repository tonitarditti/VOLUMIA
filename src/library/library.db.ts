import { createStore, get, set, del, keys } from "idb-keyval";
import type { AssetRecord } from "./library.types";

const store = createStore("volumia_db", "volumia_kv");

const INDEX_KEY = "assets:index";
const recordKey = (id: string) => `assets:record:${id}`;
export const glbKey = (id: string) => `assets:file:${id}:glb`;
export const objKey = (id: string) => `assets:file:${id}:obj`;
export const thumbKey = (id: string) => `assets:thumb:${id}`;

export async function dbGetIndex(): Promise<AssetRecord[]> {
  return (await get(INDEX_KEY, store)) ?? [];
}

export async function dbSetIndex(index: AssetRecord[]) {
  await set(INDEX_KEY, index, store);
}

export async function dbUpsertRecord(record: AssetRecord) {
  await set(recordKey(record.id), record, store);
  const index = await dbGetIndex();
  const i = index.findIndex((x) => x.id === record.id);
  const next = [...index];
  if (i >= 0) next[i] = record;
  else next.unshift(record);
  await dbSetIndex(next);
}

export async function dbGetRecord(id: string): Promise<AssetRecord | undefined> {
  return await get(recordKey(id), store);
}

export async function dbDeleteAsset(id: string) {
  const rec = await dbGetRecord(id);

  await del(recordKey(id), store);
  if (rec?.files?.glbKey) await del(rec.files.glbKey, store);
  if (rec?.files?.objKey) await del(rec.files.objKey, store);
  if (rec?.files?.thumbKey) await del(rec.files.thumbKey, store);

  const index = await dbGetIndex();
  await dbSetIndex(index.filter((x) => x.id !== id));
}

export async function dbSetBlob(key: string, blob: Blob) {
  await set(key, blob, store);
}

export async function dbGetBlob(key: string): Promise<Blob | undefined> {
  return await get(key, store);
}

export async function dbWipeAll() {
  const all = await keys(store);
  for (const k of all) await del(k, store);
}
