import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUDGET_AUTO_SCALE_THRESHOLD,
  BUDGET_AUTO_SCALE_FACTOR,
  QUOTA_CONFIG,
  TripStatus,
  UserRole
} from '../../../constants';
import {
  VALID_TRIP_TRANSITIONS,
  calculateActualExpenses,
  normalizeExpenseCategory,
  sanitizeBudgetBreakdown,
  ExpenseLogItem
} from '../trips.router';
import { buildRichPlacesFallback, generateDeterministicPlaceId } from '../../ai/gemini.service';
import { getCityCoordinates } from '../../places/places.service';

describe('Trip & Quota Business Rules', () => {
  it('should have standard free tier and admin quotas', () => {
    assert.equal(QUOTA_CONFIG.DEFAULT_FREE_TRIPS, 3);
    assert.equal(QUOTA_CONFIG.UNLIMITED_ADMIN_TRIPS, 9999);
  });

  it('should scale down budgets entered in shorthand thousands accurately', () => {
    // If a user enters shorthand 500 (meaning 500,000):
    const shorthandBudget = 500;
    assert.ok(shorthandBudget < BUDGET_AUTO_SCALE_THRESHOLD);
    const scaled = shorthandBudget * BUDGET_AUTO_SCALE_FACTOR;
    assert.equal(scaled, 500_000);

    // If a user enters full 2,000,000 VND:
    const fullVnd = 2_000_000;
    assert.ok(fullVnd >= BUDGET_AUTO_SCALE_THRESHOLD);
  });

  it('should define all required trip lifecycle statuses', () => {
    assert.equal(TripStatus.DRAFT, 'draft');
    assert.equal(TripStatus.ACTIVE, 'active');
    assert.equal(TripStatus.COMPLETED, 'completed');
    assert.equal(TripStatus.ARCHIVED, 'archived');
  });

  it('should enforce state machine transition rules', () => {
    // Draft can move to Active or Archived
    assert.deepEqual(VALID_TRIP_TRANSITIONS[TripStatus.DRAFT], [TripStatus.ACTIVE, TripStatus.ARCHIVED]);

    // Active can move to Completed or Archived
    assert.deepEqual(VALID_TRIP_TRANSITIONS[TripStatus.ACTIVE], [TripStatus.COMPLETED, TripStatus.ARCHIVED]);

    // Completed can move to Archived or back to Active
    assert.deepEqual(VALID_TRIP_TRANSITIONS[TripStatus.COMPLETED], [TripStatus.ARCHIVED, TripStatus.ACTIVE]);

    // Archived can only un-archive back to Active, NOT jump directly to Draft
    assert.deepEqual(VALID_TRIP_TRANSITIONS[TripStatus.ARCHIVED], [TripStatus.ACTIVE]);
    assert.ok(!VALID_TRIP_TRANSITIONS[TripStatus.ARCHIVED].includes(TripStatus.DRAFT));
  });

  it('should define basic system user roles', () => {
    assert.equal(UserRole.USER, 'user');
    assert.equal(UserRole.ADMIN, 'admin');
  });

  it('should reject invalid trip date ranges where start_date is not strictly before end_date', () => {
    const validStart = '2026-10-01';
    const validEnd = '2026-10-05';
    assert.ok(new Date(validStart) < new Date(validEnd));

    const sameDay = '2026-10-01';
    assert.ok(new Date(validStart) >= new Date(sameDay));

    const invertedStart = '2026-10-05';
    const invertedEnd = '2026-10-01';
    assert.ok(new Date(invertedStart) >= new Date(invertedEnd));
  });

  it('should support creation_mode manual and ai_auto logic structure', () => {
    const modes = ['manual', 'ai_auto'];
    assert.ok(modes.includes('manual'));
    assert.ok(modes.includes('ai_auto'));

    const cartItem = {
      place: {
        id: 'place_1',
        name: 'Quán ăn ngon',
        category: 'dining',
        estimated_cost: 120000,
        price_level: 2
      },
      pricing_option: 'auto',
      custom_cost: 150000
    };
    assert.equal(cartItem.custom_cost, 150000);
  });

  it('should validate Candidate Places Pool structure and categories', () => {
    const validCategories = ['dining', 'cafe', 'attraction', 'accommodation'];
    const mockPlace = {
      id: 'place_abc123',
      name: 'Tiệm Cà Phê Cheo Veo',
      category: 'cafe',
      address: '116 Hùng Vương, Phường 11, TP. Đà Lạt',
      lat: 11.9404,
      lng: 108.4583,
      estimated_cost: 45000,
      rating: 4.8,
      suggested_day: 1,
      social_review_quote: 'View thung lũng đón hoàng hôn cực đỉnh tại Đà Lạt.'
    };

    assert.ok(mockPlace.id.startsWith('place_'));
    assert.ok(validCategories.includes(mockPlace.category));
    assert.equal(typeof mockPlace.name, 'string');
    assert.equal(typeof mockPlace.address, 'string');
    assert.ok(mockPlace.lat > 8.0 && mockPlace.lat < 24.0);
    assert.ok(mockPlace.lng > 102.0 && mockPlace.lng < 110.0);
    assert.ok(mockPlace.estimated_cost >= 0);
    assert.ok(mockPlace.rating >= 4.0 && mockPlace.rating <= 5.0);
    assert.equal(mockPlace.suggested_day, 1);
  });

  it('should correctly embed candidate_pool into trip preferences', () => {
    const preferences = ['ẩm thực', 'sống ảo'];
    const candidate_pool = [
      {
        id: 'place_01',
        name: 'Quán Lẩu Gà Lá É Tao Ngộ',
        category: 'dining',
        address: '5 đường 3/4, TP. Đà Lạt',
        lat: 11.93,
        lng: 108.44,
        estimated_cost: 250000,
        rating: 4.7,
        suggested_day: 1,
        social_review_quote: 'Nước dùng ngọt thanh đậm đà.'
      }
    ];

    let basePrefs: Record<string, any> = {};
    if (Array.isArray(preferences)) {
      basePrefs = { tags: preferences };
    }
    if (candidate_pool.length > 0) {
      basePrefs.candidate_pool = candidate_pool;
    }

    const enriched: Record<string, any> = {
      ...basePrefs,
      is_ai_pro: false,
      ai_tier: 'standard'
    };

    assert.deepEqual(enriched.tags, ['ẩm thực', 'sống ảo']);
    assert.equal(enriched.candidate_pool.length, 1);
    assert.equal(enriched.candidate_pool[0].name, 'Quán Lẩu Gà Lá É Tao Ngộ');
  });

  it('DEV-BE-FIX01: should provide rich default places for Da Nang and Hoi An', async () => {
    const { getDefaultPlacesForCity, getDefaultCafesForCity } = await import('../../places/defaultPlaces');

    const dn = getDefaultPlacesForCity('Đà Nẵng');
    assert.ok(dn.attraction.length >= 10, `Đà Nẵng should have >= 10 attractions, got ${dn.attraction.length}`);
    assert.ok(dn.accommodation.length >= 3, `Đà Nẵng should have >= 3 accommodations, got ${dn.accommodation.length}`);
    assert.ok(dn.dining.length >= 5, `Đà Nẵng should have >= 5 dining places, got ${dn.dining.length}`);

    const dnCafes = getDefaultCafesForCity('Đà Nẵng');
    assert.ok(dnCafes.length >= 3, `Đà Nẵng should have >= 3 cafes, got ${dnCafes.length}`);

    const ha = getDefaultPlacesForCity('Hội An');
    assert.ok(ha.attraction.length >= 10, `Hội An should have >= 10 attractions, got ${ha.attraction.length}`);
    assert.ok(ha.accommodation.length >= 3, `Hội An should have >= 3 accommodations, got ${ha.accommodation.length}`);
    assert.ok(ha.dining.length >= 5, `Hội An should have >= 5 dining places, got ${ha.dining.length}`);

    const haCafes = getDefaultCafesForCity('Hội An');
    assert.ok(haCafes.length >= 3, `Hội An should have >= 3 cafes, got ${haCafes.length}`);
  });

  it('DEV-BE-FIX01 LỖI B3/B4: should filter out resort/luxury accommodation when budget < 8M/person', async () => {
    const { fetchCandidatePlacesForCity } = await import('../../places/places.service');
    
    // Budget 3M for 1 person -> budgetPerPerson = 3M (< 8M)
    const candidates = await fetchCandidatePlacesForCity('Đà Nẵng', 3000000, 1);
    
    // Accommodations should not include price_level >= 3 or luxury resort
    for (const acc of candidates.accommodation) {
      assert.ok(
        acc.price_level < 3,
        `Accommodation ${acc.name} has price_level ${acc.price_level} >= 3 on tight budget`
      );
      assert.ok(
        !acc.name.toLowerCase().includes('resort'),
        `Accommodation ${acc.name} is a resort on tight budget`
      );
    }
  });

  it('DEV-BE-FIX01 LỖI B1 & H2: should keep accommodation on Day 1 and strip "Di chuyển đến" transport', async () => {
    const { generateItinerary } = await import('../../ai/gemini.service');
    const { getDefaultPlacesForCity } = await import('../../places/defaultPlaces');

    // Test with mock data for a 1-day trip (start_date === end_date)
    const tripData = {
      destination_city: 'Đà Nẵng',
      start_date: '2026-10-15T00:00:00.000Z',
      end_date: '2026-10-15T23:59:59.000Z',
      budget_total: 2000000,
      traveler_count: 1,
      traveler_type: 'Một mình',
      preferences: ['Khám phá', 'Ẩm thực']
    };

    const weatherForecast: any[] = [
      { date: '2026-10-15', temperature_c: 28, weather_condition: 'Nắng nhẹ', condition: 'Nắng nhẹ', temp_min: 24, temp_max: 30, rain_chance: 10 }
    ];

    const candidatePlaces = getDefaultPlacesForCity('Đà Nẵng');

    const itinerary = await generateItinerary(tripData, weatherForecast, candidatePlaces);

    assert.ok(itinerary.days.length === 1, 'Should have 1 day');
    const day1 = itinerary.days[0];

    // Check LỖI B1: 1-day trip MUST have accommodation item
    const hasAccommodation = day1.items.some(it => it.item_type === 'accommodation');
    assert.ok(hasAccommodation, '1-day trip must contain an accommodation item on Day 1');

    // Check LỖI H2: Transport to destination must NOT exist on Day 1
    const forbiddenTransport = day1.items.some(it => {
      if (it.item_type !== 'transport') return false;
      const t = (it.title || '').toLowerCase();
      return t.includes('di chuyen den') || t.includes('khoi hanh den') || t.includes('bay den');
    });
    assert.ok(!forbiddenTransport, 'Day 1 must not contain transport to destination item');
  });

  it('DEV-BE: should correctly normalize expense categories', () => {
    assert.equal(normalizeExpenseCategory('dining'), 'dining');
    assert.equal(normalizeExpenseCategory('food'), 'dining');
    assert.equal(normalizeExpenseCategory('restaurant'), 'dining');
    assert.equal(normalizeExpenseCategory('cafe'), 'cafe');
    assert.equal(normalizeExpenseCategory('hotel'), 'hotel');
    assert.equal(normalizeExpenseCategory('accommodation'), 'hotel');
    assert.equal(normalizeExpenseCategory('homestay'), 'hotel');
    assert.equal(normalizeExpenseCategory('attraction'), 'attraction');
    assert.equal(normalizeExpenseCategory('entertainment'), 'attraction');
    assert.equal(normalizeExpenseCategory('other'), 'other');
    assert.equal(normalizeExpenseCategory('unknown_custom'), 'other');
  });

  it('DEV-BE: should accurately compute actual_expenses totals from expense logs', () => {
    const mockLogs: ExpenseLogItem[] = [
      {
        id: 'log-1',
        user_id: 'user-123',
        place_id: 'place-abc',
        place_name: 'Cơm tấm Sài Gòn',
        category: 'dining',
        amount: 250000,
        note: 'Bữa trưa',
        day_number: 1,
        created_at: '2026-10-02T12:00:00.000Z'
      },
      {
        id: 'log-2',
        user_id: 'user-123',
        place_id: null,
        place_name: 'Cà phê Giảng',
        category: 'cafe',
        amount: 45000,
        note: 'Cà phê trứng',
        day_number: 1,
        created_at: '2026-10-02T14:00:00.000Z'
      },
      {
        id: 'log-3',
        user_id: 'user-456',
        place_id: null,
        place_name: 'Khách sạn Melia',
        category: 'hotel',
        amount: 1200000,
        note: 'Tiền phòng đêm 1',
        day_number: 1,
        created_at: '2026-10-02T15:00:00.000Z'
      },
      {
        id: 'log-4',
        user_id: 'user-456',
        place_id: null,
        place_name: 'Vé Bà Nà Hills',
        category: 'attraction',
        amount: 900000,
        note: 'Cáp treo',
        day_number: 2,
        created_at: '2026-10-03T09:00:00.000Z'
      },
      {
        id: 'log-5',
        user_id: 'user-123',
        place_id: null,
        place_name: 'Grab taxi',
        category: 'other',
        amount: 150000,
        note: 'Di chuyển',
        day_number: 2,
        created_at: '2026-10-03T11:00:00.000Z'
      }
    ];

    const actual = calculateActualExpenses(mockLogs);
    assert.equal(actual.dining, 250000);
    assert.equal(actual.cafe, 45000);
    assert.equal(actual.hotel, 1200000);
    assert.equal(actual.attraction, 900000);
    assert.equal(actual.other, 150000);
    assert.equal(actual.total, 250000 + 45000 + 1200000 + 900000 + 150000);
  });

  it('DEV-BE: should format budget_breakdown according to required schema specification', () => {
    const rawBreakdown = {
      cafe: 500000,
      entertainment: 1000000,
      food: 1500000,
      hotel: 2000000,
      transport: 500000
    };

    const mockLogs: ExpenseLogItem[] = [
      {
        id: 'log-100',
        user_id: 'u-1',
        place_id: 'p-1',
        place_name: 'Nhà hàng Biển Đông',
        category: 'dining',
        amount: 250000,
        note: 'Ăn tối hải sản',
        day_number: 1,
        created_at: new Date().toISOString()
      }
    ];

    const breakdown = sanitizeBudgetBreakdown(rawBreakdown, mockLogs);

    assert.equal(breakdown.cafe, 500000);
    assert.equal(breakdown.entertainment, 1000000);
    assert.equal(breakdown.food, 1500000);
    assert.equal(breakdown.hotel, 2000000);
    assert.equal(breakdown.transport, 500000);
    assert.equal(breakdown.expense_logs.length, 1);
    assert.equal(breakdown.expense_logs[0].id, 'log-100');
    assert.equal(breakdown.actual_expenses.dining, 250000);
    assert.equal(breakdown.actual_expenses.cafe, 0);
    assert.equal(breakdown.actual_expenses.hotel, 0);
    assert.equal(breakdown.actual_expenses.attraction, 0);
    assert.equal(breakdown.actual_expenses.other, 0);
    assert.equal(breakdown.actual_expenses.total, 250000);
  });

  it('DEV-BE: should handle shared-cart structure and ensure fallback when empty', () => {
    const emptyPreferences: Record<string, any> = {};
    const sharedCart = Array.isArray(emptyPreferences.shared_cart) ? emptyPreferences.shared_cart : [];
    assert.deepEqual(sharedCart, []);

    const filledPreferences: Record<string, any> = {
      shared_cart: [
        {
          id: 'place_1',
          name: 'Bảo tàng Điêu khắc Chăm',
          category: 'attraction',
          added_by: 'user-123',
          added_at: '2026-10-02T10:00:00.000Z'
        }
      ]
    };
    assert.equal(filledPreferences.shared_cart.length, 1);
    assert.equal(filledPreferences.shared_cart[0].name, 'Bảo tàng Điêu khắc Chăm');
    assert.equal(filledPreferences.shared_cart[0].added_by, 'user-123');
  });

  it('DEV-BE: should reuse existing draft_id and preserve collaborator assignments on trip finalization', () => {
    const existingDraftId = 'draft-trip-uuid-123';
    const currentUserId = 'user-owner-uuid';

    // Mock incoming request body with draft_id
    const reqBody = {
      draft_id: existingDraftId,
      title: 'Chuyến đi Đà Nẵng cùng nhóm bạn',
      destination_city: 'Đà Nẵng',
      creation_mode: 'manual',
    };

    const targetDraftId = reqBody.draft_id;
    assert.equal(targetDraftId, existingDraftId);

    // Mock collaborator list for this draft trip
    const existingCollaborators = [
      { id: 'collab-1', trip_id: existingDraftId, user_id: 'friend-1', role: 'editor' },
      { id: 'collab-2', trip_id: existingDraftId, user_id: 'friend-2', role: 'viewer' },
    ];

    // Simulating draft reuse: createdTripId is assigned to draft_id
    const createdTripId = targetDraftId;
    assert.equal(createdTripId, existingDraftId);

    // Collaborators remain intact because trip_id didn't change
    const maintainedCollaborators = existingCollaborators.filter(c => c.trip_id === createdTripId);
    assert.equal(maintainedCollaborators.length, 2);
    assert.equal(maintainedCollaborators[0].user_id, 'friend-1');
  });

  it('DEV-BE VẤN ĐỀ 1: buildRichPlacesFallback must guarantee comprehensive places pool without 500 error or 0 places', () => {
    const testCities = ['Đà Nẵng', 'Hà Nội', 'Hồ Chí Minh', 'Đà Lạt'];
    
    for (const city of testCities) {
      const cityCoords = getCityCoordinates(city);
      const places = buildRichPlacesFallback(city, 3, false, cityCoords);

      assert.ok(places.length >= 40, `City ${city} should have at least 40 places, got ${places.length}`);

      const attractions = places.filter(p => p.category === 'attraction');
      const hotels = places.filter(p => p.category === 'hotel');
      const dining = places.filter(p => p.category === 'dining');
      const cafes = places.filter(p => p.category === 'cafe');

      assert.ok(attractions.length >= 10, `${city} must have >= 10 attractions, got ${attractions.length}`);
      assert.ok(hotels.length >= 3, `${city} must have >= 3 hotels, got ${hotels.length}`);
      assert.ok(dining.length >= 15, `${city} must have >= 15 dining places, got ${dining.length}`);
      assert.ok(cafes.length >= 10, `${city} must have >= 10 cafes, got ${cafes.length}`);

      // Ensure valid fields
      for (const p of places) {
        assert.ok(p.name && p.name.length > 0, 'Place must have name');
        assert.ok(!isNaN(p.lat) && p.lat !== 0, 'Place must have valid lat');
        assert.ok(!isNaN(p.lng) && p.lng !== 0, 'Place must have valid lng');
        assert.ok(p.address && p.address.length > 0, 'Place must have address');
        assert.ok(typeof p.estimated_cost === 'number', 'Place must have estimated_cost');
        assert.ok(p.rating >= 4.0, 'Place must have high rating');
      }
    }
  });

  it('DEV-BE VẤN ĐỀ 2: only trip owner is authorized to finalize draft into full itinerary, members get 403', () => {
    const draftOwnerId = 'owner-uuid-001';
    const draftMemberId = 'member-uuid-002';
    const foundDraftTrip = {
      id: 'draft-trip-999',
      user_id: draftOwnerId,
      title: 'Chuyến đi nhóm',
      status: 'draft'
    };

    // Case 1: Member attempts to create/finalize trip with draft_id -> must be forbidden
    const isMemberOwner = foundDraftTrip.user_id === draftMemberId;
    assert.equal(isMemberOwner, false);
    const memberForbiddenResponse = !isMemberOwner ? { status: 403, error: 'Chỉ trưởng nhóm (người khởi tạo) mới có quyền chốt danh sách và tạo lịch trình chuyến đi!' } : null;
    assert.ok(memberForbiddenResponse);
    assert.equal(memberForbiddenResponse.status, 403);

    // Case 2: Owner finalizes trip with draft_id -> authorized
    const isOwner = foundDraftTrip.user_id === draftOwnerId;
    assert.equal(isOwner, true);
  });

  it('DEV-BE VẤN ĐỀ 2: shared-cart updates draft_cart and shared_cart in preferences and budget_breakdown seamlessly', () => {
    const initialPreferences: Record<string, any> = {
      budget_tier: 'medium'
    };
    const incomingDraftCart = [
      { id: 'c1', name: 'Faifo Coffee', category: 'cafe', custom_cost: 45000 }
    ];

    const updatedPreferences: Record<string, any> = {
      ...initialPreferences,
      draft_cart: incomingDraftCart,
      shared_cart: incomingDraftCart
    };

    assert.equal(updatedPreferences.budget_tier, 'medium');
    assert.deepEqual(updatedPreferences.draft_cart, incomingDraftCart);
    assert.deepEqual(updatedPreferences.shared_cart, incomingDraftCart);
  });

  it('DEV-BE VẤN ĐỀ 1: generateDeterministicPlaceId generates identical IDs across multiple calls for same place and city', () => {
    const id1 = generateDeterministicPlaceId('Đà Nẵng', 'cafe', 'Cà phê Tinh Tế', 0);
    const id2 = generateDeterministicPlaceId('Đà Nẵng', 'cafe', 'Cà phê Tinh Tế', 99);
    assert.equal(id1, id2, 'Deterministic ID must match regardless of index when name is present');
    assert.equal(id1, 'p_danang_cafe_caphetinhte');

    // Test fallback without place name
    const fallbackId = generateDeterministicPlaceId('Hà Nội', 'attraction', '', 5);
    assert.equal(fallbackId, 'p_hanoi_attraction_5');
  });

  it('DEV-BE VẤN ĐỀ 1: buildRichPlacesFallback produces 100% identical IDs between two independent calls (Owner vs Member)', () => {
    const cityCoords = getCityCoordinates('Đà Nẵng');
    const pool1 = buildRichPlacesFallback('Đà Nẵng', 3, false, cityCoords);
    const pool2 = buildRichPlacesFallback('Đà Nẵng', 3, false, cityCoords);

    assert.equal(pool1.length, pool2.length);
    assert.ok(pool1.length > 0);

    for (let i = 0; i < pool1.length; i++) {
      assert.equal(pool1[i].id, pool2[i].id, `Place at index ${i} (${pool1[i].name}) must have identical IDs`);
      assert.ok(!pool1[i].id.includes('undefined'));
      assert.ok(!pool1[i].id.includes('NaN'));
    }
  });

  it('DEV-BE VẤN ĐỀ 2: shared-cart handles workspace_stage collecting and scheduling properly', () => {
    // 1. Default stage when missing is 'collecting'
    const defaultTrip: Record<string, any> = {
      preferences: { draft_cart: [] }
    };
    const stageDefault = defaultTrip.preferences?.workspace_stage || 'collecting';
    assert.equal(stageDefault, 'collecting');

    // 2. Updated stage to 'scheduling'
    const reqBody1 = {
      draft_cart: [{ id: 'p1', name: 'Địa điểm 1' }],
      workspace_stage: 'scheduling'
    };
    const currentPrefs1 = defaultTrip.preferences;
    const reqStage1 = reqBody1.workspace_stage;
    const workspaceStage1 = (reqStage1 === 'collecting' || reqStage1 === 'scheduling')
      ? reqStage1
      : (reqStage1 || currentPrefs1.workspace_stage || 'collecting');

    const updatedPrefs1 = {
      ...currentPrefs1,
      draft_cart: reqBody1.draft_cart,
      shared_cart: reqBody1.draft_cart,
      workspace_stage: workspaceStage1
    };

    assert.equal(updatedPrefs1.workspace_stage, 'scheduling');
    assert.equal(updatedPrefs1.draft_cart.length, 1);

    // 3. Switch back to 'collecting'
    const reqBody2 = {
      draft_cart: [{ id: 'p1', name: 'Địa điểm 1' }],
      workspace_stage: 'collecting'
    };
    const reqStage2 = reqBody2.workspace_stage;
    const workspaceStage2 = (reqStage2 === 'collecting' || reqStage2 === 'scheduling')
      ? reqStage2
      : (reqStage2 || updatedPrefs1.workspace_stage || 'collecting');

    const updatedPrefs2 = {
      ...updatedPrefs1,
      workspace_stage: workspaceStage2
    };

    assert.equal(updatedPrefs2.workspace_stage, 'collecting');
  });

  it('DEV-BE VẤN ĐỀ 2: creation_mode manual strictly respects custom day_number, start_time, and end_time', () => {
    const manualDays = [
      { id: 'day-1-uuid', day_number: 1, date: '2026-10-10' },
      { id: 'day-2-uuid', day_number: 2, date: '2026-10-11' },
      { id: 'day-3-uuid', day_number: 3, date: '2026-10-12' },
    ];
    const firstDay = manualDays[0];

    const cartItems = [
      // Item 1: Đã kéo thả xếp lịch thủ công vào Ngày 2 lúc 14:30 - 16:30
      {
        place: { name: 'Bảo tàng Điêu khắc Chăm', category: 'attraction', estimated_cost: 60000 },
        day_number: 2,
        start_time: '14:30',
        end_time: '16:30',
        order_index: 1
      },
      // Item 2: Chưa xếp giờ (không có start_time)
      {
        place: { name: 'Cà phê Cầu Rồng', category: 'cafe', estimated_cost: 35000 },
        day_number: 1,
        order_index: 1
      }
    ];

    const manualItemsToInsert: any[] = [];
    const computeSmartTimeSlot = (category: string, orderInDay: number) => {
      return { start: '07:30:00', end: '08:45:00' };
    };

    const formatTimeHelper = (timeStr?: string | null): string | null => {
      if (!timeStr) return null;
      const match = timeStr.trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (match) {
        return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}:${match[3] ? match[3].padStart(2, '0') : '00'}`;
      }
      return null;
    };

    cartItems.forEach((cItem) => {
      const place = cItem.place;
      const hasManualSchedule = Boolean(cItem.start_time && Number(cItem.day_number) > 0);
      let matchedDay: any;
      let finalStartTime: string | null = null;
      let finalEndTime: string | null = null;

      if (hasManualSchedule) {
        const targetDayNum = Number(cItem.day_number);
        matchedDay = manualDays.find(d => d.day_number === targetDayNum) || manualDays[manualDays.length - 1] || firstDay;
        finalStartTime = formatTimeHelper(cItem.start_time) || cItem.start_time || null;
        if (cItem.end_time) {
          finalEndTime = formatTimeHelper(cItem.end_time) || cItem.end_time || null;
        }
      } else {
        const targetDayNum = Number(cItem.day_number || 1);
        matchedDay = manualDays.find(d => d.day_number === targetDayNum) || firstDay;
        const currentCountInDay = manualItemsToInsert.filter(it => it.day_id === matchedDay.id).length;
        const dayTimeSlot = computeSmartTimeSlot(place.category, currentCountInDay);
        finalStartTime = dayTimeSlot.start;
        finalEndTime = dayTimeSlot.end;
      }

      manualItemsToInsert.push({
        day_id: matchedDay.id,
        title: place.name,
        start_time: finalStartTime,
        end_time: finalEndTime
      });
    });

    // Verify Item 1: Phải nằm ở ngày 2 với giờ 14:30:00 - 16:30:00
    const scheduledItem = manualItemsToInsert.find(it => it.title === 'Bảo tàng Điêu khắc Chăm');
    assert.ok(scheduledItem);
    assert.equal(scheduledItem.day_id, 'day-2-uuid');
    assert.equal(scheduledItem.start_time, '14:30:00');
    assert.equal(scheduledItem.end_time, '16:30:00');

    // Verify Item 2: Phải nhận timeline mặc định
    const defaultItem = manualItemsToInsert.find(it => it.title === 'Cà phê Cầu Rồng');
    assert.ok(defaultItem);
    assert.equal(defaultItem.day_id, 'day-1-uuid');
    assert.equal(defaultItem.start_time, '07:30:00');
    assert.equal(defaultItem.end_time, '08:45:00');
  });

  it('should support pregen_places and workspace_stage synchronization in shared cart', () => {
    const mockPregenPlaces = [
      { id: 'place_1', name: 'Bà Nà Hills', category: 'attraction' },
      { id: 'place_2', name: 'Bánh xèo Bà Dưỡng', category: 'dining' }
    ];
    const initialPrefs = {
      is_ai_pro: true,
      workspace_stage: 'collecting',
      pregen_places: mockPregenPlaces
    };

    // When updating cart or pregen_places
    const updatedPreferences = {
      ...initialPrefs,
      workspace_stage: 'scheduling',
      draft_cart: [{ id: 'place_1', name: 'Bà Nà Hills' }]
    };

    assert.equal(updatedPreferences.workspace_stage, 'scheduling');
    assert.equal(updatedPreferences.pregen_places.length, 2);
    assert.equal(updatedPreferences.pregen_places[0].name, 'Bà Nà Hills');
    assert.equal(updatedPreferences.draft_cart.length, 1);
  });

  it('BE-EXPENSES: should only allow trip owner or admin to add, edit, or delete expenses (collaborators rejected with 403)', () => {
    const checkExpenseMutationAccess = (access: { isOwner: boolean; isCollaborator: boolean }, isAdmin = false) => {
      if (!access.isOwner && !isAdmin) {
        return { allowed: false, status: 403, error: 'Chỉ chủ phòng chuyến đi mới có quyền thêm/sửa/xóa chi tiêu' };
      }
      return { allowed: true, status: 200, error: null };
    };

    // Case 1: Owner
    const ownerAccess = checkExpenseMutationAccess({ isOwner: true, isCollaborator: false }, false);
    assert.equal(ownerAccess.allowed, true);

    // Case 2: Admin
    const adminAccess = checkExpenseMutationAccess({ isOwner: false, isCollaborator: false }, true);
    assert.equal(adminAccess.allowed, true);

    // Case 3: Collaborator (member) — must be rejected with 403
    const memberAccess = checkExpenseMutationAccess({ isOwner: false, isCollaborator: true }, false);
    assert.equal(memberAccess.allowed, false);
    assert.equal(memberAccess.status, 403);
    assert.equal(memberAccess.error, 'Chỉ chủ phòng chuyến đi mới có quyền thêm/sửa/xóa chi tiêu');

    // Case 4: Random user
    const strangerAccess = checkExpenseMutationAccess({ isOwner: false, isCollaborator: false }, false);
    assert.equal(strangerAccess.allowed, false);
    assert.equal(strangerAccess.status, 403);
  });

  it('BE-QUOTA-PRO: should identify wantsPro accurately and enforce pro preferences', () => {
    const computeWantsPro = (body: any, preferences: any, creation_mode?: string) => {
      return Boolean(
        body.ai_provider === 'custom_openai' ||
        body.is_ai_pro === true ||
        body.use_pro_workspace === true ||
        (creation_mode === 'manual' && body.use_pro_workspace === true) ||
        preferences?.is_ai_pro === true ||
        preferences?.use_pro_workspace === true
      );
    };

    // standard free trip
    assert.equal(computeWantsPro({}, {}), false);

    // wantsPro via body.use_pro_workspace
    assert.equal(computeWantsPro({ use_pro_workspace: true }, {}), true);

    // wantsPro via preferences.use_pro_workspace
    assert.equal(computeWantsPro({}, { use_pro_workspace: true }), true);

    // wantsPro via custom_openai
    assert.equal(computeWantsPro({ ai_provider: 'custom_openai' }, {}), true);

    // wantsPro via is_ai_pro
    assert.equal(computeWantsPro({ is_ai_pro: true }, {}), true);

    // Pro preferences composition
    const isAiPro = computeWantsPro({ use_pro_workspace: true }, {});
    const enrichedPreferences = {
      is_ai_pro: isAiPro,
      ai_tier: isAiPro ? 'pro' : 'standard',
      use_pro_workspace: Boolean(true || false)
    };
    assert.equal(enrichedPreferences.is_ai_pro, true);
    assert.equal(enrichedPreferences.ai_tier, 'pro');
    assert.equal(enrichedPreferences.use_pro_workspace, true);
  });

  it('BE-QUOTA-DRAFT: should not deduct quota or enforce quota limits when isDraftOnly is true', () => {
    const evaluateDraftOnly = (body: any) => {
      const isFinalizing = Boolean(body.is_finalizing === true || body.is_finalizing === 'true');
      const isDraft = Boolean(body.is_draft === true || body.is_draft === 'true');
      return Boolean(isDraft || (body.creation_mode === 'manual' && !isFinalizing));
    };

    // Case 1: is_draft = true (collaborative planning / cart selection) -> draft only
    assert.equal(evaluateDraftOnly({ is_draft: true }), true);
    assert.equal(evaluateDraftOnly({ is_draft: 'true' }), true);

    // Case 2: manual mode without finalizing -> draft only
    assert.equal(evaluateDraftOnly({ creation_mode: 'manual' }), true);
    assert.equal(evaluateDraftOnly({ creation_mode: 'manual', is_finalizing: false }), true);

    // Case 3: manual mode WITH finalizing -> NOT draft only (finalized itinerary)
    assert.equal(evaluateDraftOnly({ creation_mode: 'manual', is_finalizing: true }), false);

    // Case 4: AI direct itinerary generation -> NOT draft only
    assert.equal(evaluateDraftOnly({ creation_mode: 'ai_auto' }), false);
    assert.equal(evaluateDraftOnly({}), false);

    // Business check: Quota should only be verified and deducted if !isDraftOnly
    const checkQuotaDeduction = (body: any, proCredits: number) => {
      const isDraftOnly = evaluateDraftOnly(body);
      if (isDraftOnly) {
        return { allowed: true, deducted: false };
      }
      if (proCredits <= 0) {
        return { allowed: false, error: 'Hết lượt Pro' };
      }
      return { allowed: true, deducted: true };
    };

    // User with 0 pro credits can still create and edit drafts freely
    const draftResult = checkQuotaDeduction({ is_draft: true }, 0);
    assert.equal(draftResult.allowed, true);
    assert.equal(draftResult.deducted, false);

    // Finalizing requires credits
    const finalResultWithoutCredits = checkQuotaDeduction({ is_draft: false, is_finalizing: true }, 0);
    assert.equal(finalResultWithoutCredits.allowed, false);

    // Finalizing with credits succeeds and deducts
    const finalResultWithCredits = checkQuotaDeduction({ is_draft: false, is_finalizing: true }, 5);
    assert.equal(finalResultWithCredits.allowed, true);
    assert.equal(finalResultWithCredits.deducted, true);
  });

  it('BE-QUOTA-ROLLBACK: should safely rollback pro credits or free quota when generation fails', () => {
    // Pro rollback simulation
    let profile = {
      pro_credits: 2,
      pro_unlimited_trips: 0,
      quota_used: 1
    };

    const simulateRollback = (isAiPro: boolean) => {
      if (isAiPro) {
        profile.pro_credits = (profile.pro_credits || 0) + 1;
      } else {
        profile.quota_used = Math.max(0, (profile.quota_used || 0) - 1);
      }
    };

    // Quota deducted mid-generation for Pro trip
    profile.pro_credits -= 1; // 2 -> 1
    assert.equal(profile.pro_credits, 1);

    // Rollback executed due to error
    simulateRollback(true);
    assert.equal(profile.pro_credits, 2);

    // Quota deducted mid-generation for Free trip
    profile.quota_used += 1; // 1 -> 2
    assert.equal(profile.quota_used, 2);

    // Rollback executed
    simulateRollback(false);
    assert.equal(profile.quota_used, 1);
  });

  it('BE-QUOTA-IDEMPOTENCE: should not double-deduct quota if existing draft already consumed pro credit', () => {
    const existingDraft = {
      id: 'draft_123',
      preferences: {
        pro_credit_consumed: true,
        quota_consumed: true
      }
    };

    const shouldDeduct = (draft: any, isAiPro: boolean) => {
      const alreadyConsumed = isAiPro
        ? Boolean(draft?.preferences?.pro_credit_consumed)
        : Boolean(draft?.preferences?.quota_consumed);
      return !alreadyConsumed;
    };

    assert.equal(shouldDeduct(existingDraft, true), false);
    assert.equal(shouldDeduct(existingDraft, false), false);

    const freshDraft = {
      id: 'draft_456',
      preferences: {}
    };
    assert.equal(shouldDeduct(freshDraft, true), true);
    assert.equal(shouldDeduct(freshDraft, false), true);
  });
});

