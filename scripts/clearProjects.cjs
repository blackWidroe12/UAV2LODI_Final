const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.project.count();
  console.log(`Deleting ${count} projects...`);
  await prisma.project.deleteMany();
  console.log('All projects deleted.');
}

main()
  .catch((e) => {
    console.error('Error deleting projects:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
