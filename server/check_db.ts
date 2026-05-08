import 'dotenv/config';
import { prisma } from './src/lib/prisma';

async function check() {
  const count = await prisma.topic.count();
  const subjects = await prisma.topic.groupBy({
    by: ['subject'],
    _count: { _all: true }
  });
  console.log('Total topics:', count);
  console.log('Subjects:', subjects);
  await prisma.$disconnect();
}
check();
