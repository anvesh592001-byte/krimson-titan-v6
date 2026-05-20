# KRIMSON TITAN V6 Deployment

## Fast Public Sharing

Deploy this as one Node app on Render, Railway, Fly.io, or any host that supports Node.

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```

Required environment variables:

```env
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=openrouter/free
PORT=8787
```

Optional:

```env
PUBLIC_ACCESS_CODE=share-only-with-friends
```

After deployment, share the deployed URL with friends. On mobile, they can open it in Chrome/Safari and choose **Add to Home Screen**.

## Local Network Sharing

Only works while your PC is on:

```bash
npm run dev -- --host 0.0.0.0
npm run server
```

Then friends on the same Wi-Fi can open:

```txt
http://YOUR-PC-IP:5173
```
