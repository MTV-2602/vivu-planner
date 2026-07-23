"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const trips_1 = __importDefault(require("./routes/trips"));
const places_1 = __importDefault(require("./routes/places"));
const weather_1 = __importDefault(require("./routes/weather"));
const dev_1 = __importDefault(require("./routes/dev"));
const admin_1 = __importDefault(require("./routes/admin"));
const auth_1 = __importDefault(require("./routes/auth"));
const partners_1 = __importDefault(require("./routes/partners"));
const payment_1 = __importDefault(require("./routes/payment"));
process.env.TZ = 'Asia/Ho_Chi_Minh';
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 4000;
// Configure CORS — allow Vercel frontend and localhost dev
const frontendOrigin = process.env.FRONTEND_ORIGIN || '*';
app.use((0, cors_1.default)({
    origin: frontendOrigin === '*' ? '*' : frontendOrigin.split(',').map(o => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
app.use(express_1.default.json());
// ─── Health check (used by UptimeRobot to keep Render alive) ─────────────────
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        mode: process.env.SUPABASE_URL ? 'production' : 'unconfigured',
    });
});
// Root endpoint for deployment status check
app.get('/', (_req, res) => {
    res.json({
        name: 'ViVu Planner Backend API',
        status: 'healthy',
        version: '1.0.0',
        mode: process.env.SUPABASE_URL ? 'production' : 'unconfigured',
    });
});
// Register routes
app.use('/api/trips', trips_1.default);
app.use('/api/places', places_1.default);
app.use('/api/weather', weather_1.default);
app.use('/api/dev', dev_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/admin/partners', partners_1.default);
app.use('/api/auth', auth_1.default);
app.use('/api/payment', payment_1.default);
// Catch-all 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});
// Always listen — Render runs as a persistent Node.js process (not serverless)
const server = app.listen(port, () => {
    console.log(`[ViVu Backend] Running at http://localhost:${port}`);
    console.log(`[ViVu Backend] Mode: ${process.env.GEMINI_API_KEY ? 'Real APIs' : 'Mock Fallback'}`);
    console.log(`[ViVu Backend] CORS: ${frontendOrigin}`);
});
// Set server-level timeout to 180 seconds (Gemini AI generation can take 60-90s)
server.setTimeout(180000);
exports.default = app;
