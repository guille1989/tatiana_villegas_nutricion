import cors from "cors";
import express from "express";
import morgan from "morgan";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { env } from "./config/env";

const parseOrigins = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const createApp = () => {
  const app = express();
  const allowedOrigins = parseOrigins(env.clientUrl);

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
