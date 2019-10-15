const { Client, Util } = require('discord.js');
const Discord = require('discord.js');
const Youtube = require('simple-youtube-api');
const ytdl = require('ytdl-core');
var PREFIX = "sm!";

const client = new Client({ disableEveryone: true });

const youtube = new Youtube(process.env.apikey);

const queue = new Map();

client.on("ready", () => {
    console.log("Ready to play sweet music in the ears of sweetspot!");
    client.user.setActivity(`Music in the ears of SweetSpot`, { type: "PLAYING" });
});

client.on('disconnect', () => console.log('Just disconnected, Reconnecting now!'));

client.on('reconnecting', () => console.log('Reconnecting now!'));

client.on("message", async msg => {
    if (msg.author.bot) return undefined;
    if (!msg.content.startsWith(PREFIX)) return undefined;

    const args = msg.content.split(' ');
    const searchString = args.slice(1).join(' ');
    const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
    const serverQueue = queue.get(msg.guild.id);

    let command = msg.content.toLowerCase().split(' ')[0];
    command = command.slice(PREFIX.length);

    if (command === 'play') {
        const voiceChannel = msg.member.voiceChannel;
        if (!voiceChannel) return msg.channel.send("You must be in a voice channel to play music.");
        const permissions = voiceChannel.permissionsFor(msg.client.user);
        if (!permissions.has('CONNECT')) {
            return msg.channel.send("I cannot join that voice channel!");
        }
        if (!permissions.has('SPEAK')) {
            return msg.channel.send("I cannot speak in that channel!");
        }

        if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
            const playlist = await youtube.getPlaylist(url);
            const videos = await playlist.getVideos();
            for (const video of Object.values(videos)) {
                const video2 = await youtube.getVideoByID(video.id);
                await handleVideo(video2, msg, voiceChannel, true);
            }
            const addQueEmbed = new Discord.RichEmbed()
                .setAuthor("SweetSpot", "https://i.imgur.com/skvRpRm.png")
                .setThumbnail("https://i.imgur.com/skvRpRm.png")
                .setColor('#42b0f5')
                .addField('Result', `**${playlist.title}** has been added to the queue!`);
            return msg.channel.send(addQueEmbed);
        } else {
            try {
                var video = await youtube.getVideo(url);
            } catch (error) {
                try {
                    var videos = await youtube.searchVideos(searchString, 10);
                    let index = 0;
                    const searchEmbed = new Discord.RichEmbed()
                        .setAuthor("SweetSpot", "https://i.imgur.com/skvRpRm.png")
                        .setColor('#42b0f5')
                        .setThumbnail("https://i.imgur.com/skvRpRm.png")
                        .addField("SongSelection", `${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}`)
                        .addField("Instruct", "Please provide a value to select one of the search results ranging from 1-10.");
                    msg.channel.send(searchEmbed);

                    try {
                        var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
                            maxMatches: 1,
                            time: 10000,
                            errors: ['time']
                        });
                    } catch (err) {
                        console.error(err);
                        return msg.channel.send('No or invalid vlaue entered, video selection cancelled!');
                    }
                    const videoIndex = parseInt(response.first().content);
                    var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
                } catch (err) {
                    console.error(err);
                    return msg.channel.send("No search results :(");
                }
            }
            return handleVideo(video, msg, voiceChannel);
        }
    } else if (command === 'skip') {
        if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
        if (!serverQueue) return msg.channel.send('There is nothing playing!');
        serverQueue.connection.dispatcher.end('Skip command has been used!');
        return undefined;
    } else if (command === 'stop') {
        if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
        if (!serverQueue) return msg.channel.send('There is nothing playing!');
        serverQueue.songs = [];
        serverQueue.connection.dispatcher.end('Stop command has been used!');
        return undefined;
    } else if (command === 'volume') {
        if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
        if (!serverQueue) return msg.channel.send('There is nothing playing!');
        const currentVolEmbed = new Discord.RichEmbed()
            .setAuthor("SweetSpot", "https://i.imgur.com/skvRpRm.png")
            .setColor('#42b0f5')
            .setThumbnail("https://i.imgur.com/skvRpRm.png")
            .addField("Volume", `The current volume is **${serverQueue.volume}**`);
        if (!args[1]) return msg.channel.send(currentVolEmbed);
        serverQueue.volume = args[1];
        serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
        const setVolumeEmbed = new Discord.RichEmbed()
            .setAuthor("SweetSpot", "https://i.imgur.com/skvRpRm.png")
            .setThumbnail("https://i.imgur.com/skvRpRm.png")
            .setColor('#42b0f5')
            .addField("Volume", `The volume has been set too: **${args[1]}**`);
        return msg.channel.send(setVolumeEmbed);
    } else if (command === 'np') {
        if (!serverQueue) return msg.channel.send('There is nothing playing!');
        const nowPlayEmbed = new Discord.RichEmbed()
            .setColor('#42b0f5')
            .setAuthor("SweetSpot", "https://i.imgur.com/skvRpRm.png")
            .setThumbnail("https://i.imgur.com/skvRpRm.png")
            .addField("Now Playing", `**${serverQueue.songs[0].title}**`);
        return msg.channel.send(nowPlayEmbed);
    } else if (command === 'queue') {
        if (!serverQueue) return msg.channel.send('There is nothing playing!');
        const queueEmbed = new Discord.RichEmbed()
            .setAuthor("SweetSpot", "https://i.imgur.com/skvRpRm.png")
            .setThumbnail("https://i.imgur.com/skvRpRm.png")
            .setColor('#42b0f5')
            .addField('Queue', `${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}`)
            .addField('Currently Playing', `${serverQueue.songs[0].title}`);
        return msg.channel.send(queueEmbed);
    } else if (command === 'pause') {
        if (serverQueue && serverQueue.playing) {
            serverQueue.playing = false;
            serverQueue.connection.dispatcher.pause();
            const pauseEmbed = new Discord.RichEmbed()
                .setAuthor("SweetSpot", "https://i.imgur.com/skvRpRm.png")
                .setThumbnail("https://i.imgur.com/skvRpRm.png")
                .setColor('#42b0f5')
                .addField('Pause', 'The music is paused!');
            return msg.channel.send(pauseEmbed);
        }
        return msg.channel.send('There is nothing playing!');
    } else if (command === 'resume') {
        if (serverQueue && !serverQueue.playing) {
            serverQueue.playing = true;
            serverQueue.connection.dispatcher.resume();
            const resumeEmbed = new Discord.RichEmbed()
                .setAuthor("SweetSpot", "https://i.imgur.com/skvRpRm.png")
                .setThumbnail("https://i.imgur.com/skvRpRm.png")
                .setColor('#42b0f5')
                .addField('Resume', 'The music is now playing!');
            return msg.channel.send(resumeEmbed);
        }
        return msg.channel.send("There is nothing playing!");
    } else if (command === 'help') {
        const helpEmbed = new Discord.RichEmbed()
            .setAuthor("SweetSpot", "https://i.imgur.com/skvRpRm.png")
            .setThumbnail("https://i.imgur.com/skvRpRm.png")
            .setColor('#42b0f5')
            .addField('Prefix', '**sm!**')
            .addField('Commands', `
            help
            resume
            pause
            queue
            np
            volume
            stop
            skip
            play`, true)
            .addField('Description', `
            Displays list of commands and purpose
            Resumes the song
            Pauses the son
            Shows the active queue
            Shows what is playing
            Adjusts and shows the volume
            Stops the song
            Skips the song
            Plays a song or playlist`, true);
        msg.author.send(helpEmbed);
    }

    return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
    const serverQueue = queue.get(msg.guild.id);
    console.log(video);
    const song = {
        id: video.id,
        title: Util.escapeMarkdown(video.title),
        url: `https://www.youtube.com/watch?v=${video.id}`
    };
    if (!serverQueue) {
        const queueConstruct = {
            textChannel: msg.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 5,
            playing: true
        };
        queue.set(msg.guild.id, queueConstruct);

        queueConstruct.songs.push(song);

        try {
            var connection = await voiceChannel.join();
            queueConstruct.connection = connection;
            play(msg.guild, queueConstruct.songs[0]);
        } catch (error) {
            console.error(`Couldnt join channel: ${error}`);
            queue.delete(msg.guild.id);
            return msg.channel.send('I could not join the voice channel!');
        }
    } else {
        serverQueue.songs.push(song);
        console.log(serverQueue.songs);
        const addEmbed = new Discord.RichEmbed()
            .setAuthor("SweetSpot", "https://i.imgur.com/skvRpRm.png")
            .setColor('#42b0f5')
            .setThumbnail("https://i.imgur.com/skvRpRm.png")
            .addField("Result", `**${song.title}** has been added to the queue!`);
        if (playlist) return undefined;
        else return (msg.channel.send(addEmbed));
    }
    return undefined;
}

function play(guild, song) {
    const serverQueue = queue.get(guild.id);

    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }
    console.log(serverQueue.songs);

    const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
        .on('end', reason => {
            if (reason === 'Stream is not generating quickly enough.') console.log('Song ended.');
            else console.log(reason);
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
        })
        .on('error', error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

    const nowPlayEmbed = new Discord.RichEmbed()
        .setColor('#42b0f5')
        .setAuthor("SweetSpot", "https://i.imgur.com/skvRpRm.png")
        .setThumbnail("https://i.imgur.com/skvRpRm.png")
        .addField("Result", `**${song.title}** is now playing`);
    serverQueue.textChannel.send(nowPlayEmbed);
}

client.token = process.env.token;
client.login();