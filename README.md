# Tag Manager

**Streamline your tag management across multiple applications. Login once, manage everywhere.**

## Overview

Tag Manager is a powerful tool designed to simplify tag management across different applications and platforms. Currently supporting ClickUp with plans to expand to Notion, Trello, Asana, and other popular project management tools.

## Current Status

### ✅ **Available Integrations**
- **ClickUp**: Full tag management with edit, delete, and organization features

### 🚧 **Coming Soon**
- **Notion**: Tag management for Notion databases and pages
- **Trello**: Card tag organization and management
- **Asana**: Project tag management and organization
- **Jira**: Issue tag management and filtering

## Features

### 🔍 **Tag Management**
- **View All Tags**: See all tags from your connected platforms with usage counts
- **Edit Tag Names**: Rename tags directly from the interface
- **Delete Tags**: Remove unused tags from your workspaces
- **Color Display**: Visual tag colors matching each platform's scheme

### 🎯 **Advanced Filtering**
- **Search Tags**: Find tags by name or ID across all platforms
- **Color Filtering**: Filter tags by their colors
- **Platform Filtering**: Filter tags by specific platform (ClickUp, Notion, etc.)
- **Group Management**: Create custom groups and organize tags
- **Collapsible Groups**: Toggle group visibility for better organization

### 📊 **Cross-Platform Integration**
- **Related Items**: View all items associated with a selected tag
- **Item Details**: See item information including assignees, due dates, and priorities
- **Real-time Updates**: Changes reflect immediately in all connected platforms
- **Unified Interface**: Manage tags from multiple platforms in one place

### 🎨 **User Interface**
- **Modern Design**: Clean, responsive interface
- **Drag & Drop**: Move tags between groups with drag-and-drop functionality
- **Loading Indicators**: Visual feedback during data loading
- **Responsive Layout**: Works on desktop and mobile devices

## Tech Stack

- **Backend**: Node.js with Express
- **Frontend**: Vanilla JavaScript with modern ES6+ features
- **Styling**: Custom CSS with responsive design
- **API Integration**: Multiple platform APIs (ClickUp, Notion, etc.)
- **Authentication**: OAuth2 with multiple platforms

## Project Structure

```
tagmanager/
├── landing/              # Main application directory
│   ├── server.js         # Express server with multi-platform API integration
│   ├── models/
│   │   ├── clickup.js    # ClickUp data models
│   │   ├── notion.js     # Notion data models (future)
│   │   └── base.js       # Base models for all platforms
│   ├── public/
│   │   ├── index.html    # Main application interface
│   │   ├── css/
│   │   │   ├── main.css  # Main styles
│   │   │   └── tag-details.css # Tag details specific styles
│   │   └── js/
│   │       ├── main.js   # Main application logic
│   │       └── drag-drop.js # Drag and drop functionality
│   ├── package.json
│   └── package-lock.json
├── api/                  # API documentation and specifications
│   ├── clickup/          # ClickUp API integration docs
│   ├── notion/           # Notion API integration docs (future)
│   └── common/           # Common API patterns and standards
├── docs/                 # User documentation and guides
│   ├── getting-started/  # Setup and installation guides
│   ├── integrations/     # Platform-specific integration guides
│   └── api-reference/    # API reference documentation
├── package.json          # Main project dependencies
└── README.md             # This file
```

## Usage

### Basic Tag Management
1. **Login**: Click "Login with [Platform]" and authorize the application
2. **View Tags**: All your platform tags will be displayed in the left panel
3. **Select Tag**: Click on any tag to see its details and related items
4. **Edit Tag**: Click the edit button (✏️) next to a tag to rename it
5. **Delete Tag**: Click the delete button (🗑️) to remove a tag

### Advanced Features
1. **Search**: Use the search bar to find specific tags across all platforms
2. **Filter by Platform**: Filter tags by specific platform (ClickUp, Notion, etc.)
3. **Filter by Color**: Click the filter button and select a color
4. **Create Groups**: Click the "+" button next to "All" to create a new group
5. **Drag & Drop**: Drag tags between groups to organize them
6. **Toggle Groups**: Click on group headers to expand/collapse them

## Platform Integrations

### ClickUp (Current)
- ✅ Full tag management
- ✅ Task integration
- ✅ Real-time updates
- ✅ Color support

### Notion (Planned)
- 🚧 Database tag management
- 🚧 Page tag organization
- 🚧 Property-based filtering
- 🚧 Template integration

### Trello (Planned)
- 🚧 Card tag management
- 🚧 Board organization
- 🚧 Label synchronization
- 🚧 Power-up integration

### Asana (Planned)
- 🚧 Project tag management
- 🚧 Task organization
- 🚧 Portfolio integration
- 🚧 Custom field support

## Configuration

### Environment Variables
Set these environment variables for production deployment:

```bash
# ClickUp
CLICKUP_CLIENT_ID=your_clickup_client_id
CLICKUP_CLIENT_SECRET=your_clickup_client_secret
CLICKUP_REDIRECT_URI=your_redirect_uri

# Notion (future)
NOTION_CLIENT_ID=your_notion_client_id
NOTION_CLIENT_SECRET=your_notion_client_secret
NOTION_REDIRECT_URI=your_redirect_uri

# Trello (future)
TRELLO_API_KEY=your_trello_api_key
TRELLO_API_SECRET=your_trello_api_secret
TRELLO_REDIRECT_URI=your_redirect_uri
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check platform-specific API documentation 