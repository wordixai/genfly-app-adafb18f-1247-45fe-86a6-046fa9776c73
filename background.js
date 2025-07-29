// Background script for TradeMe Analyzer Extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'exportExcel') {
    handleExcelExport(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('Excel export error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open for async response
  }
});

async function handleExcelExport(data) {
  try {
    console.log('Starting Excel export...');
    
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
    
  } catch (error) {
    console.error('Export error:', error);
    throw error;
  }
}

function generateCSV(data) {
  const { summary, items, priceRanges, typeDistribution } = data;
  
  let csvContent = '';
  
  // Add summary section
  csvContent += '=== TRADEME SALES ANALYSIS SUMMARY ===\n';
  csvContent += `Generated At:,${new Date(summary.generatedAt).toLocaleString()}\n`;
  csvContent += `Total Items Found:,${summary.totalItems}\n`;
  csvContent += `Total Revenue:,$${summary.totalRevenue.toLocaleString()}\n`;
  csvContent += `Average Price:,$${summary.averagePrice.toFixed(2)}\n\n`;
  
  // Add items data
  csvContent += '=== ITEMS DETAILS ===\n';
  if (items.length > 0) {
    // Header row
    const headers = Object.keys(items[0]);
    csvContent += headers.map(escapeCSV).join(',') + '\n';
    
    // Data rows
    items.forEach(item => {
      const row = headers.map(header => escapeCSV(item[header] || ''));
      csvContent += row.join(',') + '\n';
    });
  }
  csvContent += '\n';
  
  // Add price ranges
  csvContent += '=== PRICE DISTRIBUTION ===\n';
  csvContent += 'Price Range,Count,Percentage\n';
  priceRanges.forEach(range => {
    csvContent += `${escapeCSV(range['Price Range'])},${range.Count},${escapeCSV(range.Percentage)}\n`;
  });
  csvContent += '\n';
  
  // Add type distribution
  csvContent += '=== LISTING TYPE DISTRIBUTION ===\n';
  csvContent += 'Listing Type,Count,Percentage\n';
  typeDistribution.forEach(type => {
    csvContent += `${escapeCSV(type['Listing Type'])},${type.Count},${escapeCSV(type.Percentage)}\n`;
  });
  
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
chrome.runtime.onInstalled.addListener(() => {
  console.log('TradeMe Sales Analyzer extension installed');
});