import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { asyncHandler } from '../../utils/asyncHandler';
import { getWeatherForecast } from './weather.service';

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req: any, res: any) => {
  const { lat, lng, start_date, end_date } = req.query;
  if (!lat || !lng || !start_date || !end_date) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  const forecast = await getWeatherForecast(
    parseFloat(lat as string), parseFloat(lng as string), 
    start_date as string, end_date as string
  );
  return res.json(forecast);
}));

export default router;
