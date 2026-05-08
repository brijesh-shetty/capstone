import Groq from 'groq-sdk';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function explainWeakTopic(subtopic: string, studentAccuracy: number) {
  const stream = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 800,
    stream: true,
    messages: [{
      role: 'user',
      content: `A student scored only ${studentAccuracy}% on questions about "${subtopic}".

Please provide:
1. A clear, simple explanation of the core concept in 2-3 paragraphs
2. The key formula or rule to remember (if applicable)
3. A worked example showing step-by-step solution
4. One common mistake students make and how to avoid it

Keep the language encouraging and accessible to a college student. Format with markdown.`,
    }],
  });
  return stream;
}

export async function getPersonalisedExplanation(
  questionText: string,
  correctAnswer: string,
  studentAnswer: string
) {
  const stream = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 300,
    stream: true,
    messages: [{
      role: 'user',
      content: `A student answered "${studentAnswer}" to: "${questionText}"
Correct answer: "${correctAnswer}"
In 2-3 encouraging sentences, explain why their answer was wrong and show the correct reasoning step-by-step.`,
    }],
  });
  return stream;
}
