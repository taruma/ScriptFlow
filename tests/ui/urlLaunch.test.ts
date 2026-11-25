import {describe, expect, it} from 'vitest';
import {fetchRemoteTextFile, parseUrlLaunchParams} from '../../src/ui/urlLaunch.ts';

describe('URL Launch Parser & Remote File Fetcher (src/ui/urlLaunch.ts)', () => {
  it('returns none when no launch params are present or values are blank', () => {
    expect(parseUrlLaunchParams('')).toEqual({kind: 'none'});
    expect(parseUrlLaunchParams('?foo=bar&example=%20%20')).toEqual({kind: 'none'});
    expect(parseUrlLaunchParams('?url=&agents=')).toEqual({kind: 'none'});
  });

  it('parses ?example= with trimmed slug or ID', () => {
    expect(parseUrlLaunchParams('?example=the-grand-continental')).toEqual({
      kind: 'example',
      value: 'the-grand-continental',
    });
    expect(parseUrlLaunchParams('?example=%20script-9e58b61c-7652-4472-b1a7-1685bcea812a%20')).toEqual({
      kind: 'example',
      value: 'script-9e58b61c-7652-4472-b1a7-1685bcea812a',
    });
  });

  it('parses valid https, http, and same-origin relative ?url= and ?agents= targets', () => {
    expect(
      parseUrlLaunchParams(
        '?url=https%3A%2F%2Fexample.com%2Fscenes%2Fmy-scene.json%3Fraw%3D1',
        'https://scriptflow.app/'
      )
    ).toEqual({
      kind: 'url',
      rawUrl: 'https://example.com/scenes/my-scene.json?raw=1',
      resolvedUrl: 'https://example.com/scenes/my-scene.json?raw=1',
      filename: 'my-scene.json',
    });

    expect(
      parseUrlLaunchParams('?agents=/packs/studio-pack.json', 'https://scriptflow.app/editor')
    ).toEqual({
      kind: 'agents',
      rawUrl: '/packs/studio-pack.json',
      resolvedUrl: 'https://scriptflow.app/packs/studio-pack.json',
      filename: 'studio-pack.json',
    });

    expect(parseUrlLaunchParams('?url=https://example.com/', 'https://scriptflow.app/')).toEqual({
      kind: 'url',
      rawUrl: 'https://example.com/',
      resolvedUrl: 'https://example.com/',
      filename: 'remote-script.json',
    });

    expect(parseUrlLaunchParams('?agents=https://example.com/', 'https://scriptflow.app/')).toEqual({
      kind: 'agents',
      rawUrl: 'https://example.com/',
      resolvedUrl: 'https://example.com/',
      filename: 'agent-context.json',
    });
  });

  it('rejects multiple simultaneous launch parameters with conflict', () => {
    expect(parseUrlLaunchParams('?url=https://a.test/s.json&agents=https://a.test/a.json')).toEqual({
      kind: 'conflict',
      params: ['url', 'agents'],
    });
    expect(parseUrlLaunchParams('?example=balloon-panic&url=https://a.test/s.json')).toEqual({
      kind: 'conflict',
      params: ['example', 'url'],
    });
    expect(
      parseUrlLaunchParams('?example=balloon-panic&url=https://a.test/s.json&agents=https://a.test/a.json')
    ).toEqual({
      kind: 'conflict',
      params: ['example', 'url', 'agents'],
    });
  });

  it('rejects unsafe or malformed URLs for ?url= and ?agents=', () => {
    const jsResult = parseUrlLaunchParams('?url=javascript:alert(1)');
    expect(jsResult.kind).toBe('invalid_url');
    if (jsResult.kind === 'invalid_url') {
      expect(jsResult.param).toBe('url');
      expect(jsResult.reason).toContain('javascript:');
    }

    const dataResult = parseUrlLaunchParams('?agents=data:application/json,{}');
    expect(dataResult.kind).toBe('invalid_url');
    if (dataResult.kind === 'invalid_url') {
      expect(dataResult.param).toBe('agents');
      expect(dataResult.reason).toContain('data:');
    }

    const badHost = parseUrlLaunchParams('?url=http://[invalid');
    expect(badHost.kind).toBe('invalid_url');
  });

  it('fetchRemoteTextFile returns content on 200 OK and friendly errors on HTTP, size, or CORS failures', async () => {
    const okRes = await fetchRemoteTextFile('https://example.com/scene.json', {
      fetchImpl: async () =>
        new Response('{"hello":"world"}', {
          status: 200,
          headers: {'content-length': '17'},
        }),
    });
    expect(okRes).toEqual({ok: true, content: '{"hello":"world"}'});

    const httpErr = await fetchRemoteTextFile('https://example.com/missing.json', {
      fetchImpl: async () => new Response('Not Found', {status: 404, statusText: 'Not Found'}),
    });
    expect(httpErr).toEqual({
      ok: false,
      error: 'Remote server returned HTTP 404 Not Found.',
    });

    const headerTooBig = await fetchRemoteTextFile('https://example.com/huge.json', {
      maxBytes: 1024,
      fetchImpl: async () =>
        new Response('ok', {
          status: 200,
          headers: {'content-length': '2048'},
        }),
    });
    expect(headerTooBig.ok).toBe(false);

    const bodyTooBig = await fetchRemoteTextFile('https://example.com/huge-body.json', {
      maxBytes: 10,
      fetchImpl: async () => new Response('0123456789ABCDEF', {status: 200}),
    });
    expect(bodyTooBig.ok).toBe(false);

    const networkErr = await fetchRemoteTextFile('https://example.com/cors-blocked.json', {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    expect(networkErr.ok).toBe(false);
    if (!networkErr.ok) {
      expect(networkErr.error).toContain('CORS');
    }
  });
});
