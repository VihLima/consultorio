import { describe, expect, it } from 'vitest';
import { loginDestination } from './redirect';

describe('loginDestination', () => {
  it('returns the route saved by RequireAuth, query included', () => {
    expect(loginDestination({ from: '/financas' })).toBe('/financas');
    expect(loginDestination({ from: '/financas?fechar=1' })).toBe('/financas?fechar=1');
  });

  it('falls back to /inicio without a saved route', () => {
    expect(loginDestination(null)).toBe('/inicio');
    expect(loginDestination(undefined)).toBe('/inicio');
    expect(loginDestination({})).toBe('/inicio');
  });

  it('ignores anything that is not a same-app path', () => {
    expect(loginDestination({ from: 'https://evil.example' })).toBe('/inicio');
    expect(loginDestination({ from: '//evil.example' })).toBe('/inicio');
    expect(loginDestination({ from: 42 })).toBe('/inicio');
  });

  it('ignores paths that a router could read as another host (backslash)', () => {
    expect(loginDestination({ from: '/\\evil.example' })).toBe('/inicio');
    expect(loginDestination({ from: '\\\\evil.example' })).toBe('/inicio');
  });
});
