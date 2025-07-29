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

      // Inject content script and start analysis
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: this.injectAnalyzer,
        args: [category, maxItems]
      });

      // Listen for progress updates
      const progressListener = (message) => {
        if (message.action === 'progress') {
          progressFill.style.width = `${message.percentage}%`;
          progressText.textContent = message.message;
        } else if (message.action === 'complete') {
          this.analysisData = message.data;
          this.displayResults();
          this.cleanupAnalysis();
          chrome.runtime.onMessage.removeListener(progressListener);
        } else if (message.action === 'error') {
          this.handleError(message.error);
          chrome.runtime.onMessage.removeListener(progressListener);
        }
      };

      chrome.runtime.onMessage.addListener(progressListener);

    } catch (error) {
      console.error('Analysis error:', error);
      this.handleError('Failed to analyze TradeMe data');
    }
  }

  // This function gets injected into the TradeMe page
  injectAnalyzer(category, maxItems) {
    const analyzer = {
      async analyze() {
        try {
          console.log('Starting TradeMe analysis...');
          chrome.runtime.sendMessage({ 
            action: 'progress', 
            percentage: 10, 
            message: 'Scanning page structure...' 
          });

          const items = await this.extractItems(category, maxItems);
          
          chrome.runtime.sendMessage({ 
            action: 'progress', 
            percentage: 80, 
            message: 'Processing item data...' 
          });

          const analysisData = this.processItems(items);
          
          chrome.runtime.sendMessage({ 
            action: 'progress', 
            percentage: 100, 
            message: 'Analysis complete!' 
          });

          setTimeout(() => {
            chrome.runtime.sendMessage({ 
              action: 'complete', 
              data: analysisData 
            });
          }, 500);

        } catch (error) {
          console.error('Analysis error:', error);
          chrome.runtime.sendMessage({ 
            action: 'error', 
            error: error.message 
          });
        }
      },

      async extractItems(category, maxItems) {
        const items = [];
        let currentPage = 1;
        const itemsPerPage = 25; // TradeMe typically shows 25 items per page
        
        while (items.length < maxItems) {
          chrome.runtime.sendMessage({ 
            action: 'progress', 
            percentage: 20 + (items.length / maxItems) * 50, 
            message: `Extracting items... (${items.length}/${maxItems})` 
          });

          // Look for different selectors that TradeMe might use
          const selectors = [
            '.listing-item',
            '.tm-listing',
            '[data-testid="listing"]',
            '.supergrid-listing',
            '.o-card',
            'article[data-listing-id]'
          ];

          let listingElements = [];
          for (const selector of selectors) {
            listingElements = Array.from(document.querySelectorAll(selector));
            if (listingElements.length > 0) break;
          }

          if (listingElements.length === 0) {
            // Try to find any elements that look like listings
            listingElements = Array.from(document.querySelectorAll('*'))
              .filter(el => {
                const text = el.textContent || '';
                const hasPrice = text.includes('$') || text.includes('Buy Now') || text.includes('Reserve');
                const hasTitle = el.querySelector('h1, h2, h3, h4, a[href*="listing"]');
                return hasPrice && hasTitle && el.offsetHeight > 100;
              })
              .slice(0, 50);
          }

          for (const element of listingElements.slice(0, maxItems - items.length)) {
            const item = this.extractItemData(element);
            if (item && item.title && item.price) {
              items.push(item);
            }
          }

          // Break if we found some items or if we can't find pagination
          if (items.length > 0 || !this.hasNextPage()) break;
          
          // Try to go to next page
          if (items.length < maxItems && this.hasNextPage()) {
            await this.goToNextPage();
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page load
            currentPage++;
          } else {
            break;
          }
        }

        return items.slice(0, maxItems);
      },

      extractItemData(element) {
        try {
          // Extract title
          let title = '';
          const titleSelectors = [
            'h1', 'h2', 'h3', 'h4', 
            '.listing-title', '.tm-listing-title',
            'a[href*="listing"]', '[data-testid="listing-title"]',
            '.o-card__heading'
          ];
          
          for (const selector of titleSelectors) {
            const titleEl = element.querySelector(selector);
            if (titleEl) {
              title = titleEl.textContent?.trim() || titleEl.getAttribute('title') || '';
              if (title && title.length > 3) break;
            }
          }

          // Extract price
          let price = 0;
          const priceSelectors = [
            '.price', '.tm-price', '[data-testid="price"]',
            '.listing-price', '.o-card__price'
          ];

          for (const selector of priceSelectors) {
            const priceEl = element.querySelector(selector);
            if (priceEl) {
              const priceText = priceEl.textContent || '';
              const priceMatch = priceText.match(/\$?([\d,]+(?:\.\d{2})?)/);
              if (priceMatch) {
                price = parseFloat(priceMatch[1].replace(/,/g, ''));
                break;
              }
            }
          }

          // If no specific price selector found, look for any text with $ symbol
          if (price === 0) {
            const text = element.textContent || '';
            const priceMatch = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
            if (priceMatch) {
              price = parseFloat(priceMatch[1].replace(/,/g, ''));
            }
          }

          // Extract additional data
          const link = element.querySelector('a')?.href || '';
          const image = element.querySelector('img')?.src || '';
          const location = this.extractLocation(element);
          const seller = this.extractSeller(element);
          
          // Extract listing type
          const isAuction = element.textContent?.toLowerCase().includes('auction') || false;
          const isBuyNow = element.textContent?.toLowerCase().includes('buy now') || element.textContent?.toLowerCase().includes('buy it now') || false;

          return {
            title: title.substring(0, 100), // Limit title length
            price,
            link,
            image,
            location,
            seller,
            type: isAuction ? 'Auction' : isBuyNow ? 'Buy Now' : 'Listing',
            extractedAt: new Date().toISOString()
          };
        } catch (error) {
          console.warn('Error extracting item data:', error);
          return null;
        }
      },

      extractLocation(element) {
        const locationSelectors = [
          '.location', '.tm-location', '[data-testid="location"]',
          '.listing-location'
        ];
        
        for (const selector of locationSelectors) {
          const locationEl = element.querySelector(selector);
          if (locationEl) {
            return locationEl.textContent?.trim() || '';
          }
        }
        
        // Look for text patterns that might be locations
        const text = element.textContent || '';
        const locationMatch = text.match(/(Auckland|Wellington|Christchurch|Hamilton|Tauranga|Dunedin|Palmerston North|Nelson|Rotorua|New Plymouth)/i);
        return locationMatch ? locationMatch[1] : '';
      },

      extractSeller(element) {
        const sellerSelectors = [
          '.seller', '.tm-seller', '[data-testid="seller"]',
          '.listing-seller', '.member-name'
        ];
        
        for (const selector of sellerSelectors) {
          const sellerEl = element.querySelector(selector);
          if (sellerEl) {
            return sellerEl.textContent?.trim() || '';
          }
        }
        return '';
      },

      hasNextPage() {
        const nextSelectors = [
          'a[aria-label="Next"]',
          '.pagination-next',
          '.tm-pagination-next',
          'a:contains("Next")',
          '[data-testid="next-page"]'
        ];
        
        return nextSelectors.some(selector => {
          const element = document.querySelector(selector);
          return element && !element.disabled && !element.classList.contains('disabled');
        });
      },

      async goToNextPage() {
        const nextSelectors = [
          'a[aria-label="Next"]',
          '.pagination-next',
          '.tm-pagination-next',
          '[data-testid="next-page"]'
        ];
        
        for (const selector of nextSelectors) {
          const nextButton = document.querySelector(selector);
          if (nextButton && !nextButton.disabled) {
            nextButton.click();
            return;
          }
        }
      },

      processItems(items) {
        const validItems = items.filter(item => item.title && item.price > 0);
        
        // Sort by price (highest first)
        validItems.sort((a, b) => b.price - a.price);
        
        const totalRevenue = validItems.reduce((sum, item) => sum + item.price, 0);
        const avgPrice = validItems.length > 0 ? totalRevenue / validItems.length : 0;
        
        // Group by price ranges
        const priceRanges = this.groupByPriceRanges(validItems);
        
        // Get top categories/types
        const typeDistribution = this.getTypeDistribution(validItems);
        
        return {
          items: validItems,
          summary: {
            totalItems: validItems.length,
            totalRevenue,
            averagePrice: avgPrice,
            priceRanges,
            typeDistribution,
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
      itemEl.innerHTML = `
        <div class="item-title" title="${item.title}">${item.title}</div>
        <div class="item-price">$${item.price.toLocaleString()}</div>
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
    alert(`Analysis failed: ${error}`);
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
        if (response.success) {
          console.log('Excel export initiated');
        } else {
          console.error('Export failed:', response.error);
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
        totalRevenue: summary.totalRevenue,
        averagePrice: summary.averagePrice,
        generatedAt: new Date().toISOString()
      },
      items: items.map((item, index) => ({
        'Rank': index + 1,
        'Title': item.title,
        'Price ($)': item.price,
        'Type': item.type,
        'Location': item.location || 'N/A',
        'Seller': item.seller || 'N/A',
        'URL': item.link || 'N/A',
        'Extracted At': item.extractedAt
      })),
      priceRanges: Object.entries(summary.priceRanges).map(([range, count]) => ({
        'Price Range': range,
        'Count': count,
        'Percentage': (count / summary.totalItems * 100).toFixed(1) + '%'
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