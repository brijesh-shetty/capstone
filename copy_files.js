const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'server', 'prisma', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

fs.copyFileSync(
  'c:/Users/Lenovo/Downloads/aptitude_book_470_solved (1).json',
  path.join(dataDir, 'aptitude_questions.json')
);

fs.copyFileSync(
  'c:/Users/Lenovo/Downloads/topic_theory_notes.json',
  path.join(dataDir, 'topic_theory.json')
);

console.log('Files copied successfully.');
