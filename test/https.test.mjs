import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalServer } from '../scripts/serve-https.mjs';

let folder, server, port, certificate;
before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'ivory-tls-test-'));
  const root = join(folder, 'dist');
  const certFile = join(folder, 'test.pem');
  const keyFile = join(folder, 'test-key.pem');
  // Test-only certificate: trusted solely by individual test requests, never by the OS.
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'pipe' });
  await mkdir(join(root, '.hidden'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Ivory HTTPS</title>');
  await writeFile(join(root, 'app.js'), 'export const ready = true;');
  await writeFile(join(root, '.hidden', 'secret'), 'private');
  await writeFile(join(folder, 'secret'), 'outside-root');
  await symlink(join(folder, 'secret'), join(root, 'linked-secret'));
  certificate = await readFile(certFile);
  server = await createLocalServer({ directory: root, certFile, keyFile });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});
after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (folder) await rm(folder, { recursive: true, force: true });
});
const fetchLocal = (path, options = {}) => new Promise((resolve, reject) => {
  const req = request({ hostname: '127.0.0.1', port, path, ca: certificate, ...options }, response => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', chunk => body += chunk);
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
  });
  req.on('error', reject);
  req.end();
});

test('HTTPS serves app assets with certificate verification enabled', async () => {
  const page = await fetchLocal('/');
  assert.equal(page.status, 200);
  assert.match(page.body, /Ivory HTTPS/);
  const script = await fetchLocal('/app.js');
  assert.match(script.headers['content-type'], /javascript/);
  assert.equal(script.headers['x-content-type-options'], 'nosniff');
});
test('HTTPS requires trust and a hostname included in the certificate', async () => {
  await assert.rejects(fetchLocal('/', { ca: undefined }), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  await assert.rejects(fetchLocal('/', { servername: 'wrong.example' }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
});
test('HTTPS does not expose hidden files, symlinks outside dist or parent files', async () => {
  assert.equal((await fetchLocal('/.hidden/secret')).status, 403);
  assert.equal((await fetchLocal('/linked-secret')).status, 403);
  const traversal = await fetchLocal('/%2e%2e/secret');
  assert.ok([403, 404].includes(traversal.status));
  assert.doesNotMatch(traversal.body, /outside-root/);
  assert.equal((await fetchLocal('/%E0%A4%A')).status, 400);
});
test('HTTPS handles HEAD and rejects writes', async () => {
  const head = await fetchLocal('/app.js', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  const post = await fetchLocal('/app.js', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
});
