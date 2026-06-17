import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/authMiddleware';
import { getWeatherForecast } from '../services/weatherService';

const router = Router();

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { lat, lng, start_date, end_date } = req.query;

  if (!lat || !lng || !start_date || !end_date) {
    return res.status(400).json({ error: 'Missing parameters: lat, lng, start_date, and end_date are required' });
  }

  try {
    const forecast = await getWeatherForecast(
      parseFloat(lat as string),
      parseFloat(lng as string),
      start_date as string,
      end_date as string
    );
    return res.json(forecast);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to retrieve weather forecast', details: error.message });
  }
});

export default router;
