import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function generateHint(questionText: string, options: string[]): Promise<string> {
  const prompt = `
    You are an expert tutor. Provide a single, helpful, brief hint for the following question without giving away the direct answer.
    
    Question: ${questionText}
    Options: ${options.join(', ')}
    
    Respond with ONLY the hint text. Do not include quotes or conversational filler. Keep it under 2 sentences.
  `;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5,
      max_tokens: 150,
    });

    return chatCompletion.choices[0]?.message?.content?.trim() || 'No hint available.';
  } catch (error) {
    console.error('Hint generation error:', error);
    return 'Consider breaking the problem down into smaller parts and eliminating obvious wrong answers.';
  }
}
