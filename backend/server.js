const dotenv = require("dotenv");

dotenv.config();

const { connectDB } = require("./src/config/db");
const app = require("./src/app");
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
  });
};

startServer();
