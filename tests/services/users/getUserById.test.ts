import { vi } from 'vitest';
vi.unmock('@services/users/getUserById');

import { describe, test, expect } from 'vitest';
import { getUserById } from '@services/users/getUserById';
import { db } from '@services/dbService';

vi.mock('@services/dbService', () => ({
  db: {
    select: vi.fn(),
  },
}));

describe('getUserById', () => {
  test('should return user when found', async () => {
    const mockUser = { id: '1', username: 'test', email: 'test@test.com', status: 'active' };

    // Setup mock chain
    const mockQueryChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockUser]),
    };

    vi.mocked(db.select).mockReturnValue(mockQueryChain as any);

    const result = await getUserById('1');
    expect(result).toEqual({ id: '1', username: 'test', email: 'test@test.com', status: 'active', eulaAccepted: null });
  });

  test('should return null when not found', async () => {
    const mockQueryChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(db.select).mockReturnValue(mockQueryChain as any);
    
    const result = await getUserById('1');
    expect(result).toBeNull();
  });
});
