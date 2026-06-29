import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
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

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: id },
      include: {
        createdBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ versions });
  } catch (error) {
    console.error("List versions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
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
      return NextResponse.json({ error: "Unauthorized to capture versions" }, { status: 403 });
    }

    const { title } = await request.json();
    if (!title) {
      return NextResponse.json({ error: "Version title is required" }, { status: 400 });
    }

    // Get current blocks in correct order
    const blocks = await prisma.block.findMany({
      where: { documentId: id },
      orderBy: { positionKey: "asc" },
    });

    const snapshotJson = JSON.stringify(blocks);

    const version = await prisma.documentVersion.create({
      data: {
        documentId: id,
        createdById: user.id,
        title,
        snapshot: snapshotJson,
      },
    });

    return NextResponse.json({ version });
  } catch (error) {
    console.error("Create version error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
