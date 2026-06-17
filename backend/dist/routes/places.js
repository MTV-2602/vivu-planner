"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const placesService_1 = require("../services/placesService");
const router = (0, express_1.Router)();
router.get('/search', authMiddleware_1.authMiddleware, async (req, res) => {
    const { query, lat, lng, category } = req.query;
    if (!query || !lat || !lng || !category) {
        return res.status(400).json({ error: 'Missing parameters: query, lat, lng, and category are required' });
    }
    const validCategories = ['accommodation', 'dining', 'attraction', 'rental'];
    if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
    }
    try {
        const candidates = await (0, placesService_1.searchPlaces)(query, category, parseFloat(lat), parseFloat(lng));
        return res.json(candidates);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to search places', details: error.message });
    }
});
exports.default = router;
