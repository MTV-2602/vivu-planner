import { Router, Request, Response } from 'express';
import { searchPlaces } from './places.service';

const router = Router();

// GET /api/places/search
router.get('/search', async (req: Request, res: Response) => {
  const { query, category, lat, lng } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  try {
    const results = await searchPlaces(
      String(query),
      (category as any) || 'attraction',
      lat ? Number(lat) : undefined,
      lng ? Number(lng) : undefined
    );
    return res.json({ results, data: results });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to search places', details: err.message });
  }
});

export default router;
