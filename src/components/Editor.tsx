"use client";

import { useEffect, useRef, useState } from "react";
import { type LocalBlock } from "@/lib/db";
import { insertBlockLocal, updateBlockLocal, deleteBlockLocal } from "@/lib/editorStore";

interface EditorProps {
  documentId: string;
  blocks: LocalBlock[];
  userRole: string;
  userId: string;
}

export default function Editor({ documentId, blocks, userRole, userId }: EditorProps) {
  const isReadOnly = userRole === "VIEWER";
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  
  // Local state for the block currently being typed to avoid IndexedDB delays / lag
  const [localContent, setLocalContent] = useState("");
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync localContent with activeBlock changes from remote co-editors
  useEffect(() => {
    if (activeBlockId) {
      const activeBlock = blocks.find((b) => b.id === activeBlockId);
      if (activeBlock) {
        setLocalContent(activeBlock.content);
      }
    }
  }, [activeBlockId, blocks]);

  const handleFocus = (blockId: string, content: string) => {
    if (isReadOnly) return;
    setActiveBlockId(blockId);
    setLocalContent(content);
  };

  const handleBlur = (blockId: string) => {
    if (isReadOnly) return;
    // Flush immediately on blur
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    updateBlockLocal(blockId, localContent, userId);
    setActiveBlockId(null);
  };

  const handleChange = (blockId: string, content: string) => {
    if (isReadOnly) return;
    setLocalContent(content);

    // Debounce the IndexedDB/Sync queue updates to prevent lag during rapid typing
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      updateBlockLocal(blockId, content, userId);
    }, 400); // 400ms debounce
  };

  const handleKeyDown = async (
    e: React.KeyboardEvent,
    blockId: string,
    index: number,
    type: string,
    content: string
  ) => {
    if (isReadOnly) return;

    if (e.key === "Enter") {
      e.preventDefault();
      // Insert new paragraph block below current block
      const newBlock = await insertBlockLocal(documentId, "text", "", blockId, userId);
      setTimeout(() => {
        const nextInput = document.getElementById(`input-${newBlock.id}`);
        if (nextInput) nextInput.focus();
      }, 50);
    } else if (e.key === "Backspace" && content === "" && blocks.length > 1) {
      e.preventDefault();
      // Delete current block
      await deleteBlockLocal(blockId);
      // Focus previous block
      const prevIndex = Math.max(0, index - 1);
      const prevBlock = blocks[prevIndex];
      setTimeout(() => {
        const prevInput = document.getElementById(`input-${prevBlock.id}`);
        if (prevInput) prevInput.focus();
      }, 50);
    }
  };

  const handleTypeChange = async (blockId: string, newType: string) => {
    if (isReadOnly) return;
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    
    // We update type by issuing a local update with updated payload structure
    // Since updateBlockLocal supports content only, let's create a custom update
    // helper or update type in Dexie & queue mutation.
    const { localDb } = await import("@/lib/db");
    const { incrementLamportClock, getClientId } = await import("@/lib/editorStore");
    const nextClock = incrementLamportClock();
    const clientId = getClientId();

    await localDb.blocks.update(blockId, { type: newType, lamportClock: nextClock, clientId, updatedAt: new Date().toISOString() });
    await localDb.mutationQueue.add({
      action: "update",
      documentId,
      blockId,
      payload: { type: newType, lamportClock: nextClock, clientId, updatedAt: new Date().toISOString() },
      createdAt: Date.now(),
    });
    window.dispatchEvent(new CustomEvent("trigger-sync"));
  };

  return (
    <div className="w-full space-y-4">
      {blocks.map((block, index) => {
        const isEditing = activeBlockId === block.id;
        const currentTextValue = isEditing ? localContent : block.content;

        return (
          <div
            key={block.id}
            className="group relative flex items-start gap-4 p-2 rounded-xl hover:bg-slate-800/20 transition-all border border-transparent hover:border-slate-800/40"
          >
            {/* Block Type Selector (for editors/owners) */}
            {!isReadOnly && (
              <select
                value={block.type}
                onChange={(e) => handleTypeChange(block.id, e.target.value)}
                className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 border border-slate-700 text-slate-300 text-xs px-2 py-1 rounded-lg focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="text">Paragraph</option>
                <option value="heading">Heading</option>
                <option value="code">Code Block</option>
              </select>
            )}

            {/* Editor Input depending on type */}
            <div className="flex-1">
              {block.type === "heading" ? (
                <input
                  id={`input-${block.id}`}
                  type="text"
                  value={currentTextValue}
                  disabled={isReadOnly}
                  onChange={(e) => handleChange(block.id, e.target.value)}
                  onFocus={() => handleFocus(block.id, block.content)}
                  onBlur={() => handleBlur(block.id)}
                  onKeyDown={(e) => handleKeyDown(e, block.id, index, block.type, currentTextValue)}
                  className="w-full bg-transparent text-white font-extrabold text-2xl md:text-3xl focus:outline-none placeholder-slate-600 border-b border-transparent focus:border-indigo-500/30 py-1"
                  placeholder="Heading 1"
                />
              ) : block.type === "code" ? (
                <textarea
                  id={`input-${block.id}`}
                  value={currentTextValue}
                  disabled={isReadOnly}
                  onChange={(e) => handleChange(block.id, e.target.value)}
                  onFocus={() => handleFocus(block.id, block.content)}
                  onBlur={() => handleBlur(block.id)}
                  onKeyDown={(e) => handleKeyDown(e, block.id, index, block.type, currentTextValue)}
                  className="w-full bg-slate-950 font-mono text-sm text-green-400 p-4 rounded-xl border border-slate-800/80 focus:outline-none focus:border-indigo-500 placeholder-slate-700 min-h-[100px]"
                  placeholder="// Paste your code here..."
                />
              ) : (
                <textarea
                  id={`input-${block.id}`}
                  value={currentTextValue}
                  disabled={isReadOnly}
                  onChange={(e) => handleChange(block.id, e.target.value)}
                  onFocus={() => handleFocus(block.id, block.content)}
                  onBlur={() => handleBlur(block.id)}
                  onKeyDown={(e) => handleKeyDown(e, block.id, index, block.type, currentTextValue)}
                  className="w-full bg-transparent text-slate-200 text-base resize-none focus:outline-none placeholder-slate-600 border-b border-transparent focus:border-indigo-500/30 py-1"
                  placeholder="Type '/' or start writing..."
                  rows={Math.max(1, currentTextValue.split("\n").length)}
                />
              )}
            </div>

            {/* CRDT Logical Metadata (Hover details) */}
            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-950/80 text-[10px] text-indigo-300 font-mono px-2 py-0.5 rounded border border-indigo-500/20 pointer-events-none">
              clock: {block.lamportClock} | client: {block.clientId.substring(0, 8)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
