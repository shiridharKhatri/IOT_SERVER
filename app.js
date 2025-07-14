const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const ESP32_IP_ADDRESS = "http://192.168.16.105:80";

let isRobotBusy = false;
app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("A user connected to the admin panel:", socket.id);
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

app.post("/dispatch", async (req, res) => {
  if (isRobotBusy) {
    console.log("Dispatch rejected: Robot is already busy.");
    return res.status(409).json({ message: "Robot is already on a delivery." });
  }

  const { tableNumber } = req.body;
  if (!tableNumber)
    return res.status(400).json({ message: "Table number is required." });

  console.log(`Dispatching robot to table: ${tableNumber}`);
  try {
    isRobotBusy = true;
    io.emit("robotStatus", { isBusy: true });

    // --- START: MODIFIED CODE ---
    const qs = require('querystring');
    await axios.post(
      `${ESP32_IP_ADDRESS}/dispatch`,
      qs.stringify({ table: tableNumber }), // Stringify the data
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded' // Set the correct header
        }
      }
    );
    // --- END: MODIFIED CODE ---

    io.emit("orderStatusChange", {
      tableNumber: parseInt(tableNumber, 10),
      status: "waiting_for_food",
    });
    res
      .status(200)
      .json({ message: `Robot dispatched to table ${tableNumber}.` });
  } catch (error) {
    isRobotBusy = false;
    io.emit("robotStatus", { isBusy: false });
    console.error("Dispatch Error:", error.message);
    res
      .status(500)
      .json({ message: "Failed to dispatch robot. Check ESP32 connection." });
  }
});

app.post("/status/food-loaded", (req, res) => {
  const { tableNumber } = req.body;
  if (!tableNumber)
    return res.status(400).json({ message: "Table number is required." });
  console.log(`Status update: Food loaded for table ${tableNumber}.`);
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

  console.log(`Status update: Order for table ${tableNumber} is completed.`);
  io.emit("orderCompleted", { tableNumber: parseInt(tableNumber, 10) });
  res.status(200).json({ message: "Status received." });
});
app.get("/", (req,res)=>{
  res.status(200).json({
    message: "Welcome to the Intelligent Food Delivery Robot Admin Panel API"

  })
})
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
