class TradeMeAnalyzer {
  constructor() {
    this.analysisData = null;
    this.isAnalyzing = false;
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
      
      // Get user preferences
      const category = document.getElementById('category-select').value;
      const maxItems = parseInt(document.getElementById('max-items').value);

      console.log('Starting analysis with params:', { category, maxItems });

      // Set up message listener first
      const messageListener = (message, sender, sendResponse) => {
        console.log('Received message:', message);
        
        if (message.action === 'progress') {
          progressFill.style.width = `${message.percentage}%`;
          progressText.textContent = message.message;
        } else if (message.action === 'complete') {
          this.analysisData = message.data;
          this.displayResults();
          this.cleanupAnalysis();
          chrome.runtime.onMessage.removeListener(messageListener);
        } else if (message.action === 'error') {
          console.error('Analysis error from content script:', message.error);
          this.handleError(message.error);
          chrome.runtime.onMessage.removeListener(messageListener);
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);

      // Inject and execute the analyzer
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: this.injectAnalyzer,
        args: [category, maxItems]
      });

    } catch (error) {
      console.error('Analysis error:', error);
      this.handleError(`Failed to analyze: ${error.message}`);
    }
  }

  // This function gets injected into the TradeMe page
  injectAnalyzer(category, maxItems) {
    console.log('TradeMe analyzer injected with params:', { category, maxItems });
    
    const analyzer = {
      async analyze() {
        try {
          console.log('Starting TradeMe analysis...');
          
          // Send initial progress
          this.sendMessage({ 
            action: 'progress', 
            percentage: 10, 
            message: 'Scanning page structure...' 
          });

          // Wait a bit for the page to be ready
          await this.waitForContent();

          const items = await this.extractItems(category, maxItems);
          console.log('Extracted items:', items);
          
          if (items.length === 0) {
            throw new Error('No items found. Make sure you\'re on a TradeMe search results or category page.');
          }
          
          this.sendMessage({ 
            action: 'progress', 
            percentage: 80, 
            message: 'Processing item data...' 
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
            error: error.message 
          });
        }
      },

      sendMessage(message) {
        try {
          chrome.runtime.sendMessage(message);
        } catch (error) {
          console.error('Failed to send message:', error);
        }
      },

      async waitForContent() {
        // Wait for page content to load
        let attempts = 0;
        while (attempts < 10) {
          if (document.readyState === 'complete' && document.body) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
      },

      async extractItems(category, maxItems) {
        const items = [];
        
        this.sendMessage({ 
          action: 'progress', 
          percentage: 20, 
          message: 'Searching for items...' 
        });

        // Multiple selector strategies for TradeMe
        const selectorStrategies = [
          // Strategy 1: Modern TradeMe selectors
          () => document.querySelectorAll('[data-testid="listing-card"], [data-testid="listing"]'),
          
          // Strategy 2: Card-based selectors
          () => document.querySelectorAll('.o-card, .tm-card, .listing-card'),
          
          // Strategy 3: Listing item selectors
          () => document.querySelectorAll('.listing-item, .tm-listing, .search-result'),
          
          // Strategy 4: Article elements with listing data
          () => document.querySelectorAll('article[data-listing-id], article[id*="listing"]'),
          
          // Strategy 5: General card/item patterns
          () => document.querySelectorAll('[class*="listing"], [class*="item"], [class*="card"]').length > 0 ? 
               Array.from(document.querySelectorAll('[class*="listing"], [class*="item"], [class*="card"]'))
               .filter(el => this.looksLikeListing(el)) : [],
          
          // Strategy 6: Fallback - any element that looks like a listing
          () => Array.from(document.querySelectorAll('*'))
               .filter(el => this.looksLikeListing(el))
               .slice(0, 50)
        ];

        let listingElements = [];
        
        for (let i = 0; i < selectorStrategies.length; i++) {
          try {
            listingElements = Array.from(selectorStrategies[i]());
            console.log(`Strategy ${i + 1} found ${listingElements.length} elements`);
            
            if (listingElements.length > 0) {
              // Filter to ensure we have valid listings
              listingElements = listingElements.filter(el => this.isValidListing(el));
              if (listingElements.length > 0) {
                console.log(`Strategy ${i + 1} found ${listingElements.length} valid listings`);
                break;
              }
            }
          } catch (error) {
            console.warn(`Strategy ${i + 1} failed:`, error);
          }
        }

        console.log('Final listing elements found:', listingElements.length);

        if (listingElements.length === 0) {
          // Last resort: try to find any elements with price and title
          listingElements = this.findListingsByContent();
        }

        // Extract data from found elements
        for (let i = 0; i < Math.min(listingElements.length, maxItems); i++) {
          const element = listingElements[i];
          
          this.sendMessage({ 
            action: 'progress', 
            percentage: 20 + ((i / Math.min(listingElements.length, maxItems)) * 50), 
            message: `Extracting item ${i + 1} of ${Math.min(listingElements.length, maxItems)}...` 
          });

          const item = this.extractItemData(element, i + 1);
          if (item && item.title && (item.price > 0 || item.priceText)) {
            items.push(item);
            console.log('Extracted item:', item);
          }
        }

        return items;
      },

      looksLikeListing(element) {
        if (!element || element.offsetHeight < 50 || element.offsetWidth < 100) {
          return false;
        }
        
        const text = element.textContent || '';
        const hasPrice = /\$[\d,]+/.test(text) || text.includes('Reserve') || text.includes('Buy Now');
        const hasLinkOrTitle = element.querySelector('a[href*="listing"], a[href*="/"]') || 
                              element.querySelector('h1, h2, h3, h4, h5, h6');
        
        return hasPrice && hasLinkOrTitle;
      },

      isValidListing(element) {
        try {
          const text = element.textContent || '';
          const hasPrice = /\$[\d,]+/.test(text);
          const hasTitle = element.querySelector('a, h1, h2, h3, h4, h5, h6');
          const isVisible = element.offsetHeight > 0;
          
          return hasPrice && hasTitle && isVisible;
        } catch {
          return false;
        }
      },

      findListingsByContent() {
        const allElements = Array.from(document.querySelectorAll('*'));
        return allElements
          .filter(el => {
            if (el.offsetHeight < 80 || el.offsetWidth < 200) return false;
            
            const text = el.textContent || '';
            const hasPrice = /\$[\d,]+/.test(text);
            const hasTitle = el.querySelector('a[href], h1, h2, h3, h4, h5, h6');
            
            return hasPrice && hasTitle;
          })
          .slice(0, 50);
      },

      extractItemData(element, index) {
        try {
          const item = {
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
            element: element.tagName + (element.className ? '.' + element.className.split(' ').join('.') : '')
          };

          console.log('Extracted item data:', item);
          return item;
        } catch (error) {
          console.warn('Error extracting item data:', error);
          return null;
        }
      },

      extractTitle(element) {
        const titleSelectors = [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          '[data-testid*="title"]', '[data-testid*="name"]',
          '.listing-title', '.tm-listing-title', '.o-card__heading',
          'a[href*="listing"]', 'a[title]',
          '.title', '.name', '.heading'
        ];
        
        for (const selector of titleSelectors) {
          const titleEl = element.querySelector(selector);
          if (titleEl) {
            const title = (titleEl.textContent || titleEl.title || titleEl.alt || '').trim();
            if (title && title.length > 3 && title.length < 200) {
              return title;
            }
          }
        }

        // Fallback: look for longest meaningful text
        const textNodes = Array.from(element.querySelectorAll('*'))
          .map(el => el.textContent?.trim())
          .filter(text => text && text.length > 10 && text.length < 200 && !text.includes('$'))
          .sort((a, b) => b.length - a.length);

        return textNodes[0] || 'Unknown Item';
      },

      extractPrice(element) {
        const text = element.textContent || '';
        
        // Look for price patterns
        const pricePatterns = [
          /\$\s?([\d,]+(?:\.\d{2})?)/g,
          /Reserve:\s?\$\s?([\d,]+(?:\.\d{2})?)/g,
          /Buy Now:\s?\$\s?([\d,]+(?:\.\d{2})?)/g,
          /([\d,]+(?:\.\d{2})?)\s?dollars?/gi
        ];

        for (const pattern of pricePatterns) {
          const matches = Array.from(text.matchAll(pattern));
          for (const match of matches) {
            const price = parseFloat(match[1].replace(/,/g, ''));
            if (price > 0 && price < 1000000) { // Reasonable price range
              return price;
            }
          }
        }

        return 0;
      },

      extractPriceText(element) {
        const text = element.textContent || '';
        const priceMatch = text.match(/\$[\d,]+(?:\.\d{2})?|\$?[\d,]+\s?dollars?|Reserve|Buy Now|Auction/i);
        return priceMatch ? priceMatch[0] : '';
      },

      extractLink(element) {
        const link = element.querySelector('a[href*="listing"], a[href*="/"]');
        if (link) {
          const href = link.href;
          return href.startsWith('http') ? href : 'https://www.trademe.co.nz' + href;
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
          'Dunedin', 'Palmerston North', 'Rotorua', 'Nelson', 'New Plymouth',
          'Invercargill', 'Whangarei', 'Gisborne', 'Timaru', 'Hastings',
          'Napier', 'Blenheim', 'Masterton', 'Taupo'
        ];

        for (const location of nzLocations) {
          if (text.includes(location)) {
            return location;
          }
        }
        
        return '';
      },

      extractSeller(element) {
        const sellerSelectors = [
          '[data-testid*="seller"]', '.seller', '.member',
          '.tm-seller', '.listing-seller'
        ];
        
        for (const selector of sellerSelectors) {
          const sellerEl = element.querySelector(selector);
          if (sellerEl) {
            const seller = sellerEl.textContent?.trim();
            if (seller && seller.length > 0) {
              return seller;
            }
          }
        }
        return '';
      },

      extractType(element) {
        const text = element.textContent?.toLowerCase() || '';
        
        if (text.includes('auction')) return 'Auction';
        if (text.includes('buy now') || text.includes('buy it now')) return 'Buy Now';
        if (text.includes('reserve')) return 'Reserve';
        
        return 'Listing';
      },

      processItems(items) {
        console.log('Processing items:', items);
        
        const validItems = items.filter(item => 
          item.title && 
          item.title !== 'Unknown Item' && 
          (item.price > 0 || item.priceText)
        );
        
        console.log('Valid items:', validItems);
        
        // Sort by price (highest first), fallback to alphabetical for items without prices
        validItems.sort((a, b) => {
          if (a.price && b.price) return b.price - a.price;
          if (a.price && !b.price) return -1;
          if (!a.price && b.price) return 1;
          return a.title.localeCompare(b.title);
        });
        
        const itemsWithPrices = validItems.filter(item => item.price > 0);
        const totalRevenue = itemsWithPrices.reduce((sum, item) => sum + item.price, 0);
        const avgPrice = itemsWithPrices.length > 0 ? totalRevenue / itemsWithPrices.length : 0;
        
        // Group by price ranges
        const priceRanges = this.groupByPriceRanges(itemsWithPrices);
        
        // Get type distribution
        const typeDistribution = this.getTypeDistribution(validItems);
        
        const summary = {
          totalItems: validItems.length,
          itemsWithPrices: itemsWithPrices.length,
          totalRevenue,
          averagePrice: avgPrice,
          priceRanges,
          typeDistribution,
          topItems: validItems.slice(0, 10)
        };

        console.log('Analysis summary:', summary);
        
        return {
          items: validItems,
          summary
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

    // Start analysis
    analyzer.analyze();
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
      
      const displayPrice = item.price > 0 ? `$${item.price.toLocaleString()}` : item.priceText || 'Price on inquiry';
      
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

  handleError(error) {
    this.isAnalyzing = false;
    document.getElementById('progress-section').style.display = 'none';
    document.getElementById('analyze-btn').disabled = false;
    this.setStatus('inactive', `Error: ${error}`);
    console.error('Analysis error details:', error);
    
    // Show more helpful error message
    let userFriendlyMessage = error;
    if (error.includes('No items found')) {
      userFriendlyMessage = 'No items found. Please navigate to a TradeMe search results or category page and try again.';
    } else if (error.includes('Failed to analyze')) {
      userFriendlyMessage = 'Analysis failed. Please make sure you\'re on TradeMe.co.nz and try refreshing the page.';
    }
    
    alert(`Analysis failed: ${userFriendlyMessage}`);
  }

  async exportToExcel() {
    if (!this.analysisData) return;

    try {
      const { items, summary } = this.analysisData;
      
      // Prepare data for Excel
      const excelData = this.prepareExcelData(items, summary);
      
      // Send to background script for Excel generation
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
        'Extracted At': item.extractedAt,
        'Element Type': item.element || 'N/A'
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