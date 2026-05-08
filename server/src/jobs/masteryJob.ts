import { Queue, Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { recalculateMastery } from '../services/weaknessDetector';

export const masteryQueue = new Queue('mastery', { connection: redis });

export const masteryWorker = new Worker('mastery', async job => {
  if (job.name === 'recalculate') {
    const { userId, topicId } = job.data;
    await recalculateMastery(userId, topicId);
  }
}, { connection: redis });

masteryWorker.on('completed', job => console.log(`Job ${job.id} completed!`));
masteryWorker.on('failed', (job, err) => console.log(`Job ${job?.id} failed with ${err.message}`));
