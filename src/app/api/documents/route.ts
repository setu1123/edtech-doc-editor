import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

// GET /api/documents - List documents the user has access to
export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const memberships = await prisma.documentMember.findMany({
      where: { userId: user.id },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            ownerId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const documents = memberships.map((m) => ({
      ...m.document,
      role: m.role,
    }));

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("List documents error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/documents - Create a new document
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title } = await request.json();
    if (!title) {
      return NextResponse.json({ error: "Missing document title" }, { status: 400 });
    }

    const document = await prisma.document.create({
      data: {
        title,
        ownerId: user.id,
        members: {
          create: {
            userId: user.id,
            role: "OWNER",
          },
        },
        // Initialize with a default welcome block
        blocks: {
          create: {
            id: "block_welcome_" + Math.random().toString(36).substring(2, 11),
            type: "heading",
            content: title,
            positionKey: "m",
            lamportClock: 1,
            clientId: "server",
            lastModifiedBy: user.id,
          },
        },
      },
    });

    return NextResponse.json({ document });
  } catch (error) {
    console.error("Create document error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
