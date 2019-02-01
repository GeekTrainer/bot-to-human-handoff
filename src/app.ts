import restify = require('restify');
import { BotFrameworkAdapter } from 'botbuilder';
import { HandoffMiddleware } from './handoff-middleware';
import { MemoryHandoffProvider } from './handoff-provider';
import dotenv = require('dotenv');
dotenv.config();

const server = restify.createServer();

server.listen(3978, () => console.log('server up'));

const adapter = new BotFrameworkAdapter({
    appId: process.env.appId,
    appPassword: process.env.appPassword
});

adapter.use(HandoffMiddleware(new MemoryHandoffProvider()));

adapter.onTurnError = async (context, error) => {
    // This check writes out errors to console log
    // NOTE: In production environment, you should consider logging this to Azure
    //       application insights.
    console.error(`\n [onTurnError]: ${ error }`);
    // Send a message to the user
    await context.sendActivity(`Oops. Something went wrong!`);
};

server.get('/*', restify.plugins.serveStatic({directory: './public', default: 'index.html'}));

server.post('/api/messages', (req, res) => {
    adapter.processActivity(req, res, async (context) => {
        if(context.activity && context.activity.type === 'message') {
            await context.sendActivity('Echo: ' + context.activity.text);
        }
    });
});
