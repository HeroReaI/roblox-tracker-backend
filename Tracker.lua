-- Simple Roblox Script Tracker
-- Easy to use version

local API_URL = "https://roblox-tracker-backend.vercel.app/" -- CHANGE THIS!
local SCRIPT_ID = "my-script-v1.0" -- Change this to your script name

-- Generate a user ID
local userId = "user_" .. tostring(math.random(1, 1000000)) .. "_" .. os.time()
local sessionId = tostring(math.random(1, 1000000)) .. "_" .. os.time()
local isRunning = true

-- Simple HTTP request
local function httpRequest(method, endpoint, data)
    local url = API_URL .. endpoint
    local http = game:GetService("HttpService")
    local jsonData = data and http:JSONEncode(data) or ""
    
    -- Try different methods
    local success, response = pcall(function()
        if syn and syn.request then
            -- Synapse X
            local resp = syn.request({
                Url = url,
                Method = method,
                Headers = {
                    ["Content-Type"] = "application/json"
                },
                Body = jsonData
            })
            return resp.Body
        elseif request then
            -- Other executors
            local resp = request({
                url = url,
                method = method,
                headers = {
                    ["Content-Type"] = "application/json"
                },
                body = jsonData
            })
            return resp.Body
        else
            -- Fallback
            if method == "POST" then
                return http:PostAsync(url, jsonData)
            else
                return http:GetAsync(url)
            end
        end
    end)
    
    if success and response then
        local ok, result = pcall(function() return http:JSONDecode(response) end)
        if ok then return result end
    end
    return nil
end

-- Register user
local function register()
    local userInfo = {
        sessionId = sessionId,
        gameName = game:GetService("MarketplaceService"):GetProductInfo(game.PlaceId).Name,
        placeId = game.PlaceId
    }
    
    local result = httpRequest("POST", "/register", {
        userId = userId,
        scriptId = SCRIPT_ID,
        userInfo = userInfo
    })
    
    if result and result.success then
        print("[Tracker] ✅ Registered! Online users:", result.data.onlineCount)
        return true
    else
        warn("[Tracker] ❌ Registration failed")
        return false
    end
end

-- Send heartbeat
local function sendHeartbeat()
    local result = httpRequest("POST", "/heartbeat", {
        userId = userId,
        scriptId = SCRIPT_ID
    })
    
    if result and result.success then
        print("[Tracker] 💓 Online:", result.data.onlineCount)
        return true
    else
        warn("[Tracker] ❌ Heartbeat failed")
        return false
    end
end

-- Unregister
local function unregister()
    httpRequest("POST", "/unregister", {
        userId = userId,
        scriptId = SCRIPT_ID
    })
    print("[Tracker] 👋 Goodbye!")
end

-- Start tracking
local function start()
    print("[Tracker] 🚀 Starting tracker...")
    
    -- Register first
    if register() then
        -- Start heartbeat loop
        spawn(function()
            while isRunning do
                wait(30) -- 30 seconds
                sendHeartbeat()
            end
        end)
        
        -- Setup cleanup
        game:GetService("RunService").Heartbeat:Connect(function() end)
    end
end

-- Stop tracking
local function stop()
    isRunning = false
    unregister()
end

-- Get status
local function getStatus()
    local result = httpRequest("GET", "/status?scriptId=" .. SCRIPT_ID)
    if result and result.success then
        return result.data
    end
    return nil
end

-- Auto-start
spawn(function()
    wait(2)
    start()
end)

-- Return functions
return {
    start = start,
    stop = stop,
    getStatus = getStatus,
    getUserId = function() return userId end
}
