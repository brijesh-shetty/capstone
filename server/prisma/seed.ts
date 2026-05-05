import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    const topics = [
      { subject: 'Physics',   topic: 'Thermodynamics',     subtopic: 'Laws of thermodynamics' },
      { subject: 'Physics',   topic: 'Thermodynamics',     subtopic: 'Carnot cycle' },
      { subject: 'Physics',   topic: 'Mechanics',          subtopic: "Newton's laws of motion" },
      { subject: 'Physics',   topic: 'Electromagnetism',   subtopic: 'Electromagnetic induction' },
      { subject: 'Physics',   topic: 'Optics',             subtopic: 'Wave optics' },
      { subject: 'Physics',   topic: 'Modern Physics',     subtopic: 'Quantum numbers' },
      { subject: 'Chemistry', topic: 'Organic Chemistry',  subtopic: 'Organic reactions' },
      { subject: 'Chemistry', topic: 'Electrochemistry',   subtopic: 'Electrochemical cells' },
      { subject: 'Chemistry', topic: 'Chemical Bonding',   subtopic: 'Molecular orbital theory' },
      { subject: 'Chemistry', topic: 'Thermochemistry',    subtopic: 'Enthalpy and entropy' },
      { subject: 'Maths',     topic: 'Calculus',           subtopic: 'Differential calculus' },
      { subject: 'Maths',     topic: 'Calculus',           subtopic: 'Integral calculus' },
      { subject: 'Maths',     topic: 'Algebra',            subtopic: 'Matrices and determinants' },
      { subject: 'Maths',     topic: 'Probability',        subtopic: 'Bayes theorem' },
      { subject: 'Maths',     topic: 'Coordinate Geometry',subtopic: 'Conic sections' },
    ];

    for (const t of topics) {
      await prisma.topic.create({ data: t });
    }

    console.log(`✅ Created 15 topics`);

    const passwordHash = await bcrypt.hash('password', 10);
    
    await prisma.user.createMany({
      data: [
        { name: 'Test Student', email: 'student@example.com', passwordHash, role: 'STUDENT' },
        { name: 'College Student', email: 'college@example.com', passwordHash, role: 'COLLEGE_STUDENT' },
        { name: 'Test Educator', email: 'educator@example.com', passwordHash, role: 'EDUCATOR' }
      ]
    });

    console.log(`✅ Created 3 test users`);
    console.log('🎉 Seeding complete!');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
