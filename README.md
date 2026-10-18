# RealitAI mobile

A static web app (PWA) that brings the RealitAI browser extension archive to the phone: saved offers, AI analyses, location data, notes and viewings – also offline. iPhone and Android.

Data travels through the hidden app data folder in your own Google Drive (scope `drive.appdata`). The app cannot see anything else in Drive, there is no server and no secret in the code. This repository contains only code, no data.

## Setup (once, ~10 min)

### 1. Google Cloud project
1. Create a project at <https://console.cloud.google.com/projectcreate>.
2. Enable **Google Drive API**: <https://console.cloud.google.com/apis/library/drive.googleapis.com>.

### 2. Google Auth Platform
1. **Branding**: app name, your e-mail as contact.
2. **Audience**: External, status **Testing**; add your Google account under **Test users**.
3. **Data access**: add scope `https://www.googleapis.com/auth/drive.appdata` (non-sensitive, no verification needed).

### 3. GitHub Pages
Settings → Pages → Deploy from a branch → `main` / root. The app runs at `https://USER.github.io/REPO/`.

### 4. OAuth client (Web application)
- Authorized JavaScript origins: `https://USER.github.io`
- Authorized redirect URIs: `https://USER.github.io/REPO/` and the extension redirect URL shown in the extension settings (`https://….chromiumapp.org/`)

Put the Client ID into `config.js` (it is public, not a secret) and into the extension settings.

### 5. Extension
Settings → Phone: paste the Client ID and connect Google Drive. The archive is uploaded after each download of saved offers and every 30 minutes when something changed; edits from the phone are picked up within 5 minutes.

### 6. Phone
Open the app URL (iPhone: Safari, Android: Chrome), sign in, then add it to the home screen (iPhone: Share → Add to Home Screen; Android: ⋮ → Install app).

## Security
- Revoke access any time in your Google account (Security → Third-party apps).
- The app's settings contain "disconnect and delete data from the phone"; the extension can delete the data from Drive.
