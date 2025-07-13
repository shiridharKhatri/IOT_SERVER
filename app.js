const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

let isRobotBusy = false;
let queuedCommand = null; 

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("Admin connected:", socket.id);
  socket.emit("robotStatus", { isBusy: isRobotBusy });
});

app.post("/order", (req, res) => {
  const { tableNumber } = req.body;
  if (!tableNumber)
    return res.status(400).json({ message: "Table number is required." });

  console.log(`New order received for table: ${tableNumber}`);
  io.emit("newOrder", {
    tableNumber: parseInt(tableNumber, 10),
    status: "pending",
  });
  res.status(200).json({ message: `Order for table ${tableNumber} received.` });
});

app.post("/dispatch", (req, res) => {
  const { tableNumber } = req.body;
  if (isRobotBusy) {
    return res.status(409).json({ message: "Robot is already on a delivery." });
  }
  if (!tableNumber) {
    return res.status(400).json({ message: "Table number is required." });
  }

  console.log(`Dispatching robot to table: ${tableNumber}`);
  isRobotBusy = true;
  queuedCommand = { tableNumber }; // Store the command for ESP32 polling
  io.emit("robotStatus", { isBusy: true });
  io.emit("orderStatusChange", {
    tableNumber: parseInt(tableNumber, 10),
    status: "waiting_for_food",
  });

  res.status(200).json({ message: `Robot dispatched to table ${tableNumber}.` });
});

app.get("/poll-command", (req, res) => {
  if (queuedCommand) {
    const command = { ...queuedCommand };
    queuedCommand = null; // Clear after reading
    console.log("Command sent to ESP32 via polling:", command);
    return res.status(200).json(command);
  } else {
    return res.status(204).send(); // No content
  }
});

app.post("/status/food-loaded", (req, res) => {
  const { tableNumber } = req.body;
  if (!tableNumber)
    return res.status(400).json({ message: "Table number is required." });

  io.emit("orderStatusChange", {
    tableNumber: parseInt(tableNumber, 10),
    status: "delivering",
  });

  res.status(200).json({ message: "Status received." });
});

app.post("/status/completed", (req, res) => {
  const { tableNumber } = req.body;
  if (!tableNumber)
    return res.status(400).json({ message: "Table number is required." });

  isRobotBusy = false;
  io.emit("robotStatus", { isBusy: false });
  io.emit("orderCompleted", { tableNumber: parseInt(tableNumber, 10) });

  res.status(200).json({ message: "Status received." });
});

app.get("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to the Intelligent Food Delivery Robot API",
  });
});

server.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
