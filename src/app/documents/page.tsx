"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { localDb, type LocalDocument } from "@/lib/db";
import { getClientId } from "@/lib/editorStore";

export default function Dashboard() {
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    // 1. Fetch user status
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/login");
          return;
        }
        const data = await res.ok ? await res.json() : null;
        if (data && data.user) {
          setUser(data.user);
          // Load documents after user is validated
          loadDocuments(data.user.id);
        } else {
          router.push("/login");
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        // If offline, user state can be simulated if credentials exist locally,
        // but for now we fallback to local cache if already initialized.
        const cachedUser = localStorage.getItem("cached_user");
        if (cachedUser) {
          const parsed = JSON.parse(cachedUser);
          setUser(parsed);
          loadDocuments(parsed.id);
        } else {
          router.push("/login");
        }
      }
    }

    checkAuth();
  }, [router]);

  // Load documents from local db and pull from server if online
  async function loadDocuments(userId: string) {
    try {
      // Load local copies
      const localDocs = await localDb.documents.toArray();
      setDocuments(localDocs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
      setLoading(false);

      // Pull from server if online
      if (navigator.onLine) {
        const res = await fetch("/api/documents");
        if (res.ok) {
          const data = await res.json();
          const serverDocs = data.documents as (LocalDocument & { role: string })[];

          // Update local DB cache
          for (const doc of serverDocs) {
            await localDb.documents.put({
              id: doc.id,
              title: doc.title,
              ownerId: doc.ownerId,
              createdAt: doc.createdAt,
              updatedAt: doc.updatedAt,
            });
          }

          // Re-load updated list from IndexedDB
          const updatedLocalDocs = await localDb.documents.toArray();
          setDocuments(updatedLocalDocs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
        }
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
      setLoading(false);
    }
  }

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !user) return;
    setCreating(true);
    setError("");

    const tempId = "doc_temp_" + Math.random().toString(36).substring(2, 11);
    const newDoc: LocalDocument = {
      id: tempId,
      title: newTitle.trim(),
      ownerId: user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDraft: true, // Mark as draft until online sync confirms it
    };

    try {
      // 1. Instantly save to IndexedDB (Local-First philosophy)
      await localDb.documents.put(newDoc);
      setDocuments((prev) => [newDoc, ...prev]);
      setNewTitle("");

      // Initialize with local default block in IndexedDB
      await localDb.blocks.put({
        id: "block_welcome_" + Math.random().toString(36).substring(2, 11),
        documentId: tempId,
        type: "heading",
        content: newDoc.title,
        positionKey: "m",
        lamportClock: 1,
        clientId: getClientId(),
        lastModifiedBy: user.id,
        updatedAt: new Date().toISOString(),
      });

      // 2. Try to send to server if online
      if (navigator.onLine) {
        const res = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newDoc.title }),
        });

        if (res.ok) {
          const data = await res.json();
          const serverDoc = data.document;

          // Swap temp document with server document
          await localDb.documents.delete(tempId);
          
          // Re-key blocks from temp doc to server doc
          const tempBlocks = await localDb.blocks.where("documentId").equals(tempId).toArray();
          for (const block of tempBlocks) {
            await localDb.blocks.delete(block.id);
            await localDb.blocks.put({
              ...block,
              documentId: serverDoc.id,
            });
          }

          await localDb.documents.put({
            id: serverDoc.id,
            title: serverDoc.title,
            ownerId: serverDoc.ownerId,
            createdAt: serverDoc.createdAt,
            updatedAt: serverDoc.updatedAt,
          });

          // Redirect to the new document
          router.push(`/documents/${serverDoc.id}`);
          return;
        }
      }

      // If offline, redirect to the offline-created temp document
      router.push(`/documents/${tempId}`);
    } catch (err: any) {
      setError(err.message || "Failed to create document");
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      localStorage.removeItem("cached_user");
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-indigo-400 font-medium">
        Loading workspace...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col max-w-7xl w-full mx-auto p-6 space-y-8">
      <header className="flex justify-between items-center pb-6 border-b border-slate-800/60">
        <div>
          <h1 className="text-3xl font-extrabold text-white">Your Documents</h1>
          <p className="text-sm text-slate-400">Welcome back, {user?.name}</p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors border border-slate-700/50"
        >
          Sign Out
        </button>
      </header>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Create Document Card */}
        <div className="lg:col-span-1 glass-card rounded-2xl p-6 space-y-4">
          <h2 className="text-xl font-bold text-white">Create New Document</h2>
          <form onSubmit={handleCreateDocument} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Document Title
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                placeholder="e.g. Brainstorming, Lesson Plan..."
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700/50 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !newTitle.trim()}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creating..." : "Create Document"}
            </button>
          </form>
        </div>

        {/* Documents List */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            📂 Recent Canvas Files
            {!navigator.onLine && (
              <span className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-normal">
                Offline Mode (Showing cached copies)
              </span>
            )}
          </h2>

          {documents.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-slate-800 rounded-2xl text-slate-500">
              No documents created yet. Get started by creating one on the left!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => router.push(`/documents/${doc.id}`)}
                  className="p-6 rounded-2xl glass-card border border-slate-800 hover:border-indigo-500/30 transition-all cursor-pointer space-y-4 group hover:scale-[1.01]"
                >
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors truncate">
                      {doc.title}
                    </h3>
                    {doc.isDraft && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase font-semibold">
                        Offline Draft
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>
                      Modified {new Date(doc.updatedAt).toLocaleDateString()}
                    </span>
                    <span className="text-indigo-400 font-semibold group-hover:translate-x-1 transition-transform">
                      Open Canvas →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
