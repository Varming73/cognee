import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useAuthenticatedUser from './useAuthenticatedUser';
import { User } from './types';

// Mock the fetch utility
vi.mock('@/utils', () => ({
  fetch: vi.fn(),
}));

import { fetch } from '@/utils';

describe('useAuthenticatedUser', () => {
  const mockUser: User = {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    picture: 'https://example.com/avatar.jpg',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch and return authenticated user data', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValueOnce(mockUser),
    } as any;

    (fetch as any).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useAuthenticatedUser());

    // Initially user should be undefined
    expect(result.current.user).toBeUndefined();

    // Wait for the user to be fetched
    await waitFor(() => {
      expect(result.current.user).toBeDefined();
    });

    expect(result.current.user).toEqual(mockUser);
    expect(fetch).toHaveBeenCalledWith('/v1/auth/me');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should not refetch user if already loaded', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValueOnce(mockUser),
    } as any;

    (fetch as any).mockResolvedValueOnce(mockResponse);

    const { result, rerender } = renderHook(() => useAuthenticatedUser());

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.user).toBeDefined();
    });

    expect(fetch).toHaveBeenCalledTimes(1);

    // Rerender the hook
    rerender();

    // Should not fetch again since user is already loaded
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should handle fetch errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    (fetch as any).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAuthenticatedUser());

    // User should remain undefined on error
    expect(result.current.user).toBeUndefined();

    // Wait a bit to ensure no state updates occur
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(result.current.user).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith('/v1/auth/me');

    consoleError.mockRestore();
  });

  it('should handle invalid JSON response', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockResponse = {
      json: vi.fn().mockRejectedValueOnce(new Error('Invalid JSON')),
    } as any;

    (fetch as any).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useAuthenticatedUser());

    // User should remain undefined on JSON parse error
    expect(result.current.user).toBeUndefined();

    // Wait a bit to ensure no state updates occur
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(result.current.user).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith('/v1/auth/me');

    consoleError.mockRestore();
  });

  it('should return user object with correct structure', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValueOnce(mockUser),
    } as any;

    (fetch as any).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useAuthenticatedUser());

    await waitFor(() => {
      expect(result.current.user).toBeDefined();
    });

    // Verify user object has all expected properties
    expect(result.current.user).toHaveProperty('id');
    expect(result.current.user).toHaveProperty('name');
    expect(result.current.user).toHaveProperty('email');
    expect(result.current.user).toHaveProperty('picture');

    // Verify property types
    expect(typeof result.current.user?.id).toBe('string');
    expect(typeof result.current.user?.name).toBe('string');
    expect(typeof result.current.user?.email).toBe('string');
    expect(typeof result.current.user?.picture).toBe('string');
  });

  it('should handle partial user data', async () => {
    const partialUser = {
      id: 'user-456',
      name: 'Partial User',
      email: 'partial@example.com',
      picture: '',
    };

    const mockResponse = {
      json: vi.fn().mockResolvedValueOnce(partialUser),
    } as any;

    (fetch as any).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useAuthenticatedUser());

    await waitFor(() => {
      expect(result.current.user).toBeDefined();
    });

    expect(result.current.user).toEqual(partialUser);
    expect(result.current.user?.picture).toBe('');
  });
});
