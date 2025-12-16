import cors from "cors";
import express from "express";
import morgan from "morgan";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";

export const createApp = () => {
  const app = express();
  const allowedOrigins = new Set([
    "https://tatiana-villegas-nutricion.vercel.app", // frontend prod
    "https://tatiana-villegas-nutricion-fsew.vercel.app", // (si hace fetch desde aquí)
    "http://localhost:5173", // dev
  ]);

  // Middleware manual para preflight y logging
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    console.log(
      "CORS origin:",
      origin,
      "method:",
      req.method,
      "path:",
      req.path
    );

    if (origin && allowedOrigins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
      );
      res.header(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS"
      );
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // CORS estándar (por si acaso en peticiones normales)
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.has(origin)) return cb(null, true);
        cb(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );

  app.use(express.json());
  app.use(morgan("dev"));
  app.use("/api", routes);
  app.use(errorHandler);

  return app;
};
