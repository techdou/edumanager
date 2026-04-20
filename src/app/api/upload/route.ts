import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { extractZip } from "@/lib/zip";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const categoryId = formData.get("categoryId") as string;

  if (!file || !title || !slug || !categoryId) {
    return NextResponse.json({ error: "所有字段必填" }, { status: 400 });
  }
  if (!file.name.endsWith(".zip")) {
    return NextResponse.json({ error: "仅支持ZIP文件" }, { status: 400 });
  }

  const existing = await prisma.lecture.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: "标识已存在" }, { status: 409 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const zipName = slug;
  const { chapters } = extractZip(buffer, zipName);

  const lecture = await prisma.lecture.create({
    data: {
      title,
      slug,
      zipName,
      categoryId,
      chapters: { create: chapters },
    },
    include: { chapters: true },
  });

  return NextResponse.json(lecture);
}
