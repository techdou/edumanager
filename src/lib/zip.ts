import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export function extractZip(buffer: Buffer, zipName: string): { chapters: { title: string; slug: string; path: string; order: number }[] } {
  ensureUploadsDir();
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const targetDir = path.join(UPLOADS_DIR, zipName);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  const chapters: { title: string; slug: string; path: string; order: number }[] = [];
  let order = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const entryPath = entry.entryName;
    if (!entryPath.endsWith(".html") && !entryPath.endsWith(".htm")) continue;

    const dir = path.dirname(entryPath);
    const fileName = path.basename(entryPath, path.extname(entryPath));
    const slug = dir === "." ? fileName : `${dir}/${fileName}`;

    const fullPath = path.join(targetDir, entryPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, entry.getData());

    const title = fileName.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    chapters.push({ title, slug, path: entryPath, order: order++ });
  }

  return { chapters };
}

export function deleteLectureFiles(zipName: string) {
  const targetDir = path.join(UPLOADS_DIR, zipName);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}

export function getUploadsDir() {
  return UPLOADS_DIR;
}
