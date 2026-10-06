import { describe, test, expect, mock } from 'bun:test';

let gmailModuleLoads = 0;

mock.module('../util/gmail.js', () => {
    gmailModuleLoads += 1;
    return {
        default: {
            findMessages: async () => [{ id: 'message-id' }],
            getMessage: async () => ({ id: 'message-id' }),
        },
    };
});

const { default: emailUtils } = await import('../util/emailUtils.js');

describe('emailUtils Gmail loading', () => {
    test('loads Gmail only when a Gmail operation is requested', async () => {
        expect(gmailModuleLoads).toBe(0);

        await emailUtils.getLastMessage('sender@example.com', 'Account notice');

        expect(gmailModuleLoads).toBe(1);
    });
});
