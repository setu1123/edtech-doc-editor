import Dexie, { type Table } from "dexie";

export interface LocalDocument {
  id: string;
  title: string;
  ownerId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  isDraft?: boolean;
}

export interface LocalBlock {
  id: string;
  documentId: string;
  type: string;
  content: string;
  positionKey: string;
  lamportClock: number;
  clientId: string;
  lastModifiedBy: string;
  updatedAt: Date | string;
}

export interface Mutation {
  id?: number; // Auto-incrementing primary key
  action: "insert" | "update" | "delete";
  documentId: string;
  blockId: string;
  payload: Partial<LocalBlock>;
  createdAt: number; // Timestamp
}

class LocalEditorDatabase extends Dexie {
  documents!: Table<LocalDocument>;
  blocks!: Table<LocalBlock>;
  mutationQueue!: Table<Mutation>;

  constructor() {
    super("LocalEditorDatabase");
    this.version(1).stores({
      documents: "id, title, ownerId, updatedAt",
      blocks: "id, documentId, positionKey, [documentId+positionKey]",
      mutationQueue: "++id, action, documentId, blockId, createdAt",
    });
  }
}

// Instantiate the database
export const localDb = new LocalEditorDatabase();
