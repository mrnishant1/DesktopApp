import path from "path";
import { fileURLToPath } from "url";
import isDev from "./utils.js";
import fs from "fs";
import screenshot from "screenshot-desktop";
import { pipeline } from "@xenova/transformers";

// Get __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const taskFile = "taskFile.json";

//Text embeddings using xenova/transformer clip model for text "Xenova/all-MiniLM-L6-v2"
async function getTextEmbedding(text) {
  const textModel = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );
  const embedding = await textModel(text, { pooling: "mean", normalize: true });
  
  return embedding.data; // Return as array
}

//for taking screenshots
async function captureAndSave() {
  const imagePath = path.join(__dirname, "screenshot.png");
  const buffer = await screenshot();

  fs.writeFileSync(imagePath, buffer);
  console.log("Screenshot saved:", imagePath);

  return imagePath; // Return path for classifier
}

//For image embeddings for getting label -----------------------------------------------
async function getImageEmbedding() {
  const classifier = await pipeline(
    "zero-shot-image-classification",
    "Xenova/clip-vit-base-patch16"
  );
  console.log("Model Loaded");
  //return image path........
  let ScreenShotImage = await captureAndSave();
  let labelsFile = path.join(__dirname, "labels.json");
  const labels = JSON.parse(fs.readFileSync(labelsFile, "utf-8"));
  // Classify image
  let imageEmbedding = await classifier(ScreenShotImage, labels);
  imageEmbedding = imageEmbedding[0].label;
  console.log("Classification:", imageEmbedding);
  fs.unlinkSync(ScreenShotImage);
  return imageEmbedding;
}

//for creating Textembedding for Image predictedLabel and for tasklist------------------------------
async function findBestMatchingTask(
  predictedLabel,
  taskList,
  highThreshold = 0.75,
  lowThreshold = 0.5
) {
  const predictedEmbedding = await getTextEmbedding(predictedLabel);
  const taskEmbeddings = await Promise.all(
    taskList.map((task) => getTextEmbedding(task))
  );

  let bestTask = "";
  let bestScore = -1;

  taskList.forEach((task, i) => {
    console.log(i);
    const similarity = cosineSimilarity(predictedEmbedding, taskEmbeddings[i]);
    if (similarity > bestScore) {
      bestScore = similarity;
      bestTask = task;
    }
  });

  if (bestScore >= highThreshold) {
    console.log(
      `Best Matching Task: ${bestTask} (Score: ${bestScore.toFixed(3)}) ✅`
    );
  } else if (bestScore >= lowThreshold) {
    console.log(
      `Best Matching Task: ${bestTask} (Score: ${bestScore.toFixed(
        3
      )}) ⚠️ (Weak match, but work-related)`
    );
  } else {
    console.log(`Best Matching Task: None (Score: ${bestScore.toFixed(3)}) ❌`);
  }

  return bestScore, bestTask;
}
//help finding similarity in both tasktext and predictedLabel text embedding-----------------------------
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
}
//calling findbestmatchingTask
export default async function main() {
  async function getTasksfromFile() {
    let FileTasks = JSON.parse(fs.readFileSync(taskFile, "utf-8"));
    return FileTasks;
  }
  let taskList = await getTasksfromFile();
  let imageEmbedding = await getImageEmbedding();
  console.log(imageEmbedding)
  // findBestMatchingTask(imageEmbedding, taskList);
}
