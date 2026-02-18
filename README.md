# LeetCode Tracker & Reminder

This project automates tracking your LeetCode submissions and creates Google Calendar revision reminders following the **3-7-15 repetition rule**.

## Features
- Fetches LeetCode submissions from the previous day.
- Identifies unique problems solved.
- Creates Google Calendar events for revision (3, 7, and 15 days later) with the list of problems.
- Automated to run daily at midnight (via GitHub Actions).

## Setup

### Prerequisites
- Node.js installed.
- A Google Cloud Project with Calendar API enabled.
- Key Credentials:
  - `LEETCODE_SESSION_COOKIE` & `LEETCODE_CSRF_TOKEN` (from your browser cookies).
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (from Google Cloud Console).

### Local Execution
1. Create a `.env` file (see `index.js` for path, default expects `../.env` or configure as needed).
2. Run `npm install`.
3. Run `node src/index.js` to test manually.

### Automation (GitHub Actions)
The project is configured to run automatically at **Midnight IST (18:30 UTC)** via GitHub Actions.

1. Go to your repository **Settings > Secrets and variables > Actions**.
2. Add the following repository secrets:
   - `LEETCODE_SESSION_COOKIE`
   - `LEETCODE_CSRF_TOKEN`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
3. The workflow in `.github/workflows/main.yml` will trigger automatically.

## 3-7-15 Rule
The script creates events 3 days, 7 days, and 15 days after your submission date to prompt Spaced Repetition.
