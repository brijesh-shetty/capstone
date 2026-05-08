import { prisma } from '../lib/prisma';
import { getQuestions, GeneratedQuestion } from './questionService';

export interface TestConfig {
  testType: 'aptitude' | 'verbal' | 'mixed';
  questionCount: number;
  timeLimitMin: number;
  difficulty: 1 | 2 | 3;
}

export async function generateTest(userId: string, config: TestConfig): Promise<GeneratedQuestion[]> {
  let quantRatio = 0, logicalRatio = 0, verbalRatio = 0;

  if (config.testType === 'mixed') {
    quantRatio = 0.5; logicalRatio = 0.3; verbalRatio = 0.2;
  } else if (config.testType === 'aptitude') {
    quantRatio = 0.6; logicalRatio = 0.4; verbalRatio = 0;
  } else if (config.testType === 'verbal') {
    quantRatio = 0; logicalRatio = 0; verbalRatio = 1;
  }

  const quantCount = Math.round(config.questionCount * quantRatio);
  const logicalCount = Math.round(config.questionCount * logicalRatio);
  let verbalCount = config.questionCount - quantCount - logicalCount;

  const getTopics = async (subject: string, limit: number) => {
    if (limit === 0) return [];
    // Randomize subtopics
    const allTopics = await prisma.topic.findMany({
      where: { subject }
    });
    // Shuffle
    const shuffled = allTopics.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(limit, allTopics.length));
  };

  const quantTopics = await getTopics('Quantitative Aptitude', quantCount);
  const logicalTopics = await getTopics('Logical Reasoning', logicalCount);
  const verbalTopics = await getTopics('Verbal Ability', verbalCount);

  // Fallback if we don't have enough topics of a specific type
  const selectedTopics = [...quantTopics, ...logicalTopics, ...verbalTopics];
  
  if (selectedTopics.length === 0) {
     throw new Error("No topics found. Please run seed script.");
  }

  const allQuestions: GeneratedQuestion[] = [];
  
  // To reach questionCount, we distribute questions among selected topics
  let i = 0;
  while (allQuestions.length < config.questionCount) {
    const topic = selectedTopics[i % selectedTopics.length];
    // Generate 1 question per iteration to ensure variety
    const qs = await getQuestions(topic.subtopic, config.difficulty, 1);
    allQuestions.push(qs[0]);
    i++;
  }

  return allQuestions;
}
