const { contextBridge, ipcRenderer } = require('electron');

console.log("✅ Preload script is running!"); // Debugging log

contextBridge.exposeInMainWorld('electronAPI', {

  onMessageReply: (callback) => {
    console.log("👂 Listening for messages from main process" , );
    ipcRenderer.on('reply_from_electron', (_, data) => callback(data));
  },

  addTask: (task)=>{ipcRenderer.send('Task_recieved', task)},
  readTask: ()=> ipcRenderer.invoke("Read_task"),
  deleteTask: (index) =>{ipcRenderer.send("delete_the_task", index )},
});
