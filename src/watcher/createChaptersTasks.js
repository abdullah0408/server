import "dotenv/config";
import { prisma } from "../utils/prisma.js";
import axios from "axios";

const createChaptersTasks = async () => {
  let processingTask = null;

  try {
    // Fetch the first PENDING task (oldest)
    const createChaptersTask = await prisma.course.findFirst({
      where: { status: "APPROVED_LAYOUT" },
      orderBy: { createdAt: "asc" },
    });

    if (!createChaptersTask) {
      console.log("ℹ️ [INFO] No pending create chapters tasks.");
      return;
    }

    console.log(
      `🔍 [INFO] Found a chapters creation task for course ID: ${createChaptersTask.id}`
    );

    // Mark the task as "PROCESSING"
    processingTask = await prisma.course.update({
      where: { id: createChaptersTask.id, status: "APPROVED_LAYOUT" }, // Ensure task is still pending
      data: { status: "PROCESSING" },
    });

    if (!processingTask) {
      console.log(
        `🚧 [INFO] Task ${createChaptersTask.id} is already being processed by another instance.`
      );
      return;
    }

    console.log(
      `🚀 [INFO] Started processing chapters creation task for course ID: ${processingTask.id}`
    );

    const maxAttempts = 5;
    let attempts = 0;
    const URL = process.env.DEPLOYED_URL || "http://localhost:3000";
    while (attempts < maxAttempts) {
      try {
        // Send request to generate course layout
        await axios.post(`${URL}/api/createChapters`, {
          courseId: processingTask.id,
        });

        console.log(
          `✅ [SUCCESS] Course layout processed successfully: ${processingTask.id}`
        );

        return; // Exit function after successful processing
      } catch (error) {
        attempts++;
        console.error(
          `❌ [ERROR] Attempt ${attempts} failed for course ID: ${processingTask.id}`
        );

        if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND" || error.code === "ECONNRESET") {
          console.log(
            `🚨 [ERROR] Network error (ECONNREFUSED) for chapter ID: ${processingTask.id}. Possible reasons: Invalid URL, DNS issue, or server down. Retrying will not work.`
          );
          await prisma.course.update({
            where: {
              id: processingTask.id,
              status: "PROCESSING",
            },
            data: {
              status: "APPROVED_LAYOUT",
            },
          });
          return; // Exit early to avoid retrying
        }

        if (error.response?.data?.error === "Course layout not found") {
          console.log(
            `🚨 [ERROR] Missing course layout for course ID: ${processingTask.id}. This course requires layout generation first. Resetting status to PENDING.`
          );
          await prisma.course.update({
            where: {
              id: processingTask.id,
              status: "PROCESSING",
            },
            data: {
              status: "PENDING",
            },
          });
          return; // Exit early to avoid retrying
        }

        if (attempts < maxAttempts) {
          const delay = 2000 * attempts; // Exponential backoff (2s, 4s, 6s...)
          console.log(`⏳ [INFO] Retrying in ${delay / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // Mark the task as "CREATING_CHAPTERS_FAILED" after max attempts
    await prisma.course.update({
      where: { id: processingTask.id },
      data: { status: "CREATING_CHAPTERS_FAILED" },
    });

    console.error(
      `❗ [ERROR] Failed to process chapters creation task for course ID: ${processingTask.id}. After ${maxAttempts} attempts the course has been marked as CREATING_CHAPTERS_FAILED.`
    );
  } catch (error) {
    console.error("🚧 [ERROR] Unexpected error in CreateChaptersTask:", error);

    // If an error occurs after setting status to PROCESSING, revert it back to PENDING
    if (processingTask) {
      await prisma.course.update({
        where: { id: processingTask.id },
        data: { status: "APPROVED_LAYOUT" },
      });

      console.log(
        `🔄 [INFO] Reset course ID: ${processingTask.id} to APPROVED_LAYOUT due to an unexpected error.`
      );
    }
  }
};

export default createChaptersTasks;
