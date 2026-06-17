import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/authMiddleware';
import { searchPlaces } from '../services/placesService';

const router = Router();

router.get('/search', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { query, lat, lng, category } = req.query;

  if (!query || !lat || !lng || !category) {
    return res.status(400).json({ error: 'Missing parameters: query, lat, lng, and category are required' });
  }

  const validCategories = ['accommodation', 'dining', 'attraction', 'rental'];
  if (!validCategories.includes(category as string)) {
    return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
  }

  try {
    const candidates = await searchPlaces(
      query as string,
      category as 'accommodation' | 'dining' | 'attraction' | 'rental',
      parseFloat(lat as string),
      parseFloat(lng as string)
    );
    return res.json(candidates);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to search places', details: error.message });
  }
});

export default router;
