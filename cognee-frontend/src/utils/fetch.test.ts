import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fetch from './fetch';

// Mock environment variables
const originalEnv = process.env;

describe('fetch utility', () => {
  beforeEach(() => {
    // Reset environment variables
    process.env = {
      ...originalEnv,
      USE_AUTH0_AUTHORIZATION: 'false',
      NEXT_PUBLIC_BACKEND_API_URL: 'http://localhost:8000',
      NEXT_PUBLIC_CLOUD_API_URL: 'http://localhost:8001',
      NEXT_PUBLIC_MCP_API_URL: 'http://localhost:8001',
      NEXT_PUBLIC_COGWIT_API_KEY: 'test-api-key',
    };

    // Mock global fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('basic fetch functionality', () => {
    it('should make a successful API call to backend', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await fetch('/v1/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer null',
          }),
          credentials: 'include',
        })
      );
      expect(result).toBe(mockResponse);
    });

    it('should use cloud API URL when useCloud is true', async () => {
      // Set API key explicitly for this test
      fetch.setApiKey('test-api-key');

      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      await fetch('/v1/test', {}, true);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8001/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': 'test-api-key',
          }),
          credentials: 'include',
        })
      );
    });

    it('should include custom headers in the request', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      await fetch('/v1/test', {
        headers: {
          'Custom-Header': 'custom-value',
        },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Custom-Header': 'custom-value',
            Authorization: 'Bearer null',
          }),
        })
      );
    });

    it('should include request body when provided', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const body = JSON.stringify({ test: 'data' });
      await fetch('/v1/test', {
        method: 'POST',
        body,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/test',
        expect.objectContaining({
          method: 'POST',
          body,
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      const networkError = new TypeError('Failed to fetch');
      (global.fetch as any).mockRejectedValueOnce(networkError);

      await expect(fetch('/v1/test')).rejects.toThrow(
        'Backend server is not responding. Please check if the server is running.'
      );
    });

    it('should handle errors without detail property', async () => {
      const error = new Error('Generic error');
      (global.fetch as any).mockRejectedValueOnce(error);

      await expect(fetch('/v1/test')).rejects.toThrow('No connection to the server.');
    });

    it('should propagate errors with detail property', async () => {
      const error: any = new Error('Detailed error');
      error.detail = 'Error details';
      (global.fetch as any).mockRejectedValueOnce(error);

      await expect(fetch('/v1/test')).rejects.toThrow('Detailed error');
    });
  });

  describe('setApiKey', () => {
    it('should update the API key', async () => {
      fetch.setApiKey('new-api-key');

      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      await fetch('/v1/test', {}, true);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8001/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': 'new-api-key',
          }),
        })
      );
    });
  });

  describe('setAccessToken', () => {
    it('should update the access token', async () => {
      fetch.setAccessToken('new-access-token');

      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      await fetch('/v1/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer new-access-token',
          }),
        })
      );
    });
  });

  describe('checkHealth', () => {
    it('should successfully check backend health', async () => {
      const mockResponse = new Response(JSON.stringify({ status: 'healthy' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await fetch.checkHealth();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/health');
      expect(result).toBe(mockResponse);
    });

    it('should retry on health check failure', async () => {
      const mockErrorResponse = new Response(null, { status: 500 });
      const mockSuccessResponse = new Response(JSON.stringify({ status: 'healthy' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(mockSuccessResponse);

      const result = await fetch.checkHealth();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toBe(mockSuccessResponse);
    });

    it('should throw error after max retries', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Connection failed'));

      await expect(fetch.checkHealth()).rejects.toThrow('Connection failed');

      expect(global.fetch).toHaveBeenCalledTimes(5);
    }, 10000); // Increase timeout for retry test
  });

  describe('checkMCPHealth', () => {
    it('should check MCP health endpoint', async () => {
      const mockResponse = new Response(JSON.stringify({ status: 'healthy' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const result = await fetch.checkMCPHealth();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8001/health');
      expect(result).toBe(mockResponse);
    });
  });
});
