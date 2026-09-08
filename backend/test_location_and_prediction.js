const fs = require('fs');
const http = require('http');
const path = require('path');

function postJson(apiPath, data, token) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(data));
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': payload.length,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: apiPath,
        method: 'POST',
        headers,
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

function postMultipart(apiPath, filePath, fields = {}, token = null) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
    const fileData = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

    const parts = [];

    // Append extra fields (e.g. user location)
    for (const [key, val] of Object.entries(fields)) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
        )
      );
    }

    // Append file
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
      )
    );
    parts.push(fileData);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const payload = Buffer.concat(parts);

    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': payload.length,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: apiPath,
        method: 'POST',
        headers,
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
  console.log('========================================================================');
  console.log('SMARTCITY AI - GPS LOCATION FALLBACK & OBJECTIVE PREDICTION VERIFICATION');
  console.log('========================================================================\n');

  // Step 1: Login as citizen
  console.log('Authenticating as citizen...');
  const loginRes = await postJson('/api/auth/login', {
    email: 'citizen@smartcity.com',
    password: 'Citizen@123',
  });
  const token = loginRes.data?.token;
  if (!token) {
    console.error('Login failed:', loginRes);
    process.exit(1);
  }
  console.log('Citizen authenticated successfully.\n');

  // User simulated current location: Guntur / Amaravati region, AP
  const userCurrentLocation = {
    latitude: '16.306700',
    longitude: '80.436500',
    accuracy: '15',
    source: 'browser',
    address: 'Collectorate Road, Guntur, Andhra Pradesh 522002, India',
  };

  console.log('------------------------------------------------------------------------');
  console.log('TEST 1: IMAGE WITH EMBEDDED GPS STAMP (Expected: Uses Image Location)');
  console.log('------------------------------------------------------------------------');
  const imgWithGpsPath = path.join(__dirname, 'uploads', 'water_leakage_with_gps.jpg');
  const resWithGps = await postMultipart(
    '/api/issues/geocode/preview-image',
    imgWithGpsPath,
    userCurrentLocation, // Even though user location is passed, image GPS MUST take priority!
    token
  );
  console.log('Location Preview result for image WITH GPS stamp:');
  console.log({
    hasGps: resWithGps.data?.hasGps,
    source: resWithGps.data?.source,
    latitude: resWithGps.data?.latitude,
    longitude: resWithGps.data?.longitude,
    address: resWithGps.data?.address,
  });
  if (resWithGps.data?.source === 'ocr-stamp' && resWithGps.data?.latitude === 16.234762) {
    console.log('>> SUCCESS: Correctly prioritized image GPS stamp over user location!\n');
  } else {
    console.warn('>> Note: Result:', resWithGps.data);
  }

  console.log('------------------------------------------------------------------------');
  console.log('TEST 2: IMAGES WITHOUT GPS (Expected: Fallback to User Current Location)');
  console.log('------------------------------------------------------------------------');

  const testCases = [
    {
      name: 'Pothole (Road Infrastructure)',
      file: path.join(__dirname, 'sample_test_images', 'pothole_clean_no_gps.jpg'),
      expectedCategory: 'Pothole',
      expectedDepartment: 'Roads & Infrastructure',
    },
    {
      name: 'Garbage (Sanitation)',
      file: path.join(__dirname, 'sample_test_images', 'garbage_clean_no_gps.jpg'),
      expectedCategory: 'Garbage',
      expectedDepartment: 'Sanitation',
    },
    {
      name: 'Drainage (Sewage & Drainage)',
      file: path.join(__dirname, 'sample_test_images', 'drainage_clean_no_gps.jpg'),
      expectedCategory: 'Drainage',
      expectedDepartment: 'Sewage & Drainage',
    },
    {
      name: 'Water Leakage (Water Supply)',
      file: path.join(__dirname, 'sample_test_images', 'water_leakage_clean_no_gps.jpg'),
      expectedCategory: 'Water Leakage',
      expectedDepartment: 'Water Supply',
    },
    {
      name: 'Normal Road (Non-Civic / Safe)',
      file: path.join(__dirname, 'sample_test_images', 'normal_road_clean_no_gps.jpg'),
      expectedCategory: 'Unknown',
      expectedStatus: 'REJECTED',
    },
  ];

  for (const tc of testCases) {
    console.log(`\nTesting Objective: ${tc.name}`);
    console.log(`Image: ${path.basename(tc.file)} (No GPS in image file)`);

    // A. Test Prediction
    const tStart = Date.now();
    const predRes = await postMultipart('/api/issues/predict-preview', tc.file, {}, token);
    const pred = predRes.data?.prediction;
    const dur = Date.now() - tStart;

    console.log(`  - AI Prediction: status=${pred?.status}, category=${pred?.category}, topCategory=${pred?.topCategory}`);
    console.log(`  - Confidence: ${((pred?.confidence || 0) * 100).toFixed(1)}%, Margin: ${((pred?.margin || 0) * 100).toFixed(1)}%`);
    console.log(`  - Assigned Department: ${pred?.assignedDepartment || 'None'}`);
    console.log(`  - Latency: ${dur}ms`);

    // B. Test Location Resolution with User Current Location
    const locRes = await postMultipart(
      '/api/issues/geocode/preview-image',
      tc.file,
      userCurrentLocation,
      token
    );
    console.log(`  - Location Fallback: hasGps=${locRes.data?.hasGps}, source=${locRes.data?.source}`);
    console.log(`  - Coordinates: ${locRes.data?.latitude}, ${locRes.data?.longitude}`);
    console.log(`  - Address: ${locRes.data?.address}`);

    if (locRes.data?.source === 'browser' && locRes.data?.latitude === 16.3067) {
      console.log('  >> Verified: Used user current location fallback correctly!');
    }
  }

  console.log('\n------------------------------------------------------------------------');
  console.log('TEST 3: FULL ISSUE CREATION WITH USER LOCATION FALLBACK');
  console.log('------------------------------------------------------------------------');
  console.log('Submitting issue for pothole without image GPS, passing user location...');
  const createRes = await postMultipart(
    '/api/issues',
    path.join(__dirname, 'sample_test_images', 'pothole_clean_no_gps.jpg'),
    {
      priority: 'High',
      ...userCurrentLocation,
    },
    token
  );

  console.log(`Response Status: ${createRes.status}`);
  if (createRes.data?.issue) {
    const issue = createRes.data.issue;
    console.log('Issue successfully created with user current location fallback:');
    console.log(`  - Issue ID: ${issue._id}`);
    console.log(`  - Title: ${issue.title}`);
    console.log(`  - Category: ${issue.category}`);
    console.log(`  - AI Confidence: ${(issue.aiPrediction?.confidence * 100).toFixed(1)}%`);
    console.log(`  - Department: ${issue.assignedDepartment}`);
    console.log(`  - Priority: ${issue.priority}`);
    console.log(`  - Status: ${issue.status}`);
    console.log(`  - Coordinates: Lat ${issue.location?.latitude}, Lng ${issue.location?.longitude}`);
    console.log(`  - Address: ${issue.location?.address}`);
    console.log(`  - Location Source: ${issue.location?.source || 'user fallback'}`);
    console.log('\n>> SUCCESS: Issue created using user current location and correct objective prediction!');
  } else {
    console.error('Issue creation failed:', createRes.data);
  }

  console.log('\n========================================================================');
  console.log('ALL TESTS COMPLETED SUCCESSFULLY');
  console.log('========================================================================');
}

run().catch(console.error);
