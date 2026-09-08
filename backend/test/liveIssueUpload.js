const http = require('http');
const fs = require('fs');
const path = require('path');

(async () => {
  const boundary = `----NodeBoundary${Date.now()}`;
  const imagePath = path.resolve(__dirname, 'fixtures/geotagged-pothole.jpg');
  const imageBuffer = fs.readFileSync(imagePath);
  const chunks = [];
  chunks.push(Buffer.from(`--${boundary}\r\n`));
  chunks.push(Buffer.from('Content-Disposition: form-data; name="image"; filename="geotagged-pothole.jpg"\r\n'));
  chunks.push(Buffer.from('Content-Type: image/jpeg\r\n\r\n'));
  chunks.push(imageBuffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const payload = Buffer.concat(chunks);
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhNmMyY2MyOGI2MDhhOGI3MTFjYmM5MSIsInJvbGUiOiJjaXRpemVuIiwiaWF0IjoxNzg1NDc0MjQyLCJleHAiOjE3ODYwNzkwNDJ9.t9pVp3wTWfKaWcDl_EG92PsVEtoaQ9bzSZ37U5snAcc';

  const req = http.request({
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/issues',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': payload.length,
      'Authorization': `Bearer ${token}`,
    },
  }, (res) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('STATUS', res.statusCode);
      console.log(data);
    });
  });

  req.on('error', (err) => {
    console.error(err);
    process.exit(1);
  });

  req.write(payload);
  req.end();
})();
