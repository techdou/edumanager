import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export async function verifyCredentials(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;
  return { id: user.id, username: user.username, role: user.role };
}

export async function seedAdmin() {
  const count = await prisma.user.count();
  if (count === 0) {
    const hash = await bcrypt.hash("admin123", 10);
    await prisma.user.create({
      data: { username: "admin", password: hash, role: "admin" },
    });
  }
}
