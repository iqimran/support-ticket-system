import "dotenv/config";
import { E2E_ADMIN, E2E_TEAM_MEMBER } from "./fixtures";
import { hashPassword } from "../src/server/auth/password";
import { prisma } from "../src/server/db/prisma";

async function main() {
  const [adminHash, teamMemberHash] = await Promise.all([
    hashPassword(E2E_ADMIN.password),
    hashPassword(E2E_TEAM_MEMBER.password),
  ]);

  await prisma.user.upsert({
    where: { phone: E2E_ADMIN.phone },
    update: { isActive: true, role: "ADMIN", passwordHash: adminHash },
    create: { name: "E2E Admin", phone: E2E_ADMIN.phone, passwordHash: adminHash, role: "ADMIN" },
  });

  await prisma.user.upsert({
    where: { phone: E2E_TEAM_MEMBER.phone },
    update: { isActive: true, role: "TEAM_MEMBER", passwordHash: teamMemberHash },
    create: {
      name: "E2E Team Member",
      phone: E2E_TEAM_MEMBER.phone,
      passwordHash: teamMemberHash,
      role: "TEAM_MEMBER",
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
