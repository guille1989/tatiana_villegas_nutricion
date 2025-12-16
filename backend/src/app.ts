import cors from "cors";
import express from "express";
import morgan from "morgan";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";

export const createApp = () => {
  const app = express();
  const allowedOrigins = [
    "https://tatiana-villegas-nutricion.vercel.app", // frontend prod
    "http://localhost:5173", // desarrollo
  ];

  app.use(
    cors({
      origin: allowedOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(morgan("dev"));

  app.use("/api", routes);

  app.use(errorHandler);

  return app;
};
