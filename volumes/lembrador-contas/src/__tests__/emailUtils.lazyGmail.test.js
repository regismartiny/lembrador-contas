import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

describe('emailUtils Gmail loading', () => {
    test('loads Gmail only when a Gmail operation is requested', () => {
        const gmailPath = resolve(import.meta.dir, '../util/gmail.js');
        const emailUtilsPath = resolve(import.meta.dir, '../util/emailUtils.js');
        const script = `
            import { mock } from 'bun:test';

            let gmailModuleLoads = 0;
            mock.module(${JSON.stringify(gmailPath)}, () => {
                gmailModuleLoads += 1;
                return {
                    default: {
                        findMessages: async () => [{ id: 'message-id' }],
                        getMessage: async () => ({ id: 'message-id' }),
                    },
                };
            });

            const { default: emailUtils } = await import(${JSON.stringify(emailUtilsPath)});
            if (gmailModuleLoads !== 0) throw new Error('Gmail loaded during emailUtils import');

            await emailUtils.getLastMessage('sender@example.com', 'Account notice');
            if (gmailModuleLoads !== 1) throw new Error('Gmail did not load on first operation');
        `;
        const result = spawnSync(process.execPath, ['-e', script], {
            cwd: tmpdir(),
            encoding: 'utf8',
        });

        if (result.status !== 0) {
            throw new Error(result.stderr || result.stdout || 'Lazy Gmail subprocess failed');
        }
        expect(result.status).toBe(0);
    });
});
