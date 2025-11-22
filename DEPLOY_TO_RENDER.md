# 🚀 Deploy ValuePickr MCP Server to Render

## Step 1: Create a GitHub Repository

1. Go to [github.com](https://github.com) and sign in
2. Click the **"+"** icon (top right) → **"New repository"**
3. Fill in:
   - **Repository name**: `valuepickr-mcp`
   - **Description**: "MCP server for ValuePickr forum - read threads, search, and more"
   - **Visibility**: Public (or Private, both work)
4. **DO NOT** initialize with README (we already have one)
5. Click **"Create repository"**

## Step 2: Push Your Code to GitHub

GitHub will show you commands. Use these in your terminal:

```bash
cd /Users/gaurangmathur/Gaurang/Code/Gemini\ Website/ValuePickr/valuepickr-mcp

# Add your GitHub repo as remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/valuepickr-mcp.git

# Push the code
git branch -M main
git push -u origin main
```

**Note**: Replace `YOUR_USERNAME` with your actual GitHub username.

## Step 3: Deploy to Render

1. **Sign up on Render**:
   - Go to [render.com](https://render.com)
   - Click **"Get Started for Free"**
   - Sign up with your **GitHub account** (easiest)
   - No credit card required! ✅

2. **Create a Web Service**:
   - Click **"New +"** (top right)
   - Select **"Web Service"**
   - Click **"Connect a repository"**
   - Find and select your `valuepickr-mcp` repo
   - Click **"Connect"**

3. **Configure the Service** (Render auto-detects most settings):
   - **Name**: `valuepickr-mcp` (or choose your own)
   - **Environment**: `Node`
   - **Build Command**: `npm install` (auto-detected)
   - **Start Command**: `node src/server-http.js` (auto-detected from render.yaml)
   - **Plan**: Select **"Free"** ✅

4. **Deploy**:
   - Click **"Create Web Service"**
   - Render will start building and deploying
   - Wait 2-3 minutes for the first deployment

## Step 4: Get Your Public URL

Once deployed, Render gives you a URL like:

```
https://valuepickr-mcp.onrender.com
```

Or if you chose a different name:

```
https://YOUR-SERVICE-NAME.onrender.com
```

## Step 5: Test Your Deployed Server

Open your browser or use curl:

```bash
# Health check
curl https://valuepickr-mcp.onrender.com/

# List tools
curl https://valuepickr-mcp.onrender.com/tools

# Search the forum
curl -X POST https://valuepickr-mcp.onrender.com/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Asian Paints", "limit": 3}'

# Read a thread
curl -X POST https://valuepickr-mcp.onrender.com/read-thread \
  -H "Content-Type: application/json" \
  -d '{"url": "https://forum.valuepickr.com/t/ranjans-portfolio/45082"}'
```

## Step 6: Share Your Server

Now anyone can use your MCP server! Just share the URL:

```
https://valuepickr-mcp.onrender.com
```

## ⚠️ Important Notes

### Free Tier Limitations
- **Sleeps after 15 minutes** of inactivity
- **First request** after sleep takes ~30 seconds to wake up
- **750 hours/month** of uptime (enough for most use cases)

### Keeping It Awake (Optional)
If you want to prevent sleeping, you can:
1. Use a service like [UptimeRobot](https://uptimerobot.com) (free) to ping your server every 10 minutes
2. Or upgrade to Render's paid plan ($7/month)

## Troubleshooting

### Build Failed?
- Check the **Logs** tab in Render dashboard
- Make sure `package.json` has all dependencies

### Server Not Responding?
- Check if it's sleeping (first request takes longer)
- View **Logs** in Render dashboard

### Need to Update?
Just push to GitHub:
```bash
git add .
git commit -m "Update server"
git push
```
Render auto-deploys on every push! 🎉

---

**You're all set!** Your MCP server is now live and accessible to anyone. 🚀
