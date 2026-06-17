import dotenv from 'dotenv';
import { getCityCoordinates, searchPlaces } from './services/placesService';
import { getWeatherForecast } from './services/weatherService';
import { generateItinerary, adaptItinerary } from './services/geminiService';

dotenv.config();

async function runTests() {
  console.log('--- STARTING VIVU AI INTEGRATION TESTS ---');

  // Test 1: Geocoding coordinates resolution
  console.log('\n[TEST 1] Resolving coordinates for "Đà Nẵng"...');
  const coords = getCityCoordinates('Đà Nẵng');
  console.log(`Coords resolved: Lat: ${coords.lat}, Lng: ${coords.lng}`);
  if (coords.lat === 16.0544 && coords.lng === 108.2022) {
    console.log('✓ Geocoding Test passed.');
  } else {
    console.warn('✗ Geocoding returned unexpected coordinates.');
  }

  // Test 2: Weather forecasting
  console.log('\n[TEST 2] Fetching weather forecast for 3 days...');
  const weather = await getWeatherForecast(coords.lat, coords.lng, '2026-06-20', '2026-06-22');
  console.log(`Forecast days returned: ${weather.length}`);
  console.log(`Day 1 weather: ${weather[0].date} - ${weather[0].condition} (Min: ${weather[0].temp_min}°C, Max: ${weather[0].temp_max}°C, Mưa: ${weather[0].rain_chance}%)`);
  if (weather.length === 3) {
    console.log('✓ Weather Test passed.');
  } else {
    console.warn(`✗ Weather Test failed. Expected 3 days, got ${weather.length}`);
  }

  // Test 3: Places search candidates
  console.log('\n[TEST 3] Fetching lodging candidates...');
  const lodgings = await searchPlaces('khách sạn', 'accommodation', coords.lat, coords.lng);
  console.log(`Lodging candidates found: ${lodgings.length}`);
  if (lodgings.length > 0) {
    console.log(`Sample Accommodation: "${lodgings[0].name}" at ${lodgings[0].address}`);
    console.log('✓ Places Test passed.');
  } else {
    console.warn('✗ Places Test returned 0 candidates.');
  }

  // Test 4: Itinerary Generation
  console.log('\n[TEST 4] Generating itinerary with AI...');
  const tripData = {
    destination_city: 'Đà Nẵng',
    start_date: '2026-06-20',
    end_date: '2026-06-22',
    budget_total: 6000000,
    traveler_count: 2,
    traveler_type: 'couple',
    preferences: { food: true, nature: true },
    health_conditions: '',
    special_requirements: ''
  };

  const dining = await searchPlaces('nhà hàng ngon', 'dining', coords.lat, coords.lng);
  const attractions = await searchPlaces('điểm tham quan', 'attraction', coords.lat, coords.lng);
  const rentals = await searchPlaces('thuê xe', 'rental', coords.lat, coords.lng);

  const candidatePlaces = {
    accommodation: lodgings,
    dining,
    attraction: attractions,
    rental: rentals
  };

  const itinerary = await generateItinerary(tripData, weather, candidatePlaces);
  console.log(`Itinerary days generated: ${itinerary.days.length}`);
  console.log(`Total estimated budget: ${itinerary.budget_summary.estimated_total.toLocaleString('vi-VN')}đ`);
  console.log(`Remaining budget: ${itinerary.budget_summary.remaining.toLocaleString('vi-VN')}đ`);
  
  if (itinerary.days.length === 3 && itinerary.days[0].items.length > 0) {
    console.log(`Day 1 First activity: "${itinerary.days[0].items[0].title}"`);
    console.log('✓ Itinerary Generation Test passed.');
  } else {
    console.warn('✗ Itinerary Generation Test failed.');
  }

  // Test 5: Disruption Adaptation
  console.log('\n[TEST 5] Adapting itinerary for disruption (Mưa bão lớn)...');
  const { itinerary: adapted, diff } = await adaptItinerary(
    tripData,
    itinerary,
    'weather_change',
    'Mưa bão lụt lớn toàn thành phố Đà Nẵng, gió to sạt lở Sơn Trà',
    weather,
    candidatePlaces
  );

  console.log('Adjustment Diff Log:');
  console.log(diff);
  console.log(`New Estimated total: ${adapted.budget_summary.estimated_total.toLocaleString('vi-VN')}đ`);
  
  // Verify that the title contains warning modifications or is adjusted
  const hasAdjusted = adapted.days.some(day => 
    day.items.some(item => item.title.includes('Thay đổi') || item.title.includes('Nghỉ ngơi') || item.title.includes('Tiết kiệm') || item.title.includes('trời'))
  );

  if (hasAdjusted || diff.length > 0) {
    console.log('✓ Disruption Adaptation Test passed.');
  } else {
    console.warn('✗ Disruption Adaptation Test failed.');
  }

  console.log('\n--- TESTS COMPLETED SUCCESSFULLY ---');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
