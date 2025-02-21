import "dotenv/config";
import app from "./src/app.js";
import LayoutTasks from "./src/watcher/layoutTasks.js";
import createChaptersTasks from "./src/watcher/createChaptersTasks.js";
import generateChapterContentTasks from "./src/watcher/generateChapterContentTasks.js";

const PORT = process.env.PORT || 3009;
let layoutTaskProcessing = false;

setInterval(async () => {
  if (!layoutTaskProcessing) {
    // Check if another task is already in progress, if already in progress new task will not be picked up
    console.log("🔄 [INFO] Checking for pending course layout tasks...");
    layoutTaskProcessing = true;
    await LayoutTasks();
    layoutTaskProcessing = false;
  }
}, 60000); // Check every minute

let createChaptersTaskProcessing = false;

setInterval(async () => {
  if (!createChaptersTaskProcessing) {
    // Check if another task is already in progress, if already in progress new task will not be picked up
    console.log("🔄 [INFO] Checking for pending create chapters tasks...");
    createChaptersTaskProcessing = true;
    await createChaptersTasks();
    createChaptersTaskProcessing = false;
  }
}, 60000); // Check every minute

let generateChapterContentTaskProcessing = false;

setInterval(async () => {
  if (!generateChapterContentTaskProcessing) {
    // Check if another task is already in progress, if already in progress new task will not be picked up
    console.log("🔄 [INFO] Checking for pending chapter content tasks...");
    generateChapterContentTaskProcessing = true;
    await generateChapterContentTasks();
    generateChapterContentTaskProcessing = false;
  }
}, 60000); // Check every minute

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
