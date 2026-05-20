import { PrismaClient } from '@prisma/client';
import { runMigrations } from './db-migrate';

let initialised = false;

export function ensureDbInitialised(prisma: PrismaClient): void {
  if (!initialised) {
    runMigrations(prisma);
    initialised = true;
  }
}
