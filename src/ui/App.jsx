import { useState, useEffect, useRef } from "react";

function App() {
  const [message, setMessage] = useState("");
  const [Task, setTask] = useState([]);
  const task = useRef(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onMessageReply((response) => {
        console.log("Response from Electron:", response);
        setMessage(response);
      });
      fetchTasks();
    } else {
      console.error("Electron API is undefined!");
    }
  }, []);

  const fetchTasks = () => {
    window.electronAPI.readTask().then((data) => {
      setTask(data);
    });
  };

  function addTask() {
    let inpTask = task.current.value.trim();
    if (inpTask !== "") {
      console.log(inpTask);
      window.electronAPI.addTask(inpTask);
      task.current.value = ""; // Clear input after adding
      fetchTasks();
    }
  }

  function delTask(index) {
    console.log(index);
    window.electronAPI.deleteTask(index);
    fetchTasks();
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-6">
      <h1 className="text-3xl font-bold mb-4">To-Do App</h1>

      {/* Task Input */}
      <div className="flex gap-2 w-full max-w-md">
        <input
          ref={task}
          type="text"
          placeholder="Enter a task..."
          className="flex-grow p-2 rounded-lg border border-gray-600 bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button 
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
          onClick={addTask}
        >
          Add Task
        </button>
      </div>

      {/* Response Message */}
      {message && (
        <p className="mt-4 text-green-400">{message}</p>
      )}

      {/* Task List */}
      <div className="mt-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-2">Your Tasks</h2>
        <ul className="bg-gray-800 p-4 rounded-lg shadow-lg">
          {Task.length > 0 ? (
            Task.map((task, index) => (
              <li 
                key={index} 
                className="flex justify-between items-center p-2 border-b border-gray-700"
              >
                <span>{task}</span>
                <input 
                  type="checkbox" 
                  onClick={() => delTask(index)} 
                  className="w-5 h-5 cursor-pointer"
                />
              </li>
            ))
          ) : (
            <p className="text-gray-400 text-center">No tasks yet. Add one!</p>
          )}
        </ul>
      </div>
    </div>
  );
}

export default App;
