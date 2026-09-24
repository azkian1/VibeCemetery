import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceName = 'contracts/GravePlotNFT.sol';
const source = readFileSync(path.join(root, sourceName), 'utf8');
const input = {
  language: 'Solidity',
  sources: { [sourceName]: { content: source } },
  settings: {
    evmVersion: 'cancun',
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  },
};

function findImports(importPath) {
  try {
    return { contents: readFileSync(path.join(root, 'node_modules', importPath), 'utf8') };
  } catch {
    return { error: `Cannot resolve ${importPath}` };
  }
}

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
for (const message of output.errors ?? []) {
  if (message.severity === 'error') console.error(message.formattedMessage);
}
if ((output.errors ?? []).some((message) => message.severity === 'error')) process.exit(1);

const artifact = output.contracts[sourceName].GravePlotNFT;
const creationBytes = artifact.evm.bytecode.object.length / 2;
const runtimeBytes = artifact.evm.deployedBytecode.object.length / 2;
console.log(`GravePlotNFT compiled with solc ${solc.version()} for Cancun EVM; creation: ${creationBytes} bytes, runtime: ${runtimeBytes} bytes`);
