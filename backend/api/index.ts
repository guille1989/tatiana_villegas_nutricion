import mongoose from "mongoose";
import { createApp } from "../src/app";
import { env } from "../src/config/env";

// Reuse connection and app instance across invocations in the Vercel lambda.
let connectionPromise: Promise<typeof mongoose> | null = null;
const app = createApp();

const ensureDb = () => {
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(env.mongoUri);
  }
  return connectionPromise;
};

export default async function handler(req: any, res: any) {
  await ensureDb();
  return app(req, res);
}
