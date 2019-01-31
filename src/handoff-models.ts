import { ConversationReference } from "botbuilder-core";

export enum HandoffUserState {
    connectedToBot,
    queuedForAgent,
    connectedToAgent
}

export interface Message {
    userName: string;
    text: string;
}

export interface HandoffUser {
    userReference: Partial<ConversationReference>;
    messages: Message[];
    state: HandoffUserState;
    agentReference?: Partial<ConversationReference>;
    queueTime?: Date;
}