import "./config/env.js";

import app from "./app.js";
import pool from "./config/database.js";
import { reloadPermissionCache } from "./middleware/permissions.js";

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  try {
    const connection = await pool.getConnection();

    console.log("MySQL connected successfully");

    connection.release();

    await reloadPermissionCache();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};

startServer();