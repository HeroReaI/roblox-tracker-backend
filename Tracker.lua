-- Roblox Script Tracker Client
-- Version: 1.0.0
-- Compatible with: Synapse X, ScriptWare, KRNL, Fluxus, most executors

local Tracker = {}

-- Configuration
Tracker.Config = {
    API_BASE_URL = "https://your-project.vercel.app/api", -- CHANGE THIS to your Vercel URL
    SCRIPT_ID = "YOUR_SCRIPT_ID", -- Change this to your script name/version
    HEARTBEAT_INTERVAL = 30, -- Seconds between heartbeats
    AUTO_RECONNECT = true,
    MAX_RETRIES = 3,
    DEBUG = false
}

-- Internal state
Tracker._state = {
    userId = nil,
    sessionId = nil,
    isRunning = false,
    heartbeatThread = nil,
    retryCount = 0,
    registered = false,
    lastHeartbeat = 0,
    onlineCount = 0
}

-- Generate unique user ID
function Tracker._generateUserId()
    local userId = ""
    
    -- Try to get hardware ID (unique per device)
    local success, hardwareId = pcall(function()
        return game:GetService("RbxAnalyticsService"):GetClientId()
    end)
    
    if success and hardwareId and type(hardwareId) == "string" then
        userId = "hw_" .. hardwareId
    else
        -- Fallback: random ID
        userId = "rand_" .. tostring(math.random(1, 1e9)) .. "_" .. os.time()
    end
    
    -- Add executor info if available
    local executorName = "unknown"
    if pcall(function() return identifyexecutor end) and identifyexecutor then
        executorName = identifyexecutor() or "unknown"
    end
    
    return userId .. "_" .. executorName:gsub("%s+", "")
end

-- Generate session ID
function Tracker._generateSessionId()
    return tostring(math.random(1, 1e9)) .. "_" .. os.time()
end

-- Get executor name
function Tracker._getExecutorInfo()
    local executorInfo = {
        name = "unknown",
        version = "unknown"
    }
    
    -- Try to detect different executors
    if pcall(function() return syn end) then
        executorInfo.name = "Synapse X"
        if syn and syn.version then
            executorInfo.version = tostring(syn.version)
        end
    elseif pcall(function() return getexecutorname end) then
        executorInfo.name = getexecutorname() or "unknown"
    elseif pcall(function() return KRNL_LOADED end) then
        executorInfo.name = "KRNL"
    elseif pcall(function() return fluxus end) then
        executorInfo.name = "Fluxus"
    elseif pcall(function() return Sirhurt end) then
        executorInfo.name = "Sirhurt"
    elseif pcall(function() return electron end) then
        executorInfo.name = "Electron"
    elseif pcall(function() return OXYGEN end) then
        executorInfo.name = "Oxygen U"
    end
    
    return executorInfo
end

-- HTTP request wrapper
function Tracker._httpRequest(method, endpoint, data)
    local url = Tracker.Config.API_BASE_URL .. endpoint
    local httpService = game:GetService("HttpService")
    local jsonData = data and httpService:JSONEncode(data) or ""
    
    if Tracker.Config.DEBUG then
        print("[Tracker] Sending request to:", endpoint)
        print("[Tracker] Data:", jsonData)
    end
    
    -- Try different HTTP methods based on executor
    local success, response = pcall(function()
        if method == "POST" then
            -- Try syn.request first (Synapse X)
            if syn and syn.request then
                local resp = syn.request({
                    Url = url,
                    Method = "POST",
                    Headers = {
                        ["Content-Type"] = "application/json",
                        ["User-Agent"] = "RobloxTracker/1.0.0"
                    },
                    Body = jsonData
                })
                return resp
                
            -- Try request (common in many executors)
            elseif request then
                local resp = request({
                    url = url,
                    method = "POST",
                    headers = {
                        ["Content-Type"] = "application/json"
                    },
                    body = jsonData
                })
                return resp
                
            -- Fallback to Roblox HttpService (may be disabled)
            else
                return {
                    Body = httpService:PostAsync(url, jsonData, Enum.HttpContentType.ApplicationJson),
                    Success = true
                }
            end
        else
            -- GET request
            if syn and syn.request then
                local resp = syn.request({
                    Url = url,
                    Method = "GET",
                    Headers = {
                        ["User-Agent"] = "RobloxTracker/1.0.0"
                    }
                })
                return resp
            elseif request then
                local resp = request({
                    url = url,
                    method = "GET"
                })
                return resp
            else
                return {
                    Body = httpService:GetAsync(url),
                    Success = true
                }
            end
        end
    end)
    
    if success and response and response.Body then
        local parseSuccess, result = pcall(function()
            return httpService:JSONDecode(response.Body)
        end)
        
        if parseSuccess then
            if Tracker.Config.DEBUG then
                print("[Tracker] Response:", result)
            end
            return true, result
        else
            if Tracker.Config.DEBUG then
                warn("[Tracker] Failed to parse response:", response.Body)
            end
            return false, {error = "Failed to parse response"}
        end
    else
        local errorMsg = response or "Request failed"
        if Tracker.Config.DEBUG then
            warn("[Tracker] Request failed:", errorMsg)
        end
        return false, {error = tostring(errorMsg)}
    end
end

-- Register user with the backend
function Tracker.register()
    if Tracker._state.registered then
        if Tracker.Config.DEBUG then
            print("[Tracker] Already registered")
        end
        return true
    end
    
    -- Generate IDs if not already done
    if not Tracker._state.userId then
        Tracker._state.userId = Tracker._generateUserId()
        Tracker._state.sessionId = Tracker._generateSessionId()
    end
    
    local executorInfo = Tracker._getExecutorInfo()
    
    local userInfo = {
        sessionId = Tracker._state.sessionId,
        executor = executorInfo.name,
        executorVersion = executorInfo.version,
        placeId = game.PlaceId,
        gameName = "Unknown Game",
        robloxVersion = version(),
        timestamp = os.time(),
        os = pcall(function() return identifyos and identifyos() end) and identifyos() or "unknown"
    }
    
    -- Try to get game name
    pcall(function()
        local market = game:GetService("MarketplaceService")
        local productInfo = market:GetProductInfo(game.PlaceId)
        userInfo.gameName = productInfo.Name
    end)
    
    local success, response = Tracker._httpRequest("POST", "/register", {
        userId = Tracker._state.userId,
        scriptId = Tracker.Config.SCRIPT_ID,
        userInfo = userInfo
    })
    
    if success and response.success then
        Tracker._state.registered = true
        Tracker._state.onlineCount = response.data.onlineCount or 0
        Tracker._state.retryCount = 0
        
        if Tracker.Config.DEBUG then
            print(string.format("[Tracker] ✅ Registered successfully. Online: %d users", Tracker._state.onlineCount))
        else
            print(string.format("[Tracker] Online: %d users", Tracker._state.onlineCount))
        end
        
        return true
    else
        Tracker._state.retryCount = Tracker._state.retryCount + 1
        
        local errorMsg = response and response.error or "Unknown error"
        warn(string.format("[Tracker] ❌ Registration failed (%d/%d): %s", 
            Tracker._state.retryCount, Tracker.Config.MAX_RETRIES, errorMsg))
        
        return false
    end
end

-- Send heartbeat to keep user online
function Tracker.sendHeartbeat()
    if not Tracker._state.registered or not Tracker._state.userId then
        if Tracker.Config.DEBUG then
            warn("[Tracker] Not registered, cannot send heartbeat")
        end
        return false
    end
    
    local success, response = Tracker._httpRequest("POST", "/heartbeat", {
        userId = Tracker._state.userId,
        scriptId = Tracker.Config.SCRIPT_ID
    })
    
    if success and response.success then
        Tracker._state.lastHeartbeat = os.time()
        Tracker._state.onlineCount = response.data.onlineCount or Tracker._state.onlineCount
        Tracker._state.retryCount = 0
        
        if Tracker.Config.DEBUG then
            print(string.format("[Tracker] 💓 Heartbeat sent. Online: %d users", Tracker._state.onlineCount))
        end
        
        return true
    else
        Tracker._state.retryCount = Tracker._state.retryCount + 1
        
        -- Check if session expired
        if response and response.code == "SESSION_EXPIRED" then
            if Tracker.Config.DEBUG then
                print("[Tracker] 🔄 Session expired, re-registering...")
            end
            Tracker._state.registered = false
            Tracker.register()
        else
            local errorMsg = response and response.error or "Unknown error"
            if Tracker.Config.DEBUG then
                warn(string.format("[Tracker] ❌ Heartbeat failed (%d/%d): %s", 
                    Tracker._state.retryCount, Tracker.Config.MAX_RETRIES, errorMsg))
            end
        end
        
        return false
    end
end

-- Unregister user (clean exit)
function Tracker.unregister()
    if not Tracker._state.registered or not Tracker._state.userId then
        if Tracker.Config.DEBUG then
            print("[Tracker] Not registered, nothing to unregister")
        end
        return
    end
    
    -- Send unregister request
    pcall(function()
        Tracker._httpRequest("POST", "/unregister", {
            userId = Tracker._state.userId,
            scriptId = Tracker.Config.SCRIPT_ID
        })
    end)
    
    Tracker._state.registered = false
    
    if Tracker.Config.DEBUG then
        print("[Tracker] 👋 Unregistered from tracker")
    end
end

-- Get current status
function Tracker.getStatus()
    local success, response = Tracker._httpRequest("GET", "/status?scriptId=" .. Tracker.Config.SCRIPT_ID)
    
    if success and response.success then
        Tracker._state.onlineCount = response.data.onlineCount or 0
        return response.data
    else
        warn("[Tracker] Failed to get status")
        return nil
    end
end

-- Start automatic tracking
function Tracker.start()
    if Tracker._state.isRunning then
        if Tracker.Config.DEBUG then
            warn("[Tracker] Already running")
        end
        return
    end
    
    Tracker._state.isRunning = true
    
    -- Initial registration
    local registered = Tracker.register()
    
    if not registered and Tracker._state.retryCount >= Tracker.Config.MAX_RETRIES then
        warn("[Tracker] Failed to register after max retries. Tracker may not work.")
        if not Tracker.Config.AUTO_RECONNECT then
            return
        end
    end
    
    -- Start heartbeat thread
    Tracker._state.heartbeatThread = coroutine.create(function()
        while Tracker._state.isRunning do
            wait(Tracker.Config.HEARTBEAT_INTERVAL)
            
            if Tracker._state.registered then
                Tracker.sendHeartbeat()
            elseif Tracker.Config.AUTO_RECONNECT then
                -- Try to re-register if disconnected
                Tracker.register()
            end
        end
    end)
    
    coroutine.resume(Tracker._state.heartbeatThread)
    
    -- Setup cleanup on script termination
    Tracker._setupCleanup()
    
    if Tracker.Config.DEBUG then
        print("[Tracker] 🚀 Tracker started successfully")
    else
        print("[Tracker] Tracker started")
    end
end

-- Stop tracking
function Tracker.stop()
    if not Tracker._state.isRunning then
        return
    end
    
    Tracker._state.isRunning = false
    Tracker.unregister()
    
    if Tracker.Config.DEBUG then
        print("[Tracker] 🛑 Tracker stopped")
    end
end

-- Setup cleanup hooks for script termination
function Tracker._setupCleanup()
    -- Store cleanup function in global environment
    if pcall(function() return getgenv end) then
        getgenv()._trackerCleanup = Tracker.unregister
    end
    
    -- Try to hook into script termination
    local function attemptCleanup()
        if Tracker._state.isRunning then
            Tracker.stop()
        end
    end
    
    -- Multiple cleanup attempts
    local connections = {}
    
    -- Connect to Heartbeat to keep checking
    local heartbeatConnection
    heartbeatConnection = game:GetService("RunService").Heartbeat:Connect(function()
        -- Keep alive
    end)
    
    table.insert(connections, heartbeatConnection)
    
    -- Try to detect when script is being terminated
    spawn(function()
        while Tracker._state.isRunning do
            wait(1)
            -- Check if we're still in game
            if not game:GetService("RunService"):IsRunning() then
                attemptCleanup()
                break
            end
        end
    end)
    
    -- Return cleanup function
    return attemptCleanup
end

-- Public API
Tracker.API = {
    start = Tracker.start,
    stop = Tracker.stop,
    register = Tracker.register,
    sendHeartbeat = Tracker.sendHeartbeat,
    unregister = Tracker.unregister,
    getStatus = Tracker.getStatus,
    
    -- Getters
    getUserId = function() return Tracker._state.userId end,
    getSessionId = function() return Tracker._state.sessionId end,
    getOnlineCount = function() return Tracker._state.onlineCount end,
    isRunning = function() return Tracker._state.isRunning end,
    isRegistered = function() return Tracker._state.registered end,
    
    -- Configuration setters
    setApiUrl = function(url) 
        Tracker.Config.API_BASE_URL = url:gsub("/+$", "") -- Remove trailing slashes
    end,
    setScriptId = function(id) 
        Tracker.Config.SCRIPT_ID = id 
    end,
    setHeartbeatInterval = function(seconds) 
        Tracker.Config.HEARTBEAT_INTERVAL = seconds 
    end,
    setDebug = function(debug) 
        Tracker.Config.DEBUG = debug 
    end
}

-- Auto-start if configured
if not Tracker.Config.API_BASE_URL:match("your%-project") then
    -- Auto-start after a short delay
    spawn(function()
        wait(2) -- Wait for other scripts to load
        Tracker.start()
    end)
else
    warn("[Tracker] ⚠️ Please configure API_BASE_URL in the Tracker.Config table")
    warn("[Tracker] Replace 'https://your-project.vercel.app/api' with your Vercel URL")
end

return Tracker.API
