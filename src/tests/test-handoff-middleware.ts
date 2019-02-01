import { expect } from 'chai';
import sinon = require('sinon');
import 'mocha';
import { HandoffMiddleware } from '../handoff-middleware';
import { MemoryHandoffProvider } from "../handoff-provider";
import { HandoffUserState } from '../handoff-models';
import { TestAdapter, Activity, Middleware, TurnContext } from 'botbuilder-core';

describe('User messages routed', () => {
    const sampleActivity: Partial<Activity> = {
        type: 'message',
        from: { name: 'user', id: 'user' },
        text: 'test'
    };
    let provider: MemoryHandoffProvider;
    let middleware: Middleware;
    let adapter: TestAdapter;
    const botReply = 'Bot reply';
    const sandbox = sinon.createSandbox();
    let activitiesQueue: Partial<Activity>[];

    beforeEach(() => {
        activitiesQueue = [];
        provider = new MemoryHandoffProvider();
        middleware = HandoffMiddleware(provider);
        adapter = new TestAdapter(async (context) => {
            await context.sendActivity(botReply);
        }).use(middleware);

        sandbox.stub(adapter, 'continueConversation')
            .callsFake(async (conversationReference, proactiveCallback) => {
                const agentContextStub = sinon.createStubInstance(TurnContext);
                agentContextStub.sendActivity.callsFake(async (activityOrText) => {
                    if (typeof (activityOrText) === 'string') {
                        activitiesQueue.push({
                            recipient: {
                                id: conversationReference.user.id,
                                name: conversationReference.user.name
                            },
                            text: activityOrText
                        });
                    } else {
                        activitiesQueue.push(activityOrText);
                    }
                    
                    return Promise.resolve({ id: '42' });
                });
                proactiveCallback(agentContextStub as unknown as TurnContext);
            });
    });

    afterEach(() => {
        sandbox.restore();
    })

    it('Logs user data', async () => {
        await adapter.send(sampleActivity);

        const actualUser = await provider.findOrCreate(sampleActivity);
        expect(actualUser.messages.length).equal(1);
        expect(actualUser.messages[0].text).equals(sampleActivity.text);
    });

    it('Sends message to bot when connected to bot', async () => {
        // sinon.stub(TurnContext, 'getConversationReference').returns({user:activity.from});
        const handoffUser = await provider.findOrCreate(sampleActivity);
        handoffUser.state = HandoffUserState.connectedToBot;

        await adapter.send(sampleActivity);

        expect(adapter.activityBuffer.length).equals(1);
        expect(adapter.activityBuffer[0].text).equals(botReply);
    });

    it('Sends message to agent when connected to agent', async () => {
        const handoffUser = await provider.findOrCreate(sampleActivity);
        handoffUser.state = HandoffUserState.connectedToAgent;
        handoffUser.agentReference = {
            user: {
                id: 'agent',
                name: 'agent'
            }
        };

        await adapter.send(sampleActivity);
        expect(activitiesQueue.length).equals(1);
        const actual = activitiesQueue[0];
        expect(actual.text).equals(sampleActivity.text);
        expect(actual.recipient.id).equals(handoffUser.agentReference.user.id);
        expect(adapter.activityBuffer.length).equals(0);
    });

    it('Adds user to queue when user says "agent"', async () => {
        const handoffUser = await provider.findOrCreate(sampleActivity);
        handoffUser.state = HandoffUserState.connectedToBot;
        const spy = sandbox.spy(provider, 'addUserToQueue');
        
        await adapter.send('agent');

        expect(spy.calledWith(handoffUser)).to.be.true;
        expect(activitiesQueue.length).equal(1);
        expect(activitiesQueue[0].recipient.id).equal('user');
        expect(activitiesQueue[0].text).equal('Putting you in queue for agent');
    });

    it('Connects user to bot from agent when user says disconnect', async () => {
        const handoffUser = await provider.findOrCreate(sampleActivity);
        handoffUser.state = HandoffUserState.connectedToAgent;
        handoffUser.agentReference = {
            user: {
                name: 'agent',
                id: 'agent'
            }
        };
        const spy = sandbox.spy(provider, 'connectUserToBot');
        
        await adapter.send('disconnect');

        expect(spy.calledWith(handoffUser)).to.be.true;
        expect(activitiesQueue.length).equal(2);
        // message to user
        const userActivity = activitiesQueue.find(a => a.recipient.id === 'user');
        expect(userActivity.text).equal('You are reconnected to the bot');
        
        const agentActivity = activitiesQueue.find(a => a.recipient.id === 'agent');
        expect(agentActivity.text).equal('You are reconnected to the bot');
    });

    it('Connects user to bot from queue when user says disconnect', async () => {
        const handoffUser = await provider.findOrCreate(sampleActivity);
        handoffUser.state = HandoffUserState.queuedForAgent;
        const spy = sandbox.spy(provider, 'connectUserToBot');

        await adapter.send('disconnect');

        expect(spy.calledWith(handoffUser));
        // message to user
        expect(activitiesQueue.length).equal(1);
        expect(activitiesQueue[0].recipient.id).equal('user');
        expect(activitiesQueue[0].text).equal('You are reconnected to the bot')
    })
});