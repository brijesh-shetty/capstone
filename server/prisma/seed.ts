import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    const quantTopics = [
      // Number System
      { subject: 'Quantitative Aptitude', topic: 'Number System', subtopic: 'Divisibility Rules (3,4,6,7,8,9,11)' },
      { subject: 'Quantitative Aptitude', topic: 'Number System', subtopic: 'Trailing Zeros and Factorials' },
      { subject: 'Quantitative Aptitude', topic: 'Number System', subtopic: 'HCF and LCM' },
      { subject: 'Quantitative Aptitude', topic: 'Number System', subtopic: 'Unit Digit and Cyclicity' },
      { subject: 'Quantitative Aptitude', topic: 'Number System', subtopic: 'Factors — Total, Sum, Product, Odd' },

      // Averages
      { subject: 'Quantitative Aptitude', topic: 'Averages', subtopic: 'Simple Average and Average Speed' },
      { subject: 'Quantitative Aptitude', topic: 'Averages', subtopic: 'Weighted Average and Replacement Problems' },
      { subject: 'Quantitative Aptitude', topic: 'Averages', subtopic: 'Average Age Problems' },

      // Ratio and Proportion
      { subject: 'Quantitative Aptitude', topic: 'Ratio and Proportion', subtopic: 'Ratio Types and Proportion Rules' },
      { subject: 'Quantitative Aptitude', topic: 'Ratio and Proportion', subtopic: 'Compound and Continued Ratios' },
      { subject: 'Quantitative Aptitude', topic: 'Ratio and Proportion', subtopic: 'Alloys and Mixture Ratios' },

      // Percentage
      { subject: 'Quantitative Aptitude', topic: 'Percentage', subtopic: 'Percentage Increase and Decrease' },
      { subject: 'Quantitative Aptitude', topic: 'Percentage', subtopic: 'Population and Depreciation' },
      { subject: 'Quantitative Aptitude', topic: 'Percentage', subtopic: 'Percentage in Elections and Exams' },

      // Time, Speed and Distance
      { subject: 'Quantitative Aptitude', topic: 'Time Speed and Distance', subtopic: 'Basic Speed-Time-Distance' },
      { subject: 'Quantitative Aptitude', topic: 'Time Speed and Distance', subtopic: 'Problems on Trains' },
      { subject: 'Quantitative Aptitude', topic: 'Time Speed and Distance', subtopic: 'Boats and Streams' },
      { subject: 'Quantitative Aptitude', topic: 'Time Speed and Distance', subtopic: 'Problems on Races' },

      // Time and Work
      { subject: 'Quantitative Aptitude', topic: 'Time and Work', subtopic: 'Work Efficiency and Time' },
      { subject: 'Quantitative Aptitude', topic: 'Time and Work', subtopic: 'Pipes and Cisterns' },
      { subject: 'Quantitative Aptitude', topic: 'Time and Work', subtopic: 'Work with Variable Workers' },

      // Alligation and Mixture
      { subject: 'Quantitative Aptitude', topic: 'Alligation and Mixture', subtopic: 'Rule of Alligation and Mean Price' },
      { subject: 'Quantitative Aptitude', topic: 'Alligation and Mixture', subtopic: 'Repeated Replacement and Dilution' },

      // Partnership
      { subject: 'Quantitative Aptitude', topic: 'Partnership', subtopic: 'Simple and Compound Partnership' },
      { subject: 'Quantitative Aptitude', topic: 'Partnership', subtopic: 'Time-Weighted Investment Ratios' },

      // Profit and Loss
      { subject: 'Quantitative Aptitude', topic: 'Profit and Loss', subtopic: 'Cost Price, Selling Price, Profit Percent' },
      { subject: 'Quantitative Aptitude', topic: 'Profit and Loss', subtopic: 'Marked Price, Discount, Successive Discount' },
      { subject: 'Quantitative Aptitude', topic: 'Profit and Loss', subtopic: 'False Weights and Special Loss Problems' },

      // Simple and Compound Interest
      { subject: 'Quantitative Aptitude', topic: 'Simple and Compound Interest', subtopic: 'Simple Interest Formula and Applications' },
      { subject: 'Quantitative Aptitude', topic: 'Simple and Compound Interest', subtopic: 'Compound Interest — Annual, Half-yearly, Quarterly' },
      { subject: 'Quantitative Aptitude', topic: 'Simple and Compound Interest', subtopic: 'Difference between SI and CI' },

      // Problems on Ages
      { subject: 'Quantitative Aptitude', topic: 'Problems on Ages', subtopic: 'Age Equations and Ratio-based Age Problems' },
      { subject: 'Quantitative Aptitude', topic: 'Problems on Ages', subtopic: 'Average Age and Group Age Problems' },

      // Algebra
      { subject: 'Quantitative Aptitude', topic: 'Algebra', subtopic: 'Algebraic Formulae and Identities' },
      { subject: 'Quantitative Aptitude', topic: 'Algebra', subtopic: 'BODMAS, Logarithms and Surds' },
      { subject: 'Quantitative Aptitude', topic: 'Algebra', subtopic: 'Quadratic Equations and Roots' },

      // Set Theory
      { subject: 'Quantitative Aptitude', topic: 'Set Theory', subtopic: 'Union, Intersection and Venn Diagrams' },
      { subject: 'Quantitative Aptitude', topic: 'Set Theory', subtopic: 'De Morgan Laws and Set Problems' },

      // Permutation and Combination
      { subject: 'Quantitative Aptitude', topic: 'Permutation and Combination', subtopic: 'Permutations — with and without Repetition' },
      { subject: 'Quantitative Aptitude', topic: 'Permutation and Combination', subtopic: 'Combinations — Selection Problems' },
      { subject: 'Quantitative Aptitude', topic: 'Permutation and Combination', subtopic: 'Circular Arrangement and Word Formation' },

      // Probability
      { subject: 'Quantitative Aptitude', topic: 'Probability', subtopic: 'Basic Probability — Coins, Dice, Cards' },
      { subject: 'Quantitative Aptitude', topic: 'Probability', subtopic: 'Conditional Probability and Combined Events' },

      // Geometry and Mensuration
      { subject: 'Quantitative Aptitude', topic: 'Geometry and Mensuration', subtopic: '2D Figures — Area and Perimeter' },
      { subject: 'Quantitative Aptitude', topic: 'Geometry and Mensuration', subtopic: '3D Figures — Volume and Surface Area' },
      { subject: 'Quantitative Aptitude', topic: 'Geometry and Mensuration', subtopic: 'Triangle Properties and Quadrilateral Results' },

      // Data Interpretation
      { subject: 'Quantitative Aptitude', topic: 'Data Interpretation', subtopic: 'Table Chart Interpretation' },
      { subject: 'Quantitative Aptitude', topic: 'Data Interpretation', subtopic: 'Line Graph and Bar Chart Interpretation' },
      { subject: 'Quantitative Aptitude', topic: 'Data Interpretation', subtopic: 'Pie Chart and Data Sufficiency' },
    ];

    const logicalTopics = [
      // Number-based Reasoning
      { subject: 'Logical Reasoning', topic: 'Number Series', subtopic: 'Missing Number Series and Pattern Detection' },
      { subject: 'Logical Reasoning', topic: 'Number Analogy', subtopic: 'Number Relationship and Analogy Pairs' },
      { subject: 'Logical Reasoning', topic: 'Alphanumeric Problems', subtopic: 'Alphanumeric Sequence Analysis' },

      // Visual and Symbol Reasoning
      { subject: 'Logical Reasoning', topic: 'Letter and Symbol Series', subtopic: 'Letter Series and Symbol Patterns' },
      { subject: 'Logical Reasoning', topic: 'Coding and Decoding', subtopic: 'Letter Coding and Decoding' },
      { subject: 'Logical Reasoning', topic: 'Coding and Decoding', subtopic: 'Symbol and Number Coding' },

      // Spatial Reasoning
      { subject: 'Logical Reasoning', topic: 'Cubes and Dice', subtopic: 'Cube Painting and Cutting' },
      { subject: 'Logical Reasoning', topic: 'Cubes and Dice', subtopic: 'Dice Face Positions and Opposite Faces' },
      { subject: 'Logical Reasoning', topic: 'Visual Sequence', subtopic: 'Figure Pattern Completion and Mirror Images' },

      // Relational Reasoning
      { subject: 'Logical Reasoning', topic: 'Blood Relations', subtopic: 'Blood Relation Statement Problems' },
      { subject: 'Logical Reasoning', topic: 'Blood Relations', subtopic: 'Coded Blood Relation Diagrams' },
      { subject: 'Logical Reasoning', topic: 'Direction Sense', subtopic: 'Direction and Distance Problems' },
      { subject: 'Logical Reasoning', topic: 'Seating Arrangement', subtopic: 'Linear Seating Arrangement' },
      { subject: 'Logical Reasoning', topic: 'Seating Arrangement', subtopic: 'Circular and Square Table Arrangement' },

      // Deductive and Analytical Reasoning
      { subject: 'Logical Reasoning', topic: 'Syllogism', subtopic: 'Two and Three Statement Syllogism' },
      { subject: 'Logical Reasoning', topic: 'Deductive Reasoning', subtopic: 'Logical Deduction from Premises' },
      { subject: 'Logical Reasoning', topic: 'Statement and Assumptions', subtopic: 'Implicit Assumptions in Statements' },
      { subject: 'Logical Reasoning', topic: 'Statement and Arguments', subtopic: 'Strong vs Weak Arguments' },
      { subject: 'Logical Reasoning', topic: 'Statement and Conclusions', subtopic: 'Logical Conclusions from Statements' },
      { subject: 'Logical Reasoning', topic: 'Cause and Effect', subtopic: 'Cause-Effect Relationship between Statements' },
      { subject: 'Logical Reasoning', topic: 'Course of Action', subtopic: 'Appropriate Course of Action Problems' },

      // Special Topics
      { subject: 'Logical Reasoning', topic: 'Logical Reasoning Puzzles', subtopic: 'Constraint-based Logic Puzzles' },
      { subject: 'Logical Reasoning', topic: 'Binary Logic', subtopic: 'Truth Teller, Liar and Alternator Problems' },
      { subject: 'Logical Reasoning', topic: 'Cryptarithmetic', subtopic: 'Letter-to-Digit Substitution Puzzles' },
      { subject: 'Logical Reasoning', topic: 'Machine Input and Output', subtopic: 'Number and Word Rearrangement Machines' },
      { subject: 'Logical Reasoning', topic: 'Clocks', subtopic: 'Clock Angle, Time and Gain-Loss Problems' },
      { subject: 'Logical Reasoning', topic: 'Calendars', subtopic: 'Day of the Week and Calendar Calculations' },
      { subject: 'Logical Reasoning', topic: 'Flowchart', subtopic: 'Flowchart Tracing and Logic' },
    ];

    const verbalTopics = [
      // Reading Comprehension
      { subject: 'Verbal Ability', topic: 'Reading Comprehension', subtopic: 'Main Theme and Author Tone' },
      { subject: 'Verbal Ability', topic: 'Reading Comprehension', subtopic: 'Inference and Implicit Meaning' },
      { subject: 'Verbal Ability', topic: 'Reading Comprehension', subtopic: 'Error Spotting in Passage Sentences' },

      // Grammar
      { subject: 'Verbal Ability', topic: 'Grammar', subtopic: 'Sentence Correction and Error Spotting' },
      { subject: 'Verbal Ability', topic: 'Grammar', subtopic: 'Sentence Improvement with Phrasal Verbs' },
      { subject: 'Verbal Ability', topic: 'Grammar', subtopic: 'Sentence Completion with Correct Words' },
      { subject: 'Verbal Ability', topic: 'Grammar', subtopic: 'Identify the Correct Sentence' },

      // Vocabulary
      { subject: 'Verbal Ability', topic: 'Vocabulary', subtopic: 'Synonyms in Context' },
      { subject: 'Verbal Ability', topic: 'Vocabulary', subtopic: 'Antonyms in Context' },
      { subject: 'Verbal Ability', topic: 'Vocabulary', subtopic: 'One-Word Substitution' },
      { subject: 'Verbal Ability', topic: 'Vocabulary', subtopic: 'Fill in the Blank with Correct Word' },

      // Verbal Reasoning
      { subject: 'Verbal Ability', topic: 'Verbal Reasoning', subtopic: 'Verbal Analogy — Word Relationships' },
      { subject: 'Verbal Ability', topic: 'Verbal Reasoning', subtopic: 'Verbal Classification — Odd One Out' },
      { subject: 'Verbal Ability', topic: 'Verbal Reasoning', subtopic: 'Logical Sequence of Words' },

      // Sentence Arrangement
      { subject: 'Verbal Ability', topic: 'Sentence Arrangement', subtopic: 'Jumbled Sentence Rearrangement' },
      { subject: 'Verbal Ability', topic: 'Sentence Arrangement', subtopic: 'Para-jumbles — P Q R S Ordering' },

      // Idioms and Phrases
      { subject: 'Verbal Ability', topic: 'Idioms and Phrases', subtopic: 'Business and Common Idioms' },
    ];

    const topics = [...quantTopics, ...logicalTopics, ...verbalTopics];

    for (const t of topics) {
      const existing = await prisma.topic.findFirst({
        where: { subtopic: t.subtopic }
      });
      if (!existing) {
        await prisma.topic.create({ data: t });
      }
    }

    console.log(`✅ Seeded ${topics.length} topics`);

    const passwordHash = await bcrypt.hash('password', 10);
    
    const users = [
      { name: 'Test Student', email: 'student@example.com', role: 'STUDENT' as const },
      { name: 'College Student', email: 'college@example.com', role: 'COLLEGE_STUDENT' as const },
      { name: 'Test Educator', email: 'educator@example.com', role: 'EDUCATOR' as const }
    ];

    for (const u of users) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: {
          name: u.name,
          email: u.email,
          passwordHash,
          role: u.role,
        }
      });
    }

    console.log(`✅ Created 3 test users`);
    console.log('🎉 Seeding complete!');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
