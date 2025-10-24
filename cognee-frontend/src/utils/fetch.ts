import handleServerErrors from "./handleServerErrors";
import isCloudEnvironment from "./isCloudEnvironment";

let numberOfRetries = 0;

const isAuth0Enabled = process.env.USE_AUTH0_AUTHORIZATION?.toLowerCase() === "true";

const backendApiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";

const cloudApiUrl = process.env.NEXT_PUBLIC_CLOUD_API_URL || "http://localhost:8001";

const mcpApiUrl = process.env.NEXT_PUBLIC_MCP_API_URL || "http://localhost:8001";

// Initialize apiKey from environment or localStorage
// Note: During SSR, localStorage is not available, so we check on client-side
let apiKey: string | null = process.env.NEXT_PUBLIC_COGWIT_API_KEY || null;
let accessToken: string | null = null;

// Client-side initialization: Load from localStorage after hydration
if (typeof window !== 'undefined') {
  const storedKey = localStorage.getItem('cognee_api_key');
  if (storedKey && !apiKey) {
    apiKey = storedKey;
  }
}

export default async function fetch(url: string, options: RequestInit = {}, useCloud = false): Promise<Response> {
  // Validate API key for cloud requests
  if (useCloud && (!isCloudEnvironment() || !accessToken) && !apiKey) {
    return Promise.reject({
      detail: 'Cloud API key is required. Please connect to cloud cognee first.',
      status: 401
    });
  }

  function retry(lastError: Response) {
    if (!isAuth0Enabled) {
      return Promise.reject(lastError);
    }

    if (numberOfRetries >= 1) {
      return Promise.reject(lastError);
    }

    numberOfRetries += 1;

    return global.fetch("/auth/token")
      .then(() => {
        return fetch(url, options);
      });
  }

  const authHeaders = useCloud && (!isCloudEnvironment() || !accessToken) ? {
    "X-Api-Key": apiKey,
  } : {
    "Authorization": `Bearer ${accessToken}`,
  }

  // Special handling for cloud API:
  // - /health endpoint is at root level (no /api prefix)
  // - Other endpoints use /api but not /v1
  const apiPrefix = useCloud && url === "/health" ? "" : "/api";
  const processedUrl = useCloud ? url.replace("/v1", "") : url;

  return global.fetch(
    (useCloud ? cloudApiUrl : backendApiUrl) + apiPrefix + processedUrl,
    {
      ...options,
      headers: {
        ...options.headers,
        ...authHeaders,
      } as HeadersInit,
      credentials: "include",
    },
  )
    .then((response) => handleServerErrors(response, retry, useCloud))
    .catch((error) => {
      // Handle network errors more gracefully
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        return Promise.reject(
          new Error("Backend server is not responding. Please check if the server is running.")
        );
      }
      
      if (error.detail === undefined) {
        return Promise.reject(
          new Error("No connection to the server.")
        );
      }

      return Promise.reject(error);
    })
    .finally(() => {
      numberOfRetries = 0;
    });
}

fetch.checkHealth = async () => {
  const maxRetries = 5;
  const retryDelay = 1000; // 1 second
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await global.fetch(`${backendApiUrl.replace("/api", "")}/health`);
      if (response.ok) {
        return response;
      }
    } catch (error) {
      // If this is the last retry, throw the error
      if (i === maxRetries - 1) {
        throw error;
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  throw new Error("Backend server is not responding after multiple attempts");
};

fetch.checkMCPHealth = () => {
  return global.fetch(`${mcpApiUrl.replace("/api", "")}/health`);
};

fetch.setApiKey = (newApiKey: string) => {
  apiKey = newApiKey;
  if (typeof window !== 'undefined') {
    localStorage.setItem('cognee_api_key', newApiKey);
    console.log('[Cognee] API key saved to localStorage');
  }
};

fetch.getApiKey = () => {
  return apiKey;
};

fetch.isApiKeyFromEnv = () => {
  return !!process.env.NEXT_PUBLIC_COGWIT_API_KEY;
};

fetch.setAccessToken = (newAccessToken: string) => {
  accessToken = newAccessToken;
};
