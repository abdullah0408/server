import "dotenv/config";
import { prisma } from "../utils/prisma.js";
import axios from "axios";

const LayoutTasks = async () => {
  let processingTask = null;

  try {
    // Fetch the first PENDING task (oldest)
    const layoutTask = await prisma.course.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });

    if (!layoutTask) {
      console.log("ℹ️ [INFO] No pending course layout tasks.");
      return;
    }

    console.log(`🔍 [INFO] Found course layout task: ${layoutTask.id}`);

    // Mark the task as "PROCESSING"
    processingTask = await prisma.course.update({
      where: { id: layoutTask.id, status: "PENDING" }, // Ensure task is still pending
      data: { status: "PROCESSING" },
    });

    if (!processingTask) {
      console.log(
        `🚧 [INFO] Task ${layoutTask.id} is already being processed by another instance.`
      );
      return;
    }

    console.log(
      `🚀 [INFO] Processing started for course ID: ${processingTask.id}`
    );

    const maxAttempts = 5;
    let attempts = 0;
    const URL = process.env.DEPLOYED_URL || "http://localhost:3000";
    while (attempts < maxAttempts) {
      try {
        // Send request to generate course layout
        await axios.post(`${URL}/api/generateCourseLayout`, {
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
            `🚨 [ERROR] Network error (ECONNREFUSED) for course ID: ${processingTask.id}. Possible reasons: Invalid URL, DNS issue, or server down. Retrying will not work.`
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

    // If all retries failed, mark the course layout as FAILED
    await prisma.course.update({
      where: { id: processingTask.id },
      data: { status: "FAILED" },
    });

    console.error(
      `❗ [ERROR] Course layout ${processingTask.id} marked as FAILED after ${maxAttempts} attempts.`
    );
  } catch (error) {
    console.error("🚧 [ERROR] Unexpected error in LayoutTasks:", error);

    // If an error occurs after setting status to PROCESSING, revert it back to PENDING
    if (processingTask) {
      await prisma.course.update({
        where: { id: processingTask.id },
        data: { status: "PENDING" },
      });

      console.log(
        `🔄 [INFO] Reset course ID: ${processingTask.id} to PENDING due to an unexpected error.`
      );
    }
  }
};

export default LayoutTasks;
