const axios = require('axios');
axios.get('https://vivu-planner.onrender.com/api/dev/check-keys', { timeout: 15000 })
  .then(res => console.log('Response:', JSON.stringify(res.data, null, 2)))
  .catch(err => {
    if (err.response) {
      console.log('Error Response Status:', err.response.status);
      console.log('Error Response Data:', err.response.data);
    } else {
      console.log('Error:', err.message);
    }
  });
