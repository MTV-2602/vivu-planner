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
import postsRoutes   from "./modules/posts/posts.router";

process.env.TZ = "Asia/Ho_Chi_Minh";

const app = express();

// CORS - cho phep frontend Vercel va cac port localhost khi test dev
const rawOrigin = process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL || ENV.FRONTEND_URL;
const allowedOrigins = process.env.NODE_ENV === "production" && rawOrigin && rawOrigin !== "*"
  ? rawOrigin.split(",").map((o: string) => o.trim())
  : true;

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-invite-token", "invite-token"],
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

// Turnstile widget endpoint phuc vu Mobile WebView
app.get(["/turnstile-widget", "/api/turnstile-widget"], (req, res) => {
  const siteKey = (req.query.sitekey as string) || process.env.TURNSTILE_SITE_KEY || "0x4AAAAAAFTw7hrMgVa79FF0";
  const action = (req.query.action as string) || "login";
  const theme = (req.query.theme as string) || "light";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body {
      width: 100%;
      height: 100%;
      background: transparent;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  </style>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body>
  <div class="cf-turnstile"
       data-sitekey="${siteKey}"
       data-action="${action}"
       data-theme="${theme}"
       data-callback="onSuccess"
       data-error-callback="onError"
       data-expired-callback="onExpired"></div>
  <script>
    function post(type, val) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, value: val }));
      }
    }
    window.onerror = function(msg, url, line, col, err) {
      post('error', 'Turnstile Page JS error: ' + msg + ' (line ' + line + ')');
    };
    function onSuccess(token) { post('success', token); }
    function onError(err) { post('error', err || 'Lỗi xác thực Turnstile'); }
    function onExpired() { post('expired'); }
    function init() {
      post('debug', 'Turnstile Page loaded. window.turnstile: ' + Boolean(window.turnstile));
      setTimeout(function() {
        var ifr = document.querySelector('iframe');
        var widget = document.querySelector('.cf-turnstile');
        post('debug', 'iframe in page: ' + Boolean(ifr) + ', widget HTML: ' + (widget ? widget.innerHTML.slice(0, 150) : 'null'));
      }, 2000);
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      init();
    } else {
      window.addEventListener('DOMContentLoaded', init);
    }
  </script>
</body>
</html>`);
});

// Auth middleware (global - set req.user neu co token, khong block)
app.use(authMiddleware);

// Routes
app.use("/api/auth",     authRoutes);
app.use("/api/trips",    tripsRoutes);
app.use("/api/payment",  paymentRoutes);
app.use("/api/weather",  weatherRoutes);
app.use(["/api/partners", "/api/admin/partners"], partnersRoutes);
app.use("/api/places",   placesRoutes);
app.use("/api/posts",    postsRoutes);
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
