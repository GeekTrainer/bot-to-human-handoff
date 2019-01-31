import { expect } from 'chai';
import { ConversationReference, Activity, TurnContext } from "botbuilder-core";
import sinon = require('sinon');
import 'mocha';
import { MemoryHandoffProvider } from '../handoff-provider';

describe('User list management', () => {
    const sandbox = sinon.createSandbox();
    let provider: MemoryHandoffProvider;
    before(() => {
        // todo - fix this stub
        sinon.stub(TurnContext, 'getConversationReference').callsFake(activity => {
            return {
                user: activity.from
            };
        });
    });

    it('Single user is returned', async () => {
        const expected: Partial<Activity> = {
            from: {
                name: 'TestUser',
                id: 'TestId'
            }
        };
        const provider = new MemoryHandoffProvider();

        const actual = await provider.findOrCreate(expected);

        expect(actual.userReference.user.id).equal(expected.from.id, "IDs do not match");
    });

    it('Returns same user if findOrCreate is called twice', async () => {
        const expected: Partial<Activity> = {
            from: {
                name: 'TestUser',
                id: 'TestId'
            }
        };
        const provider = new MemoryHandoffProvider();
        const firstUser = await provider.findOrCreate(expected);
        firstUser.messages.push({ userName: 'test', text: 'test message' });

        const actualUser = await provider.findOrCreate(expected);

        expect(actualUser.messages.length).equal(1);
        expect(actualUser.messages[0].text).equal('test message');
    });
});