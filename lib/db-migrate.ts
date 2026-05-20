// lib/db-migrate.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export function runMigrations(prisma: PrismaClient): void {
  seedSuperuser(prisma).catch(err => {
    console.error('[db] Error seeding superuser:', err);
  });
}

async function seedSuperuser(prisma: PrismaClient): Promise<void> {
  const adminEmail = process.env.EMAIL_USER || 'admin@uav2lod1.com';
  const lowercaseEmail = adminEmail.toLowerCase();

  // Find if a user already exists with either this email or the 'admin' username
  const existingEmail = await prisma.user.findUnique({
    where: { email: lowercaseEmail },
  });
  const existingUsername = await prisma.user.findUnique({
    where: { username: 'admin' },
  });

  if (!existingEmail && !existingUsername) {
    const passwordHash = bcrypt.hashSync('tini2026@', 12);
    await prisma.user.create({
      data: {
        email: lowercaseEmail,
        username: 'admin',
        firstName: 'System',
        lastName: 'Admin',
        department: 'Administration',
        passwordHash,
        isEmailVerified: true,
        isActive: true,
      },
    });

    console.log(`[db] Superuser seeded in PostgreSQL — email: ${adminEmail}`);
  } else if (existingUsername && !existingEmail) {
    console.log(`[db] A user with the username 'admin' already exists with a different email address.`);
  }
}
