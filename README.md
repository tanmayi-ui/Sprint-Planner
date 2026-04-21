# Project Planner with Google Sheets Integration

A professional project management tool that syncs with Google Sheets as a backend.

---

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 📊 Connecting to Google Sheets

### Step 1: Prepare Your Google Sheet

Your Google Sheet should have **column headers in the first row**. Example structure:

| ID | Project | Type | Description | Owner | Deadline | Status | Remarks |
|----|---------|------|-------------|-------|----------|--------|---------|
| 1  | Auto Bot | Dashboard | AI questions training | Data Team | March 6, 2026 | In Progress | Working on it |
| 2  | UDID | Validation | Added remarks | Data Team | Feb 25, 2026 | Review | Next steps? |

**Note:** Column names can vary - you'll map them in the app!

### Step 2: Get Your Sheet URL

1. Open your Google Sheet
2. Copy the URL from your browser's address bar
   - Example: `https://docs.google.com/spreadsheets/d/1ABC123xyz.../edit#gid=0`

### Step 3: Share Your Sheet (Important!)

For the app to access your sheet:
1. Click **Share** button (top right)
2. Under "General access", change to **"Anyone with the link"**
3. Set permission to **"Editor"** (for read & write) or **"Viewer"** (read only)
4. Click **Done**

### Step 4: Connect in the App

1. Click the **📊 Google Sheets** button in the header
2. Paste your Google Sheets URL
3. Enter the sheet name (default: "Sheet1")
4. Click **🔍 Detect Columns**

### Step 5: Map Your Columns

After detection, you'll see your column headers. Map each one:

| Your Sheet Column | → | App Field |
|-------------------|---|-----------|
| "ID" or "#" | → | ID |
| "Project" or "Name" or "Title" | → | Project Name * |
| "Type" or "Category" | → | Type/Category |
| "Description" or "Details" | → | Description |
| "Owner" or "Assignee" or "Team" | → | Owner/Assignee |
| "Deadline" or "Due Date" | → | Deadline/Due Date |
| "Status" or "State" | → | Status |
| "Remarks" or "Notes" | → | Remarks/Notes |

**Project Name is required** - all others are optional.

### Step 6: Load Your Data

Click **↓ Load from Sheets** to import your projects!

---

## 📋 Status Values

The app recognizes these status values in your sheet:

| In Your Sheet | Becomes |
|---------------|---------|
| Backlog | Backlog |
| To Do | To Do |
| In Progress, Inprogress | In Progress |
| Review | Review |
| Blocked, Pending | Blocked |
| Done, Completed, Complete | Done |

---

## 🔧 Customizing Column Mapping

Edit the `COLUMN_MAPPING` object at the top of `src/App.jsx`:

```javascript
const COLUMN_MAPPING = {
  // Your Sheet Column Name: 'app_field_name'
  'Project Name': 'project',
  'Task Type': 'type',
  'Details': 'description',
  'Assigned To': 'owner',
  'Due Date': 'deadline',
  'Current Status': 'status',
  'Notes': 'remarks'
};
```

---

## 🔄 Syncing Data

### Load from Sheets
- Imports all data from your Google Sheet
- Existing app data will be replaced

### Save to Sheets
- Exports current app data to your Google Sheet
- **Warning:** This will overwrite existing sheet data!

---

## 📁 Project Structure

```
project-planner/
├── src/
│   ├── App.jsx        # Main application with Sheets integration
│   └── main.jsx       # React entry point
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## ⚠️ Troubleshooting

### "Could not detect columns"
- Make sure your sheet has headers in row 1
- Check that the sheet name is correct (case-sensitive)
- Verify the sheet is shared publicly

### "Error loading data"
- Ensure the sheet is shared with "Anyone with the link"
- Check your internet connection
- Verify the URL is correct

### Status not mapping correctly
Add your status text to `STATUS_MAPPING` in `src/App.jsx`:

```javascript
const STATUS_MAPPING = {
  'Your Custom Status': 'in-progress',
  'WIP': 'in-progress',
  'Finished': 'done'
};
```

---

## 🎨 Features

- **Kanban Board** - Drag projects across status columns
- **List View** - Full table with all details
- **Timeline View** - Projects grouped by owner
- **Search & Filter** - Find projects quickly
- **Real-time Metrics** - Track progress at a glance
- **Google Sheets Sync** - Bi-directional data sync

---

## 📝 License

MIT License - Free for personal and commercial use.
