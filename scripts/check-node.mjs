// Fails fast with a clear message on unsupported Node versions (Vite 8 needs ^20.19 or >=22.12; .nvmrc pins 22).
const [major, minor] = process.versions.node.split('.').map(Number);
const ok = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major >= 23;
if (!ok) {
  console.error(`\nNode ${process.versions.node} is not supported. This project needs Node 22.12 or newer (see .nvmrc).\nRun:  nvm use   (or: nvm install 22 && nvm use 22)\n`);
  process.exit(1);
}
