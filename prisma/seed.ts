import { PrismaClient } from "/Users/techdou/Project/edumanager/src/generated/prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.user.count();
  if (count === 0) {
    const hash = await bcrypt.hash("admin123", 10);
    await prisma.user.create({
      data: { username: "admin", password: hash, role: "admin" },
    });
    console.log("✅ Created default admin: admin / admin123");
  } else {
    console.log("Users already exist, skipping seed");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());