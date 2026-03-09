// server.js - Express API Server for NC Connect

const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Import resources
const { ALL_NC_CITIES, MASTER_RESOURCES, createDefaultResourcesForCity } = require('./resources');

// Helper functions
function fuzzyMatch(input, options) {
  const lower = input.toLowerCase().trim();
  if (options.includes(lower)) return lower;
  let bestMatch = null;
  let bestScore = 0;
  options.forEach(option => {
    const score = levenshteinSimilarity(lower, option);
    if (score > bestScore && score > 0.65) {
      bestScore = score;
      bestMatch = option;
    }
  });
  return bestMatch;
}

function levenshteinSimilarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function parseUserMessage(text) {
  const lower = text.toLowerCase();
  let category;

  if (/\b(food|foods|eat|hungry|groceries|pantry|food bank|meal|comida|hambre|despensa|thức ăn|đói|食物|吃|طعام|جوع|खाना|ఆహారం)\b/i.test(lower)) {
    category = "food";
  } 
  else if (/\b(housing|house|home|apartment|rent|shelter|homeless|eviction|vivienda|casa|alquiler|nhà|thuê|房屋|住房|السكن|إسكان|आवास|గృహం)\b/i.test(lower)) {
    category = "housing";
  } 
  else if (/\b(job|jobs|employment|work|career|hiring|trabajo|empleo|việc|công việc|工作|就业|وظيفة|عمل|नौकरी|ఉద్యోగం)\b/i.test(lower)) {
    category = "jobs";
  } 
  else if (/\b(health|healthcare|medical|doctor|hospital|clinic|therapy|mental|salud|médico|hospital|sức khỏe|bác sĩ|bệnh viện|y tế|健康|医疗|医生|الصحة|طبي|स्वास्थ्य|ఆరోగ్యం)\b/i.test(lower)) {
    category = "health";
  } 
  else if (/\b(legal|lawyer|attorney|law|court|legal aid|abogado|legal|luật sư|pháp lý|tòa án|法律|律师|法院|القانون|محامي|कानूनी|చట్టపరమైనది)\b/i.test(lower)) {
    category = "legal";
  }

  let city;
  for (const c of ALL_NC_CITIES) {
    if (lower.includes(c)) {
      city = c;
      break;
    }
  }

  if (!city) {
    for (const word of lower.split(/\s+/)) {
      const match = fuzzyMatch(word, ALL_NC_CITIES);
      if (match) {
        city = match;
        break;
      }
    }
  }

  // Check for follow-up questions
  const isHoursQuestion = /when|hours|open|time|horario|mở cửa|小时|ساعات|समय|సమయం/.test(lower);
  const isLocationQuestion = /where|address|location|direction|dirección|địa chỉ|地址|عنوان|पता|చిరునామా/.test(lower);
  const isPhoneQuestion = /phone|call|number|teléfono|điện thoại|电话|رقم|फोन|ఫోన్/.test(lower);
  const isEligibilityQuestion = /eligibility|requirements|need|qualification|requisitos|yêu cầu|资格|الأهلية|योग्यता|అర్హత/.test(lower);

  return { category, city, isHoursQuestion, isLocationQuestion, isPhoneQuestion, isEligibilityQuestion };
}

// API Routes

// GET - Get available cities
app.get('/api/cities', (req, res) => {
  res.json({ cities: ALL_NC_CITIES });
});

// POST - Search for resources
app.post('/api/search', (req, res) => {
  const { query, language = 'en' } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const parsed = parseUserMessage(query);

  if (!parsed.category || !parsed.city) {
    return res.status(400).json({ 
      error: 'Please specify what you need (food, housing, jobs, health, legal) and a city' 
    });
  }

  // Search resources
  let matches = MASTER_RESOURCES.filter(
    r => r.category === parsed.category && r.city.toLowerCase() === parsed.city.toLowerCase()
  );

  // If no matches, create default resources
  if (matches.length === 0) {
    const defaultResource = createDefaultResourcesForCity(parsed.city, parsed.category);
    matches = [defaultResource];
  }

  res.json({
    success: true,
    category: parsed.category,
    city: parsed.city.charAt(0).toUpperCase() + parsed.city.slice(1),
    resourceCount: matches.length,
    resources: matches,
    followUp: {
      isHoursQuestion: parsed.isHoursQuestion,
      isLocationQuestion: parsed.isLocationQuestion,
      isPhoneQuestion: parsed.isPhoneQuestion,
      isEligibilityQuestion: parsed.isEligibilityQuestion
    }
  });
});

// GET - Get resources by city and category
app.get('/api/resources/:city/:category', (req, res) => {
  const { city, category } = req.params;

  let matches = MASTER_RESOURCES.filter(
    r => r.category === category && r.city.toLowerCase() === city.toLowerCase()
  );

  if (matches.length === 0) {
    const defaultResource = createDefaultResourcesForCity(city, category);
    matches = [defaultResource];
  }

  res.json({
    success: true,
    city: city.charAt(0).toUpperCase() + city.slice(1),
    category,
    resourceCount: matches.length,
    resources: matches
  });
});

// GET - Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'NC Connect API is running!', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`NC Connect API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Get cities: http://localhost:${PORT}/api/cities`);
});
