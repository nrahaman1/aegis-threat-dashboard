import { spawn } from 'child_process';

const isWin = process.platform === 'win32';

// Start Express proxy server (port 3001)
const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    shell: isWin,
});

// Start Vite dev server (port 4200)
const vite = spawn(isWin ? 'npx.cmd' : 'npx', ['vite'], {
    stdio: 'inherit',
    shell: isWin,
});

function cleanup() {
    server.kill();
    vite.kill();
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

server.on('exit', (code) => {
    if (code !== 0) console.error(`[Express] exited with code ${code}`);
});

vite.on('exit', (code) => {
    if (code !== 0) console.error(`[Vite] exited with code ${code}`);
});
