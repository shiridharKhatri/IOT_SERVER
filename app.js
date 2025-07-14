const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const qs = require("querystring"); // Import the querystring module

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
// IMPORTANT: Update this with your ESP32's current ngrok URL or local IP address
const ESP32_IP_ADDRESS = "https://df12c761b1fc.ngrok-free.app";

let isRobotBusy = false;

// --- Correct CORS Configuration ---
const allowedOrigins = [
  "https://orderfoodbot.netlify.app", // Your deployed frontend
  "http://localhost:3000",
  "http://localhost:5173" // For local development
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = "The CORS policy for this site does not allow access from the specified Origin.";
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
};

app.use(cors(corsOptions));
app.use(express.json());

// --- Socket.IO Server Setup ---
const io = new Server(server, {
  cors: corsOptions, // Apply the same CORS options to Socket.IO
});

io.on("connection", (socket) => {
  console.log("A user connected to the admin panel:", socket.id);
  // Send the current robot status to the newly connected client
  socket.emit("robotStatus", { isBusy: isRobotBusy });
});

// --- API Routes ---

// Route to check server status
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to the Intelligent Food Delivery Robot API"
  });
});

// Route to receive a new order from a customer terminal
app.post("/order", (req, res) => {
  const { tableNumber } = req.body;
  if (!tableNumber) {
    return res.status(400).json({ message: "Table number is required." });
  }
  console.log(`New order received for table: ${tableNumber}`);
  io.emit("newOrder", {
    tableNumber: parseInt(tableNumber, 10),
    status: "pending",
  });
  res.status(200).json({ message: `Order for table ${tableNumber} received.` });
});

// Route to dispatch the robot from the admin panel
app.post("/dispatch", async (req, res) => {
  if (isRobotBusy) {
    console.log("Dispatch rejected: Robot is already busy.");
    return res.status(409).json({ message: "Robot is already on a delivery." });
  }

  const { tableNumber } = req.body;
  if (!tableNumber) {
    return res.status(400).json({ message: "Table number is required." });
  }

  console.log(`Dispatching robot to table: ${tableNumber}`);
  try {
    isRobotBusy = true;
    io.emit("robotStatus", { isBusy: true });

    // --- Corrected Axios Call to ESP32 ---
    await axios.post(
      `${ESP32_IP_ADDRESS}/dispatch`,
      qs.stringify({ table: tableNumber }), // Send as form-urlencoded
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10000, // Add a 10-second timeout
      }
    );

    io.emit("orderStatusChange", {
      tableNumber: parseInt(tableNumber, 10),
      status: "waiting_for_food",
    });

    res.status(200).json({ message: `Robot dispatched to table ${tableNumber}.` });
  } catch (error) {
    isRobotBusy = false;
    io.emit("robotStatus", { isBusy: false });
    console.error("Dispatch Error:", error.message);
    res.status(500).json({ message: "Failed to dispatch robot. Check ESP32 connection." });
  }
});

// Route for ESP32 to notify that food has been loaded
app.post("/status/food-loaded", (req, res) => {
  const { tableNumber } = req.body;
  if (!tableNumber) {
    return res.status(400).json({ message: "Table number is required." });
  }
  console.log(`Status update: Food loaded for table ${tableNumber}.`);
  io.emit("orderStatusChange", {
    tableNumber: parseInt(tableNumber, 10),
    status: "delivering",
  });
  res.status(200).json({ message: "Status received." });
});

// Route for ESP32 to notify that the delivery is complete
app.post("/status/completed", (req, res) => {
  const { tableNumber } = req.body;
  if (!tableNumber) {
    return res.status(400).json({ message: "Table number is required." });
  }

  isRobotBusy = false;
  io.emit("robotStatus", { isBusy: false });

  console.log(`Status update: Order for table ${tableNumber} is completed.`);
  io.emit("orderCompleted", { tableNumber: parseInt(tableNumber, 10) });
  res.status(200).json({ message: "Status received." });
});

// --- Start Server ---
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});