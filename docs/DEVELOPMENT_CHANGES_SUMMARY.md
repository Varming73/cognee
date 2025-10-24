# Development Changes Summary

**Date:** October 24, 2025  
**Author:** Development Team  
**Purpose:** Document recent changes for cloud API integration and authentication enhancement

---

## 📋 Executive Summary

This document details a series of changes made to the Cognee project to integrate with Cognee Cloud API (api.cognee.ai), implement flexible authentication mechanisms, and improve the developer experience. The changes span both backend (Python) and frontend (TypeScript/Next.js) components.

**Primary Objectives:**
1. Enable seamless integration with Cognee Cloud API
2. Implement dual authentication strategy (cloud vs. local)
3. Improve API key persistence and management
4. Enhance debugging capabilities
5. Configure local development environment for MCP

---

## 🎯 Change Categories

### 1. Cloud API Integration
### 2. Authentication & Security
### 3. Developer Experience
### 4. Local Development Configuration

---

## 📝 Detailed Changes

## 1. Environment Configuration Updates

### File: `.env.template`

**What Changed:**
```diff
- COGNEE_CLOUD_API_URL="http://localhost:8001"
- COGNEE_CLOUD_AUTH_TOKEN="your-api-key"
+ COGNEE_CLOUD_API_URL="https://api.cognee.ai"
+ 
+ # Your Cogwit API key for authenticating with Cognee Cloud
+ # Get yours at: https://platform.cognee.ai
+ #
+ # This enables:
+ #   - Backend automatic cloud sync (programmatic and CLI)
+ #   - Pre-configured frontend cloud access in the UI
+ #   - Sync operations without manual UI configuration
```

**Why:**
- **Production Readiness:** Points to actual production cloud API instead of localhost
- **User Clarity:** Extensive documentation helps developers understand how to obtain and use API keys
- **Feature Documentation:** Clearly outlines what cloud sync enables
- **Onboarding:** Reduces support burden by providing clear setup instructions

**Technical Rationale:**
The previous localhost URL was a development placeholder. By updating to the production URL and adding comprehensive documentation, we:
1. Reduce configuration errors
2. Make the cloud integration opt-in but discoverable
3. Provide context for troubleshooting authentication issues

---

### File: `cognee-frontend/.env.template`

**What Changed:**
```diff
  NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000/api
+ NEXT_PUBLIC_CLOUD_API_URL=https://api.cognee.ai
+ 
+ # Optional: Pre-configure cloud API key (uncomment to use)
+ # This will read from COGNEE_CLOUD_AUTH_TOKEN in root .env if you set it there
+ # If not set, users can enter their API key via the UI
+ # NEXT_PUBLIC_COGWIT_API_KEY=your_cogwit_api_key_here
```

**Why:**
- **Frontend-Backend Separation:** Frontend now has its own cloud API configuration
- **Flexibility:** Supports both pre-configured (via env) and runtime (via UI) API key entry
- **Development Flow:** Developers can optionally skip UI key entry during testing
- **Security Best Practice:** Commented out by default to prevent accidental key commits

**Technical Rationale:**
Next.js requires `NEXT_PUBLIC_` prefix for client-side accessible variables. This change:
1. Allows frontend to independently call cloud APIs
2. Maintains security by keeping keys optional and documented
3. Supports both development (pre-configured) and production (UI-entered) workflows

---

## 2. Authentication Architecture Changes

### File: `cognee-mcp/src/cognee_client.py`

**What Changed:**
```python
def _get_headers(self) -> dict:
    """Get headers for API requests."""
    headers = {"Content-Type": "application/json"}
    if self.api_token:
-       headers["Authorization"] = f"Bearer {self.api_token}"
+       # Auto-detect authentication type based on URL
+       if self.api_url and "api.cognee.ai" in self.api_url:
+           # Cogwit Cloud uses X-Api-Key authentication
+           headers["X-Api-Key"] = self.api_token
+       else:
+           # Local/self-hosted instances use Bearer token
+           headers["Authorization"] = f"Bearer {self.api_token}"
    return headers
```

**Why:**
- **API Compatibility:** Cogwit Cloud uses X-Api-Key, while self-hosted instances use Bearer tokens
- **Automatic Detection:** Reduces configuration complexity—no separate auth type setting needed
- **Backward Compatibility:** Existing self-hosted deployments continue working without changes
- **Developer Experience:** Single client works with both cloud and local instances

**Technical Rationale:**
Different authentication schemes are common in API ecosystems:
- **X-Api-Key:** Simpler, often used in managed cloud services (AWS, Stripe style)
- **Bearer Token:** OAuth2 standard, common in self-hosted/enterprise deployments

By detecting based on URL, we:
1. Avoid additional configuration parameters
2. Prevent authentication errors from misconfiguration
3. Support seamless switching between environments
4. Follow the principle of least surprise (URL implies auth method)

**Alternative Considered:**
We could have added an `auth_type` parameter, but rejected it because:
- Adds configuration complexity
- URL-based detection is reliable (api.cognee.ai is stable)
- Reduces user error surface

---

## 3. Frontend API Key Management

### File: `cognee-frontend/src/utils/fetch.ts`

**What Changed:**
```typescript
// Initialize apiKey from environment or localStorage
let apiKey: string | null = process.env.NEXT_PUBLIC_COGWIT_API_KEY || null;

+ // Client-side initialization: Load from localStorage after hydration
+ if (typeof window !== 'undefined') {
+   const storedKey = localStorage.getItem('cognee_api_key');
+   if (storedKey && !apiKey) {
+     apiKey = storedKey;
+   }
+ }

+ function getApiKey(): string | null {
+   return apiKey;
+ }
```

**Why:**
- **Persistence:** Users shouldn't re-enter API keys on every page refresh
- **User Experience:** Single key entry persists across sessions
- **SSR Safety:** `typeof window !== 'undefined'` check prevents SSR crashes
- **Privacy:** localStorage keeps keys client-side only
- **Testing:** `getApiKey()` enables verification in other components

**Technical Rationale:**
Next.js runs on both server and client:
- **SSR Phase:** `window` is undefined → skip localStorage
- **Client Phase:** `window` exists → load from localStorage
- **Priority:** Environment var > localStorage (allows override for testing)

**Security Considerations:**
- localStorage is vulnerable to XSS attacks
- **Mitigation:** API keys are scoped to user's own data in Cognee Cloud
- **Trade-off:** Convenience vs. security (acceptable for user-scoped keys)
- **Alternative:** Could use httpOnly cookies, but adds backend complexity

---

### File: `cognee-frontend/src/app/dashboard/InstanceDatasetsAccordion.tsx`

**What Changed:**
```typescript
- import { useCallback, useEffect } from "react";
+ import { useCallback, useEffect, useState } from "react";

  const checkConnectionToCloudCognee = useCallback((apiKey?: string) => {
    if (apiKey) {
      fetch.setApiKey(apiKey);
+     console.log('[Cognee] API key set, verifying...');
+
+     // Verify the key was actually saved
+     const savedKey = fetch.getApiKey();
+     if (!savedKey) {
+       console.error('[Cognee] API key was not saved properly');
+       return;
+     }
    }
```

**Why:**
- **Debugging:** Developers can see API key flow in console
- **Verification:** Immediately catch if setApiKey() fails
- **Error Detection:** Early failure detection prevents confusing downstream errors
- **Development:** Easier troubleshooting during cloud integration development

**Technical Rationale:**
The verification pattern catches a class of bugs where:
1. `setApiKey()` is called but localStorage write fails
2. Subsequent API calls fail with authentication errors
3. User sees cryptic "401 Unauthorized" instead of clear key storage error

By verifying immediately, we provide:
- Clear error messages at point of failure
- Easier debugging (no need to check network tab)
- Better error recovery UX

---

## 4. API Endpoint Modernization

### File: `cognee-frontend/src/modules/cloud/checkCloudConnection.ts`

**What Changed:**
```typescript
  export default function checkCloudConnection() {
-   return fetch("/v1/checks/connection", {
-     method: "POST",
-   });
+   return fetch("/health", {
+     method: "GET",
+   }, true);
  }
```

**Why:**
- **REST Standards:** Health checks are conventionally GET, not POST
- **Simplicity:** `/health` is a standard endpoint name across industry
- **Cloud Mode:** Third parameter `true` indicates cloud API usage
- **Efficiency:** GET requests are cacheable, POST requests are not

**Technical Rationale:**
Health check best practices:
- **Idempotency:** GET requests should not modify state
- **Semantics:** POST implies resource creation/modification
- **Caching:** CDNs and browsers cache GET by default
- **Monitoring:** Standard tools expect GET `/health` or `/healthz`

The change aligns with:
- HTTP specification (RFC 7231)
- Cloud-native patterns (Kubernetes probes)
- API gateway conventions (AWS ALB health checks)

---

## 5. Local Development Configuration

### File: `cognee-mcp/pyproject.toml`

**What Changed:**
```toml
  dependencies = [
-   #"cognee[postgres,codegraph,gemini,huggingface,docs,neo4j] @ file:/Users/igorilic/Desktop/cognee",
-   "cognee[postgres,codegraph,gemini,huggingface,docs,neo4j]==0.3.4",
+   "cognee[codegraph,gemini,huggingface,docs] @ file:///Users/lvarming/cognee",
+   #"cognee[codegraph,gemini,huggingface,docs]==0.3.4",
```

**Why:**
- **Local Development:** Enables testing MCP changes against local cognee codebase
- **Iteration Speed:** No need to publish/install package for every change
- **Dependency Reduction:** Removed `postgres` and `neo4j` (not needed for MCP)
- **Developer-Specific:** Path updated to current developer's machine

**Technical Rationale:**
When developing MCP server:
1. **Problem:** Testing requires publishing cognee → installing in MCP → testing
2. **Solution:** Point directly to local cognee repository
3. **Benefit:** Edit cognee → restart MCP → test (no publish step)

**Important for Migration:**
- This path (`/Users/lvarming/cognee`) is machine-specific
- **Action Required:** Update to new developer's absolute path
- **Pattern:** `file:///absolute/path/to/cognee`

**Optional Dependencies Removed:**
- `postgres`: MCP uses SQLite for simplicity
- `neo4j`: MCP uses Kuzu (default graph DB)
- **Impact:** Smaller installation, faster startup

---

## 6. New Files

### File: `test_cognee.py`

**What It Does:**
```python
async def main():
    await cognee.add("Cognee turns documents into AI memory.")
    await cognee.cognify()
    await cognee.memify()
    results = await cognee.search("What does cognee do?")
```

**Why Created:**
- **Sanity Testing:** Quick verification that cognee works end-to-end
- **Example Code:** Shows basic usage pattern for new developers
- **Integration Test:** Tests add → cognify → memify → search pipeline
- **Documentation:** Living example of API usage

**When to Use:**
- After setup to verify installation
- After code changes to check no regressions
- As template for writing custom tests

---

### File: `cognee-mcp/.env.docker`

**What It Contains:**
Environment variables for running cognee-mcp in Docker:
- LLM configuration (OpenAI GPT-4)
- Embedding settings
- Database providers (SQLite, Kuzu, LanceDB)
- Security flags
- Development mode settings

**Why Created:**
- **Docker Deployment:** Separate config for containerized environments
- **Isolation:** Different settings from local development
- **Production-Like:** Tests cloud deployment configuration locally

**⚠️ Security Warning:**
Contains OpenAI API key. **Must be rotated before:**
- Committing to version control
- Sharing with other developers
- Deploying to production

**Recommendation:**
Replace with placeholder:
```bash
LLM_API_KEY=your-openai-api-key-here
```

---

### File: `env.template`

**What It Contains:**
Comprehensive environment variable documentation covering:
- All supported LLM providers (OpenAI, Azure, Ollama, OpenRouter, DeepInfra)
- Database options (SQLite, Postgres, Neo4j, Vector DBs)
- Security settings
- Cloud sync configuration
- Storage backends (local, S3)

**Why Created:**
- **Documentation:** Single source of truth for all config options
- **Onboarding:** New developers see all possibilities
- **Reference:** Copy-paste examples for common configurations

**Relationship to `.env.template`:**
- `.env.template`: Minimal, production-ready defaults
- `env.template`: Comprehensive reference with all options

---

## 🏗️ Architecture Decisions

### 1. Dual Authentication Strategy

**Decision:** Use URL-based detection for auth type  
**Rationale:**
- Reduces configuration complexity
- Prevents misconfiguration errors
- Maintains backward compatibility
- Aligns with convention (cloud URLs use API keys)

**Trade-offs:**
- ✅ Simpler user experience
- ✅ Fewer configuration parameters
- ⚠️ Assumes URL pattern remains stable
- ⚠️ Custom cloud domains need hardcoding

### 2. localStorage for API Keys

**Decision:** Store API keys in browser localStorage  
**Rationale:**
- Persist across page refreshes
- No server-side session management needed
- Client-side only (no backend storage)
- Standard practice for SPA applications

**Trade-offs:**
- ✅ Improved UX (single key entry)
- ✅ No backend complexity
- ⚠️ Vulnerable to XSS (mitigated by user-scoped keys)
- ⚠️ Not suitable for high-security applications

**Alternative Considered:**
httpOnly cookies → Rejected due to added backend complexity

### 3. Local Development Path

**Decision:** Use file:// dependency for local cognee  
**Rationale:**
- Faster development iteration
- No package publishing needed
- Changes reflected immediately
- Standard Python development practice

**Trade-offs:**
- ✅ Faster development cycle
- ✅ Test changes immediately
- ⚠️ Path must be updated per developer
- ⚠️ Not suitable for CI/CD (use versioned package)

---

## 🔒 Security Implications

### 1. API Key Exposure

**Risk:** OpenAI API key in `cognee-mcp/.env.docker`  
**Impact:** Unauthorized API usage if exposed  
**Mitigation:**
- Add `.env.docker` to `.gitignore`
- Rotate key before sharing
- Use environment-specific keys (dev vs. prod)

### 2. localStorage XSS

**Risk:** Stored API keys vulnerable to XSS attacks  
**Impact:** Attacker could steal user's cloud API key  
**Mitigation:**
- API keys are user-scoped (limited blast radius)
- Content Security Policy (CSP) headers
- Input sanitization to prevent XSS
- Consider httpOnly cookies for high-security deployments

### 3. Cloud API URL Hardcoding

**Risk:** URL detection based on string match  
**Impact:** Custom cloud domains won't auto-detect  
**Mitigation:**
- Document required URL patterns
- Consider configuration option for edge cases
- Monitor for reported issues

---

## 🧪 Testing Recommendations

### 1. Authentication Flow

**Test Case:** Verify dual auth strategy  
**Steps:**
```python
# Test 1: Cloud API (X-Api-Key)
client = CogneeClient(api_url="https://api.cognee.ai", api_token="test-key")
headers = client._get_headers()
assert "X-Api-Key" in headers
assert headers["X-Api-Key"] == "test-key"

# Test 2: Local API (Bearer)
client = CogneeClient(api_url="http://localhost:8000", api_token="test-token")
headers = client._get_headers()
assert "Authorization" in headers
assert headers["Authorization"] == "Bearer test-token"
```

### 2. API Key Persistence

**Test Case:** Verify localStorage persistence  
**Steps:**
1. Open frontend in browser
2. Enter API key in UI
3. Open DevTools → Application → Local Storage
4. Verify `cognee_api_key` exists
5. Refresh page
6. Verify API key still present (no re-entry required)

### 3. Health Check Endpoint

**Test Case:** Verify cloud connection  
**Steps:**
```bash
# Should succeed with valid key
curl -X GET https://api.cognee.ai/health \
  -H "X-Api-Key: your-key-here"

# Should fail with invalid key
curl -X GET https://api.cognee.ai/health \
  -H "X-Api-Key: invalid-key"
```

---

## 📦 Migration Checklist

When moving this project to a new computer or developer:

### Critical Actions

- [ ] **Update `cognee-mcp/pyproject.toml`**  
  Change `file:///Users/lvarming/cognee` to new absolute path

- [ ] **Rotate API Keys**  
  Replace OpenAI key in `cognee-mcp/.env.docker`

- [ ] **Update `.gitignore`**  
  Ensure `.env.docker` is not committed

- [ ] **Configure Cloud API Key**  
  Set `COGNEE_CLOUD_AUTH_TOKEN` in root `.env` (optional)

### Verification Steps

- [ ] Run `test_cognee.py` to verify basic functionality
- [ ] Test cloud connection with personal API key
- [ ] Verify localStorage persistence in browser
- [ ] Check MCP server starts with local cognee dependency

### Optional Configuration

- [ ] Review `env.template` for additional options
- [ ] Configure S3 storage if needed
- [ ] Set up alternative LLM providers (Azure, Ollama, etc.)
- [ ] Enable access control if deploying multi-user

---

## 🔄 Dependency Changes

### Frontend (`cognee-frontend/package-lock.json`)

**Changes:** Added `"peer": true` flags to various dependencies

**Affected Packages:**
- @types/react
- @typescript-eslint/parser
- acorn
- d3-selection
- eslint
- next
- react
- react-dom
- typescript

**Why:**
- npm metadata update from running `npm install`
- Marks packages as peer dependencies (provided by parent project)
- Reduces duplicate installations
- Aligns with npm 7+ peer dependency resolution

**Impact:**
- Smaller `node_modules` size
- Faster installs
- Consistent versions across workspace

### Backend (`cognee-mcp/uv.lock`)

**Changes:** Updated Python dependency lock file

**Why:**
- Switching to local file:// dependency updates entire dependency tree
- Lock file ensures reproducible builds
- Tracks transitive dependencies

**Action Required:**
After updating path in `pyproject.toml`, run:
```bash
cd cognee-mcp
uv sync --reinstall
```

---

## 📚 Related Documentation

For more context, see:
- `docs/CLOUD_API_INTEGRATION_FIX.md` - Cloud API integration details
- `docs/CLOUD_API_FIX_V2.md` - Version 2 of cloud API fixes
- `docs/COGNEE_MCP_ENHANCEMENTS_SPEC.md` - MCP enhancement specifications
- `.env.template` - Minimal production configuration
- `env.template` - Comprehensive configuration reference

---

## 🤝 Contributing

When making similar changes:

1. **Document Why:** Include rationale in commit messages
2. **Update Templates:** Keep `.env.template` in sync
3. **Test Both Modes:** Verify cloud and local authentication
4. **Security Review:** Check for exposed credentials
5. **Migration Guide:** Update this document with new changes

---

## 📞 Support

For questions about these changes:
- Review the related documentation files in `docs/`
- Check git commit messages for additional context
- Consult the comprehensive `env.template` for configuration options

---

**Document Version:** 1.0  
**Last Updated:** October 24, 2025
