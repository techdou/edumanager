import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { deleteLectureFiles } from "@/lib/zip";

export async function GET() {
  const lectures = await prisma.lecture.findMany({
    include: { category: true, chapters: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(lectures);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { title, slug, categoryId } = await req.json();
  if (!title || !slug || !categoryId) {
    return NextResponse.json({ error: "标题、标识和分类必填" }, { status: 400 });
  }
  const existing = await prisma.lecture.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: "标识已存在" }, { status: 409 });

  const lecture = await prisma.lecture.create({
    data: { title, slug, categoryId },
  });
  return NextResponse.json(lecture);
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少ID" }, { status: 400 });

  const lecture = await prisma.lecture.findUnique({ where: { id } });
  if (lecture) deleteLectureFiles(lecture.zipName);

  await prisma.chapter.deleteMany({ where: { lectureId: id } });
  await prisma.lecture.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
