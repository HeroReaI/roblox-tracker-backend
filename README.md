# Roblox Script Tracker 

A real-time user tracking system for Roblox scripts using free-alternatives to make it sustainable.

## Features
- Real-time online user tracking
- Automatic cleanup of inactive users
- Own API for Roblox script to power the Tracker
- Serverless deployment - Vercel/Netlify
- Redis-based storage - Upstash



## API Endpoints
Base URL: https://your-hosting-site.com
Post URL: /api/register


### 1. Register User
`POST /api/register`
```json
{
  "userId": "unique-user-id",
  "scriptId": "your-script-id",
  "userInfo": {}
}
