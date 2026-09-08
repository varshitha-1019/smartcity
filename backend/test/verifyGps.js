const { extractGpsMetadata } = require('../services/gpsService');
const path = require('path');

(async () => {
  const file = path.resolve(__dirname, 'fixtures/geotagged-pothole.jpg');
  const result = await extractGpsMetadata(file);
  console.log(JSON.stringify(result));
})();
