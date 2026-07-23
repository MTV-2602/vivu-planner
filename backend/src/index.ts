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

// Configure CORS
const frontendOrigin = process.env.FRONTEND_ORIGIN || '*';
app.use(cors({
  origin: frontendOrigin === '*' ? '*' : frontendOrigin.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

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

// Start listening if not run as a serverless Vercel function
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`[ViVu Backend] Running at http://localhost:${port}`);
    console.log(`[ViVu Backend] Mode: ${process.env.GEMINI_API_KEY ? 'Real APIs' : 'Mock Fallback'}`);
  });
}

export default app;
