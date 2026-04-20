import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const slug = params.path[0];
  const rest = params.path.slice(1);
  const filePath = path.join(UPLOADS_DIR, slug, ...rest);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "文件未找到" }, { status: 404 });
  }

  const ext = path.extname(filePath);
  const mimeTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".pdf": "application/pdf",
  };

  const contentType = mimeTypes[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  return new NextResponse(content, {
    headers: { "Content-Type": contentType },
  });
}
