import { localDb, type LocalBlock, type Mutation } from "./db";
import { generatePositionBetween } from "./fractionalIndexing";

// Generate or retrieve persistent clientId
export function getClientId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("editor_client_id");
  if (!id) {
    id = "client_" + Math.random().toString(36).substring(2, 11);
    localStorage.setItem("editor_client_id", id);
  }
  return id;
}

// Logical Lamport Clock
let localClock = 0;

export function getLamportClock(): number {
  if (typeof window !== "undefined") {
    const val = localStorage.getItem("editor_lamport_clock");
    if (val) {
      localClock = Math.max(localClock, parseInt(val, 10));
    }
  }
  return localClock;
}

export function incrementLamportClock(remoteClock?: number): number {
  const current = getLamportClock();
  localClock = Math.max(current, remoteClock || 0) + 1;
  if (typeof window !== "undefined") {
    localStorage.setItem("editor_lamport_clock", localClock.toString());
  }
  return localClock;
}

// Local Mutations
export async function insertBlockLocal(
  documentId: string,
  type: string,
  content: string,
  afterBlockId: string | null,
  userId: string
): Promise<LocalBlock> {
  const clientId = getClientId();
  const nextClock = incrementLamportClock();

  // Find all current blocks to calculate fractional position
  const blocks = await localDb.blocks
    .where("documentId")
    .equals(documentId)
    .toArray();
  blocks.sort((a, b) => a.positionKey.localeCompare(b.positionKey));

  let prevKey: string | null = null;
  let nextKey: string | null = null;

  if (afterBlockId) {
    const idx = blocks.findIndex((b) => b.id === afterBlockId);
    if (idx !== -1) {
      prevKey = blocks[idx].positionKey;
      if (idx + 1 < blocks.length) {
        nextKey = blocks[idx + 1].positionKey;
      }
    }
  } else {
    // If inserting at start, next key is the current first block key
    if (blocks.length > 0) {
      nextKey = blocks[0].positionKey;
    }
  }

  const positionKey = generatePositionBetween(prevKey, nextKey);
  const blockId = "block_" + Math.random().toString(36).substring(2, 15);

  const newBlock: LocalBlock = {
    id: blockId,
    documentId,
    type,
    content,
    positionKey,
    lamportClock: nextClock,
    clientId,
    lastModifiedBy: userId,
    updatedAt: new Date().toISOString(),
  };

  await localDb.blocks.put(newBlock);

  // Queue insertion mutation
  await localDb.mutationQueue.add({
    action: "insert",
    documentId,
    blockId,
    payload: newBlock,
    createdAt: Date.now(),
  });

  // Trigger sync in background if online
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trigger-sync"));
  }

  return newBlock;
}

export async function updateBlockLocal(
  blockId: string,
  content: string,
  userId: string
): Promise<void> {
  const block = await localDb.blocks.get(blockId);
  if (!block) return;

  const nextClock = incrementLamportClock();
  const clientId = getClientId();

  const updated: Partial<LocalBlock> = {
    content,
    lamportClock: nextClock,
    clientId,
    lastModifiedBy: userId,
    updatedAt: new Date().toISOString(),
  };

  await localDb.blocks.update(blockId, updated);

  // Delete previous pending updates for same block to optimize queue size
  await localDb.mutationQueue
    .where({ blockId, action: "update" })
    .delete();

  await localDb.mutationQueue.add({
    action: "update",
    documentId: block.documentId,
    blockId,
    payload: updated,
    createdAt: Date.now(),
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trigger-sync"));
  }
}

export async function deleteBlockLocal(blockId: string): Promise<void> {
  const block = await localDb.blocks.get(blockId);
  if (!block) return;

  const nextClock = incrementLamportClock();
  const clientId = getClientId();

  await localDb.blocks.delete(blockId);

  // Remove pending updates for this block
  await localDb.mutationQueue
    .where("blockId")
    .equals(blockId)
    .delete();

  await localDb.mutationQueue.add({
    action: "delete",
    documentId: block.documentId,
    blockId,
    payload: { lamportClock: nextClock, clientId },
    createdAt: Date.now(),
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trigger-sync"));
  }
}
