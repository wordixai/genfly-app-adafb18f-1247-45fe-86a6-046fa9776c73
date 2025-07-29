// Content script for TradeMe Analyzer
console.log('TradeMe Analyzer content script loaded');

// Add visual indicator that extension is active
if (window.location.hostname.includes('trademe.co.nz')) {
  addExtensionIndicator();
}

function addExtensionIndicator() {
  // Remove existing indicator if present
  const existing = document.getElementById('trademe-analyzer-indicator');
  if (existing) {
    existing.remove();
  }

  // Create a small indicator
  const indicator = document.createElement('div');
  indicator.id = 'trademe-analyzer-indicator';
  indicator.innerHTML = `
    <div style="
      position: fixed;
      top: 10px;
      right: 10px;
      background: linear-gradient(135deg, #2D5BFF 0%, #1E40AF 100%);
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 2px 8px rgba(45, 91, 255, 0.3);
      z-index: 10000;
      cursor: pointer;
      transition: all 0.2s;
    " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
      📊 TradeMe Analyzer Ready
    </div>
  `;
  
  document.body.appendChild(indicator);
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    if (indicator && indicator.parentNode) {
      indicator.style.opacity = '0';
      indicator.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.parentNode.removeChild(indicator);
        }
      }, 300);
    }
  }, 3000);
}

// Enhanced page analysis function
function analyzePageStructure() {
  const analysis = {
    pageUrl: window.location.href,
    pageTitle: document.title,
    pageType: detectPageType(),
    listingCount: 0,
    selectors: findActiveSelectors(),
    timestamp: new Date().toISOString()
  };

  console.log('TradeMe page analysis:', analysis);
  return analysis;
}

function detectPageType() {
  const url = window.location.href.toLowerCase();
  const title = document.title.toLowerCase();

  if (url.includes('/search') || title.includes('search')) {
    return 'search';
  } else if (url.includes('/browse') || title.includes('browse')) {
    return 'category';
  } else if (url.includes('/listing') || url.includes('/view/')) {
    return 'individual_listing';
  } else if (url.includes('/marketplace')) {
    return 'marketplace';
  }
  
  return 'unknown';
}

function findActiveSelectors() {
  const testSelectors = [
    '[data-testid="listing-card"]',
    '[data-testid="listing"]', 
    '.o-card',
    '.tm-card',
    '.listing-card',
    '.listing-item',
    '.tm-listing',
    '.search-result',
    'article[data-listing-id]',
    'article[id*="listing"]'
  ];

  const activeSelectors = [];
  
  testSelectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        activeSelectors.push({
          selector: selector,
          count: elements.length,
          sampleElement: elements[0].tagName + (elements[0].className ? '.' + elements[0].className.split(' ').slice(0, 3).join('.') : '')
        });
      }
    } catch (error) {
      console.warn(`Selector test failed for ${selector}:`, error);
    }
  });

  return activeSelectors;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.action === 'checkPage') {
    const analysis = analyzePageStructure();
    sendResponse({
      isTradeMe: window.location.hostname.includes('trademe.co.nz'),
      url: window.location.href,
      title: document.title,
      analysis: analysis
    });
  } else if (message.action === 'analyzeStructure') {
    const analysis = analyzePageStructure();
    sendResponse({ analysis });
  }
  
  return true;
});

// Auto-analyze page structure when content script loads
setTimeout(() => {
  if (window.location.hostname.includes('trademe.co.nz')) {
    analyzePageStructure();
  }
}, 1000);

// Helper functions for injected scripts
window.TradeMeAnalyzerUtils = {
  safeTextContent: (element) => element ? element.textContent?.trim() || '' : '',
  safeAttribute: (element, attribute) => element ? element.getAttribute(attribute) || '' : '',
  isVisible: (element) => element && element.offsetHeight > 0 && element.offsetWidth > 0,
  analyzePageStructure: analyzePageStructure
};

// Monitor for page changes (for SPA navigation)
let currentUrl = window.location.href;
setInterval(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    console.log('Page changed, re-analyzing...');
    setTimeout(analyzePageStructure, 1000);
  }
}, 1000);