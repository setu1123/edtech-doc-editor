import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;

    // 1. Security: Limit Payload size to prevent OOM
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Payload too large (Max 5MB)" }, { status: 413 });
    }

    // 2. Authentication
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3. Authorization / Tenant Scoping
    const membership = await prisma.documentMember.findUnique({
      where: {
        documentId_userId: {
          documentId: id,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { mutations, clientClock, clientId, lastSyncTime } = await request.json();

    // 4. Role-based enforcement: VIEWERS cannot update document state
    if (membership.role === "VIEWER" && mutations && mutations.length > 0) {
      return NextResponse.json({ error: "Viewers are not allowed to push updates" }, { status: 403 });
    }

    let maxServerClock = clientClock || 0;

    // 5. Conflict Resolution: Process incoming client mutations
    if (mutations && mutations.length > 0) {
      for (const mut of mutations) {
        const { action, blockId, payload } = mut;
        const incomingClock = payload.lamportClock || 0;
        maxServerClock = Math.max(maxServerClock, incomingClock);

        // Fetch existing block
        const existing = await prisma.block.findUnique({
          where: { id: blockId },
        });

        if (action === "delete") {
          if (existing) {
            let shouldDelete = false;
            if (incomingClock > existing.lamportClock) {
              shouldDelete = true;
            } else if (incomingClock === existing.lamportClock && clientId < existing.clientId) {
              shouldDelete = true;
            }

            if (shouldDelete) {
              await prisma.block.delete({ where: { id: blockId } });
            }
          }
        } else {
          // INSERT or UPDATE
          const blockData = {
            documentId: id,
            type: payload.type || "text",
            content: payload.content || "",
            positionKey: payload.positionKey || "m",
            lamportClock: incomingClock,
            clientId: clientId,
            lastModifiedBy: user.id,
            updatedAt: new Date(),
          };

          if (!existing) {
            await prisma.block.create({
              data: {
                id: blockId,
                ...blockData,
              },
            });
          } else {
            // Compare logical clocks for Last-Write-Wins
            let shouldOverwrite = false;
            if (incomingClock > existing.lamportClock) {
              shouldOverwrite = true;
            } else if (incomingClock === existing.lamportClock) {
              if (clientId < existing.clientId) {
                shouldOverwrite = true;
              }
            }

            if (shouldOverwrite) {
              await prisma.block.update({
                where: { id: blockId },
                data: blockData,
              });
            }
          }
        }
      }
    }

    // Find the latest max clock in the DB for this document to synchronize Lamport clocks
    const dbMaxClock = await prisma.block.aggregate({
      where: { documentId: id },
      _max: { lamportClock: true },
    });
    maxServerClock = Math.max(maxServerClock, dbMaxClock._max.lamportClock || 0);

    // 6. Fetch remote updates that client has not seen
    const lastSyncDate = lastSyncTime ? new Date(lastSyncTime) : new Date(0);

    const updatedBlocks = await prisma.block.findMany({
      where: {
        documentId: id,
        updatedAt: {
          gt: lastSyncDate,
        },
        clientId: {
          not: clientId, // Don't return client's own changes
        },
      },
    });

    // Formulate remote mutations for client
    const remoteMutations = updatedBlocks.map((b) => ({
      action: "update" as const,
      blockId: b.id,
      payload: {
        type: b.type,
        content: b.content,
        positionKey: b.positionKey,
        lastModifiedBy: b.lastModifiedBy,
        updatedAt: b.updatedAt,
      },
      lamportClock: b.lamportClock,
      clientId: b.clientId,
    }));

    // Update document's updatedAt timestamp
    await prisma.document.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      remoteMutations,
      serverClock: maxServerClock,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Sync API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
