# Commute Tracker

A browser-based tool to track and report your monthly work commute distances. No server required — runs entirely in the browser and stores data locally.

## Features

- **Monthly calendar view** — lists every day with weekends highlighted, showing day-of-week labels
- **Home ↔ Work tracking** — log one-way or round-trip commutes in one click
- **Custom routes** — add any departure and destination address, not just home and work
- **Fixed distance entry** — bypass the routing API and enter a known km value directly
- **Auto-fill work days** — configure your regular work days (e.g. Mon–Fri) and have them pre-filled automatically; delete individual days as needed
- **Excel export** — download the full month as an `.xlsx` file including dates, route details, full addresses, and the reimbursement amount per trip and in total
- **Persistent storage** — all data is saved in the browser's localStorage

## Setup

### 1. Get a free OpenRouteService API key

Sign up at [openrouteservice.org](https://openrouteservice.org) and generate an API key from your dashboard. The free tier allows 2000 requests/day.

### 2. Open the app

Open `index.html` in your browser. No build step or install needed.

### 3. Configure your addresses

Click **⚙ Settings** and:
1. Paste your API key
2. Enter your home address and click **Verify**
3. Enter your work address and click **Verify**
4. Optionally select your regular work days for auto-fill
5. Set your reimbursement rate per km (default €0.23)
6. Click **Save Settings**

## Usage

### Logging a commute

Click **+ Add travel** on any day to open the entry dialog:

- Select **Departure** and **Destination** (Home, Work, or Custom)
- Check **Round trip** to record both directions at once (distance is doubled)
- Click **Calculate Distance** to fetch the driving distance via OpenRouteService
- Or enter a **fixed distance** directly if you already know the km value
- Click **Save Entry**

### Auto-fill

When work days are configured in Settings, those days are automatically shown with a Home → Work entry. You can delete individual auto-filled days without affecting the setting.

### Exporting

Click **↙ Export** in the month navigation bar to download an Excel file for the current month. The rate per km is shown under the title, and the last row holds the total km and total amount; the amounts are Excel formulas, so changing the rate in the sheet recalculates them. The file includes:

| Column | Content |
|---|---|
| Date | Day and date |
| Day | Day of week |
| Departure | Home / Work / custom short name |
| Destination | Home / Work / custom short name |
| Type | One-way or Round trip |
| Distance (km) | Total km recorded |
| Amount (€) | Distance × the rate per km from Settings |
| Full addresses | Complete departure and destination addresses |

## Technology

- Vanilla HTML, CSS, and JavaScript — no frameworks or build tools
- [OpenRouteService](https://openrouteservice.org) for geocoding and driving distance calculation
- [SheetJS](https://sheetjs.com) for Excel file generation
- Browser `localStorage` for data persistence
