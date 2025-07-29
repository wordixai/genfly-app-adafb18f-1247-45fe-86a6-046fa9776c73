// Background script for TradeMe Analyzer Extension
console.log('TradeMe Analyzer background script loaded');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  if (message.action === 'exportExcel') {
    handleExcelExport(message.data)
      .then(() => {
        console.log('Export successful');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Excel export error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open for async response
  }
  
  // Handle progress and other messages
  if (message.action === 'progress' || message.action === 'complete' || message.action === 'error') {
    // Forward these to popup if needed
    chrome.runtime.sendMessage(message).catch(() => {
      // Ignore errors if popup is not open
    });
  }
});

async function handleExcelExport(data) {
  try {
    console.log('Starting Excel export with data:', data);
    
    // Validate data
    if (!data || !data.items) {
      throw new Error('Invalid data provided for export');
    }
    
    // Create CSV content (more compatible than actual Excel format)
    const csvContent = generateCSV(data);
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `trademe-analysis-${timestamp}.csv`;
    
    // Download file
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });
    
    console.log('Excel export completed successfully');
    
    // Clean up the blob URL
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
  } catch (error) {
    console.error('Export error details:', error);
    throw error;
  }
}

function generateCSV(data) {
  const { summary, items, priceRanges, typeDistribution } = data;
  
  let csvContent = '';
  
  // Add BOM for proper UTF-8 encoding in Excel
  csvContent = '\uFEFF';
  
  // Add summary section
  csvContent += '=== TRADEME SALES ANALYSIS SUMMARY ===\n';
  csvContent += `Generated At,${new Date(summary.generatedAt).toLocaleString()}\n`;
  csvContent += `Total Items Found,${summary.totalItems}\n`;
  csvContent += `Items with Prices,${summary.itemsWithPrices || 0}\n`;
  csvContent += `Total Revenue,$${(summary.totalRevenue || 0).toLocaleString()}\n`;
  csvContent += `Average Price,$${(summary.averagePrice || 0).toFixed(2)}\n\n`;
  
  // Add items data
  csvContent += '=== ITEMS DETAILS ===\n';
  if (items && items.length > 0) {
    // Header row
    const headers = Object.keys(items[0]);
    csvContent += headers.map(escapeCSV).join(',') + '\n';
    
    // Data rows
    items.forEach(item => {
      const row = headers.map(header => {
        let value = item[header];
        if (typeof value === 'number') {
          return value;
        }
        return escapeCSV(value || '');
      });
      csvContent += row.join(',') + '\n';
    });
  } else {
    csvContent += 'No items data available\n';
  }
  csvContent += '\n';
  
  // Add price ranges
  csvContent += '=== PRICE DISTRIBUTION ===\n';
  csvContent += 'Price Range,Count,Percentage\n';
  if (priceRanges && priceRanges.length > 0) {
    priceRanges.forEach(range => {
      csvContent += `${escapeCSV(range['Price Range'])},${range.Count},${escapeCSV(range.Percentage)}\n`;
    });
  } else {
    csvContent += 'No price distribution data available\n';
  }
  csvContent += '\n';
  
  // Add type distribution
  csvContent += '=== LISTING TYPE DISTRIBUTION ===\n';
  csvContent += 'Listing Type,Count,Percentage\n';
  if (typeDistribution && typeDistribution.length > 0) {
    typeDistribution.forEach(type => {
      csvContent += `${escapeCSV(type['Listing Type'])},${type.Count},${escapeCSV(type.Percentage)}\n`;
    });
  } else {
    csvContent += 'No type distribution data available\n';
  }
  
  return csvContent;
}

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  
  const stringValue = String(value);
  
  // If value contains comma, quote or newline, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  
  return stringValue;
}

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('TradeMe Sales Analyzer extension installed:', details);
  
  if (details.reason === 'install') {
    console.log('First time installation');
  } else if (details.reason === 'update') {
    console.log('Extension updated');
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('TradeMe Sales Analyzer extension started');
});

// Error handling for unhandled promise rejections
self.addEventListener('unhandledrejection', event => {
  console.error('Unhandled promise rejection in background script:', event.reason);
});