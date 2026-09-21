import "dotenv/config";
import { E2E_ADMIN, E2E_TEAM_MEMBER } from "./fixtures";
import { normalizeBangladeshiPhone } from "../src/lib/phone";
import { hashPassword } from "../src/server/auth/password";
import { prisma } from "../src/server/db/prisma";

// User.phone is always stored in normalized E.164 form (see src/lib/phone.ts)
// and the login server action normalizes its input the same way before
// querying — so a fixture seeded with the raw local-format number here would
// silently create an account no login attempt could ever match.
function normalizeOrThrow(rawPhone: string): string {
  const normalized = normalizeBangladeshiPhone(rawPhone);
  if (!normalized) throw new Error(`Fixture phone "${rawPhone}" is not a valid Bangladeshi mobile number`);
  return normalized;
}

async function main() {
  const [adminHash, teamMemberHash] = await Promise.all([
    hashPassword(E2E_ADMIN.password),
    hashPassword(E2E_TEAM_MEMBER.password),
  ]);
  const adminPhone = normalizeOrThrow(E2E_ADMIN.phone);
  const teamMemberPhone = normalizeOrThrow(E2E_TEAM_MEMBER.phone);

  await prisma.user.upsert({
    where: { phone: adminPhone },
    update: { isActive: true, role: "ADMIN", passwordHash: adminHash },
    create: { name: "E2E Admin", phone: adminPhone, passwordHash: adminHash, role: "ADMIN" },
  });

  await prisma.user.upsert({
    where: { phone: teamMemberPhone },
    update: { isActive: true, role: "TEAM_MEMBER", passwordHash: teamMemberHash },
    create: {
      name: "E2E Team Member",
      phone: teamMemberPhone,
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
