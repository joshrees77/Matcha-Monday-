const CACHE_NAME = 'matcha-search-v2';
const MODEL_CACHE_NAME = 'matcha-models-v1';
const urlsToCache = [
  '/search/',
  '/search/index.html',
  '/search/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Helper function to check if URL is a Hugging Face model file
const isModelFile = (url) => {
  return url.includes('huggingface.co') || 
         url.includes('cdn.jsdelivr.net/npm/@huggingface/transformers') ||
         (url.includes('onnx') && (url.includes('.onnx') || url.includes('.json') || url.includes('.txt'))) ||
         url.includes('tokenizer.json') ||
         url.includes('config.json') ||
         url.includes('model.onnx') ||
         url.includes('tokenizer_config.json');
};

// Helper function to get cache name based on content type
const getCacheName = (url) => {
  return isModelFile(url) ? MODEL_CACHE_NAME : CACHE_NAME;
};

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME),
      caches.open(MODEL_CACHE_NAME)
    ]).then(([appCache, modelCache]) => {
      console.log('Opened caches');
      return appCache.addAll(urlsToCache);
    })
  );
});

// Fetch event - serve from cache, fallback to network with model-specific caching
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const cacheName = getCacheName(url);
  
  event.respondWith(
    caches.match(event.request, { cacheName })
      .then((response) => {
        // Cache hit - return response
        if (response) {
          console.log('Cache hit for:', url);
          return response;
        }

        console.log('Cache miss for:', url);
        return fetch(event.request).then(
          (response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache model files with longer expiration
            caches.open(cacheName)
              .then((cache) => {
                if (isModelFile(url)) {
                  console.log('Caching model file:', url);
                  // For model files, we want to cache them indefinitely
                  cache.put(event.request, responseToCache);
                } else {
                  cache.put(event.request, responseToCache);
                }
              });

            return response;
          }
        );
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Keep our current caches, but delete old versions
          if (cacheName !== CACHE_NAME && cacheName !== MODEL_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Message handler for cache management from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_CACHE_INFO') {
    getCacheInfo().then(info => {
      event.ports[0].postMessage({ type: 'CACHE_INFO', data: info });
    });
  } else if (event.data && event.data.type === 'CLEAR_MODEL_CACHE') {
    clearModelCache().then(() => {
      event.ports[0].postMessage({ type: 'MODEL_CACHE_CLEARED' });
    });
  } else if (event.data && event.data.type === 'CLEAR_ALL_CACHE') {
    clearAllCache().then(() => {
      event.ports[0].postMessage({ type: 'ALL_CACHE_CLEARED' });
    });
  }
});

// Helper function to get cache information
async function getCacheInfo() {
  const appCache = await caches.open(CACHE_NAME);
  const modelCache = await caches.open(MODEL_CACHE_NAME);
  
  const appKeys = await appCache.keys();
  const modelKeys = await modelCache.keys();
  
  // Calculate approximate sizes
  let appSize = 0;
  let modelSize = 0;
  
  for (const request of appKeys) {
    const response = await appCache.match(request);
    if (response) {
      const clone = response.clone();
      const buffer = await clone.arrayBuffer();
      appSize += buffer.byteLength;
    }
  }
  
  for (const request of modelKeys) {
    const response = await modelCache.match(request);
    if (response) {
      const clone = response.clone();
      const buffer = await clone.arrayBuffer();
      modelSize += buffer.byteLength;
    }
  }
  
  return {
    app: {
      count: appKeys.length,
      size: appSize
    },
    models: {
      count: modelKeys.length,
      size: modelSize,
      files: modelKeys.map(req => req.url)
    },
    total: {
      count: appKeys.length + modelKeys.length,
      size: appSize + modelSize
    }
  };
}

// Helper function to clear model cache
async function clearModelCache() {
  return caches.delete(MODEL_CACHE_NAME);
}

// Helper function to clear all caches
async function clearAllCache() {
  return Promise.all([
    caches.delete(CACHE_NAME),
    caches.delete(MODEL_CACHE_NAME)
  ]);
} 