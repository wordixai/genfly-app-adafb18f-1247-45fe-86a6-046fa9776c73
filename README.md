# TradeMe Sales Analyzer Chrome Extension

A Chrome browser extension that extracts and analyzes the most sold items from TradeMe.co.nz and exports the data to Excel format.

## Features

- 🔍 **Smart Data Extraction**: Automatically scrapes TradeMe listings with advanced selectors
- 📊 **Sales Analysis**: Analyzes pricing, categories, and sales patterns
- 📥 **Excel Export**: Exports comprehensive data to CSV/Excel format
- 🎯 **Category Filtering**: Filter by specific TradeMe categories
- 📈 **Real-time Progress**: Live progress tracking during analysis
- 🚀 **Easy Installation**: Simple Chrome extension installation

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension folder
5. The TradeMe Analyzer icon will appear in your Chrome toolbar

## Usage

1. **Navigate to TradeMe**: Go to [trademe.co.nz](https://www.trademe.co.nz)
2. **Open Extension**: Click the TradeMe Analyzer icon in your toolbar
3. **Configure Settings**:
   - Select category (or "All Categories")
   - Set maximum number of items to analyze
4. **Start Analysis**: Click "Analyze Sales Data"
5. **Export Results**: Once complete, click "Export to Excel"

## Data Extracted

The extension captures the following data for each item:

- **Item Title**: Product name/description
- **Price**: Listing price in NZD
- **Type**: Auction, Buy Now, or general listing
- **Location**: Seller location (if available)
- **Seller**: Seller username (if available)
- **URL**: Direct link to listing
- **Extraction Date**: When the data was captured

## Analysis Features

### Summary Statistics
- Total items found
- Total revenue value
- Average price per item
- Price distribution analysis

### Price Range Analysis
- Under $50
- $50 - $200
- $200 - $500
- $500 - $1,000
- Over $1,000

### Listing Type Distribution
- Auction items
- Buy Now items
- General listings

## Excel Export Format

The exported CSV file includes:

1. **Summary Sheet**: Overview statistics and analysis date
2. **Items Detail**: Complete listing of all extracted items
3. **Price Distribution**: Breakdown by price ranges
4. **Type Distribution**: Analysis by listing types

## Technical Details

### Architecture

- **Manifest V3**: Uses the latest Chrome extension format
- **Content Script**: Injected into TradeMe pages for data extraction
- **Background Script**: Handles data processing and Excel generation
- **Popup Interface**: React-based UI for user interaction

### Permissions

- `activeTab`: Access to current TradeMe tab
- `storage`: Save analysis data locally
- `downloads`: Download generated Excel files
- `host_permissions`: Access to trademe.co.nz domain

### Browser Compatibility

- Chrome 88+
- Microsoft Edge 88+
- Other Chromium-based browsers

## Troubleshooting

### Common Issues

**Extension not working on TradeMe**
- Ensure you're on trademe.co.nz domain
- Check that the extension is enabled
- Try refreshing the page

**No items found**
- TradeMe may have updated their HTML structure
- Try different categories or search terms
- Check browser console for error messages

**Export not working**
- Ensure downloads are enabled in Chrome
- Check if popup blockers are interfering
- Try with a smaller number of items

### Error Messages

**"Not on TradeMe"**
- Navigate to trademe.co.nz first
- Ensure the URL contains "trademe.co.nz"

**"Analysis failed"**
- Page structure may have changed
- Try refreshing and running again
- Check internet connection

## Development

### Setup Development Environment

```bash
# Clone repository
git clone [repository-url]
cd trademe-chrome-extension

# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select the extension directory
```

### File Structure

```
trademe-chrome-extension/
├── manifest.json          # Extension configuration
├── popup.html            # Extension popup interface
├── popup.js             # Popup logic and UI handling
├── popup.css            # Popup styling
├── content.js           # Content script for TradeMe pages
├── content.css          # Content script styles
├── background.js        # Background service worker
├── icons/               # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # This file
```

### Key Components

1. **Content Script**: Runs on TradeMe pages, extracts listing data
2. **Popup Script**: Handles user interface and triggers analysis
3. **Background Script**: Processes data and handles Excel export
4. **Manifest**: Defines permissions and extension configuration

## Privacy & Data

- **No Data Collection**: Extension doesn't collect or transmit personal data
- **Local Processing**: All analysis happens locally in your browser
- **No External Servers**: Data is not sent to any external services
- **User Control**: You control what data is extracted and exported

## Legal & Compliance

- **Ethical Use**: Extension is for personal research and analysis only
- **Rate Limiting**: Built-in delays to avoid overwhelming TradeMe servers
- **Terms of Service**: Users must comply with TradeMe's terms of service
- **Educational Purpose**: Intended for learning about web scraping and data analysis

## Limitations

- **Dynamic Content**: May not capture all dynamically loaded content
- **Rate Limits**: Large extractions may be limited by browser performance
- **Site Changes**: May require updates if TradeMe changes their HTML structure
- **Browser Only**: Only works within Chrome browser environment

## Future Enhancements

- 🔄 **Auto-refresh**: Periodic data updates
- 🎨 **Data Visualization**: Built-in charts and graphs
- 🔍 **Advanced Filtering**: More sophisticated filtering options
- 📱 **Mobile Support**: Extension for mobile browsers
- 🌐 **Multi-site**: Support for other e-commerce sites

## Support

For issues, questions, or feature requests:

1. Check this README for common solutions
2. Review Chrome extension documentation
3. Check browser console for error messages
4. Ensure TradeMe hasn't changed their site structure

## Version History

- **v1.0.0**: Initial release with basic extraction and Excel export
  - TradeMe listing extraction
  - Price and category analysis
  - CSV export functionality
  - Chrome extension popup interface

## License

This project is for educational and personal use only. Please respect TradeMe's terms of service and use responsibly.