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
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 4000;
// Configure CORS
const frontendOrigin = process.env.FRONTEND_ORIGIN || '*';
app.use((0, cors_1.default)({
    origin: frontendOrigin === '*' ? '*' : frontendOrigin.split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express_1.default.json());
// Root endpoint for deployment status check
app.get('/', (req, res) => {
    res.json({
        name: 'ViVu Planner Backend API',
        status: 'healthy',
        version: '1.0.0',
        mode: process.env.GEMINI_API_KEY ? 'production' : 'mock-fallback'
    });
});
// Register routes
app.use('/api/trips', trips_1.default);
app.use('/api/places', places_1.default);
app.use('/api/weather', weather_1.default);
// Catch-all 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});
// Start listening if not run as a serverless Vercel function
if (!process.env.VERCEL) {
    app.listen(port, () => {
        console.log(`[ViVu Backend] Running at http://localhost:${port}`);
        console.log(`[ViVu Backend] Mode: ${process.env.GEMINI_API_KEY ? 'Real APIs' : 'Mock Fallback'}`);
    });
}
exports.default = app;
