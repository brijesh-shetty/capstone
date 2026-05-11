-- CreateTable
CREATE TABLE "InterviewCategory" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewTopic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "optionA" TEXT NOT NULL,
    "optionB" TEXT NOT NULL,
    "optionC" TEXT NOT NULL,
    "optionD" TEXT NOT NULL,
    "optionE" TEXT,
    "correctAnswer" TEXT NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewTheory" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "rawTheory" TEXT NOT NULL,
    "keyPoints" JSONB NOT NULL,
    "formulas" JSONB NOT NULL,
    "tutorialSections" JSONB NOT NULL,
    "formulaCount" INTEGER NOT NULL DEFAULT 0,
    "exampleCount" INTEGER NOT NULL DEFAULT 0,
    "conceptCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InterviewTheory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInterviewProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "avgScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3),

    CONSTRAINT "UserInterviewProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewCategory_slug_key" ON "InterviewCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewTopic_categoryId_slug_key" ON "InterviewTopic"("categoryId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewTheory_topicId_key" ON "InterviewTheory"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "UserInterviewProgress_userId_topicId_key" ON "UserInterviewProgress"("userId", "topicId");

-- AddForeignKey
ALTER TABLE "InterviewTopic" ADD CONSTRAINT "InterviewTopic_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InterviewCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "InterviewTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewTheory" ADD CONSTRAINT "InterviewTheory_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "InterviewTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInterviewProgress" ADD CONSTRAINT "UserInterviewProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInterviewProgress" ADD CONSTRAINT "UserInterviewProgress_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "InterviewTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
