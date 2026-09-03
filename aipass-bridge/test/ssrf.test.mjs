// Unit tests for the SSRF guard. The redirect behaviour cannot be driven through
// the HTTP surface — a test server on this machine is itself on a private
// address, which the very first check refuses — so the guard's own functions
// are exercised directly, with fetch stubbed per hop.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.AIPASS_PORT = '0'; // import starts the server; a random port collides with nothing
const { isPrivateHost, fetchRemoteAsDataUri, server } = await import('../bridge/server.mjs');

// The imported server holds the event loop open, which stalls the runner once
// this file shares a process pool with the others — release it when done.
after(() => { server.close(); server.closeAllConnections?.(); });

test('isPrivateHost catches every spelling of a private address', () => {
  const refused = [
    'localhost', 'foo.localhost',
    '127.0.0.1', '0.0.0.0', '10.1.2.3', '192.168.1.1', '172.16.0.1', '172.31.255.255', '169.254.169.254',
    '::', '::1', '[::1]',
    '::ffff:127.0.0.1', '[::ffff:127.0.0.1]', '::ffff:7f00:1',      // mapped loopback, both spellings
    '::ffff:169.254.0.1', '::ffff:a9fe:1',                            // mapped link-local / metadata
    '::ffff:10.0.0.1', '::ffff:a00:1',                                // mapped RFC1918
    'fe80::1', 'fe90::1', 'febf::1',                                  // fe80::/10, not just the fe80 prefix
    'fc00::1', 'fd12:3456::1',                                        // fc00::/7
  ];
  for (const host of refused) assert.ok(isPrivateHost(host), `${host} must be refused`);

  const allowed = [
    'example.com', 'de.aipass.net',
    '93.184.216.34', '172.32.0.1', '172.15.255.255', '169.253.0.1', '169.255.0.1',
    '::ffff:93.184.216.34', '2001:db8::1', 'fe00::1', 'ff00::1',
  ];
  for (const host of allowed) assert.ok(!isPrivateHost(host), `${host} must be allowed`);
});

test('a redirect to a private address is refused at the hop, not followed', async () => {
  const realFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (input) => {
    fetched.push(String(input));
    if (fetched.length === 1) {
      return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
    }
    throw new Error('the private redirect target must never be fetched');
  };
  try {
    await fetchRemoteAsDataUri('http://public.example/x.png', 'image');
    assert.fail('the mapped redirect must be refused');
  } catch (err) {
    assert.match(err.message, /refusing private\/internal network fetch/);
    assert.equal(fetched.length, 1, 'only the public first hop is fetched');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('redirects to public targets are followed until the payload', async () => {
  const realFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (input) => {
    fetched.push(String(input));
    if (fetched.length === 1) return new Response(null, { status: 301, headers: { location: 'http://cdn.example/x.png' } });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
  };
  try {
    const uri = await fetchRemoteAsDataUri('http://public.example/x.png', 'image');
    assert.equal(uri, 'data:image/png;base64,AQID');
    assert.deepEqual(fetched, ['http://public.example/x.png', 'http://cdn.example/x.png']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a redirect chain that never settles is cut off', async () => {
  const realFetch = globalThis.fetch;
  let hops = 0;
  globalThis.fetch = async (input) => {
    hops += 1;
    return new Response(null, { status: 302, headers: { location: `${input}/more` } });
  };
  try {
    await fetchRemoteAsDataUri('http://public.example/x.png', 'image');
    assert.fail('an endless redirect must be cut off');
  } catch (err) {
    assert.match(err.message, /too many redirects/);
    assert.equal(hops, 5, 'four hops followed, refused on the fifth');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a redirect into a non-http scheme is refused', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'file:///etc/passwd' } });
  try {
    await fetchRemoteAsDataUri('http://public.example/x.png', 'image');
    assert.fail('a file: redirect must be refused');
  } catch (err) {
    assert.match(err.message, /unsupported protocol/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
