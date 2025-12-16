# Roblox Script Tracker Backend [Online/Offline]

A real-time user tracking system for Roblox scripts using serverless architecture.

## Features
- Real-time online user tracking
- Automatic cleanup of inactive users
- RESTful API for Roblox scripts
- Serverless deployment (Vercel)
- Redis-based storage (Upstash)

## API Endpoints

### 1. Register User
`POST /api/register`
```json
{
  "userId": "unique-user-id",
  "scriptId": "your-script-id",
  "userInfo": {}
}
