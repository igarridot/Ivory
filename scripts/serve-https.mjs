import { createServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createAppHandler } from './server.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function createLocalServer({ directory, certFile, keyFile, uploadsDirectory = resolve(directory, '../data/uploads') }) {
  const [cert, key, handler] = await Promise.all([
    readFile(certFile), readFile(keyFile), createAppHandler({directory, uploadsDirectory}),
  ]);
  return createServer({cert, key, minVersion:'TLSv1.2'}, handler);
}

async function main() {
  const { values } = parseArgs({ options: {
    host: { type: 'string', default: '0.0.0.0' },
    port: { type: 'string', default: '5443' },
    cert: { type: 'string', default: resolve(project, '.certs/server.pem') },
    key: { type: 'string', default: resolve(project, '.certs/server-key.pem') },
  } });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('El puerto debe estar entre 1 y 65535.');
  const server = await createLocalServer({ directory: resolve(project, 'dist'), certFile: values.cert, keyFile: values.key, uploadsDirectory: process.env.IVORY_UPLOADS_DIR || resolve(project,'data/uploads') });
  server.on('error', error => { console.error(`No se pudo iniciar HTTPS: ${error.message}`); process.exitCode = 1; });
  server.listen(port, values.host, () => {
    console.log(`Ivory HTTPS · https://localhost:${port}`);
    if (values.host === '0.0.0.0') {
      for (const addresses of Object.values(networkInterfaces())) {
        for (const address of addresses || []) {
          if (address.family === 'IPv4' && !address.internal) console.log(`Red local · https://${address.address}:${port}`);
        }
      }
    }
    console.log('En iPad usa una dirección incluida en el certificado y confía previamente en su CA. Consulta README.md.');
  });
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.code === 'ENOENT'
      ? 'Faltan el certificado o la clave TLS. Consulta «iPad desde la red local» en README.md y crea los archivos .certs/server.pem y .certs/server-key.pem.'
      : `No se pudo iniciar HTTPS: ${error.message}`);
    process.exitCode = 1;
  });
}
