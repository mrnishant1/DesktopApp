import { app, BrowserWindow, Tray, Menu, ipcMain } from "electron";
import path from 'path'
import { fileURLToPath } from 'url';
import isDev from "./utils.js";
import fs from 'fs';
import main from "./workingModel.js";
// import main_onnx from "./onnxModel.js";

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



setInterval(main, 5* 1000)