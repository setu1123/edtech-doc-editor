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

    // Check membership (scoping/RLS simulation)
    const membership = await prisma.documentMember.findUnique({
      where: {
        documentId_userId: {
          documentId: id,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
    }

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        blocks: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      document,
      userRole: membership.role,
    });
  } catch (error) {
    console.error("Get document error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
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
      return NextResponse.json({ error: "Unauthorized operation" }, { status: 403 });
    }

    const { title } = await request.json();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const document = await prisma.document.update({
      where: { id },
      data: { title },
    });

    return NextResponse.json({ document });
  } catch (error) {
    console.error("Update document error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
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

    // Only OWNER can delete
    if (!membership || membership.role !== "OWNER") {
      return NextResponse.json({ error: "Only the owner can delete the document" }, { status: 403 });
    }

    await prisma.document.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete document error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
