"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = __importStar(require("discord.js"));
const voice_1 = require("@discordjs/voice");
const track_1 = require("./music/track");
const subscription_1 = require("./music/subscription");
const english_1 = __importDefault(require("./lang/english"));
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const { token } = require('../auth.json');
const client = new discord_js_1.default.Client({ intents: ['GUILD_VOICE_STATES', 'GUILD_MESSAGES', 'GUILDS'] });
client.on('ready', () => console.log('Ready!'));
// This contains the setup code for creating slash commands in a guild. The owner of the bot can send "!deploy" to create them.
client.on('messageCreate', async (message) => {
    var _a, _b, _c, _d;
    if (!message.guild)
        return;
    if (!((_a = client.application) === null || _a === void 0 ? void 0 : _a.owner))
        await ((_b = client.application) === null || _b === void 0 ? void 0 : _b.fetch());
    if (message.content.toLowerCase() === '!deploy' && message.author.id === ((_d = (_c = client.application) === null || _c === void 0 ? void 0 : _c.owner) === null || _d === void 0 ? void 0 : _d.id)) {
        await message.guild.commands.set([
            {
                name: 'play',
                description: 'Plays a song',
                options: [
                    {
                        name: 'song',
                        type: 'STRING',
                        description: 'The YouTube URL of the song to play',
                        required: true,
                    },
                ],
            },
            {
                name: 'skip',
                description: 'Skip to the next song in the queue',
            },
            {
                name: 'queue',
                description: 'See the music queue',
            },
            {
                name: 'pause',
                description: 'Pauses the song that is currently playing',
            },
            {
                name: 'resume',
                description: 'Resume playback of the current song',
            },
            {
                name: 'leave',
                description: 'Leave the voice channel',
            },
            {
                name: 'test',
                description: 'test',
            },
        ]);
        await message.reply(english_1.default.COMMANDS_DEPLOY_SUCCESS);
    }
});
/**
 * Maps guild IDs to music subscriptions, which exist if the bot has an active VoiceConnection to the guild.
 */
const subscriptions = new Map();
// Handles slash command interactions
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() || !interaction.guildId)
        return;
    let subscription = subscriptions.get(interaction.guildId);
    if (interaction.commandName === 'play') {
        await interaction.reply(english_1.default.COMMANDS_PLAY_BUSY);
        // Extract the video URL from the command
        const url = interaction.options.get('song').value;
        // If a connection to the guild doesn't already exist and the user is in a voice channel, join that channel
        // and create a subscription.
        if (!subscription) {
            if (interaction.member instanceof discord_js_1.GuildMember && interaction.member.voice.channel) {
                const channel = interaction.member.voice.channel;
                subscription = new subscription_1.MusicSubscription(voice_1.joinVoiceChannel({
                    channelId: channel.id,
                    guildId: channel.guild.id,
                    adapterCreator: channel.guild.voiceAdapterCreator,
                }));
                subscription.voiceConnection.on('error', console.warn);
                subscriptions.set(interaction.guildId, subscription);
            }
        }
        // If there is no subscription, tell the user they need to join a channel.
        if (!subscription) {
            await interaction.followUp(english_1.default.ERRORS_SUBSCRIPTION_NONE);
            return;
        }
        // Make sure the connection is ready before processing the user's request
        try {
            await voice_1.entersState(subscription.voiceConnection, voice_1.VoiceConnectionStatus.Ready, 20e3);
        }
        catch (error) {
            console.warn(error);
            await interaction.followUp(english_1.default.ERRORS_SUBSCRIPTION_TIMEOUT);
            return;
        }
        try {
            // Attempt to create a Track from the user's video URL
            const track = await track_1.Track.from(url, {
                onStart() {
                    interaction.followUp({ content: english_1.default.COMMANDS_PLAY_FOLLOWUP_START, ephemeral: true }).catch(console.warn);
                },
                onFinish() {
                    interaction.followUp({ content: english_1.default.COMMANDS_PLAY_FOLLOWUP_END, ephemeral: true }).catch(console.warn);
                },
                onError(error) {
                    console.warn(error);
                    interaction.followUp({ content: `${english_1.default.COMMANDS_PLAY_FOLLOWUP_ERROR}${error.message}`, ephemeral: true }).catch(console.warn);
                },
            });
            // Enqueue the track and reply a success message to the user
            subscription.enqueue(track);
            await interaction.followUp(`${english_1.default.COMMANDS_PLAY_DONE}**${track.title}**`);
        }
        catch (error) {
            console.warn(error);
            await interaction.reply(english_1.default.COMMANDS_PLAY_ERROR);
        }
    }
    else if (interaction.commandName === 'skip') {
        if (subscription) {
            // Calling .stop() on an AudioPlayer causes it to transition into the Idle state. Because of a state transition
            // listener defined in music/subscription.ts, transitions into the Idle state mean the next track from the queue
            // will be loaded and played.
            subscription.audioPlayer.stop();
            await interaction.reply(english_1.default.COMMANDS_SKIP_SUCCESS);
        }
        else {
            await interaction.reply(english_1.default.COMMANDS_SKIP_NOSUBSCRIPTION);
        }
    }
    else if (interaction.commandName === 'queue') {
        // Print out the current queue, including up to the next 5 tracks to be played.
        if (subscription) {
            const current = subscription.audioPlayer.state.status === voice_1.AudioPlayerStatus.Idle
                ? english_1.default.COMMANDS_QUEUE_EMPTY
                : `${english_1.default.COMMANDS_QUEUE_PLAYING}**${subscription.audioPlayer.state.resource.metadata.title}**`;
            const queue = subscription.queue
                .slice(0, 5)
                .map((track, index) => `${index + 1}) ${track.title}`)
                .join('\n');
            await interaction.reply(`${current}\n\n${queue}`);
        }
        else {
            await interaction.reply(english_1.default.COMMANDS_QUEUE_NOSUBSCRIPTION);
        }
    }
    else if (interaction.commandName === 'pause') {
        if (subscription) {
            subscription.audioPlayer.pause();
            await interaction.reply({ content: english_1.default.COMMANDS_PAUSE_SUCCESS, ephemeral: true });
        }
        else {
            await interaction.reply(english_1.default.COMMANDS_PAUSE_NOSUBSCRIPTION);
        }
    }
    else if (interaction.commandName === 'resume') {
        if (subscription) {
            subscription.audioPlayer.unpause();
            await interaction.reply({ content: english_1.default.COMMANDS_RESUME_SUCCESS, ephemeral: true });
        }
        else {
            await interaction.reply(english_1.default.COMMANDS_RESUME_NOSUBSCRIPTION);
        }
    }
    else if (interaction.commandName === 'leave') {
        if (subscription) {
            subscription.voiceConnection.destroy();
            subscriptions.delete(interaction.guildId);
            await interaction.reply({ content: english_1.default.COMMANDS_LEAVE_SUCCESS, ephemeral: true });
        }
        else {
            await interaction.reply(english_1.default.COMMANDS_LEAVE_NOSUBSCRIPTION);
        }
    }
    else {
        await interaction.reply(english_1.default.ERRORS_INTERACTION_UNKNOWN);
    }
});
client.on('error', console.warn);
void client.login(token);
//# sourceMappingURL=bot.js.map