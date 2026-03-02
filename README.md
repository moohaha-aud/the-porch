# 🏡 The Porch

Neighborhood get-togethers, made easy. A simple web app for organizing meetups with your community — publish events, RSVP, vote on activity ideas, and add events to your calendar.

## Features

- **Create events** with date, time, location, and notes
- **RSVP** — Going / Maybe / Can't make it
- **Vote on activity ideas** — suggest and upvote activities for each event
- **Real-time sync** — everyone sees the same data instantly (powered by Firebase)
- **Add to calendar** — Google Calendar link & .ics download for any calendar app
- **Mobile-friendly** — works great on phones and tablets

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run locally

```bash
npm run dev
```

Open [http://localhost:5173/the-porch/](http://localhost:5173/the-porch/) in your browser.

### 3. Deploy to GitHub Pages

First, edit `package.json` and replace `USERNAME` in the `homepage` field with your GitHub username:

```json
"homepage": "https://YOUR-USERNAME.github.io/the-porch"
```

Then deploy:

```bash
npm run deploy
```

Your site will be live at `https://YOUR-USERNAME.github.io/the-porch/`

## Firebase Setup

This app uses Firebase Realtime Database for shared data. The config is in `src/firebase.js`.

### Security Rules

The default "test mode" rules expire after 30 days. Before they expire, go to your Firebase Console → Realtime Database → Rules, and set:

```json
{
  "rules": {
    "events": {
      ".read": true,
      ".write": true
    }
  }
}
```

This keeps the app open for your neighborhood group. For tighter security, you can add Firebase Authentication later.

## Tech Stack

- React 18 + Vite
- Firebase Realtime Database
- Deployed via GitHub Pages

## License

MIT
