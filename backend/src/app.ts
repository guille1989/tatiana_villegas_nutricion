import cors from "cors";
import express from "express";
import morgan from "morgan";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";

export const createApp = () => {
  const app = express();
  const allowedOrigins = new Set([
    "https://tatiana-villegas-nutricion.vercel.app",
    "https://tatiana-villegas-nutricion-fsew.vercel.app",
    "http://localhost:5173",
  ]);

  const corsConfig: cors.CorsOptions = {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 204,
  };

  app.use(cors(corsConfig));
  app.options("*", cors(corsConfig)); // maneja preflight
  
  app.use(express.json());
  app.use(morgan("dev"));
  app.use("/api", routes);
  app.use(errorHandler);

  return app;
};
