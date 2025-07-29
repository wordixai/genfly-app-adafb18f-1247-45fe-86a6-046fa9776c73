// Content script for TradeMe Analyzer
console.log('TradeMe Analyzer content script loaded');

// Add visual indicator that extension is active
if (window.location.hostname.includes('trademe.co.nz')) {
  addExtensionIndicator();
}

function addExtensionIndicator() {
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
      📊 TradeMe Analyzer Active
    </div>
  `;
  
  document.body.appendChild(indicator);
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    indicator.style.opacity = '0';
    indicator.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 300);
  }, 3000);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkPage') {
    sendResponse({
      isTradeMe: window.location.hostname.includes('trademe.co.nz'),
      url: window.location.href,
      title: document.title
    });
  }
  
  return true;
});

// Helper function to safely get text content
function safeTextContent(element) {
  return element ? element.textContent?.trim() || '' : '';
}

// Helper function to safely get attribute
function safeAttribute(element, attribute) {
  return element ? element.getAttribute(attribute) || '' : '';
}

// Export utility functions for injected scripts
window.TradeMeAnalyzerUtils = {
  safeTextContent,
  safeAttribute
};