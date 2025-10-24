# Cloud API Integration Fix - Technical Documentation

**Date:** October 24, 2025  
**Issue:** CloudApiKeyMissingError and 401 Unauthorized when connecting to Cognee Cloud  
**Status:** ✅ Resolved

---

## Problem Statement

### Initial Issue
User reported a `CloudApiKeyMissingError` when attempting to connect their local Cognee instance to Cognee Cloud (api.cognee.ai) through the UI. The workflow was:

1. User runs `cognee-cli -ui`
2. Opens http://localhost:3000
3. Clicks "cloud cognee" connection button
4. Enters Cogwit API key from https://platform.cognee.ai
5. Clicks "connect"
6. **ERROR**: Connection appeared to succeed, but subsequent dataset fetches returned 401 Unauthorized

### Error Messages
```
GET https://api.cognee.ai/api/datasets/ 401 (Unauthorized)
Error fetching datasets: {detail: 'Unauthorized', status: 401}
```

---

## Root Cause Analysis

### Issue 1: Missing Authentication Header
**Location:** `cognee-frontend/src/modules/cloud/checkCloudConnection.ts`

The `checkCloudConnection()` function wasn't passing the `useCloud=true` parameter to the fetch utility, causing the X-Api-Key header to be omitted.

### Issue 2: API Key Not Persisting
**Location:** `cognee-frontend/src/utils/fetch.ts`

API key was stored in a module-level variable that would reset on:
- Module hot-reload during development
- Page refreshes
- Component re-renders

### Issue 3: URL Structure Mismatch
**Location:** `cognee-frontend/src/utils/fetch.ts`

Cloud API and local API have fundamentally different URL structures:

**URL Structure Comparison:**
```
Cloud API (api.cognee.ai):
✅ GET  /health
✅ POST /api/search
✅ GET  /api/datasets
❌ GET  /api/v1/health (404)
❌ GET  /api/v1/datasets (404)

Local API (localhost:8000):
✅ GET  /api/v1/health
✅ POST /api/v1/search
✅ GET  /api/v1/datasets
```

### Issue 4: Missing Environment Configuration
**Location:** `cognee-frontend/.env.local`

Frontend wasn't configured with the cloud API URL.

---

## Solution Architecture

### Design Philosophy
Implemented a **dual-tier configuration system** that supports both:
1. **Pre-configured deployments** (production, automated setups)
2. **User-configured deployments** (development, manual setups)

### Configuration Priority Chain
```
1. Environment Variable (NEXT_PUBLIC_COGWIT_API_KEY)
   ↓ (if not set)
2. Browser localStorage (user-entered via UI)
   ↓ (if not set)
3. null → Prompt user to configure
```

### Architecture Diagram
```
┌─────────────────────────────────────────────────────────┐
│                   Root .env File                         │
│                                                          │
│  COGNEE_CLOUD_AUTH_TOKEN="user_api_key"                │
│                                                          │
└────────────┬────────────────────────────┬───────────────┘
             │                            │
             ▼                            ▼
    ┌────────────────┐          ┌─────────────────────┐
    │    Backend     │          │  Frontend .env.local│
    │                │          │                     │
    │ Uses directly  │          │ NEXT_PUBLIC_COGWIT_ │
    │ from env var   │          │ API_KEY=${ENV_VAR}  │
    │                │          │                     │
    │ For sync ops   │          └──────────┬──────────┘
    └────────────────┘                     │
                                           ▼
                              ┌────────────────────────┐
                              │   Browser Runtime      │
                              │                        │
                              │  1. Check env var      │
                              │  2. Check localStorage │
                              │  3. Prompt user        │
                              └────────────────────────┘
```

---

## Files Modified

### 1. `cognee-frontend/src/utils/fetch.ts`

**Changes:**
- Added localStorage persistence for API key
- Modified `setApiKey()` to save to localStorage
- Added `isApiKeyFromEnv()` helper for UI logic
- Fixed URL handling for cloud vs local APIs

**Key Code:**
```typescript
// Multi-source initialization
let apiKey: string | null = 
  process.env.NEXT_PUBLIC_COGWIT_API_KEY ||
  (typeof window !== 'undefined' && localStorage.getItem('cognee_api_key')) || 
  null;

// Persist to localStorage when set
fetch.setApiKey = (newApiKey: string) => {
  apiKey = newApiKey;
  if (typeof window !== 'undefined') {
    localStorage.setItem('cognee_api_key', newApiKey);
  }
};

// Check if key is from environment
fetch.isApiKeyFromEnv = () => {
  return !!process.env.NEXT_PUBLIC_COGWIT_API_KEY;
};

// Smart URL handling for cloud vs local
const authHeaders = useCloud && (!isCloudEnvironment() || !accessToken) ? {
  "X-Api-Key": apiKey,
} : {
  "Authorization": `Bearer ${accessToken}`,
}

const apiPrefix = useCloud && url === "/health" ? "" : "/api";
const processedUrl = useCloud ? url.replace("/v1", "") : url;
```

### 2. `cognee-frontend/src/modules/cloud/checkCloudConnection.ts`

**Before:**
```typescript
return fetch("/health", { method: "GET" });
```

**After:**
```typescript
return fetch("/health", { method: "GET" }, true);  // useCloud=true
```

### 3. `cognee-frontend/src/app/dashboard/InstanceDatasetsAccordion.tsx`

**Changes:**
- Added persistence tip notification system
- Copy-to-clipboard functionality
- Conditional rendering based on configuration source

**New Features:**
- Blue notification banner after connection (if key not from env)
- Instructions to add key to `.env` for permanence
- One-click copy to clipboard

### 4. Configuration Files

#### `cognee-frontend/.env.local`
```bash
NEXT_PUBLIC_CLOUD_API_URL=https://api.cognee.ai

# Optional: Pre-configure cloud API key
# NEXT_PUBLIC_COGWIT_API_KEY=your_cogwit_api_key_here
```

#### Root `.env`
```bash
# Your Cogwit API key for authenticating with Cognee Cloud
# Get yours at: https://platform.cognee.ai
# 
# This enables:
#   - Backend automatic cloud sync (programmatic and CLI)
#   - Pre-configured frontend cloud access in the UI
#   - Sync operations without manual UI configuration
#
#COGNEE_CLOUD_AUTH_TOKEN="your_cogwit_api_key_here"
```

---

## User Flows

### User-Entered Key Flow
```
1. User clicks "cloud cognee" → Modal opens
2. User enters API key → Form submitted
3. Key validated with checkCloudConnection()
4. Key saved to localStorage via fetch.setApiKey()
5. If not from env: Show persistence tip banner
6. Modal closes, connection established
7. Subsequent requests include X-Api-Key header
```

### Pre-configured Key Flow
```
1. App starts
2. fetch.ts reads process.env.NEXT_PUBLIC_COGWIT_API_KEY
3. Auto-connects to cloud
4. No modal, no notification banner
5. All requests include X-Api-Key header
```

---

## Backend Sync Architecture

The backend has independent cloud sync capabilities:

**File:** `cognee/api/v1/sync/sync.py`

```python
async def _get_cloud_auth_token(user: User) -> str:
    """Get authentication token for Cognee Cloud API."""
    return os.getenv("COGNEE_CLOUD_AUTH_TOKEN", "your-auth-token")
```

**Usage:**
- Backend reads directly from environment variable
- No dependency on browser/frontend state
- Can be triggered via CLI, API endpoints, or scheduled jobs
- Uses same X-Api-Key authentication

---

## Testing Guide

### Test 1: User-Entered Key

**Prerequisites:**
- No `COGNEE_CLOUD_AUTH_TOKEN` in root `.env`
- Valid Cogwit API key from https://platform.cognee.ai

**Steps:**
```bash
# 1. Start application
uv run cognee-cli -ui

# 2. In browser: http://localhost:3000
# 3. Click "cloud cognee"
# 4. Enter API key
# 5. Click "connect"
```

**Expected Results:**
- ✅ Connection succeeds
- ✅ Blue notification banner appears
- ✅ "cloud cognee" shows "Connected"
- ✅ Cloud datasets load without 401 errors
- ✅ Copy button works in notification

**Verification:**
```javascript
// Browser console
localStorage.getItem('cognee_api_key')  // Should return your key

// Network tab: Check Request Headers include
X-Api-Key: your_api_key
```

### Test 2: Pre-configured Key

**Setup:**
```bash
# Edit root .env
COGNEE_CLOUD_AUTH_TOKEN="your_key"

# Optionally edit cognee-frontend/.env.local
NEXT_PUBLIC_COGWIT_API_KEY=your_key
```

**Steps:**
```bash
uv run cognee-cli -ui
# Open http://localhost:3000
```

**Expected Results:**
- ✅ Auto-connects without modal
- ✅ No notification banner
- ✅ Datasets load immediately

### Test 3: localStorage Persistence

**Steps:**
1. Complete Test 1
2. Close browser completely
3. Reopen and navigate to http://localhost:3000

**Expected:**
- ✅ Still shows "Connected"
- ✅ No need to re-enter key

---

## Configuration Guide

### For Development

**Option A: UI Entry**
1. `uv run cognee-cli -ui`
2. Enter key via UI
3. Key persists in localStorage

**Option B: Pre-configure**
1. Set `COGNEE_CLOUD_AUTH_TOKEN` in root `.env`
2. Set `NEXT_PUBLIC_COGWIT_API_KEY` in `cognee-frontend/.env.local`
3. Restart application

### For Production

**Environment Variables:**
```bash
export COGNEE_CLOUD_AUTH_TOKEN="production_key"
export NEXT_PUBLIC_COGWIT_API_KEY="production_key"
```

**Docker Compose:**
```yaml
services:
  cognee-backend:
    environment:
      - COGNEE_CLOUD_AUTH_TOKEN=${COGNEE_CLOUD_AUTH_TOKEN}
  cognee-frontend:
    environment:
      - NEXT_PUBLIC_COGWIT_API_KEY=${COGNEE_CLOUD_AUTH_TOKEN}
```

---

## Troubleshooting

### Issue: 401 After Connection

**Diagnosis:**
```javascript
localStorage.getItem('cognee_api_key')  // Check if stored
// Network tab: Check X-Api-Key header presence
```

**Possible Causes:**
1. localStorage not persisting → Check browser privacy settings
2. API key expired → Get new key from platform
3. Module hot-reload (now fixed)

**Fix:**
```javascript
localStorage.removeItem('cognee_api_key')
// Reconnect via UI
```

### Issue: Datasets Don't Load

**Diagnosis:**
- Check `useCloud={true}` prop on DatasetsAccordion
- Verify cloud API URL in .env.local
- Check network requests for correct URL structure

### Issue: Backend Sync Fails

**Cause:** Environment variable not set  
**Fix:** Set `COGNEE_CLOUD_AUTH_TOKEN` in root `.env`

---

## Technical Notes

### URL Handling
- Cloud `/health` at root (no `/api` prefix)
- Other cloud endpoints use `/api/` (no `/v1`)
- Local API uses `/api/v1/` for all endpoints

### Authentication
- Cloud: `X-Api-Key` header
- Local: `Bearer` token
- Frontend switches based on `useCloud` flag

### Security
- localStorage is domain-specific (same-origin policy)
- Never commit API keys to git
- Use environment variables in production
- Consider encryption for sensitive deployments

---

## Summary

✅ **Completed:**
- Fixed missing X-Api-Key header
- Implemented localStorage persistence
- Added user-friendly notifications
- Updated all configuration files
- Documented backend and frontend flows
- Comprehensive testing guide

🎯 **Result:**
- Cloud connection works reliably
- API key persists across sessions
- Clear setup guidance for users
- Both UI and backend sync functional
- Production-ready configuration options
