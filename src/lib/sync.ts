import { localDb, type LocalBlock, type Mutation } from "./db";
import { getClientId, getLamportClock, incrementLamportClock } from "./editorStore";

export type SyncState = "online" | "offline" | "syncing" | "error" | "synced";

export class SyncEngine {
  private documentId: string;
  private onStateChange: (state: SyncState) => void;
  private isSyncing = false;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(documentId: string, onStateChange: (state: SyncState) => void) {
    this.documentId = documentId;
    this.onStateChange = onStateChange;

    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
      window.addEventListener("trigger-sync", this.triggerSync);

      // Start periodic poll/sync
      this.pollInterval = setInterval(() => this.sync(), 5000);
      this.sync();
    }
  }

  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
      window.removeEventListener("trigger-sync", this.triggerSync);
      if (this.pollInterval) clearInterval(this.pollInterval);
    }
  }

  private handleOnline = () => {
    this.onStateChange("online");
    this.sync();
  };

  private handleOffline = () => {
    this.onStateChange("offline");
  };

  private triggerSync = () => {
    this.sync();
  };

  async sync() {
    if (this.isSyncing) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.onStateChange("offline");
      return;
    }

    this.isSyncing = true;
    this.onStateChange("syncing");

    try {
      // 0. Promote offline-created drafts to the server first
      if (this.documentId.startsWith("doc_temp_")) {
        const localDoc = await localDb.documents.get(this.documentId);
        if (!localDoc) {
          this.isSyncing = false;
          this.onStateChange("error");
          return;
        }

        const res = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: localDoc.title }),
        });

        if (res.ok) {
          const data = await res.json();
          const serverDoc = data.document;

          // Swap ID in local indexedDB
          await localDb.documents.delete(this.documentId);
          await localDb.documents.put({
            id: serverDoc.id,
            title: serverDoc.title,
            ownerId: serverDoc.ownerId,
            createdAt: serverDoc.createdAt,
            updatedAt: serverDoc.updatedAt,
          });

          // Re-key blocks
          const tempBlocks = await localDb.blocks.where("documentId").equals(this.documentId).toArray();
          for (const block of tempBlocks) {
            await localDb.blocks.delete(block.id);
            await localDb.blocks.put({
              ...block,
              documentId: serverDoc.id,
            });
          }

          // Re-key mutations
          const tempMutations = await localDb.mutationQueue.where("documentId").equals(this.documentId).toArray();
          for (const mut of tempMutations) {
            if (mut.id) await localDb.mutationQueue.delete(mut.id);
            await localDb.mutationQueue.add({
              ...mut,
              documentId: serverDoc.id,
              payload: {
                ...mut.payload,
                documentId: serverDoc.id,
              },
            });
          }

          const oldId = this.documentId;
          this.documentId = serverDoc.id;

          if (typeof window !== "undefined" && window.location.pathname.includes(oldId)) {
            window.history.replaceState(null, "", `/documents/${serverDoc.id}`);
            window.location.reload();
            return;
          }
        } else {
          this.isSyncing = false;
          this.onStateChange("error");
          return;
        }
      }

      // 1. Get all pending mutations for this document
      const mutations = await localDb.mutationQueue
        .where("documentId")
        .equals(this.documentId)
        .toArray();

      const lastKnownSync = localStorage.getItem(`last_sync_time_${this.documentId}`) || "1970-01-01T00:00:00.000Z";

      // 2. Push local mutations and pull remote changes
      const response = await fetch(`/api/documents/${this.documentId}/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: getClientId(),
          clientClock: getLamportClock(),
          mutations: mutations.map((m) => ({
            action: m.action,
            blockId: m.blockId,
            payload: m.payload,
          })),
          lastSyncTime: lastKnownSync,
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Unauthorized or Read-only viewer access");
        }
        throw new Error("Sync failed");
      }

      const data = (await response.json()) as {
        success: boolean;
        remoteMutations: {
          action: "insert" | "update" | "delete";
          blockId: string;
          payload: any;
          lamportClock: number;
          clientId: string;
        }[];
        serverClock: number;
        serverTime: string;
      };

      // 3. Clear successfully synced mutations from queue
      if (mutations.length > 0) {
        const mutationIds = mutations.map((m) => m.id).filter((id): id is number => id !== undefined);
        await localDb.mutationQueue.bulkDelete(mutationIds);
      }

      // 4. Update Client Clock
      incrementLamportClock(data.serverClock);

      // 5. Apply remote updates using Deterministic LWW CRDT rules
      for (const remote of data.remoteMutations) {
        const local = await localDb.blocks.get(remote.blockId);

        if (remote.action === "delete") {
          // If deleted on server, check if local has a higher Lamport clock (locally edited after deletion)
          if (local) {
            if (local.lamportClock < remote.lamportClock) {
              await localDb.blocks.delete(remote.blockId);
            } else if (local.lamportClock === remote.lamportClock && getClientId() > remote.clientId) {
              // Ties broken by Client ID
              await localDb.blocks.delete(remote.blockId);
            }
          }
        } else {
          // Insert or Update
          const incomingBlock: LocalBlock = {
            id: remote.blockId,
            documentId: this.documentId,
            type: remote.payload.type || "text",
            content: remote.payload.content || "",
            positionKey: remote.payload.positionKey || "m",
            lamportClock: remote.lamportClock,
            clientId: remote.clientId,
            lastModifiedBy: remote.payload.lastModifiedBy || "system",
            updatedAt: remote.payload.updatedAt || new Date().toISOString(),
          };

          if (!local) {
            // Document doesn't have it, safe to put
            await localDb.blocks.put(incomingBlock);
          } else {
            // Local exists: Compare clocks
            let overwrite = false;
            if (local.lamportClock < remote.lamportClock) {
              overwrite = true;
            } else if (local.lamportClock === remote.lamportClock) {
              // Tie-breaker
              if (remote.clientId < local.clientId) {
                overwrite = true;
              }
            }

            if (overwrite) {
              await localDb.blocks.put(incomingBlock);
            }
          }
        }
      }

      // 6. Update last sync time
      localStorage.setItem(`last_sync_time_${this.documentId}`, data.serverTime);
      this.onStateChange("synced");
    } catch (error: any) {
      console.error("Sync error:", error);
      this.onStateChange("error");
    } finally {
      this.isSyncing = false;
    }
  }
}
