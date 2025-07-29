class TradeMeAnalyzer {
  constructor() {
    this.analysisData = null;
    this.isAnalyzing = false;
    this.messageListener = null;
    this.init();
  }

  init() {
    this.bindEvents();
    this.checkTradeMe();
  }

  bindEvents() {
    document.getElementById('analyze-btn').addEventListener('click', () => this.analyzeData());
    document.getElementById('export-btn').addEventListener('click', () => this.exportToExcel());
    
    // Enable/disable export button when analysis data is available
    this.updateExportButton();
  }

  async checkTradeMe() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.url && tab.url.includes('trademe.co.nz')) {
        this.setStatus('active', 'On TradeMe - Ready to analyze');
        document.getElementById('analyze-btn').disabled = false;
      } else {
        this.setStatus('inactive', 'Navigate to TradeMe.co.nz first');
        document.getElementById('analyze-btn').disabled = true;
      }
    } catch (error) {
      console.error('Error checking TradeMe:', error);
      this.setStatus('inactive', 'Error checking page');
    }
  }

  setStatus(type, message) {
    const statusEl = document.getElementById('status');
    const statusText = statusEl.querySelector('.status-text');
    
    statusEl.className = `status-${type}`;
    statusText.textContent = message;
  }

  async analyzeData() {
    if (this.isAnalyzing) return;

    this.isAnalyzing = true;
    this.setStatus('analyzing', 'Analyzing TradeMe data...');
    
    const progressSection = document.getElementById('progress-section');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    progressSection.style.display = 'block';
    document.getElementById('analyze-btn').disabled = true;

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }

      if (!tab.url || !tab.url.includes('trademe.co.nz')) {
        throw new Error('Please navigate to TradeMe.co.nz first');
      }

      // Get user preferences
      const category = document.getElementById('category-select').value;
      const maxItems = parseInt(document.getElementById('max-items').value);

      console.log('Starting analysis with params:', { 
        categorySelect: category, 
        maxItems, 
        tabUrl: tab.url,
        tabId: tab.id 
      });

      // Clean up any existing message listener
      if (this.messageListener) {
        chrome.runtime.onMessage.removeListener(this.messageListener);
      }

      // Set up message listener
      this.messageListener = (message, sender, sendResponse) => {
        console.log('Popup received message:', message);
        
        try {
          if (message.action === 'progress') {
            progressFill.style.width = `${message.percentage}%`;
            progressText.textContent = message.message;
          } else if (message.action === 'complete') {
            this.analysisData = message.data;
            this.displayResults();
            this.cleanupAnalysis();
            chrome.runtime.onMessage.removeListener(this.messageListener);
            this.messageListener = null;
          } else if (message.action === 'error') {
            console.error('Analysis error from content script:', message.error, message.details);
            this.handleError(message.error, message.details);
            chrome.runtime.onMessage.removeListener(this.messageListener);
            this.messageListener = null;
          }
        } catch (handlerError) {
          console.error('Error in message handler:', handlerError);
        }
      };

      chrome.runtime.onMessage.addListener(this.messageListener);

      // Test if we can inject scripts
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            console.log('Test injection successful');
            return 'test-success';
          }
        });
      } catch (testError) {
        throw new Error(`Cannot inject scripts into this page: ${testError.message}. Make sure you're on a regular TradeMe page.`);
      }

      // Inject and execute the analyzer
      console.log('Injecting analyzer script...');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: this.injectAnalyzer,
        args: [category, maxItems]
      });

      console.log('Analyzer script injected successfully');

      // Set a timeout to catch hanging analysis
      setTimeout(() => {
        if (this.isAnalyzing) {
          this.handleError('Analysis timeout - please try again');
        }
      }, 30000); // 30 second timeout

    } catch (error) {
      console.error('Analysis setup error:', error);
      this.handleError(`Setup failed: ${error.message}`);
    }
  }

  // This function gets injected into the TradeMe page
  injectAnalyzer(category, maxItems) {
    // Wrap everything in a try-catch to handle any injection errors
    try {
      console.log('TradeMe analyzer injected with params:', { category, maxItems });
      
      const analyzer = {
        async analyze() {
          try {
            console.log('Starting TradeMe analysis...');
            
            // Verify we can send messages
            try {
              this.sendMessage({ 
                action: 'progress', 
                percentage: 5, 
                message: 'Initializing...' 
              });
            } catch (msgError) {
              console.error('Cannot send messages:', msgError);
              throw new Error('Extension communication failed');
            }

            // Wait for page to be ready
            await this.waitForContent();

            this.sendMessage({ 
              action: 'progress', 
              percentage: 15, 
              message: 'Page ready, scanning for items...' 
            });

            // Analyze page structure first
            const pageInfo = this.analyzePageStructure();
            console.log('Page analysis:', pageInfo);

            const items = await this.extractItems(category, maxItems);
            console.log('Extracted items:', items);
            
            if (items.length === 0) {
              throw new Error(`No items found on this page. Page type: ${pageInfo.pageType}. Try navigating to a TradeMe search results or category page.`);
            }
            
            this.sendMessage({ 
              action: 'progress', 
              percentage: 80, 
              message: `Processing ${items.length} items...` 
            });

            const analysisData = this.processItems(items);
            
            this.sendMessage({ 
              action: 'progress', 
              percentage: 100, 
              message: 'Analysis complete!' 
            });

            setTimeout(() => {
              this.sendMessage({ 
                action: 'complete', 
                data: analysisData 
              });
            }, 500);

          } catch (error) {
            console.error('Analysis error:', error);
            this.sendMessage({ 
              action: 'error', 
              error: error.message,
              details: {
                stack: error.stack,
                url: window.location.href,
                userAgent: navigator.userAgent
              }
            });
          }
        },

        sendMessage(message) {
          try {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
              chrome.runtime.sendMessage(message);
            } else {
              console.error('Chrome runtime not available');
              throw new Error('Extension context lost');
            }
          } catch (error) {
            console.error('Failed to send message:', error, message);
            throw error;
          }
        },

        async waitForContent() {
          let attempts = 0;
          const maxAttempts = 20;
          
          while (attempts < maxAttempts) {
            if (document.readyState === 'complete' && 
                document.body && 
                document.body.children.length > 0) {
              console.log('Page content ready');
              return;
            }
            
            console.log(`Waiting for content... attempt ${attempts + 1}`);
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
          }
          
          console.warn('Page content may not be fully loaded');
        },

        analyzePageStructure() {
          const info = {
            url: window.location.href,
            title: document.title,
            domain: window.location.hostname,
            pathname: window.location.pathname,
            bodyChildren: document.body ? document.body.children.length : 0,
            totalElements: document.querySelectorAll('*').length,
            hasTradeMe: window.location.href.includes('trademe.co.nz'),
            pageType: 'unknown'
          };

          // Detect page type
          const url = window.location.href.toLowerCase();
          const title = document.title.toLowerCase();

          if (url.includes('/search') || title.includes('search')) {
            info.pageType = 'search';
          } else if (url.includes('/browse') || title.includes('browse') || url.includes('/marketplace')) {
            info.pageType = 'category';
          } else if (url.includes('/listing') || url.includes('/view/')) {
            info.pageType = 'individual_listing';
          }

          return info;
        },

        async extractItems(category, maxItems) {
          const items = [];
          
          this.sendMessage({ 
            action: 'progress', 
            percentage: 25, 
            message: 'Searching for listings...' 
          });

          // Try different strategies to find listings
          const strategies = [
            () => this.findByTestId(),
            () => this.findByClass(),
            () => this.findByStructure(),
            () => this.findByContent()
          ];

          let listingElements = [];
          let usedStrategy = 'none';

          for (let i = 0; i < strategies.length; i++) {
            try {
              const strategyName = ['testid', 'class', 'structure', 'content'][i];
              console.log(`Trying strategy ${i + 1}: ${strategyName}`);
              
              const elements = strategies[i]();
              console.log(`Strategy ${strategyName} found ${elements.length} elements`);
              
              if (elements.length > 0) {
                listingElements = elements.slice(0, maxItems);
                usedStrategy = strategyName;
                console.log(`Using strategy: ${strategyName} with ${listingElements.length} elements`);
                break;
              }
            } catch (strategyError) {
              console.warn(`Strategy ${i + 1} failed:`, strategyError);
            }
          }

          if (listingElements.length === 0) {
            console.log('No elements found with any strategy. Page structure:');
            this.debugPageStructure();
            throw new Error('No listing elements found. This may not be a TradeMe results page.');
          }

          // Extract data from elements
          for (let i = 0; i < listingElements.length; i++) {
            const element = listingElements[i];
            
            if (i % 5 === 0) {
              this.sendMessage({ 
                action: 'progress', 
                percentage: 25 + ((i / listingElements.length) * 50), 
                message: `Processing item ${i + 1} of ${listingElements.length}...` 
              });
            }

            try {
              const item = this.extractItemData(element, i + 1);
              if (item && item.title && item.title.length > 3) {
                items.push(item);
              }
            } catch (extractError) {
              console.warn('Failed to extract item data:', extractError);
            }
          }

          console.log(`Extracted ${items.length} valid items using ${usedStrategy} strategy`);
          return items;
        },

        findByTestId() {
          const selectors = [
            '[data-testid="listing-card"]',
            '[data-testid="listing"]',
            '[data-testid*="listing"]',
            '[data-testid*="card"]'
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              return Array.from(elements);
            }
          }
          return [];
        },

        findByClass() {
          const selectors = [
            '.o-card',
            '.tm-card', 
            '.listing-card',
            '.listing-item',
            '.tm-listing',
            '.search-result',
            '.marketplace-listing'
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              return Array.from(elements);
            }
          }
          return [];
        },

        findByStructure() {
          const selectors = [
            'article[data-listing-id]',
            'article[id*="listing"]',
            'article',
            '.card',
            '.item',
            '[class*="listing"]',
            '[class*="item"]',
            '[class*="card"]'
          ];

          for (const selector of selectors) {
            const elements = Array.from(document.querySelectorAll(selector))
              .filter(el => this.isValidListing(el));
            
            if (elements.length > 0) {
              return elements.slice(0, 50);
            }
          }
          return [];
        },

        findByContent() {
          // Find elements that contain both price and title patterns
          const allElements = Array.from(document.querySelectorAll('*'))
            .filter(el => el.offsetHeight > 80 && el.offsetWidth > 150)
            .filter(el => {
              const text = el.textContent || '';
              const hasPrice = /\$[\d,]+|\bReserve\b|\bBuy Now\b/i.test(text);
              const hasLink = el.querySelector('a[href]');
              return hasPrice && hasLink;
            });

          return allElements.slice(0, 30);
        },

        isValidListing(element) {
          try {
            if (!element || element.offsetHeight < 50 || element.offsetWidth < 100) {
              return false;
            }
            
            const text = element.textContent || '';
            const hasPrice = /\$[\d,]+|\bReserve\b|\bBuy Now\b/i.test(text);
            const hasTitle = element.querySelector('a, h1, h2, h3, h4, h5, h6');
            
            return hasPrice && hasTitle && text.length > 20;
          } catch {
            return false;
          }
        },

        debugPageStructure() {
          console.log('=== PAGE STRUCTURE DEBUG ===');
          console.log('URL:', window.location.href);
          console.log('Title:', document.title);
          console.log('Body children:', document.body?.children.length || 0);
          
          // Log common selectors and their counts
          const commonSelectors = [
            'article', '.card', '.item', '[class*="listing"]', 
            '[data-testid*="listing"]', 'a[href*="listing"]'
          ];
          
          commonSelectors.forEach(selector => {
            try {
              const count = document.querySelectorAll(selector).length;
              console.log(`${selector}: ${count} elements`);
            } catch (e) {
              console.log(`${selector}: error`);
            }
          });
          
          // Log elements with price patterns
          const priceElements = Array.from(document.querySelectorAll('*'))
            .filter(el => /\$[\d,]+/.test(el.textContent || ''));
          console.log('Elements with prices:', priceElements.length);
        },

        extractItemData(element, index) {
          try {
            return {
              rank: index,
              title: this.extractTitle(element),
              price: this.extractPrice(element),
              priceText: this.extractPriceText(element),
              link: this.extractLink(element),
              image: this.extractImage(element),
              location: this.extractLocation(element),
              seller: this.extractSeller(element),
              type: this.extractType(element),
              extractedAt: new Date().toISOString(),
              elementInfo: {
                tagName: element.tagName,
                className: element.className,
                id: element.id || '',
                textLength: (element.textContent || '').length
              }
            };
          } catch (error) {
            console.warn('Error extracting item data:', error);
            return null;
          }
        },

        extractTitle(element) {
          const strategies = [
            // Links first
            () => {
              const link = element.querySelector('a[href*="listing"], a[href*="/"]');
              return link ? (link.textContent || link.title || '').trim() : '';
            },
            // Headers
            () => {
              const header = element.querySelector('h1, h2, h3, h4, h5, h6');
              return header ? header.textContent.trim() : '';
            },
            // Data attributes
            () => {
              const titleEl = element.querySelector('[data-testid*="title"], [data-testid*="name"]');
              return titleEl ? titleEl.textContent.trim() : '';
            },
            // Class names
            () => {
              const titleEl = element.querySelector('.title, .name, .heading, .listing-title');
              return titleEl ? titleEl.textContent.trim() : '';
            }
          ];

          for (const strategy of strategies) {
            try {
              const title = strategy();
              if (title && title.length > 3 && title.length < 200) {
                return title;
              }
            } catch (e) {
              continue;
            }
          }

          // Fallback: get the longest meaningful text
          const texts = Array.from(element.querySelectorAll('*'))
            .map(el => el.textContent?.trim())
            .filter(text => text && text.length > 5 && text.length < 150 && !text.includes('$'))
            .sort((a, b) => b.length - a.length);

          return texts[0] || 'Unknown Item';
        },

        extractPrice(element) {
          const text = element.textContent || '';
          const pricePatterns = [
            /\$\s?([\d,]+(?:\.\d{2})?)/g,
            /Reserve:\s?\$\s?([\d,]+(?:\.\d{2})?)/i,
            /Buy Now:\s?\$\s?([\d,]+(?:\.\d{2})?)/i
          ];

          for (const pattern of pricePatterns) {
            const matches = Array.from(text.matchAll(pattern));
            for (const match of matches) {
              const price = parseFloat(match[1].replace(/,/g, ''));
              if (price > 0 && price < 10000000) {
                return price;
              }
            }
          }
          return 0;
        },

        extractPriceText(element) {
          const text = element.textContent || '';
          const match = text.match(/\$[\d,]+(?:\.\d{2})?|Reserve|Buy Now|Auction/i);
          return match ? match[0] : '';
        },

        extractLink(element) {
          const link = element.querySelector('a[href]');
          if (link && link.href) {
            return link.href.startsWith('http') ? link.href : 
                   'https://www.trademe.co.nz' + link.getAttribute('href');
          }
          return '';
        },

        extractImage(element) {
          const img = element.querySelector('img');
          return img?.src || '';
        },

        extractLocation(element) {
          const text = element.textContent || '';
          const nzLocations = [
            'Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga',
            'Dunedin', 'Palmerston North', 'Rotorua', 'Nelson', 'New Plymouth'
          ];

          for (const location of nzLocations) {
            if (text.includes(location)) {
              return location;
            }
          }
          return '';
        },

        extractSeller(element) {
          const sellerEl = element.querySelector('[data-testid*="seller"], .seller, .member');
          return sellerEl ? sellerEl.textContent?.trim() || '' : '';
        },

        extractType(element) {
          const text = element.textContent?.toLowerCase() || '';
          if (text.includes('auction')) return 'Auction';
          if (text.includes('buy now')) return 'Buy Now';
          if (text.includes('reserve')) return 'Reserve';
          return 'Listing';
        },

        processItems(items) {
          const validItems = items.filter(item => 
            item && item.title && item.title !== 'Unknown Item'
          );
          
          // Sort by price (highest first), then by title
          validItems.sort((a, b) => {
            if (a.price && b.price) return b.price - a.price;
            if (a.price && !b.price) return -1;
            if (!a.price && b.price) return 1;
            return a.title.localeCompare(b.title);
          });
          
          const itemsWithPrices = validItems.filter(item => item.price > 0);
          const totalRevenue = itemsWithPrices.reduce((sum, item) => sum + item.price, 0);
          const avgPrice = itemsWithPrices.length > 0 ? totalRevenue / itemsWithPrices.length : 0;
          
          return {
            items: validItems,
            summary: {
              totalItems: validItems.length,
              itemsWithPrices: itemsWithPrices.length,
              totalRevenue,
              averagePrice: avgPrice,
              priceRanges: this.groupByPriceRanges(itemsWithPrices),
              typeDistribution: this.getTypeDistribution(validItems),
              topItems: validItems.slice(0, 10)
            }
          };
        },

        groupByPriceRanges(items) {
          const ranges = {
            'Under $50': 0,
            '$50 - $200': 0,
            '$200 - $500': 0,
            '$500 - $1,000': 0,
            'Over $1,000': 0
          };

          items.forEach(item => {
            if (item.price < 50) ranges['Under $50']++;
            else if (item.price < 200) ranges['$50 - $200']++;
            else if (item.price < 500) ranges['$200 - $500']++;
            else if (item.price < 1000) ranges['$500 - $1,000']++;
            else ranges['Over $1,000']++;
          });

          return ranges;
        },

        getTypeDistribution(items) {
          const types = {};
          items.forEach(item => {
            types[item.type] = (types[item.type] || 0) + 1;
          });
          return types;
        }
      };

      // Start analysis immediately
      analyzer.analyze().catch(error => {
        console.error('Analyzer execution error:', error);
        try {
          chrome.runtime.sendMessage({ 
            action: 'error', 
            error: `Analysis execution failed: ${error.message}`,
            details: { stack: error.stack }
          });
        } catch (msgError) {
          console.error('Could not send error message:', msgError);
        }
      });

    } catch (injectionError) {
      console.error('Injection error:', injectionError);
      
      try {
        chrome.runtime.sendMessage({ 
          action: 'error', 
          error: `Script injection failed: ${injectionError.message}`,
          details: { stack: injectionError.stack }
        });
      } catch (msgError) {
        console.error('Could not send injection error:', msgError);
      }
    }
  }

  displayResults() {
    const resultsSection = document.getElementById('results-section');
    const { summary } = this.analysisData;
    
    // Update stats
    document.getElementById('items-count').textContent = summary.totalItems;
    document.getElementById('total-revenue').textContent = `$${summary.totalRevenue.toLocaleString()}`;
    document.getElementById('avg-price').textContent = `$${summary.averagePrice.toFixed(2)}`;
    
    // Display top items
    const topItemsList = document.getElementById('top-items-list');
    topItemsList.innerHTML = '';
    
    summary.topItems.slice(0, 5).forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'top-item';
      
      const displayPrice = item.price > 0 ? `$${item.price.toLocaleString()}` : 
                          item.priceText || 'Price on inquiry';
      
      itemEl.innerHTML = `
        <div class="item-title" title="${item.title}">${item.title}</div>
        <div class="item-price">${displayPrice}</div>
      `;
      topItemsList.appendChild(itemEl);
    });
    
    resultsSection.style.display = 'block';
    this.updateExportButton();
  }

  updateExportButton() {
    const exportBtn = document.getElementById('export-btn');
    exportBtn.disabled = !this.analysisData;
  }

  cleanupAnalysis() {
    this.isAnalyzing = false;
    document.getElementById('progress-section').style.display = 'none';
    document.getElementById('analyze-btn').disabled = false;
    this.setStatus('active', 'Analysis complete - Ready for export');
  }

  handleError(error, details) {
    this.isAnalyzing = false;
    document.getElementById('progress-section').style.display = 'none';
    document.getElementById('analyze-btn').disabled = false;
    
    console.error('Analysis error details:', { error, details });
    
    // Provide helpful error messages
    let userMessage = error;
    
    if (error.includes('No listing elements found')) {
      userMessage = 'No items found on this page. Please navigate to a TradeMe search results or category page with listings.';
    } else if (error.includes('Cannot inject scripts')) {
      userMessage = 'Cannot access this page. Please navigate to a regular TradeMe page (not chrome:// or extension pages).';
    } else if (error.includes('Extension communication failed')) {
      userMessage = 'Extension communication error. Try refreshing the page and the extension.';
    } else if (error.includes('timeout')) {
      userMessage = 'Analysis timed out. The page may be loading slowly - please try again.';
    }
    
    this.setStatus('inactive', `Error: ${userMessage}`);
    
    // Show detailed error to user
    alert(`Analysis failed: ${userMessage}\n\nTip: Make sure you're on a TradeMe search results page with visible listings.`);
  }

  async exportToExcel() {
    if (!this.analysisData) return;

    try {
      const { items, summary } = this.analysisData;
      
      const excelData = this.prepareExcelData(items, summary);
      
      chrome.runtime.sendMessage({
        action: 'exportExcel',
        data: excelData
      }, (response) => {
        if (response && response.success) {
          console.log('Excel export initiated');
        } else {
          console.error('Export failed:', response ? response.error : 'No response');
          alert('Export failed. Please try again.');
        }
      });
      
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please try again.');
    }
  }

  prepareExcelData(items, summary) {
    return {
      summary: {
        totalItems: summary.totalItems,
        itemsWithPrices: summary.itemsWithPrices,
        totalRevenue: summary.totalRevenue,
        averagePrice: summary.averagePrice,
        generatedAt: new Date().toISOString()
      },
      items: items.map((item, index) => ({
        'Rank': index + 1,
        'Title': item.title,
        'Price ($)': item.price || 0,
        'Price Text': item.priceText || '',
        'Type': item.type,
        'Location': item.location || 'N/A',
        'Seller': item.seller || 'N/A',
        'URL': item.link || 'N/A',
        'Extracted At': item.extractedAt
      })),
      priceRanges: Object.entries(summary.priceRanges).map(([range, count]) => ({
        'Price Range': range,
        'Count': count,
        'Percentage': summary.itemsWithPrices > 0 ? (count / summary.itemsWithPrices * 100).toFixed(1) + '%' : '0%'
      })),
      typeDistribution: Object.entries(summary.typeDistribution).map(([type, count]) => ({
        'Listing Type': type,
        'Count': count,
        'Percentage': (count / summary.totalItems * 100).toFixed(1) + '%'
      }))
    };
  }
}

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', () => {
  new TradeMeAnalyzer();
});