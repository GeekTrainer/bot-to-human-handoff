import { Message, HandoffUser, HandoffUserState } from './handoff-models';
import { ChannelAccount, ConversationReference, Activity, TurnContext } from 'botbuilder-core';

export interface HandoffProvider {
    findOrCreate: (from: Partial<Activity>) => Promise<HandoffUser>;
    addUserToQueue: (user: HandoffUser) => Promise<HandoffUser>;
    removeUserFromQueue: (user: HandoffUser) => Promise<HandoffUser>;
    connectUserToBot: (user: HandoffUser) => Promise<HandoffUser>;
    connectUserToAgent: (user: HandoffUser, agentReference: Partial<ConversationReference>) => Promise<HandoffUser>;
    findUserByAgent: (agentReference: Partial<ConversationReference>) => Promise<HandoffUser>;
    getQueuedUsers: () => Promise<HandoffUser[]>;
    getLongestQueuedUser: () => Promise<HandoffUser>;
}

export class MemoryHandoffProvider implements HandoffProvider {
    public constructor() {
        this.handoffUsers = [];
    }
    
    private _handoffUsers : HandoffUser[];
    public get handoffUsers() : HandoffUser[] {
        return this._handoffUsers;
    }
    public set handoffUsers(v : HandoffUser[]) {
        this._handoffUsers = v;
    }

    async findOrCreate(activity: Partial<Activity>): Promise<HandoffUser> {
        let result = this.handoffUsers.find(h => h.userReference.user.id === activity.from.id);
        if (!result) {
            result = {
                messages: [],
                userReference: TurnContext.getConversationReference(activity),
                state: HandoffUserState.connectedToBot
            };
            this.handoffUsers.push(result);
        }
        return Promise.resolve(result);
    }

    async addUserToQueue(user: HandoffUser): Promise<HandoffUser> {
        user.state = HandoffUserState.queuedForAgent;
        user.queueTime = new Date();
        return Promise.resolve(user);
    };

    async removeUserFromQueue(user: HandoffUser): Promise<HandoffUser> {
        user.state = HandoffUserState.connectedToBot;
        delete user.queueTime;
        return Promise.resolve(user);
    }

    async connectUserToBot(user: HandoffUser): Promise<HandoffUser> {
        user.state = HandoffUserState.connectedToBot;
        delete user.queueTime;
        delete user.agentReference;
        return Promise.resolve(user);
    }

    async connectUserToAgent(user: HandoffUser, agentReference: Partial<ConversationReference>): Promise<HandoffUser> {
        user.agentReference = agentReference;
        user.state = HandoffUserState.connectedToAgent;
        delete user.queueTime;
        return Promise.resolve(user);
    }

    async findUserByAgent(agentReference: Partial<ConversationReference>): Promise<HandoffUser> {
        return Promise.resolve(
            this.handoffUsers.find(h => h.agentReference && h.agentReference.user.id === agentReference.user.id)
        );
    }

    async getQueuedUsers(): Promise<HandoffUser[]> {
        return this.handoffUsers.filter(h => h.state === HandoffUserState.queuedForAgent);
    }

    async getLongestQueuedUser(): Promise<HandoffUser> {
        return Promise.resolve(
            this.handoffUsers
                .sort((a, b) => a.queueTime > a.queueTime ? 1 : -1)
                .find(h => h.state === HandoffUserState.queuedForAgent)
        );
    }
}
