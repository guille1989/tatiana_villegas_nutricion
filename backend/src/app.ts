import cors from "cors";
import express from "express";
import morgan from "morgan";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";

export const createApp = () => {
  const app = express();

  const envOrigins =
    process.env.CLIENT_URL?.split(",").map((o) => o.trim()).filter(Boolean) ||
    [];

  const allowedOrigins = new Set([
    "https://tatiana-villegas-nutricion.vercel.app",
    "https://tatiana-villegas-nutricion-fsew.vercel.app",
    "http://localhost:5173",
    ...envOrigins,
  ]);

  const isAllowed = (origin?: string) => {
    if (!origin) return true;
    if (allowedOrigins.has("*")) return true;
    return allowedOrigins.has(origin);
  };

  // Preflight + headers manual
  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && isAllowed(origin)) {
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
      if (origin && !isAllowed(origin)) {
        return res.status(403).send("CORS not allowed");
      }
      return res.sendStatus(204);
    }
    next();
  });

  // CORS estándar
  app.use(
    cors({
      origin: (origin, cb) => {
        if (isAllowed(origin ?? undefined)) return cb(null, true);
        return cb(null, false);
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
