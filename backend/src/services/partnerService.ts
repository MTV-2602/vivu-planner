import { supabaseAdmin, isDbMocked } from './supabaseAdmin';
import { PlaceCandidate } from './placesService';

export interface Partner {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  city: string;
  price_level: number;
  cuisine_tags: string[];
  amenity_tags: string[];
  dietary_safe: string[];
  admin_rating: number;
  partner_priority: number;
  active_status: boolean;
  booking_url?: string;
  website_url?: string;
  description?: string;
  impression_count: number;
  click_count: number;
  booking_count: number;
}

function normalizeCityName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/tp\.?\s*/g, '')
    .replace(/thanh\s*pho\s*/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

function getBudgetPriceLevel(budgetTotal: number, startDate: string, endDate: string, travelerCount: number): number {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const pax = Math.max(1, Number(travelerCount) || 1);
    const dailyBudget = budgetTotal / (days * pax);

    if (dailyBudget < 500000) return 1; // budget ($)
    if (dailyBudget < 1500000) return 2; // mid ($$)
    if (dailyBudget < 4000000) return 3; // upscale ($$$)
    return 4; // luxury ($$$$)
  } catch {
    return 2; // Default to mid
  }
}

export async function getRelevantPartners(
  city: string,
  lat: number,
  lng: number,
  tripPreferences: any = {},
  tripBudgetTotal: number = 0,
  startDate: string = '',
  endDate: string = '',
  travelerCount: number = 1
): Promise<Partner[]> {
  if (isDbMocked) {
    return [];
  }

  try {
    // 1. Fetch all active partners
    const { data: partners, error } = await supabaseAdmin
      .from('partners')
      .select('*')
      .eq('active_status', true);

    if (error || !partners) {
      console.error('[PartnerService] Error fetching partners:', error);
      return [];
    }

    const targetCityNorm = normalizeCityName(city);
    const tripPriceLevel = getBudgetPriceLevel(tripBudgetTotal, startDate, endDate, travelerCount);

    const scoredPartners = partners
      .filter((partner: Partner) => {
        // Match city (case insensitive and normalized)
        const partnerCityNorm = normalizeCityName(partner.city);
        if (partnerCityNorm !== targetCityNorm) return false;

        // Proximity check (hard block > 15km)
        const distance = getHaversineDistance(lat, lng, partner.lat, partner.lng);
        if (distance > 15) return false;

        return true;
      })
      .map((partner: Partner) => {
        const distance = getHaversineDistance(lat, lng, partner.lat, partner.lng);

        // A. Proximity Score (40% weight)
        let proximityScore = 0;
        if (distance <= 2) proximityScore = 1.0;
        else if (distance <= 5) proximityScore = 0.7;
        else if (distance <= 15) proximityScore = 0.4;

        // B. Preference Score (35% weight)
        let preferenceScore = 0;

        // Price match: off by 0: +0.3, off by 1: +0.15
        const priceDiff = Math.abs(partner.price_level - tripPriceLevel);
        if (priceDiff === 0) preferenceScore += 0.3;
        else if (priceDiff === 1) preferenceScore += 0.15;

        // Cuisine tags match (for restaurants/cafes)
        if (partner.category === 'restaurant' || partner.category === 'cafe') {
          const prefCuisines = tripPreferences.food || [];
          const matchedCuisine = partner.cuisine_tags.some((tag: string) => 
            prefCuisines.includes(tag)
          );
          if (matchedCuisine) preferenceScore += 0.3;
        }

        // Amenity tags match (for hotels/resorts/homestays)
        if (['hotel', 'homestay', 'resort'].includes(partner.category)) {
          const prefAmenities = tripPreferences.accommodation || [];
          const matchedAmenity = partner.amenity_tags.some((tag: string) => 
            prefAmenities.includes(tag)
          );
          if (matchedAmenity) preferenceScore += 0.2;
        }

        // Dietary safe match
        const tripDietary = tripPreferences.dietary || [];
        const matchedDietary = partner.dietary_safe.some((tag: string) => 
          tripDietary.includes(tag)
        );
        if (matchedDietary) preferenceScore += 0.2;

        // Cap preferenceScore at 1.0
        preferenceScore = Math.min(1.0, preferenceScore);

        // C. Normalized Usage Score (15% weight)
        // Highly clicked and booked partners are scored higher
        const totalEvents = partner.impression_count + partner.click_count + partner.booking_count;
        const ctr = partner.impression_count > 0 ? (partner.click_count / partner.impression_count) : 0;
        const bookingRate = partner.click_count > 0 ? (partner.booking_count / partner.click_count) : 0;
        const usageScore = Math.min(1.0, (ctr * 0.5) + (bookingRate * 0.5));

        // D. Admin Rating Score (5% weight)
        const adminRatingScore = (partner.admin_rating || 3) / 5;

        // E. Partner Priority Score (5% weight)
        const priorityScore = (partner.partner_priority || 0) / 10;

        // Final score calculation
        const score = 
          (proximityScore * 0.40) +
          (preferenceScore * 0.35) +
          (usageScore * 0.15) +
          (adminRatingScore * 0.05) +
          (priorityScore * 0.05);

        return {
          partner,
          score
        };
      })
      .sort((a, b) => b.score - a.score)
      .map(item => item.partner);

    return scoredPartners;
  } catch (err) {
    console.error('[PartnerService] Error scoring partners:', err);
    return [];
  }
}

export function convertPartnersToPlaceCandidates(partners: Partner[]): PlaceCandidate[] {
  return partners.map(p => {
    let candidateCategory: 'accommodation' | 'dining' | 'attraction' | 'rental' = 'attraction';
    if (['hotel', 'homestay', 'resort'].includes(p.category)) {
      candidateCategory = 'accommodation';
    } else if (['restaurant', 'cafe'].includes(p.category)) {
      candidateCategory = 'dining';
    } else if (p.category === 'transport') {
      candidateCategory = 'rental';
    }

    return {
      google_place_id: `partner_${p.id}`,
      name: p.name,
      category: candidateCategory,
      lat: p.lat,
      lng: p.lng,
      rating: p.admin_rating || 4.5,
      price_level: p.price_level || 2,
      address: p.address,
      booking_url: p.booking_url
    };
  });
}

export async function logPartnerEvent(
  partnerId: string,
  eventType: 'impression' | 'click' | 'booking' | 'skip',
  tripId?: string,
  userId?: string,
  metadata: any = {}
): Promise<void> {
  if (isDbMocked) return;

  try {
    // 1. Insert detailed event record in partner_analytics
    const { error: insertError } = await supabaseAdmin
      .from('partner_analytics')
      .insert({
        partner_id: partnerId,
        event_type: eventType,
        trip_id: tripId || null,
        user_id: userId || null,
        metadata
      });

    if (insertError) {
      console.error('[PartnerService] Error logging analytics event:', insertError);
    }

    // 2. Increment counters in partners table
    const columnMap: Record<string, string> = {
      impression: 'impression_count',
      click: 'click_count',
      booking: 'booking_count'
    };

    const counterCol = columnMap[eventType];
    if (counterCol) {
      // Fetch current counts
      const { data: current, error: fetchError } = await supabaseAdmin
        .from('partners')
        .select(counterCol)
        .eq('id', partnerId)
        .single();

      if (!fetchError && current) {
        const nextVal = (current[counterCol] || 0) + 1;
        await supabaseAdmin
          .from('partners')
          .update({ [counterCol]: nextVal, updated_at: new Date().toISOString() })
          .eq('id', partnerId);
      }
    }
  } catch (err) {
    console.error('[PartnerService] Error in logPartnerEvent:', err);
  }
}
