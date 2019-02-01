import { HandoffProvider } from './handoff-provider';
import { Middleware, TurnContext, ConversationReference } from 'botbuilder-core';
import { HandoffUserState, HandoffUser } from './handoff-models';
import { disconnect } from 'cluster';

let provider: HandoffProvider;

export const HandoffMiddleware = (handoffProvider: HandoffProvider): Middleware => {
    provider = handoffProvider;
    return {
        onTurn: async (context, next) => {
            if (!isMessage(context)) {
                console.log(context.activity);
                console.log('not message');
                return next();
            }

            if (context.activity.from.id && context.activity.from.id.toLowerCase().startsWith('agent')) {
                await runAgent(context, next);
            } else {
                await runUser(context, next);
            }
        }
    }
}

const isMessage = (context: TurnContext): Boolean => {
    return (!!context.activity && context.activity.type === 'message' && !!context.activity.text);
}

const runAgent = async (agentContext: TurnContext, next: () => Promise<void>) => {
    const agentReference = TurnContext.getConversationReference(agentContext.activity);
    const connectedUser = await provider.findUserByAgent(agentReference);

    if(!agentContext.activity.text.toLowerCase().startsWith('#')) {
        // not a command
        if(connectedUser) {
            // connected to user, forward message
            await sendMessageToUser(connectedUser, agentContext, agentContext.activity.text);
            return;
        } else {
            return next();
        }
    }

    switch (agentContext.activity.text.toLowerCase().substring(1)) {
        case 'disconnect':
            if(connectedUser) {
                await connectUserToBot(connectedUser, agentContext);
                return;
            } else {
                // todo: add help?
                return next();
            }
        case 'history':
            if(connectedUser) {
                await displayHistory(connectedUser, agentContext);
                return;
            } else {
                await agentContext.sendActivity('This command is only valid when connected to a user');
                return;
            }
        case 'list':
            await displayQueuedUsers(agentContext);
            return;
        case 'connect':
            if(connectedUser) {
                await agentContext.sendActivity('You are currently connected to a user. You must disconnect first.');
                return;
            } else {
                await connectAgentToLongestQueuedUser(agentReference, agentContext);
                return;
            }  
    }
    return next();
}

const runUser = async (context: TurnContext, next: () => Promise<void>) => {
    const user = await provider.findOrCreate(context.activity);
    user.messages.push({
        userName: user.userReference.user.name,
        text: context.activity.text
    });

    switch (user.state) {
        case HandoffUserState.connectedToAgent:
            if (!user.agentReference) throw 'No agent reference registered with user';

            if (context.activity.text.toLowerCase() === 'disconnect') {
                await connectUserToBot(user, context);
                return;
            }

            await sendMessageToAgent(user, context, context.activity.text);
            return;
        case HandoffUserState.queuedForAgent:
            if(context.activity.text.toLowerCase() === 'disconnect') {
                await connectUserToBot(user, context);
                return;
            } else {
                return next();
            }
        case HandoffUserState.connectedToBot:
            if(context.activity.text.toLowerCase() === 'agent') {
                await addUserToQueue(user, context);
                return;
            } else {
                return next();
            }
    }
}

async function connectAgentToLongestQueuedUser(agentReference: Partial<ConversationReference>, agentContext: TurnContext) {
    const longestQueuedUser = await provider.getLongestQueuedUser();
    if (longestQueuedUser) {
        await provider.connectUserToAgent(longestQueuedUser, agentReference);
        await agentContext.sendActivity(`You are now connected to ${longestQueuedUser.userReference.user.name}`);
        await agentContext.adapter.continueConversation(longestQueuedUser.userReference, async (userContext) => {
            await userContext.sendActivity(`You are now connected to ${agentContext.activity.from.name}`);
        });
    }
    else {
        await agentContext.sendActivity('No queued users');
    }
}

async function displayQueuedUsers(agentContext: TurnContext) {
    const queuedUsers = await provider.getQueuedUsers();
    let message = `There are currently ${queuedUsers.length} users\n\n`;
    for (const queuedUser of queuedUsers) {
        message += `- ${queuedUser.userReference.user.name}\n\n`;
    }
    await agentContext.sendActivity(message);
}

async function displayHistory(user: HandoffUser, agentContext: TurnContext) {
    await agentContext.sendActivity('Beginning message history');
    for (const message of user.messages) {
        await agentContext.sendActivity(message.text);
    }
    await agentContext.sendActivity('End of messages');
}

async function sendMessageToAgent(user: HandoffUser, context: TurnContext, messageText: string) {
    await context.adapter.continueConversation(user.agentReference, async (agentContext) => {
        await agentContext.sendActivity(messageText);
    });
}

async function sendMessageToUser(user: HandoffUser, context: TurnContext, messageText: string) {
    await context.adapter.continueConversation(user.userReference, async (userContext) => {
        await userContext.sendActivity(messageText);
    });
}

async function addUserToQueue(user: HandoffUser, context: TurnContext) {
    await provider.addUserToQueue(user);
    await sendMessageToUser(user, context, 'Putting you in queue for agent');
}

async function connectUserToBot(user: HandoffUser, context: TurnContext) {
    if(user.state === HandoffUserState.connectedToAgent) await sendMessageToAgent(user, context, 'You are reconnected to the bot');
    await sendMessageToUser(user, context, 'You are reconnected to the bot');
    await provider.connectUserToBot(user);
}
