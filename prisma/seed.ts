import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeBangladeshiPhone } from "../src/lib/phone";

const prisma = new PrismaClient();

async function main() {
  const rawPhone = process.env.SEED_ADMIN_PHONE ?? "01700000000";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_ADMIN_NAME ?? "System Admin";

  const phone = normalizeBangladeshiPhone(rawPhone);
  if (!phone) {
    throw new Error(`SEED_ADMIN_PHONE "${rawPhone}" is not a valid Bangladeshi mobile number`);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: {
      name,
      phone,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log(`Seeded admin user "${admin.name}" (phone: ${admin.phone}, id: ${admin.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
