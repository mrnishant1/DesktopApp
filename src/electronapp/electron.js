import { app, BrowserWindow, Tray, Menu, ipcMain } from "electron";
import path from 'path'
import { fileURLToPath } from 'url';
import isDev from "./utils.js";
import fs from 'fs';
import screenshot from "screenshot-desktop";
import { pipeline } from "@xenova/transformers";
import { buffer } from "stream/consumers";
import { RawImage } from "@xenova/transformers";



// Get __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//Electron app window---------------------------------
let mainWindow;
let tray;
const taskFile = "taskFile.json";

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), // ✅ Ensure correct path
      contextIsolation: true, 
      nodeIntegration: false, 
    },    
  });

  // Load React build
  if (isDev()){
    mainWindow.loadURL("http://localhost:5123");
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist-react/index.html'));
  }

  mainWindow.on("close", (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
}

app.whenReady().then(() => {
  console.log("Preload path:", path.join(__dirname, "preload.js"));
  createMainWindow();

  tray = new Tray(path.join(__dirname, "icon.png")); // Ensure correct path

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show App", click: () => {
      if (!mainWindow) {
        createMainWindow();
      }
      mainWindow.show();
    }},
    { label: "Quit", click: () => {
      mainWindow.destroy(); // Destroy the window explicitly
      app.quit();
    }  },
  ]); 

  console.log("Creating tray...");
  if (!tray) {
    console.log("Tray failed to initialize.");
  }

  tray.setToolTip("ToDo");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (!mainWindow) {
      createMainWindow();
    } else if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  
  tray.on("right-click", () => {
    tray.popUpContextMenu();
  });
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

// Listen for messages from Renderer (React)---------
ipcMain.on("message_to_electron", (event, message) => {
  console.log("Got message from React:", message);
  event.reply("reply_from_electron", "Hello from Electron!");
});

// Check for the file existence----------------
if (!fs.existsSync(taskFile)) {
  // Create if not exist 
  fs.writeFileSync(taskFile, "[]", "utf-8"); // Initialized with an empty array
}

// Task storing --------------------
ipcMain.on("Task_recieved", (event, task) => {
  console.log(task);
  
  try {
    let jsonTasks = JSON.parse(fs.readFileSync(taskFile, "utf8"));
    if (!Array.isArray(jsonTasks)) {
      jsonTasks = []; // Reset to an empty array if data is corrupted
    }
    jsonTasks.push(task);
    console.log(jsonTasks);
    fs.writeFileSync(taskFile, JSON.stringify(jsonTasks, null, 2));
    event.reply("reply_from_electron", "Task has been added");
  } catch (error) {
    console.error("Error reading/writing jsonTasks:", error);
  }
});

// Handle reading tasks----------------------
ipcMain.handle("Read_task", async () => {
  try {
    if (!fs.existsSync(taskFile)) {
      fs.writeFileSync(taskFile, "[]", "utf8"); // Create file if it doesn't exist
    }
    const data = fs.readFileSync(taskFile, "utf8");
    return JSON.parse(data); // Return parsed JSON
  } catch (error) {
    console.error("Error reading tasks:", error);
    return []; // Return empty array on error
  }
});

// Task deletion -------------
ipcMain.on("delete_the_task", (event, index) => {
  let jsonTasks = JSON.parse(fs.readFileSync(taskFile, "utf8"));
  jsonTasks.splice(index, 1);
  console.log(jsonTasks);
  fs.writeFileSync(taskFile, JSON.stringify(jsonTasks, null, 2));
  event.reply("reply_from_electron", "Task has been Done");
});




//Text embeddings using xenova/transformer clip model for text "Xenova/all-MiniLM-L6-v2"
async function getTextEmbedding(text) {
  const textModel = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
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

  const classifier = await pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch16");
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
async function findBestMatchingTask(predictedLabel, taskList,highThreshold = 0.75, lowThreshold = 0.5) {
  const predictedEmbedding = await getTextEmbedding(predictedLabel);
  const taskEmbeddings = await Promise.all(taskList.map(task => getTextEmbedding(task)));

  let bestTask = "";
  let bestScore = -1;

  taskList.forEach((task, i) => {
    const similarity = cosineSimilarity(predictedEmbedding, taskEmbeddings[i]);
    if (similarity > bestScore) {
      bestScore = similarity;
      bestTask = task;
    }
  });

  if (bestScore >= highThreshold) {
    console.log(`Best Matching Task: ${bestTask} (Score: ${bestScore.toFixed(3)}) ✅`);
  } else if (bestScore >= lowThreshold) {
    console.log(`Best Matching Task: ${bestTask} (Score: ${bestScore.toFixed(3)}) ⚠️ (Weak match, but work-related)`);
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
async function main(){

  async function getTasksfromFile(){
    let FileTasks = JSON.parse(fs.readFileSync(taskFile, "utf-8"));
    return FileTasks;
  }
  let taskList = await getTasksfromFile();
  let imageEmbedding = await getImageEmbedding();

  findBestMatchingTask(imageEmbedding, taskList)
}
setInterval(main, 5* 1000)