import { describe, test, expect, afterEach } from 'bun:test';
import { User } from '../models/User.js';

const originalFindOne = User.findOne;

afterEach(() => {
    User.findOne = originalFindOne;
});

describe('User model pre-validate hook', () => {
    test('sets updated_at and created_at without TypeError when email is unique', async () => {
        User.findOne = () => Promise.resolve(null);

        const user = new User({
            name: 'Regis',
            email: 'regis@example.com',
            created_at: undefined,
            updated_at: undefined,
        });

        await user.validate();

        expect(user.updated_at).toBeInstanceOf(Date);
        expect(user.created_at).toBeInstanceOf(Date);
    });

    test('rejects validation when another user already uses the same email', async () => {
        User.findOne = () => Promise.resolve({ _id: 'other-id', email: 'dup@example.com' });

        const user = new User({
            name: 'Duplicate',
            email: 'dup@example.com',
        });

        await expect(user.validate()).rejects.toThrow('email must be unique');
    });
});
