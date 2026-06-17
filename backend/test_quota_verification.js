const axios = require('axios');
const API_BASE_URL = 'https://vivu-planner.onrender.com/api';

async function runTest() {
  const suffix = Math.floor(Math.random() * 100000);
  const email = `quota_test_v3_${suffix}@gmail.com`;
  const password = 'password123';

  try {
    console.log(`1. Registering new test user: ${email}...`);
    const signupRes = await axios.post(`${API_BASE_URL}/auth/signup`, {
      email,
      password,
      fullName: 'Vivu Quota Test v3'
    });
    console.log('Signup success:', signupRes.data.success);

    console.log('2. Logging in...');
    const loginRes = await axios.post(`${API_BASE_URL}/auth/login`, { email, password });
    const token = loginRes.data.session.access_token;
    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

    console.log('3. Checking initial quota status...');
    let statusRes = await axios.get(`${API_BASE_URL}/payment/status`, authHeaders);
    console.log('Initial Quota:', {
      tripsQuota: statusRes.data.tripsQuota,
      tripsUsed: statusRes.data.tripsUsed,
      remainingTrips: statusRes.data.remainingTrips
    });

    console.log('4. Creating a trip (takes 10-15s due to AI generation)...');
    const startVal = Date.now();
    const createRes = await axios.post(`${API_BASE_URL}/trips`, {
      title: 'Chuyen di Vung Tau',
      destination_city: 'Vung Tau',
      start_date: '2026-08-10',
      end_date: '2026-08-12',
      budget_total: 3000000,
      traveler_count: 1,
      traveler_type: 'solo',
      preferences: { food: true, nature: true }
    }, authHeaders);
    const tripId = createRes.data.id;
    console.log(`Trip created successfully! ID: ${tripId}. Time taken: ${(Date.now() - startVal)/1000}s`);

    console.log('5. Checking quota status after trip creation...');
    statusRes = await axios.get(`${API_BASE_URL}/payment/status`, authHeaders);
    console.log('After Creation Quota:', {
      tripsQuota: statusRes.data.tripsQuota,
      tripsUsed: statusRes.data.tripsUsed,
      remainingTrips: statusRes.data.remainingTrips
    });

    console.log(`6. Deleting the created trip (ID: ${tripId})...`);
    const deleteRes = await axios.delete(`${API_BASE_URL}/trips/${tripId}`, authHeaders);
    console.log('Delete response:', deleteRes.data);

    console.log('7. Checking quota status after deletion...');
    statusRes = await axios.get(`${API_BASE_URL}/payment/status`, authHeaders);
    const finalQuota = {
      tripsQuota: statusRes.data.tripsQuota,
      tripsUsed: statusRes.data.tripsUsed,
      remainingTrips: statusRes.data.remainingTrips
    };
    console.log('After Deletion Quota:', finalQuota);
  } catch (error) {
    if (error.response) {
      console.log('Error Response:', error.response.status, error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
}

runTest();
