import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Seeds company pattern PROFILES — facts about round structure, topic emphasis
// and interview style. No copyrighted question text is stored or reproduced;
// company tests are assembled from our OWN verified question bank, weighted by
// these profiles.
//
// To scale to many companies, most entries reuse an ARCHETYPE template
// (service-based / product-sde / analyst / banking) and only override the few
// fields that differ. Adding a company is then 3–4 lines.

const POLICY_NOTE =
  'Pattern profile compiled from publicly known placement-round structure. Tests are built from our own bank.';

type Archetype = 'service-based' | 'product-sde' | 'analyst' | 'banking';

function archetypeProfile(archetype: Archetype): any {
  switch (archetype) {
    case 'service-based':
      return {
        durationMinutes: 90,
        negativeMarking: 0.25,
        passScore: 60,
        rounds: [
          { title: 'Quantitative Aptitude', kind: 'APTITUDE', category: 'QUANTITATIVE', strategy: 'RANDOM', count: 10, difficultyMix: { EASY: 0.3, MEDIUM: 0.5, HARD: 0.2 } },
          { title: 'Logical Reasoning', kind: 'LOGICAL', category: 'LOGICAL', strategy: 'RANDOM', count: 8, difficultyMix: { EASY: 0.3, MEDIUM: 0.5, HARD: 0.2 } },
          { title: 'Verbal Ability', kind: 'VERBAL', category: 'VERBAL', strategy: 'RANDOM', count: 8 },
          { title: 'Coding', kind: 'CODING', category: 'CODING', strategy: 'RANDOM', count: 2, marksPerQuestion: 10 },
        ],
        interviewStyle:
          'Service-company style: blend HR/behavioral with fundamentals. Probe willingness to relocate, learnability, project explanations, and core CS basics (OOP, DBMS, one coding language). Friendly, structured tone.',
      };
    case 'product-sde':
      return {
        durationMinutes: 90,
        negativeMarking: 0,
        passScore: 70,
        rounds: [
          { title: 'Quantitative Aptitude', kind: 'APTITUDE', category: 'QUANTITATIVE', strategy: 'RANDOM', count: 6, difficultyMix: { EASY: 0.2, MEDIUM: 0.5, HARD: 0.3 } },
          { title: 'Logical Reasoning', kind: 'LOGICAL', category: 'LOGICAL', strategy: 'RANDOM', count: 6, difficultyMix: { EASY: 0.2, MEDIUM: 0.5, HARD: 0.3 } },
          { title: 'Coding', kind: 'CODING', category: 'CODING', strategy: 'RANDOM', count: 2, marksPerQuestion: 20, difficultyMix: { EASY: 0.2, MEDIUM: 0.5, HARD: 0.3 } },
        ],
        interviewStyle:
          'Product/SDE style: data-structures-and-algorithms focused. Expect to think aloud, discuss time/space complexity, edge cases, and trade-offs. Light system-design and behavioral (ownership, bias for action). Direct, technical tone.',
      };
    case 'analyst':
      return {
        durationMinutes: 60,
        negativeMarking: 0.25,
        passScore: 60,
        rounds: [
          { title: 'Quantitative & Data Interpretation', kind: 'APTITUDE', category: 'QUANTITATIVE', strategy: 'RANDOM', count: 12, difficultyMix: { EASY: 0.2, MEDIUM: 0.5, HARD: 0.3 } },
          { title: 'Logical Reasoning', kind: 'LOGICAL', category: 'LOGICAL', strategy: 'RANDOM', count: 8, difficultyMix: { EASY: 0.25, MEDIUM: 0.5, HARD: 0.25 } },
          { title: 'Verbal Ability', kind: 'VERBAL', category: 'VERBAL', strategy: 'RANDOM', count: 6 },
        ],
        interviewStyle:
          'Analyst/consulting style: guesstimates, case-style problem solving, and clear structured communication. Probe how you break ambiguous problems into steps and reason with numbers. Crisp, business-like tone.',
      };
    case 'banking':
      return {
        durationMinutes: 60,
        negativeMarking: 0.25,
        passScore: 60,
        rounds: [
          { title: 'Quantitative & Data Interpretation', kind: 'APTITUDE', category: 'QUANTITATIVE', strategy: 'RANDOM', count: 10, difficultyMix: { EASY: 0.2, MEDIUM: 0.5, HARD: 0.3 } },
          { title: 'Logical Reasoning', kind: 'LOGICAL', category: 'LOGICAL', strategy: 'RANDOM', count: 8, difficultyMix: { EASY: 0.25, MEDIUM: 0.5, HARD: 0.25 } },
          { title: 'Verbal Ability', kind: 'VERBAL', category: 'VERBAL', strategy: 'RANDOM', count: 6 },
          { title: 'Coding', kind: 'CODING', category: 'CODING', strategy: 'RANDOM', count: 1, marksPerQuestion: 10 },
        ],
        interviewStyle:
          'Banking/tech style: emphasize integrity, teamwork and client focus. Mix STAR behavioral with practical technology questions (data structures, SQL, system reliability). Professional, structured tone.',
      };
  }
}

interface CompanySeed {
  name: string;
  slug: string;
  archetype: Archetype;
  tracks?: { role: string; archetype: Archetype }[]; // optional role tracks
  overrideProfile?: any; // fully explicit profile (skips archetype)
}

const COMPANIES: CompanySeed[] = [
  { name: 'TCS', slug: 'tcs', archetype: 'service-based' },
  { name: 'Infosys', slug: 'infosys', archetype: 'service-based' },
  { name: 'Wipro', slug: 'wipro', archetype: 'service-based' },
  { name: 'Accenture', slug: 'accenture', archetype: 'service-based' },
  { name: 'Cognizant', slug: 'cognizant', archetype: 'service-based' },
  { name: 'Capgemini', slug: 'capgemini', archetype: 'service-based' },
  {
    name: 'Amazon',
    slug: 'amazon',
    archetype: 'product-sde',
    tracks: [
      { role: 'SDE', archetype: 'product-sde' },
      { role: 'Data/Analyst', archetype: 'analyst' },
    ],
  },
  { name: 'Microsoft', slug: 'microsoft', archetype: 'product-sde' },
  { name: 'Deloitte', slug: 'deloitte', archetype: 'analyst' },
  { name: 'ZS Associates', slug: 'zs-associates', archetype: 'analyst' },
  { name: 'Goldman Sachs', slug: 'goldman-sachs', archetype: 'banking' },
  {
    name: 'JP Morgan',
    slug: 'jp-morgan',
    archetype: 'banking',
    overrideProfile: {
      durationMinutes: 60,
      negativeMarking: 0.25,
      passScore: 60,
      rounds: [
        { title: 'Quantitative & Data Interpretation', kind: 'APTITUDE', category: 'QUANTITATIVE', strategy: 'RANDOM', count: 10, difficultyMix: { EASY: 0.2, MEDIUM: 0.5, HARD: 0.3 } },
        { title: 'Logical Reasoning', kind: 'LOGICAL', category: 'LOGICAL', strategy: 'RANDOM', count: 8, difficultyMix: { EASY: 0.25, MEDIUM: 0.5, HARD: 0.25 } },
        { title: 'Coding', kind: 'CODING', category: 'CODING', strategy: 'RANDOM', count: 1, marksPerQuestion: 10 },
      ],
      interviewStyle:
        'JP Morgan style: emphasize integrity, teamwork and client focus. Mix STAR behavioral questions with practical technology questions (data structures, SQL, system reliability). Probe for ownership of past work and comfort with high-pressure, detail-oriented environments. Professional, structured tone.',
    },
  },
  {
    name: 'Standard Chartered',
    slug: 'standard-chartered',
    archetype: 'banking',
    overrideProfile: {
      durationMinutes: 45,
      negativeMarking: 0,
      passScore: 55,
      rounds: [
        { title: 'Quantitative Aptitude', kind: 'APTITUDE', category: 'QUANTITATIVE', strategy: 'RANDOM', count: 8, difficultyMix: { EASY: 0.4, MEDIUM: 0.5, HARD: 0.1 } },
        { title: 'Verbal Ability', kind: 'VERBAL', category: 'VERBAL', strategy: 'RANDOM', count: 8 },
        { title: 'Logical Reasoning', kind: 'LOGICAL', category: 'LOGICAL', strategy: 'RANDOM', count: 6 },
      ],
      interviewStyle:
        'Standard Chartered style: values-led banking interview. Emphasize the bank\'s "valued behaviours" (do the right thing, better together, never settle), customer empathy, and interest in financial services. Behavioral questions dominate, with light technical questions about data handling and digital banking. Warm but probing tone.',
    },
  },
];

function buildProfile(c: CompanySeed): any {
  const base = c.overrideProfile || archetypeProfile(c.archetype);
  if (c.tracks?.length) {
    base.tracks = c.tracks.map((t) => {
      const tp = archetypeProfile(t.archetype);
      return { role: t.role, rounds: tp.rounds, interviewStyle: tp.interviewStyle };
    });
  }
  return base;
}

async function main() {
  for (const c of COMPANIES) {
    const profile = buildProfile(c);
    await prisma.company.upsert({
      where: { slug: c.slug },
      update: { name: c.name, notes: POLICY_NOTE, profile: profile as any },
      create: { name: c.name, slug: c.slug, notes: POLICY_NOTE, profile: profile as any },
    });
    console.log(
      `upserted company: ${c.name} (${profile.rounds.length} rounds${profile.tracks ? `, ${profile.tracks.length} tracks` : ''})`
    );
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('seed-companies failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
