import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

// GET /api/documents/[id]/collaborators - List all collaborators
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

    const collaborators = await prisma.documentMember.findMany({
      where: { documentId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ collaborators });
  } catch (error) {
    console.error("List collaborators error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/documents/[id]/collaborators - Add or update a collaborator's role
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

    // Only OWNER can add/modify collaborators
    const selfMembership = await prisma.documentMember.findUnique({
      where: {
        documentId_userId: {
          documentId: id,
          userId: user.id,
        },
      },
    });

    if (!selfMembership || selfMembership.role !== "OWNER") {
      return NextResponse.json({ error: "Only the document owner can manage collaborators" }, { status: 403 });
    }

    const { email, role } = await request.json();
    if (!email || !role) {
      return NextResponse.json({ error: "Email and role are required" }, { status: 400 });
    }

    if (!["OWNER", "EDITOR", "VIEWER"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Find the target user by email
    const targetUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Upsert membership
    const collaborator = await prisma.documentMember.upsert({
      where: {
        documentId_userId: {
          documentId: id,
          userId: targetUser.id,
        },
      },
      update: { role },
      create: {
        documentId: id,
        userId: targetUser.id,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ collaborator });
  } catch (error) {
    console.error("Manage collaborator error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
