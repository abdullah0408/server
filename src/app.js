import express from "express";
import { prisma } from "./utils/prisma.js";
import generateCourseLayout from "./geminiModel/generateCourseLayout.js";
import generateChapterContent from "./geminiModel/generateChapterContent.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/api/generateCourseLayout", async (req, res) => {
  const { courseId } = req.body;

  console.log(
    `📩 [INFO] Received request to generate course layout for ID: ${courseId}`
  );

  if (!courseId) {
    console.error("❌ [ERROR] courseId is missing in the request.");
    return res
      .status(400)
      .json({ success: false, error: "courseId is required." });
  }

  try {
    // Fetch course details
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        title: true,
        description: true,
        difficulty: true,
      },
    });

    if (!course) {
      console.warn(`🚧 [WARN] Course not found for ID: ${courseId}`);
      return res
        .status(404)
        .json({ success: false, error: "Course not found" });
    }

    console.log(
      `📚 [INFO] Generating layout for course: ${course.title} (ID: ${courseId})`
    );

    // Prepare the AI prompt
    const PROMPT = `
Generate a structured course outline based on the following details:
Course Title: ${course.title} 
Course Description: ${course.description || "N/A"}
Difficulty Level: ${course.difficulty || "N/A"}

The structure should include:
- Chapters (up to 25), each with:
  - Chapter Title
  - Chapter Description
  - Topics Covered:
    - Topic Title
    - Topic Description
    - Subtopics (detailed breakdown)

Format the response strictly as JSON with this structure:
{
  "courseTitle": "...",
  "courseDescription": "...",
  "difficultyLevel": "...",
  "courseStructure": [
    {
      "chapterTitle": "...",
      "chapterDescription": "...",
      "topicsCovered": [
        {
          "topicTitle": "...",
          "topicDescription": "...",
          "subtopics": ["...", "..."]
        }
      ]
    }
  ]
}
Strictly return only JSON data.
`;

    // Call AI model
    const result = await generateCourseLayout.sendMessage(PROMPT);

    // console.log(result.response.text);

    if (!result || !result.response || !result.response.text) {
      throw new Error("AI response is missing or undefined.");
    }

    console.log(`🤖 [INFO] AI response received for course ID: ${courseId}`);

    let layout;
    try {
      const responseText = result.response.text();
      layout = JSON.parse(responseText.slice(7, -3));
    } catch (jsonError) {
      console.error(
        "⚠️ [ERROR] Failed to parse AI response as JSON:",
        jsonError
      );
      return res
        .status(500)
        .json({ success: false, error: "Invalid AI response format." });
    }

    // Save generated layout to the database
    await prisma.course.update({
      where: { id: courseId },
      data: { status: "APPROVED_LAYOUT", layout: layout },
    });

    console.log(
      `✅ [SUCCESS] Course layout generated successfully for ID: ${courseId}`
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("🚨 [ERROR] Failed to generate course layout:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/createChapters", async (req, res) => {
  const { courseId } = req.body;

  console.log(
    `📩 [INFO] Received request to create chapters for course ID: ${courseId}`
  );

  if (!courseId) {
    console.error("❌ [ERROR] courseId is missing in the request.");
    return res
      .status(400)
      .json({ success: false, error: "courseId is required." });
  }

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        title: true,
        description: true,
        difficulty: true,
        layout: true,
      },
    });

    if (!course) {
      console.warn(`🚧 [WARN] Course not found for ID: ${courseId}`);
      return res
        .status(404)
        .json({ success: false, error: "Course not found" });
    }

    if (!course.layout) {
      console.warn(`🚧 [WARN] Course layout not found for ID: ${courseId}`);
      return res
        .status(404)
        .json({ success: false, error: "Course layout not found" });
    }

    console.log(
      `📚 [INFO] Creating chapters for course: ${course.title} (ID: ${courseId})`
    );

    const chapters = course.layout.courseStructure;

    if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
      console.warn(
        `🚧 [WARN] No chapters found in the course layout for ID: ${courseId}`
      );
      return res.status(404).json({
        success: false,
        error: "No chapters found in the course layout",
      });
    }

    /**
     * @future Use Prisma's createMany method to create chapters and topics in bulk
     *         const createdChapters = await prisma.chapter.createMany({
     *             data: chapters.map((chapter, index) => ({
     *                 courseId,
     *                 courseTitle: course.title,
     *                 courseDescription: course.description,
     *                 courseDifficulty: course.difficulty,
     *                 title: chapter.chapterTitle,
     *                 description: chapter.chapterDescription,
     *                 chapterNumber: index + 1,
     *                 topics: {
     *                     createMany: {
     *                         data: chapter.topics.map((topic, idx) => ({
     *                             title: topic.topicTitle,
     *                             title: topic.topicTitle,
     *                             description: topic.topicDescription,
     *                             order: idx + 1,
     *                             subtopics: {
     *                                 createMany: {
     *                                     data: topic.subtopics.map((subtopic, i) => ({
     *                                         title: subtopic,
     *                                         order: i + 1,
     *                                     })),
     *                                 },
     *                             },
     *                         })),
     *                     },
     *                 },
     *             })),
     *             skipDuplicates: true,
     *         });
     */

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];

      const createdChapter = await prisma.chapter.create({
        data: {
          courseId,
          courseTitle: course.title,
          courseDescription: course.description,
          courseDifficulty: course.difficulty,
          title: chapter.chapterTitle,
          description: chapter.chapterDescription,
          chapterNumber: i + 1,
          layout: chapter,
        },
      });

      console.log(
        `✅ [SUCCESS] Chapter created successfully: ${createdChapter.title} (ID: ${createdChapter.id})`
      );
    }
  } catch (error) {
    console.error("🚨 [ERROR] Failed to create chapters:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/generateChapterContent", async (req, res) => {
  const { chapterId } = req.body;

  console.log(
    `📩 [INFO] Received request to generate chapter content for ID: ${chapterId}`
  );

  if (!chapterId) {
    console.error("❌ [ERROR] chapterId is missing in the request.");
    return res
      .status(400)
      .json({ success: false, error: "chapterId is required." });
  }

  try {
    // Fetch chapter details
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        courseTitle: true,
        courseDescription: true,
        courseDifficulty: true,
        title: true,
        description: true,
        chapterNumber: true,
        layout: true,
      },
    });

    if (!chapter) {
      console.warn(`🚧 [WARN] Chapter not found for ID: ${chapterId}`);
      return res
        .status(404)
        .json({ success: false, error: "Chapter not found" });
    }

    if (!chapter.layout) {
      console.warn(`🚧 [WARN] Chapter layout not found for ID: ${chapterId}`);
      return res
        .status(404)
        .json({ success: false, error: "Chapter layout not found" });
    }

    if (!chapter.courseTitle || !chapter.courseDescription || !chapter.courseDifficulty || !chapter.title || !chapter.description || !chapter.chapterNumber) {
      console.warn(`🚧 [WARN] Missing required fields for chapter ID: ${chapterId}`);
      return res
        .status(400)
        .json({ success: false, error: "Missing required fields" });
    }

    console.log(
      `📚 [INFO] Generating content for chapter: ${chapter.title} (ID: ${chapterId})`
    );

    // Prepare the AI prompt
    const PROMPT = `You are a course designer who has been given a task to design a chapter for a course titled: "${chapter.courseTitle}", with the description: "${chapter.courseDescription}", and difficulty level: "${chapter.courseDifficulty}". 
    Your task is to design a detailed chapter layout for this course, based on the provided structure: ${JSON.stringify(chapter.layout)}.
    Ensure that the content aligns with the course title, description, and difficulty level. Format the response in markdown without any preamble or postamble.
    Do not include headings such as 'Topic: 1', 'Chapter:', 'Chapter 1:', 'Section 1:', or 'Subtopic:'. Use appropriate headings instead.
    Respond in markdown format with an in-depth, detailed explanation.`;

    // Call AI model
    const result = await generateChapterContent.sendMessage(PROMPT);

    if (!result || !result.response || !result.response.text) {
      throw new Error("AI response is too short or invalid.");
    }  

    console.log(`🤖 [INFO] AI response received for chapter ID: ${chapterId}`);

    // let content = result.response.text;
    // console.log(content);
    let responseText = result.response.text();
    if ( responseText.slice(0, 11) === "```markdown") {
      responseText = responseText.slice(11, -3);
    }

    
    // Save generated content to the database
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { status: "DONE", content: responseText },
    });

    console.log(
      `✅ [SUCCESS] Chapter Content generated successfully for ID: ${chapterId}`
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("🚨 [ERROR] Failed to generate course content:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default app;
