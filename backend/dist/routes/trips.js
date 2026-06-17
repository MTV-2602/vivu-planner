"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const supabaseAdmin_1 = require("../services/supabaseAdmin");
const placesService_1 = require("../services/placesService");
const weatherService_1 = require("../services/weatherService");
const geminiService_1 = require("../services/geminiService");
const router = (0, express_1.Router)();
// GET /api/trips - List all trips of the current user
router.get('/', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    try {
        const { data: trips, error } = await client
            .from('trips')
            .select('*')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return res.json(trips);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to retrieve trips', details: error.message });
    }
});
// GET /api/trips/:id - Get a specific trip detail with days and items
router.get('/:id', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const tripId = req.params.id;
    try {
        const { data: trip, error: tripError } = await client
            .from('trips')
            .select('*')
            .eq('id', tripId)
            .single();
        if (tripError || !trip) {
            return res.status(404).json({ error: 'Trip not found' });
        }
        const { data: days, error: daysError } = await client
            .from('itinerary_days')
            .select('*')
            .eq('trip_id', tripId)
            .order('day_number', { ascending: true });
        if (daysError)
            throw daysError;
        let daysWithItems = [];
        if (days && days.length > 0) {
            const dayIds = days.map(d => d.id);
            const { data: items, error: itemsError } = await client
                .from('itinerary_items')
                .select('*')
                .in('day_id', dayIds)
                .order('order_index', { ascending: true });
            if (itemsError)
                throw itemsError;
            daysWithItems = days.map(day => ({
                ...day,
                items: items ? items.filter(item => item.day_id === day.id) : []
            }));
        }
        // Retrieve revision logs
        const { data: revisions } = await client
            .from('itinerary_revisions')
            .select('*')
            .eq('trip_id', tripId)
            .order('created_at', { ascending: false });
        return res.json({
            ...trip,
            days: daysWithItems,
            revisions: revisions || []
        });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to retrieve trip details', details: error.message });
    }
});
// POST /api/trips - Create a new trip and generate AI itinerary
router.post('/', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const { title, destination_city, start_date, end_date, budget_total, traveler_count, traveler_type, preferences, health_conditions, special_requirements } = req.body;
    if (!destination_city || !start_date || !end_date || !budget_total) {
        return res.status(400).json({ error: 'Missing required parameters: destination_city, start_date, end_date, budget_total' });
    }
    try {
        // 1. Resolve coordinates
        const { lat, lng } = (0, placesService_1.getCityCoordinates)(destination_city);
        // 2. Fetch weather
        const weatherForecast = await (0, weatherService_1.getWeatherForecast)(lat, lng, start_date, end_date);
        // 3. Search real candidate places in the background
        const [accommodations, dining, attractions, rentals] = await Promise.all([
            (0, placesService_1.searchPlaces)('khách sạn homestay', 'accommodation', lat, lng),
            (0, placesService_1.searchPlaces)('nhà hàng quán ăn ngon đặc sản', 'dining', lat, lng),
            (0, placesService_1.searchPlaces)('địa điểm tham quan du lịch danh lam thắng cảnh', 'attraction', lat, lng),
            (0, placesService_1.searchPlaces)('cho thuê xe máy tự lái', 'rental', lat, lng)
        ]);
        const candidatePlaces = {
            accommodation: accommodations,
            dining,
            attraction: attractions,
            rental: rentals
        };
        // 4. Generate AI itinerary using Gemini
        const itinerary = await (0, geminiService_1.generateItinerary)(req.body, weatherForecast, candidatePlaces);
        // 5. Save trip to Supabase
        const { data: trip, error: tripError } = await client
            .from('trips')
            .insert({
            user_id: req.user.id,
            title: title || `Chuyến đi ${destination_city}`,
            destination_city,
            destination_province: destination_city,
            start_date,
            end_date,
            budget_total: parseFloat(budget_total),
            traveler_count: parseInt(traveler_count || '1'),
            traveler_type: traveler_type || 'solo',
            preferences: preferences || {},
            health_conditions: health_conditions || '',
            special_requirements: special_requirements || '',
            status: 'draft'
        })
            .select()
            .single();
        if (tripError || !trip) {
            throw tripError || new Error('Failed to create trip record');
        }
        // 6. Save itinerary days
        const daysToInsert = itinerary.days.map(d => ({
            trip_id: trip.id,
            day_number: d.day_number,
            date: d.date,
            weather_summary: { note: d.weather_note }
        }));
        const { data: dbDays, error: daysError } = await client
            .from('itinerary_days')
            .insert(daysToInsert)
            .select();
        if (daysError || !dbDays) {
            throw daysError || new Error('Failed to insert itinerary days');
        }
        // 7. Save itinerary items
        const itemsToInsert = [];
        itinerary.days.forEach(day => {
            const dbDay = dbDays.find(d => d.day_number === day.day_number);
            if (!dbDay)
                return;
            day.items.forEach(item => {
                let itemLat = lat;
                let itemLng = lng;
                let itemAddress = '';
                if (item.google_place_id) {
                    const matched = [
                        ...accommodations,
                        ...dining,
                        ...attractions,
                        ...rentals
                    ].find(c => c.google_place_id === item.google_place_id);
                    if (matched) {
                        itemLat = matched.lat;
                        itemLng = matched.lng;
                        itemAddress = matched.address;
                    }
                }
                itemsToInsert.push({
                    day_id: dbDay.id,
                    item_type: item.item_type,
                    title: item.title,
                    description: item.description || itemAddress || '',
                    start_time: item.start_time ? `${item.start_time}:00` : null,
                    end_time: item.end_time ? `${item.end_time}:00` : null,
                    location_name: item.title,
                    location_lat: itemLat,
                    location_lng: itemLng,
                    google_place_id: item.google_place_id || null,
                    estimated_cost: item.estimated_cost || 0,
                    order_index: item.order_index,
                    status: 'planned'
                });
            });
        });
        if (itemsToInsert.length > 0) {
            const { error: itemsError } = await client
                .from('itinerary_items')
                .insert(itemsToInsert);
            if (itemsError)
                throw itemsError;
        }
        // Fetch the full assembled trip details to return
        const { data: fullTrip, error: fetchError } = await client
            .from('trips')
            .select('*')
            .eq('id', trip.id)
            .single();
        const dbDaysWithItems = dbDays
            .sort((a, b) => a.day_number - b.day_number)
            .map(day => ({
            ...day,
            items: itemsToInsert.filter(item => item.day_id === day.id)
        }));
        return res.status(201).json({
            ...fullTrip,
            days: dbDaysWithItems
        });
    }
    catch (error) {
        console.error('Error generating trip:', error);
        return res.status(500).json({ error: 'Failed to create trip and generate itinerary', details: error.message });
    }
});
// PUT /api/trips/:id - Edit trip details (e.g. status)
router.put('/:id', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const tripId = req.params.id;
    try {
        const { data: trip, error } = await client
            .from('trips')
            .update(req.body)
            .eq('id', tripId)
            .select()
            .single();
        if (error)
            throw error;
        return res.json(trip);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to update trip metadata', details: error.message });
    }
});
// DELETE /api/trips/:id - Delete a trip
router.delete('/:id', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const tripId = req.params.id;
    try {
        const { error } = await client
            .from('trips')
            .delete()
            .eq('id', tripId);
        if (error)
            throw error;
        return res.json({ success: true, message: 'Trip deleted successfully' });
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to delete trip', details: error.message });
    }
});
// POST /api/trips/:id/disruptions - Report a disruption and trigger AI adjustment
router.post('/:id/disruptions', authMiddleware_1.authMiddleware, async (req, res) => {
    const client = (0, supabaseAdmin_1.getSupabaseUserClient)(req.token);
    const tripId = req.params.id;
    const { disruption_type, description, day_id } = req.body;
    if (!disruption_type || !description) {
        return res.status(400).json({ error: 'disruption_type and description are required' });
    }
    try {
        // 1. Fetch trip and current itinerary
        const { data: trip, error: tripError } = await client.from('trips').select('*').eq('id', tripId).single();
        if (tripError || !trip)
            return res.status(404).json({ error: 'Trip not found' });
        const { data: dbDays, error: daysError } = await client
            .from('itinerary_days')
            .select('*')
            .eq('trip_id', tripId)
            .order('day_number', { ascending: true });
        if (daysError || !dbDays || dbDays.length === 0) {
            return res.status(400).json({ error: 'No itinerary days found for this trip' });
        }
        const dayIds = dbDays.map(d => d.id);
        const { data: dbItems, error: itemsError } = await client
            .from('itinerary_items')
            .select('*')
            .in('day_id', dayIds)
            .order('order_index', { ascending: true });
        if (itemsError || !dbItems) {
            return res.status(400).json({ error: 'No itinerary items found' });
        }
        // 2. Determine affected starting day
        let affectedDayNumber = 1;
        if (day_id) {
            const matchedDay = dbDays.find(d => d.id === day_id);
            if (matchedDay)
                affectedDayNumber = matchedDay.day_number;
        }
        // 3. Build snapshot JSON of the current itinerary
        const previousSnapshot = {
            days: dbDays.map(d => ({
                day_number: d.day_number,
                date: d.date,
                weather_note: d.weather_summary?.note || '',
                items: dbItems.filter(item => item.day_id === d.id)
            })),
            budget_summary: {
                estimated_total: dbItems.reduce((sum, item) => sum + (Number(item.estimated_cost) || 0), 0)
            }
        };
        // 4. Save disruption event row
        const { data: disruptionEvent, error: disError } = await client
            .from('disruption_events')
            .insert({
            trip_id: tripId,
            day_id: day_id || null,
            disruption_type,
            description,
            resolved: false
        })
            .select()
            .single();
        if (disError || !disruptionEvent)
            throw disError || new Error('Failed to save disruption event');
        // 5. Fetch weather and places candidates to feed into adaptation
        const { lat, lng } = (0, placesService_1.getCityCoordinates)(trip.destination_city);
        const weatherForecast = await (0, weatherService_1.getWeatherForecast)(lat, lng, trip.start_date, trip.end_date);
        const [accommodations, dining, attractions, rentals] = await Promise.all([
            (0, placesService_1.searchPlaces)('khách sạn', 'accommodation', lat, lng),
            (0, placesService_1.searchPlaces)('nhà hàng ngon', 'dining', lat, lng),
            (0, placesService_1.searchPlaces)('địa điểm tham quan', 'attraction', lat, lng),
            (0, placesService_1.searchPlaces)('thuê xe máy', 'rental', lat, lng)
        ]);
        const candidatePlaces = { accommodation: accommodations, dining, attraction: attractions, rental: rentals };
        // 6. Call adaptation service
        const { itinerary: adaptedItinerary, diff } = await (0, geminiService_1.adaptItinerary)(trip, previousSnapshot, disruption_type, description, weatherForecast, candidatePlaces);
        // 7. Save itinerary revision using admin client (bypasses RLS since revision writing is restricted)
        const { error: revError } = await supabaseAdmin_1.supabaseAdmin
            .from('itinerary_revisions')
            .insert({
            trip_id: tripId,
            disruption_event_id: disruptionEvent.id,
            previous_snapshot: previousSnapshot,
            new_snapshot: adaptedItinerary
        });
        if (revError)
            console.error('Failed to log revision history:', revError.message);
        // 8. Apply changes to itinerary_items in Supabase
        // Gather day IDs of affected days (day_number >= affectedDayNumber)
        const affectedDays = dbDays.filter(d => d.day_number >= affectedDayNumber);
        const affectedDayIds = affectedDays.map(d => d.id);
        if (affectedDayIds.length > 0) {
            // Step A: Mark existing planned items on affected days as replaced
            const { error: updateError } = await client
                .from('itinerary_items')
                .update({ status: 'replaced' })
                .in('day_id', affectedDayIds)
                .eq('status', 'planned');
            if (updateError)
                throw updateError;
            // Step B: Insert new items generated by AI for those days
            const itemsToInsert = [];
            adaptedItinerary.days.forEach(day => {
                if (day.day_number < affectedDayNumber)
                    return; // Skip days before the disruption
                const dbDay = dbDays.find(d => d.day_number === day.day_number);
                if (!dbDay)
                    return;
                day.items.forEach(item => {
                    let itemLat = lat;
                    let itemLng = lng;
                    if (item.google_place_id) {
                        const matched = [
                            ...accommodations,
                            ...dining,
                            ...attractions,
                            ...rentals
                        ].find(c => c.google_place_id === item.google_place_id);
                        if (matched) {
                            itemLat = matched.lat;
                            itemLng = matched.lng;
                        }
                    }
                    itemsToInsert.push({
                        day_id: dbDay.id,
                        item_type: item.item_type,
                        title: item.title,
                        description: item.description,
                        start_time: item.start_time ? `${item.start_time}:00` : null,
                        end_time: item.end_time ? `${item.end_time}:00` : null,
                        location_name: item.title,
                        location_lat: itemLat,
                        location_lng: itemLng,
                        google_place_id: item.google_place_id || null,
                        estimated_cost: item.estimated_cost || 0,
                        order_index: item.order_index,
                        status: 'planned'
                    });
                });
            });
            if (itemsToInsert.length > 0) {
                const { error: insertError } = await client
                    .from('itinerary_items')
                    .insert(itemsToInsert);
                if (insertError)
                    throw insertError;
            }
        }
        // 9. Mark disruption resolved
        const { error: resolveError } = await client
            .from('disruption_events')
            .update({
            resolved: true,
            resolution_summary: diff
        })
            .eq('id', disruptionEvent.id);
        if (resolveError)
            console.error('Failed to mark disruption resolved in DB:', resolveError.message);
        return res.json({
            success: true,
            message: 'Itinerary adapted successfully',
            diff,
            itinerary: adaptedItinerary
        });
    }
    catch (error) {
        console.error('Adaptation route failed:', error);
        return res.status(500).json({ error: 'Failed to adapt itinerary', details: error.message });
    }
});
exports.default = router;
