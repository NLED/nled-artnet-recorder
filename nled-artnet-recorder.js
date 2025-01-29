
const WebSocketServer = require('websocket').server;
const http = require('http');
const fs = require('fs');
const server = http.createServer();
const path = require("path")
const express = require("express");
const app = express()
var dmxlib = require('dmxnet');

//====================================================================================

server.listen(8080);

var dataServer;
var clientState = {}
var packetTime = 0;
var playbackTimer = null;
var dmxnet;
var artnet1;

var serverState = {
    artnet: {
        active: false,
        fps: 0,
        avgPacketRate: 0,
        packetSz: 0 //size of the artnet packet, could be a partial packet less than 512 slots
    },
    record: {
        enabled: false,
        buffer: [],
        fileName: "",
        line: 0,
        length: 512,
        format: "",
        path: ""
    }
}

//====================================================================================

function artnetInitialize(settings) {
    dmxnet = new dmxlib.dmxnet({
        log: { level: 'info' }, // Winston logger options
        oem: 0, //OEM Code from artisticlicense, default to dmxnet OEM.
        sName: "NLED ArtNet Recorder", // 17 char long node description, default to "dmxnet"
        lName: "NLED ArtNet Recorder", // 63 char long node description, default to "dmxnet - OpenSource ArtNet Transceiver"
        hosts: settings.hosts // Interfaces to listen to, all by default
    });

    //------------------------------------------------------------------------

    if (artnet1 != null) artnet1.removeAllListeners()

    artnet1 = dmxnet.newReceiver({
        subnet: settings.subnet, //Destination subnet, default 0
        universe: settings.universe, //Destination universe, default 0
        net: settings.net, //Destination net, default 0
    });


    packetTime = Date.now();

    artnet1.on('data', function (data) {
        // console.log('DMX Universe 0:', data);

        if (serverState.record.enabled == true) {
            serverState.record.line++; //tracks the number of frames written
            serverState.record.buffer.push(data);

            serverState.artnet.avgPacketRate = Math.round((serverState.artnet.avgPacketRate + (Date.now() - packetTime)) / 2); //in milliseconds
            serverState.artnet.fps = (1000 / (Date.now() - packetTime)).toFixed(2); //in frames per second
            packetTime = Date.now();

            serverState.artnet.packetSz = data.length;
            dataServer.send(JSON.stringify({ "action": "framedata", "frameNumber": serverState.record.buffer.length, "filePath": serverState.record.path, "artnet": serverState.artnet, "data": data }));
        }
        else serverState.artnet.fps = 0;
    });
} //end artnetInitialize();

//=============================== Launches Web Page For User Interface =====================================================

// const path = require('path');
//  const resolve = require('path').resolve
// const absolutePath = resolve('./')

//  console.log( fs.readdirSync(path.join(__dirname, './views')));
// console.log( fs.readdirSync(absolutePath));

// app.use("/",express.static("./assets/index.html"));
// app.use('/', express.static(__dirname + '/views'));
app.use('/', express.static(path.join(__dirname, '/views')));

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '/views/index.html'));
});


// app.use(express.static(__dirname));
app.listen(3030);
// console.log(__dirname);

const url = 'http://localhost:3030';
require('child_process').exec(`start ${url}`);

//====================================================================================

const wsServer = new WebSocketServer({
    httpServer: server
});

wsServer.on('request', function (request) {
    dataServer = request.accept(null, request.origin);

    console.log('Client has connected.', dataServer.remoteAddress);

    dataServer.send(JSON.stringify({ action: "state", state: serverState }, utilityReplacer));

    dataServer.on('close', function (event) {
        serverState.record.enabled = false;
        clearInterval(playbackTimer);
    });

    dataServer.on('message', function (event) {
        //  console.log(event);
        if (event.data instanceof ArrayBuffer) {
            console.log("Message was ArrayBuffer");
        }
        else if (event.type == 'binary') {
            console.log("Message was binary");
        }
        else if (event.type == 'utf8') {
            console.log("Front End Command: ", event.utf8Data);

            let jsonMsg = JSON.parse(event.utf8Data);

            switch (jsonMsg.action) {
                default:
                    try {
                        JSON.parse(event.utf8Data);
                    }
                    catch (e) {
                        console.error("Message was not JSON - Error");
                        break;
                    }
                    console.error("Invalid JSON command");
                    break;
                case 'state':
                    clientState = jsonMsg.state;
                    break;
                case 'start':
                    clientState = jsonMsg.state;
                    serverState.record.buffer = [];
                    serverState.record.line = -1; //index of buffer
                    serverState.record.length = clientState.settings.frameLength;
                    serverState.record.format = jsonMsg.format;
                    serverState.record.fileName = 'artnet-' + timestampToFilename();
                    serverState.record.path = "recordings" + path.sep + serverState.record.fileName + '.' + serverState.record.format;
                    serverState.record.enabled = true;
                    artnetInitialize(clientState.artnet);
                    dataServer.send(JSON.stringify({ action: "state", state: serverState }, utilityReplacer));
                    break;
                case 'stop':
                    serverState.record.enabled = false;
                    serverState.artnet.fps = 0;

                    if (serverState.record.format == 'bin') {
                        //binary file with NLED specific header
                        let header = new Uint8Array(16);
                        header[0] = (serverState.record.length >> 8);//Data Size MSB
                        header[1] = (serverState.record.length & 0xFF);//Data Size LSB
                        header[2] = (serverState.artnet.avgPacketRate >> 8); //MSB - not very accurate, but works alright.
                        header[3] = (serverState.artnet.avgPacketRate & 0xFF); //LSB
                        header[4] = (serverState.record.line >> 24); //number of frames
                        header[5] = (serverState.record.line >> 16);
                        header[6] = (serverState.record.line >> 8);
                        header[7] = (serverState.record.line & 0xFF);
                        //[8] to [15] are unused

                        if (!fs.existsSync('./recordings')){
                            fs.mkdirSync('./recordings');
                        }

                        fs.writeFile(serverState.record.path, header, (err) => {
                            if (err) throw err;
                            fs.appendFile(serverState.record.path, Buffer.from(serverState.record.buffer.flat(Infinity)), (err) => {
                                if (err) throw err;
                            });
                        });
                    }
                    else if (serverState.record.format == 'raw') {
                        //binary file, raw, no header, no format
                        fs.writeFile(serverState.record.path, Buffer.from(serverState.record.buffer.flat(Infinity)), (err) => {
                            if (err) throw err;
                        });
                    }

                    dataServer.send(JSON.stringify({ action: "state", state: serverState }, utilityReplacer));
                    break;
                case 'playback':
                    clientState = jsonMsg.state;
                    if (clientState.settings.playback == 'running') {
                        let frameNumber = 0;
                        playbackTimer = setInterval(function () {
                            dataServer.send(JSON.stringify({ "action": "framedata", "frameNumber": (frameNumber), "filePath": serverState.record.path, "artnet": serverState.artnet, "data": serverState.record.buffer[frameNumber] }));
                            frameNumber++;
                            if (frameNumber >= serverState.record.buffer.length) frameNumber = 0;
                        }, serverState.artnet.avgPacketRate);
                    }
                    else {
                        clearInterval(playbackTimer);
                    }
                    break;
                case 'getframe':
                    let frameNumber = jsonMsg.value;
                    dataServer.send(JSON.stringify({ "action": "framedata", "frameNumber": frameNumber, "filePath": serverState.record.path, "artnet": serverState.artnet, "data": serverState.record.buffer[frameNumber] }));
                    break;
                case 'deleteframes':

            

                    let frameStart = jsonMsg.frameStart;
                    let frameEnd = jsonMsg.frameEnd;
                    let deleteMode = jsonMsg.deleteMode;

                    if(frameStart > serverState.record.buffer.length) return;
                    if(frameEnd > serverState.record.buffer.length) return;
                    if(serverState.record.buffer.length == 0) return;

                    if (deleteMode == 'after') {
                        serverState.record.buffer.splice(frameStart); //remove elements from frameStart to end of array
                    }
                    else if (deleteMode == 'before') {
                        serverState.record.buffer.splice(0, frameEnd);
                    }
                    serverState.record.line = (serverState.record.buffer.length);

                    let headerSerialize = new Uint8Array(16);
                    headerSerialize[0] = (serverState.record.length >> 8);//Data Size MSB
                    headerSerialize[1] = (serverState.record.length & 0xFF);//Data Size LSB
                    headerSerialize[2] = (33 >> 8); //static at 30 FPS
                    headerSerialize[3] = (33 & 0xFF); //static at 30 FPS
                    headerSerialize[4] = (serverState.record.line >> 24); //number of frames
                    headerSerialize[5] = (serverState.record.line >> 16);
                    headerSerialize[6] = (serverState.record.line >> 8);
                    headerSerialize[7] = (serverState.record.line & 0xFF);

                    //rewrite the file
                    fs.writeFile(serverState.record.path, headerSerialize, (err) => {
                        if (err) throw err;
                        fs.appendFile(serverState.record.path, Buffer.from(serverState.record.buffer.flat(Infinity)), (err) => {
                            if (err) throw err;
                        });
                    })

                    dataServer.send(JSON.stringify({ action: "state", state: serverState }, utilityReplacer));
                    //if (deleteMode == 'before') dataServer.send(JSON.stringify({ action: "framenumber", value: 0 }));
                    break;
            } //end switch
        }
    });
});

//====================================================================================

function utilityReplacer(key, value) {
    // Filter runtime properties that should not be sent
    if (key == 'buffer') {
        return undefined;
    }
    return value;
}

//====================================================================================

function timestampToFilename() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const filename = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    return filename;
}

//====================================================================================
/*
var twirlIndex = 0;
var firstRun = true;

setInterval(function () {
    var P = ["\\", "|", "/", "-"];
    if (firstRun == false) {

        for (let i = 0; i < 6; i++) {
            const y = i === 0 ? null : -1
            process.stdout.moveCursor(0, y)
            process.stdout.clearLine(1)
        }
    }
    process.stdout.write("\r" + P[twirlIndex++]);
    process.stdout.write("\n" + "Status: " + ((state.record.enabled) ? "Recording" : "Idle"));
    process.stdout.write("\n" + "Frames Written: " + state.record.line);
    process.stdout.write("\n" + "Frame Length: " + state.record.length);
    process.stdout.write("\n" + "File Size: " + ((state.record.line * state.record.length) /1024).toFixed(2)+"KB");
    process.stdout.write("\n");
    firstRun = false;
    twirlIndex &= 3;
}, 100);
*/

//====================================================================================

console.log("Starting Application - Browser should open interface webpage");