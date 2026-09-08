const fs = require('fs');
const http = require('http');
const path = require('path');

function postJson(apiPath, data) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(data));
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function postFile(apiPath, filePath, mimeType, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
    const fileData = fs.readFileSync(filePath);
    const filename = path.basename(filePath);

    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const payload = Buffer.concat([header, fileData, footer]);

    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: apiPath,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('Logging in as citizen...');
  const loginRes = await postJson('/api/auth/login', {
    email: 'citizen@smartcity.com',
    password: 'Citizen@123',
  });

  const token = loginRes.data?.token;
  if (!token) {
    console.error('Login failed:', loginRes);
    return;
  }
  console.log('Logged in successfully! Token received.');

  console.log('\n======================================================');
  console.log('1. TEST USER POTHOLE IMAGE PREDICTION');
  console.log('======================================================');
  const t0 = Date.now();
  const r1 = await postFile('/api/issues/predict-preview', path.join(__dirname, 'uploads', 'user_pothole_crop.jpg'), 'image/jpeg', token);
  console.log(`Pothole Preview response time: ${Date.now() - t0}ms`);
  console.log(JSON.stringify(r1, null, 2));

  console.log('\n======================================================');
  console.log('2. TEST USER SECOND IMAGE GPS LOCATION & ADDRESS');
  console.log('======================================================');
  const t1 = Date.now();
  const r2 = await postFile('/api/issues/geocode/preview-image', path.join(__dirname, 'uploads', '1788723527714-851427913.png'), 'image/png', token);
  console.log(`GPS preview-image response time: ${Date.now() - t1}ms`);
  console.log(JSON.stringify(r2, null, 2));

  console.log('\n======================================================');
  console.log('3. TEST WATER LEAKAGE PREDICTION & GPS LOCATION');
  console.log('======================================================');
  const t2 = Date.now();
  const r3 = await postFile('/api/issues/predict-preview', path.join(__dirname, 'uploads', 'water_leakage_with_gps.jpg'), 'image/jpeg', token);
  console.log(`Water Leakage Preview response time: ${Date.now() - t2}ms`);
  console.log(JSON.stringify(r3, null, 2));

  const t3 = Date.now();
  const r4 = await postFile('/api/issues/geocode/preview-image', path.join(__dirname, 'uploads', 'water_leakage_with_gps.jpg'), 'image/jpeg', token);
  console.log(`Water Leakage GPS response time: ${Date.now() - t3}ms`);
  console.log(JSON.stringify(r4, null, 2));
}

run().catch(console.error);
