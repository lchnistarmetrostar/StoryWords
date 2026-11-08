const mode = process.argv[2];
if (!['dev', 'start'].includes(mode)) throw new Error('Expected dev or start.');

// The distributed entry must never spend an owner's environment-configured key.
process.env.STORYWORDS_BYOK_ONLY = '1';
process.env.STORYWORDS_LOCAL_AI_DEMO = '0';
for (const name of ['AI_BASE_URL', 'AI_MODEL', 'AI_API_KEY']) process.env[name] = '';
process.env.STORYWORDS_ALLOWED_ORIGINS ||= 'http://127.0.0.1:3000,http://localhost:3000';

const next = require.resolve('next/dist/bin/next');
process.argv = [process.execPath, next, mode, '--hostname', '127.0.0.1', ...process.argv.slice(3)];
require(next);
