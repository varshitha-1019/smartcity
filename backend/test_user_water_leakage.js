const fs = require('fs');
const path = require('path');

async function testPipeline() {
  console.log('Logging in as citizen...');
  const loginResp = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'citizen@smartcity.com', password: 'Citizen@123' }),
  });
  const loginData = await loginResp.json();
  const token = loginData.token;
  if (!token) {
    console.error('Login failed:', loginData);
    return;
  }
  console.log('Logged in successfully!');

  const userImgPath = path.join(__dirname, 'uploads', 'user_water_leakage_real.jpg');
  console.log('Image exists:', fs.existsSync(userImgPath));

  const imgBytes = fs.readFileSync(userImgPath);
  const fileBlob = new Blob([imgBytes], { type: 'image/jpeg' });

  // 1. Test /api/issues/predict-preview
  const formData1 = new FormData();
  formData1.append('image', fileBlob, 'user_water_leakage_real.jpg');

  const t0 = Date.now();
  const resp1 = await fetch('http://localhost:5000/api/issues/predict-preview', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData1,
  });
  const data1 = await resp1.json();
  console.log(`\n1. Predict Preview (${Date.now() - t0}ms):`, JSON.stringify(data1, null, 2));

  // 2. Test /api/issues/geocode/preview-image with fallback browser coordinates
  const formData2 = new FormData();
  formData2.append('image', fileBlob, 'user_water_leakage_real.jpg');
  formData2.append('latitude', '16.234434');
  formData2.append('longitude', '80.549665');

  const t1 = Date.now();
  const resp2 = await fetch('http://localhost:5000/api/issues/geocode/preview-image', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData2,
  });
  const data2 = await resp2.json();
  console.log(`\n2. Geocode Preview Image (${Date.now() - t1}ms):`, JSON.stringify(data2, null, 2));

  // 3. Test /api/issues/geocode/preview (reverse geocode coordinate endpoint)
  const t2 = Date.now();
  const resp3 = await fetch('http://localhost:5000/api/issues/geocode/preview?latitude=16.234434&longitude=80.549665', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data3 = await resp3.json();
  console.log(`\n3. Reverse Geocode Preview (${Date.now() - t2}ms):`, JSON.stringify(data3, null, 2));

  // 4. Test POST /api/issues (Submit Issue)
  const formData4 = new FormData();
  formData4.append('image', fileBlob, 'user_water_leakage_real.jpg');
  formData4.append('latitude', '16.234434');
  formData4.append('longitude', '80.549665');
  formData4.append('address', data2.address || data3.address || 'Gowdapalem, Chebrolu, Andhra Pradesh, India');
  formData4.append('priority', 'Medium');

  const t3 = Date.now();
  const resp4 = await fetch('http://localhost:5000/api/issues', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData4,
  });
  const data4 = await resp4.json();
  console.log(`\n4. Submit Issue (${Date.now() - t3}ms):`, JSON.stringify(data4, null, 2));
}

testPipeline().catch(console.error);
