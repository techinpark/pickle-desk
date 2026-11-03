# 🥒 Pickle Desk

[한국어](README.md) · **English**

**Hand tasks to the AI assistant Pickle through a single Google Sheet, and read the answers right on your phone.**

👉 Use it now at **https://techinpark.github.io/pickle-desk/**. No install, no server, no coding.

```
 Pickle Desk app  ──writes a task──▶  your Google Sheet (Tasks)  ◀──reads & replies every 5 min──  Pickle
       ▲                                     │
       └────────── shows replies & results ◀─┘
```

- Type "Summarize tomorrow's meeting notes" in the app and a row is added to your own Google Sheet.
- Pickle checks the sheet every 5 minutes and fills in the `Reply`, `Result` and `Status` cells.
- The app checks the sheet every few seconds and shows the replies like a chat.
- Add it to your Home Screen to use it like an app (PWA). Dark mode, English and Korean.

> Pickle Desk is an unofficial open-source project, not affiliated with the makers of Pickle.

---

## Getting started (1 minute)

### 1. Open the app and sign in with Google

1. Open **https://techinpark.github.io/pickle-desk/** on your phone.
2. Tap **Continue with Google** and allow access.
   The app can open **only the sheet it creates**. It can't see any other file in your Drive (`drive.file` permission).

### 2. Create your task sheet

Tap **Create task sheet** and a `Pickle Desk Tasks` sheet appears in your Google Drive.

### 3. Send Pickle a message

1. **Before you start**: make sure your **Google account (Google Workspace)** is connected in the Pickle app. If it isn't, tell Pickle *"Connect my Google account"* and it will show a connection card.
2. After you create the sheet, the **Connect Pickle** screen opens. Tap **Copy message** and paste it into your chat with Pickle. (You can find it again later under ≡ menu → **Message for Pickle**.)

The copied message looks like this. Your sheet's address goes where `<sheet link>` is.

```text
This Google Sheet is my task inbox: <sheet link>
Check the Tasks tab every 5 minutes and handle it automatically.
1. Look at rows whose Status is pending, starting from the top.
2. When you start a task, change its Status to running.
3. When you finish, write a one- or two-sentence answer in Reply and the full result in Result, then change Status to done.
4. If you can't do it, write why in Reply and change Status to failed.
5. If you have an alert or suggestion for me, add a new row with a title in Task and the details in Reply, and set Status to done.
6. Don't edit the Id, Task, Category or CreatedAt cells. Leave Id empty on new rows.
```

If you pick a period (last 7 or 30 days) under **Bring in past history too?** when connecting, this line is added at the end so Pickle fills the sheet once with the tasks you gave it and their results (example for 7 days):

```text
7. Only once, at the start: add new rows for the tasks I gave you in the last 7 days and their results, as far as you remember. Put the task in Task, a one- or two-sentence result in Reply and the full result in Result, set Status to done (failed if it wasn't finished) and Category to task, and write the date and time I asked in CreatedAt as YYYY-MM-DD HH:mm:ss. Add them oldest first and leave Id empty.
```

How much gets filled in depends on how much Pickle remembers of your past conversations.

👉 Pickle recognizes the sheet and registers its own background schedule to check it every 5 minutes. From now on, tasks you give in the app are handled by Pickle and the results show up automatically.

### 4. Add to Home Screen (optional)

On iPhone, tap Safari's Share button → **Add to Home Screen**. On Android, open the Chrome menu → **Install app**.

---

## Sheet rules

| Column | Written by | Contents |
| --- | --- | --- |
| `Id` | auto | Task number. If Pickle leaves it empty, the app fills it in. |
| `Task` | app | The task you gave |
| `Status` | Pickle | `pending` · `running` · `done` · `failed` |
| `Category` | app | `task` · `briefing` · `idea` · `quick_action` |
| `Reply` | Pickle | Short answer shown as a chat bubble |
| `Result` | Pickle | Detailed result shown in a card. Links are clickable. |
| `CreatedAt` | app | When it was created |
| `UpdatedAt` | Pickle (optional) | When it was last changed |

Don't change the column names or order (`A:H`) or the tab name (`Tasks`). Pickle reads `Tasks!A:H` and writes `C:F` (Status, Category, Reply, Result).

## FAQ

**Where does my data go?**
Tasks and replies are stored **only in your own Google Sheet**. The app talks to the Google Sheets API straight from your browser; there is no server in between. The official deployment uses Google Analytics to count users, but never sends your email, task contents or sheet address. See the [privacy policy](https://techinpark.github.io/pickle-desk/privacy.html).

**Can I use it on another device?**
Sign in with the same Google account and the app finds the sheet you created before.

**Replies take a while to show up.**
Pickle checks the sheet every 5 minutes, so it can take up to about 5 minutes before it starts. If it's urgent, tell Pickle *"Check my task inbox now"*.
Once Pickle writes an answer, the app picks it up at its refresh interval (5–30 seconds, in Settings). The app doesn't check while it's closed and checks right away when you open it again.

**Can I get notified when Pickle replies?**
Turn on Settings → **Reply notifications** to get a phone or desktop notification when Pickle replies while the app is in the background. The app checks the sheet every 30 seconds while it's alive, so nothing arrives once it's fully closed. On iPhone this works only in the Home Screen app (iOS 16.4+), and the app pauses soon after going to the background, so notifications may not arrive. It works best in desktop browsers and on Android.

**Sometimes a Google screen flashes by.**
Since it's a browser app, the Google sign-in expires every hour. When it does, the app briefly goes through Google to get a new one. If you've already allowed access, there's nothing to tap.

**I deleted the sheet.**
When the app says the task sheet was deleted, tap **Set up again** to create a new one and send Pickle the new message.

---

## For developers

Vite + React + TypeScript PWA. No backend: the browser calls the Google Sheets and Drive APIs directly.

```sh
npm install
echo "VITE_GOOGLE_CLIENT_ID=<OAuth client ID>" > .env.local
npm run dev     # http://localhost:5173
npm run check   # tsc + oxlint + vitest + build
npm run e2e     # real-browser E2E (desktop & mobile, fake Google APIs). Needs Node 22.22.3+
```

- **Sign-in**: OAuth 2.0 client-side flow (`response_type=token`) by redirect, because popups can't return in an iOS Home Screen app. Expired tokens are refreshed silently with `prompt=none`, and `state` blocks forged responses.
- **Scopes**: `drive.file` (only files the app created), `openid`, `email`. All are non-sensitive in Google's classification, so no app review is needed.
- **Finding the sheet**: on creation the app sets Drive `appProperties` `pickleDesk=tasks` and uses it to find the sheet on other devices.
- **Deploy**: pushing to `main` deploys to GitHub Pages via GitHub Actions (`BASE_PATH=/pickle-desk/`). The repo variables `GOOGLE_CLIENT_ID` and (optional) `GA_MEASUREMENT_ID` go into the build. With no `GA_MEASUREMENT_ID`, no analytics code is loaded at all.
- **Quota**: the default Sheets API quota is 300 reads per minute per project. At a 5-second interval that's about 25 concurrent users; request a (free) quota increase in the Google Cloud console as usage grows.

### Self-hosting (fork)

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Google Sheets API** and **Google Drive API**.
2. In **Google Auth Platform**, fill in the app name, support email, homepage and privacy policy (`/privacy.html`), add `drive.file`, `openid` and `email` under Data Access, then **publish**.
3. Create a **Client → Web application** and add your address to the authorized JavaScript origins and redirect URIs (e.g. `https://<me>.github.io` and `https://<me>.github.io/pickle-desk/`).
4. Put the client ID in the repo variable `GOOGLE_CLIENT_ID` and set the GitHub Pages source to "GitHub Actions". For analytics, put a GA4 measurement ID in `GA_MEASUREMENT_ID` and adjust the analytics section of `public/privacy.html` for your deployment.

## License

[MIT](LICENSE)
