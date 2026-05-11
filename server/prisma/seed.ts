import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

async function seed() {
  console.log('🌱 Seeding database with Domain System...');

  try {
    // 1. Clear existing specific tables if needed (optional, but good for clean seed)
    // Be careful with this in production. For dev, it's usually fine if we use upsert or ignore.
    
    // 2. Seed Domains
    const domains = [
      { slug: 'dsa', name: 'Data Structures & Algorithms', icon: '🧮', description: 'Master the core building blocks of software engineering.', color: '#4F46E5', sortOrder: 1 },
      { slug: 'cp', name: 'Competitive Programming', icon: '⚔️', description: 'Train your problem-solving speed and algorithmic thinking.', color: '#DC2626', sortOrder: 2 },
      { slug: 'web-dev', name: 'Web Development', icon: '🌐', description: 'Learn to build modern, interactive web applications.', color: '#059669', sortOrder: 3 },
      { slug: 'ai-ml', name: 'AI & Machine Learning', icon: '🤖', description: 'Explore neural networks, data science, and intelligent systems.', color: '#7C3AED', sortOrder: 4 },
      { slug: 'cybersec', name: 'Cybersecurity', icon: '🔐', description: 'Defend systems, learn cryptography, and hack ethically.', color: '#D97706', sortOrder: 5 },
      { slug: 'databases', name: 'Databases', icon: '🗄️', description: 'Design robust schemas and master SQL/NoSQL systems.', color: '#2563EB', sortOrder: 6 },
      { slug: 'sys-design', name: 'System Design', icon: '🏗️', description: 'Architect scalable, distributed, and highly available systems.', color: '#DB2777', sortOrder: 7 },
      { slug: 'general', name: 'General Sciences', icon: '🔬', description: 'Classic topics in Physics, Chemistry, and Mathematics.', color: '#475569', sortOrder: 8 },
    ];

    console.log('Creating domains...');
    for (const d of domains) {
      await prisma.domain.upsert({
        where: { slug: d.slug },
        update: d,
        create: d,
      });
    }

    // Get created domains for their IDs
    const dbDomains = await prisma.domain.findMany();
    const domainMap = Object.fromEntries(dbDomains.map((d: any) => [d.slug, d.id]));

    // 3. Seed Topics
    const newTopics = [
      // General (Legacy topics mapping to Level 1 and 2)
      { domainId: domainMap['general'], subject: 'Physics', topic: 'Thermodynamics', subtopic: 'Laws of thermodynamics', levelOrder: 1 },
      { domainId: domainMap['general'], subject: 'Physics', topic: 'Thermodynamics', subtopic: 'Carnot cycle', levelOrder: 2 },
      { domainId: domainMap['general'], subject: 'Physics', topic: 'Mechanics', subtopic: "Newton's laws of motion", levelOrder: 1 },
      { domainId: domainMap['general'], subject: 'Physics', topic: 'Electromagnetism', subtopic: 'Electromagnetic induction', levelOrder: 2 },
      { domainId: domainMap['general'], subject: 'Physics', topic: 'Optics', subtopic: 'Wave optics', levelOrder: 2 },
      { domainId: domainMap['general'], subject: 'Physics', topic: 'Modern Physics', subtopic: 'Quantum numbers', levelOrder: 2 },
      { domainId: domainMap['general'], subject: 'Chemistry', topic: 'Organic Chemistry', subtopic: 'Organic reactions', levelOrder: 2 },
      { domainId: domainMap['general'], subject: 'Chemistry', topic: 'Electrochemistry', subtopic: 'Electrochemical cells', levelOrder: 2 },
      { domainId: domainMap['general'], subject: 'Chemistry', topic: 'Chemical Bonding', subtopic: 'Molecular orbital theory', levelOrder: 1 },
      { domainId: domainMap['general'], subject: 'Chemistry', topic: 'Thermochemistry', subtopic: 'Enthalpy and entropy', levelOrder: 1 },
      { domainId: domainMap['general'], subject: 'Maths', topic: 'Calculus', subtopic: 'Differential calculus', levelOrder: 2 },
      { domainId: domainMap['general'], subject: 'Maths', topic: 'Calculus', subtopic: 'Integral calculus', levelOrder: 2 },
      { domainId: domainMap['general'], subject: 'Maths', topic: 'Algebra', subtopic: 'Matrices and determinants', levelOrder: 1 },
      { domainId: domainMap['general'], subject: 'Maths', topic: 'Probability', subtopic: 'Bayes theorem', levelOrder: 2 },
      { domainId: domainMap['general'], subject: 'Maths', topic: 'Coordinate Geometry', subtopic: 'Conic sections', levelOrder: 1 },
      
      // DSA
      { domainId: domainMap['dsa'], subject: 'DSA', topic: 'Arrays', subtopic: 'Array traversal and manipulation', levelOrder: 1 },
      { domainId: domainMap['dsa'], subject: 'DSA', topic: 'Strings', subtopic: 'String matching algorithms', levelOrder: 1 },
      { domainId: domainMap['dsa'], subject: 'DSA', topic: 'Linked Lists', subtopic: 'Singly and doubly linked lists', levelOrder: 2 },
      { domainId: domainMap['dsa'], subject: 'DSA', topic: 'Stacks & Queues', subtopic: 'LIFO and FIFO operations', levelOrder: 2 },
      { domainId: domainMap['dsa'], subject: 'DSA', topic: 'Trees', subtopic: 'Binary search trees', levelOrder: 3 },
      { domainId: domainMap['dsa'], subject: 'DSA', topic: 'Graphs', subtopic: 'Breadth-first and depth-first search', levelOrder: 3 },
      { domainId: domainMap['dsa'], subject: 'DSA', topic: 'Dynamic Programming', subtopic: 'Memoization and tabulation', levelOrder: 4 },
      
      // Web Dev
      { domainId: domainMap['web-dev'], subject: 'Web Dev', topic: 'HTML Basics', subtopic: 'Semantic HTML5', levelOrder: 1 },
      { domainId: domainMap['web-dev'], subject: 'Web Dev', topic: 'CSS Fundamentals', subtopic: 'Flexbox and Grid', levelOrder: 1 },
      { domainId: domainMap['web-dev'], subject: 'Web Dev', topic: 'JavaScript Core', subtopic: 'Closures and Promises', levelOrder: 2 },
      { domainId: domainMap['web-dev'], subject: 'Web Dev', topic: 'DOM Manipulation', subtopic: 'Event delegation', levelOrder: 2 },
      { domainId: domainMap['web-dev'], subject: 'Web Dev', topic: 'React Fundamentals', subtopic: 'State and Props', levelOrder: 3 },
      { domainId: domainMap['web-dev'], subject: 'Web Dev', topic: 'REST APIs', subtopic: 'HTTP methods and status codes', levelOrder: 3 },
      { domainId: domainMap['web-dev'], subject: 'Web Dev', topic: 'Full Stack Patterns', subtopic: 'Authentication strategies', levelOrder: 4 },

      // AI/ML
      { domainId: domainMap['ai-ml'], subject: 'AI/ML', topic: 'Python for ML', subtopic: 'NumPy and Pandas basics', levelOrder: 1 },
      { domainId: domainMap['ai-ml'], subject: 'AI/ML', topic: 'Statistics & Probability', subtopic: 'Normal distribution', levelOrder: 1 },
      { domainId: domainMap['ai-ml'], subject: 'AI/ML', topic: 'Linear Regression', subtopic: 'Gradient descent', levelOrder: 2 },
      { domainId: domainMap['ai-ml'], subject: 'AI/ML', topic: 'Classification', subtopic: 'Logistic regression', levelOrder: 2 },
      { domainId: domainMap['ai-ml'], subject: 'AI/ML', topic: 'Neural Networks', subtopic: 'Backpropagation', levelOrder: 3 },
      { domainId: domainMap['ai-ml'], subject: 'AI/ML', topic: 'Deep Learning', subtopic: 'Convolutional Neural Networks', levelOrder: 4 },
    ];

    console.log('Creating topics...');
    // Clear dependent tables first to avoid foreign key constraint errors
    await prisma.questionAttempt.deleteMany({});
    await prisma.gameSession.deleteMany({});
    await prisma.studyPlan.deleteMany({});
    await prisma.testQuestion.deleteMany({});
    await prisma.test.deleteMany({});
    await prisma.masteryScore.deleteMany({});
    
    // Clear topics first to re-seed cleanly
    await prisma.topic.deleteMany({});
    
    for (const t of newTopics) {
      await prisma.topic.create({ data: t });
    }

    // 4. Seed Achievements
    const achievements = [
      { slug: 'first_blood', name: 'First Blood', description: 'Complete your first game', icon: '🩸', category: 'general', xpReward: 50, condition: '{"type":"game_count","value":1}' },
      { slug: 'perfect_score', name: 'Perfect Score', description: 'Score 100% on any game', icon: '⭐', category: 'general', xpReward: 100, condition: '{"type":"perfect_score"}' },
      { slug: 'speed_demon', name: 'Speed Demon', description: 'Complete a game in under 30s', icon: '⚡', category: 'general', xpReward: 75, condition: '{"type":"speed_run","seconds":30}' },
      { slug: 'domain_explorer', name: 'Domain Explorer', description: 'Start 3 different domains', icon: '🧭', category: 'domain', xpReward: 150, condition: '{"type":"domain_count","value":3}' },
      { slug: 'level_up', name: 'Level Up!', description: 'Reach Level 2 in any domain', icon: '🆙', category: 'domain', xpReward: 100, condition: '{"type":"domain_level","value":2}' },
      { slug: 'game_variety', name: 'Game Variety', description: 'Play all 7 game types', icon: '🎲', category: 'general', xpReward: 200, condition: '{"type":"game_variety","value":7}' },
      { slug: 'dsa_warrior', name: 'DSA Warrior', description: 'Complete all DSA Level 1 topics', icon: '⚔️', category: 'domain', xpReward: 300, condition: '{"type":"domain_mastery","domain":"dsa","level":1}' },
      { slug: 'web_hero', name: 'Full Stack Hero', description: 'Complete all Web Dev Level 1 topics', icon: '🦸', category: 'domain', xpReward: 300, condition: '{"type":"domain_mastery","domain":"web-dev","level":1}' },
      { slug: 'night_owl', name: 'Night Owl', description: 'Play a game after midnight', icon: '🦉', category: 'general', xpReward: 50, condition: '{"type":"time_of_day","hour":0}' },
    ];

    console.log('Creating achievements...');
    for (const a of achievements) {
      await prisma.achievement.upsert({
        where: { slug: a.slug },
        update: a,
        create: a,
      });
    }

    // 5. Seed Users
    const passwordHash = await bcrypt.hash('password', 10);
    
    // Create or find users
    const users = [
      { email: 'student@example.com', name: 'Test Student', role: 'STUDENT' as const },
      { email: 'college@example.com', name: 'College Student', role: 'COLLEGE_STUDENT' as const },
      { email: 'educator@example.com', name: 'Test Educator', role: 'EDUCATOR' as const }
    ];

    console.log('Creating users...');
    for (const u of users) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: { ...u, passwordHash }
      });
    }

    console.log(`✅ Seeded ${domains.length} domains`);
    console.log(`✅ Seeded ${newTopics.length} topics`);
    console.log(`✅ Seeded ${achievements.length} achievements`);
    console.log(`✅ Seeded ${users.length} users`);

    // 6. Seed Interview Prep Data
    console.log('🌱 Seeding Interview Preparation Module...');
    
    // Clear old interview data
    await prisma.userInterviewProgress.deleteMany({});
    await prisma.interviewTheory.deleteMany({});
    await prisma.interviewQuestion.deleteMany({});
    await prisma.interviewTopic.deleteMany({});
    await prisma.interviewCategory.deleteMany({});

    // Read JSON files
    const questionsPath = 'c:/Users/Lenovo/Downloads/aptitude_book_470_solved (1).json';
    const theoryPath = 'c:/Users/Lenovo/Downloads/topic_theory_notes.json';
    
    if (fs.existsSync(questionsPath) && fs.existsSync(theoryPath)) {
      const questionsData = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
      const theoryData = JSON.parse(fs.readFileSync(theoryPath, 'utf8'));

      // Categories map: section -> { name, slug }
      const categoryMap = {
        'A': { name: 'Quantitative Aptitude', slug: 'quantitative-aptitude', icon: '🔢', description: 'Mathematical and numerical problem solving.' },
        'B': { name: 'Logical Reasoning', slug: 'logical-reasoning', icon: '🧩', description: 'Pattern recognition, logical deduction and puzzles.' },
        'C': { name: 'Verbal Ability', slug: 'verbal-ability', icon: '📝', description: 'Grammar, vocabulary, and reading comprehension.' }
      };

      const createdCategories: Record<string, string> = {};
      
      console.log('Creating Interview Categories...');
      for (const [section, data] of Object.entries(categoryMap)) {
        const cat = await prisma.interviewCategory.create({
          data: {
            section,
            name: data.name,
            slug: data.slug,
            icon: data.icon,
            description: data.description,
            sortOrder: section === 'A' ? 1 : section === 'B' ? 2 : 3
          }
        });
        createdCategories[section] = cat.id;
      }

      console.log('Creating Interview Topics and Questions...');
      // Group questions by topic
      const topicsBySection: Record<string, Record<string, any[]>> = {}; // { 'A': { 'Number System': [questions] } }
      for (const q of questionsData) {
        if (!topicsBySection[q.section]) topicsBySection[q.section] = {};
        if (!topicsBySection[q.section][q.topic]) topicsBySection[q.section][q.topic] = [];
        topicsBySection[q.section][q.topic].push(q);
      }

      for (const section of Object.keys(topicsBySection)) {
        const categoryId = createdCategories[section];
        const topics = topicsBySection[section];
        
        let topicSort = 1;
        for (const [topicName, qs] of Object.entries(topics)) {
          const slug = topicName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          
          const createdTopic = await prisma.interviewTopic.create({
            data: {
              name: topicName,
              slug,
              categoryId,
              sortOrder: topicSort++
            }
          });

          // Create questions for this topic
          const questionsToInsert = qs.map((q: any) => ({
            topicId: createdTopic.id,
            questionNumber: q.question_number,
            question: q.question,
            optionA: q.option_a,
            optionB: q.option_b,
            optionC: q.option_c,
            optionD: q.option_d,
            optionE: q.option_e || null,
            correctAnswer: q.correct_answer,
            correctIndex: q.correct_index,
            difficulty: q.difficulty || 'medium',
            sourceRef: q.source || null
          }));

          await prisma.interviewQuestion.createMany({
            data: questionsToInsert
          });

          // Check if theory exists for this topic
          const theoryMatch = theoryData.find((t: any) => t.topic === topicName && t.section === section);
          if (theoryMatch) {
            await prisma.interviewTheory.create({
              data: {
                topicId: createdTopic.id,
                rawTheory: theoryMatch.raw_theory || '',
                keyPoints: theoryMatch.quick_notes?.keyPoints || [],
                formulas: theoryMatch.quick_notes?.formulas || [],
                tutorialSections: theoryMatch.tutorial_sections || [],
                formulaCount: theoryMatch.formula_count || 0,
                exampleCount: theoryMatch.example_count || 0,
                conceptCount: theoryMatch.concept_count || 0
              }
            });
          }
        }
      }
      console.log(`✅ Seeded ${questionsData.length} Interview Questions and ${theoryData.length} Theory Entries`);
    } else {
      console.log('⚠️ Skipping Interview Prep seeding: JSON files not found in Downloads folder.');
    }

    console.log('🎉 Seeding complete!');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
