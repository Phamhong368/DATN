import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../backend/.env')
});

const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
const referer = process.env.TEST_GOOGLE_REFERER || 'http://localhost:5173/';

if (!apiKey) {
  console.error('Missing GOOGLE_MAPS_API_KEY/VITE_GOOGLE_MAPS_API_KEY in env.');
  process.exit(1);
}

const checks = [
  {
    name: 'Maps JavaScript API',
    url: `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&v=weekly&callback=__testInit`,
    parse: async (response) => {
      const text = await response.text();
      if (response.ok && text.includes('__testInit')) {
        return { allowed: true, detail: 'Loader script returned successfully.' };
      }
      return { allowed: false, detail: text.slice(0, 300).replace(/\s+/g, ' ') };
    }
  },
  {
    name: 'Geocoding API',
    url: `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('1 Ben Thanh, Quan 1, TP.HCM')}&key=${apiKey}`,
    parse: async (response) => {
      const json = await response.json();
      return {
        allowed: json.status === 'OK',
        detail: json.error_message || json.status
      };
    }
  },
  {
    name: 'Directions API',
    url: `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent('TP.HCM')}&destination=${encodeURIComponent('Ha Noi')}&key=${apiKey}`,
    parse: async (response) => {
      const json = await response.json();
      return {
        allowed: json.status === 'OK',
        detail: json.error_message || json.status
      };
    }
  },
  {
    name: 'Distance Matrix API',
    url: `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent('TP.HCM')}&destinations=${encodeURIComponent('Ha Noi')}&key=${apiKey}`,
    parse: async (response) => {
      const json = await response.json();
      return {
        allowed: json.status === 'OK',
        detail: json.error_message || json.status
      };
    }
  },
  {
    name: 'Places API (Find Place)',
    url: `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent('Ben Thanh Market')}&inputtype=textquery&fields=name,geometry&key=${apiKey}`,
    parse: async (response) => {
      const json = await response.json();
      return {
        allowed: json.status === 'OK',
        detail: json.error_message || json.status
      };
    }
  }
];

for (const check of checks) {
  try {
    const response = await fetch(check.url, {
      headers: {
        Referer: referer
      }
    });
    const result = await check.parse(response);
    console.log(JSON.stringify({
      api: check.name,
      allowed: result.allowed,
      detail: result.detail
    }));
  } catch (error) {
    console.log(JSON.stringify({
      api: check.name,
      allowed: false,
      detail: error.message
    }));
  }
}
