"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb } from "@/lib/db";
import { SyncEngine, type SyncState } from "@/lib/sync";
import Editor from "@/components/Editor";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function DocumentWorkspace({ params }: PageProps) {
  const { id: documentId } = use(params);
  const router = useRouter();

  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [docTitle, setDocTitle] = useState("Loading canvas...");
  const [userRole, setUserRole] = useState("EDITOR"); // OWNER, EDITOR, VIEWER
  
  // Sync engine and connection state
  const [syncState, setSyncState] = useState<SyncState>("offline");
  
  // Collaborators, versions, AI states
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("EDITOR");
  const [inviteError, setInviteError] = useState("");
  
  const [versions, setVersions] = useState<any[]>([]);
  const [versionTitle, setVersionTitle] = useState("");
  const [versioningError, setVersioningError] = useState("");

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState<"summarize" | "rewrite" | "autocomplete">("summarize");

  // Reactive IndexedDB local query for blocks (Dexie integration)
  const dbBlocks = useLiveQuery(
    () => localDb.blocks.where("documentId").equals(documentId).toArray(),
    [documentId]
  );
  
  const sortedBlocks = dbBlocks
    ? [...dbBlocks].sort((a, b) => a.positionKey.localeCompare(b.positionKey))
    : [];

  useEffect(() => {
    // 1. Fetch user authentication
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (data && data.user) {
          setUser(data.user);
          localStorage.setItem("cached_user", JSON.stringify(data.user));
          loadDocumentDetails(data.user.id);
        } else {
          router.push("/login");
        }
      } catch (err) {
        console.error("Auth query failed (Offline fallback active):", err);
        const cachedUser = localStorage.getItem("cached_user");
        if (cachedUser) {
          const parsed = JSON.parse(cachedUser);
          setUser(parsed);
          loadDocumentDetails(parsed.id);
        } else {
          router.push("/login");
        }
      }
    }

    checkAuth();
  }, [documentId, router]);

  // Load document configuration, co-editors, and local cache
  async function loadDocumentDetails(userId: string) {
    try {
      // Load local DB document metadata
      const localDoc = await localDb.documents.get(documentId);
      if (localDoc) {
        setDocTitle(localDoc.title);
        
        // Ensure there is at least one block locally so the editor renders
        const localBlockCount = await localDb.blocks.where("documentId").equals(documentId).count();
        if (localBlockCount === 0) {
          const { getClientId } = await import("@/lib/editorStore");
          await localDb.blocks.put({
            id: "block_welcome_" + Math.random().toString(36).substring(2, 11),
            documentId: documentId,
            type: "heading",
            content: localDoc.title,
            positionKey: "m",
            lamportClock: 1,
            clientId: getClientId(),
            lastModifiedBy: userId,
            updatedAt: new Date().toISOString(),
          });
        }
      } else if (documentId.startsWith("doc_temp_")) {
        // If it's a temp ID but not in IndexedDB, it is invalid. Redirect to dashboard.
        router.push("/documents");
        return;
      }

      if (navigator.onLine && !documentId.startsWith("doc_temp_")) {
        // Fetch details from server (memberships, metadata)
        const res = await fetch(`/api/documents/${documentId}`);
        if (res.ok) {
          const data = await res.json();
          setDocTitle(data.document.title);
          setUserRole(data.userRole);

          // Update local DB cache
          await localDb.documents.put({
            id: data.document.id,
            title: data.document.title,
            ownerId: data.document.ownerId,
            createdAt: data.document.createdAt,
            updatedAt: data.document.updatedAt,
          });

          // Prepopulate local IndexedDB blocks if local cache is empty
          const currentCount = await localDb.blocks.where("documentId").equals(documentId).count();
          if (currentCount === 0 && data.document.blocks) {
            for (const b of data.document.blocks) {
              await localDb.blocks.put(b);
            }
          }
        }
        loadCollaborators();
        loadVersions();
      }
    } catch (err) {
      console.error("Failed to load document metadata:", err);
    }
  }

  // Sync Engine Instantiation
  useEffect(() => {
    const engine = new SyncEngine(documentId, (state) => setSyncState(state));
    return () => {
      engine.destroy();
    };
  }, [documentId]);

  async function loadCollaborators() {
    try {
      const res = await fetch(`/api/documents/${documentId}/collaborators`);
      if (res.ok) {
        const data = await res.json();
        setCollaborators(data.collaborators);
      }
    } catch (err) {
      console.error("Collaborator fetch failed:", err);
    }
  }

  async function loadVersions() {
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions);
      }
    } catch (err) {
      console.error("Version load failed:", err);
    }
  }

  const handleTitleChange = async (newTitle: string) => {
    setDocTitle(newTitle);
    if (userRole === "VIEWER") return;

    try {
      // 1. Update local cache
      await localDb.documents.update(documentId, { title: newTitle, updatedAt: new Date().toISOString() });

      // 2. Try to sync server title if online
      if (navigator.onLine) {
        await fetch(`/api/documents/${documentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });
      }
    } catch (err) {
      console.error("Title update failed:", err);
    }
  };

  const handleInviteCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    try {
      const res = await fetch(`/api/documents/${documentId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invite failed");
      }

      setInviteEmail("");
      loadCollaborators();
    } catch (err: any) {
      setInviteError(err.message);
    }
  };

  const handleCaptureVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    setVersioningError("");
    if (!versionTitle.trim()) return;

    try {
      const res = await fetch(`/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: versionTitle.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create version");
      }

      setVersionTitle("");
      loadVersions();
    } catch (err: any) {
      setVersioningError(err.message);
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!confirm("Are you sure you want to restore this version? This will generate a new set of modifications to revert all co-editor canvases.")) return;
    try {
      const res = await fetch(`/api/documents/${documentId}/versions/${versionId}/restore`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Restore failed");
      }

      // Force Sync to fetch restored blocks immediately
      window.dispatchEvent(new CustomEvent("trigger-sync"));
      loadVersions();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // AI Assistant trigger
  const handleAiAction = async () => {
    setAiLoading(true);
    setAiOutput("");
    try {
      // Gather all text from blocks for context
      const fullText = sortedBlocks.map((b) => b.content).join("\n\n");

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: aiMode,
          prompt: aiPrompt,
          context: fullText,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "AI Generation failed");
      }

      setAiOutput(data.text);
    } catch (err: any) {
      setAiOutput(`Error: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Top Navbar */}
      <header className="h-16 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur flex justify-between items-center px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/documents" className="text-slate-400 hover:text-white transition-colors">
            ← Dashboard
          </Link>
          <input
            type="text"
            value={docTitle}
            disabled={userRole === "VIEWER"}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="bg-transparent text-lg font-bold text-white focus:outline-none focus:border-b focus:border-indigo-500 max-w-xs"
          />
          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold uppercase">
            {userRole}
          </span>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Connection Status:</span>
          {syncState === "synced" && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Synced
            </span>
          )}
          {syncState === "syncing" && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1.5 font-medium animate-pulse-slow">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping"></span>
              Syncing...
            </span>
          )}
          {(syncState === "offline" || syncState === "error") && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              Offline Cache
            </span>
          )}
        </div>
      </header>

      {/* Main Layout Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor (Center Panel) */}
        <main className="flex-1 overflow-y-auto p-8 md:p-12 max-w-4xl mx-auto w-full">
          {user && sortedBlocks.length > 0 ? (
            <Editor
              documentId={documentId}
              blocks={sortedBlocks}
              userRole={userRole}
              userId={user.id}
            />
          ) : (
            <div className="text-center py-20 text-slate-500">Loading document content...</div>
          )}
        </main>

        {/* Workspace Sidebar (Right Panel) */}
        <aside className="w-80 border-l border-slate-800/80 bg-slate-900/40 backdrop-blur overflow-y-auto p-6 shrink-0 space-y-8 hidden md:block">
          {/* AI Assistant */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">🤖 Gemini AI Assistant</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setAiMode("summarize")}
                className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  aiMode === "summarize"
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                Summarize
              </button>
              <button
                onClick={() => setAiMode("rewrite")}
                className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  aiMode === "rewrite"
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                Rewrite
              </button>
            </div>

            {aiMode === "rewrite" && (
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Rewrite instruction (e.g. make professional)..."
                className="w-full text-xs px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
              />
            )}

            <button
              onClick={handleAiAction}
              disabled={aiLoading}
              className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all"
            >
              {aiLoading ? "Generating..." : "Ask Gemini AI"}
            </button>

            {aiOutput && (
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-300 font-sans max-h-40 overflow-y-auto whitespace-pre-wrap">
                {aiOutput}
              </div>
            )}
          </div>

          {/* Version History & Snapshots */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">⏳ Version Control</h3>
            {userRole !== "VIEWER" && (
              <form onSubmit={handleCaptureVersion} className="flex gap-2">
                <input
                  type="text"
                  value={versionTitle}
                  onChange={(e) => setVersionTitle(e.target.value)}
                  placeholder="Snapshot name..."
                  required
                  className="flex-1 text-xs px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all"
                >
                  Save
                </button>
              </form>
            )}
            {versioningError && <p className="text-[10px] text-red-400">{versioningError}</p>}

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {versions.map((ver) => (
                <div key={ver.id} className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80 flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold text-white truncate max-w-[120px]">{ver.title}</span>
                    {userRole !== "VIEWER" && (
                      <button
                        onClick={() => handleRestoreVersion(ver.id)}
                        className="text-[9px] text-indigo-400 hover:underline font-semibold"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {new Date(ver.createdAt).toLocaleString()} by {ver.createdBy.name}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Collaborator Access Control */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">👥 Collaborators</h3>
            {userRole === "OWNER" && (
              <form onSubmit={handleInviteCollaborator} className="space-y-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Invite user email..."
                  required
                  className="w-full text-xs px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
                />
                <div className="flex gap-2">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="flex-1 text-xs px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none"
                  >
                    <option value="EDITOR">Editor</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all"
                  >
                    Invite
                  </button>
                </div>
              </form>
            )}
            {inviteError && <p className="text-[10px] text-red-400">{inviteError}</p>}

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {collaborators.map((col) => (
                <div key={col.id} className="flex justify-between items-center text-xs p-2 rounded bg-slate-950/20 border border-slate-800/40">
                  <div className="truncate">
                    <p className="font-semibold text-slate-200 truncate max-w-[120px]">{col.user.name}</p>
                    <p className="text-[9px] text-slate-500 truncate max-w-[120px]">{col.user.email}</p>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50 uppercase font-semibold">
                    {col.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
