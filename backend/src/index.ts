import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import tripsRouter from './routes/trips';
import placesRouter from './routes/places';
import weatherRouter from './routes/weather';
import devRouter from './routes/dev';
import adminRouter from './routes/admin';
import authRouter from './routes/auth';
import partnersRouter from './routes/partners';
import paymentRouter from './routes/payment';

process.env.TZ = 'Asia/Ho_Chi_Minh';
dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// Configure CORS — allow Vercel frontend and localhost dev
const frontendOrigin = process.env.FRONTEND_ORIGIN || '*';
app.use(cors({
  origin: frontendOrigin === '*' ? '*' : frontendOrigin.split(',').map(o => o.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json());

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
app.use('/api/trips', tripsRouter);
app.use('/api/places', placesRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/dev', devRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/partners', partnersRouter);
app.use('/api/auth', authRouter);
app.use('/api/payment', paymentRouter);

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

export default app;
