import { describe, expect, it } from 'vitest';
import { HealthResolver } from './health.resolver.js';

describe('HealthResolver', () => {
  it('reports ok', () => {
    // Arrange
    const resolver = new HealthResolver();

    // Act
    const result = resolver.health();

    // Assert
    expect(result).toEqual({ ok: true });
  });
});
