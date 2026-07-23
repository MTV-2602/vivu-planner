const axios = require('axios');
const API_BASE_URL = 'https://vivu-planner.onrender.com/api';

async function runTest() {
  console.log('Testing credentials login...');
  try {
    const res = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'vinhvip4508@gmail.com',
      password: 'helloem'
    });
    console.log('SUCCESS:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.log('FAILED:');
    if (err.response) {
      console.log('Status:', err.response.status);
      console.log('Data:', err.response.data);
    } else {
      console.log('Error:', err.message);
    }
  }
}
runTest();
