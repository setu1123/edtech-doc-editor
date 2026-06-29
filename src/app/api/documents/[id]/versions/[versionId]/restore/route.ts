import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await props.params;
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const membership = await prisma.documentMember.findUnique({
      where: {
        documentId_userId: {
          documentId: id,
          userId: user.id,
        },
      },
    });

    if (!membership || membership.role === "VIEWER") {
      return NextResponse.json({ error: "Unauthorized to restore versions" }, { status: 403 });
    }

    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
    });

    if (!version || version.documentId !== id) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Parse blocks from version snapshot
    const targetBlocks = JSON.parse(version.snapshot) as {
      id: string;
      type: string;
      content: string;
      positionKey: string;
    }[];

    // Find current blocks and get max Lamport clock
    const currentBlocks = await prisma.block.findMany({
      where: { documentId: id },
    });

    const maxClockResult = await prisma.block.aggregate({
      where: { documentId: id },
      _max: { lamportClock: true },
    });

    const nextClockBase = (maxClockResult._max.lamportClock || 0) + 10; // Bump significantly to dominate local offline replicas

    const targetBlockIds = new Set(targetBlocks.map((b) => b.id));

    // 1. Delete blocks that are in the current document but not in the snapshot
    const blocksToDelete = currentBlocks.filter((b) => !targetBlockIds.has(b.id));
    for (const b of blocksToDelete) {
      await prisma.block.delete({ where: { id: b.id } });
    }

    // 2. Put / Restore target blocks
    for (const target of targetBlocks) {
      const existing = currentBlocks.find((b) => b.id === target.id);
      const blockData = {
        documentId: id,
        type: target.type,
        content: target.content,
        positionKey: target.positionKey,
        lamportClock: nextClockBase,
        clientId: "server-restore",
        lastModifiedBy: user.id,
        updatedAt: new Date(),
      };

      if (existing) {
        await prisma.block.update({
          where: { id: target.id },
          data: blockData,
        });
      } else {
        await prisma.block.create({
          data: {
            id: target.id,
            ...blockData,
          },
        });
      }
    }

    // Capture a new version entry representing this restore event
    await prisma.documentVersion.create({
      data: {
        documentId: id,
        createdById: user.id,
        title: `Restored: ${version.title}`,
        snapshot: version.snapshot,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Restore version error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
