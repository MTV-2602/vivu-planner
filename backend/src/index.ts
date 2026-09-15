import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { ENV } from "./config/env";
import { SERVER_CONFIG } from "./constants";
import { authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes    from "./modules/auth/auth.router";
import tripsRoutes   from "./modules/trips/trips.router";
import adminRoutes   from "./modules/admin/admin.router";
import paymentRoutes from "./modules/payment/payment.router";
import partnersRoutes from "./modules/partners/partners.router";
import weatherRoutes from "./modules/weather/weather.router";
import placesRoutes  from "./modules/places/places.router";

process.env.TZ = "Asia/Ho_Chi_Minh";

const app = express();

// CORS - cho phep frontend Vercel va cac port localhost khi test dev
const rawOrigin = process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL || ENV.FRONTEND_URL;
const allowedOrigins = process.env.NODE_ENV === "production" && rawOrigin && rawOrigin !== "*"
  ? rawOrigin.split(",").map((o: string) => o.trim())
  : true;

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(express.json({ limit: SERVER_CONFIG.BODY_MAX_SIZE }));

// Health check
app.get(["/health", "/api/health"], (_req, res) => res.json({
  status: "ok", version: "2.0.0", uptime: Math.floor(process.uptime())
}));
app.get(["/", "/api"], (_req, res) => res.json({
  name: "ViVu Planner API", version: "2.0.0"
}));

// Auth middleware (global - set req.user neu co token, khong block)
app.use(authMiddleware);

// Routes
app.use("/api/auth",     authRoutes);
app.use("/api/trips",    tripsRoutes);
app.use("/api/payment",  paymentRoutes);
app.use("/api/weather",  weatherRoutes);
app.use(["/api/partners", "/api/admin/partners"], partnersRoutes);
app.use("/api/places",   placesRoutes);
app.use("/api/admin",    adminRoutes);

// 404 cho API routes
app.use("/api", (req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));

// Global error handler (LUON o cuoi cung)
app.use(errorHandler);

if (!process.env.VERCEL) {
  const PORT = Number(ENV.PORT) || SERVER_CONFIG.DEFAULT_PORT;
  const server = app.listen(PORT, () => {
    console.log(`[ViVu API v2.0] Port ${PORT}`);
    console.log(`[ViVu API v2.0] CORS: ${rawOrigin || '*'}`);
  });
  server.setTimeout(SERVER_CONFIG.AI_REQUEST_TIMEOUT_MS);
}

export default app;
